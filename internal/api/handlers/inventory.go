package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type InventoryHandler struct{ db *gorm.DB }

func NewInventoryHandler(db *gorm.DB) *InventoryHandler { return &InventoryHandler{db: db} }

// ─── Categories ───────────────────────────────────────────────────────────────

func (h *InventoryHandler) ListCategories(c fiber.Ctx) error {
	var cats []models.InventoryCategory
	if err := h.db.Order("name asc").Find(&cats).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch categories"})
	}
	// Append item count manually to avoid extra model dependency
	type catWithCount struct {
		models.InventoryCategory
		ItemCount int64 `json:"itemCount"`
	}
	result := make([]catWithCount, len(cats))
	for i, cat := range cats {
		var cnt int64
		h.db.Model(&models.InventoryItem{}).Where("categoryId = ?", cat.ID).Count(&cnt)
		result[i] = catWithCount{cat, cnt}
	}
	return c.JSON(result)
}

func (h *InventoryHandler) CreateCategory(c fiber.Ctx) error {
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Name is required"})
	}
	cat := models.InventoryCategory{
		ID:          uuid.NewString(),
		Name:        body.Name,
		Description: body.Description,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := h.db.Create(&cat).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create category"})
	}
	return c.Status(201).JSON(cat)
}

func (h *InventoryHandler) UpdateCategory(c fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
	}
	upd := map[string]any{"updatedAt": time.Now()}
	if body.Name != "" {
		upd["name"] = body.Name
	}
	if body.Description != nil {
		upd["description"] = body.Description
	}
	if err := h.db.Model(&models.InventoryCategory{}).Where("id = ?", id).Updates(upd).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update category"})
	}
	var cat models.InventoryCategory
	h.db.Where("id = ?", id).First(&cat)
	return c.JSON(cat)
}

func (h *InventoryHandler) DeleteCategory(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.InventoryCategory{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete category"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

func (h *InventoryHandler) ListSuppliers(c fiber.Ctx) error {
	var suppliers []models.InventorySupplier
	if err := h.db.Order("name asc").Find(&suppliers).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch suppliers"})
	}
	type supWithCount struct {
		models.InventorySupplier
		ItemCount int64 `json:"itemCount"`
	}
	result := make([]supWithCount, len(suppliers))
	for i, s := range suppliers {
		var cnt int64
		h.db.Model(&models.InventoryItem{}).Where("supplierId = ?", s.ID).Count(&cnt)
		result[i] = supWithCount{s, cnt}
	}
	return c.JSON(result)
}

func (h *InventoryHandler) CreateSupplier(c fiber.Ctx) error {
	var body struct {
		Name        string  `json:"name"`
		ContactName *string `json:"contactName"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
		Address     *string `json:"address"`
		Notes       *string `json:"notes"`
		IsActive    *bool   `json:"isActive"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Name is required"})
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	sup := models.InventorySupplier{
		ID:          uuid.NewString(),
		Name:        body.Name,
		ContactName: body.ContactName,
		Phone:       body.Phone,
		Email:       body.Email,
		Address:     body.Address,
		Notes:       body.Notes,
		IsActive:    isActive,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := h.db.Create(&sup).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create supplier"})
	}
	return c.Status(201).JSON(sup)
}

func (h *InventoryHandler) UpdateSupplier(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]any
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
	}
	body["updatedAt"] = time.Now()
	if err := h.db.Model(&models.InventorySupplier{}).Where("id = ?", id).Updates(body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update supplier"})
	}
	var sup models.InventorySupplier
	h.db.Where("id = ?", id).First(&sup)
	return c.JSON(sup)
}

func (h *InventoryHandler) DeleteSupplier(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.InventorySupplier{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete supplier"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── Items ────────────────────────────────────────────────────────────────────

func (h *InventoryHandler) ListItems(c fiber.Ctx) error {
	categoryID := c.Query("categoryId")
	supplierID := c.Query("supplierId")
	search := c.Query("search")
	lowStock := c.Query("lowStock") == "true"

	q := h.db.Preload("Category").Preload("Supplier").Order("name asc")

	if categoryID != "" {
		q = q.Where("categoryId = ?", categoryID)
	}
	if supplierID != "" {
		q = q.Where("supplierId = ?", supplierID)
	}
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("name LIKE ? OR sku LIKE ? OR description LIKE ?", like, like, like)
	}

	var items []models.InventoryItem
	if err := q.Find(&items).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch items"})
	}

	type itemWithStatus struct {
		models.InventoryItem
		StockStatus string `json:"stockStatus"`
	}
	result := make([]itemWithStatus, 0, len(items))
	for _, item := range items {
		if lowStock && item.CurrentStock > item.MinimumStock {
			continue
		}
		status := "in_stock"
		if item.CurrentStock == 0 {
			status = "out_of_stock"
		} else if item.CurrentStock <= item.MinimumStock {
			status = "low_stock"
		}
		result = append(result, itemWithStatus{item, status})
	}
	return c.JSON(result)
}

