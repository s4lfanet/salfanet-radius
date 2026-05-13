package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type ActivityLogHandler struct{ db *gorm.DB }

func NewActivityLogHandler(db *gorm.DB) *ActivityLogHandler {
	return &ActivityLogHandler{db: db}
}

// GET /api/admin/activity-logs
func (h *ActivityLogHandler) List(c fiber.Ctx) error {
	page := 1
	limit := 50
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	module := c.Query("module")
	status := c.Query("status")
	search := c.Query("search")

	query := h.db.Model(&models.ActivityLog{}).Order("created_at desc")
	if module != "" {
		query = query.Where("module = ?", module)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if search != "" {
		query = query.Where("username LIKE ? OR action LIKE ? OR description LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var logs []models.ActivityLog
	query.Offset((page - 1) * limit).Limit(limit).Find(&logs)

	return c.JSON(fiber.Map{
		"success": true,
		"logs":    logs,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}
