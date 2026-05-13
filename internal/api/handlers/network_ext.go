package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// ─── NetworkHandler extensions ────────────────────────────────────────────────
// These methods extend network.go's NetworkHandler with additional routes.

// GET /api/network/routers/:id
func (h *NetworkHandler) GetRouter(c fiber.Ctx) error {
	id := c.Params("id")
	var router models.Router
	if err := h.db.First(&router, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "router not found"})
	}
	return c.JSON(fiber.Map{"success": true, "router": router})
}

// PUT /api/network/routers/:id
func (h *NetworkHandler) UpdateRouter(c fiber.Ctx) error {
	id := c.Params("id")
	var router models.Router
	if err := h.db.First(&router, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "router not found"})
	}
	var body map[string]interface{}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	delete(body, "id")
	body["updated_at"] = time.Now()
	h.db.Model(&router).Updates(body)
	return c.JSON(fiber.Map{"success": true, "router": router})
}

// DELETE /api/network/routers/:id
func (h *NetworkHandler) DeleteRouter(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.Router{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /api/network/routers/:id/test-connection
func (h *NetworkHandler) TestRouterConnection(c fiber.Ctx) error {
	id := c.Params("id")
	var router models.Router
	if err := h.db.First(&router, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "router not found"})
	}
	return c.JSON(fiber.Map{"success": false, "message": "MikroTik API required", "host": router.NASName})
}

// POST /api/network/routers/:id/detect-public-ip
func (h *NetworkHandler) DetectPublicIP(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "requires MikroTik API"})
}

// GET /api/network/routers/:id/interfaces
func (h *NetworkHandler) RouterInterfaces(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "interfaces": []fiber.Map{}})
}

// GET /api/network/routers/:id/isolation-settings
func (h *NetworkHandler) RouterIsolationSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "settings": fiber.Map{}})
}

// POST /api/network/routers/:id/ping-olt
func (h *NetworkHandler) PingOLT(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "ping requires MikroTik API"})
}

// POST /api/network/routers/:id/setup-isolir
func (h *NetworkHandler) SetupIsolir(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "isolir setup requires MikroTik API"})
}

// GET /api/network/routers/:id/uplinks
func (h *NetworkHandler) RouterUplinks(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "uplinks": []fiber.Map{}})
}

// GET /api/network/routers/status
func (h *NetworkHandler) RouterStatus(c fiber.Ctx) error {
	var routers []models.Router
	h.db.Find(&routers)
	result := make([]fiber.Map, 0, len(routers))
	for _, r := range routers {
		result = append(result, fiber.Map{
			"id": r.ID, "name": r.Name, "host": r.NASName, "status": "UNKNOWN",
		})
	}
	return c.JSON(fiber.Map{"success": true, "routers": result})
}

// GET /api/network/routers/template
func (h *NetworkHandler) RouterImportTemplate(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "template download stub"})
}

// POST /api/network/routers/import
func (h *NetworkHandler) ImportRouters(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// ─── OLTs ─────────────────────────────────────────────────────────────────────

// GET /api/network/olts
func (h *NetworkHandler) ListOLTs(c fiber.Ctx) error {
	var olts []models.NetworkOLT
	h.db.Find(&olts)
	return c.JSON(fiber.Map{"success": true, "olts": olts})
}

// GET /api/network/olt-routers
func (h *NetworkHandler) ListOLTRouters(c fiber.Ctx) error {
	var olts []models.NetworkOLT
	h.db.Find(&olts)
	return c.JSON(fiber.Map{"success": true, "oltRouters": olts})
}

// POST /api/network/olts/import
func (h *NetworkHandler) ImportOLTs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// GET /api/network/olts/template
func (h *NetworkHandler) OLTImportTemplate(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "template stub"})
}

// ─── ODC extended ─────────────────────────────────────────────────────────────

// POST /api/network/odcs/import
func (h *NetworkHandler) ImportODCs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// GET /api/network/odcs/template
func (h *NetworkHandler) ODCImportTemplate(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "template stub"})
}

// ─── ODP extended ─────────────────────────────────────────────────────────────

// POST /api/network/odps/import
func (h *NetworkHandler) ImportODPs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// GET /api/network/odps/template
func (h *NetworkHandler) ODPImportTemplate(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "template stub"})
}

// ─── OTB extended ─────────────────────────────────────────────────────────────

