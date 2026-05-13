package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// SettingsHandler handles email and isolation settings endpoints.
type SettingsHandler struct{ db *gorm.DB }

func NewSettingsHandler(db *gorm.DB) *SettingsHandler { return &SettingsHandler{db: db} }

// GetEmailSettings GET /api/settings/email
func (h *SettingsHandler) GetEmailSettings(c fiber.Ctx) error {
	var settings models.EmailSetting
	if err := h.db.First(&settings).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.JSON(fiber.Map{
				"success": true,
				"settings": fiber.Map{
					"enabled": false, "smtpHost": "smtp.gmail.com", "smtpPort": 587,
					"smtpSecure": false, "smtpUser": "", "smtpPassword": "********",
					"fromEmail": "", "fromName": "RADIUS Notification",
					"notifyNewUser": true, "notifyExpired": true, "notifyInvoice": true, "notifyPayment": true,
					"reminderEnabled": true, "reminderTime": "09:00", "reminderDays": "7,3,1",
				},
			})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	settings.SmtpPassword = "********"
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// UpdateEmailSettings POST /api/settings/email
func (h *SettingsHandler) UpdateEmailSettings(c fiber.Ctx) error {
	var body models.EmailSetting
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	updates := map[string]any{
		"enabled": body.Enabled, "smtpHost": body.SmtpHost, "smtpPort": body.SmtpPort,
		"smtpSecure": body.SmtpSecure, "smtpUser": body.SmtpUser,
		"fromEmail": body.FromEmail, "fromName": body.FromName,
		"notifyNewUser": body.NotifyNewUser, "notifyExpired": body.NotifyExpired,
		"notifyInvoice": body.NotifyInvoice, "notifyPayment": body.NotifyPayment,
		"reminderEnabled": body.ReminderEnabled, "reminderTime": body.ReminderTime,
		"reminderDays": body.ReminderDays,
	}
	if body.SmtpPassword != "********" && body.SmtpPassword != "" {
		updates["smtpPassword"] = body.SmtpPassword
	}

	var existing models.EmailSetting
	if err := h.db.First(&existing).Error; err == nil {
		h.db.Model(&existing).Updates(updates)
		existing.SmtpPassword = "********"
		return c.JSON(fiber.Map{"success": true, "settings": existing})
	}
	// Create first-time
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	body.SmtpPassword = "********"
	return c.JSON(fiber.Map{"success": true, "settings": body})
}

// GetIsolationSettings GET /api/settings/isolation
func (h *SettingsHandler) GetIsolationSettings(c fiber.Ctx) error {
	var company models.Company
	if err := h.db.First(&company).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "settings": company})
}

// UpdateIsolationSettings PUT /api/settings/isolation
func (h *SettingsHandler) UpdateIsolationSettings(c fiber.Ctx) error {
	var body struct {
		IsolationEnabled        *bool   `json:"isolationEnabled"`
		IsolationIpPool         *string `json:"isolationIpPool"`
		IsolationServerIp       *string `json:"isolationServerIp"`
		IsolationRateLimit      *string `json:"isolationRateLimit"`
		IsolationRedirectUrl    *string `json:"isolationRedirectUrl"`
		IsolationMessage        *string `json:"isolationMessage"`
		IsolationAllowDns       *bool   `json:"isolationAllowDns"`
		IsolationAllowPayment   *bool   `json:"isolationAllowPayment"`
		IsolationNotifyWhatsapp *bool   `json:"isolationNotifyWhatsapp"`
		IsolationNotifyEmail    *bool   `json:"isolationNotifyEmail"`
		GracePeriodDays         *int    `json:"gracePeriodDays"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	var company models.Company
	if err := h.db.First(&company).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	updates := map[string]any{}
	if body.IsolationEnabled != nil {
		updates["isolationEnabled"] = body.IsolationEnabled
	}
	if body.IsolationIpPool != nil {
		updates["isolationIpPool"] = body.IsolationIpPool
	}
	if body.IsolationServerIp != nil {
		updates["isolationServerIp"] = body.IsolationServerIp
	}
	if body.IsolationRateLimit != nil {
		updates["isolationRateLimit"] = body.IsolationRateLimit
	}
	if body.IsolationRedirectUrl != nil {
		updates["isolationRedirectUrl"] = body.IsolationRedirectUrl
	}
	if body.IsolationMessage != nil {
		updates["isolationMessage"] = body.IsolationMessage
	}
	if body.IsolationAllowDns != nil {
		updates["isolationAllowDns"] = body.IsolationAllowDns
	}
	if body.IsolationAllowPayment != nil {
		updates["isolationAllowPayment"] = body.IsolationAllowPayment
	}
	if body.IsolationNotifyWhatsapp != nil {
		updates["isolationNotifyWhatsapp"] = body.IsolationNotifyWhatsapp
	}
	if body.IsolationNotifyEmail != nil {
		updates["isolationNotifyEmail"] = body.IsolationNotifyEmail
	}
	if body.GracePeriodDays != nil {
		updates["gracePeriodDays"] = body.GracePeriodDays
	}

	if err := h.db.Model(&company).Updates(updates).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Isolation settings updated"})
}
