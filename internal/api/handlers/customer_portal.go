package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// CustomerPortalHandler handles self-service portal endpoints for customers.
type CustomerPortalHandler struct {
	db *gorm.DB
}

func NewCustomerPortalHandler(db *gorm.DB) *CustomerPortalHandler {
	return &CustomerPortalHandler{db: db}
}

// GetProfile returns the authenticated customer's profile.
func (h *CustomerPortalHandler) GetProfile(c fiber.Ctx) error {
	userID, _ := c.Locals("customerID").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var user models.PppoeUser
	if err := h.db.Preload("Profile").Preload("Area").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}

	// Find active radacct session
	var session models.Radacct
	h.db.Where("username = ? AND acctstoptime IS NULL", user.Username).
		Order("acctstarttime DESC").First(&session)

	return c.JSON(fiber.Map{
		"user":    user,
		"session": session,
	})
}

// GetInvoices returns invoices for the authenticated customer.
func (h *CustomerPortalHandler) GetInvoices(c fiber.Ctx) error {
	userID, _ := c.Locals("customerID").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var invoices []models.Invoice
	h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&invoices)

	return c.JSON(invoices)
}

// PayInvoice initiates payment for customer's invoice.
func (h *CustomerPortalHandler) PayInvoice(c fiber.Ctx) error {
	userID, _ := c.Locals("customerID").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	id := c.Params("id")
	var inv models.Invoice
	if err := h.db.First(&inv, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}

	if inv.PaymentLink != nil {
		return c.JSON(fiber.Map{"paymentLink": *inv.PaymentLink})
	}

	return c.JSON(fiber.Map{"invoice": inv, "message": "payment link not available"})
}

// PushSubscribe stores a Web Push subscription for push notifications.
func (h *CustomerPortalHandler) PushSubscribe(c fiber.Ctx) error {
	userID, _ := c.Locals("customerID").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var body models.PushSubscription
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	sub := models.PushSubscription{
		ID:        time.Now().Format("20060102150405000"),
		UserID:    userID,
		Endpoint:  body.Endpoint,
		P256dh:    body.P256dh,
		Auth:      body.Auth,
	}
	// Upsert by endpoint
	h.db.Where("endpoint = ?", body.Endpoint).Assign(sub).FirstOrCreate(&sub)
	return c.JSON(fiber.Map{"message": "subscribed"})
}
