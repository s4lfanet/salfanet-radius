package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// AgentHandler handles agent management endpoints.
type AgentHandler struct {
	db *gorm.DB
}

func NewAgentHandler(db *gorm.DB) *AgentHandler { return &AgentHandler{db: db} }

func (h *AgentHandler) ListAgents(c fiber.Ctx) error {
	var agents []models.Agent
	h.db.Order("name").Find(&agents)
	return c.JSON(agents)
}

func (h *AgentHandler) CreateAgent(c fiber.Ctx) error {
	var body models.Agent
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *AgentHandler) GetAgent(c fiber.Ctx) error {
	id := c.Params("id")
	var agent models.Agent
	if err := h.db.First(&agent, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(agent)
}

func (h *AgentHandler) UpdateAgent(c fiber.Ctx) error {
	id := c.Params("id")
	var agent models.Agent
	if err := h.db.First(&agent, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&agent); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&agent)
	return c.JSON(agent)
}

func (h *AgentHandler) DeleteAgent(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.Agent{}, "id = ?", id)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *AgentHandler) GetAgentSales(c fiber.Ctx) error {
	id := c.Params("id")
	var sales []models.AgentSale
	h.db.Preload("Voucher.Profile").Where("agent_id = ?", id).Order("created_at DESC").Limit(200).Find(&sales)
	return c.JSON(sales)
}

func (h *AgentHandler) GetAgentDeposits(c fiber.Ctx) error {
	id := c.Params("id")
	var deposits []models.AgentDeposit
	h.db.Where("agent_id = ?", id).Order("created_at DESC").Limit(200).Find(&deposits)
	return c.JSON(deposits)
}

func (h *AgentHandler) TopupBalance(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Amount int    `json:"amount"`
		Notes  string `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.db.Model(&models.Agent{}).Where("id = ?", id).
		UpdateColumn("balance", gorm.Expr("balance + ?", body.Amount)).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	notes := body.Notes
	deposit := models.AgentDeposit{
		ID:      uuid.New().String(),
		AgentID: id,
		Amount:  body.Amount,
		Notes:   &notes,
	}
	h.db.Create(&deposit)

	return c.JSON(fiber.Map{"message": "balance updated"})
}

func (h *AgentHandler) ListAgentVouchers(c fiber.Ctx) error {
	id := c.Params("id")
	var vouchers []models.HotspotVoucher
	h.db.Preload("Profile").Where("agent_id = ?", id).Order("created_at DESC").Find(&vouchers)
	return c.JSON(vouchers)
}
