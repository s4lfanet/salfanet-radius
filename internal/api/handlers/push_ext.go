package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type PushExtHandler struct{ db *gorm.DB }

func NewPushExtHandler(db *gorm.DB) *PushExtHandler {
	return &PushExtHandler{db: db}
}

// POST /api/push/agent-subscribe
func (h *PushExtHandler) AgentSubscribe(c fiber.Ctx) error {
	var body struct {
		AgentID  string `json:"agentId"`
		Endpoint string `json:"endpoint"`
		P256dh   string `json:"p256dh"`
		Auth     string `json:"auth"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.AgentID == "" || body.Endpoint == "" {
		return c.Status(400).JSON(fiber.Map{"error": "agentId and endpoint required"})
	}

	// Delete existing subscription for this agent
	h.db.Where("agent_id = ? AND endpoint = ?", body.AgentID, body.Endpoint).
		Delete(&models.AgentPushSubscription{})

	sub := models.AgentPushSubscription{
		ID:        generateID(),
		AgentID:   body.AgentID,
		Endpoint:  body.Endpoint,
		P256dh:    body.P256dh,
		Auth:      body.Auth,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&sub).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/push/agent-unsubscribe
func (h *PushExtHandler) AgentUnsubscribe(c fiber.Ctx) error {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	h.db.Where("endpoint = ?", body.Endpoint).Delete(&models.AgentPushSubscription{})
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/push/technician-subscribe
func (h *PushExtHandler) TechnicianSubscribe(c fiber.Ctx) error {
	var body struct {
		TechnicianID string `json:"technicianId"`
		Endpoint     string `json:"endpoint"`
		P256dh       string `json:"p256dh"`
		Auth         string `json:"auth"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.TechnicianID == "" || body.Endpoint == "" {
		return c.Status(400).JSON(fiber.Map{"error": "technicianId and endpoint required"})
	}

	h.db.Where("technician_id = ? AND endpoint = ?", body.TechnicianID, body.Endpoint).
		Delete(&models.TechnicianPushSubscription{})

	sub := models.TechnicianPushSubscription{
		ID:           generateID(),
		TechnicianID: body.TechnicianID,
		Endpoint:     body.Endpoint,
		P256dh:       body.P256dh,
		Auth:         body.Auth,
		CreatedAt:    time.Now(),
	}
	if err := h.db.Create(&sub).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/push/technician-unsubscribe
func (h *PushExtHandler) TechnicianUnsubscribe(c fiber.Ctx) error {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	h.db.Where("endpoint = ?", body.Endpoint).Delete(&models.TechnicianPushSubscription{})
	return c.JSON(fiber.Map{"success": true})
}
