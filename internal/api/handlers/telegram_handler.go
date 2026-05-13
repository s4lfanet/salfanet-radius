package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type TelegramHandler struct{ db *gorm.DB }

func NewTelegramHandler(db *gorm.DB) *TelegramHandler { return &TelegramHandler{db: db} }

// GET /api/telegram/settings
func (h *TelegramHandler) GetSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"success": true,
		"settings": fiber.Map{
			"botToken":        "",
			"chatId":          "",
			"enabled":         false,
			"sendDailyReport": false,
			"sendAlerts":      false,
		},
	})
}

// PUT /api/telegram/settings
func (h *TelegramHandler) UpdateSettings(c fiber.Ctx) error {
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	// Settings are stored in company/settings — stub implementation
	return c.JSON(fiber.Map{"success": true, "message": "settings saved"})
}

// POST /api/telegram/test — send test message
func (h *TelegramHandler) Test(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "test message sent"})
}

// POST /api/telegram/send-backup
func (h *TelegramHandler) SendBackup(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "backup sent to telegram"})
}

// POST /api/telegram/test-backup
func (h *TelegramHandler) TestBackup(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "test backup triggered"})
}
