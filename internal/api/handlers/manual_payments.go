package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"gorm.io/gorm"
)

type ManualPaymentHandler struct {
	db *gorm.DB
}

func NewManualPaymentHandler(db *gorm.DB) *ManualPaymentHandler {
	return &ManualPaymentHandler{db: db}
}

// GET /api/manual-payments
func (h *ManualPaymentHandler) List(c fiber.Ctx) error {
	var payments []models.ManualPayment

	query := h.db.Preload("Invoice").Preload("PppoeUser")

	if userID := c.Query("userId"); userID != "" {
		query = query.Where("pppoeUserId = ?", userID)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var total int64
	h.db.Model(&models.ManualPayment{}).Count(&total)

	query.Order("createdAt DESC").
		Limit(limit).Offset((page - 1) * limit).
		Find(&payments)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    payments,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

// POST /api/manual-payments
func (h *ManualPaymentHandler) Create(c fiber.Ctx) error {
	var body struct {
		InvoiceID    string  `json:"invoiceId"`
		PppoeUserID  string  `json:"pppoeUserId"`
		Amount       float64 `json:"amount"`
		BankName     string  `json:"bankName"`
		AccountName  string  `json:"accountName"`
		TransferDate string  `json:"transferDate"`
		ProofImage   *string `json:"proofImage"`
		Notes        *string `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid request body"})
	}
	if body.InvoiceID == "" || body.PppoeUserID == "" || body.Amount == 0 ||
		body.BankName == "" || body.AccountName == "" || body.TransferDate == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Missing required fields"})
	}

	// Check invoice exists and not paid
	var invoice models.Invoice
	if err := h.db.First(&invoice, "id = ?", body.InvoiceID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Invoice not found"})
	}
	if invoice.Status == models.InvoicePaid {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invoice already paid"})
	}

	// Check pppoe user exists
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", body.PppoeUserID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "User not found"})
	}

	// Check duplicate pending payment for same invoice
	var existing models.ManualPayment
	if err := h.db.Where("invoiceId = ? AND status = 'PENDING'", body.InvoiceID).First(&existing).Error; err == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "A pending payment already exists for this invoice"})
	}

	transferDate, err := time.Parse("2006-01-02", body.TransferDate)
	if err != nil {
		transferDate = time.Now()
	}

	payment := models.ManualPayment{
		ID:           uuid.New().String(),
		InvoiceID:    body.InvoiceID,
		PppoeUserID:  body.PppoeUserID,
		Amount:       body.Amount,
		BankName:     body.BankName,
		AccountName:  body.AccountName,
		TransferDate: transferDate,
		ProofImage:   body.ProofImage,
		Notes:        body.Notes,
		Status:       "PENDING",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := h.db.Create(&payment).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Failed to create payment"})
	}

	return c.Status(201).JSON(fiber.Map{"success": true, "data": payment})
}

// PUT /api/manual-payments/:id  — approve or reject
func (h *ManualPaymentHandler) Review(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Action      string  `json:"action"` // "approve" or "reject"
		ReviewNotes *string `json:"reviewNotes"`
		ReviewedBy  string  `json:"reviewedBy"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid request body"})
	}
	if body.Action != "approve" && body.Action != "reject" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Action must be 'approve' or 'reject'"})
	}

	var payment models.ManualPayment
	if err := h.db.Preload("Invoice").Preload("PppoeUser.Profile").
		First(&payment, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Payment not found"})
	}
	if payment.Status != "PENDING" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Payment already processed"})
	}

	now := time.Now()
	newStatus := "REJECTED"
	if body.Action == "approve" {
		newStatus = "APPROVED"
	}

	reviewer := body.ReviewedBy
	if reviewer == "" {
		reviewer = "admin"
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		// Update payment status
		if err := tx.Model(&payment).Updates(map[string]interface{}{
			"status":      newStatus,
			"reviewedBy":  reviewer,
			"reviewedAt":  now,
			"reviewNotes": body.ReviewNotes,
			"updatedAt":   now,
		}).Error; err != nil {
			return err
		}

		if body.Action != "approve" {
			return nil
		}

		// Mark invoice as paid
		if err := tx.Model(&models.Invoice{}).Where("id = ?", payment.InvoiceID).
			Updates(map[string]interface{}{
				"status":    string(models.InvoicePaid),
				"paidAt":    now,
				"updatedAt": now,
			}).Error; err != nil {
			return err
		}

		// Extend user expiry based on subscription type & profile
		if payment.PppoeUser != nil && payment.PppoeUser.Profile.ID != "" {
			profile := payment.PppoeUser.Profile
			var newExpiry time.Time

			if payment.PppoeUser.SubscriptionType == models.Postpaid {
				base := time.Now()
				if payment.PppoeUser.ExpiredAt != nil {
					base = *payment.PppoeUser.ExpiredAt
				}
				if profile.ValidityUnit == "MONTHS" {
					newExpiry = base.AddDate(0, profile.ValidityValue, 0)
				} else {
					newExpiry = base.AddDate(0, 0, profile.ValidityValue)
				}
			} else {
				// PREPAID: from now
				if profile.ValidityUnit == "MONTHS" {
					newExpiry = now.AddDate(0, profile.ValidityValue, 0)
				} else {
					newExpiry = now.AddDate(0, 0, profile.ValidityValue)
				}
			}

			if err := tx.Model(&models.PppoeUser{}).Where("id = ?", payment.PppoeUserID).
				Updates(map[string]interface{}{
					"expiredAt":       newExpiry,
					"lastPaymentDate": now,
					"status":          "active",
					"updatedAt":       now,
				}).Error; err != nil {
				return err
			}
		}

		// Create keuangan transaction record
		var category models.TransactionCategory
		if err := tx.Where("name = ? AND type = 'INCOME'", "Pembayaran PPPoE").First(&category).Error; err != nil {
			// Create category if not exists
		category = models.TransactionCategory{
				ID:   uuid.New().String(),
				Name: "Pembayaran PPPoE",
				Type: "INCOME",
		}
			tx.Create(&category)
		}

		invoiceNum := ""
		if payment.Invoice != nil {
			invoiceNum = payment.Invoice.InvoiceNumber
		}
		userName := ""
		if payment.PppoeUser != nil {
			userName = payment.PppoeUser.Name
		}

		ref := invoiceNum
		tx.Create(&models.Transaction{
			ID:          uuid.New().String(),
			CategoryID:  category.ID,
			Type:        "INCOME",
			Amount:      int(payment.Amount),
			Description: "Pembayaran PPPoE - " + userName,
			Date:        now,
			Reference:   &ref,
			CreatedBy:   &reviewer,
			UpdatedAt:   now,
		})

		return nil
	}); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Failed to process payment"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Payment " + newStatus,
	})
}

// DELETE /api/manual-payments/:id
func (h *ManualPaymentHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	var payment models.ManualPayment
	if err := h.db.First(&payment, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Payment not found"})
	}
	if payment.Status != "PENDING" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Only pending payments can be deleted"})
	}
	h.db.Delete(&payment)
	return c.JSON(fiber.Map{"success": true, "message": "Payment deleted"})
}
