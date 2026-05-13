package handlers

import (
	"fmt"
	"math/rand"
	"sort"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
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

func (h *CustomerPortalHandler) customerID(c fiber.Ctx) string {
	id, _ := c.Locals("customerID").(string)
	return id
}

// GetProfile returns the authenticated customer's profile (legacy endpoint).
func (h *CustomerPortalHandler) GetProfile(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var user models.PppoeUser
	if err := h.db.Preload("Profile").Preload("Area").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}

	var session models.Radacct
	h.db.Where("username = ? AND acctstoptime IS NULL", user.Username).
		Order("acctstarttime DESC").First(&session)

	return c.JSON(fiber.Map{"user": user, "session": session})
}

// GetMe GET /api/customer/me — full profile with package info.
func (h *CustomerPortalHandler) GetMe(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	if err := h.db.Preload("Profile").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(fiber.Map{"success": true, "user": user})
}

// GetDashboard GET /api/customer/dashboard
func (h *CustomerPortalHandler) GetDashboard(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var user models.PppoeUser
	if err := h.db.Preload("Profile").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}

	// Active radacct session
	var radSession models.Radacct
	hasSession := h.db.Where("username = ? AND acctstoptime IS NULL", user.Username).
		Order("acctstarttime DESC").First(&radSession).Error == nil

	// Monthly usage
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var usage struct {
		Upload   int64
		Download int64
	}
	h.db.Model(&models.Radacct{}).
		Select("COALESCE(SUM(acctinputoctets), 0) as upload, COALESCE(SUM(acctoutputoctets), 0) as download").
		Where("username = ? AND acctstarttime >= ?", user.Username, startOfMonth).
		Scan(&usage)

	// Unpaid invoices
	var invStats struct {
		Count int64
		Total int64
	}
	h.db.Model(&models.Invoice{}).
		Where("userId = ? AND status IN ?", userID, []string{"PENDING", "OVERDUE"}).
		Select("COUNT(*) as count, COALESCE(SUM(amount), 0) as total").
		Scan(&invStats)

	var nextDue *time.Time
	var nextInv models.Invoice
	if h.db.Where("userId = ? AND status IN ?", userID, []string{"PENDING", "OVERDUE"}).
		Order("dueDate ASC").First(&nextInv).Error == nil {
		nextDue = &nextInv.DueDate
	}

	sessionData := fiber.Map{"isOnline": hasSession}
	if hasSession {
		sessionData["ipAddress"] = radSession.FramedIPAddress
		sessionData["startTime"] = radSession.AcctStartTime
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"user": fiber.Map{
				"id":           user.ID,
				"customerId":   user.CustomerID,
				"username":     user.Username,
				"name":         user.Name,
				"email":        user.Email,
				"phone":        user.Phone,
				"status":       user.Status,
				"expiredAt":    user.ExpiredAt,
				"balance":      user.Balance,
				"autoRenewal":  user.AutoRenewal,
				"packagePrice": user.Profile.Price,
				"profileName":  user.Profile.Name,
			},
			"session": sessionData,
			"usage": fiber.Map{
				"upload":   usage.Upload,
				"download": usage.Download,
				"total":    usage.Upload + usage.Download,
			},
			"invoice": fiber.Map{
				"unpaidCount": invStats.Count,
				"totalUnpaid": invStats.Total,
				"nextDueDate": nextDue,
			},
		},
	})
}

// GetPackages GET /api/customer/packages — returns customer's current package.
func (h *CustomerPortalHandler) GetPackages(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	if err := h.db.Preload("Profile").First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	packages := []fiber.Map{}
	if user.Profile.ID != "" {
		packages = append(packages, fiber.Map{
			"id":            user.Profile.ID,
			"name":          user.Profile.Name,
			"downloadSpeed": user.Profile.DownloadSpeed,
			"uploadSpeed":   user.Profile.UploadSpeed,
			"price":         user.Profile.Price,
			"description":   user.Profile.Description,
		})
	}
	return c.JSON(fiber.Map{"success": true, "packages": packages})
}

// ToggleAutoRenewal POST /api/customer/auto-renewal
func (h *CustomerPortalHandler) ToggleAutoRenewal(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Model(&models.PppoeUser{}).Where("id = ?", userID).Update("autoRenewal", body.Enabled)
	return c.JSON(fiber.Map{"success": true, "message": "Auto-renewal updated", "autoRenewal": body.Enabled})
}

