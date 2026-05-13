package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// WhatsappCrudHandler handles WhatsApp provider, template, history, and send management.
type WhatsappCrudHandler struct{ db *gorm.DB }

func NewWhatsappCrudHandler(db *gorm.DB) *WhatsappCrudHandler {
	return &WhatsappCrudHandler{db: db}
}

// ─── Providers ────────────────────────────────────────────────────────────────

// GET /api/whatsapp/providers
func (h *WhatsappCrudHandler) ListProviders(c fiber.Ctx) error {
	var providers []models.WhatsappProvider
	h.db.Order("priority asc, created_at asc").Find(&providers)
	return c.JSON(fiber.Map{"success": true, "providers": providers})
}

// POST /api/whatsapp/providers
func (h *WhatsappCrudHandler) CreateProvider(c fiber.Ctx) error {
	var body models.WhatsappProvider
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	body.ID = generateID()
	body.CreatedAt = time.Now()
	body.UpdatedAt = time.Now()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "provider": body})
}

// GET /api/whatsapp/providers/:id
func (h *WhatsappCrudHandler) GetProvider(c fiber.Ctx) error {
	id := c.Params("id")
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	return c.JSON(fiber.Map{"success": true, "provider": provider})
}

// PUT /api/whatsapp/providers/:id
func (h *WhatsappCrudHandler) UpdateProvider(c fiber.Ctx) error {
	id := c.Params("id")
	var provider models.WhatsappProvider
	if err := h.db.First(&provider, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "provider not found"})
	}
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&provider).Updates(body)
	return c.JSON(fiber.Map{"success": true, "provider": provider})
}

// DELETE /api/whatsapp/providers/:id
func (h *WhatsappCrudHandler) DeleteProvider(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.WhatsappProvider{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── History ─────────────────────────────────────────────────────────────────

// GET /api/whatsapp/history
func (h *WhatsappCrudHandler) ListHistory(c fiber.Ctx) error {
	page, limit := pageParams(c)
	status := c.Query("status")
	phone := c.Query("phone")

	q := h.db.Model(&models.WhatsappHistory{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if phone != "" {
		q = q.Where("phone LIKE ?", "%"+phone+"%")
	}

	var total int64
	q.Count(&total)
	var history []models.WhatsappHistory
	q.Order("sent_at desc").Offset((page - 1) * limit).Limit(limit).Find(&history)
	return c.JSON(fiber.Map{
		"success": true,
		"history": history,
		"pagination": fiber.Map{
			"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// DELETE /api/whatsapp/history/delete — bulk delete history
func (h *WhatsappCrudHandler) DeleteHistory(c fiber.Ctx) error {
	var body struct {
		IDs      []string `json:"ids"`
		BeforeAt string   `json:"beforeAt"` // delete all before this date
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.IDs) > 0 {
		h.db.Delete(&models.WhatsappHistory{}, "id IN ?", body.IDs)
	} else if body.BeforeAt != "" {
		t, err := time.Parse("2006-01-02", body.BeforeAt)
		if err == nil {
			h.db.Where("sent_at < ?", t).Delete(&models.WhatsappHistory{})
		}
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── Send ─────────────────────────────────────────────────────────────────────

// POST /api/whatsapp/send — send single WhatsApp message
func (h *WhatsappCrudHandler) Send(c fiber.Ctx) error {
	var body struct {
		Phone      string  `json:"phone"`
		Message    string  `json:"message"`
		ProviderID *string `json:"providerId"`
		TemplateID *string `json:"templateId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Phone == "" || body.Message == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone and message required"})
	}

	history := models.WhatsappHistory{
		ID:         generateID(),
		Phone:      body.Phone,
		Message:    body.Message,
		Status:     "QUEUED",
		TemplateID: body.TemplateID,
		SentAt:     time.Now(),
	}
	h.db.Create(&history)
	return c.JSON(fiber.Map{"success": true, "messageId": history.ID, "status": "QUEUED"})
}

// ─── Templates ────────────────────────────────────────────────────────────────

// GET /api/whatsapp/templates
func (h *WhatsappCrudHandler) ListTemplates(c fiber.Ctx) error {
	var templates []models.WhatsappTemplate
	h.db.Order("type asc").Find(&templates)
	return c.JSON(fiber.Map{"success": true, "templates": templates})
}

// POST /api/whatsapp/templates
func (h *WhatsappCrudHandler) CreateTemplate(c fiber.Ctx) error {
	var body models.WhatsappTemplate
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	body.ID = generateID()
	body.CreatedAt = time.Now()
	body.UpdatedAt = time.Now()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "template": body})
}

// GET /api/whatsapp/templates/:id
func (h *WhatsappCrudHandler) GetTemplate(c fiber.Ctx) error {
	id := c.Params("id")
	var tmpl models.WhatsappTemplate
	if err := h.db.First(&tmpl, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "template not found"})
	}
	return c.JSON(fiber.Map{"success": true, "template": tmpl})
}

// PUT /api/whatsapp/templates/:id
func (h *WhatsappCrudHandler) UpdateTemplate(c fiber.Ctx) error {
	id := c.Params("id")
	var tmpl models.WhatsappTemplate
	if err := h.db.First(&tmpl, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "template not found"})
	}
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&tmpl).Updates(body)
	return c.JSON(fiber.Map{"success": true, "template": tmpl})
}

// DELETE /api/whatsapp/templates/:id
func (h *WhatsappCrudHandler) DeleteTemplate(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.WhatsappTemplate{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── Reminder Settings ────────────────────────────────────────────────────────

// GET /api/whatsapp/reminder-settings
func (h *WhatsappCrudHandler) GetReminderSettings(c fiber.Ctx) error {
	var settings []models.WhatsappReminderSetting
	h.db.Order("days_before desc").Find(&settings)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// PUT /api/whatsapp/reminder-settings
func (h *WhatsappCrudHandler) UpdateReminderSettings(c fiber.Ctx) error {
	var body []models.WhatsappReminderSetting
	if err := c.Bind().JSON(&body); err != nil {
		// Try single object
		var single models.WhatsappReminderSetting
		if err2 := c.Bind().JSON(&single); err2 != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
		}
		body = []models.WhatsappReminderSetting{single}
	}
	for _, s := range body {
		if s.ID == "" {
			s.ID = generateID()
			s.CreatedAt = time.Now()
			h.db.Create(&s)
		} else {
			s.UpdatedAt = time.Now()
			h.db.Model(&s).Updates(s)
		}
	}
	var settings []models.WhatsappReminderSetting
	h.db.Order("days_before desc").Find(&settings)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}
