package handlers

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/api/middleware"
	"github.com/s4lfanet/salfanet-radius-go/internal/config"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	db *gorm.DB
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(db *gorm.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

// Login godoc
// POST /api/auth/login
func (h *AuthHandler) Login(c fiber.Ctx) error {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if body.Email == "" || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "email and password required"})
	}

	var user models.User
	if err := h.db.Where("email = ?", body.Email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(body.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	accessToken, err := generateToken(user, 24*time.Hour)
	if err != nil {
		log.Error().Err(err).Msg("auth: failed to generate token")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	refreshToken, err := generateToken(user, 30*24*time.Hour)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(fiber.Map{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user": fiber.Map{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// Logout godoc
// POST /api/auth/logout
func (h *AuthHandler) Logout(c fiber.Ctx) error {
	// Stateless JWT: client-side token removal is sufficient.
	// If refresh token table is implemented, delete the token here.
	return c.JSON(fiber.Map{"message": "logged out"})
}

// Session godoc
// GET /api/auth/session
func (h *AuthHandler) Session(c fiber.Ctx) error {
	userID, _ := c.Locals("userID").(string)
	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "session not found"})
	}
	return c.JSON(fiber.Map{
		"id":    user.ID,
		"email": user.Email,
		"name":  user.Name,
		"role":  user.Role,
	})
}

// Refresh godoc
// POST /api/auth/refresh
func (h *AuthHandler) Refresh(c fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "refreshToken required"})
	}

	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(body.RefreshToken, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.C.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid refresh token"})
	}

	var user models.User
	if err := h.db.First(&user, "id = ?", claims.UserID).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}

	newAccess, err := generateToken(user, 24*time.Hour)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(fiber.Map{"accessToken": newAccess})
}

// CustomerLogin godoc
// POST /api/auth/customer/login
func (h *AuthHandler) CustomerLogin(c fiber.Ctx) error {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "phone required"})
	}

	var user models.PppoeUser
	if err := h.db.Where("phone = ?", body.Phone).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "phone number not registered"})
	}

	// Generate 6-digit OTP
	otp := generateOTP()
	expiry := time.Now().Add(5 * time.Minute)

	// Store OTP in customer_sessions
	sessionID := uuid.NewString()
	session := models.CustomerSession{
		ID:        sessionID,
		UserID:    user.ID,
		Phone:     body.Phone,
		OTPCode:   &otp,
		OTPExpiry: &expiry,
		Verified:  false,
	}
	h.db.Create(&session)

	// TODO: Send OTP via wa-service
	log.Info().Str("phone", body.Phone).Str("otp", otp).Msg("customer login OTP generated")

	return c.JSON(fiber.Map{
		"message":   "OTP sent via WhatsApp",
		"sessionId": sessionID,
	})
}

// CustomerVerifyOTP godoc
// POST /api/auth/customer/verify-otp
func (h *AuthHandler) CustomerVerifyOTP(c fiber.Ctx) error {
	var body struct {
		SessionID string `json:"sessionId"`
		OTP       string `json:"otp"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	var session models.CustomerSession
	if err := h.db.Where("id = ?", body.SessionID).First(&session).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "session not found"})
	}

	if session.OTPCode == nil || *session.OTPCode != body.OTP {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid OTP"})
	}
	if session.OTPExpiry != nil && time.Now().After(*session.OTPExpiry) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "OTP expired"})
	}

	// Mark verified, generate session token
	token := uuid.NewString()
	expiry := time.Now().Add(7 * 24 * time.Hour)
	h.db.Model(&session).Updates(map[string]interface{}{
		"verified":   true,
		"token":      token,
		"expires_at": expiry,
		"otp_code":   nil,
	})

	return c.JSON(fiber.Map{
		"token":     token,
		"expiresAt": expiry,
	})
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func generateToken(user models.User, duration time.Duration) (string, error) {
	claims := middleware.Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.C.JWTSecret))
}

func generateOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		// Fallback (should not happen)
		return fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	}
	return fmt.Sprintf("%06d", n.Int64())
}
