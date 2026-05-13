package handlers

import (
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type OltExtHandler struct{ db *gorm.DB }

func NewOltExtHandler(db *gorm.DB) *OltExtHandler { return &OltExtHandler{db: db} }

// GET /api/olt/alerts
func (h *OltExtHandler) ListAlerts(c fiber.Ctx) error {
	oltID := c.Query("oltId")
	severity := c.Query("severity")
	isResolved := c.Query("isResolved")

	query := h.db.Model(&models.OLTAlert{}).Order("created_at desc").Limit(200)
	if oltID != "" {
		query = query.Where("olt_id = ?", oltID)
	}
	if severity != "" {
		query = query.Where("severity = ?", severity)
	}
	if isResolved != "" {
		query = query.Where("is_resolved = ?", isResolved == "true")
	}

	var alerts []models.OLTAlert
	query.Find(&alerts)
	return c.JSON(fiber.Map{"success": true, "alerts": alerts})
}

// GET /api/olt/alerts/:id
func (h *OltExtHandler) GetAlert(c fiber.Ctx) error {
	id := c.Params("id")
	var alert models.OLTAlert
	if err := h.db.Where("id = ?", id).First(&alert).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "alert not found"})
	}
	return c.JSON(fiber.Map{"success": true, "alert": alert})
}

// PUT /api/olt/alerts/:id/resolve
func (h *OltExtHandler) ResolveAlert(c fiber.Ctx) error {
	id := c.Params("id")
	h.db.Model(&models.OLTAlert{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_resolved": true,
		"resolved_at": gorm.Expr("NOW()"),
	})
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/olt/monitoring
func (h *OltExtHandler) Monitoring(c fiber.Ctx) error {
	var unresolved int64
	h.db.Model(&models.OLTAlert{}).Where("is_resolved = ?", false).Count(&unresolved)

	var olts []models.NetworkOLT
	h.db.Select("id,name,ip_address,status,is_online,total_onu,online_onu,offline_onu").Find(&olts)

	return c.JSON(fiber.Map{
		"success":          true,
		"olts":             olts,
		"unresolvedAlerts": unresolved,
	})
}

// GET /api/olt/metrics
func (h *OltExtHandler) Metrics(c fiber.Ctx) error {
	var metrics []models.OLTPerformanceMetric
	h.db.Order("recorded_at desc").Limit(100).Find(&metrics)
	return c.JSON(fiber.Map{"success": true, "metrics": metrics})
}
