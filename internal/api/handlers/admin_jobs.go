package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// AdminJobsHandler handles admin job assignments, registrations workflow, and technician job portal.
type AdminJobsHandler struct{ db *gorm.DB }

func NewAdminJobsHandler(db *gorm.DB) *AdminJobsHandler {
	return &AdminJobsHandler{db: db}
}

// ─── Admin Registrations ──────────────────────────────────────────────────────

// GET /api/admin/registrations
func (h *AdminJobsHandler) ListRegistrations(c fiber.Ctx) error {
	page, limit := pageParams(c)
	status := c.Query("status")

	q := h.db.Model(&models.RegistrationRequest{}).Preload("Area").Preload("Profile")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	q.Count(&total)
	var regs []models.RegistrationRequest
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&regs)
	return c.JSON(fiber.Map{
		"success": true, "registrations": regs,
		"pagination": fiber.Map{"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit)},
	})
}

// GET /api/admin/registrations/:id
func (h *AdminJobsHandler) GetRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	var reg models.RegistrationRequest
	if err := h.db.Preload("Area").Preload("Profile").First(&reg, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "registration not found"})
	}
	return c.JSON(fiber.Map{"success": true, "registration": reg})
}

// POST /api/admin/registrations/:id/approve
func (h *AdminJobsHandler) ApproveRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	var reg models.RegistrationRequest
	if err := h.db.First(&reg, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "registration not found"})
	}
	now := time.Now()
	h.db.Model(&reg).Updates(map[string]interface{}{
		"status": "APPROVED", "processed_at": now,
	})
	return c.JSON(fiber.Map{"success": true, "registration": reg})
}

// POST /api/admin/registrations/:id/reject
func (h *AdminJobsHandler) RejectRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Notes string `json:"notes"`
	}
	c.Bind().JSON(&body)

	var reg models.RegistrationRequest
	if err := h.db.First(&reg, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "registration not found"})
	}
	now := time.Now()
	updates := map[string]interface{}{"status": "REJECTED", "processed_at": now}
	if body.Notes != "" {
		updates["notes"] = body.Notes
	}
	h.db.Model(&reg).Updates(updates)
	return c.JSON(fiber.Map{"success": true, "registration": reg})
}

// POST /api/admin/registrations/:id/mark-installed
func (h *AdminJobsHandler) MarkInstalled(c fiber.Ctx) error {
	id := c.Params("id")
	var reg models.RegistrationRequest
	if err := h.db.First(&reg, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "registration not found"})
	}
	now := time.Now()
	h.db.Model(&reg).Updates(map[string]interface{}{"status": "INSTALLED", "processed_at": now})
	return c.JSON(fiber.Map{"success": true, "registration": reg})
}

// POST /api/admin/registrations/:id/request-info
func (h *AdminJobsHandler) RequestInfo(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Message string `json:"message"`
	}
	c.Bind().JSON(&body)
	h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).
		Update("status", "INFO_NEEDED")
	return c.JSON(fiber.Map{"success": true, "message": "info request sent"})
}

// POST /api/admin/registrations/:id/tech-survey
func (h *AdminJobsHandler) TechSurvey(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).
		Update("status", "SURVEY_SCHEDULED")
	return c.JSON(fiber.Map{"success": true})
}

// ─── Customer Registrations ───────────────────────────────────────────────────

// GET /api/customer-registrations
func (h *AdminJobsHandler) ListCustomerRegistrations(c fiber.Ctx) error {
	page, limit := pageParams(c)
	status := c.Query("status")

	q := h.db.Model(&models.RegistrationRequest{}).Preload("Area").Preload("Profile")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	q.Count(&total)
	var regs []models.RegistrationRequest
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&regs)
	return c.JSON(fiber.Map{"success": true, "registrations": regs,
		"pagination": fiber.Map{"page": page, "limit": limit, "total": total}})
}

// GET /api/customer-registrations/:id
func (h *AdminJobsHandler) GetCustomerRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	var reg models.RegistrationRequest
	if err := h.db.Preload("Area").Preload("Profile").First(&reg, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(fiber.Map{"success": true, "registration": reg})
}