func (h *InventoryHandler) CreateItem(c fiber.Ctx) error {
	var body struct {
		Sku           string  `json:"sku"`
		Name          string  `json:"name"`
		Description   *string `json:"description"`
		CategoryID    *string `json:"categoryId"`
		SupplierID    *string `json:"supplierId"`
		Unit          string  `json:"unit"`
		MinimumStock  int     `json:"minimumStock"`
		CurrentStock  int     `json:"currentStock"`
		PurchasePrice int     `json:"purchasePrice"`
		SellingPrice  int     `json:"sellingPrice"`
		Location      *string `json:"location"`
		Notes         *string `json:"notes"`
		IsActive      *bool   `json:"isActive"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Sku == "" || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "SKU and name are required"})
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	unit := body.Unit
	if unit == "" {
		unit = "pcs"
	}
	item := models.InventoryItem{
		ID:            uuid.NewString(),
		Sku:           body.Sku,
		Name:          body.Name,
		Description:   body.Description,
		CategoryID:    body.CategoryID,
		SupplierID:    body.SupplierID,
		Unit:          unit,
		MinimumStock:  body.MinimumStock,
		CurrentStock:  body.CurrentStock,
		PurchasePrice: body.PurchasePrice,
		SellingPrice:  body.SellingPrice,
		Location:      body.Location,
		Notes:         body.Notes,
		IsActive:      isActive,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if err := h.db.Create(&item).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create item"})
	}
	// Initial stock movement
	if body.CurrentStock > 0 {
		n := "Initial stock"
		h.db.Create(&models.InventoryMovement{
			ID:            uuid.NewString(),
			ItemID:        item.ID,
			MovementType:  "IN",
			Quantity:      body.CurrentStock,
			PreviousStock: 0,
			NewStock:      body.CurrentStock,
			Notes:         &n,
			CreatedAt:     time.Now(),
		})
	}
	h.db.Preload("Category").Preload("Supplier").First(&item, "id = ?", item.ID)
	return c.Status(201).JSON(item)
}

func (h *InventoryHandler) UpdateItem(c fiber.Ctx) error {
	id := c.Params("id")
	var body map[string]any
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid body"})
	}
	body["updatedAt"] = time.Now()
	if err := h.db.Model(&models.InventoryItem{}).Where("id = ?", id).Updates(body).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update item"})
	}
	var item models.InventoryItem
	h.db.Preload("Category").Preload("Supplier").First(&item, "id = ?", id)
	return c.JSON(item)
}

func (h *InventoryHandler) DeleteItem(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.InventoryItem{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete item"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── Movements ────────────────────────────────────────────────────────────────

func (h *InventoryHandler) ListMovements(c fiber.Ctx) error {
	itemID := c.Query("itemId")
	movType := c.Query("movementType")
	limit := 100
	if lStr := c.Query("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	q := h.db.Preload("Item").Order("createdAt desc").Limit(limit)
	if itemID != "" {
		q = q.Where("itemId = ?", itemID)
	}
	if movType != "" {
		q = q.Where("movementType = ?", movType)
	}
	var movements []models.InventoryMovement
	if err := q.Find(&movements).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch movements"})
	}
	return c.JSON(movements)
}

func (h *InventoryHandler) CreateMovement(c fiber.Ctx) error {
	var body struct {
		ItemID       string  `json:"itemId"`
		MovementType string  `json:"movementType"`
		Quantity     int     `json:"quantity"`
		ReferenceNo  *string `json:"referenceNo"`
		Notes        *string `json:"notes"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.ItemID == "" || body.MovementType == "" || body.Quantity == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "itemId, movementType, and quantity are required"})
	}
	if body.MovementType != "IN" && body.MovementType != "OUT" && body.MovementType != "ADJUSTMENT" {
		return c.Status(400).JSON(fiber.Map{"error": "movementType must be IN, OUT, or ADJUSTMENT"})
	}

	var item models.InventoryItem
	if err := h.db.First(&item, "id = ?", body.ItemID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Item not found"})
	}

	prevStock := item.CurrentStock
	newStock := prevStock
	qty := body.Quantity
	switch body.MovementType {
	case "IN":
		newStock = prevStock + qty
	case "OUT":
		if prevStock < qty {
			return c.Status(400).JSON(fiber.Map{"error": "Insufficient stock"})
		}
		newStock = prevStock - qty
	case "ADJUSTMENT":
		newStock = qty
		qty = newStock - prevStock
	}

	// Transaction: create movement + update item stock
	var movement models.InventoryMovement
	err := h.db.Transaction(func(tx *gorm.DB) error {
		movement = models.InventoryMovement{
			ID:            uuid.NewString(),
			ItemID:        body.ItemID,
			MovementType:  body.MovementType,
			Quantity:      qty,
			PreviousStock: prevStock,
			NewStock:      newStock,
			ReferenceNo:   body.ReferenceNo,
			Notes:         body.Notes,
			CreatedAt:     time.Now(),
		}
		if err := tx.Create(&movement).Error; err != nil {
			return err
		}
		return tx.Model(&models.InventoryItem{}).Where("id = ?", body.ItemID).
			Updates(map[string]any{"currentStock": newStock, "updatedAt": time.Now()}).Error
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create movement"})
	}
	h.db.Preload("Item").First(&movement, "id = ?", movement.ID)
	return c.Status(201).JSON(movement)
}
