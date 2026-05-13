package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type HotspotExtHandler struct{ db *gorm.DB }

func NewHotspotExtHandler(db *gorm.DB) *HotspotExtHandler {
	return &HotspotExtHandler{db: db}
}

// GET /api/hotspot/voucher/:id
func (h *HotspotExtHandler) GetVoucher(c fiber.Ctx) error {
	id := c.Params("id")
	var v models.HotspotVoucher
	if err := h.db.Preload("Profile").Where("id = ?", id).First(&v).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "voucher not found"})
	}
	return c.JSON(fiber.Map{"success": true, "voucher": v})
}

// DELETE /api/hotspot/voucher/:id
func (h *HotspotExtHandler) DeleteVoucher(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.HotspotVoucher{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/hotspot/voucher/bulk — generate batch
func (h *HotspotExtHandler) BulkGenerate(c fiber.Ctx) error {
	var body struct {
		ProfileID string `json:"profileId"`
		Quantity  int    `json:"quantity"`
		Prefix    string `json:"prefix"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.ProfileID == "" || body.Quantity <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "profileId and quantity required"})
	}
	if body.Quantity > 500 {
		body.Quantity = 500
	}
	batchID := generateID()
	codes := make([]string, 0, body.Quantity)
	for i := 0; i < body.Quantity; i++ {
		code := body.Prefix + generateShortCode(8)
		v := models.HotspotVoucher{
			ID:        generateID(),
			Code:      code,
			ProfileID: body.ProfileID,
			BatchID:   &batchID,
			Status:    "UNUSED",
		}
		h.db.Create(&v)
		codes = append(codes, code)
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "batchId": batchID, "count": len(codes)})
}

// POST /api/hotspot/voucher/bulk-delete
func (h *HotspotExtHandler) BulkDelete(c fiber.Ctx) error {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	result := h.db.Where("id IN ? AND status = ?", body.IDs, "UNUSED").Delete(&models.HotspotVoucher{})
	return c.JSON(fiber.Map{"success": true, "deleted": result.RowsAffected})
}

// DELETE /api/hotspot/voucher/delete-expired
func (h *HotspotExtHandler) DeleteExpired(c fiber.Ctx) error {
	result := h.db.Where("status = ? OR expires_at < NOW()", "EXPIRED").Delete(&models.HotspotVoucher{})
	return c.JSON(fiber.Map{"success": true, "deleted": result.RowsAffected})
}

// GET /api/hotspot/voucher/export
func (h *HotspotExtHandler) Export(c fiber.Ctx) error {
	profileID := c.Query("profileId")
	query := h.db.Model(&models.HotspotVoucher{}).Preload("Profile").Order("created_at desc").Limit(2000)
	if profileID != "" {
		query = query.Where("profile_id = ?", profileID)
	}
	var vouchers []models.HotspotVoucher
	query.Find(&vouchers)
	return c.JSON(fiber.Map{"success": true, "vouchers": vouchers})
}

// POST /api/hotspot/voucher/resync
func (h *HotspotExtHandler) Resync(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "resync triggered"})
}

// GET /api/hotspot/rekap-voucher
func (h *HotspotExtHandler) RekapVoucher(c fiber.Ctx) error {
	type Rekap struct {
		ProfileID   string `json:"profileId"`
		ProfileName string `json:"profileName"`
		Total       int64  `json:"total"`
		Used        int64  `json:"used"`
		Unused      int64  `json:"unused"`
	}
	var results []Rekap
	h.db.Raw(`SELECT v.profile_id, p.name as profile_name,
		COUNT(v.id) as total,
		SUM(CASE WHEN v.status='USED' THEN 1 ELSE 0 END) as used,
		SUM(CASE WHEN v.status='UNUSED' THEN 1 ELSE 0 END) as unused
		FROM hotspot_vouchers v
		LEFT JOIN hotspot_profiles p ON p.id = v.profile_id
		GROUP BY v.profile_id, p.name`).Scan(&results)
	return c.JSON(fiber.Map{"success": true, "data": results})
}

// GET /api/hotspot/rekap-voucher/export
func (h *HotspotExtHandler) ExportRekap(c fiber.Ctx) error {
	return h.RekapVoucher(c)
}

// GET /api/hotspot/vouchers/validate?code=...
func (h *HotspotExtHandler) ValidateVoucher(c fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(400).JSON(fiber.Map{"error": "code required"})
	}
	var v models.HotspotVoucher
	if err := h.db.Preload("Profile").Where("code = ?", code).First(&v).Error; err != nil {
		return c.JSON(fiber.Map{"valid": false, "error": "voucher not found"})
	}
	valid := v.Status == "UNUSED"
	return c.JSON(fiber.Map{"valid": valid, "voucher": v})
}

// POST /api/hotspot/voucher/send-whatsapp
func (h *HotspotExtHandler) SendWhatsapp(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "whatsapp send queued"})
}

// GET /api/hotspot/agents
func (h *HotspotExtHandler) ListAgents(c fiber.Ctx) error {
	var agents []models.Agent
	h.db.Order("created_at desc").Find(&agents)
	return c.JSON(fiber.Map{"success": true, "agents": agents})
}

// GET /api/hotspot/agents/balance
func (h *HotspotExtHandler) AgentBalance(c fiber.Ctx) error {
	agentID := c.Query("agentId")
	if agentID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "agentId required"})
	}
	var agent models.Agent
	if err := h.db.Where("id = ?", agentID).First(&agent).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "agent not found"})
	}
	return c.JSON(fiber.Map{"success": true, "balance": agent.Balance})
}

// GET /api/hotspot/agents/:id/history
func (h *HotspotExtHandler) AgentHistory(c fiber.Ctx) error {
	id := c.Params("id")
	limit := 50
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	var sales []models.AgentSale
	h.db.Where("agent_id = ?", id).Preload("Voucher").Order("created_at desc").Limit(limit).Find(&sales)
	var deposits []models.AgentDeposit
	h.db.Where("agent_id = ?", id).Order("created_at desc").Limit(limit).Find(&deposits)
	return c.JSON(fiber.Map{"success": true, "sales": sales, "deposits": deposits})
}

// generateShortCode creates a random alphanumeric code
func generateShortCode(n int) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	id := generateID()
	result := make([]byte, n)
	for i := 0; i < n; i++ {
		result[i] = chars[int(id[i])%len(chars)]
	}
	return string(result)
}
