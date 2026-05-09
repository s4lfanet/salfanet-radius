package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/cron"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// CronHandler handles cron history and manual trigger endpoints.
type CronHandler struct {
	db        *gorm.DB
	scheduler *cron.Scheduler
}

func NewCronHandler(db *gorm.DB, scheduler *cron.Scheduler) *CronHandler {
	return &CronHandler{db: db, scheduler: scheduler}
}

func (h *CronHandler) ListHistory(c fiber.Ctx) error {
	var history []models.CronHistory
	page, pageSize := pageParams(c)
	h.db.Order("started_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&history)
	return c.JSON(history)
}

func (h *CronHandler) TriggerJob(c fiber.Ctx) error {
	job := c.Params("job")
	if err := h.scheduler.TriggerJob(job); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "triggered", "job": job})
}
