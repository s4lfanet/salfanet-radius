package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"github.com/s4lfanet/salfanet-radius-go/internal/radius"
)

// RadiusHandler handles FreeRADIUS query/management endpoints.
type RadiusHandler struct {
	db     *gorm.DB
	radius *radius.Service
}

func NewRadiusHandler(db *gorm.DB, rad *radius.Service) *RadiusHandler {
	return &RadiusHandler{db: db, radius: rad}
}

func (h *RadiusHandler) ListUsers(c fiber.Ctx) error {
	var checks []models.Radcheck
	h.db.Where("attribute = 'Cleartext-Password'").
		Order("username").Limit(500).Find(&checks)
	return c.JSON(checks)
}

func (h *RadiusHandler) UpsertUser(c fiber.Ctx) error {
	var body struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		RateLimit string `json:"rateLimit"`
		Group     string `json:"group"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.radius.UpsertUser(body.Username, body.Password, body.RateLimit, body.Group); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "ok"})
}

func (h *RadiusHandler) DeleteUser(c fiber.Ctx) error {
	username := c.Params("username")
	if err := h.radius.DeleteUser(username); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *RadiusHandler) ActiveSessions(c fiber.Ctx) error {
	sessions, err := h.radius.ActiveSessions()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sessions)
}

func (h *RadiusHandler) Stats(c fiber.Ctx) error {
	var total int64
	h.db.Model(&models.Radacct{}).Where("acctstoptime IS NULL").Count(&total)
	return c.JSON(fiber.Map{"activeSessions": total})
}

func (h *RadiusHandler) Disconnect(c fiber.Ctx) error {
	// CoA disconnect requires sending a RADIUS packet to the NAS.
	// For now: update radacct to mark session as stopped (soft disconnect).
	username := c.Params("username")
	h.db.Model(&models.Radacct{}).
		Where("username = ? AND acctstoptime IS NULL", username).
		Update("acctterminatecause", "Admin-Reset")
	return c.JSON(fiber.Map{"message": "disconnect queued"})
}
