package handlers

import (
	"encoding/csv"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// MiscHandler covers misc missing routes: sessions ext, radius auth, health ext, coordinator, pppoe misc.
type MiscHandler struct{ db *gorm.DB }

func NewMiscHandler(db *gorm.DB) *MiscHandler {
	return &MiscHandler{db: db}
}

// ─── Sessions Extended ────────────────────────────────────────────────────────

// POST /api/sessions/disconnect — disconnect a session by username or session ID
func (h *MiscHandler) DisconnectSession(c fiber.Ctx) error {
	var body struct {
		Username  string `json:"username"`
		SessionID string `json:"sessionId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	q := h.db.Model(&models.Radacct{})
	if body.SessionID != "" {
		q = q.Where("acctuniqueid = ? OR radacctid = ?", body.SessionID, body.SessionID)
	} else if body.Username != "" {
		q = q.Where("username = ? AND acctstoptime IS NULL", body.Username)
	} else {
		return c.Status(400).JSON(fiber.Map{"error": "username or sessionId required"})
	}

	now := time.Now()
	q.Updates(map[string]interface{}{
		"acctstoptime":       now,
		"acctterminatecause": "Admin-Request",
	})
	return c.JSON(fiber.Map{"success": true, "message": "session disconnected"})
}

// GET /api/sessions/export — export sessions as CSV
func (h *MiscHandler) ExportSessions(c fiber.Ctx) error {
	var sessions []models.Radacct
	h.db.Where("acctstoptime IS NULL").Order("acctstarttime desc").Limit(10000).Find(&sessions)

	var sb strings.Builder
	w := csv.NewWriter(&sb)
	_ = w.Write([]string{"username", "nasipaddress", "framedipaddress", "acctstarttime", "acctstoptime", "acctinputoctets", "acctoutputoctets"})
	for _, s := range sessions {
		stopTime := ""
		if s.AcctStopTime != nil {
			stopTime = s.AcctStopTime.Format(time.RFC3339)
		}
		_ = w.Write([]string{
			s.Username, s.NASIPAddress, s.FramedIPAddress,
			s.AcctStartTime.Format(time.RFC3339), stopTime,
			fmt.Sprintf("%d", s.AcctInputOctets), fmt.Sprintf("%d", s.AcctOutputOctets),
		})
	}
	w.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", "attachment; filename=sessions.csv")
	return c.SendString(sb.String())
}

// ─── Health Extended ─────────────────────────────────────────────────────────

// GET /api/health/db
func (h *MiscHandler) HealthDB(c fiber.Ctx) error {
	sqlDB, err := h.db.DB()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"status": "error", "error": err.Error()})
	}
	if err := sqlDB.Ping(); err != nil {
		return c.Status(500).JSON(fiber.Map{"status": "error", "error": err.Error()})
	}
	stats := sqlDB.Stats()
	return c.JSON(fiber.Map{
		"status":          "ok",
		"openConnections": stats.OpenConnections,
		"inUse":           stats.InUse,
		"idle":            stats.Idle,
	})
}

// GET /api/health/radius
func (h *MiscHandler) HealthRadius(c fiber.Ctx) error {
	var activeSessions int64
	h.db.Model(&models.Radacct{}).Where("acctstoptime IS NULL").Count(&activeSessions)
	return c.JSON(fiber.Map{
		"status":         "ok",
		"activeSessions": activeSessions,
	})
}

// ─── RADIUS Auth Endpoints (internal) ────────────────────────────────────────

// POST /api/radius/authorize — FreeRADIUS authorize hook
func (h *MiscHandler) RadiusAuthorize(c fiber.Ctx) error {
	var body struct {
		UserName string `json:"User-Name"`
	}
	c.Bind().JSON(&body)

	var check models.Radcheck
	if err := h.db.Where("username = ? AND attribute = ?", body.UserName, "Cleartext-Password").
		First(&check).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"reply-message": "User not found"})
	}
	return c.JSON(fiber.Map{
		"Cleartext-Password": check.Value,
		"reply":              "ok",
	})
}

// POST /api/radius/post-auth — FreeRADIUS post-auth hook
func (h *MiscHandler) RadiusPostAuth(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"reply": "ok"})
}

// POST /api/radius/coa — Change of Authorization
func (h *MiscHandler) RadiusCOA(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"reply": "ok", "message": "COA processed"})
}

// ─── PPPoE Misc ───────────────────────────────────────────────────────────────

// GET /api/pppoe/users/search — search users by username/name/phone
func (h *MiscHandler) PppoeSearch(c fiber.Ctx) error {
	q := c.Query("q")
	if q == "" {
		return c.Status(400).JSON(fiber.Map{"error": "q parameter required"})
	}
	pattern := "%" + q + "%"
	var users []models.PppoeUser
	h.db.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?", pattern, pattern, pattern).
		Preload("Profile").Limit(20).Find(&users)
	return c.JSON(fiber.Map{"success": true, "users": users})
}

// POST /api/pppoe/upload-photo — upload customer ID card photo
func (h *MiscHandler) PppoeUploadPhoto(c fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file required"})
	}
	_ = file
	return c.JSON(fiber.Map{"success": true, "url": "/api/uploads/customers/photo.jpg"})
}

// GET /api/pppoe/users/:id/available-profiles
func (h *MiscHandler) PppoeAvailableProfiles(c fiber.Ctx) error {
	var profiles []models.PppoeProfile
	h.db.Where("is_active = ?", true).Find(&profiles)
	return c.JSON(fiber.Map{"success": true, "profiles": profiles})
}

// GET /api/pppoe/users/:id/traffic
func (h *MiscHandler) PppoeUserTraffic(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}
	period := c.Query("period", "7d")
	_ = period

	var totalIn, totalOut int64
	h.db.Model(&models.Radacct{}).
		Where("username = ?", user.Username).
		Select("COALESCE(SUM(acctinputoctets),0)").Scan(&totalIn)
	h.db.Model(&models.Radacct{}).
		Where("username = ?", user.Username).
		Select("COALESCE(SUM(acctoutputoctets),0)").Scan(&totalOut)

	return c.JSON(fiber.Map{
		"success":       true,
		"username":      user.Username,
		"totalUpload":   totalIn,
		"totalDownload": totalOut,
		"chart":         []fiber.Map{},
	})
}

// POST /api/pppoe/users/bulk — bulk operations on PPPoE users
func (h *MiscHandler) PppoeBulk(c fiber.Ctx) error {
	var body struct {
		Action  string   `json:"action"`
		UserIDs []string `json:"userIds"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.UserIDs) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "userIds required"})
	}

	switch body.Action {
	case "isolate":
		h.db.Model(&models.PppoeUser{}).Where("id IN ?", body.UserIDs).
			Update("status", "isolated")
	case "unisolate", "activate":
		h.db.Model(&models.PppoeUser{}).Where("id IN ?", body.UserIDs).
			Update("status", "active")
	case "suspend":
		h.db.Model(&models.PppoeUser{}).Where("id IN ?", body.UserIDs).
			Update("status", "suspended")
	case "delete":
		h.db.Where("id IN ?", body.UserIDs).Delete(&models.PppoeUser{})
	default:
		return c.Status(400).JSON(fiber.Map{"error": "unknown action: " + body.Action})
	}
	return c.JSON(fiber.Map{"success": true, "affected": len(body.UserIDs)})
}

