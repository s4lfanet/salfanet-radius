package handlers

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/poller"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/telnet"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/vendors/zte"
	"github.com/s4lfanet/salfanet-radius-go/internal/ws"
)

// OLTHandler handles OLT-related API endpoints.
type OLTHandler struct {
	db     *gorm.DB
	poller *poller.Poller
	hub    *ws.Hub
}

// NewOLTHandler creates an OLTHandler.
func NewOLTHandler(db *gorm.DB, p *poller.Poller, h *ws.Hub) *OLTHandler {
	return &OLTHandler{db: db, poller: p, hub: h}
}

// ─── OLT CRUD ────────────────────────────────────────────────────────────────

// ListOLTs godoc
// GET /api/olt
func (h *OLTHandler) ListOLTs(c fiber.Ctx) error {
	var olts []models.NetworkOLT
	if err := h.db.Find(&olts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(olts)
}

// CreateOLT godoc
// POST /api/olt
func (h *OLTHandler) CreateOLT(c fiber.Ctx) error {
	var body models.NetworkOLT
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	body.ID = uuid.NewString()

	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Start monitoring if enabled
	if body.MonitoringEnabled {
		h.poller.Start(&body)
	}

	return c.Status(fiber.StatusCreated).JSON(body)
}

// GetOLT godoc
// GET /api/olt/:id
func (h *OLTHandler) GetOLT(c fiber.Ctx) error {
	id := c.Params("id")
	var olt models.NetworkOLT
	if err := h.db.Preload("ONUStatuses").First(&olt, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "OLT not found"})
	}
	return c.JSON(olt)
}

// UpdateOLT godoc
// PUT /api/olt/:id
func (h *OLTHandler) UpdateOLT(c fiber.Ctx) error {
	id := c.Params("id")
	var olt models.NetworkOLT
	if err := h.db.First(&olt, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "OLT not found"})
	}

	var body models.NetworkOLT
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	body.ID = id

	if err := h.db.Save(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Restart poller if monitoring settings changed
	h.poller.Stop(id)
	if body.MonitoringEnabled {
		h.poller.Start(&body)
	}

	return c.JSON(body)
}

// DeleteOLT godoc
// DELETE /api/olt/:id
func (h *OLTHandler) DeleteOLT(c fiber.Ctx) error {
	id := c.Params("id")
	h.poller.Stop(id)
	if err := h.db.Delete(&models.NetworkOLT{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "deleted"})
}

// SyncOLT godoc
// POST /api/olt/:id/sync — manual poll trigger
func (h *OLTHandler) SyncOLT(c fiber.Ctx) error {
	id := c.Params("id")
	go func() {
		if err := h.poller.TriggerPoll(id); err != nil {
			log.Error().Err(err).Str("olt", id).Msg("manual sync failed")
		}
	}()
	return c.JSON(fiber.Map{"message": "sync triggered"})
}

// ─── ONU endpoints ───────────────────────────────────────────────────────────

// ListONUs godoc
// GET /api/olt/:id/onus
func (h *OLTHandler) ListONUs(c fiber.Ctx) error {
	id := c.Params("id")

	var onuStatuses []models.OLTONUStatus
	query := h.db.Where("olt_id = ?", id)

	// Optional filters
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if search := c.Query("search"); search != "" {
		query = query.Where("serial_number LIKE ? OR description LIKE ?", "%"+search+"%", "%"+search+"%")
	}

	page := 1
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	pageSize := 50
	if v, err := strconv.Atoi(c.Query("pageSize")); err == nil && v > 0 {
		pageSize = v
	}
	if pageSize > 500 {
		pageSize = 500
	}
	offset := (page - 1) * pageSize

	var total int64
	query.Model(&models.OLTONUStatus{}).Count(&total)

	if err := query.Preload("Customer").
		Order("frame, slot, port, onu_id").
		Limit(pageSize).Offset(offset).
		Find(&onuStatuses).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"data":     onuStatuses,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GetONU godoc
// GET /api/olt/:id/onus/:onuId
func (h *OLTHandler) GetONU(c fiber.Ctx) error {
	oltID := c.Params("id")
	onuID := c.Params("onuId")

	var status models.OLTONUStatus
	if err := h.db.Preload("Customer").
		Where("olt_id = ? AND id = ?", oltID, onuID).
		First(&status).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ONU not found"})
	}
	return c.JSON(status)
}

