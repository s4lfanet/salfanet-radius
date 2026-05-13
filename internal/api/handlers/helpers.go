package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// generateID returns a new random UUID string used as primary key.
func generateID() string {
	return uuid.New().String()
}

// pageParams extracts page and pageSize from query params.
// This helper is shared across all handlers in the same package.
func pageParams(c fiber.Ctx) (page, pageSize int) {
	page = 1
	pageSize = 50
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.Query("pageSize")); err == nil && v > 0 && v <= 500 {
		pageSize = v
	}
	return
}
