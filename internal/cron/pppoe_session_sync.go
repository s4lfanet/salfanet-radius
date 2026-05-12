package cron

// pppoe_session_sync.go — Port dari src/server/jobs/pppoe-session-sync.ts
//
// Runs every minute. Maintains radacct health:
//  1. Close stale sessions (no Accounting-Update >90 min)
//  2. Close sessions for blocked/stop users in pppoe_users
//  3. Auto-import orphan RADIUS sessions into pppoe_users
//  4. Close orphan sessions still not in pppoe_users
//  5. Update acctsessiontime for all active sessions
//
// Critical: uses GREATEST(0, LEAST(TIMESTAMPDIFF(...), 2147483647)) to clamp
// acctsessiontime within INT range — prevents MariaDB error 1264.

import (
	"fmt"
	"sync"

	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

var pppoeSessionSyncMu sync.Mutex

func (s *Scheduler) jobPPPoESessionSync() {
	// Non-blocking try-lock: skip if already running
	if !pppoeSessionSyncMu.TryLock() {
		log.Debug().Msg("pppoe_session_sync: already running, skipping")
		return
	}
	defer pppoeSessionSyncMu.Unlock()

	h := s.startHistory("pppoe_session_sync")
	defer func() { s.completeHistory(h, recover()) }()

	var closed, imported int

	// ── 1. Close stale sessions (no Accounting-Update >90 min) ────────────────
	res := s.db.Exec(`
		UPDATE radacct
		SET acctstoptime       = NOW(),
		    acctterminatecause = 'Lost-Carrier',
		    acctsessiontime    = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))
		WHERE acctstoptime     IS NULL
		  AND acctupdatetime   IS NOT NULL
		  AND acctupdatetime   < DATE_SUB(NOW(), INTERVAL 90 MINUTE)
	`)
	if res.Error != nil {
		log.Error().Err(res.Error).Msg("pppoe_session_sync: stale close error")
	} else if res.RowsAffected > 0 {
		log.Info().Int64("n", res.RowsAffected).Msg("pppoe_session_sync: closed stale sessions")
		closed += int(res.RowsAffected)
	}

	// ── 2. Close sessions for blocked/stop users ───────────────────────────────
	res = s.db.Exec(`
		UPDATE radacct ra
		INNER JOIN pppoe_users pu ON pu.username = ra.username
		SET ra.acctstoptime       = NOW(),
		    ra.acctterminatecause = 'Admin-Reset',
		    ra.acctsessiontime    = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()), 2147483647))
		WHERE ra.acctstoptime IS NULL
		  AND pu.status IN ('blocked', 'stop')
	`)
	if res.Error != nil {
		log.Error().Err(res.Error).Msg("pppoe_session_sync: blocked close error")
	} else if res.RowsAffected > 0 {
		log.Info().Int64("n", res.RowsAffected).Msg("pppoe_session_sync: closed blocked user sessions")
		closed += int(res.RowsAffected)
	}

	// ── 3. Auto-import orphan RADIUS sessions ──────────────────────────────────
	type orphanRow struct {
		Username string
	}
	var orphans []orphanRow
	s.db.Raw(`
		SELECT DISTINCT ra.username
		FROM radacct ra
		LEFT JOIN pppoe_users pu    ON pu.username = ra.username
		LEFT JOIN hotspot_vouchers hv ON hv.code   = ra.username
		WHERE ra.acctstoptime IS NULL
		  AND pu.id    IS NULL
		  AND hv.id    IS NULL
		  AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
	`).Scan(&orphans)

	if len(orphans) > 0 {
		// Find default profile (fallback)
		var defaultProfile models.PppoeProfile
		s.db.Where("is_active = true").Order("created_at ASC").First(&defaultProfile)

		for _, o := range orphans {
			profileID := importOrphan(s.db, o.Username, defaultProfile.ID)
			if profileID == "" {
				log.Debug().Str("username", o.Username).Msg("pppoe_session_sync: skip orphan import — no profile")
				continue
			}
			if err := createOrphanUser(s.db, o.Username, profileID); err != nil {
				if !isDuplicateKey(err) {
					log.Error().Err(err).Str("username", o.Username).Msg("pppoe_session_sync: import error")
				}
				continue
			}
			imported++
			log.Info().Str("username", o.Username).Msg("pppoe_session_sync: imported orphan user")
		}
	}

	// ── 4. Close remaining orphan sessions ────────────────────────────────────
	res = s.db.Exec(`
		UPDATE radacct ra
		LEFT JOIN pppoe_users pu      ON pu.username = ra.username
		LEFT JOIN hotspot_vouchers hv ON hv.code     = ra.username
		SET ra.acctstoptime       = NOW(),
		    ra.acctterminatecause = 'Lost-Carrier',
		    ra.acctsessiontime    = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()), 2147483647))
		WHERE ra.acctstoptime IS NULL
		  AND pu.id    IS NULL
		  AND hv.id    IS NULL
		  AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
	`)
	if res.Error != nil {
		log.Error().Err(res.Error).Msg("pppoe_session_sync: orphan close error")
	} else if res.RowsAffected > 0 {
		log.Info().Int64("n", res.RowsAffected).Msg("pppoe_session_sync: closed orphan sessions")
		closed += int(res.RowsAffected)
	}

	// ── 5. Update acctsessiontime for all active sessions ─────────────────────
	res = s.db.Exec(`
		UPDATE radacct
		SET acctsessiontime = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))
		WHERE acctstoptime  IS NULL
		  AND acctstarttime IS NOT NULL
		  AND acctstarttime > '2000-01-01'
	`)
	if res.Error != nil {
		log.Error().Err(res.Error).Msg("pppoe_session_sync: update sessiontime error")
	}

	// ── 6. Count active NAS ────────────────────────────────────────────────────
	type nasCount struct{ Cnt int64 }
	var nc nasCount
	s.db.Raw(`SELECT COUNT(DISTINCT nasipaddress) AS cnt FROM radacct WHERE acctstoptime IS NULL`).Scan(&nc)

	msg := fmt.Sprintf("closed=%d imported=%d active_nas=%d", closed, imported, nc.Cnt)
	s.finishHistory(h, msg)
	if closed > 0 || imported > 0 {
		log.Info().Msg("pppoe_session_sync: " + msg)
	}
}

// importOrphan resolves the profile ID for an orphan RADIUS user.
func importOrphan(db *gorm.DB, username, defaultProfileID string) string {
	// Look up group from radusergroup
	var rug models.Radusergroup
	if err := db.Where("username = ?", username).First(&rug).Error; err == nil && rug.Groupname != "" {
		var profile models.PppoeProfile
		if err2 := db.Where("group_name = ? AND is_active = true", rug.Groupname).First(&profile).Error; err2 == nil {
			return profile.ID
		}
	}
	return defaultProfileID
}

// createOrphanUser inserts a minimal pppoe_users record for an orphan.
func createOrphanUser(db *gorm.DB, username, profileID string) error {
	// Get password from radcheck
	var rc models.Radcheck
	password := "radius-imported"
	if err := db.Where("username = ? AND attribute = 'Cleartext-Password'", username).First(&rc).Error; err == nil {
		password = rc.Value
	}

	comment := "Auto-imported dari sesi RADIUS aktif"
	user := models.PppoeUser{
		ID:             newID(),
		Username:       username,
		Password:       password,
		ProfileID:      profileID,
		Name:           username,
		Phone:          "-",
		Status:         "active",
		SyncedToRadius: true,
		Comment:        &comment,
	}
	return db.Create(&user).Error
}

// isDuplicateKey checks if the error is a MySQL duplicate key violation.
func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	e := err.Error()
	return stringContains(e, "Duplicate entry") || stringContains(e, "UNIQUE constraint")
}

