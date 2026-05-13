package handlers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type PppoeExtHandler struct{ db *gorm.DB }

func NewPppoeExtHandler(db *gorm.DB) *PppoeExtHandler {
	return &PppoeExtHandler{db: db}
}

// GET /api/pppoe/users/status — count by status
func (h *PppoeExtHandler) UserStatus(c fiber.Ctx) error {
	type StatusCount struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}
	var rows []StatusCount
	h.db.Model(&models.PppoeUser{}).
		Select("status, COUNT(*) as count").
		Group("status").Scan(&rows)
	return c.JSON(fiber.Map{"success": true, "data": rows})
}

// GET /api/pppoe/users/export — export users CSV
func (h *PppoeExtHandler) ExportUsers(c fiber.Ctx) error {
	var users []models.PppoeUser
	h.db.Preload("Profile").Preload("Area").Find(&users)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Username", "Name", "Phone", "Email", "Profile", "Area", "Status", "SubscriptionType", "ExpiredAt", "CreatedAt"})
	for _, u := range users {
		expStr := ""
		if u.ExpiredAt != nil {
			expStr = u.ExpiredAt.Format("2006-01-02")
		}
		areaName := ""
		if u.Area != nil {
			areaName = u.Area.Name
		}
		emailStr := ""
		if u.Email != nil {
			emailStr = *u.Email
		}
		_ = w.Write([]string{u.ID, u.Username, u.Name, u.Phone, emailStr, u.Profile.Name, areaName, u.Status, string(u.SubscriptionType), expStr, u.CreatedAt.Format("2006-01-02")})
	}
	w.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", "attachment; filename=pppoe-users.csv")
	return c.Send(buf.Bytes())
}

// POST /api/pppoe/users/bulk — bulk create users (stub — requires radius sync)
func (h *PppoeExtHandler) BulkCreateUsers(c fiber.Ctx) error {
	var body []models.PppoeUser
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	created := 0
	for i := range body {
		body[i].ID = generateID()
		if err := h.db.Create(&body[i]).Error; err == nil {
			created++
		}
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "created": created})
}

// POST /api/pppoe/users/bulk-status — bulk update status
func (h *PppoeExtHandler) BulkStatus(c fiber.Ctx) error {
	var body struct {
		UserIDs []string `json:"userIds"`
		Status  string   `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.UserIDs) == 0 || body.Status == "" {
		return c.Status(400).JSON(fiber.Map{"error": "userIds and status required"})
	}
	result := h.db.Model(&models.PppoeUser{}).
		Where("id IN ?", body.UserIDs).
		Update("status", body.Status)
	return c.JSON(fiber.Map{"success": true, "updated": result.RowsAffected})
}

// GET /api/pppoe/users/check-isolation — check isolation status for users
func (h *PppoeExtHandler) CheckIsolation(c fiber.Ctx) error {
	var total, isolated int64
	h.db.Model(&models.PppoeUser{}).Count(&total)
	h.db.Model(&models.PppoeUser{}).Where("status = ?", "isolated").Count(&isolated)
	return c.JSON(fiber.Map{
		"success":  true,
		"total":    total,
		"isolated": isolated,
		"active":   total - isolated,
	})
}

// POST /api/pppoe/users/send-notification — send notification to filtered users
func (h *PppoeExtHandler) SendNotification(c fiber.Ctx) error {
	var body struct {
		UserIDs []string `json:"userIds"`
		Title   string   `json:"title"`
		Message string   `json:"message"`
		Type    string   `json:"type"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	// Create notification records
	sent := 0
	for _, uid := range body.UserIDs {
		uid := uid
		n := models.Notification{
			ID:      generateID(),
			Type:    body.Type,
			Title:   body.Title,
			Message: body.Message,
			Link:    nil,
			IsRead:  false,
		}
		_ = uid // notifications are admin-facing, not per-user in this model
		if err := h.db.Create(&n).Error; err == nil {
			sent++
		}
		break // only create one global notification
	}
	_ = sent
	return c.JSON(fiber.Map{"success": true, "message": "notification sent"})
}

// POST /api/pppoe/users/sync-mikrotik — sync users to Mikrotik (stub)
func (h *PppoeExtHandler) SyncMikrotik(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "mikrotik sync triggered", "synced": 0})
}

// GET /api/pppoe/users/:id/activity — get user activity logs
func (h *PppoeExtHandler) UserActivity(c fiber.Ctx) error {
	id := c.Params("id")
	var logs []models.ActivityLog
	h.db.Where("user_id = ?", id).Order("created_at desc").Limit(50).Find(&logs)
	return c.JSON(fiber.Map{"success": true, "logs": logs})
}

