package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// PermissionsHandler handles RBAC permission endpoints.
type PermissionsHandler struct{ db *gorm.DB }

func NewPermissionsHandler(db *gorm.DB) *PermissionsHandler { return &PermissionsHandler{db: db} }

// GetPermissions GET /api/permissions — all permissions grouped by category
func (h *PermissionsHandler) GetPermissions(c fiber.Ctx) error {
	var perms []models.Permission
	h.db.Where("isActive = true").Order("category, name").Find(&perms)

	grouped := make(map[string][]models.Permission)
	for _, p := range perms {
		grouped[p.Category] = append(grouped[p.Category], p)
	}
	return c.JSON(fiber.Map{"success": true, "permissions": grouped})
}

// GetRolePermissions GET /api/permissions/role/:role
func (h *PermissionsHandler) GetRolePermissions(c fiber.Ctx) error {
	role := c.Params("role")
	var rolePerms []models.RolePermission
	h.db.Preload("Permission").Where("role = ?", role).Find(&rolePerms)

	keys := make([]string, 0, len(rolePerms))
	for _, rp := range rolePerms {
		if rp.Permission != nil {
			keys = append(keys, rp.Permission.Key)
		}
	}
	return c.JSON(fiber.Map{"success": true, "role": role, "permissions": keys})
}

// UpdateRolePermissions PUT /api/permissions/role/:role — bulk replace
func (h *PermissionsHandler) UpdateRolePermissions(c fiber.Ctx) error {
	role := c.Params("role")
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	// Resolve permission IDs from keys
	var perms []models.Permission
	if len(body.Permissions) > 0 {
		h.db.Where("`key` IN ?", body.Permissions).Find(&perms)
	}

	// Delete existing and insert new within a transaction
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("role = ?", role).Delete(&models.RolePermission{}).Error; err != nil {
			return err
		}
		for _, p := range perms {
			if err := tx.Create(&models.RolePermission{
				ID:           uuid.New().String(),
				Role:         role,
				PermissionID: p.ID,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Permissions updated"})
}

// GetRoleTemplates GET /api/permissions/role-templates — all roles' permissions
func (h *PermissionsHandler) GetRoleTemplates(c fiber.Ctx) error {
	roles := []string{"SUPER_ADMIN", "FINANCE", "CUSTOMER_SERVICE", "TECHNICIAN", "MARKETING", "VIEWER"}

	var rolePerms []models.RolePermission
	h.db.Preload("Permission").Find(&rolePerms)

	templates := make(map[string][]string)
	for _, role := range roles {
		templates[role] = []string{}
	}
	for _, rp := range rolePerms {
		if rp.Permission != nil {
			templates[rp.Role] = append(templates[rp.Role], rp.Permission.Key)
		}
	}
	return c.JSON(fiber.Map{"success": true, "templates": templates})
}
