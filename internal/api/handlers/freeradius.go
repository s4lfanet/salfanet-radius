package handlers

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type FreeradiusHandler struct{ db *gorm.DB }

func NewFreeradiusHandler(db *gorm.DB) *FreeradiusHandler {
	return &FreeradiusHandler{db: db}
}

func runCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// GET /api/freeradius/status
func (h *FreeradiusHandler) GetStatus(c fiber.Ctx) error {
	active, _ := runCmd("systemctl", "is-active", "freeradius")
	running := active == "active"
	var pid, uptime, version string
	if running {
		pid, _ = runCmd("sh", "-c", "pgrep -x freeradius | head -1")
		uptime, _ = runCmd("sh", "-c", "systemctl show freeradius --property=ActiveEnterTimestamp | cut -d= -f2")
		version, _ = runCmd("sh", "-c", "freeradius -v 2>&1 | head -1")
	}
	return c.JSON(fiber.Map{
		"running": running,
		"pid":     pid,
		"uptime":  uptime,
		"version": version,
	})
}

// POST /api/freeradius/start
func (h *FreeradiusHandler) Start(c fiber.Ctx) error {
	out, err := runCmd("systemctl", "start", "freeradius")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": out})
	}
	return c.JSON(fiber.Map{"success": true, "message": "FreeRADIUS started"})
}

// POST /api/freeradius/stop
func (h *FreeradiusHandler) Stop(c fiber.Ctx) error {
	out, err := runCmd("systemctl", "stop", "freeradius")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": out})
	}
	return c.JSON(fiber.Map{"success": true, "message": "FreeRADIUS stopped"})
}

// POST /api/freeradius/restart
func (h *FreeradiusHandler) Restart(c fiber.Ctx) error {
	out, err := runCmd("systemctl", "restart", "freeradius")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": out})
	}
	return c.JSON(fiber.Map{"success": true, "message": "FreeRADIUS restarted"})
}

// GET /api/freeradius/logs
func (h *FreeradiusHandler) GetLogs(c fiber.Ctx) error {
	lines := 200
	out, _ := runCmd("sh", "-c", "journalctl -u freeradius -n 200 --no-pager 2>/dev/null || tail -n 200 /var/log/freeradius/radius.log 2>/dev/null")
	logLines := strings.Split(out, "\n")
	if len(logLines) > lines {
		logLines = logLines[len(logLines)-lines:]
	}
	return c.JSON(fiber.Map{"success": true, "logs": logLines})
}

// GET /api/freeradius/radcheck
func (h *FreeradiusHandler) GetRadcheck(c fiber.Ctx) error {
	username := c.Query("username")
	rows, err := h.db.Raw("SELECT id, username, attribute, op, value FROM radcheck WHERE username LIKE ? LIMIT 100",
		"%"+username+"%").Rows()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	type Row struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
		Attr     string `json:"attribute"`
		Op       string `json:"op"`
		Value    string `json:"value"`
	}
	var result []Row
	for rows.Next() {
		var r Row
		rows.Scan(&r.ID, &r.Username, &r.Attr, &r.Op, &r.Value)
		result = append(result, r)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

// POST /api/freeradius/radtest
func (h *FreeradiusHandler) RunRadtest(c fiber.Ctx) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Server   string `json:"server"`
		Port     string `json:"port"`
		Secret   string `json:"secret"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	server := body.Server
	if server == "" {
		server = "127.0.0.1"
	}
	port := body.Port
	if port == "" {
		port = "1812"
	}
	secret := body.Secret
	if secret == "" {
		secret = "testing123"
	}
	out, err := runCmd("radtest", body.Username, body.Password, server+":"+port, "0", secret)
	success := err == nil && strings.Contains(out, "Access-Accept")
	return c.JSON(fiber.Map{"success": success, "output": out})
}

// GET /api/freeradius/config/list
func (h *FreeradiusHandler) ListConfigs(c fiber.Ctx) error {
	configDir := "/etc/freeradius/3.0"
	if _, err := os.Stat(configDir); os.IsNotExist(err) {
		configDir = "/etc/freeradius"
	}
	var files []string
	filepath.Walk(configDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			rel, _ := filepath.Rel(configDir, path)
			files = append(files, rel)
		}
		return nil
	})
	return c.JSON(fiber.Map{"success": true, "files": files})
}

// GET /api/freeradius/config/read?file=...
func (h *FreeradiusHandler) ReadConfig(c fiber.Ctx) error {
	fileName := c.Query("file")
	if fileName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "file parameter required"})
	}
	configDir := "/etc/freeradius/3.0"
	if _, err := os.Stat(configDir); os.IsNotExist(err) {
		configDir = "/etc/freeradius"
	}
	fullPath := filepath.Join(configDir, filepath.Clean(fileName))
	// Security: ensure path stays within configDir
	if !strings.HasPrefix(fullPath, configDir) {
		return c.Status(403).JSON(fiber.Map{"error": "access denied"})
	}
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "file not found"})
	}
	return c.JSON(fiber.Map{"success": true, "content": string(data)})
}

// POST /api/freeradius/config/save
func (h *FreeradiusHandler) SaveConfig(c fiber.Ctx) error {
	var body struct {
		File    string `json:"file"`
		Content string `json:"content"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	configDir := "/etc/freeradius/3.0"
	if _, err := os.Stat(configDir); os.IsNotExist(err) {
		configDir = "/etc/freeradius"
	}
	fullPath := filepath.Join(configDir, filepath.Clean(body.File))
	if !strings.HasPrefix(fullPath, configDir) {
		return c.Status(403).JSON(fiber.Map{"error": "access denied"})
	}
	if err := os.WriteFile(fullPath, []byte(body.Content), 0644); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Config saved"})
}

// scanLines reads first n lines of a file into a slice
func scanLines(path string, n int) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var lines []string
	sc := bufio.NewScanner(f)
	for sc.Scan() && len(lines) < n {
		lines = append(lines, sc.Text())
	}
	return lines
}
