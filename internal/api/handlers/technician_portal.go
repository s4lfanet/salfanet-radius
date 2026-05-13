package handlers

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/config"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type TechnicianPortalHandler struct{ db *gorm.DB }

func NewTechnicianPortalHandler(db *gorm.DB) *TechnicianPortalHandler {
	return &TechnicianPortalHandler{db: db}
}

// POST /api/technician/auth/request-otp — request OTP for login
func (h *TechnicianPortalHandler) RequestOTP(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "phone required"})
	}
	var tech models.Technician
	if err := h.db.First(&tech, "phone_number = ? AND is_active = ?", body.Phone, true).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "technician not found"})
	}

	// Generate 6-digit OTP
	otp := fmt.Sprintf("%06d", rand.Intn(999999))
	expiry := time.Now().Add(10 * time.Minute)

	// Delete old OTPs for this technician
	h.db.Where("technician_id = ?", tech.ID).Delete(&models.TechnicianOtp{})

	// Create new OTP
	otpRecord := models.TechnicianOtp{
		ID:           generateID(),
		TechnicianID: tech.ID,
		Token:        otp,
		ExpiresAt:    expiry,
	}
	h.db.Create(&otpRecord)

	// In production, send via WhatsApp/SMS. Here we just return for dev.
	return c.JSON(fiber.Map{"success": true, "message": "OTP sent", "otp": otp}) // dev only — remove in prod
}

