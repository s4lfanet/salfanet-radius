package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// AdminHandler handles dashboard/stats endpoints.
type AdminHandler struct {
	db *gorm.DB
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

// Stats godoc
// GET /api/admin/stats
func (h *AdminHandler) Stats(c fiber.Ctx) error {
	var totalCustomers, activeCustomers, isolatedCustomers int64
	h.db.Model(&models.PppoeUser{}).Count(&totalCustomers)
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "active").Count(&activeCustomers)
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "isolated").Count(&isolatedCustomers)

	var pendingInvoices, paidInvoices int64
	var pendingRevenue, paidRevenue int64
	h.db.Model(&models.Invoice{}).Where("status = ?", "PENDING").Count(&pendingInvoices)
	h.db.Model(&models.Invoice{}).Where("status = ?", "PAID").Count(&paidInvoices)
	h.db.Model(&models.Invoice{}).Where("status = ?", "PENDING").Select("COALESCE(SUM(amount), 0)").Scan(&pendingRevenue)
	h.db.Model(&models.Invoice{}).Where("status = ?", "PAID").Select("COALESCE(SUM(amount), 0)").Scan(&paidRevenue)

	var totalONU, onlineONU, offlineONU int64
	h.db.Model(&models.OLTONUStatus{}).Count(&totalONU)
	h.db.Model(&models.OLTONUStatus{}).Where("status = ?", "online").Count(&onlineONU)
	h.db.Model(&models.OLTONUStatus{}).Where("status != ?", "online").Count(&offlineONU)

	// Month revenue
	startOfMonth := time.Now().Truncate(24*time.Hour).AddDate(0, 0, -time.Now().Day()+1)
	var monthRevenue int64
	h.db.Model(&models.Invoice{}).
		Where("status = ? AND paid_at >= ?", "PAID", startOfMonth).
		Select("COALESCE(SUM(amount), 0)").Scan(&monthRevenue)

	return c.JSON(fiber.Map{
		"customers": fiber.Map{
			"total":    totalCustomers,
			"active":   activeCustomers,
			"isolated": isolatedCustomers,
		},
		"invoices": fiber.Map{
			"pending":        pendingInvoices,
			"paid":           paidInvoices,
			"pendingRevenue": pendingRevenue,
			"paidRevenue":    paidRevenue,
			"monthRevenue":   monthRevenue,
		},
		"onu": fiber.Map{
			"total":   totalONU,
			"online":  onlineONU,
			"offline": offlineONU,
		},
	})
}

// RevenueChart godoc
// GET /api/admin/revenue-chart
func (h *AdminHandler) RevenueChart(c fiber.Ctx) error {
	months := 12
	if v, err := strconv.Atoi(c.Query("months")); err == nil && v > 0 {
		months = v
	}

	type monthRevenue struct {
		Month   string `json:"month"`
		Revenue int64  `json:"revenue"`
		Count   int64  `json:"count"`
	}

	var rows []monthRevenue
	h.db.Raw(`
		SELECT DATE_FORMAT(paid_at, '%Y-%m') as month,
		       SUM(amount) as revenue,
		       COUNT(*) as count
		FROM invoices
		WHERE status = 'PAID'
		  AND paid_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
		GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
		ORDER BY month ASC
	`, months).Scan(&rows)

	return c.JSON(rows)
}

// Activity godoc
// GET /api/admin/activity
func (h *AdminHandler) Activity(c fiber.Ctx) error {
	var cronHistory []models.CronHistory
	h.db.Order("started_at DESC").Limit(20).Find(&cronHistory)

	return c.JSON(fiber.Map{
		"cronJobs": cronHistory,
	})
}

// IsolatedUsers godoc
// GET /api/admin/isolated-users
func (h *AdminHandler) IsolatedUsers(c fiber.Ctx) error {
	type isolatedRow struct {
		ID         string     `json:"id"`
		Username   string     `json:"username"`
		Name       string     `json:"name"`
		Phone      *string    `json:"phone"`
		Status     string     `json:"status"`
		ExpiredAt  *time.Time `json:"expiredAt"`
		AreaName   *string    `json:"areaName"`
		Profile    *string    `json:"profileName"`
		Price      *int64     `json:"profilePrice"`
		UnpaidAmt  *int64     `json:"unpaidAmount"`
		UnpaidCnt  int        `json:"unpaidCount"`
	}

	var rows []isolatedRow
	h.db.Raw(`
		SELECT
			u.id, u.username, u.name, u.phone, u.status, u.expiredAt,
			a.name  AS areaName,
			p.name  AS profile,
			p.price AS price,
			COALESCE(SUM(CASE WHEN i.status IN ('PENDING','OVERDUE') THEN i.amount ELSE 0 END), 0) AS unpaidAmt,
			COUNT(CASE WHEN i.status IN ('PENDING','OVERDUE') THEN 1 END)                           AS unpaidCnt
		FROM pppoe_users u
		LEFT JOIN pppoe_areas    a ON u.areaId    = a.id
		LEFT JOIN pppoe_profiles p ON u.profileId = p.id
		LEFT JOIN invoices       i ON i.userId    = u.id
		WHERE u.status IN ('isolated','suspended')
		GROUP BY u.id
		ORDER BY u.expiredAt DESC
	`).Scan(&rows)

	return c.JSON(fiber.Map{"data": rows, "total": len(rows)})
}

