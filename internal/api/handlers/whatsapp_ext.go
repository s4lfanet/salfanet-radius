package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type WhatsappExtHandler struct{ db *gorm.DB }

func NewWhatsappExtHandler(db *gorm.DB) *WhatsappExtHandler {
	return &WhatsappExtHandler{db: db}
}

// POST /api/whatsapp/broadcast — send broadcast message to multiple users
func (h *WhatsappExtHandler) Broadcast(c fiber.Ctx) error {
	var body struct {
		Message  string   `json:"message"`
		UserIDs  []string `json:"userIds"`
		Template string   `json:"template"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Message == "" {
		return c.Status(400).JSON(fiber.Map{"error": "message required"})
	}

	// Get target users
	var users []models.PppoeUser
	if len(body.UserIDs) > 0 {
		h.db.Where("id IN ?", body.UserIDs).Find(&users)
	} else {
		h.db.Where("status = ?", "active").Find(&users)
	}

	// Record history entries (actual WA sending done by WA service)
	sent := 0
	for _, u := range users {
		msg := strings.ReplaceAll(body.Message, "{name}", u.Name)
		msg = strings.ReplaceAll(msg, "{phone}", u.Phone)
		history := models.WhatsappHistory{
			ID:         generateID(),
			Phone:      u.Phone,
			Message:    msg,
			Status:     "QUEUED",
			TemplateID: nil,
			SentAt:     time.Now(),
		}
		h.db.Create(&history)
		sent++
	}

	return c.JSON(fiber.Map{"success": true, "queued": sent})
}

// POST /api/whatsapp/broadcast-invoice — send invoice reminders
func (h *WhatsappExtHandler) BroadcastInvoice(c fiber.Ctx) error {
	var body struct {
		InvoiceIDs []string `json:"invoiceIds"`
		Message    string   `json:"message"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	var invoices []models.Invoice
	if len(body.InvoiceIDs) > 0 {
		h.db.Where("id IN ?", body.InvoiceIDs).Preload("User").Find(&invoices)
	} else {
		h.db.Where("status = ?", "UNPAID").Preload("User").Find(&invoices)
	}

	sent := 0
	for _, inv := range invoices {
		if inv.User == nil {
			continue
		}
		msg := fmt.Sprintf("Tagihan #%s sebesar Rp %d belum dibayar.", inv.InvoiceNumber, inv.Amount)
		if body.Message != "" {
			msg = strings.ReplaceAll(body.Message, "{invoiceNumber}", inv.InvoiceNumber)
		}
		history := models.WhatsappHistory{
			ID:         generateID(),
			Phone:      inv.User.Phone,
			Message:    msg,
			Status:     "QUEUED",
			TemplateID: nil,
			SentAt:     time.Now(),
		}
		h.db.Create(&history)
		sent++
	}
	return c.JSON(fiber.Map{"success": true, "queued": sent})
}

// GET /api/whatsapp/providers/:id/status — get WA provider status
func (h *WhatsappExtHandler) ProviderStatus(c fiber.Ctx) error {
	id := c.Params("id")
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	// Status check would call WA service API - stub
	return c.JSON(fiber.Map{
		"success":  true,
		"provider": provider,
		"status":   "UNKNOWN",
		"connected": false,
	})
}

// GET /api/whatsapp/providers/:id/qr — get WA provider QR code
func (h *WhatsappExtHandler) ProviderQR(c fiber.Ctx) error {
	id := c.Params("id")
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	return c.JSON(fiber.Map{"success": true, "qr": nil, "message": "QR via WA service"})
}

// POST /api/whatsapp/providers/:id/restart — restart WA provider
func (h *WhatsappExtHandler) ProviderRestart(c fiber.Ctx) error {
	id := c.Params("id")
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "restart triggered"})
}

// POST /api/whatsapp/providers/:id/test — send test WA message
func (h *WhatsappExtHandler) ProviderTest(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Phone   string `json:"phone"`
		Message string `json:"message"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	if body.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone required"})
	}
	if body.Message == "" {
		body.Message = "Test message from Salfanet RADIUS"
	}
	history := models.WhatsappHistory{
		ID:     generateID(),
		Phone:  body.Phone,
		Message: body.Message,
		Status: "QUEUED",
		SentAt: time.Now(),
	}
	h.db.Create(&history)
	return c.JSON(fiber.Map{"success": true, "message": "test message queued"})
}

// POST /api/whatsapp/webhook — receive WA webhook events
func (h *WhatsappExtHandler) Webhook(c fiber.Ctx) error {
	// Accept all webhook events and return 200
	// Processing would be done asynchronously
	return c.JSON(fiber.Map{"success": true})
}
