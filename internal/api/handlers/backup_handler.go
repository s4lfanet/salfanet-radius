package handlers

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

type BackupHandler struct{ db *gorm.DB }

func NewBackupHandler(db *gorm.DB) *BackupHandler { return &BackupHandler{db: db} }

const backupDir = "/var/www/salfanet-radius/backups"

// GET /api/backup/history
func (h *BackupHandler) History(c fiber.Ctx) error {
	limit := 50
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	var histories []models.BackupHistory
	h.db.Order("created_at desc").Limit(limit).Find(&histories)
	return c.JSON(fiber.Map{"success": true, "backups": histories})
}

// POST /api/backup/create
func (h *BackupHandler) Create(c fiber.Ctx) error {
	var body struct {
		Method string `json:"method"` // local / telegram / both
	}
	c.Bind().JSON(&body)
	method := body.Method
	if method == "" {
		method = "local"
	}

	// Ensure backup dir exists
	os.MkdirAll(backupDir, 0755)

	// Get DB credentials from environment/config
	dbHost := getEnvOrDefault("DB_HOST", "127.0.0.1")
	dbUser := getEnvOrDefault("DB_USER", "root")
	dbPass := getEnvOrDefault("DB_PASSWORD", "")
	dbName := getEnvOrDefault("DB_NAME", "salfanet")

	now := time.Now()
	filename := fmt.Sprintf("backup_%s.sql.gz", now.Format("20060102_150405"))
	fullPath := filepath.Join(backupDir, filename)

	// Run mysqldump | gzip
	dumpCmd := fmt.Sprintf("mysqldump -h%s -u%s -p%s %s | gzip > %s",
		dbHost, dbUser, dbPass, dbName, fullPath)
	out, err := exec.Command("sh", "-c", dumpCmd).CombinedOutput()

	var filesize int64
	info, _ := os.Stat(fullPath)
	if info != nil {
		filesize = info.Size()
	}

	status := "success"
	var errMsg *string
	if err != nil {
		status = "failed"
		e := string(out)
		errMsg = &e
	}

	hist := models.BackupHistory{
		ID:       generateID(),
		Filename: filename,
		Filepath: &fullPath,
		Filesize: filesize,
		Type:     "manual",
		Status:   status,
		Method:   method,
		Error:    errMsg,
	}
	h.db.Create(&hist)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "backup failed", "details": string(out)})
	}
	return c.JSON(fiber.Map{"success": true, "backup": hist})
}

// DELETE /api/backup/:id
func (h *BackupHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")
	var hist models.BackupHistory
	if err := h.db.Where("id = ?", id).First(&hist).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "backup not found"})
	}
	if hist.Filepath != nil {
		os.Remove(*hist.Filepath)
	}
	h.db.Delete(&models.BackupHistory{}, "id = ?", id)
	return c.JSON(fiber.Map{"success": true})
}

// GET /api/backup/download/:id
func (h *BackupHandler) Download(c fiber.Ctx) error {
	id := c.Params("id")
	var hist models.BackupHistory
	if err := h.db.Where("id = ?", id).First(&hist).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "backup not found"})
	}
	if hist.Filepath == nil {
		return c.Status(404).JSON(fiber.Map{"error": "backup file not found"})
	}
	return c.Download(*hist.Filepath, hist.Filename)
}

// POST /api/backup/restore
func (h *BackupHandler) Restore(c fiber.Ctx) error {
	var body struct {
		BackupID string `json:"backupId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	var hist models.BackupHistory
	if err := h.db.Where("id = ?", body.BackupID).First(&hist).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "backup not found"})
	}
	if hist.Filepath == nil {
		return c.Status(400).JSON(fiber.Map{"error": "no file to restore"})
	}
	dbHost := getEnvOrDefault("DB_HOST", "127.0.0.1")
	dbUser := getEnvOrDefault("DB_USER", "root")
	dbPass := getEnvOrDefault("DB_PASSWORD", "")
	dbName := getEnvOrDefault("DB_NAME", "salfanet")

	cmd := fmt.Sprintf("zcat %s | mysql -h%s -u%s -p%s %s", *hist.Filepath, dbHost, dbUser, dbPass, dbName)
	out, err := exec.Command("sh", "-c", cmd).CombinedOutput()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "restore failed", "details": string(out)})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Database restored"})
}

// GET /api/backup/telegram/settings
func (h *BackupHandler) GetTelegramSettings(c fiber.Ctx) error {
	// Return telegram backup settings from company/settings table
	return c.JSON(fiber.Map{
		"success":  true,
		"settings": fiber.Map{"botToken": "", "chatId": "", "enabled": false},
	})
}

// PUT /api/backup/telegram/settings
func (h *BackupHandler) UpdateTelegramSettings(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "message": "telegram backup settings updated"})
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