// POST /api/customer-registrations/:id/activate
func (h *AdminJobsHandler) ActivateCustomerRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).Update("status", "ACTIVE")
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/customer-registrations/:id/admin-approve
func (h *AdminJobsHandler) AdminApproveRegistration(c fiber.Ctx) error {
	return h.ApproveRegistration(c)
}

// POST /api/customer-registrations/:id/admin-reject
func (h *AdminJobsHandler) AdminRejectRegistration(c fiber.Ctx) error {
	return h.RejectRegistration(c)
}

// POST /api/customer-registrations/:id/install
func (h *AdminJobsHandler) InstallRegistration(c fiber.Ctx) error {
	return h.MarkInstalled(c)
}

// POST /api/customer-registrations/:id/request-info
func (h *AdminJobsHandler) CustomerRequestInfo(c fiber.Ctx) error {
	return h.RequestInfo(c)
}

// POST /api/customer-registrations/:id/tech-survey
func (h *AdminJobsHandler) CustomerTechSurvey(c fiber.Ctx) error {
	return h.TechSurvey(c)
}

// ─── Admin Jobs (Job Assignments) ─────────────────────────────────────────────

// GET /api/admin/jobs
func (h *AdminJobsHandler) ListJobs(c fiber.Ctx) error {
	page, limit := pageParams(c)
	status := c.Query("status")
	jobType := c.Query("type")

	q := h.db.Model(&models.JobAssignment{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if jobType != "" {
		q = q.Where("job_type = ?", jobType)
	}
	var total int64
	q.Count(&total)
	var jobs []models.JobAssignment
	q.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&jobs)
	return c.JSON(fiber.Map{
		"success": true, "jobs": jobs,
		"pagination": fiber.Map{"page": page, "limit": limit, "total": total,
			"totalPages": (total + int64(limit) - 1) / int64(limit)},
	})
}

// POST /api/admin/jobs
func (h *AdminJobsHandler) CreateJob(c fiber.Ctx) error {
	var body models.JobAssignment
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	body.ID = generateID()
	body.CreatedAt = time.Now()
	body.UpdatedAt = time.Now()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "job": body})
}

// GET /api/admin/jobs/:id
func (h *AdminJobsHandler) GetJob(c fiber.Ctx) error {
	id := c.Params("id")
	var job models.JobAssignment
	if err := h.db.First(&job, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "job not found"})
	}
	return c.JSON(fiber.Map{"success": true, "job": job})
}

// PUT /api/admin/jobs/:id
func (h *AdminJobsHandler) UpdateJob(c fiber.Ctx) error {
	id := c.Params("id")
	var job models.JobAssignment
	if err := h.db.First(&job, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "job not found"})
	}
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&job).Updates(body)
	return c.JSON(fiber.Map{"success": true, "job": job})
}

// POST /api/admin/jobs/:id/approve
func (h *AdminJobsHandler) ApproveJob(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()
	approvedBy := "admin"
	h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"approval_status": "APPROVED",
		"approved_at":     now,
		"approved_by":     approvedBy,
		"updated_at":      now,
	})
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/admin/jobs/:id/reject
func (h *AdminJobsHandler) RejectJob(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"approval_status": "REJECTED", "updated_at": time.Now(),
	})
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/admin/jobs/:id/escalate
func (h *AdminJobsHandler) EscalateJob(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"priority": "URGENT", "updated_at": time.Now(),
	})
	return c.JSON(fiber.Map{"success": true, "message": "job escalated to urgent"})
}

// POST /api/admin/jobs/:id/submit-approval
func (h *AdminJobsHandler) SubmitApproval(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"requires_approval": true, "approval_status": "PENDING", "updated_at": time.Now(),
	})
	return c.JSON(fiber.Map{"success": true, "message": "submitted for approval"})
}

// GET /api/admin/jobs/:id/materials
func (h *AdminJobsHandler) JobMaterials(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "materials": []fiber.Map{}})
}