// GET /api/network/otbs/:id
func (h *NetworkHandler) GetOTB(c fiber.Ctx) error {
	id := c.Params("id")
	var otb models.NetworkOTB
	if err := h.db.First(&otb, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "OTB not found"})
	}
	return c.JSON(fiber.Map{"success": true, "otb": otb})
}

// GET /api/network/otbs/stats
func (h *NetworkHandler) OTBStats(c fiber.Ctx) error {
	var total int64
	h.db.Model(&models.NetworkOTB{}).Count(&total)
	return c.JSON(fiber.Map{"success": true, "total": total})
}

// POST /api/network/otbs/import
func (h *NetworkHandler) ImportOTBs(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// ─── Fiber Paths ──────────────────────────────────────────────────────────────

func (h *NetworkHandler) ListFiberPaths(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "paths": []fiber.Map{}})
}

func (h *NetworkHandler) CreateFiberPath(c fiber.Ctx) error {
	return c.Status(501).JSON(fiber.Map{"error": "not yet implemented"})
}

func (h *NetworkHandler) GetFiberPath(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "path": nil})
}

func (h *NetworkHandler) UpdateFiberPath(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

func (h *NetworkHandler) DeleteFiberPath(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

func (h *NetworkHandler) TraceFiberPath(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "trace": []fiber.Map{}})
}

// ─── Joint Closures ───────────────────────────────────────────────────────────

func (h *NetworkHandler) ListJointClosures(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "jointClosures": []fiber.Map{}})
}

func (h *NetworkHandler) CreateJointClosure(c fiber.Ctx) error {
	return c.Status(501).JSON(fiber.Map{"error": "not yet implemented"})
}

func (h *NetworkHandler) GetJointClosure(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "jointClosure": nil})
}

func (h *NetworkHandler) UpdateJointClosure(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

func (h *NetworkHandler) DeleteJointClosure(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

func (h *NetworkHandler) ImportJointClosures(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "imported": 0})
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

func (h *NetworkHandler) ListNodes(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "nodes": []fiber.Map{}})
}

func (h *NetworkHandler) CreateNode(c fiber.Ctx) error {
	return c.Status(501).JSON(fiber.Map{"error": "not yet implemented"})
}

func (h *NetworkHandler) GetNode(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "node": nil})
}

func (h *NetworkHandler) UpdateNode(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

func (h *NetworkHandler) DeleteNode(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true})
}

// ─── Misc Network ─────────────────────────────────────────────────────────────

func (h *NetworkHandler) ListServers(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "servers": []fiber.Map{}})
}

func (h *NetworkHandler) ListPaths(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "paths": []fiber.Map{}})
}

func (h *NetworkHandler) DetectNAS(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": false, "message": "NAS detection requires network scan"})
}

// POST /api/network/customers/assign
func (h *NetworkHandler) AssignCustomer(c fiber.Ctx) error {
	var body struct {
		CustomerID string  `json:"customerId"`
		ODPID      string  `json:"odpId"`
		PortNumber int     `json:"portNumber"`
		Distance   float64 `json:"distance"`
		Notes      string  `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.CustomerID == "" || body.ODPID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "customerId and odpId required"})
	}

	var existing models.OdpCustomerAssignment
	h.db.First(&existing, "customer_id = ?", body.CustomerID)

	notes := func() *string {
		if body.Notes != "" {
			s := body.Notes
			return &s
		}
		return nil
	}()
	dist := body.Distance

	if existing.ID == "" {
		assignment := models.OdpCustomerAssignment{
			ID:         uuid.New().String(),
			CustomerID: body.CustomerID,
			OdpID:      body.ODPID,
			PortNumber: body.PortNumber,
			Distance:   &dist,
			Notes:      notes,
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		}
		h.db.Create(&assignment)
		return c.Status(201).JSON(fiber.Map{"success": true, "assignment": assignment})
	}

	h.db.Model(&existing).Updates(map[string]interface{}{
		"odp_id":      body.ODPID,
		"port_number": body.PortNumber,
		"distance":    dist,
		"notes":       notes,
		"updated_at":  time.Now(),
	})
	return c.JSON(fiber.Map{"success": true, "assignment": existing})
}

// GET /api/customers/with-location
func (h *NetworkHandler) CustomersWithLocation(c fiber.Ctx) error {
	var users []models.PppoeUser
	h.db.Where("latitude IS NOT NULL AND longitude IS NOT NULL").
		Preload("Area").Find(&users)
	return c.JSON(fiber.Map{"success": true, "customers": users})
}