// POST /api/technician/auth/verify-otp — verify OTP and return token
func (h *TechnicianPortalHandler) VerifyOTP(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
		OTP   string `json:"otp"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var tech models.Technician
	if err := h.db.First(&tech, "phone_number = ? AND is_active = ?", body.Phone, true).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "technician not found"})
	}

	var otpRecord models.TechnicianOtp
	if err := h.db.First(&otpRecord, "technician_id = ? AND token = ? AND used_at IS NULL", tech.ID, body.OTP).Error; err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid or expired OTP"})
	}
	if time.Now().After(otpRecord.ExpiresAt) {
		return c.Status(401).JSON(fiber.Map{"error": "OTP expired"})
	}

	// Mark OTP as used
	now := time.Now()
	h.db.Model(&otpRecord).Update("used_at", now)

	// Update last login
	h.db.Model(&tech).Update("last_login_at", now)

	// Generate JWT
	token, err := technicianJWT(tech)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{"success": true, "token": token, "technician": tech})
}

// POST /api/technician/auth/login — login with phone (no OTP mode)
func (h *TechnicianPortalHandler) Login(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var tech models.Technician
	if err := h.db.First(&tech, "phone_number = ? AND is_active = ?", body.Phone, true).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "technician not found"})
	}
	if tech.RequireOtp {
		return c.Status(400).JSON(fiber.Map{"error": "OTP required", "requireOtp": true})
	}
	now := time.Now()
	h.db.Model(&tech).Update("last_login_at", now)
	token, err := technicianJWT(tech)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate token"})
	}
	return c.JSON(fiber.Map{"success": true, "token": token, "technician": tech})
}

// POST /api/technician/auth/logout
func (h *TechnicianPortalHandler) Logout(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/technician/auth/session — get current technician from token
func (h *TechnicianPortalHandler) Session(c fiber.Ctx) error {
	tech, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "technician": tech})
}

// GET /api/technician/profile
func (h *TechnicianPortalHandler) GetProfile(c fiber.Ctx) error {
	tech, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "technician": tech})
}

// GET /api/technician/work-orders
func (h *TechnicianPortalHandler) ListWorkOrders(c fiber.Ctx) error {
	tech, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	page, limit := pageParams(c)
	status := c.Query("status")

	q := h.db.Model(&models.WorkOrder{}).Where("technician_id = ?", tech.ID)
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	q.Count(&total)
	var orders []models.WorkOrder
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&orders)
	return c.JSON(fiber.Map{
		"success": true,
		"orders":  orders,
		"pagination": fiber.Map{
			"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// GET /api/technician/tasks — alias for work orders in OPEN/IN_PROGRESS
func (h *TechnicianPortalHandler) ListTasks(c fiber.Ctx) error {
	tech, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var orders []models.WorkOrder
	h.db.Where("technician_id = ? AND status IN ?", tech.ID, []string{"OPEN", "ASSIGNED", "IN_PROGRESS"}).
		Order("priority desc, created_at asc").Find(&orders)
	return c.JSON(fiber.Map{"success": true, "tasks": orders})
}

// GET /api/technician/customers — list customers in technician's area
func (h *TechnicianPortalHandler) ListCustomers(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	search := c.Query("search")
	page, limit := pageParams(c)

	q := h.db.Model(&models.PppoeUser{}).Preload("Profile").Preload("Area")
	if search != "" {
		q = q.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	var total int64
	q.Count(&total)
	var users []models.PppoeUser
	q.Order("name asc").Offset((page - 1) * limit).Limit(limit).Find(&users)
	return c.JSON(fiber.Map{
		"success":   true,
		"customers": users,
		"pagination": fiber.Map{
			"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// POST /api/technician/customers/create — create a new customer
func (h *TechnicianPortalHandler) CreateCustomer(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var body models.RegistrationRequest
	if err2 := c.Bind().JSON(&body); err2 != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	body.ID = generateID()
	body.Status = "PENDING"
	if err2 := h.db.Create(&body).Error; err2 != nil {
		return c.Status(500).JSON(fiber.Map{"error": err2.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "registration": body})
}

// GET /api/technician/form-data — areas, profiles for dropdowns
func (h *TechnicianPortalHandler) FormData(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var areas []models.PppoeArea
	var profiles []models.PppoeProfile
	h.db.Where("is_active = ?", true).Find(&areas)
	h.db.Where("is_active = ?", true).Find(&profiles)
	return c.JSON(fiber.Map{"success": true, "areas": areas, "profiles": profiles})
}

// GET /api/technician/isolated — isolated users
func (h *TechnicianPortalHandler) IsolatedUsers(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var users []models.PppoeUser
	h.db.Where("status = ?", "isolated").Preload("Profile").Preload("Area").Find(&users)
	return c.JSON(fiber.Map{"success": true, "users": users})
}

// GET /api/technician/offline — offline users
func (h *TechnicianPortalHandler) OfflineUsers(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var users []models.PppoeUser
	h.db.Where("status = ?", "inactive").Preload("Profile").Preload("Area").Find(&users)
	return c.JSON(fiber.Map{"success": true, "users": users})
}

// GET /api/technician/sessions — active sessions visible to technician
func (h *TechnicianPortalHandler) Sessions(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var sessions []models.Radacct
	h.db.Where("acctstoptime IS NULL").
		Order("acctstarttime desc").Limit(100).Find(&sessions)
	return c.JSON(fiber.Map{"success": true, "sessions": sessions})
}

// GET /api/technician/tickets — tickets assigned to or visible by technician
func (h *TechnicianPortalHandler) ListTickets(c fiber.Ctx) error {
	tech, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var tickets []models.Ticket
	h.db.Where("assigned_to_id = ? OR assigned_to_id IS NULL", tech.ID).
		Preload("Customer").Preload("Category").
		Order("created_at desc").Limit(50).Find(&tickets)
	return c.JSON(fiber.Map{"success": true, "tickets": tickets})
}

// GET /api/technician/monitor — network monitoring data
func (h *TechnicianPortalHandler) Monitor(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	var olts []models.NetworkOLT
	h.db.Find(&olts)
	return c.JSON(fiber.Map{"success": true, "olts": olts})
}

// GET /api/technician/genieacs — GenieACS summary for technician
func (h *TechnicianPortalHandler) GenieacsSummary(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "genieacs proxy not configured"})
}

// GET /api/technician/genieacs/devices
func (h *TechnicianPortalHandler) GenieacsDevices(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "devices": []fiber.Map{}})
}

// GET /api/technician/genieacs/devices/:deviceId
func (h *TechnicianPortalHandler) GenieacsDevice(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"success": true, "device": nil})
}

// POST /api/technician/upload — file upload for technician
func (h *TechnicianPortalHandler) Upload(c fiber.Ctx) error {
	_, err := h.techFromHeader(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	file, err2 := c.FormFile("file")
	if err2 != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file required"})
	}
	filename := fmt.Sprintf("tech-%d-%s", time.Now().UnixMilli(), file.Filename)
	uploadPath := "/var/www/salfanet-radius/uploads/" + filename
	if err3 := c.SaveFile(file, uploadPath); err3 != nil {
		// fallback to temp
		uploadPath = "/tmp/" + filename
		_ = c.SaveFile(file, uploadPath)
	}
	return c.JSON(fiber.Map{"success": true, "url": "/api/uploads/" + filename})
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func technicianJWT(tech models.Technician) (string, error) {
	claims := jwt.MapClaims{
		"technicianId": tech.ID,
		"phone":        tech.PhoneNumber,
		"name":         tech.Name,
		"role":         "TECHNICIAN",
		"exp":          time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := config.C.JWTSecret
	if secret == "" {
		secret = "salfanet-secret"
	}
	return token.SignedString([]byte(secret))
}

func (h *TechnicianPortalHandler) techFromHeader(c fiber.Ctx) (*models.Technician, error) {
	authHeader := c.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return nil, fmt.Errorf("missing token")
	}
	tokenStr := authHeader[7:]
	secret := config.C.JWTSecret
	if secret == "" {
		secret = "salfanet-secret"
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}
	techID, _ := claims["technicianId"].(string)
	var tech models.Technician
	if err2 := h.db.First(&tech, "id = ?", techID).Error; err2 != nil {
		return nil, err2
	}
	return &tech, nil
}

// suppress unused import
var _ = strconv.Itoa
var _ = rand.Int