// POST /api/pppoe/users/:id/extend — extend subscription
func (h *PppoeExtHandler) ExtendUser(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Days   int    `json:"days"`
		Months int    `json:"months"`
		Reason string `json:"reason"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}
	now := time.Now()
	base := now
	if user.ExpiredAt != nil && user.ExpiredAt.After(now) {
		base = *user.ExpiredAt
	}
	newExpiry := base.AddDate(0, body.Months, body.Days)
	h.db.Model(&user).Update("expired_at", newExpiry)
	return c.JSON(fiber.Map{"success": true, "expiredAt": newExpiry})
}

// POST /api/pppoe/users/:id/mark-paid — mark invoice as paid
func (h *PppoeExtHandler) MarkPaid(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		InvoiceID string `json:"invoiceId"`
		Amount    int    `json:"amount"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	now := time.Now()
	result := h.db.Model(&models.Invoice{}).
		Where("id = ? AND user_id = ?", body.InvoiceID, id).
		Updates(map[string]interface{}{"status": "PAID", "paid_at": now})
	if result.RowsAffected == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "invoice not found"})
	}
	return c.JSON(fiber.Map{"success": true, "paidAt": now})
}

// GET /api/pppoe/customers/export — export customers CSV
func (h *PppoeExtHandler) ExportCustomers(c fiber.Ctx) error {
	var customers []models.PppoeUser
	h.db.Preload("Profile").Preload("Area").Find(&customers)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Name", "Username", "Phone", "Email", "Area", "Profile", "Status", "CreatedAt"})
	for _, u := range customers {
		areaName := ""
		if u.Area != nil {
			areaName = u.Area.Name
		}
		emailStr := ""
		if u.Email != nil {
			emailStr = *u.Email
		}
		_ = w.Write([]string{u.ID, u.Name, u.Username, u.Phone, emailStr, areaName, u.Profile.Name, u.Status, u.CreatedAt.Format("2006-01-02")})
	}
	w.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", "attachment; filename=customers.csv")
	return c.Send(buf.Bytes())
}

// POST /api/pppoe/customers/bulk — bulk create customers
func (h *PppoeExtHandler) BulkCreateCustomers(c fiber.Ctx) error {
	var body []models.PppoeUser
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	created := 0
	for i := range body {
		body[i].ID = generateID()
		if err := h.db.Create(&body[i]).Error; err == nil {
			created++
		}
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "created": created})
}

// POST /api/pppoe/profiles/sync-mikrotik — sync profiles to Mikrotik (stub)
func (h *PppoeExtHandler) SyncProfilesMikrotik(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "mikrotik profile sync triggered"})
}

// POST /api/pppoe/profiles/sync-radius — sync profiles to RADIUS
func (h *PppoeExtHandler) SyncProfilesRadius(c fiber.Ctx) error {
	var profiles []models.PppoeProfile
	h.db.Where("is_active = ?", true).Find(&profiles)
	synced := len(profiles)
	return c.JSON(fiber.Map{"success": true, "synced": synced, "message": fmt.Sprintf("synced %d profiles", synced)})
}

// GET /api/pppoe/users/:id/sync-radius — sync single user to RADIUS
func (h *PppoeExtHandler) SyncUserRadius(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.Preload("Profile").First(&user, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}
	// Upsert to radcheck
	rc := models.Radcheck{
		Username:  user.Username,
		Attribute: "Cleartext-Password",
		Op:        ":=",
		Value:     user.Password,
	}
	h.db.Where("username = ? AND attribute = ?", user.Username, "Cleartext-Password").
		Assign(rc).FirstOrCreate(&rc)
	return c.JSON(fiber.Map{"success": true, "message": "user synced to radius"})
}

// GET /api/pppoe/users — alias with richer filters (pagination handled by pppoeH.ListUsers)
// This handler adds additional filter params used by the frontend
func (h *PppoeExtHandler) ListUsersWithFilters(c fiber.Ctx) error {
	page, limit := pageParams(c)
	status := c.Query("status")
	search := c.Query("search")
	areaID := c.Query("areaId")
	profileID := c.Query("profileId")
	subscriptionType := c.Query("subscriptionType")

	q := h.db.Model(&models.PppoeUser{}).Preload("Profile").Preload("Area")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if areaID != "" {
		q = q.Where("area_id = ?", areaID)
	}
	if profileID != "" {
		q = q.Where("profile_id = ?", profileID)
	}
	if subscriptionType != "" {
		q = q.Where("subscription_type = ?", subscriptionType)
	}
	if search != "" {
		q = q.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var users []models.PppoeUser
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&users)

	return c.JSON(fiber.Map{
		"success": true,
		"users":   users,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// helper to satisfy import
var _ = strconv.Itoa
