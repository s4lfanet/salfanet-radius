package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type KeuanganHandler struct{ db *gorm.DB }

func NewKeuanganHandler(db *gorm.DB) *KeuanganHandler { return &KeuanganHandler{db: db} }

// GET /api/keuangan/transactions — list with filters + stats
func (h *KeuanganHandler) ListTransactions(c fiber.Ctx) error {
	txType := c.Query("type")
	categoryID := c.Query("categoryId")
	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	search := c.Query("search")
	page := 1
	if pStr := c.Query("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p > 0 {
			page = p
		}
	}
	limit := 50
	if lStr := c.Query("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}
	offset := (page - 1) * limit

	q := h.db.Model(&models.Transaction{}).Preload("Category")
	if txType != "" && txType != "all" {
		q = q.Where("type = ?", txType)
	}
	if categoryID != "" {
		q = q.Where("categoryId = ?", categoryID)
	}
	if startDate != "" && endDate != "" {
		start, _ := time.Parse("2006-01-02", startDate)
		end, _ := time.Parse("2006-01-02", endDate)
		end = end.Add(24*time.Hour - time.Second)
		q = q.Where("date >= ? AND date <= ?", start, end)
	}
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("description LIKE ? OR reference LIKE ? OR notes LIKE ?", like, like, like)
	}

	var total int64
	q.Count(&total)

	var txs []models.Transaction
	if err := q.Order("date desc").Limit(limit).Offset(offset).Find(&txs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch transactions"})
	}

	// Stats — income/expense for the filtered period
	statsQ := h.db.Model(&models.Transaction{})
	if startDate != "" && endDate != "" {
		start, _ := time.Parse("2006-01-02", startDate)
		end, _ := time.Parse("2006-01-02", endDate)
		end = end.Add(24*time.Hour - time.Second)
		statsQ = statsQ.Where("date >= ? AND date <= ?", start, end)
	}
	type statsRow struct {
		Type  string
		Total int64
	}
	var stats []statsRow
	statsQ.Model(&models.Transaction{}).Select("type, SUM(amount) as total").Group("type").Scan(&stats)

	totalIncome, totalExpense := int64(0), int64(0)
	for _, s := range stats {
		switch s.Type {
		case "INCOME":
			totalIncome = s.Total
		case "EXPENSE":
			totalExpense = s.Total
		}
	}

	return c.JSON(fiber.Map{
		"transactions": txs,
		"total":        total,
		"page":         page,
		"limit":        limit,
		"totalIncome":  totalIncome,
		"totalExpense": totalExpense,
		"balance":      totalIncome - totalExpense,
	})
}

// POST /api/keuangan/transactions
func (h *KeuanganHandler) CreateTransaction(c fiber.Ctx) error {
	var body struct {
		Type        string  `json:"type"`
		CategoryID  string  `json:"categoryId"`
		Amount      int     `json:"amount"`
		Description string  `json:"description"`
		Date        string  `json:"date"`
		Reference   *string `json:"reference"`
		Notes       *string `json:"notes"`
		CreatedBy   *string `json:"createdBy"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Type == "" || body.CategoryID == "" || body.Amount == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "type, categoryId, and amount are required"})
	}
	date := time.Now()
	if body.Date != "" {
		parsed, err := time.Parse("2006-01-02", body.Date)
		if err == nil {
			date = parsed
		}
	}
	tx := models.Transaction{
		ID:          uuid.NewString(),
		Date:        date,
		Type:        body.Type,
		CategoryID:  body.CategoryID,
		Description: body.Description,
		Amount:      body.Amount,
		Reference:   body.Reference,
		Notes:       body.Notes,
		CreatedBy:   body.CreatedBy,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	if err := h.db.Create(&tx).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create transaction"})
	}
	h.db.Preload("Category").First(&tx, "id = ?", tx.ID)
	return c.Status(201).JSON(tx)
}

// DELETE /api/keuangan/transactions/:id
func (h *KeuanganHandler) DeleteTransaction(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Delete(&models.Transaction{}, "id = ?", id).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete transaction"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/keuangan/categories — list transaction categories (same table as billing)
func (h *KeuanganHandler) ListCategories(c fiber.Ctx) error {
	txType := c.Query("type")
	q := h.db.Order("name asc")
	if txType != "" && txType != "all" {
		q = q.Where("type = ?", txType)
	}
	var cats []models.TransactionCategory
	if err := q.Find(&cats).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch categories"})
	}
	return c.JSON(fiber.Map{"success": true, "categories": cats})
}

// POST /api/keuangan/categories
func (h *KeuanganHandler) CreateCategory(c fiber.Ctx) error {
	var body struct {
		Name        string `json:"name"`
		Type        string `json:"type"`
		Description string `json:"description"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Name == "" || body.Type == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name and type are required"})
	}
	cat := models.TransactionCategory{
		ID:        uuid.NewString(),
		Name:      body.Name,
		Type:      body.Type,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&cat).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create category"})
	}
	return c.Status(201).JSON(fiber.Map{"success": true, "category": cat})
}

// GET /api/keuangan/export — export sebagai JSON (Excel tidak tersedia di Go natively)
func (h *KeuanganHandler) Export(c fiber.Ctx) error {
	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	txType := c.Query("type")

	if startDate == "" || endDate == "" {
		return c.Status(400).JSON(fiber.Map{"error": "startDate and endDate are required"})
	}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid startDate format (YYYY-MM-DD)"})
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid endDate format (YYYY-MM-DD)"})
	}
	end = end.Add(24*time.Hour - time.Second)

	q := h.db.Preload("Category").Where("date >= ? AND date <= ?", start, end).Order("date asc")
	if txType != "" && txType != "all" {
		q = q.Where("type = ?", txType)
	}

	var txs []models.Transaction
	if err := q.Find(&txs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch transactions"})
	}

	totalIncome, totalExpense := 0, 0
	for _, t := range txs {
		if t.Type == "INCOME" {
			totalIncome += t.Amount
		} else {
			totalExpense += t.Amount
		}
	}

	return c.JSON(fiber.Map{
		"transactions": txs,
		"stats": fiber.Map{
			"totalIncome":  totalIncome,
			"totalExpense": totalExpense,
			"balance":      totalIncome - totalExpense,
			"startDate":    startDate,
			"endDate":      endDate,
		},
	})
}
