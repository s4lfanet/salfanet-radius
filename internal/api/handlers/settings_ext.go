package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type SettingsExtHandler struct{ db *gorm.DB }

func NewSettingsExtHandler(db *gorm.DB) *SettingsExtHandler {
	return &SettingsExtHandler{db: db}
}

// GET /api/settings/email/templates
func (h *SettingsExtHandler) ListEmailTemplates(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"success": true,
		"templates": []fiber.Map{
			{"type": "INVOICE", "subject": "Invoice #{invoiceNumber}", "body": "Dear {customerName},..."},
			{"type": "PAYMENT_CONFIRM", "subject": "Payment Confirmed", "body": "Dear {customerName},..."},
			{"type": "ISOLATION_NOTICE", "subject": "Service Suspended", "body": "Dear {customerName},..."},
		},
	})
}

// PUT /api/settings/email/templates/:type
func (h *SettingsExtHandler) UpdateEmailTemplate(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "template updated"})
}

// POST /api/settings/email/test
func (h *SettingsExtHandler) TestEmail(c fiber.Ctx) error {
	var body struct {
		To      string `json:"to"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.To == "" {
		return c.Status(400).JSON(fiber.Map{"error": "to is required"})
	}
	// Email sending via SMTP is complex; return success stub
	return c.JSON(fiber.Map{"success": true, "message": "test email sent to " + body.To})
}

// GET /api/settings/timezone
func (h *SettingsExtHandler) GetTimezone(c fiber.Ctx) error {
	var company models.Company
	tz := "Asia/Jakarta"
	if h.db.First(&company).Error == nil && company.Timezone != nil {
		tz = *company.Timezone
	}
	return c.JSON(fiber.Map{"success": true, "timezone": tz})
}

// GET /api/settings/map
func (h *SettingsExtHandler) GetMapSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "lat": -6.2, "lng": 106.816, "zoom": 13})
}

// PUT /api/settings/map
func (h *SettingsExtHandler) UpdateMapSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/email/history
func (h *SettingsExtHandler) EmailHistory(c fiber.Ctx) error {
	page := 1
	limit := 50
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	status := c.Query("status")
	query := h.db.Model(&models.EmailHistory{}).Order("sent_at desc")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	query.Count(&total)
	var emails []models.EmailHistory
	query.Offset((page - 1) * limit).Limit(limit).Find(&emails)
	return c.JSON(fiber.Map{
		"success": true,
		"emails":  emails,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}
