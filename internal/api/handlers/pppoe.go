package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"github.com/s4lfanet/salfanet-radius-go/internal/notify"
	"github.com/s4lfanet/salfanet-radius-go/internal/radius"
)

// PPPoEHandler handles all PPPoE user/customer/profile/area endpoints.
type PPPoEHandler struct {
	db     *gorm.DB
	radius *radius.Service
}

func NewPPPoEHandler(db *gorm.DB, rad *radius.Service) *PPPoEHandler {
	return &PPPoEHandler{db: db, radius: rad}
}

// ─── Areas ───────────────────────────────────────────────────────────────────

func (h *PPPoEHandler) ListAreas(c fiber.Ctx) error {
	var areas []models.PppoeArea
	h.db.Order("name").Find(&areas)
	return c.JSON(areas)
}

func (h *PPPoEHandler) CreateArea(c fiber.Ctx) error {
	var body models.PppoeArea
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *PPPoEHandler) UpdateArea(c fiber.Ctx) error {
	id := c.Params("id")
	var area models.PppoeArea
	if err := h.db.First(&area, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&area); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&area)
	return c.JSON(area)
}

func (h *PPPoEHandler) DeleteArea(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.PppoeArea{}, "id = ?", id)
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Profiles ────────────────────────────────────────────────────────────────

func (h *PPPoEHandler) ListProfiles(c fiber.Ctx) error {
	var profiles []models.PppoeProfile
	h.db.Order("name").Find(&profiles)
	return c.JSON(profiles)
}

func (h *PPPoEHandler) CreateProfile(c fiber.Ctx) error {
	var body models.PppoeProfile
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *PPPoEHandler) UpdateProfile(c fiber.Ctx) error {
	id := c.Params("id")
	var profile models.PppoeProfile
	if err := h.db.First(&profile, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&profile); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&profile)
	return c.JSON(profile)
}

func (h *PPPoEHandler) DeleteProfile(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Delete(&models.PppoeProfile{}, "id = ?", id)
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── PPPoE Customers ─────────────────────────────────────────────────────────

func (h *PPPoEHandler) ListCustomers(c fiber.Ctx) error {
	var customers []models.PppoeCustomer
	h.db.Preload("Area").Order("name").Find(&customers)
	return c.JSON(customers)
}

func (h *PPPoEHandler) GetCustomer(c fiber.Ctx) error {
	id := c.Params("id")
	var customer models.PppoeCustomer
	if err := h.db.Preload("Area").Preload("PPPoEUsers.Profile").First(&customer, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(customer)
}

func (h *PPPoEHandler) CreateCustomer(c fiber.Ctx) error {
	var body models.PppoeCustomer
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()
	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *PPPoEHandler) UpdateCustomer(c fiber.Ctx) error {
	id := c.Params("id")
	var customer models.PppoeCustomer
	if err := h.db.First(&customer, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&customer); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&customer)
	return c.JSON(customer)
}

// ─── PPPoE Users ─────────────────────────────────────────────────────────────

func (h *PPPoEHandler) ListUsers(c fiber.Ctx) error {
	var users []models.PppoeUser
	query := h.db.Preload("Profile").Preload("Area")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if areaID := c.Query("areaId"); areaID != "" {
		query = query.Where("area_id = ?", areaID)
	}
	if search := c.Query("search"); search != "" {
		query = query.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Model(&models.PppoeUser{}).Count(&total)

	page, pageSize := pageParams(c)
	query.Order("username").Limit(pageSize).Offset((page - 1) * pageSize).Find(&users)

	return c.JSON(fiber.Map{
		"data":     users,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *PPPoEHandler) GetUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.Preload("Profile").Preload("Area").First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(user)
}

func (h *PPPoEHandler) CreateUser(c fiber.Ctx) error {
	var body models.PppoeUser
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	body.ID = uuid.New().String()

	if err := h.db.Create(&body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Sync to FreeRADIUS
	var profile models.PppoeProfile
	h.db.First(&profile, "id = ?", body.ProfileID)
	rateLimit := ""
	if profile.RateLimit != nil {
		rateLimit = *profile.RateLimit
	}
	if err := h.radius.UpsertUser(body.Username, body.Password, rateLimit, profile.GroupName); err != nil {
		log.Error().Err(err).Str("username", body.Username).Msg("pppoe: radius sync error")
	}

	return c.Status(fiber.StatusCreated).JSON(body)
}

func (h *PPPoEHandler) UpdateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	if err := c.Bind().JSON(&user); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Save(&user)
	return c.JSON(user)
}

func (h *PPPoEHandler) DeleteUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	h.db.Delete(&user)
	_ = h.radius.DeleteUser(user.Username)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *PPPoEHandler) SuspendUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	h.db.Model(&user).Update("status", "suspended")
	_ = h.radius.Isolate(user.Username)
	return c.JSON(fiber.Map{"message": "suspended"})
}

func (h *PPPoEHandler) ActivateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	h.db.Model(&user).Update("status", "active")
	_ = h.radius.Activate(user.Username, user.Password)
	_ = notify.SendActivationNotice(user.Phone, user.Name, user.Username)
	return c.JSON(fiber.Map{"message": "activated"})
}

func (h *PPPoEHandler) IsolateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	h.db.Model(&user).Update("status", "isolated")
	_ = h.radius.Isolate(user.Username)
	return c.JSON(fiber.Map{"message": "isolated"})
}

