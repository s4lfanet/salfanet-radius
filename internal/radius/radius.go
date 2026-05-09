// Package radius provides direct MySQL-based FreeRADIUS management.
// It does NOT use the RADIUS protocol — it writes directly to the shared DB tables.
package radius

import (
	"fmt"

	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// Service handles FreeRADIUS operations via direct DB writes.
type Service struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Service { return &Service{db: db} }

// SetPassword sets or replaces the Cleartext-Password in radcheck.
func (s *Service) SetPassword(username, password string) error {
	return s.db.Exec(`
		INSERT INTO radcheck (username, attribute, op, value)
		VALUES (?, 'Cleartext-Password', ':=', ?)
		ON DUPLICATE KEY UPDATE value = VALUES(value)
	`, username, password).Error
}

// Isolate replaces the password with an invalid token, blocking the user.
func (s *Service) Isolate(username string) error {
	return s.db.Model(&models.Radcheck{}).
		Where("username = ? AND attribute = 'Cleartext-Password'", username).
		Update("value", "WRONG_PASSWORD_ISOLATED__"+username).Error
}

// Activate restores the real password from the pppoe_users table.
func (s *Service) Activate(username, password string) error {
	return s.SetPassword(username, password)
}

// SetRateLimit sets or updates Mikrotik-Rate-Limit in radreply.
func (s *Service) SetRateLimit(username, rateLimit string) error {
	return s.db.Exec(`
		INSERT INTO radreply (username, attribute, op, value)
		VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)
		ON DUPLICATE KEY UPDATE value = VALUES(value)
	`, username, rateLimit).Error
}

// SetGroup sets or updates radusergroup mapping.
func (s *Service) SetGroup(username, groupname string) error {
	return s.db.Exec(`
		INSERT INTO radusergroup (username, groupname, priority)
		VALUES (?, ?, 1)
		ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)
	`, username, groupname).Error
}

// DeleteUser removes all radius entries for a username.
func (s *Service) DeleteUser(username string) error {
	if err := s.db.Where("username = ?", username).Delete(&models.Radcheck{}).Error; err != nil {
		return err
	}
	if err := s.db.Where("username = ?", username).Delete(&models.Radreply{}).Error; err != nil {
		return err
	}
	return s.db.Where("username = ?", username).Delete(&models.Radusergroup{}).Error
}

// UpsertUser sets up all radius entries for a new/updated PPPoE user.
func (s *Service) UpsertUser(username, password, rateLimit, groupname string) error {
	if err := s.SetPassword(username, password); err != nil {
		return fmt.Errorf("set password: %w", err)
	}
	if rateLimit != "" {
		if err := s.SetRateLimit(username, rateLimit); err != nil {
			return fmt.Errorf("set rate limit: %w", err)
		}
	}
	if groupname != "" {
		if err := s.SetGroup(username, groupname); err != nil {
			return fmt.Errorf("set group: %w", err)
		}
	}
	return nil
}

// ActiveSessions returns currently-online sessions from radacct.
func (s *Service) ActiveSessions() ([]models.Radacct, error) {
	var sessions []models.Radacct
	err := s.db.Where("acctstoptime IS NULL").
		Order("acctstarttime DESC").
		Limit(500).
		Find(&sessions).Error
	return sessions, err
}

// SessionByUsername returns the latest active session for a user.
func (s *Service) SessionByUsername(username string) (*models.Radacct, error) {
	var s2 models.Radacct
	err := s.db.Where("username = ? AND acctstoptime IS NULL", username).
		Order("acctstarttime DESC").
		First(&s2).Error
	if err != nil {
		return nil, err
	}
	return &s2, nil
}