func stringContains(s, sub string) bool {
	if len(sub) == 0 {
		return true
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// ─── FreeRADIUS Health Check ──────────────────────────────────────────────────

func (s *Scheduler) jobFreeRADIUSHealth() {
	h := s.startHistory("freeradius_health")
	defer func() { s.completeHistory(h, recover()) }()

	// Sync NAS clients from DB to FreeRADIUS clients table
	count, err := syncNASClients(s.db)
	if err != nil {
		log.Error().Err(err).Msg("freeradius_health: NAS sync error")
		s.failHistory(h, err)
		return
	}

	s.finishHistory(h, fmt.Sprintf("NAS config in sync (%d entries)", count))
	log.Debug().Int("nas", count).Msg("freeradius_health: done")
}

// syncNASClients resyncs the `nas` table in the FreeRADIUS DB
// from the `routers` table in the app DB.
func syncNASClients(db *gorm.DB) (int, error) {
	var routers []models.Router
	if err := db.Where("is_active = true").Find(&routers).Error; err != nil {
		return 0, fmt.Errorf("load routers: %w", err)
	}

	for _, r := range routers {
		secret := "testing123"
		if r.Secret != "" {
			secret = r.Secret
		}
		err := db.Exec(`
			INSERT INTO nas (nasname, shortname, type, secret, description)
			VALUES (?, ?, 'other', ?, ?)
			ON DUPLICATE KEY UPDATE
				shortname   = VALUES(shortname),
				secret      = VALUES(secret),
				description = VALUES(description)
		`, r.IPAddress, r.Name, secret, r.Name).Error
		_ = r.IPAddress // already used above
		if err != nil {
			log.Error().Err(err).Str("router", r.Name).Msg("freeradius_health: upsert NAS error")
		}
	}
	return len(routers), nil
}

// ─── PPPoE Session Monitor ────────────────────────────────────────────────────

func (s *Scheduler) jobSessionMonitor() {
	h := s.startHistory("session_monitor")
	defer func() { s.completeHistory(h, recover()) }()

	// Find users that should be isolated (expired + auto_isolation_enabled)
	// but still have an active RADIUS session — force-close their sessions.
	res := s.db.Exec(`
		UPDATE radacct ra
		INNER JOIN pppoe_users pu ON pu.username = ra.username
		SET ra.acctstoptime       = NOW(),
		    ra.acctterminatecause = 'Session-Timeout',
		    ra.acctsessiontime    = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()), 2147483647))
		WHERE ra.acctstoptime IS NULL
		  AND pu.status = 'isolated'
	`)
	if res.Error != nil {
		s.failHistory(h, res.Error)
		return
	}

	s.finishHistory(h, fmt.Sprintf("Checked all sessions; closed %d isolated", res.RowsAffected))
}

// ─── Invoice Catch-up ─────────────────────────────────────────────────────────

func (s *Scheduler) jobInvoiceCatchup() {
	h := s.startHistory("invoice_catchup")
	defer func() { s.completeHistory(h, recover()) }()

	var company models.Company
	if err := s.db.First(&company).Error; err != nil {
		s.failHistory(h, err)
		return
	}

	// Find POSTPAID users that are isolated/expired with NO pending invoice
	var users []models.PppoeUser
	s.db.Preload("Profile").
		Where(`subscription_type = 'POSTPAID'
			AND status IN ('isolated', 'stop')
			AND id NOT IN (
				SELECT user_id FROM invoices
				WHERE status = 'PENDING' AND invoice_type = 'MONTHLY'
				  AND user_id IS NOT NULL
			)`).
		Find(&users)

	count := 0
	for _, u := range users {
		if u.Profile.ID == "" {
			continue
		}
		if err := s.generateMonthlyInvoice(&u, &company); err != nil {
			log.Error().Err(err).Str("username", u.Username).Msg("invoice_catchup: generate error")
			continue
		}
		count++
	}

	s.finishHistory(h, fmt.Sprintf("Catch-up: generated %d invoices", count))
}

// ─── Agent Sales Recording ────────────────────────────────────────────────────

func (s *Scheduler) jobAgentSalesRecording() {
	h := s.startHistory("agent_sales_recording")
	defer func() { s.completeHistory(h, recover()) }()

	// Find paid invoices from today that have a referring agent but no sales record
	type agentSaleRow struct {
		InvoiceID string
		UserID    string
		AgentID   string
		Amount    int
	}
	var rows []agentSaleRow
	s.db.Raw(`
		SELECT i.id AS invoice_id, i.user_id, pu.referred_by_id AS agent_id, i.amount
		FROM invoices i
		INNER JOIN pppoe_users pu ON pu.id = i.user_id
		WHERE i.status        = 'PAID'
		  AND i.paid_at       >= CURDATE()
		  AND pu.referred_by_id IS NOT NULL
		  AND i.id NOT IN (
			  SELECT invoice_id FROM agent_sales WHERE invoice_id IS NOT NULL
		  )
	`).Scan(&rows)

	if len(rows) == 0 {
		s.finishHistory(h, "no new agent sales")
		return
	}

	count := 0
	for _, row := range rows {
		var agent models.Agent
		if err := s.db.First(&agent, "id = ?", row.AgentID).Error; err != nil {
			continue
		}
		commission := row.Amount * agent.Commission / 100
		err := s.db.Exec(`
			INSERT IGNORE INTO agent_sales (id, agent_id, voucher_id, amount, commission, created_at)
			SELECT ?, ?, NULL, ?, ?, NOW()
			FROM DUAL
			WHERE NOT EXISTS (
				SELECT 1 FROM agent_sales
				WHERE agent_id = ? AND amount = ? AND DATE(created_at) = CURDATE()
				  AND voucher_id IS NULL
			)
		`, newID(), row.AgentID, row.Amount, commission, row.AgentID, row.Amount).Error
		if err != nil {
			log.Error().Err(err).Msg("agent_sales_recording: insert error")
			continue
		}
		// Credit commission to agent balance
		s.db.Model(&models.Agent{}).Where("id = ?", row.AgentID).
			UpdateColumn("balance", gorm.Expr("balance + ?", commission))
		count++
	}

	s.finishHistory(h, fmt.Sprintf("Recorded %d agent sales", count))
}