func (h *PPPoEHandler) UnisolateUser(c fiber.Ctx) error {
	return h.ActivateUser(c)
}

func (h *PPPoEHandler) GetUserSessions(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	var sessions []models.Radacct
	h.db.Where("username = ?", user.Username).Order("acctstarttime DESC").Limit(50).Find(&sessions)
	return c.JSON(sessions)
}

func (h *PPPoEHandler) GetUserInvoices(c fiber.Ctx) error {
	id := c.Params("id")
	var invoices []models.Invoice
	h.db.Where("user_id = ?", id).Order("created_at DESC").Find(&invoices)
	return c.JSON(invoices)
}

// ListUsersForSelect — GET /api/users/list
// Returns all PPPoE users with their network location, for use in dropdowns/filters.
func (h *PPPoEHandler) ListUsersForSelect(c fiber.Ctx) error {
	query := h.db.Model(&models.PppoeUser{}).
		Preload("Profile").
		Preload("Router").
		Preload("ODPAssignment").
		Preload("ODPAssignment.ODP").
		Preload("ODPAssignment.ODP.ODC")

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if profileID := c.Query("profileId"); profileID != "" {
		query = query.Where("profileId = ?", profileID)
	}
	if routerID := c.Query("routerId"); routerID != "" {
		query = query.Where("routerId = ?", routerID)
	}
	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		query = query.Where("name LIKE ? OR username LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ?",
			like, like, like, like, like)
	}
	if odpIDs := c.Query("odpIds"); odpIDs != "" {
		// Filter users that have ODP assignment in the given ODP IDs
		query = query.Joins("JOIN odp_customer_assignments oca ON oca.customerId = pppoe_users.id").
			Where("oca.odpId IN ?", splitCSV(odpIDs))
	} else if odcID := c.Query("odcId"); odcID != "" {
		query = query.Joins("JOIN odp_customer_assignments oca ON oca.customerId = pppoe_users.id").
			Joins("JOIN network_odps nodp ON nodp.id = oca.odpId").
			Where("nodp.odcId = ?", odcID)
	}

	var users []models.PppoeUser
	query.Order("name ASC").Find(&users)

	// Filter options
	var profiles []models.PppoeProfile
	h.db.Where("isActive = ?", true).Select("id, name").Order("name").Find(&profiles)

	var routers []models.Router
	h.db.Where("isActive = ?", true).Select("id, name").Order("name").Find(&routers)

	var odcs []models.NetworkODC
	h.db.Select("id, name").Order("name").Find(&odcs)

	var odps []models.NetworkODP
	h.db.Select("id, name, odcId").Order("name").Find(&odps)

	return c.JSON(fiber.Map{
		"success": true,
		"users":   users,
		"filters": fiber.Map{
			"profiles": profiles,
			"routers":  routers,
			"odcs":     odcs,
			"odps":     odps,
		},
	})
}

// splitCSV splits a comma-separated string into a slice of strings.
func splitCSV(s string) []string {
	var out []string
	for _, part := range splitString(s, ",") {
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func splitString(s, sep string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if string(s[i]) == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func (h *PPPoEHandler) SyncToRadius(c fiber.Ctx) error {
	id := c.Params("id")
	var user models.PppoeUser
	if err := h.db.Preload("Profile").First(&user, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	rateLimit := ""
	if user.Profile.RateLimit != nil {
		rateLimit = *user.Profile.RateLimit
	}
	if err := h.radius.UpsertUser(user.Username, user.Password, rateLimit, user.Profile.GroupName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	h.db.Model(&user).Update("synced_to_radius", true)
	return c.JSON(fiber.Map{"message": "synced"})
}

// ─── Registration Requests ────────────────────────────────────────────────────

func (h *PPPoEHandler) ListRegistrations(c fiber.Ctx) error {
	status := c.Query("status")
	q := h.db.Preload("Area").Preload("Profile").Order("created_at DESC")
	if status != "" && status != "all" {
		q = q.Where("status = ?", status)
	}
	var reqs []models.RegistrationRequest
	q.Find(&reqs)
	return c.JSON(fiber.Map{"data": reqs, "total": len(reqs)})
}

func (h *PPPoEHandler) GetRegistration(c fiber.Ctx) error {
	var req models.RegistrationRequest
	if err := h.db.Preload("Area").Preload("Profile").First(&req, "id = ?", c.Params("id")).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(req)
}

func (h *PPPoEHandler) UpdateRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	// Only allow safe fields to update
	allowed := map[string]bool{"notes": true, "address": true, "areaId": true, "profileId": true}
	update := map[string]interface{}{}
	for k, v := range body {
		if allowed[k] {
			update[k] = v
		}
	}
	if err := h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).Updates(update).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "updated"})
}

func (h *PPPoEHandler) DeleteRegistration(c fiber.Ctx) error {
	if err := h.db.Delete(&models.RegistrationRequest{}, "id = ?", c.Params("id")).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *PPPoEHandler) ApproveRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()
	result := h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       "APPROVED",
		"processed_at": now,
	})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": result.Error.Error()})
	}
	return c.JSON(fiber.Map{"message": "approved"})
}

func (h *PPPoEHandler) RejectRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	now := time.Now()
	result := h.db.Model(&models.RegistrationRequest{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       "REJECTED",
		"processed_at": now,
	})
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": result.Error.Error()})
	}
	return c.JSON(fiber.Map{"message": "rejected"})
}
