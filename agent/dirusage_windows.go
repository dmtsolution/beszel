//go:build windows

package agent

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// defaultScanRoot returns the system drive (e.g. "C:\"), matching
// getRootMountPoint's logic in disk.go.
func defaultScanRoot() string {
	sd := os.Getenv("SystemDrive")
	if sd == "" {
		sd = "C:"
	}
	return sd + `\`
}

// excludedTopLevelNames are Windows system/reserved entries that either
// aren't real user data or are typically inaccessible anyway.
var excludedTopLevelNames = map[string]bool{
	"$recycle.bin":              true,
	"system volume information": true,
	"recovery":                  true,
	"config.msi":                true,
}

func isExcludedTopLevelName(name string) bool {
	return excludedTopLevelNames[strings.ToLower(name)]
}

// dirSizeBytes walks a directory tree in-process and sums file sizes.
// Reparse points (symlinks, junctions, mount points) are skipped to avoid
// double-counting or looping into another volume mounted as a folder.
func dirSizeBytes(path string) (uint64, error) {
	if _, err := os.Lstat(path); err != nil {
		return 0, err
	}

	var total uint64
	_ = filepath.WalkDir(path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			// permission denied or similar on a subentry: skip it, best-effort
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		total += uint64(info.Size())
		return nil
	})
	return total, nil
}
