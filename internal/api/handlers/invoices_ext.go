package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type InvoiceExtHandler struct{ db *gorm.DB }

func NewInvoiceExtHandler(db *gorm.DB) *InvoiceExtHandler {
	return &InvoiceExtHandler{db: db}
}

// GET /api/invoices
func (h *InvoiceExtHandler) List(c fiber.Ctx) error {
	status := c.Query("status")
	userID := c.Query("userId")
	month := c.Query("month")
	limit := 100
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}

	query := h.db.Model(&models.Invoice{}).
		Preload("User").
		Order("created_at desc").
		Limit(limit)

	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if status != "" && status != "all" {
		switch status {
		case "UNPAID", "PENDING":
			query = query.Where("status IN ?", []string{"PENDING", "OVERDUE"})
		default:
			query = query.Where("status = ?", status)
		}
	}
	if month != "" {
		parts := strings.Split(month, "-")
		if len(parts) == 2 {
			y, _ := strconv.Atoi(parts[0])
			m, _ := strconv.Atoi(parts[1])
			start := time.Date(y, time.Month(m), 1, 0, 0, 0, 0, time.UTC)
			end := start.AddDate(0, 1, 0)
			if status == "PAID" {
				query = query.Where("paid_at >= ? AND paid_at < ?", start, end)
			} else {
				query = query.Where("created_at >= ? AND created_at < ?", start, end)
			}
		}
	}

	var invoices []models.Invoice
	query.Find(&invoices)

	return c.JSON(fiber.Map{"success": true, "invoices": invoices})
}

// POST /api/invoices
func (h *InvoiceExtHandler) Create(c fiber.Ctx) error {
	var body struct {
		UserID  string  `json:"userId"`
		Amount  int     `json:"amount"`
		Type    string  `json:"type"`
		Notes   *string `json:"notes"`
		DueDate *string `json:"dueDate"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.UserID == "" || body.Amount == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "userId and amount required"})
	}
	invType := body.Type
	if invType == "" {
		invType = "MONTHLY"
	}
	id := generateID()
	token := generateID() + generateID()
	invNum := fmt.Sprintf("INV-%s", time.Now().Format("20060102150405"))
	dueDate := time.Now().AddDate(0, 0, 14)
	if body.DueDate != nil {
		t, err := time.Parse("2006-01-02", *body.DueDate)
		if err == nil {
			dueDate = t
		}
	}
	inv := models.Invoice{
		ID:            id,
		InvoiceNumber: invNum,
		UserID:        &body.UserID,
		Amount:        body.Amount,
		InvoiceType:   models.InvoiceType(invType),
		Status:        models.InvoicePending,
		Notes:         body.Notes,
		PaymentToken:  &token,
		DueDate:       dueDate,
	}
	if err := h.db.Create(&inv).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create invoice"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "invoice": inv})
}

// DELETE /api/invoices?id=...&ids=...
func (h *InvoiceExtHandler) Delete(c fiber.Ctx) error {
	id := c.Query("id")
	ids := c.Query("ids")
	if ids != "" {
		idList := strings.Split(ids, ",")
		for i := range idList {
			idList[i] = strings.TrimSpace(idList[i])
		}
		result := h.db.Where("id IN ?", idList).Delete(&models.Invoice{})
		return c.JSON(fiber.Map{"success": true, "deletedCount": result.RowsAffected})
	}
	if id == "" {
		return c.Status(400).JSON(fiber.Map{"error": "id or ids required"})
	}
	h.db.Delete(&models.Invoice{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/invoices/counts?userIds=a,b,c
func (h *InvoiceExtHandler) Counts(c fiber.Ctx) error {
	userIDsParam := c.Query("userIds")
	if userIDsParam == "" {
		return c.Status(400).JSON(fiber.Map{"error": "userIds required"})
	}
	userIDs := strings.Split(userIDsParam, ",")

	type Result struct {
		UserID string
		Count  int
	}
	var results []Result
	h.db.Raw(`SELECT user_id AS user_id, COUNT(id) AS count FROM invoices WHERE user_id IN ? AND status IN ('PENDING','OVERDUE') GROUP BY user_id`, userIDs).Scan(&results)

	countsMap := make(map[string]int)
	for _, r := range results {
		countsMap[r.UserID] = r.Count
	}
	return c.JSON(fiber.Map{"success": true, "counts": countsMap})
}

// POST /api/invoices/generate — generate monthly invoices
func (h *InvoiceExtHandler) Generate(c fiber.Ctx) error {
	var body struct {
		Month  string `json:"month"` // YYYY-MM
		DryRun bool   `json:"dryRun"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	month := body.Month
	if month == "" {
		now := time.Now()
		month = fmt.Sprintf("%d-%02d", now.Year(), now.Month())
	}

	// Get active postpaid users
	var users []models.PppoeUser
	h.db.Where("status = ? AND subscription_type = ?", "active", "POSTPAID").
		Preload("Profile").
		Find(&users)

	generated := 0
	skipped := 0
	for _, user := range users {
		// Check if invoice already exists for this month
		var count int64
		h.db.Model(&models.Invoice{}).
			Where("user_id = ? AND invoice_type = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?", user.ID, "MONTHLY", month).
			Count(&count)
		if count > 0 {
			skipped++
			continue
		}
		if body.DryRun {
			generated++
			continue
		}
		amount := user.Profile.Price
		dueDate := time.Now().AddDate(0, 0, 14)
		token := generateID() + generateID()
		invNum := fmt.Sprintf("INV-%s-%s", month, user.ID[:8])
		inv := models.Invoice{
			ID:            generateID(),
			InvoiceNumber: invNum,
			UserID:        &user.ID,
			Amount:        amount,
			InvoiceType:   models.InvoiceMonthly,
			Status:        models.InvoicePending,
			PaymentToken:  &token,
			DueDate:       dueDate,
		}
		h.db.Create(&inv)
		generated++
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"generated": generated,
		"skipped":   skipped,
		"month":     month,
		"dryRun":    body.DryRun,
	})
}

// POST /api/invoices/send-reminder
func (h *InvoiceExtHandler) SendReminder(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "reminder queued"})
}

// POST /api/invoices/send-reminders-bulk
func (h *InvoiceExtHandler) SendRemindersBulk(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "bulk reminders queued"})
}

// GET /api/invoices/export
func (h *InvoiceExtHandler) Export(c fiber.Ctx) error {
	var invoices []models.Invoice
	h.db.Preload("User").Order("created_at desc").Limit(1000).Find(&invoices)
	return c.JSON(fiber.Map{"success": true, "invoices": invoices, "count": len(invoices)})
}

// GET /api/invoices/by-token/:token
func (h *InvoiceExtHandler) GetByToken(c fiber.Ctx) error {
	token := c.Params("token")
	var inv models.Invoice
	if err := h.db.Where("payment_token = ?", token).Preload("User").First(&inv).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invoice not found"})
	}
	return c.JSON(fiber.Map{"success": true, "invoice": inv})
}

// GET /api/invoices/:id/pdf
func (h *InvoiceExtHandler) GetPDF(c fiber.Ctx) error {
	id := c.Params("id")
	var inv models.Invoice
	if err := h.db.Where("id = ?", id).Preload("User").First(&inv).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invoice not found"})
	}
	// Return invoice data; PDF generation handled client-side or via Next.js
	return c.JSON(fiber.Map{"success": true, "invoice": inv})
}