// TopupRequests godoc
// GET /api/admin/topup-requests
func (h *AdminHandler) TopupRequests(c fiber.Ctx) error {
	status := c.Query("status", "pending")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	type topupRow struct {
		ID          string     `json:"id"`
		AgentName   string     `json:"agentName"`
		AgentID     string     `json:"agentId"`
		Amount      int64      `json:"amount"`
		Status      string     `json:"status"`
		ProofURL    *string    `json:"proofUrl"`
		CreatedAt   time.Time  `json:"createdAt"`
		ProcessedAt *time.Time `json:"processedAt"`
	}
	var rows []topupRow
	var total int64

	q := h.db.Table("agent_deposits").
		Select("agent_deposits.id, ag.name as agentName, agent_deposits.agentId, agent_deposits.amount, agent_deposits.status, agent_deposits.proofUrl, agent_deposits.createdAt, agent_deposits.processedAt").
		Joins("LEFT JOIN agents ag ON ag.id = agent_deposits.agentId")
	if status != "all" {
		q = q.Where("agent_deposits.status = ?", status)
	}
	q.Count(&total)
	q.Order("agent_deposits.createdAt DESC").
		Offset((page - 1) * limit).Limit(limit).
		Scan(&rows)

	return c.JSON(fiber.Map{"data": rows, "total": total, "page": page})
}

// ApproveTopup godoc
// POST /api/admin/topup-requests/:id/approve
func (h *AdminHandler) ApproveTopup(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()

	// Get deposit record
	var dep struct {
		ID      string
		AgentID string
		Amount  int64
		Status  string
	}
	if err := h.db.Raw("SELECT id, agentId, amount, status FROM agent_deposits WHERE id = ?", id).Scan(&dep).Error; err != nil || dep.ID == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "deposit not found"})
	}
	if dep.Status != "pending" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "deposit already processed"})
	}

	// Update deposit + credit agent balance in transaction
	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("UPDATE agent_deposits SET status='approved', processedAt=? WHERE id=?", now, id).Error; err != nil {
			return err
		}
		return tx.Exec("UPDATE agents SET balance = balance + ? WHERE id = ?", dep.Amount, dep.AgentID).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "approved"})
}

// RejectTopup godoc
// POST /api/admin/topup-requests/:id/reject
func (h *AdminHandler) RejectTopup(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()

	res := h.db.Exec("UPDATE agent_deposits SET status='rejected', processedAt=? WHERE id=? AND status='pending'", now, id)
	if res.RowsAffected == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "deposit not found or already processed"})
	}
	return c.JSON(fiber.Map{"message": "rejected"})
}

// SuspendRequests godoc
// GET /api/admin/suspend-requests
func (h *AdminHandler) SuspendRequests(c fiber.Ctx) error {
	status := c.Query("status", "pending")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	type suspendRow struct {
		ID          string     `json:"id"`
		UserID      string     `json:"userId"`
		Username    string     `json:"username"`
		UserName    string     `json:"userName"`
		Reason      *string    `json:"reason"`
		Status      string     `json:"status"`
		CreatedAt   time.Time  `json:"createdAt"`
		ProcessedAt *time.Time `json:"processedAt"`
	}
	var rows []suspendRow
	var total int64

	q := h.db.Table("suspend_requests sr").
		Select("sr.id, sr.userId, u.username, u.name as userName, sr.reason, sr.status, sr.createdAt, sr.processedAt").
		Joins("LEFT JOIN pppoe_users u ON u.id = sr.userId")
	if status != "all" {
		q = q.Where("sr.status = ?", status)
	}
	q.Count(&total)
	q.Order("sr.createdAt DESC").
		Offset((page - 1) * limit).Limit(limit).
		Scan(&rows)

	return c.JSON(fiber.Map{"data": rows, "total": total, "page": page})
}

// ApproveSuspend godoc
// POST /api/admin/suspend-requests/:id/approve
func (h *AdminHandler) ApproveSuspend(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()

	var req struct {
		UserID string
		Status string
	}
	if err := h.db.Raw("SELECT userId, status FROM suspend_requests WHERE id = ?", id).Scan(&req).Error; err != nil || req.UserID == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "request not found"})
	}
	if req.Status != "pending" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "already processed"})
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("UPDATE suspend_requests SET status='approved', processedAt=? WHERE id=?", now, id).Error; err != nil {
			return err
		}
		return tx.Exec("UPDATE pppoe_users SET status='suspended' WHERE id=?", req.UserID).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "approved"})
}

// RejectSuspend godoc
// POST /api/admin/suspend-requests/:id/reject
func (h *AdminHandler) RejectSuspend(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()
	res := h.db.Exec("UPDATE suspend_requests SET status='rejected', processedAt=? WHERE id=? AND status='pending'", now, id)
	if res.RowsAffected == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "request not found or already processed"})
	}
	return c.JSON(fiber.Map{"message": "rejected"})
}
