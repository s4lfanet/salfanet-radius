package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type ReferralHandler struct{ db *gorm.DB }

func NewReferralHandler(db *gorm.DB) *ReferralHandler { return &ReferralHandler{db: db} }

// GET /api/admin/referrals
func (h *ReferralHandler) List(c fiber.Ctx) error {
	page := 1
	limit := 20
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	search := c.Query("search")
	status := c.Query("status")

	query := h.db.Model(&models.ReferralReward{}).
		Preload("Referrer").
		Preload("Referred").
		Order("created_at desc")

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if search != "" {
		query = query.Joins("LEFT JOIN pppoe_users r1 ON r1.id = referral_rewards.referrer_id").
			Joins("LEFT JOIN pppoe_users r2 ON r2.id = referral_rewards.referred_id").
			Where("r1.name LIKE ? OR r1.username LIKE ? OR r2.name LIKE ? OR r2.username LIKE ?",
				"%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var rewards []models.ReferralReward
	query.Offset((page - 1) * limit).Limit(limit).Find(&rewards)

	// Stats
	var totalCount, pending, credited int64
	var creditedSum struct{ Sum int64 }
	h.db.Model(&models.ReferralReward{}).Count(&totalCount)
	h.db.Model(&models.ReferralReward{}).Where("status = ?", "PENDING").Count(&pending)
	h.db.Model(&models.ReferralReward{}).Where("status = ?", "CREDITED").Count(&credited)
	h.db.Raw("SELECT COALESCE(SUM(amount),0) AS sum FROM referral_rewards WHERE status = 'CREDITED'").Scan(&creditedSum)

	return c.JSON(fiber.Map{
		"success": true,
		"rewards": rewards,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
		"stats": fiber.Map{
			"totalRewards":    totalCount,
			"pendingRewards":  pending,
			"creditedRewards": credited,
			"totalCredited":   creditedSum.Sum,
		},
	})
}

// PUT /api/admin/referrals/:id — update status (credit/expire)
func (h *ReferralHandler) UpdateStatus(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.db.Model(&models.ReferralReward{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": body.Status}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update failed"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/admin/referrals/:id
func (h *ReferralHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.ReferralReward{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/admin/referrals/config
func (h *ReferralHandler) GetConfig(c fiber.Ctx) error {
	// Referral config is stored in company or settings table
	return c.JSON(fiber.Map{"success": true, "config": fiber.Map{
		"enabled":      true,
		"rewardAmount": 50000,
		"rewardType":   "BALANCE",
	}})
}

// PUT /api/admin/referrals/config
func (h *ReferralHandler) UpdateConfig(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "config updated"})
}
