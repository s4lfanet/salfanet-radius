package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type AnalyticsHandler struct{ db *gorm.DB }

func NewAnalyticsHandler(db *gorm.DB) *AnalyticsHandler { return &AnalyticsHandler{db: db} }

// GET /api/admin/analytics  AND  GET /api/dashboard/analytics
func (h *AnalyticsHandler) GetAnalytics(c fiber.Ctx) error {
	type MonthlyRevenue struct {
		Month   string  `json:"month"`
		Revenue float64 `json:"revenue"`
	}
	type CustomerGrowth struct {
		Month  string `json:"month"`
		Total  int64  `json:"total"`
		Active int64  `json:"active"`
	}

	var revenue []MonthlyRevenue
	h.db.Raw(`SELECT DATE_FORMAT(paid_at, '%Y-%m') as month, SUM(amount) as revenue
		FROM invoices WHERE status = 'PAID' AND paid_at IS NOT NULL
		AND paid_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
		GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
		ORDER BY month`).Scan(&revenue)

	var growth []CustomerGrowth
	h.db.Raw(`SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
		COUNT(id) as total
		FROM pppoe_users
		WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
		GROUP BY DATE_FORMAT(created_at, '%Y-%m')
		ORDER BY month`).Scan(&growth)

	var totalRevenue, paidCount, pendingCount, overdueCount struct{ Val float64 }
	var userCount struct{ Active, Total, Suspended int64 }

	h.db.Raw("SELECT COALESCE(SUM(amount),0) AS val FROM invoices WHERE status='PAID'").Scan(&totalRevenue)
	h.db.Raw("SELECT COUNT(*) AS val FROM invoices WHERE status='PAID'").Scan(&paidCount)
	h.db.Raw("SELECT COUNT(*) AS val FROM invoices WHERE status='PENDING'").Scan(&pendingCount)
	h.db.Raw("SELECT COUNT(*) AS val FROM invoices WHERE status='OVERDUE'").Scan(&overdueCount)
	h.db.Raw("SELECT SUM(status='active') AS active, COUNT(*) AS total, SUM(status='suspended') AS suspended FROM pppoe_users").Scan(&userCount)

	type PieSlice struct {
		Label string  `json:"label"`
		Value float64 `json:"value"`
	}
	revenueByType := []PieSlice{}
	h.db.Raw(`SELECT type as label, SUM(amount) as value FROM invoices WHERE status='PAID' GROUP BY type`).Scan(&revenueByType)

	return c.JSON(fiber.Map{
		"success": true,
		"revenue": revenue,
		"growth":  growth,
		"summary": fiber.Map{
			"totalRevenue":    totalRevenue.Val,
			"paidInvoices":    paidCount.Val,
			"pendingInvoices": pendingCount.Val,
			"overdueInvoices": overdueCount.Val,
			"activeUsers":     userCount.Active,
			"totalUsers":      userCount.Total,
			"suspendedUsers":  userCount.Suspended,
		},
		"revenueByType": revenueByType,
	})
}

// GET /api/dashboard/traffic
func (h *AnalyticsHandler) GetTraffic(c fiber.Ctx) error {
	type SessionStats struct {
		Hour    int     `json:"hour"`
		Count   int64   `json:"count"`
		AvgTime float64 `json:"avgTime"`
	}
	var hourly []SessionStats
	h.db.Raw(`SELECT HOUR(acctstarttime) as hour, COUNT(*) as count,
		AVG(acctsessiontime) as avg_time
		FROM radacct WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
		GROUP BY HOUR(acctstarttime) ORDER BY hour`).Scan(&hourly)

	var activeSessions int64
	h.db.Raw("SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL").Scan(&activeSessions)

	return c.JSON(fiber.Map{
		"success":        true,
		"hourly":         hourly,
		"activeSessions": activeSessions,
	})
}
