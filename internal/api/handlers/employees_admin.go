package handlers

import (
	"encoding/json"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"gorm.io/gorm"
)

type EmployeeAdminHandler struct {
	db *gorm.DB
}

func NewEmployeeAdminHandler(db *gorm.DB) *EmployeeAdminHandler {
	return &EmployeeAdminHandler{db: db}
}

var validRoles = map[string]bool{
	"TECHNICIAN":       true,
	"BILLING":          true,
	"COORDINATOR":      true,
	"CUSTOMER_SERVICE": true,
	"INVENTORY":        true,
	"FINANCE":          true,
}

// GET /api/admin/employees — list employees with filters + stats
func (h *EmployeeAdminHandler) List(c fiber.Ctx) error {
	q := h.db.Model(&models.Employee{})

	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		q = q.Where("name LIKE ? OR phoneNumber LIKE ? OR employeeId LIKE ?", like, like, like)
	}
	if role := c.Query("role"); role != "" {
		q = q.Where("JSON_CONTAINS(roles, JSON_QUOTE(?), '$')", role)
	}
	if isActiveStr := c.Query("isActive"); isActiveStr != "" {
		isActive := isActiveStr == "true" || isActiveStr == "1"
		q = q.Where("isActive = ?", isActive)
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	var employees []models.Employee
	if err := q.Order("name ASC").Limit(limit).Offset(offset).Find(&employees).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	// Stats
	var totalEmp, activeEmp, inactiveEmp int64
	h.db.Model(&models.Employee{}).Count(&totalEmp)
	h.db.Model(&models.Employee{}).Where("isActive = ?", true).Count(&activeEmp)
	inactiveEmp = totalEmp - activeEmp

	byRole := map[string]int64{}
	for r := range validRoles {
		var cnt int64
		h.db.Model(&models.Employee{}).
			Where("JSON_CONTAINS(roles, JSON_QUOTE(?), '$')", r).
			Count(&cnt)
		byRole[r] = cnt
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    employees,
		"stats": fiber.Map{
			"total":    totalEmp,
			"active":   activeEmp,
			"inactive": inactiveEmp,
			"byRole":   byRole,
		},
		"pagination": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (int(total) + limit - 1) / limit,
		},
	})
}

// POST /api/admin/employees — create employee
func (h *EmployeeAdminHandler) Create(c fiber.Ctx) error {
	var body struct {
		Name        string   `json:"name"`
		PhoneNumber string   `json:"phoneNumber"`
		Email       string   `json:"email"`
		Address     string   `json:"address"`
		Roles       []string `json:"roles"`
		EmployeeID  string   `json:"employeeId"`
		IsActive    *bool    `json:"isActive"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if body.Name == "" || body.PhoneNumber == "" || len(body.Roles) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "name, phoneNumber, and at least one role are required"})
	}

	// Validate roles
	for _, r := range body.Roles {
		if !validRoles[r] {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid role: " + r})
		}
	}

	// Check phone uniqueness
	var existing models.Employee
	if err := h.db.Where("phoneNumber = ?", body.PhoneNumber).First(&existing).Error; err == nil {
		return c.Status(409).JSON(fiber.Map{"error": "Phone number already registered"})
	}

	// Check employeeId uniqueness
	if body.EmployeeID != "" {
		var existingByEmpID models.Employee
		if err := h.db.Where("employeeId = ?", body.EmployeeID).First(&existingByEmpID).Error; err == nil {
			return c.Status(409).JSON(fiber.Map{"error": "Employee ID already exists"})
		}
	}

	rolesJSON := buildRolesJSON(body.Roles)

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	var email *string
	if body.Email != "" {
		email = &body.Email
	}
	var address *string
	if body.Address != "" {
		address = &body.Address
	}
	var empID *string
	if body.EmployeeID != "" {
		empID = &body.EmployeeID
	}

	emp := models.Employee{
		ID:          uuid.New().String(),
		Name:        body.Name,
		PhoneNumber: body.PhoneNumber,
		Email:       email,
		Address:     address,
		Roles:       rolesJSON,
		IsActive:    isActive,
		EmployeeID:  empID,
	}

	if err := h.db.Create(&emp).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create employee"})
	}

	return c.Status(201).JSON(fiber.Map{"success": true, "message": "Employee created", "data": emp})
}

// PUT /api/admin/employees/:id — update employee
func (h *EmployeeAdminHandler) Update(c fiber.Ctx) error {
	id := c.Params("id")

	var existing models.Employee
	if err := h.db.Where("id = ?", id).First(&existing).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Employee not found"})
	}

	var body struct {
		Name        *string  `json:"name"`
		PhoneNumber *string  `json:"phoneNumber"`
		Email       *string  `json:"email"`
		Address     *string  `json:"address"`
		Roles       []string `json:"roles"`
		EmployeeID  *string  `json:"employeeId"`
		IsActive    *bool    `json:"isActive"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	updates := map[string]interface{}{}
	if body.Name != nil {
		updates["name"] = *body.Name
	}
	if body.PhoneNumber != nil {
		// Check uniqueness (excluding self)
		var conflict models.Employee
		if err := h.db.Where("phoneNumber = ? AND id != ?", *body.PhoneNumber, id).First(&conflict).Error; err == nil {
			return c.Status(409).JSON(fiber.Map{"error": "Phone number already registered"})
		}
		updates["phoneNumber"] = *body.PhoneNumber
	}
	if body.Email != nil {
		updates["email"] = *body.Email
	}
	if body.Address != nil {
		updates["address"] = *body.Address
	}
	if body.IsActive != nil {
		updates["isActive"] = *body.IsActive
	}
	if body.EmployeeID != nil {
		if *body.EmployeeID != "" {
			var conflict models.Employee
			if err := h.db.Where("employeeId = ? AND id != ?", *body.EmployeeID, id).First(&conflict).Error; err == nil {
				return c.Status(409).JSON(fiber.Map{"error": "Employee ID already exists"})
			}
		}
		updates["employeeId"] = *body.EmployeeID
	}
	if len(body.Roles) > 0 {
		for _, r := range body.Roles {
			if !validRoles[r] {
				return c.Status(400).JSON(fiber.Map{"error": "Invalid role: " + r})
			}
		}
		updates["roles"] = buildRolesJSON(body.Roles)
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"success": true, "message": "No changes", "data": existing})
	}

	if err := h.db.Model(&existing).Updates(updates).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update employee"})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Employee updated", "data": existing})
}

// DELETE /api/admin/employees/:id — delete employee
func (h *EmployeeAdminHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")

	var emp models.Employee
	if err := h.db.Where("id = ?", id).First(&emp).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Employee not found"})
	}

	// Check for active job assignments
	var activeJobs int64
	h.db.Model(&models.JobAssignment{}).
		Where("assignedTo = ? AND status IN ?", id, []string{"ASSIGNED", "IN_PROGRESS"}).
		Count(&activeJobs)
	if activeJobs > 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Cannot delete employee with active job assignments"})
	}

	if err := h.db.Delete(&emp).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete employee"})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Employee deleted"})
}

// buildRolesJSON converts []string to a JSON array string for storage
func buildRolesJSON(roles []string) string {
	b, _ := json.Marshal(roles)
	return string(b)
}
