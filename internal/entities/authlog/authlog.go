// Package authlog holds authentication/security-relevant events parsed from
// system logs (SSH logins, sudo command usage, fail2ban bans, web server
// access/errors/suspicious requests), used to give visibility into who
// connected and what happened on the machine and its web-facing services.
package authlog

// EventType identifies the kind of authentication/security event.
type EventType uint8

const (
	EventSSHSuccess EventType = iota
	EventSSHFailure
	EventSudo
	EventBan
	EventUnban
	EventHTTPAccess     // any access log entry, any status - lets the UI trace when a path's status changed
	EventHTTPSuspicious // request matching a known attack/scan pattern, or repeated 404s from one IP
	EventWebServerError // nginx/apache error.log line (server-side issue, not a client request)
)

// Entry represents a single parsed log event. Fields are structured (rather
// than pre-formatted into one string) so the UI can show a full detail view
// and filter/sort on individual fields (status code, path, etc.) - Detail
// is only used for events that don't fit the structured HTTP shape (sudo
// command, ban jail name, raw web server error line).
type Entry struct {
	Time       int64     `json:"t" cbor:"0,keyasint"` // unix seconds
	Type       EventType `json:"e" cbor:"1,keyasint"`
	User       string    `json:"u,omitempty" cbor:"2,keyasint,omitempty"`
	SourceIP   string    `json:"ip,omitempty" cbor:"3,keyasint,omitempty"`
	Detail     string    `json:"d,omitempty" cbor:"4,keyasint,omitempty"` // sudo command, ban jail name, web server error line, or suspicious-match reason
	SourcePort int       `json:"sp,omitempty" cbor:"5,keyasint,omitempty"`
	Method     string    `json:"m,omitempty" cbor:"6,keyasint,omitempty"`
	Path       string    `json:"path,omitempty" cbor:"7,keyasint,omitempty"`
	StatusCode int       `json:"sc,omitempty" cbor:"8,keyasint,omitempty"`
	UserAgent  string    `json:"ua,omitempty" cbor:"9,keyasint,omitempty"`
}