// GetNotifications GET /api/customer/notifications — assembled event feed.
func (h *CustomerPortalHandler) GetNotifications(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	since := time.Now().AddDate(0, -1, 0)
	if s := c.Query("since"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			since = t
		}
	}

	type Event struct {
		ID        string    `json:"id"`
		Type      string    `json:"type"`
		Title     string    `json:"title"`
		Message   string    `json:"message"`
		Timestamp time.Time `json:"timestamp"`
	}
	var events []Event

	// Paid invoices → payment_success events
	var paidInvoices []models.Invoice
	h.db.Where("userId = ? AND status = ? AND paidAt >= ?", userID, "PAID", since).
		Order("paidAt DESC").Limit(20).Find(&paidInvoices)
	for _, inv := range paidInvoices {
		t := time.Now()
		if inv.PaidAt != nil {
			t = *inv.PaidAt
		}
		events = append(events, Event{
			ID:        "inv-" + inv.ID,
			Type:      "payment_success",
			Title:     "Pembayaran Berhasil",
			Message:   fmt.Sprintf("Invoice %s sebesar Rp %d telah dibayar", inv.InvoiceNumber, inv.Amount),
			Timestamp: t,
		})
	}

	// Admin ticket replies → ticket_reply events
	var tickets []models.Ticket
	h.db.Where("customerId = ?", userID).Select("id").Find(&tickets)
	if len(tickets) > 0 {
		ticketIDs := make([]string, len(tickets))
		for i, t := range tickets {
			ticketIDs[i] = t.ID
		}
		var replies []models.TicketReply
		h.db.Where("ticketId IN ? AND isAdmin = true AND createdAt >= ?", ticketIDs, since).
			Order("createdAt DESC").Limit(10).Find(&replies)
		for _, r := range replies {
			events = append(events, Event{
				ID:        "reply-" + r.ID,
				Type:      "ticket_reply",
				Title:     "Balasan Tiket",
				Message:   r.Message,
				Timestamp: r.CreatedAt,
			})
		}
	}

	sort.Slice(events, func(i, j int) bool {
		return events[i].Timestamp.After(events[j].Timestamp)
	})

	return c.JSON(fiber.Map{"success": true, "events": events})
}

// GetPaymentHistory GET /api/customer/payment-history
func (h *CustomerPortalHandler) GetPaymentHistory(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var invoices []models.Invoice
	h.db.Where("userId = ?", userID).
		Order("createdAt DESC").
		Limit(100).
		Find(&invoices)
	return c.JSON(fiber.Map{"success": true, "invoices": invoices})
}

// GetInvoices GET /api/customer/invoices
func (h *CustomerPortalHandler) GetInvoices(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var invoices []models.Invoice
	h.db.Where("userId = ?", userID).
		Order("createdAt DESC").
		Limit(50).
		Find(&invoices)
	return c.JSON(invoices)
}

// PayInvoice POST /api/customer/invoices/:id/pay
func (h *CustomerPortalHandler) PayInvoice(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")
	var inv models.Invoice
	if err := h.db.First(&inv, "id = ? AND userId = ?", id, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if inv.PaymentLink != nil {
		return c.JSON(fiber.Map{"paymentLink": *inv.PaymentLink})
	}
	return c.JSON(fiber.Map{"invoice": inv, "message": "payment link not available"})
}

// GetUsage GET /api/customer/usage
func (h *CustomerPortalHandler) GetUsage(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	endOfMonth := startOfMonth.AddDate(0, 1, 0)

	var result struct {
		Upload   int64
		Download int64
	}
	h.db.Model(&models.Radacct{}).
		Select("COALESCE(SUM(acctinputoctets), 0) as upload, COALESCE(SUM(acctoutputoctets), 0) as download").
		Where("username = ? AND acctstarttime >= ?", user.Username, startOfMonth).
		Scan(&result)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"upload":   result.Upload,
			"download": result.Download,
			"total":    result.Upload + result.Download,
			"period":   fiber.Map{"start": startOfMonth, "end": endOfMonth},
		},
	})
}

