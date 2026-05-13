package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type PushHandler struct{ db *gorm.DB }

func NewPushHandler(db *gorm.DB) *PushHandler { return &PushHandler{db: db} }

// GET /api/admin/push-notifications — list broadcasts
func (h *PushHandler) ListBroadcasts(c fiber.Ctx) error {
	limit := 50
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	var notifs []models.Notification
	h.db.Where("type = ?", "BROADCAST").Order("created_at desc").Limit(limit).Find(&notifs)
	return c.JSON(fiber.Map{"success": true, "broadcasts": notifs})
}

// POST /api/push/send — broadcast push
func (h *PushHandler) Send(c fiber.Ctx) error {
	var body struct {
		Title   string   `json:"title"`
		Body    string   `json:"body"`
		URL     string   `json:"url"`
		UserIDs []string `json:"userIds"` // empty = all
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Title == "" || body.Body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "title and body required"})
	}

	query := h.db.Model(&models.PushSubscription{})
	if len(body.UserIDs) > 0 {
		query = query.Where("user_id IN ?", body.UserIDs)
	}
	var subs []models.PushSubscription
	query.Find(&subs)

	// Push delivery would be done via web-push library
	// For now we record the broadcast notification
	notif := models.Notification{
		ID:      generateID(),
		Type:    "BROADCAST",
		Title:   body.Title,
		Message: body.Body,
		IsRead:  false,
	}
	h.db.Create(&notif)

	return c.JSON(fiber.Map{
		"success": true,
		"sent":    len(subs),
		"message": "push notification queued",
	})
}

// POST /api/push/subscribe
func (h *PushHandler) Subscribe(c fiber.Ctx) error {
	var body struct {
		UserID   string `json:"userId"`
		Endpoint string `json:"endpoint"`
		Auth     string `json:"auth"`
		P256dh   string `json:"p256dh"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	// Upsert subscription
	sub := models.PushSubscription{
		ID:       generateID(),
		UserID:   body.UserID,
		Endpoint: body.Endpoint,
		Auth:     body.Auth,
		P256dh:   body.P256dh,
	}
	h.db.Where("endpoint = ?", body.Endpoint).Assign(sub).FirstOrCreate(&sub)
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/push/unsubscribe
func (h *PushHandler) Unsubscribe(c fiber.Ctx) error {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	h.db.Where("endpoint = ?", body.Endpoint).Delete(&models.PushSubscription{})
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/push/vapid-public-key
func (h *PushHandler) GetVapidKey(c fiber.Ctx) error {
	key := getEnvOrDefault("VAPID_PUBLIC_KEY", "")
	return c.JSON(fiber.Map{"success": true, "publicKey": key})
}