// RegisterONU godoc
// POST /api/olt/:id/onus/:onuId/register
func (h *OLTHandler) RegisterONU(c fiber.Ctx) error {
	oltID := c.Params("id")

	var body struct {
		SerialNumber string `json:"serialNumber"`
		OnuType      string `json:"onuType"`
		TcontProfile string `json:"tcontProfile"`
		VLAN         int    `json:"vlan"`
		Frame        int    `json:"frame"`
		Slot         int    `json:"slot"`
		Port         int    `json:"port"`
		OnuID        int    `json:"onuId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var olt models.NetworkOLT
	if err := h.db.First(&olt, "id = ?", oltID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "OLT not found"})
	}

	if !olt.TelnetEnabled || olt.Username == nil || olt.Password == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Telnet not configured for this OLT"})
	}

	telnetCfg := telnet.DefaultConfig(olt.IPAddress, olt.TelnetPort, *olt.Username, *olt.Password)
	pool := telnet.NewPool(telnetCfg)
	defer pool.Close()

	params := zte.RegisterParams{
		Frame:        body.Frame,
		Slot:         body.Slot,
		Port:         body.Port,
		OnuID:        body.OnuID,
		SerialNumber: body.SerialNumber,
		OnuType:      body.OnuType,
		TcontProfile: body.TcontProfile,
		VLAN:         body.VLAN,
	}

	if err := zte.RegisterONU(pool, params); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Upsert ONU status record
	now := time.Now()
	status := models.OLTONUStatus{
		ID:           uuid.NewString(),
		OltID:        oltID,
		Frame:        body.Frame,
		Slot:         body.Slot,
		Port:         body.Port,
		OnuID:        body.OnuID,
		SerialNumber: &body.SerialNumber,
		Status:       models.OnuOffline, // Will be updated on next poll
		FirstSeenAt:  now,
		LastSeenAt:   &now,
		UpdatedAt:    now,
	}
	h.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "olt_id"}, {Name: "frame"}, {Name: "slot"}, {Name: "port"}, {Name: "onu_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"serial_number", "last_seen_at", "updated_at"}),
	}).Create(&status)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "ONU registered", "status": status})
}

// DeregisterONU godoc
// DELETE /api/olt/:id/onus/:onuId
func (h *OLTHandler) DeregisterONU(c fiber.Ctx) error {
	oltID := c.Params("id")
	onuID := c.Params("onuId")

	var status models.OLTONUStatus
	if err := h.db.Where("olt_id = ? AND id = ?", oltID, onuID).First(&status).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ONU not found"})
	}

	var olt models.NetworkOLT
	if err := h.db.First(&olt, "id = ?", oltID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "OLT not found"})
	}

	if olt.TelnetEnabled && olt.Username != nil && olt.Password != nil {
		telnetCfg := telnet.DefaultConfig(olt.IPAddress, olt.TelnetPort, *olt.Username, *olt.Password)
		pool := telnet.NewPool(telnetCfg)
		defer pool.Close()

		if err := zte.DeregisterONU(pool, status.Frame, status.Slot, status.Port, status.OnuID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}

	h.db.Delete(&status)
	return c.JSON(fiber.Map{"message": "ONU deregistered"})
}

// AssignONU godoc
// POST /api/olt/:id/onus/:onuId/assign
func (h *OLTHandler) AssignONU(c fiber.Ctx) error {
	oltID := c.Params("id")
	onuID := c.Params("onuId")

	var body struct {
		CustomerID string `json:"customerId"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.CustomerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "customerId required"})
	}

	if err := h.db.Model(&models.OLTONUStatus{}).
		Where("olt_id = ? AND id = ?", oltID, onuID).
		Update("customer_id", body.CustomerID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "ONU assigned to customer"})
}

