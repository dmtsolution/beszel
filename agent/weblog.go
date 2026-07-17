//go:build linux

package agent

import (
	"net/url"
	"os"
	"regexp"
	"strconv"
	"time"

	"github.com/henrygd/beszel/internal/entities/authlog"
)

// webLogSource pairs an access/error log path with the web server that
// (conventionally) writes to it. Only used to label events with which
// server they came from - detection is based on the log files actually
// existing, not on parsing server config.
type webLogSource struct {
	server     string
	accessPath string
	errorPath  string
}

// candidateWebLogSources are the conventional log locations for the two web
// servers the CTO asked to cover. Custom vhost-specific log paths (set via
// a non-default access_log/CustomLog directive) are not discovered - a known
// limitation of this simpler, more robust-to-implement approach.
var candidateWebLogSources = []webLogSource{
	{server: "nginx", accessPath: "/var/log/nginx/access.log", errorPath: "/var/log/nginx/error.log"},
	{server: "apache", accessPath: "/var/log/apache2/access.log", errorPath: "/var/log/apache2/error.log"},
	{server: "apache", accessPath: "/var/log/httpd/access_log", errorPath: "/var/log/httpd/error_log"},
}

// combinedLogRe matches the standard Nginx/Apache "combined" access log
// format: IP - - [time] "METHOD PATH PROTO" STATUS SIZE "referer" "agent"
var combinedLogRe = regexp.MustCompile(`^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) `)

// accessLogTimeLayout matches the bracketed timestamp in combined log format,
// e.g. "16/Jul/2026:14:32:10 +0000".
const accessLogTimeLayout = "02/Jan/2006:15:04:05 -0700"

// errorLogSeverityRe flags nginx/apache error.log lines worth surfacing.
var errorLogSeverityRe = regexp.MustCompile(`\[(error|crit|alert|emerg)\]`)

// suspiciousRequestRes are simple, low-effort signatures for common attack
// probes and scanner behavior. Deliberately coarse (a v1 heuristic, not a
// WAF) - flags regardless of HTTP status since a vulnerable endpoint can
// return 200 for a malicious payload.
var suspiciousRequestRes = []*regexp.Regexp{
	regexp.MustCompile(`(?i)union(\s+all)?\s+select`),
	regexp.MustCompile(`(?i)\bor\b\s*['"]?1['"]?\s*=\s*['"]?1`),
	regexp.MustCompile(`(?i)<script`),
	regexp.MustCompile(`(?i)javascript:`),
	regexp.MustCompile(`\.\./\.\./`),
	regexp.MustCompile(`(?i)/\.env$`),
	regexp.MustCompile(`(?i)/\.git/config`),
	regexp.MustCompile(`(?i)/wp-login\.php`),
	regexp.MustCompile(`(?i)/phpmyadmin`),
	regexp.MustCompile(`(?i)/xmlrpc\.php`),
}

// notFoundWindow/threshold control the simple per-IP repeated-404 detection:
// notFoundThreshold 404s from the same IP within notFoundWindow triggers one
// suspicious event, then that IP is silenced for notFoundCooldown to avoid
// spamming an event per request.
const (
	notFoundWindow    = 5 * time.Minute
	notFoundThreshold = 10
	notFoundCooldown  = 15 * time.Minute
)

// scanWebLogs tails any discovered nginx/apache access/error logs and
// returns newly parsed events.
func (alm *authLogManager) scanWebLogs() []*authlog.Entry {
	var entries []*authlog.Entry

	for _, src := range candidateWebLogSources {
		if _, err := os.Stat(src.accessPath); err == nil {
			state := alm.webLogState(src.accessPath)
			for _, line := range tailNewLines(src.accessPath, state) {
				entries = append(entries, alm.parseAccessLogLine(line)...)
			}
		}
		if _, err := os.Stat(src.errorPath); err == nil {
			state := alm.webLogState(src.errorPath)
			for _, line := range tailNewLines(src.errorPath, state) {
				if entry := parseWebErrorLogLine(line, src.server); entry != nil {
					entries = append(entries, entry)
				}
			}
		}
	}

	return entries
}

