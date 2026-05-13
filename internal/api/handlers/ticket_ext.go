package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type TicketExtHandler struct{ db *gorm.DB }

func NewTicketExtHandler(db *gorm.DB) *TicketExtHandler { return &TicketExtHandler{db: db} }

// GET /api/tickets/categories
func (h *TicketExtHandler) ListCategories(c fiber.Ctx) error {
	var cats []models.TicketCategory
	h.db.Order("name").Find(&cats)
	return c.JSON(fiber.Map{"success": true, "categories": cats})
}

// POST /api/tickets/categories
func (h *TicketExtHandler) CreateCategory(c fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name required"})
	}
	cat := models.TicketCategory{ID: generateID(), Name: body.Name}
	if err := h.db.Create(&cat).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "create failed"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "category": cat})
}

// GET /api/tickets/stats
func (h *TicketExtHandler) Stats(c fiber.Ctx) error {
	type TicketStats struct {
		Total    int64
		Open     int64
		Resolved int64
		Pending  int64
	}
	var stats TicketStats
	h.db.Model(&models.Ticket{}).Count(&stats.Total)
	h.db.Model(&models.Ticket{}).Where("status = ?", "OPEN").Count(&stats.Open)
	h.db.Model(&models.Ticket{}).Where("status = ?", "RESOLVED").Count(&stats.Resolved)
	h.db.Model(&models.Ticket{}).Where("status = ?", "PENDING").Count(&stats.Pending)

	type CategoryCount struct {
		CategoryID   *string `json:"categoryId"`
		CategoryName string  `json:"categoryName"`
		Count        int64   `json:"count"`
	}
	var byCategory []CategoryCount
	h.db.Raw(`SELECT t.category_id, c.name as category_name, COUNT(t.id) as count
		FROM tickets t LEFT JOIN ticket_categories c ON c.id = t.category_id
		GROUP BY t.category_id, c.name ORDER BY count DESC`).Scan(&byCategory)

	return c.JSON(fiber.Map{
		"success":    true,
		"total":      stats.Total,
		"open":       stats.Open,
		"resolved":   stats.Resolved,
		"pending":    stats.Pending,
		"byCategory": byCategory,
	})
}

// GET /api/tickets/messages?ticketId=...
func (h *TicketExtHandler) ListMessages(c fiber.Ctx) error {
	ticketID := c.Query("ticketId")
	if ticketID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ticketId required"})
	}
	var replies []models.TicketReply
	h.db.Where("ticket_id = ?", ticketID).Order("created_at asc").Find(&replies)
	return c.JSON(fiber.Map{"success": true, "messages": replies})
}

// GET /api/tickets/dispatch — list unassigned or for dispatch
func (h *TicketExtHandler) ListDispatch(c fiber.Ctx) error {
	page := 1
	limit := 20
	if v, err := strconv.Atoi(c.Query("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	var tickets []models.Ticket
	var total int64
	h.db.Model(&models.Ticket{}).Where("assigned_to_id IS NULL AND status = ?", "OPEN").Count(&total)
	h.db.Preload("Category").Preload("Customer").
		Where("assigned_to_id IS NULL AND status = ?", "OPEN").
		Order("created_at desc").
		Offset((page - 1) * limit).Limit(limit).
		Find(&tickets)
	return c.JSON(fiber.Map{
		"success": true,
		"tickets": tickets,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// POST /api/tickets/dispatch — assign ticket to technician
func (h *TicketExtHandler) Dispatch(c fiber.Ctx) error {
	var body struct {
		TicketID     string  `json:"ticketId"`
		TechnicianID *string `json:"technicianId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.TicketID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ticketId required"})
	}
	h.db.Model(&models.Ticket{}).Where("id = ?", body.TicketID).
		Updates(map[string]interface{}{"assigned_to_id": body.TechnicianID})
	return c.JSON(fiber.Map{"success": true, "message": "ticket dispatched"})
}
