package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/config"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// WhatsappHandler handles WhatsApp provider and template management.
type WhatsappHandler struct {
	db         *gorm.DB
	httpClient *http.Client
}

func NewWhatsappHandler(db *gorm.DB) *WhatsappHandler {
	return &WhatsappHandler{
		db:         db,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// ─── Providers ───────────────────────────────────────────────────────────────

func (h *WhatsappHandler) ListProviders(c fiber.Ctx) error {
	var providers []models.WhatsappProvider
	h.db.Order("priority").Find(&providers)
	return c.JSON(providers)
}

func (h *WhatsappHandler) CreateProvider(c fiber.Ctx) error {
	var body models.WhatsappProvider
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *WhatsappHandler) UpdateProvider(c fiber.Ctx) error {
	id := c.Params("id")
	var p models.WhatsappProvider
	if err := h.db.First(&p, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&p)
	return c.JSON(p)
}

// ─── Templates ───────────────────────────────────────────────────────────────

func (h *WhatsappHandler) ListTemplates(c fiber.Ctx) error {
	var templates []models.WhatsappTemplate
	h.db.Order("type").Find(&templates)
	return c.JSON(templates)
}

func (h *WhatsappHandler) UpdateTemplate(c fiber.Ctx) error {
	tmplType := c.Params("type")
	var tmpl models.WhatsappTemplate
	if err := h.db.Where("type = ?", tmplType).First(&tmpl).Error; err != nil {
		// Create if not exists
		if err := c.Bind().JSON(&tmpl); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		tmpl.ID = uuid.New().String()
		tmpl.Type = tmplType
		h.db.Create(&tmpl)
		return c.Status(fiber.StatusCreated).JSON(tmpl)
	}
	if err := c.Bind().JSON(&tmpl); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&tmpl)
	return c.JSON(tmpl)
}

// ─── Send Manual ─────────────────────────────────────────────────────────────

func (h *WhatsappHandler) SendMessage(c fiber.Ctx) error {
	var body struct {
		Phone   string `json:"phone"`
		Message string `json:"message"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	payload, _ := json.Marshal(map[string]string{
		"phone":   body.Phone,
		"message": body.Message,
	})
	resp, err := h.httpClient.Post(config.C.WAServiceURL+"/send", "application/json", bytes.NewReader(payload))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// Record in history
	status := "sent"
	if resp.StatusCode >= 400 {
		status = "failed"
	}
	errStr := ""
	hist := models.WhatsappHistory{
		ID:      uuid.New().String(),
		Phone:   body.Phone,
		Message: body.Message,
		Status:  status,
		SentAt:  time.Now(),
	}
	if status == "failed" {
		errStr = string(respBody)
		hist.Error = &errStr
	}
	h.db.Create(&hist)

	if resp.StatusCode >= 400 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": string(respBody)})
	}
	return c.JSON(fiber.Map{"message": "sent"})
}

// ─── History ─────────────────────────────────────────────────────────────────

func (h *WhatsappHandler) ListHistory(c fiber.Ctx) error {
	var history []models.WhatsappHistory
	h.db.Order("sent_at DESC").Limit(200).Find(&history)
	return c.JSON(history)
}

// ─── Reminder Settings ───────────────────────────────────────────────────────

func (h *WhatsappHandler) GetReminderSettings(c fiber.Ctx) error {
	var settings []models.WhatsappReminderSetting
	h.db.Order("days_before").Find(&settings)
	return c.JSON(settings)
}

func (h *WhatsappHandler) UpdateReminderSettings(c fiber.Ctx) error {
	var body []models.WhatsappReminderSetting
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	for _, s := range body {
		if s.ID == "" {
			s.ID = uuid.New().String()
			h.db.Create(&s)
		} else {
			h.db.Save(&s)
		}
	}
	return c.JSON(fiber.Map{"message": "saved"})
}