// CreateTopupRequest POST /api/customer/topup-request
func (h *CustomerPortalHandler) CreateTopupRequest(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		Amount        int    `json:"amount"`
		PaymentMethod string `json:"paymentMethod"`
		Note          string `json:"note"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if body.Amount < 10000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "minimum topup amount is Rp 10.000"})
	}

	var user models.PppoeUser
	h.db.First(&user, "id = ?", userID)

	var cat models.TransactionCategory
	h.db.Where("name = ?", "DEPOSIT_REQUEST").FirstOrCreate(&cat, models.TransactionCategory{
		ID:   uuid.New().String(),
		Name: "DEPOSIT_REQUEST",
		Type: "INCOME",
	})

	now := time.Now()
	notes := fmt.Sprintf(
		`{"status":"PENDING","pppoeUserId":"%s","pppoeUsername":"%s","paymentMethod":"%s","note":"%s","requestedAt":"%s"}`,
		user.ID, user.Username, body.PaymentMethod, body.Note, now.Format(time.RFC3339),
	)
	txn := models.Transaction{
		ID:          fmt.Sprintf("txn-%d", now.UnixMilli()),
		Date:        now,
		Type:        "INCOME",
		CategoryID:  &cat.ID,
		Description: fmt.Sprintf("Topup request - %s (Rp %d)", user.Username, body.Amount),
		Amount:      body.Amount,
		Notes:       &notes,
	}
	if err := h.db.Create(&txn).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Topup request created",
		"transaction": fiber.Map{
			"id":        txn.ID,
			"amount":    txn.Amount,
			"reference": fmt.Sprintf("TOPUP-%s-%d", userID, now.Unix()),
			"status":    "PENDING",
		},
	})
}

// GetSuspendRequest GET /api/customer/suspend-request
func (h *CustomerPortalHandler) GetSuspendRequest(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var req models.SuspendRequest
	if err := h.db.Where("userId = ?", userID).Order("requestedAt DESC").First(&req).Error; err != nil {
		return c.JSON(fiber.Map{"success": true, "request": nil})
	}
	return c.JSON(fiber.Map{"success": true, "request": req})
}

// CreateSuspendRequest POST /api/customer/suspend-request
func (h *CustomerPortalHandler) CreateSuspendRequest(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		Reason    *string   `json:"reason"`
		StartDate time.Time `json:"startDate"`
		EndDate   time.Time `json:"endDate"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	now := time.Now()
	if body.StartDate.Before(now) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "startDate must be in the future"})
	}
	if !body.EndDate.After(body.StartDate) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "endDate must be after startDate"})
	}
	if body.EndDate.Sub(body.StartDate).Hours() > 90*24 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "maximum suspend duration is 90 days"})
	}

	var existing models.SuspendRequest
	if h.db.Where("userId = ? AND status IN ?", userID, []string{"PENDING", "APPROVED"}).First(&existing).Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "already has pending or approved suspend request"})
	}

	req := models.SuspendRequest{
		ID:          uuid.New().String(),
		UserID:      userID,
		Status:      "PENDING",
		Reason:      body.Reason,
		StartDate:   body.StartDate,
		EndDate:     body.EndDate,
		RequestedAt: now,
	}
	if err := h.db.Create(&req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "request": req})
}

// CancelSuspendRequest DELETE /api/customer/suspend-request?id=<id>
func (h *CustomerPortalHandler) CancelSuspendRequest(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Query("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id required"})
	}
	var req models.SuspendRequest
	if err := h.db.First(&req, "id = ? AND userId = ?", id, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if req.Status != "PENDING" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PENDING requests can be cancelled"})
	}
	h.db.Model(&req).Update("status", "CANCELLED")
	return c.JSON(fiber.Map{"success": true, "message": "Request cancelled"})
}

// GetCustomerTickets GET /api/customer/tickets
func (h *CustomerPortalHandler) GetCustomerTickets(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var tickets []models.Ticket
	h.db.Preload("Category").
		Where("customerId = ?", userID).
		Order("createdAt DESC").
		Find(&tickets)
	return c.JSON(fiber.Map{"success": true, "tickets": tickets})
}

// CreateCustomerTicket POST /api/customer/tickets
func (h *CustomerPortalHandler) CreateCustomerTicket(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body struct {
		Subject     string  `json:"subject"`
		Description string  `json:"description"`
		CategoryID  *string `json:"categoryId"`
		Priority    string  `json:"priority"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if body.Subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject required"})
	}

	var user models.PppoeUser
	h.db.First(&user, "id = ?", userID)

	priority := body.Priority
	if priority == "" {
		priority = "MEDIUM"
	}

	now := time.Now()
	var ticketNumber string
	for i := 0; i < 10; i++ {
		num := fmt.Sprintf("TKT%02d%02d%04d", now.Year()%100, int(now.Month()), rand.Intn(10000))
		var count int64
		h.db.Model(&models.Ticket{}).Where("ticketNumber = ?", num).Count(&count)
		if count == 0 {
			ticketNumber = num
			break
		}
	}
	if ticketNumber == "" {
		ticketNumber = uuid.New().String()[:12]
	}

	ticket := models.Ticket{
		ID:            uuid.New().String(),
		TicketNumber:  ticketNumber,
		CustomerID:    &userID,
		CustomerName:  user.Name,
		CustomerPhone: user.Phone,
		CustomerEmail: user.Email,
		Subject:       body.Subject,
		Description:   body.Description,
		CategoryID:    body.CategoryID,
		Priority:      priority,
		Status:        "OPEN",
	}
	if err := h.db.Create(&ticket).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "ticket": ticket})
}

// PushSubscribe stores a Web Push subscription for push notifications.
func (h *CustomerPortalHandler) PushSubscribe(c fiber.Ctx) error {
	userID := h.customerID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var body models.PushSubscription
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	sub := models.PushSubscription{
		ID:       time.Now().Format("20060102150405000"),
		UserID:   userID,
		Endpoint: body.Endpoint,
		P256dh:   body.P256dh,
		Auth:     body.Auth,
	}
	h.db.Where("endpoint = ?", body.Endpoint).Assign(sub).FirstOrCreate(&sub)
	return c.JSON(fiber.Map{"message": "subscribed"})
}
