// Package dirusage holds disk usage data for top-level directories on the
// monitored system, used to show which folders consume the most space.
package dirusage

// Entry represents the disk usage of a single directory.
type Entry struct {
	Path    string `json:"p" cbor:"0,keyasint"`
	Size    uint64 `json:"s" cbor:"1,keyasint"` // bytes
	ModTime int64  `json:"m" cbor:"2,keyasint"` // unix seconds, directory's own last-modified time
}
