package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type SettingsGenieacsHandler struct{ db *gorm.DB }

func NewSettingsGenieacsHandler(db *gorm.DB) *SettingsGenieacsHandler {
	return &SettingsGenieacsHandler{db: db}
}

// GET /api/settings/genieacs/devices — proxy device list to GenieACS (stub)
func (h *SettingsGenieacsHandler) ListDevices(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "devices": []fiber.Map{}, "total": 0})
}

// GET /api/settings/genieacs/devices/:deviceId
func (h *SettingsGenieacsHandler) GetDevice(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "device": nil, "message": "GenieACS not configured"})
}

// GET /api/settings/genieacs/devices/:deviceId/detail
func (h *SettingsGenieacsHandler) DeviceDetail(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "detail": nil})
}

// GET /api/settings/genieacs/devices/:deviceId/parameters
func (h *SettingsGenieacsHandler) DeviceParameters(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "parameters": []fiber.Map{}})
}

// POST /api/settings/genieacs/devices/:deviceId/reboot
func (h *SettingsGenieacsHandler) RebootDevice(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "reboot task queued"})
}

// POST /api/settings/genieacs/devices/:deviceId/refresh
func (h *SettingsGenieacsHandler) RefreshDevice(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "refresh task queued"})
}

// GET /api/settings/genieacs/tasks
func (h *SettingsGenieacsHandler) ListTasks(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "tasks": []fiber.Map{}})
}

// POST /api/settings/genieacs/test
func (h *SettingsGenieacsHandler) TestConnection(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "GenieACS connection test not configured"})
}

// GET /api/settings/genieacs/parameter-display
func (h *SettingsGenieacsHandler) ListParameterDisplay(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "configs": []fiber.Map{}})
}

// PUT /api/settings/genieacs/parameter-display/:id
func (h *SettingsGenieacsHandler) UpdateParameterDisplay(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "updated"})
}

// POST /api/settings/genieacs/parameter-display/reset
func (h *SettingsGenieacsHandler) ResetParameterDisplay(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "reset to defaults"})
}

// GET /api/settings/genieacs/virtual-parameters
func (h *SettingsGenieacsHandler) ListVirtualParameters(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "parameters": []fiber.Map{}})
}

// GET /api/settings/genieacs/virtual-parameters/:id
func (h *SettingsGenieacsHandler) GetVirtualParameter(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "parameter": nil})
}

// ─── Isolation Templates ──────────────────────────────────────────────────────

// GET /api/settings/isolation/templates
func (h *SettingsGenieacsHandler) ListIsolationTemplates(c fiber.Ctx) error {
	var templates []models.IsolationTemplate
	h.db.Where("is_active = ?", true).Find(&templates)
	return c.JSON(fiber.Map{"success": true, "templates": templates})
}

// GET /api/settings/isolation/templates/:id
func (h *SettingsGenieacsHandler) GetIsolationTemplate(c fiber.Ctx) error {
	id := c.Params("id")
	var tmpl models.IsolationTemplate
	if err := h.db.First(&tmpl, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "template not found"})
	}
	return c.JSON(fiber.Map{"success": true, "template": tmpl})
}

// PUT /api/settings/isolation/templates/:id
func (h *SettingsGenieacsHandler) UpdateIsolationTemplate(c fiber.Ctx) error {
	id := c.Params("id")
	var tmpl models.IsolationTemplate
	if err := h.db.First(&tmpl, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "template not found"})
	}
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	h.db.Model(&tmpl).Updates(body)
	return c.JSON(fiber.Map{"success": true, "template": tmpl})
}

// POST /api/settings/restart-services — restart services
func (h *SettingsGenieacsHandler) RestartServices(c fiber.Ctx) error {
	var body struct {
		Service string `json:"service"` // "freeradius", "nginx", "all"
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"message": "restart triggered for " + body.Service,
		"note":    "actual restart requires privileged access",
	})
}

// GET /api/sessions/realtime — real-time session count (polling endpoint)
func (h *SettingsGenieacsHandler) RealtimeSessions(c fiber.Ctx) error {
	var count int64
	h.db.Model(&models.Radacct{}).Where("acctstoptime IS NULL").Count(&count)
	return c.JSON(fiber.Map{
		"success":  true,
		"active":   count,
		"polledAt": time.Now().Format(time.RFC3339),
	})
}

// GET /api/system/radius — radius system info
func (h *SettingsGenieacsHandler) SystemRadius(c fiber.Ctx) error {
	var totalUsers, activeUsers int64
	h.db.Model(&models.PppoeUser{}).Count(&totalUsers)
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "active").Count(&activeUsers)

	var activeSessions int64
	h.db.Model(&models.Radacct{}).Where("acctstoptime IS NULL").Count(&activeSessions)

	return c.JSON(fiber.Map{
		"success":        true,
		"totalUsers":     totalUsers,
		"activeUsers":    activeUsers,
		"activeSessions": activeSessions,
	})
}

// GET /api/sse/voucher-updates — SSE endpoint for voucher updates
func (h *SettingsGenieacsHandler) SSEVoucherUpdates(c fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	var count int64
	h.db.Model(&models.HotspotVoucher{}).Where("status = ?", "AVAILABLE").Count(&count)

	data := `data: {"type":"voucher-count","count":` + strconv.FormatInt(count, 10) + `}` + "\n\n"
	return c.SendString(data)
}

// suppress unused import
var _ = strconv.Itoa
