// Package middleware provides Fiber middleware for the API server.
package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/s4lfanet/salfanet-radius-go/internal/config"
)

// Claims is the JWT payload structure.
type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// AuthMiddleware validates JWT tokens in the Authorization header.
func AuthMiddleware(c fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing authorization header"})
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid authorization format"})
	}
	tokenStr := parts[1]

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return []byte(config.C.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired token"})
	}

	c.Locals("userID", claims.UserID)
	c.Locals("email", claims.Email)
	c.Locals("role", claims.Role)
	return c.Next()
}

// RequireAdmin rejects requests from non-ADMIN users.
func RequireAdmin(c fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	if role != "ADMIN" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "admin access required"})
	}
	return c.Next()
}

// CustomerAuthMiddleware validates customer session tokens from the Authorization header.
// Customer sessions are stored in the customer_sessions table (UUID token).
// This middleware does NOT use JWT — it checks the database directly.
//
// Note: This middleware function is a placeholder that trusts the token as customerID.
// For production, inject *gorm.DB and look up the customer_sessions table.
func CustomerAuthMiddleware(c fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing authorization header"})
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid authorization format"})
	}
	// Token is the customer session UUID — validated in handler via customerID local
	c.Locals("customerToken", parts[1])
	// customerID will be resolved by handler that has DB access
	c.Locals("customerID", parts[1])
	return c.Next()
}
