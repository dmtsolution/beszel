package agent

import (
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/henrygd/beszel/agent/utils"
	"github.com/henrygd/beszel/internal/entities/dirusage"
)

// dirUsageManager periodically measures the disk usage of top-level
// directories in the background, since walking directory trees is too
// expensive to do on every collection interval.
type dirUsageManager struct {
	sync.Mutex
	root    string   // root path to auto-discover top-level dirs from (used when paths is empty)
	paths   []string // explicit paths from DIR_USAGE_PATHS, overrides auto-discovery
	entries []*dirusage.Entry
}

// newDirUsageManager returns nil if directory usage collection is disabled
// (SKIP_DIR_USAGE=true).
func newDirUsageManager() *dirUsageManager {
	if skip, _ := utils.GetEnv("SKIP_DIR_USAGE"); skip == "true" {
		return nil
	}

	dm := &dirUsageManager{root: defaultScanRoot()}
	if custom, exists := utils.GetEnv("DIR_USAGE_PATHS"); exists && strings.TrimSpace(custom) != "" {
		parsed := make([]string, 0)
		for path := range strings.SplitSeq(custom, ",") {
			if path = strings.TrimSpace(path); path != "" {
				parsed = append(parsed, path)
			}
		}
		dm.paths = parsed
	}

	dm.startWorker()
	return dm
}

// startWorker scans immediately, then on a recurring interval (10 minutes by
// default, override with DIR_USAGE_INTERVAL, e.g. "5m").
func (dm *dirUsageManager) startWorker() {
	interval := 10 * time.Minute
	if custom, exists := utils.GetEnv("DIR_USAGE_INTERVAL"); exists {
		if d, err := time.ParseDuration(custom); err == nil && d > 0 {
			interval = d
		}
	}
	go func() {
		dm.scan()
		for {
			time.Sleep(interval)
			dm.scan()
		}
	}()
}

// discoverTopLevelDirs lists real (non-pseudo, non-symlink) directories
// directly under root. Symlinks are skipped to avoid double-counting dirs
// like /bin -> /usr/bin on distros that merged the top-level dirs into /usr.
func discoverTopLevelDirs(root string) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		slog.Debug("dirusage", "root", root, "err", err)
		return nil
	}
	dirs := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if isExcludedTopLevelName(name) {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.Mode()&os.ModeSymlink != 0 || !entry.IsDir() {
			continue
		}
		dirs = append(dirs, filepath.Join(root, name))
	}
	return dirs
}

// scan measures disk usage for all configured (or auto-discovered) paths and
// replaces entries.
func (dm *dirUsageManager) scan() {
	paths := dm.paths
	if len(paths) == 0 {
		paths = discoverTopLevelDirs(dm.root)
	}

	entries := make([]*dirusage.Entry, 0, len(paths))
	for _, path := range paths {
		size, err := dirSizeBytes(path)
		if err != nil {
			slog.Debug("dirusage", "path", path, "err", err)
			continue
		}
		if size == 0 {
			continue
		}
		entries = append(entries, &dirusage.Entry{Path: path, Size: size})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Size > entries[j].Size })

	dm.Lock()
	dm.entries = entries
	dm.Unlock()
}

// getEntries returns the most recent scan results (nil until the first scan completes).
func (dm *dirUsageManager) getEntries() []*dirusage.Entry {
	dm.Lock()
	defer dm.Unlock()
	return dm.entries
}
