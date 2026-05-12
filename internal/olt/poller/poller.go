// Package poller manages per-OLT polling goroutines.
//
// Each OLT runs its own polling goroutine at the configured interval.
// Results are upserted into olt_onu_status and broadcast to the WebSocket hub.
package poller

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	snmputil "github.com/s4lfanet/salfanet-radius-go/internal/olt/snmp"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/telnet"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/vendors/zte"
)

// BroadcastFn is a function that broadcasts ONU status updates to WebSocket clients.
type BroadcastFn func(oltID string, data interface{})

// Poller manages polling goroutines for all OLTs.
type Poller struct {
	db        *gorm.DB
	broadcast BroadcastFn

	mu      sync.Mutex
	workers map[string]context.CancelFunc // oltID → cancel
	pools   map[string]*telnet.Pool       // oltID → telnet pool
}

// New creates a new Poller.
func New(db *gorm.DB, broadcast BroadcastFn) *Poller {
	return &Poller{
		db:        db,
		broadcast: broadcast,
		workers:   make(map[string]context.CancelFunc),
		pools:     make(map[string]*telnet.Pool),
	}
}

// Start begins polling for the given OLT. It stops any existing poll loop first.
func (p *Poller) Start(olt *models.NetworkOLT) {
	p.Stop(olt.ID) // Stop existing loop if any

	ctx, cancel := context.WithCancel(context.Background())
	p.mu.Lock()
	p.workers[olt.ID] = cancel
	p.mu.Unlock()

	// Build Telnet pool if Telnet is enabled
	var pool *telnet.Pool
	if olt.TelnetEnabled && olt.Username != nil && olt.Password != nil {
		cfg := telnet.DefaultConfig(olt.IPAddress, olt.TelnetPort, *olt.Username, *olt.Password)
		pool = telnet.NewPool(cfg)
		p.mu.Lock()
		p.pools[olt.ID] = pool
		p.mu.Unlock()
	}

	interval := time.Duration(olt.PollingInterval) * time.Second
	if interval < 30*time.Second {
		interval = 60 * time.Second
	}

	log.Info().Str("olt", olt.ID).Str("ip", olt.IPAddress).Dur("interval", interval).Msg("poller: starting")

	go func() {
		// First poll immediately
		p.poll(ctx, olt, pool)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Info().Str("olt", olt.ID).Msg("poller: stopped")
				return
			case <-ticker.C:
				p.poll(ctx, olt, pool)
			}
		}
	}()
}

// Stop cancels the polling goroutine for the given OLT.
func (p *Poller) Stop(oltID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if cancel, ok := p.workers[oltID]; ok {
		cancel()
		delete(p.workers, oltID)
	}
	if pool, ok := p.pools[oltID]; ok {
		pool.Close()
		delete(p.pools, oltID)
	}
}

// StopAll cancels all running pollers.
func (p *Poller) StopAll() {
	p.mu.Lock()
	ids := make([]string, 0, len(p.workers))
	for id := range p.workers {
		ids = append(ids, id)
	}
	p.mu.Unlock()
	for _, id := range ids {
		p.Stop(id)
	}
}

// StartAll loads all enabled OLTs from the DB and starts their pollers.
func (p *Poller) StartAll() {
	var olts []models.NetworkOLT
	if err := p.db.Where("monitoringEnabled = ?", true).Find(&olts).Error; err != nil {
		log.Error().Err(err).Msg("poller: failed to load OLTs")
		return
	}
	log.Info().Int("count", len(olts)).Msg("poller: starting all OLT pollers")
	for i := range olts {
		p.Start(&olts[i])
	}
}

// TriggerPoll triggers an immediate poll for the given OLT (used by manual sync endpoint).
func (p *Poller) TriggerPoll(oltID string) error {
	var olt models.NetworkOLT
	if err := p.db.First(&olt, "id = ?", oltID).Error; err != nil {
		return fmt.Errorf("OLT not found: %w", err)
	}

	p.mu.Lock()
	pool := p.pools[oltID]
	p.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	p.poll(ctx, &olt, pool)
	return nil
}

// ─── Core poll logic ──────────────────────────────────────────────────────────

