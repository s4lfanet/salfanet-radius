package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// CompanyHandler handles company settings endpoints.
type CompanyHandler struct {
	db *gorm.DB
}

func NewCompanyHandler(db *gorm.DB) *CompanyHandler { return &CompanyHandler{db: db} }

func (h *CompanyHandler) GetCompany(c fiber.Ctx) error {
	var company models.Company
	if err := h.db.First(&company).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "company not configured"})
	}
	return c.JSON(company)
}

func (h *CompanyHandler) UpdateCompany(c fiber.Ctx) error {
	var company models.Company
	h.db.First(&company)

	if err := c.Bind().JSON(&company); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if company.ID == "" {
		h.db.Create(&company)
	} else {
		h.db.Save(&company)
	}
	return c.JSON(company)
}