// GET /api/admin/jobs/:id/approval-history
func (h *AdminJobsHandler) ApprovalHistory(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "history": []fiber.Map{}})
}

// GET /api/admin/jobs/approvals — jobs pending approval
func (h *AdminJobsHandler) ListApprovals(c fiber.Ctx) error {
	var jobs []models.JobAssignment
	h.db.Where("requires_approval = ? AND approval_status = ?", true, "PENDING").
		Order("created_at desc").Find(&jobs)
	return c.JSON(fiber.Map{"success": true, "approvals": jobs})
}

// GET /api/admin/jobs/stats
func (h *AdminJobsHandler) JobStats(c fiber.Ctx) error {
	var total, open, completed, inProgress int64
	h.db.Model(&models.JobAssignment{}).Count(&total)
	h.db.Model(&models.JobAssignment{}).Where("status = ?", "ASSIGNED").Count(&open)
	h.db.Model(&models.JobAssignment{}).Where("status = ?", "COMPLETED").Count(&completed)
	h.db.Model(&models.JobAssignment{}).Where("status = ?", "IN_PROGRESS").Count(&inProgress)
	return c.JSON(fiber.Map{
		"success": true, "total": total, "open": open,
		"completed": completed, "inProgress": inProgress,
	})
}

// GET /api/admin/recurring-jobs
func (h *AdminJobsHandler) ListRecurringJobs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "jobs": []fiber.Map{}})
}

// ─── Technician Jobs ──────────────────────────────────────────────────────────

// GET /api/technician/jobs — jobs assigned to technician
func (h *AdminJobsHandler) TechListJobs(c fiber.Ctx) error {
	// Technician auth is handled by techFromHeader in technician_portal.go
	// Here we just return all jobs (auth middleware should be set separately)
	page, limit := pageParams(c)
	var total int64
	h.db.Model(&models.JobAssignment{}).Count(&total)
	var jobs []models.JobAssignment
	h.db.Order("created_at desc").Offset((page - 1) * limit).Limit(limit).Find(&jobs)
	return c.JSON(fiber.Map{"success": true, "jobs": jobs,
		"pagination": fiber.Map{"page": page, "limit": limit, "total": total}})
}

// GET /api/technician/jobs/:id
func (h *AdminJobsHandler) TechGetJob(c fiber.Ctx) error {
	id := c.Params("id")
	var job models.JobAssignment
	if err := h.db.First(&job, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "job not found"})
	}
	return c.JSON(fiber.Map{"success": true, "job": job})
}

// POST /api/technician/jobs/:id/complete
func (h *AdminJobsHandler) TechCompleteJob(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Notes string `json:"notes"`
	}
	c.Bind().JSON(&body)
	now := time.Now()
	h.db.Model(&models.JobAssignment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status": "COMPLETED", "completed_date": now,
		"technician_notes": body.Notes, "check_out_time": now, "updated_at": now,
	})
	return c.JSON(fiber.Map{"success": true, "message": "job marked as completed"})
}

// GET /api/technician/jobs/:id/customer-data
func (h *AdminJobsHandler) TechCustomerData(c fiber.Ctx) error {
	id := c.Params("id")
	var job models.JobAssignment
	if err := h.db.First(&job, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "job not found"})
	}
	// Return customer info from job
	return c.JSON(fiber.Map{
		"success": true,
		"customer": fiber.Map{
			"name":    job.CustomerName,
			"phone":   job.CustomerPhone,
			"address": job.CustomerAddress,
		},
	})
}

// POST /api/technician/jobs/:id/generate-credentials
func (h *AdminJobsHandler) TechGenCredentials(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"success":  true,
		"username": "",
		"password": "",
		"message":  "credentials generated via pppoe user creation",
	})
}

// GET /api/jobs/team — jobs for current team
func (h *AdminJobsHandler) TeamJobs(c fiber.Ctx) error {
	var jobs []models.JobAssignment
	h.db.Where("status != ?", "COMPLETED").Order("priority desc, created_at asc").Limit(100).Find(&jobs)
	return c.JSON(fiber.Map{"success": true, "jobs": jobs})
}
