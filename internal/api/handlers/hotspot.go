package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// HotspotHandler handles hotspot profile and voucher endpoints.
type HotspotHandler struct {
	db *gorm.DB
}

func NewHotspotHandler(db *gorm.DB) *HotspotHandler { return &HotspotHandler{db: db} }

// ─── Profiles ────────────────────────────────────────────────────────────────

func (h *HotspotHandler) ListProfiles(c fiber.Ctx) error {
	var profiles []models.HotspotProfile
	h.db.Order("name").Find(&profiles)
	return c.JSON(profiles)
}

func (h *HotspotHandler) CreateProfile(c fiber.Ctx) error {
	var body models.HotspotProfile
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *HotspotHandler) UpdateProfile(c fiber.Ctx) error {
	id := c.Params("id")
	var p models.HotspotProfile
	if err := h.db.First(&p, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&p)
	return c.JSON(p)
}

func (h *HotspotHandler) DeleteProfile(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.HotspotProfile{}, "id = ?", id)
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

func (h *HotspotHandler) ListVouchers(c fiber.Ctx) error {
	var vouchers []models.HotspotVoucher
	query := h.db.Preload("Profile")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if batchID := c.Query("batchId"); batchID != "" {
		query = query.Where("batch_id = ?", batchID)
	}

	var total int64
	query.Model(&models.HotspotVoucher{}).Count(&total)
	page, pageSize := pageParams(c)
	query.Order("created_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&vouchers)

	return c.JSON(fiber.Map{"data": vouchers, "total": total})
}

func (h *HotspotHandler) GenerateVouchers(c fiber.Ctx) error {
	var body struct {
		ProfileID string `json:"profileId"`
		Count     int    `json:"count"`
		AgentID   string `json:"agentId"`
		Prefix    string `json:"prefix"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if body.Count <= 0 || body.Count > 1000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "count must be 1-1000"})
	}

	batchID := uuid.New().String()
	var created []models.HotspotVoucher

	for i := 0; i < body.Count; i++ {
		code := body.Prefix + generateVoucherCode(8)
		v := models.HotspotVoucher{
			ID:        uuid.New().String(),
			Code:      code,
			ProfileID: body.ProfileID,
			BatchID:   &batchID,
			Status:    "UNUSED",
		}
		if body.AgentID != "" {
			v.AgentID = &body.AgentID
		}
		created = append(created, v)
	}

	if err := h.db.Create(&created).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"batchId": batchID,
		"count":   len(created),
	})
}

func (h *HotspotHandler) DeleteVoucher(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.HotspotVoucher{}, "id = ?", id)
	return c.SendStatus(fiber.StatusNoContent)
}

func generateVoucherCode(length int) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, length)
	// Use time-based seed for determinism in single goroutine
	t := time.Now().UnixNano()
	for i := range code {
		code[i] = chars[(t+int64(i)*31337)%int64(len(chars))]
	}
	return fmt.Sprintf("%s", code)
}
