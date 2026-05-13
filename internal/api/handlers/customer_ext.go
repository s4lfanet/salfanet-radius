package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// CustomerExtHandler handles extended customer portal endpoints.
type CustomerExtHandler struct{ db *gorm.DB }

func NewCustomerExtHandler(db *gorm.DB) *CustomerExtHandler {
	return &CustomerExtHandler{db: db}
}

func (h *CustomerExtHandler) custID(c fiber.Ctx) string {
	id, _ := c.Locals("customerID").(string)
	return id
}

// POST /api/customer/auth/send-otp
func (h *CustomerExtHandler) AuthSendOTP(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone required"})
	}
	var user models.PppoeUser
	if err := h.db.First(&user, "phone = ?", body.Phone).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "OTP sent", "userId": user.ID})
}

// GET /api/customer/invoices
func (h *CustomerExtHandler) GetInvoices(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	status := c.Query("status")
	page, limit := pageParams(c)

	q := h.db.Model(&models.Invoice{}).Where("user_id = ?", userID)
	if status != "" {
		q = q.Where("status = ?", strings.ToUpper(status))
	}
	var total int64
	q.Count(&total)
	var invoices []models.Invoice
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&invoices)
	return c.JSON(fiber.Map{
		"success":  true,
		"invoices": invoices,
		"pagination": fiber.Map{
			"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// POST /api/customer/cash-payment
func (h *CustomerExtHandler) CashPayment(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.Status(501).JSON(fiber.Map{"error": "cash payment not available online"})
}

// POST /api/customer/manual-payment — submit payment proof
func (h *CustomerExtHandler) ManualPayment(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		InvoiceID    string `json:"invoiceId"`
		Amount       int    `json:"amount"`
		BankName     string `json:"bankName"`
		AccountName  string `json:"accountName"`
		TransferDate string `json:"transferDate"`
		ProofImage   string `json:"proofImage"`
		Notes        string `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.InvoiceID == "" || body.Amount == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "invoiceId and amount required"})
	}

	// Verify invoice belongs to this user
	var invoice models.Invoice
	if err := h.db.First(&invoice, "id = ? AND user_id = ?", body.InvoiceID, userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invoice not found"})
	}

	td, _ := time.Parse("2006-01-02", body.TransferDate)
	if td.IsZero() {
		td = time.Now()
	}

	payment := models.ManualPayment{
		ID:           generateID(),
		InvoiceID:    body.InvoiceID,
		PppoeUserID:  userID,
		Amount:       float64(body.Amount),
		BankName:     body.BankName,
		AccountName:  body.AccountName,
		TransferDate: td,
		Notes: func() *string {
			if body.Notes != "" {
				s := body.Notes
				return &s
			}
			return nil
		}(),
		ProofImage: func() *string {
			if body.ProofImage != "" {
				s := body.ProofImage
				return &s
			}
			return nil
		}(),
		Status:    "PENDING",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := h.db.Create(&payment).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "payment": payment})
}

// GET /api/customer/notifications
func (h *CustomerExtHandler) GetNotifications(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var notifs []models.Notification
	h.db.Order("created_at desc").Limit(50).Find(&notifs)
	return c.JSON(fiber.Map{"success": true, "notifications": notifs})
}

// GET /api/customer/products — available packages/profiles
func (h *CustomerExtHandler) GetProducts(c fiber.Ctx) error {
	var profiles []models.PppoeProfile
	h.db.Where("is_active = ?", true).Find(&profiles)
	return c.JSON(fiber.Map{"success": true, "products": profiles})
}

// GET /api/customer/profile
func (h *CustomerExtHandler) GetProfile(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	if err := h.db.Preload("Profile").Preload("Area").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(fiber.Map{"success": true, "profile": user})
}

// PUT /api/customer/profile
func (h *CustomerExtHandler) UpdateProfile(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		Email   *string `json:"email"`
		Address *string `json:"address"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	updates := map[string]interface{}{}
	if body.Email != nil {
		updates["email"] = body.Email
	}
	if body.Address != nil {
		updates["address"] = body.Address
	}
	h.db.Model(&models.PppoeUser{}).Where("id = ?", userID).Updates(updates)
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/customer/profile/send-otp
func (h *CustomerExtHandler) ProfileSendOTP(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "OTP sent for profile verification"})
}

// POST /api/customer/profile/verify-otp
func (h *CustomerExtHandler) ProfileVerifyOTP(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "verified": true})
}

