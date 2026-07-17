// Package authlog holds authentication/security-relevant events parsed from
// system logs (SSH logins, sudo command usage, fail2ban bans, web server
// errors/suspicious requests), used to give visibility into who connected
// and what happened on the machine and its web-facing services.
package authlog

// EventType identifies the kind of authentication/security event.
type EventType uint8

const (
	EventSSHSuccess EventType = iota
	EventSSHFailure
	EventSudo
	EventBan
	EventUnban
	EventHTTPError      // access log entry with a 4xx/5xx status
	EventHTTPSuspicious // request matching a known attack/scan pattern, or repeated 404s from one IP
	EventWebServerError // nginx/apache error.log line (server-side issue, not a client request)
)

// Entry represents a single parsed log event.
type Entry struct {
	Time     int64     `json:"t" cbor:"0,keyasint"` // unix seconds
	Type     EventType  `json:"e" cbor:"1,keyasint"`
	User     string    `json:"u,omitempty" cbor:"2,keyasint,omitempty"`
	SourceIP string    `json:"ip,omitempty" cbor:"3,keyasint,omitempty"`
	Detail   string    `json:"d,omitempty" cbor:"4,keyasint,omitempty"` // sudo command, or ban jail name
}