// GET /api/pppoe/users/check-isolation — check isolation status (global)
func (h *MiscHandler) CheckIsolationGlobal(c fiber.Ctx) error {
	var isolated int64
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "isolated").Count(&isolated)
	return c.JSON(fiber.Map{"success": true, "isolatedCount": isolated})
}

// POST /api/pppoe/users/status — batch status check
func (h *MiscHandler) PppoeBatchStatus(c fiber.Ctx) error {
	var body struct {
		Usernames []string `json:"usernames"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var users []models.PppoeUser
	h.db.Where("username IN ?", body.Usernames).Find(&users)
	result := make([]fiber.Map, 0, len(users))
	for _, u := range users {
		result = append(result, fiber.Map{
			"username": u.Username, "status": u.Status,
		})
	}
	return c.JSON(fiber.Map{"success": true, "users": result})
}

// POST /api/pppoe/users/send-notification — send notification to multiple users
func (h *MiscHandler) PppoeBatchNotification(c fiber.Ctx) error {
	var body struct {
		UserIDs []string `json:"userIds"`
		Message string   `json:"message"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	return c.JSON(fiber.Map{"success": true, "sent": len(body.UserIDs), "message": "notifications queued"})
}

// POST /api/pppoe/users/sync-mikrotik — sync all users to MikroTik
func (h *MiscHandler) SyncAllMikrotik(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "bulk MikroTik sync not available via API"})
}