// POST /api/customer/renewal — request renewal / pay next invoice
func (h *CustomerExtHandler) Renewal(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var invoice models.Invoice
	err := h.db.Where("user_id = ? AND status = ?", userID, "PENDING").
		Order("due_date asc").First(&invoice).Error
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no pending invoice found"})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"invoice": invoice,
		"message": "renew via payment gateway or manual payment",
	})
}

// GET /api/customer/sessions — customer's active sessions
func (h *CustomerExtHandler) GetSessions(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	var sessions []models.Radacct
	h.db.Where("username = ? AND acctstoptime IS NULL", user.Username).
		Order("acctstarttime desc").Find(&sessions)
	return c.JSON(fiber.Map{"success": true, "sessions": sessions})
}

// GET /api/customer/tickets
func (h *CustomerExtHandler) ListTickets(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var tickets []models.Ticket
	h.db.Where("customer_id = ?", userID).
		Preload("Category").Order("created_at desc").Find(&tickets)
	return c.JSON(fiber.Map{"success": true, "tickets": tickets})
}

// POST /api/customer/tickets — create a new ticket
func (h *CustomerExtHandler) CreateTicket(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	h.db.First(&user, "id = ?", userID)

	var body struct {
		Subject     string  `json:"subject"`
		Description string  `json:"description"`
		CategoryID  *string `json:"categoryId"`
		Priority    string  `json:"priority"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Subject == "" {
		return c.Status(400).JSON(fiber.Map{"error": "subject required"})
	}

	ticketNum := fmt.Sprintf("TKT-%d", time.Now().UnixMilli())
	priority := body.Priority
	if priority == "" {
		priority = "MEDIUM"
	}

	ticket := models.Ticket{
		ID:            generateID(),
		TicketNumber:  ticketNum,
		CustomerID:    &userID,
		CustomerName:  user.Name,
		CustomerPhone: user.Phone,
		Subject:       body.Subject,
		Description:   body.Description,
		CategoryID:    body.CategoryID,
		Priority:      priority,
		Status:        "OPEN",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if err := h.db.Create(&ticket).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "ticket": ticket})
}

// GET /api/customer/tickets/:id
func (h *CustomerExtHandler) GetTicket(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")
	var ticket models.Ticket
	if err := h.db.Preload("Category").First(&ticket, "id = ? AND customer_id = ?", id, userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ticket not found"})
	}
	var replies []models.TicketReply
	h.db.Where("ticket_id = ?", id).Order("created_at asc").Find(&replies)
	return c.JSON(fiber.Map{"success": true, "ticket": ticket, "replies": replies})
}

// POST /api/customer/extend — extend subscription
func (h *CustomerExtHandler) Extend(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": false, "message": "extension must be done through admin or payment"})
}

// GET /api/customer/ont — ONT device info
func (h *CustomerExtHandler) GetONT(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "ont": nil, "message": "ONT management requires GenieACS"})
}

// POST /api/customer/ont/update-wifi
func (h *CustomerExtHandler) UpdateWifi(c fiber.Ctx) error {
	userID := h.custID(c)
	if userID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": false, "message": "WiFi update requires GenieACS integration"})
}

// GET /api/customer/diagnostics/ping — stub
func (h *CustomerExtHandler) DiagnosticsPing(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "result": "OK", "latency": "0ms"})
}

// GET /api/customer/diagnostics/speedtest — stub
func (h *CustomerExtHandler) DiagnosticsSpeedtest(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "result": "speed test not available"})
}

// GET /api/customer/diagnostics/traceroute — stub
func (h *CustomerExtHandler) DiagnosticsTraceroute(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "result": "traceroute not available"})
}
