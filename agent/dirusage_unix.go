//go:build !windows

package agent

import (
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
)

// defaultScanRoot returns the filesystem root to auto-discover top-level
// directories from.
func defaultScanRoot() string {
	return "/"
}

// excludedTopLevelDirs are skipped when auto-discovering directories under
// root: pseudo/virtual filesystems that don't reflect real disk usage.
var excludedTopLevelDirs = map[string]bool{
	"proc": true,
	"sys":  true,
	"dev":  true,
	"run":  true,
}

func isExcludedTopLevelName(name string) bool {
	return excludedTopLevelDirs[name]
}

// dirSizeBytes walks a directory tree in-process (rather than shelling out to
// `du`) and sums file sizes, staying on the starting filesystem (equivalent
// to `du -x`) to avoid crossing into bind mounts or other mounted disks
// nested under path. Doing the walk in-process (instead of exec'ing a
// separate binary) matters here: file capabilities like cap_dac_read_search
// apply to this process's own syscalls, but do NOT propagate to a child
// process spawned via exec, so shelling out to `du` would silently lose the
// elevated read access the agent binary was granted.
func dirSizeBytes(path string) (uint64, error) {
	rootInfo, err := os.Lstat(path)
	if err != nil {
		return 0, err
	}
	rootStat, ok := rootInfo.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, nil
	}
	rootDev := rootStat.Dev

	var total uint64
	_ = filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			// permission denied or similar on a subentry: skip it, best-effort like `du`
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if stat, ok := info.Sys().(*syscall.Stat_t); ok && stat.Dev != rootDev {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			total += uint64(info.Size())
		}
		return nil
	})
	return total, nil
}
