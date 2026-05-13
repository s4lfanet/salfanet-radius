package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type VoucherTemplateHandler struct{ db *gorm.DB }

func NewVoucherTemplateHandler(db *gorm.DB) *VoucherTemplateHandler {
	return &VoucherTemplateHandler{db: db}
}

// GET /api/voucher-templates
func (h *VoucherTemplateHandler) List(c fiber.Ctx) error {
	var templates []models.VoucherTemplate
	h.db.Order("created_at desc").Find(&templates)
	return c.JSON(fiber.Map{"success": true, "templates": templates})
}

// POST /api/voucher-templates
func (h *VoucherTemplateHandler) Create(c fiber.Ctx) error {
	var body struct {
		Name         string `json:"name"`
		HtmlTemplate string `json:"htmlTemplate"`
		IsDefault    *bool  `json:"isDefault"`
		IsActive     *bool  `json:"isActive"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name required"})
	}
	isDefault := false
	isActive := true
	if body.IsDefault != nil {
		isDefault = *body.IsDefault
	}
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	if isDefault {
		h.db.Model(&models.VoucherTemplate{}).Where("is_default = ?", true).Update("is_default", false)
	}
	tpl := models.VoucherTemplate{
		ID:           generateID(),
		Name:         body.Name,
		HtmlTemplate: body.HtmlTemplate,
		IsDefault:    isDefault,
		IsActive:     isActive,
	}
	if err := h.db.Create(&tpl).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create failed"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "template": tpl})
}

// GET /api/voucher-templates/:id
func (h *VoucherTemplateHandler) Get(c fiber.Ctx) error {
	id := c.Params("id")
	var tpl models.VoucherTemplate
	if err := h.db.Where("id = ?", id).First(&tpl).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "template not found"})
	}
	return c.JSON(fiber.Map{"success": true, "template": tpl})
}

// PUT /api/voucher-templates/:id
func (h *VoucherTemplateHandler) Update(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if isDefault, ok := body["isDefault"].(bool); ok && isDefault {
		h.db.Model(&models.VoucherTemplate{}).Where("is_default = ? AND id != ?", true, id).Update("is_default", false)
	}
	delete(body, "id")
	h.db.Model(&models.VoucherTemplate{}).Where("id = ?", id).Updates(body)
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/voucher-templates/:id
func (h *VoucherTemplateHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.VoucherTemplate{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}
