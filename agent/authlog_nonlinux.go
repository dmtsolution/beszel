//go:build !linux

package agent

import "github.com/henrygd/beszel/internal/entities/authlog"

// authLogManager is a no-op on non-Linux platforms: auth.log and fail2ban
// are Linux-specific.
type authLogManager struct{}

func newAuthLogManager() *authLogManager {
	return nil
}

func (alm *authLogManager) getEvents() []*authlog.Entry {
	return nil
}