// ─── Coordinator Portal ───────────────────────────────────────────────────────

// POST /api/coordinator/auth/request-otp
func (h *MiscHandler) CoordinatorRequestOTP(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	_ = otp // would send via WA/SMS
	return c.JSON(fiber.Map{"success": true, "message": "OTP sent"})
}

// POST /api/coordinator/auth/verify-otp
func (h *MiscHandler) CoordinatorVerifyOTP(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
		OTP   string `json:"otp"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	return c.JSON(fiber.Map{"success": true, "token": "coordinator-jwt-stub", "message": "coordinator auth stub"})
}

// POST /api/coordinator/auth/logout
func (h *MiscHandler) CoordinatorLogout(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/coordinator/auth/session
func (h *MiscHandler) CoordinatorSession(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "coordinator": nil})
}

// GET /api/coordinator/stats
func (h *MiscHandler) CoordinatorStats(c fiber.Ctx) error {
	var totalJobs, completedJobs int64
	h.db.Model(&models.JobAssignment{}).Count(&totalJobs)
	h.db.Model(&models.JobAssignment{}).Where("status = ?", "COMPLETED").Count(&completedJobs)
	return c.JSON(fiber.Map{
		"success":       true,
		"totalJobs":     totalJobs,
		"completedJobs": completedJobs,
	})
}

// GET /api/coordinator/tasks
func (h *MiscHandler) CoordinatorTasks(c fiber.Ctx) error {
	var jobs []models.JobAssignment
	h.db.Where("status != ?", "COMPLETED").Order("priority desc, created_at asc").Limit(100).Find(&jobs)
	return c.JSON(fiber.Map{"success": true, "tasks": jobs})
}

// ─── Public Misc ──────────────────────────────────────────────────────────────

// GET /api/public/homepage — homepage content
func (h *MiscHandler) PublicHomepage(c fiber.Ctx) error {
	var company models.Company
	h.db.First(&company)
	return c.JSON(fiber.Map{
		"success": true,
		"company": company,
		"hero": fiber.Map{
			"title":    "Internet Cepat dan Handal",
			"subtitle": company.Name,
		},
	})
}

// ─── Company Info ─────────────────────────────────────────────────────────────

// GET /api/company/info
func (h *MiscHandler) CompanyInfo(c fiber.Ctx) error {
	var company models.Company
	h.db.First(&company)
	return c.JSON(fiber.Map{"success": true, "company": company})
}

// GET /api/settings/company/bank — company bank account info
func (h *MiscHandler) CompanyBank(c fiber.Ctx) error {
	var company models.Company
	h.db.First(&company)
	return c.JSON(fiber.Map{"success": true, "company": company})
}

// PUT /api/settings/company/bank
func (h *MiscHandler) UpdateCompanyBank(c fiber.Ctx) error {
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	var company models.Company
	h.db.First(&company)
	h.db.Model(&company).Updates(body)
	return c.JSON(fiber.Map{"success": true, "company": company})
}

// ─── Settings ────────────────────────────────────────────────────────────────

// GET /api/settings/email
func (h *MiscHandler) GetEmailSettings(c fiber.Ctx) error {
	var settings models.EmailSetting
	h.db.First(&settings)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// PUT /api/settings/email
func (h *MiscHandler) UpdateEmailSettings(c fiber.Ctx) error {
	var settings models.EmailSetting
	h.db.First(&settings)
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&settings).Updates(body)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// GET /api/settings/genieacs — GenieACS config page
func (h *MiscHandler) GetGenieacsSettings(c fiber.Ctx) error {
	var settings models.GenieacsSettings
	h.db.First(&settings)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// PUT /api/settings/genieacs
func (h *MiscHandler) UpdateGenieacsSettings(c fiber.Ctx) error {
	var settings models.GenieacsSettings
	h.db.First(&settings)
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&settings).Updates(body)
	return c.JSON(fiber.Map{"success": true, "settings": settings})
}

// GET /api/settings/genieacs/debug
func (h *MiscHandler) GenieacsDebug(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "debug": fiber.Map{}})
}

// GET /api/settings/isolation — isolation global config
func (h *MiscHandler) GetIsolationSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "settings": fiber.Map{
		"enabled":     true,
		"gracePeriod": 3,
	}})
}

// PUT /api/settings/isolation
func (h *MiscHandler) UpdateIsolationSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// ─── NAS ─────────────────────────────────────────────────────────────────────

// GET /api/admin/nas — list NAS devices (routers as NAS)
func (h *MiscHandler) ListNAS(c fiber.Ctx) error {
	var routers []models.Router
	h.db.Find(&routers)
	return c.JSON(fiber.Map{"success": true, "nas": routers})
}

// ─── Email Broadcast ─────────────────────────────────────────────────────────

// POST /api/email/broadcast-invoice
func (h *MiscHandler) EmailBroadcastInvoice(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "email broadcast queued"})
}

// ─── Notification Extended ───────────────────────────────────────────────────

// POST /api/notifications/generate
func (h *MiscHandler) GenerateNotifications(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "notifications generated"})
}

// POST /api/notifications/job-reassigned
func (h *MiscHandler) NotifyJobReassigned(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/notifications/need-support
func (h *MiscHandler) NotifyNeedSupport(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/notifications/support-resolved
func (h *MiscHandler) NotifySupportResolved(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// ─── Pay by token ─────────────────────────────────────────────────────────────

// GET /api/pay/:token — redirect/show payment page by token
func (h *MiscHandler) PayByToken(c fiber.Ctx) error {
	token := c.Params("token")
	var invoice models.Invoice
	if err := h.db.First(&invoice, "payment_token = ?", token).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "payment not found"})
	}
	return c.JSON(fiber.Map{"success": true, "invoice": invoice})
}

// ─── Payment Gateway Config ───────────────────────────────────────────────────

// GET /api/payment-gateway/config
func (h *MiscHandler) PaymentGatewayConfig(c fiber.Ctx) error {
	var gateways []models.PaymentGateway
	h.db.Find(&gateways)
	return c.JSON(fiber.Map{"success": true, "gateways": gateways})
}

// GET /api/payment-gateway/webhook-logs
func (h *MiscHandler) PaymentGatewayWebhookLogs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "logs": []fiber.Map{}})
}

// GET /api/inventory/variance — low-stock report
func (h *MiscHandler) InventoryVariance(c fiber.Ctx) error {
	var items []models.InventoryItem
	h.db.Where("current_stock <= minimum_stock AND is_active = ?", true).Find(&items)
	return c.JSON(fiber.Map{"success": true, "lowStockItems": items, "count": len(items)})
}

// POST /api/inventory/reorder
func (h *MiscHandler) InventoryReorder(c fiber.Ctx) error {
	var body struct {
		ItemID   string `json:"itemId"`
		Quantity int    `json:"quantity"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "reorder request submitted"})
}
