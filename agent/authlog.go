//go:build linux

package agent

import (
	"bufio"
	"io"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/henrygd/beszel/agent/utils"
	"github.com/henrygd/beszel/internal/entities/authlog"
)

const (
	authLogPath    = "/var/log/auth.log"
	fail2banLogPath = "/var/log/fail2ban.log"
)

var (
	sshAcceptedRe    = regexp.MustCompile(`sshd\[\d+\]: Accepted \S+ for (\S+) from (\S+) port \d+`)
	sshFailedRe      = regexp.MustCompile(`sshd\[\d+\]: Failed \S+ for (?:invalid user )?(\S+) from (\S+) port \d+`)
	sudoRe           = regexp.MustCompile(`sudo:\s+(\S+)\s*:.*COMMAND=(.+)$`)
	authLogTimeRe    = regexp.MustCompile(`^(\S+)\s`)
	fail2banActionRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ fail2ban\.actions\s+\[\d+\]: NOTICE\s+\[(\S+)\] (Ban|Unban) (\S+)`)
)

// logTailState tracks read progress through a log file across scan ticks,
// so we only ever process newly appended lines.
type logTailState struct {
	initialized bool
	offset      int64
	inode       uint64
}

// authLogManager periodically tails auth.log and fail2ban.log for
// authentication/security-relevant events (SSH logins, sudo commands, bans),
// plus web server (nginx/apache) access/error logs when present.
type authLogManager struct {
	sync.Mutex
	pending      []*authlog.Entry
	authState    logTailState
	f2bState     logTailState
	webLogStates map[string]*logTailState // keyed by log file path, discovered lazily

	// per-IP 404 tracking for basic scan/brute-force detection
	notFoundTimes   map[string][]int64
	notFoundFlagged map[string]int64
}

// newAuthLogManager returns nil if disabled via SKIP_AUTH_LOG=true.
func newAuthLogManager() *authLogManager {
	if skip, _ := utils.GetEnv("SKIP_AUTH_LOG"); skip == "true" {
		return nil
	}
	alm := &authLogManager{
		webLogStates:    make(map[string]*logTailState),
		notFoundTimes:   make(map[string][]int64),
		notFoundFlagged: make(map[string]int64),
	}
	alm.startWorker()
	return alm
}

// startWorker scans immediately, then on a recurring interval (30s by
// default, override with AUTH_LOG_INTERVAL).
func (alm *authLogManager) startWorker() {
	interval := 30 * time.Second
	if custom, exists := utils.GetEnv("AUTH_LOG_INTERVAL"); exists {
		if d, err := time.ParseDuration(custom); err == nil && d > 0 {
			interval = d
		}
	}
	go func() {
		alm.scan()
		for {
			time.Sleep(interval)
			alm.scan()
		}
	}()
}

func (alm *authLogManager) scan() {
	var newEntries []*authlog.Entry

	for _, line := range tailNewLines(authLogPath, &alm.authState) {
		if entry := parseAuthLogLine(line); entry != nil {
			newEntries = append(newEntries, entry)
		}
	}
	for _, line := range tailNewLines(fail2banLogPath, &alm.f2bState) {
		if entry := parseFail2banLine(line); entry != nil {
			newEntries = append(newEntries, entry)
		}
	}

	newEntries = append(newEntries, alm.scanWebLogs()...)

	if len(newEntries) == 0 {
		return
	}

	alm.Lock()
	alm.pending = append(alm.pending, newEntries...)
	// avoid unbounded growth if the hub is unreachable for a long time
	if len(alm.pending) > 1000 {
		alm.pending = alm.pending[len(alm.pending)-1000:]
	}
	alm.Unlock()
}

// getEvents drains and returns all pending events.
func (alm *authLogManager) getEvents() []*authlog.Entry {
	alm.Lock()
	defer alm.Unlock()
	if len(alm.pending) == 0 {
		return nil
	}
	events := alm.pending
	alm.pending = nil
	return events
}

// tailNewLines returns complete lines appended to path since the last call,
// tracking state across calls. On first call for a path (or after log
// rotation, detected via inode change) it seeks to the current end of file
// rather than replaying the entire existing log history.
func tailNewLines(path string, state *logTailState) []string {
	info, err := os.Stat(path)
	if err != nil {
		return nil
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return nil
	}

	if !state.initialized || state.inode != stat.Ino || info.Size() < state.offset {
		state.initialized = true
		state.inode = stat.Ino
		state.offset = info.Size()
		return nil
	}

	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	if _, err := f.Seek(state.offset, io.SeekStart); err != nil {
		return nil
	}

	reader := bufio.NewReader(f)
	var lines []string
	var consumed int64
	for {
		line, readErr := reader.ReadString('\n')
		if strings.HasSuffix(line, "\n") {
			consumed += int64(len(line))
			lines = append(lines, strings.TrimRight(line, "\n"))
		}
		if readErr != nil {
			break
		}
	}
	state.offset += consumed
	return lines
}

// parseAuthLogLine extracts an SSH or sudo event from an auth.log line.
func parseAuthLogLine(line string) *authlog.Entry {
	ts := parseSyslogISOTime(line)
	if m := sshAcceptedRe.FindStringSubmatch(line); m != nil {
		return &authlog.Entry{Time: ts, Type: authlog.EventSSHSuccess, User: m[1], SourceIP: m[2]}
	}
	if m := sshFailedRe.FindStringSubmatch(line); m != nil {
		return &authlog.Entry{Time: ts, Type: authlog.EventSSHFailure, User: m[1], SourceIP: m[2]}
	}
	if m := sudoRe.FindStringSubmatch(line); m != nil {
		return &authlog.Entry{Time: ts, Type: authlog.EventSudo, User: m[1], Detail: strings.TrimSpace(m[2])}
	}
	return nil
}

// parseFail2banLine extracts a Ban/Unban event from a fail2ban.log line.
func parseFail2banLine(line string) *authlog.Entry {
	m := fail2banActionRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ts, err := time.Parse("2006-01-02 15:04:05", m[1])
	if err != nil {
		ts = time.Now().UTC()
	}
	eventType := authlog.EventBan
	if m[3] == "Unban" {
		eventType = authlog.EventUnban
	}
	return &authlog.Entry{Time: ts.Unix(), Type: eventType, SourceIP: m[4], Detail: m[2]}
}

// parseSyslogISOTime extracts the leading ISO8601 timestamp from an
// auth.log line (e.g. "2026-07-16T14:45:09.128282+00:00 host sshd[...]").
func parseSyslogISOTime(line string) int64 {
	m := authLogTimeRe.FindStringSubmatch(line)
	if m == nil {
		return time.Now().Unix()
	}
	t, err := time.Parse(time.RFC3339Nano, m[1])
	if err != nil {
		slog.Debug("authlog", "err", err, "raw", m[1])
		return time.Now().Unix()
	}
	return t.Unix()
}
