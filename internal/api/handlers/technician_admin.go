package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type TechnicianAdminHandler struct{ db *gorm.DB }

func NewTechnicianAdminHandler(db *gorm.DB) *TechnicianAdminHandler {
	return &TechnicianAdminHandler{db: db}
}

// GET /api/admin/technicians
func (h *TechnicianAdminHandler) List(c fiber.Ctx) error {
	search := c.Query("search")
	isActiveQ := c.Query("isActive")

	query := h.db.Model(&models.Technician{}).Order("created_at desc")
	if search != "" {
		query = query.Where("name LIKE ? OR phone_number LIKE ? OR email LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	if isActiveQ != "" {
		query = query.Where("is_active = ?", isActiveQ == "true")
	}

	var technicians []models.Technician
	query.Find(&technicians)
	return c.JSON(fiber.Map{"success": true, "technicians": technicians})
}

// POST /api/admin/technicians
func (h *TechnicianAdminHandler) Create(c fiber.Ctx) error {
	var body struct {
		Name        string  `json:"name"`
		PhoneNumber string  `json:"phoneNumber"`
		Email       *string `json:"email"`
		IsActive    *bool   `json:"isActive"`
		RequireOtp  *bool   `json:"requireOtp"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.PhoneNumber == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name and phoneNumber required"})
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	requireOtp := true
	if body.RequireOtp != nil {
		requireOtp = *body.RequireOtp
	}
	tech := models.Technician{
		ID:          generateID(),
		Name:        body.Name,
		PhoneNumber: body.PhoneNumber,
		Email:       body.Email,
		IsActive:    isActive,
		RequireOtp:  requireOtp,
	}
	if err := h.db.Create(&tech).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "phone number already exists"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "technician": tech})
}

// GET /api/admin/technicians/:id
func (h *TechnicianAdminHandler) Get(c fiber.Ctx) error {
	id := c.Params("id")
	var tech models.Technician
	if err := h.db.Where("id = ?", id).First(&tech).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "technician not found"})
	}
	return c.JSON(fiber.Map{"success": true, "technician": tech})
}

// PUT /api/admin/technicians/:id
func (h *TechnicianAdminHandler) Update(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	if err := h.db.Model(&models.Technician{}).Where("id = ?", id).Updates(body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update failed"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/admin/technicians/:id
func (h *TechnicianAdminHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.Technician{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}
