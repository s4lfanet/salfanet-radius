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