// webLogState returns (creating if needed) the tail state for a given path.
// Not locked separately - only ever called from scan(), which is not
// re-entrant (single background goroutine per manager).
func (alm *authLogManager) webLogState(path string) *logTailState {
	state, ok := alm.webLogStates[path]
	if !ok {
		state = &logTailState{}
		alm.webLogStates[path] = state
	}
	return state
}

// parseAccessLogLine turns one combined-format access log line into zero,
// one, or two events: an HTTP error event (4xx/5xx), and/or a suspicious
// request event (attack signature, or repeated 404s from the same IP).
func (alm *authLogManager) parseAccessLogLine(line string) []*authlog.Entry {
	m := combinedLogRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	ip, rawTime, method, path, statusStr := m[1], m[2], m[3], m[4], m[5]
	status, err := strconv.Atoi(statusStr)
	if err != nil {
		return nil
	}
	ts := time.Now().Unix()
	if t, err := time.Parse(accessLogTimeLayout, rawTime); err == nil {
		ts = t.Unix()
	}

	var out []*authlog.Entry

	if status >= 400 {
		out = append(out, &authlog.Entry{
			Time:     ts,
			Type:     authlog.EventHTTPError,
			SourceIP: ip,
			Detail:   method + " " + path + " -> " + statusStr,
		})
	}

	if reason := suspiciousRequestReason(method, path); reason != "" {
		out = append(out, &authlog.Entry{
			Time:     ts,
			Type:     authlog.EventHTTPSuspicious,
			SourceIP: ip,
			Detail:   reason + ": " + method + " " + path,
		})
	} else if status == 404 {
		if alm.flagRepeated404(ip, ts) {
			out = append(out, &authlog.Entry{
				Time:     ts,
				Type:     authlog.EventHTTPSuspicious,
				SourceIP: ip,
				Detail:   "repeated 404s (possible scan)",
			})
		}
	}

	return out
}

// suspiciousRequestReason returns a short label if the request matches a
// known attack/scan signature, or "" if it looks benign. The path is
// URL-decoded first since real attack payloads are typically percent- (or
// +) encoded (e.g. "%27%20OR%20%271%27%3D%271"), which the raw regexes
// wouldn't otherwise match.
func suspiciousRequestReason(_, path string) string {
	decoded, err := url.QueryUnescape(path)
	if err != nil {
		decoded = path
	}
	for _, re := range suspiciousRequestRes {
		if re.MatchString(decoded) {
			return "suspicious request"
		}
	}
	return ""
}

// flagRepeated404 tracks 404 timestamps per source IP and reports true at
// most once per notFoundCooldown when notFoundThreshold is exceeded within
// notFoundWindow.
func (alm *authLogManager) flagRepeated404(ip string, ts int64) bool {
	cutoff := ts - int64(notFoundWindow.Seconds())

	times := alm.notFoundTimes[ip]
	kept := times[:0]
	for _, t := range times {
		if t >= cutoff {
			kept = append(kept, t)
		}
	}
	kept = append(kept, ts)
	alm.notFoundTimes[ip] = kept

	if len(kept) < notFoundThreshold {
		return false
	}
	if lastFlag, ok := alm.notFoundFlagged[ip]; ok && ts-lastFlag < int64(notFoundCooldown.Seconds()) {
		return false
	}
	alm.notFoundFlagged[ip] = ts
	return true
}

// parseWebErrorLogLine flags nginx/apache error.log lines at warning
// severity or above.
func parseWebErrorLogLine(line, server string) *authlog.Entry {
	if !errorLogSeverityRe.MatchString(line) {
		return nil
	}
	return &authlog.Entry{
		Time:   time.Now().Unix(),
		Type:   authlog.EventWebServerError,
		Detail: "[" + server + "] " + line,
	}
}
