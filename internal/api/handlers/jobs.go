package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"gorm.io/gorm"
)

type JobHandler struct {
	db *gorm.DB
}

func NewJobHandler(db *gorm.DB) *JobHandler {
	return &JobHandler{db: db}
}

// GET /api/admin/jobs
func (h *JobHandler) List(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	query := h.db.Model(&models.JobAssignment{}).
		Preload("AssignedToEmployee").
		Preload("AssignedByEmployee")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if jobType := c.Query("jobType"); jobType != "" {
		query = query.Where("jobType = ?", jobType)
	}
	if priority := c.Query("priority"); priority != "" {
		query = query.Where("priority = ?", priority)
	}
	if assignedTo := c.Query("assignedTo"); assignedTo != "" {
		query = query.Where("assignedTo = ?", assignedTo)
	}
	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		query = query.Where("customerName LIKE ? OR customerPhone LIKE ? OR customerAddress LIKE ?",
			like, like, like)
	}
	if dateFrom := c.Query("dateFrom"); dateFrom != "" {
		if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
			query = query.Where("createdAt >= ?", t)
		}
	}
	if dateTo := c.Query("dateTo"); dateTo != "" {
		if t, err := time.Parse("2006-01-02", dateTo); err == nil {
			query = query.Where("createdAt <= ?", t.Add(24*time.Hour-time.Second))
		}
	}
	if approvalStatus := c.Query("approvalStatus"); approvalStatus != "" {
		query = query.Where("approvalStatus = ?", approvalStatus)
	}

	sortBy := c.Query("sortBy", "createdAt")
	sortOrder := c.Query("sortOrder", "desc")
	// Validate sortBy to prevent SQL injection
	allowed := map[string]bool{
		"createdAt": true, "updatedAt": true, "scheduledDate": true,
		"priority": true, "status": true, "customerName": true,
	}
	if !allowed[sortBy] {
		sortBy = "createdAt"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	var total int64
	query.Count(&total)

	var jobs []models.JobAssignment
	query.Order(sortBy + " " + sortOrder).
		Limit(limit).Offset((page - 1) * limit).
		Find(&jobs)

	return c.JSON(fiber.Map{
		"data": jobs,
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// GET /api/admin/jobs/:id
func (h *JobHandler) Get(c fiber.Ctx) error {
	id := c.Params("id")
	var job models.JobAssignment
	if err := h.db.Preload("AssignedToEmployee").Preload("AssignedByEmployee").
		First(&job, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Job not found"})
	}
	return c.JSON(job)
}

// POST /api/admin/jobs
func (h *JobHandler) Create(c fiber.Ctx) error {
	var body struct {
		JobType          string   `json:"jobType"`
		JobCategory      *string  `json:"jobCategory"`
		Priority         string   `json:"priority"`
		ScheduledDate    *string  `json:"scheduledDate"`
		Description      *string  `json:"description"`
		CustomerName     string   `json:"customerName"`
		CustomerPhone    string   `json:"customerPhone"`
		CustomerAddress  string   `json:"customerAddress"`
		Latitude         *float64 `json:"latitude"`
		Longitude        *float64 `json:"longitude"`
		AssignedTo       *string  `json:"assignedTo"`
		AssignedBy       *string  `json:"assignedBy"`
		RegistrationID   *string  `json:"registrationId"`
		TicketID         *string  `json:"ticketId"`
		RequiresApproval bool     `json:"requiresApproval"`
		EstimatedCost    *float64 `json:"estimatedCost"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.JobType == "" || body.CustomerName == "" || body.CustomerPhone == "" || body.CustomerAddress == "" {
		return c.Status(400).JSON(fiber.Map{"error": "jobType, customerName, customerPhone, customerAddress are required"})
	}
	if body.Priority == "" {
		body.Priority = "MEDIUM"
	}

	job := models.JobAssignment{
		ID:               uuid.New().String(),
		JobType:          body.JobType,
		JobCategory:      body.JobCategory,
		Priority:         body.Priority,
		Status:           "ASSIGNED",
		Description:      body.Description,
		CustomerName:     body.CustomerName,
		CustomerPhone:    body.CustomerPhone,
		CustomerAddress:  body.CustomerAddress,
		Latitude:         body.Latitude,
		Longitude:        body.Longitude,
		AssignedTo:       body.AssignedTo,
		AssignedBy:       body.AssignedBy,
		RegistrationID:   body.RegistrationID,
		TicketID:         body.TicketID,
		RequiresApproval: body.RequiresApproval,
		EstimatedCost:    body.EstimatedCost,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	if body.ScheduledDate != nil {
		if t, err := time.Parse("2006-01-02T15:04:05Z07:00", *body.ScheduledDate); err == nil {
			job.ScheduledDate = &t
		} else if t, err := time.Parse("2006-01-02", *body.ScheduledDate); err == nil {
			job.ScheduledDate = &t
		}
	}
	if body.RequiresApproval {
		s := "PENDING"
		job.ApprovalStatus = &s
	}

	if err := h.db.Create(&job).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create job"})
	}
	return c.Status(201).JSON(job)
}

// PATCH /api/admin/jobs/:id/status
func (h *JobHandler) UpdateStatus(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Status          string  `json:"status"`
		TechnicianNotes *string `json:"technicianNotes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Status == "" {
		return c.Status(400).JSON(fiber.Map{"error": "status is required"})
	}

	updates := map[string]interface{}{
		"status":    body.Status,
		"updatedAt": time.Now(),
	}
	if body.TechnicianNotes != nil {
		updates["technicianNotes"] = *body.TechnicianNotes
	}
	if body.Status == "COMPLETED" {
		now := time.Now()
		updates["completedDate"] = now
	}

	result := h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(updates)
	if result.RowsAffected == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Job not found"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Status updated"})
}

// GET /api/admin/jobs/stats
func (h *JobHandler) Stats(c fiber.Ctx) error {
	type statusCount struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}
	var results []statusCount
	h.db.Model(&models.JobAssignment{}).
		Select("status, COUNT(*) as count").
		Group("status").
		Scan(&results)

	stats := fiber.Map{}
	var total int64
	for _, r := range results {
		stats[r.Status] = r.Count
		total += r.Count
	}
	stats["total"] = total

	return c.JSON(fiber.Map{"success": true, "data": stats})
}

// GET /api/admin/employees  — list active employees for job assignment
func (h *JobHandler) ListEmployees(c fiber.Ctx) error {
	var employees []models.Employee
	query := h.db.Model(&models.Employee{}).Where("isActive = ?", true)
	if search := c.Query("search"); search != "" {
		query = query.Where("name LIKE ? OR phoneNumber LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	query.Order("name ASC").Find(&employees)
	return c.JSON(fiber.Map{"success": true, "data": employees})
}
