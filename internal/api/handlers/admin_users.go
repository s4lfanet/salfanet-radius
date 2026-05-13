package handlers

import (
	"github.com/gofiber/fiber/v3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type AdminUserHandler struct{ db *gorm.DB }

func NewAdminUserHandler(db *gorm.DB) *AdminUserHandler { return &AdminUserHandler{db: db} }

// GET /api/admin/users
func (h *AdminUserHandler) List(c fiber.Ctx) error {
	var users []models.AdminUser
	h.db.Order("created_at desc").Find(&users)

	type UserOut struct {
		models.AdminUser
		Permissions []string `json:"permissions"`
	}
	out := make([]UserOut, 0, len(users))
	for _, u := range users {
		var ups []models.UserPermission
		h.db.Preload("Permission").Where("user_id = ?", u.ID).Find(&ups)
		perms := make([]string, 0, len(ups))
		for _, up := range ups {
			if up.Permission != nil {
				perms = append(perms, up.Permission.Key)
			}
		}
		out = append(out, UserOut{AdminUser: u, Permissions: perms})
	}
	return c.JSON(fiber.Map{"success": true, "users": out})
}

// POST /api/admin/users
func (h *AdminUserHandler) Create(c fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Phone    string `json:"phone"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Username == "" || body.Password == "" || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "username, password and name required"})
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to hash password"})
	}
	role := body.Role
	if role == "" {
		role = "CUSTOMER_SERVICE"
	}
	u := models.AdminUser{
		ID:       generateID(),
		Username: body.Username,
		Password: string(hashed),
		Name:     body.Name,
		Role:     role,
		IsActive: true,
	}
	if body.Email != "" {
		u.Email = &body.Email
	}
	if body.Phone != "" {
		u.Phone = &body.Phone
	}
	if err := h.db.Create(&u).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "username or email already exists"})
	}
	u.Password = ""
	return c.Status(201).JSON(fiber.Map{"success": true, "user": u})
}

// GET /api/admin/users/:id
func (h *AdminUserHandler) Get(c fiber.Ctx) error {
	id := c.Params("id")
	var u models.AdminUser
	if err := h.db.Where("id = ?", id).First(&u).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}
	var ups []models.UserPermission
	h.db.Preload("Permission").Where("user_id = ?", id).Find(&ups)
	perms := make([]string, 0, len(ups))
	for _, up := range ups {
		if up.Permission != nil {
			perms = append(perms, up.Permission.Key)
		}
	}
	return c.JSON(fiber.Map{"success": true, "user": u, "permissions": perms})
}

// PUT /api/admin/users/:id
func (h *AdminUserHandler) Update(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if pw, ok := body["password"].(string); ok && pw != "" {
		hashed, _ := bcrypt.GenerateFromPassword([]byte(pw), 10)
		body["password"] = string(hashed)
	} else {
		delete(body, "password")
	}
	delete(body, "id")
	if err := h.db.Model(&models.AdminUser{}).Where("id = ?", id).Updates(body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update failed"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /api/admin/users/:id
func (h *AdminUserHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Where("user_id = ?", id).Delete(&models.UserPermission{})
	h.db.Delete(&models.AdminUser{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/admin/users/:id/permissions
func (h *AdminUserHandler) GetPermissions(c fiber.Ctx) error {
	id := c.Params("id")
	var ups []models.UserPermission
	h.db.Preload("Permission").Where("user_id = ?", id).Find(&ups)
	perms := make([]string, 0, len(ups))
	for _, up := range ups {
		if up.Permission != nil {
			perms = append(perms, up.Permission.Key)
		}
	}
	return c.JSON(fiber.Map{"success": true, "permissions": perms})
}

// PUT /api/admin/users/:id/permissions
func (h *AdminUserHandler) SetPermissions(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	// Delete existing
	h.db.Where("user_id = ?", id).Delete(&models.UserPermission{})
	// Re-add
	for _, permKey := range body.Permissions {
		var perm models.Permission
		if err := h.db.Where("key = ?", permKey).First(&perm).Error; err != nil {
			continue
		}
		h.db.Create(&models.UserPermission{
			ID:           generateID(),
			UserID:       id,
			PermissionID: perm.ID,
		})
	}
	return c.JSON(fiber.Map{"success": true})
}
