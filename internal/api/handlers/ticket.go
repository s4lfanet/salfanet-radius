package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// TicketHandler handles support ticket endpoints.
type TicketHandler struct {
	db *gorm.DB
}

func NewTicketHandler(db *gorm.DB) *TicketHandler { return &TicketHandler{db: db} }

func (h *TicketHandler) ListTickets(c fiber.Ctx) error {
	var tickets []models.Ticket
	query := h.db.Preload("Customer").Preload("Category")
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	query.Order("createdAt DESC").Limit(200).Find(&tickets)
	return c.JSON(tickets)
}

func (h *TicketHandler) CreateTicket(c fiber.Ctx) error {
	var body models.Ticket
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if body.TicketNumber == "" {
		body.TicketNumber = uuid.New().String()[:12]
	}
	if body.Priority == "" {
		body.Priority = "MEDIUM"
	}
	if body.Status == "" {
		body.Status = "OPEN"
	}
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *TicketHandler) GetTicket(c fiber.Ctx) error {
	id := c.Params("id")
	var ticket models.Ticket
	if err := h.db.Preload("Customer").Preload("Category").First(&ticket, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	var replies []models.TicketReply
	h.db.Where("ticketId = ?", id).Order("createdAt ASC").Find(&replies)
	return c.JSON(fiber.Map{"ticket": ticket, "replies": replies})
}

func (h *TicketHandler) UpdateTicket(c fiber.Ctx) error {
	id := c.Params("id")
	var ticket models.Ticket
	if err := h.db.First(&ticket, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&ticket); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&ticket)
	return c.JSON(ticket)
}

func (h *TicketHandler) ReplyTicket(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Message string `json:"message"`
		IsAdmin bool   `json:"isAdmin"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	reply := models.TicketReply{
		ID:       uuid.New().String(),
		TicketID: id,
		Message:  body.Message,
		IsAdmin:  body.IsAdmin,
	}
	h.db.Create(&reply)
	return c.Status(fiber.StatusCreated).JSON(reply)
}

func (h *TicketHandler) CloseTicket(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.Ticket{}).Where("id = ?", id).Update("status", "CLOSED")
	return c.JSON(fiber.Map{"message": "closed"})
}
