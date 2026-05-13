package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type PublicHandler struct{ db *gorm.DB }

func NewPublicHandler(db *gorm.DB) *PublicHandler { return &PublicHandler{db: db} }

// GET /api/public/company
func (h *PublicHandler) GetCompany(c fiber.Ctx) error {
	var company models.Company
	if err := h.db.First(&company).Error; err != nil {
		return c.JSON(fiber.Map{"success": true, "company": fiber.Map{
			"name":      "SALFANET RADIUS",
			"logo":      nil,
			"phone":     nil,
			"poweredBy": "SALFANET RADIUS",
		}})
	}
	return c.JSON(fiber.Map{"success": true, "company": fiber.Map{
		"name":      company.Name,
		"logo":      company.Logo,
		"phone":     company.Phone,
		"poweredBy": company.PoweredBy,
	}})
}

// GET /api/public/areas
func (h *PublicHandler) GetAreas(c fiber.Ctx) error {
	var areas []models.PppoeArea
	h.db.Where("is_active = ?", true).Find(&areas)
	return c.JSON(fiber.Map{"success": true, "areas": areas})
}

// GET /api/public/profiles
func (h *PublicHandler) GetProfiles(c fiber.Ctx) error {
	var profiles []models.PppoeProfile
	h.db.Where("is_active = ?", true).Find(&profiles)
	return c.JSON(fiber.Map{"success": true, "profiles": profiles})
}

// GET /api/public/stats
func (h *PublicHandler) GetStats(c fiber.Ctx) error {
	var totalCustomers, activeCustomers int64
	h.db.Model(&models.PppoeUser{}).Count(&totalCustomers)
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "active").Count(&activeCustomers)
	return c.JSON(fiber.Map{
		"success":         true,
		"totalCustomers":  totalCustomers,
		"activeCustomers": activeCustomers,
	})
}

// GET /api/public/payment-gateways
func (h *PublicHandler) GetPaymentGateways(c fiber.Ctx) error {
	var gateways []models.PaymentGateway
	h.db.Where("is_active = ?", true).Select("id,provider,is_active,is_production,client_key,merchant_code,base_url").Find(&gateways)
	return c.JSON(fiber.Map{"success": true, "gateways": gateways})
}

// POST /api/public/upload-registration
func (h *PublicHandler) UploadRegistration(c fiber.Ctx) error {
	var body struct {
		Name      string  `json:"name"`
		Phone     string  `json:"phone"`
		Address   string  `json:"address"`
		AreaID    *string `json:"areaId"`
		ProfileID *string `json:"profileId"`
		Notes     *string `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name and phone are required"})
	}

	id := generateID()
	reg := models.RegistrationRequest{
		ID:        id,
		Name:      body.Name,
		Phone:     body.Phone,
		AreaID:    body.AreaID,
		ProfileID: body.ProfileID,
		Notes:     body.Notes,
		Status:    "PENDING",
	}
	if body.Address != "" {
		reg.Address = &body.Address
	}
	if err := h.db.Create(&reg).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to submit registration"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "message": "Registration submitted", "id": id})
}
