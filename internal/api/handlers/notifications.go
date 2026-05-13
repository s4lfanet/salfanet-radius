package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type NotificationHandler struct{ db *gorm.DB }

func NewNotificationHandler(db *gorm.DB) *NotificationHandler {
	return &NotificationHandler{db: db}
}

// GET /api/notifications
func (h *NotificationHandler) List(c fiber.Ctx) error {
	unreadOnly := c.Query("unreadOnly") == "true"
	notifType := c.Query("type")
	limit := 10
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	sinceParam := c.Query("since")

	query := h.db.Model(&models.Notification{}).Order("created_at desc")
	if unreadOnly {
		query = query.Where("is_read = ?", false)
	}
	if notifType != "" {
		query = query.Where("type = ?", notifType)
	}
	if sinceParam != "" {
		query = query.Where("created_at >= ?", sinceParam)
	}

	var notifications []models.Notification
	query.Limit(limit).Find(&notifications)

	var unreadCount int64
	h.db.Model(&models.Notification{}).Where("is_read = ?", false).Count(&unreadCount)

	return c.JSON(fiber.Map{
		"success":       true,
		"notifications": notifications,
		"unreadCount":   unreadCount,
	})
}

// PUT /api/notifications — mark as read
func (h *NotificationHandler) MarkRead(c fiber.Ctx) error {
	var body struct {
		NotificationIDs []string `json:"notificationIds"`
		MarkAll         bool     `json:"markAll"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.MarkAll {
		h.db.Model(&models.Notification{}).Where("is_read = ?", false).Update("is_read", true)
	} else if len(body.NotificationIDs) > 0 {
		h.db.Model(&models.Notification{}).Where("id IN ?", body.NotificationIDs).Update("is_read", true)
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/notifications/:id
func (h *NotificationHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "id required"})
	}
	h.db.Delete(&models.Notification{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}