func (p *Poller) poll(ctx context.Context, olt *models.NetworkOLT, pool *telnet.Pool) {
	start := time.Now()
	log.Debug().Str("olt", olt.ID).Str("ip", olt.IPAddress).Msg("poller: poll start")

	snmpCfg := snmputil.DefaultConfig(olt.IPAddress, olt.SNMPCommunity, olt.SNMPPort)

	// Determine PON ports from existing ONU statuses in DB (avoid the 16-port fallback)
	ponPorts := p.knownPONPorts(ctx, olt.ID)

	result := zte.DiscoverAll(ctx, snmpCfg, pool, ponPorts)

	// Upsert all discovered ONU statuses
	now := time.Now()
	var onuStatuses []models.OLTONUStatus
	onlineCount := 0
	offlineCount := 0

	for _, onu := range result.RegisteredONUs {
		status := models.OLTONUStatus{
			ID:         uuid.NewString(),
			OltID:      olt.ID,
			OnuIndex:   onu.Frame*100000 + onu.Slot*10000 + onu.Port*100 + onu.OnuID,
			Frame:      onu.Frame,
			Slot:       onu.Slot,
			Port:       onu.Port,
			OnuID:      onu.OnuID,
			Status:     onu.Status,
			RxPower:    onu.RxPower,
			Distance:   onu.Distance,
			LastSeenAt: &now,
			UpdatedAt:  now,
		}
		if onu.SerialNumber != "" {
			status.SerialNumber = &onu.SerialNumber
		}
		if onu.Description != "" {
			status.Description = &onu.Description
		}
		if onu.Status == models.OnuOnline {
			onlineCount++
		} else {
			offlineCount++
		}
		onuStatuses = append(onuStatuses, status)
	}

	// Batch upsert (update on conflict)
	if len(onuStatuses) > 0 {
		err := p.db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "olt_id"}, {Name: "frame"}, {Name: "slot"}, {Name: "port"}, {Name: "onu_id"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"serial_number", "description", "status", "rx_power",
				"distance", "last_seen_at", "updated_at",
			}),
		}).CreateInBatches(onuStatuses, 100).Error
		if err != nil {
			log.Error().Err(err).Str("olt", olt.ID).Msg("poller: upsert onu statuses failed")
		}
	}

	// Update OLT summary
	totalONU := len(onuStatuses)
	pollTime := now
	p.db.Model(olt).Updates(map[string]interface{}{
		"last_poll_at": pollTime,
		"total_onu":    totalONU,
		"online_onu":   onlineCount,
		"offline_onu":  offlineCount,
		"is_online":    true,
	})

	// Generate alerts for newly offline ONUs
	p.checkAlerts(ctx, olt, onuStatuses)

	duration := time.Since(start)
	log.Debug().
		Str("olt", olt.ID).
		Int("total", totalONU).
		Int("online", onlineCount).
		Int("offline", offlineCount).
		Dur("took", duration).
		Msg("poller: poll done")

	// Broadcast to WebSocket clients
	if p.broadcast != nil {
		p.broadcast(olt.ID, map[string]interface{}{
			"type":     "olt_status",
			"oltId":    olt.ID,
			"total":    totalONU,
			"online":   onlineCount,
			"offline":  offlineCount,
			"polledAt": now,
		})
	}
}

// knownPONPorts returns the set of (board, port) pairs that have ONU records in the DB.
// Falls back to nil (which triggers 2×8 default in zte.DiscoverONUsSNMP).
func (p *Poller) knownPONPorts(ctx context.Context, oltID string) [][2]int {
	type portRow struct {
		Frame int
		Port  int
	}
	var rows []portRow
	if err := p.db.WithContext(ctx).
		Model(&models.OLTONUStatus{}).
		Where("olt_id = ?", oltID).
		Select("DISTINCT frame, port").
		Find(&rows).Error; err != nil || len(rows) == 0 {
		return nil
	}
	ports := make([][2]int, len(rows))
	for i, r := range rows {
		ports[i] = [2]int{r.Frame, r.Port}
	}
	return ports
}

// checkAlerts creates alert records for ONUs that went offline.
func (p *Poller) checkAlerts(ctx context.Context, olt *models.NetworkOLT, statuses []models.OLTONUStatus) {
	for _, s := range statuses {
		if s.Status == models.OnuOffline {
			// Check if an unresolved alert already exists for this ONU
			var existing models.OLTAlert
			err := p.db.WithContext(ctx).Where(
				"olt_id = ? AND onu_id = ? AND alert_type = ? AND is_resolved = ?",
				olt.ID, s.ID, models.AlertONUOffline, false,
			).First(&existing).Error
			if err == nil {
				continue // Alert already open
			}

			onuID := s.ID
			alert := models.OLTAlert{
				ID:        uuid.NewString(),
				OltID:     &olt.ID,
				OnuID:     &onuID,
				AlertType: models.AlertONUOffline,
				Severity:  models.SeverityWarning,
				Message:   fmt.Sprintf("ONU %s (port %d/%d/%d:%d) went offline", strPtr(s.SerialNumber), s.Frame, s.Slot, s.Port, s.OnuID),
			}
			p.db.WithContext(ctx).Create(&alert)
		}
	}
}

func strPtr(s *string) string {
	if s == nil {
		return "N/A"
	}
	return *s
}