// GetRegisterMetadata godoc
// GET /api/olt/:id/onus/register — returns ONU types and TCONT profiles for register form
func (h *OLTHandler) GetRegisterMetadata(c fiber.Ctx) error {
	oltID := c.Params("id")

	var olt models.NetworkOLT
	if err := h.db.First(&olt, "id = ?", oltID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "OLT not found"})
	}

	if !olt.TelnetEnabled || olt.Username == nil || olt.Password == nil {
		return c.JSON(fiber.Map{"onuTypes": []string{}, "tcontProfiles": []string{}, "error": "telnet not configured"})
	}

	telnetCfg := telnet.DefaultConfig(olt.IPAddress, olt.TelnetPort, *olt.Username, *olt.Password)
	pool := telnet.NewPool(telnetCfg)
	defer pool.Close()

	onuTypes, err := zte.GetONUTypes(pool)
	if err != nil {
		log.Warn().Err(err).Str("olt", oltID).Msg("failed to fetch ONU types")
	}

	tcontProfiles, err := zte.GetTcontProfiles(pool)
	if err != nil {
		log.Warn().Err(err).Str("olt", oltID).Msg("failed to fetch TCONT profiles")
	}

	typeNames := make([]string, len(onuTypes))
	for i, t := range onuTypes {
		typeNames[i] = t.Name
	}

	profileNames := make([]string, len(tcontProfiles))
	for i, p := range tcontProfiles {
		profileNames[i] = p.Name
	}

	return c.JSON(fiber.Map{
		"onuTypes":      typeNames,
		"tcontProfiles": profileNames,
	})
}

// ListAlerts godoc
// GET /api/olt/:id/alerts
func (h *OLTHandler) ListAlerts(c fiber.Ctx) error {
	id := c.Params("id")
	var alerts []models.OLTAlert

	query := h.db.Where("olt_id = ?", id)
	if resolved := c.Query("resolved"); resolved == "false" {
		query = query.Where("is_resolved = ?", false)
	}

	if err := query.Order("created_at DESC").Limit(100).Find(&alerts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(alerts)
}

// ListPerformance godoc
// GET /api/olt/:id/performance
func (h *OLTHandler) ListPerformance(c fiber.Ctx) error {
	id := c.Params("id")
	var metrics []models.OLTPerformanceMetric

	hours := 24
	if v, err := strconv.Atoi(c.Query("hours")); err == nil && v > 0 {
		hours = v
	}
	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	if err := h.db.Where("olt_id = ? AND recorded_at >= ?", id, since).
		Order("recorded_at ASC").
		Find(&metrics).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(metrics)
}

// GetChassis godoc
// GET /api/olt/:id/chassis
func (h *OLTHandler) GetChassis(c fiber.Ctx) error {
	id := c.Params("id")

	type portSummary struct {
		Frame   int   `json:"frame"`
		Slot    int   `json:"slot"`
		Port    int   `json:"port"`
		Total   int64 `json:"total"`
		Online  int64 `json:"online"`
		Offline int64 `json:"offline"`
	}

	var rows []portSummary
	h.db.Raw(`
		SELECT frame, slot, port,
		       COUNT(*) as total,
		       SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
		       SUM(CASE WHEN status != 'online' THEN 1 ELSE 0 END) as offline
		FROM olt_onu_status
		WHERE olt_id = ?
		GROUP BY frame, slot, port
		ORDER BY frame, slot, port
	`, id).Scan(&rows)

	return c.JSON(fiber.Map{"ports": rows})
}

// WebSocketOLT handles WebSocket connections for real-time ONU status.
// This is called after the WebSocket upgrade — see router.go for the upgrade setup.
func (h *OLTHandler) WebSocketOLT(conn interface{}, oltID string) {
	// conn is *websocket.Conn; type assertion happens in the fiber websocket handler
	// This is handled directly in the router via gofiber/contrib/websocket
	_ = fmt.Sprintf("ws handler for olt %s registered", oltID)
}
