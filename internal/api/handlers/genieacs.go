package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"gorm.io/gorm"
)

type GenieacsHandler struct {
	db         *gorm.DB
	httpClient *http.Client
}

func NewGenieacsHandler(db *gorm.DB) *GenieacsHandler {
	return &GenieacsHandler{
		db:         db,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// getCredentials returns GenieACS host + basic auth header from DB
func (h *GenieacsHandler) getCredentials() (host, authHeader string, err error) {
	var s models.GenieacsSettings
	if err = h.db.Where("isActive = ?", true).First(&s).Error; err != nil {
		return "", "", fmt.Errorf("GenieACS belum dikonfigurasi")
	}
	if s.Host == "" {
		return "", "", fmt.Errorf("GenieACS host tidak dikonfigurasi")
	}
	auth := base64.StdEncoding.EncodeToString([]byte(s.Username + ":" + s.Password))
	return s.Host, "Basic " + auth, nil
}

// proxyGET sends a GET to GenieACS and returns the parsed JSON body
func (h *GenieacsHandler) proxyGET(url, authHeader string) (interface{}, int, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, 500, err
	}
	req.Header.Set("Authorization", authHeader)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, 502, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 500, err
	}

	var result interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return string(body), resp.StatusCode, nil
	}
	return result, resp.StatusCode, nil
}

// proxyPOST sends a POST to GenieACS with JSON body
func (h *GenieacsHandler) proxyPOST(url, authHeader string, payload interface{}) (interface{}, int, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, 500, err
	}
	req, err := http.NewRequest("POST", url, strings.NewReader(string(b)))
	if err != nil {
		return nil, 500, err
	}
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, 502, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 500, err
	}

	var result interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return string(body), resp.StatusCode, nil
	}
	return result, resp.StatusCode, nil
}

// proxyDELETE sends a DELETE to GenieACS
func (h *GenieacsHandler) proxyDELETE(url, authHeader string) (int, error) {
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return 500, err
	}
	req.Header.Set("Authorization", authHeader)
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return 502, err
	}
	resp.Body.Close()
	return resp.StatusCode, nil
}

// GET /api/genieacs/tasks — list all pending tasks
func (h *GenieacsHandler) ListTasks(c fiber.Ctx) error {
	host, auth, err := h.getCredentials()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	result, statusCode, err := h.proxyGET(host+"/tasks", auth)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	tasks, _ := result.([]interface{})
	if tasks == nil {
		tasks = []interface{}{}
	}
	return c.Status(statusCode).JSON(fiber.Map{"success": true, "tasks": tasks})
}

// DELETE /api/genieacs/tasks/:taskId — delete a task
func (h *GenieacsHandler) DeleteTask(c fiber.Ctx) error {
	taskID := c.Params("taskId")
	host, auth, err := h.getCredentials()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	statusCode, err := h.proxyDELETE(host+"/tasks/"+taskID, auth)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	if statusCode >= 400 {
		return c.Status(statusCode).JSON(fiber.Map{"success": false, "error": "GenieACS returned error"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Task deleted"})
}

// POST /api/genieacs/devices/:deviceId/connection-request — trigger device connection
func (h *GenieacsHandler) ConnectionRequest(c fiber.Ctx) error {
	deviceID := c.Params("deviceId")
	host, auth, err := h.getCredentials()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	// Create a getParameterValues task with connection_request flag to trigger device
	task := map[string]interface{}{
		"name":           "getParameterValues",
		"parameterNames": []string{"InternetGatewayDevice.DeviceInfo.SoftwareVersion"},
	}

	url := fmt.Sprintf("%s/devices/%s/tasks?connection_request", host, deviceID)
	result, statusCode, err := h.proxyPOST(url, auth, task)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	if statusCode == 404 {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Device not found"})
	}
	if statusCode >= 400 {
		return c.Status(statusCode).JSON(fiber.Map{"success": false, "error": "GenieACS returned error", "details": result})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Connection request sent",
		"data":    result,
	})
}

// POST /api/genieacs/devices/:deviceId/wifi — update WiFi settings via TR-069
func (h *GenieacsHandler) UpdateWifi(c fiber.Ctx) error {
	deviceID := c.Params("deviceId")

	var body struct {
		WlanIndex    int    `json:"wlanIndex"`
		SSID         string `json:"ssid"`
		Password     string `json:"password"`
		SecurityMode string `json:"securityMode"`
		Enabled      *bool  `json:"enabled"`
	}
	body.WlanIndex = 1
	body.SecurityMode = "WPA2-PSK"
	enabled := true
	body.Enabled = &enabled

	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid request body"})
	}
	if body.SSID == "" || len(body.SSID) > 32 {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "SSID harus 1-32 karakter"})
	}
	if body.SecurityMode != "None" && body.SecurityMode != "Open" {
		if len(body.Password) < 8 || len(body.Password) > 63 {
			return c.Status(400).JSON(fiber.Map{"success": false, "error": "Password harus 8-63 karakter"})
		}
	}

	host, auth, err := h.getCredentials()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	// Security mode mapping
	type secMode struct{ beacon, authMode, encMode string }
	secMap := map[string]secMode{
		"None":        {"None", "None", "None"},
		"Open":        {"None", "None", "None"},
		"WPA-PSK":     {"WPA", "PSKAuthentication", "TKIPEncryption"},
		"WPA2-PSK":    {"11i", "PSKAuthentication", "AESEncryption"},
		"WPA-WPA2-PSK": {"WPAand11i", "PSKAuthentication", "TKIPandAESEncryption"},
	}
	sm, ok := secMap[body.SecurityMode]
	if !ok {
		sm = secMap["WPA2-PSK"]
	}

	basePath := fmt.Sprintf("InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d", body.WlanIndex)

	enabledVal := "true"
	if body.Enabled != nil && !*body.Enabled {
		enabledVal = "false"
	}

	// Build setParameterValues task
	params := [][]interface{}{
		{basePath + ".Enable", enabledVal, "xsd:boolean"},
		{basePath + ".SSID", body.SSID, "xsd:string"},
		{basePath + ".BeaconType", sm.beacon, "xsd:string"},
		{basePath + ".IEEE11iAuthenticationMode", sm.authMode, "xsd:string"},
		{basePath + ".IEEE11iEncryptionModes", sm.encMode, "xsd:string"},
	}
	if body.SecurityMode != "None" && body.SecurityMode != "Open" && body.Password != "" {
		params = append(params, []interface{}{basePath + ".PreSharedKey.1.PreSharedKey", body.Password, "xsd:string"})
	}

	task := map[string]interface{}{
		"name":            "setParameterValues",
		"parameterValues": params,
	}

	url := fmt.Sprintf("%s/devices/%s/tasks?connection_request", host, deviceID)
	result, statusCode, err := h.proxyPOST(url, auth, task)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	if statusCode == 404 {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Device not found"})
	}
	if statusCode >= 400 {
		return c.Status(statusCode).JSON(fiber.Map{"success": false, "error": "GenieACS returned error", "details": result})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "WiFi settings update task created",
		"data":    result,
	})
}

// GET /api/settings/genieacs — get GenieACS settings (without password)
func (h *GenieacsHandler) GetSettings(c fiber.Ctx) error {
	var s models.GenieacsSettings
	if err := h.db.Where("isActive = ?", true).First(&s).Error; err != nil {
		return c.JSON(fiber.Map{"success": true, "settings": nil})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"settings": fiber.Map{
			"id":          s.ID,
			"host":        s.Host,
			"username":    s.Username,
			"isActive":    s.IsActive,
			"hasPassword": s.Password != "",
		},
	})
}

// POST /api/settings/genieacs — create or update GenieACS settings
func (h *GenieacsHandler) SaveSettings(c fiber.Ctx) error {
	var body struct {
		Host     string `json:"host"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Host == "" {
		return c.Status(400).JSON(fiber.Map{"error": "host is required"})
	}

	// Trim trailing slash
	body.Host = strings.TrimRight(body.Host, "/")

	now := time.Now()
	var existing models.GenieacsSettings
	if err := h.db.First(&existing).Error; err == nil {
		updates := map[string]interface{}{
			"host":      body.Host,
			"username":  body.Username,
			"isActive":  true,
			"updatedAt": now,
		}
		if body.Password != "" && body.Password != "********" {
			updates["password"] = body.Password
		}
		h.db.Model(&existing).Updates(updates)
		return c.JSON(fiber.Map{"success": true, "message": "Settings updated"})
	}

	s := models.GenieacsSettings{
		ID:        uuid.New().String(),
		Host:      body.Host,
		Username:  body.Username,
		Password:  body.Password,
		IsActive:  true,
		CreatedAt: now,
		UpdatedAt: now,
	}
	h.db.Create(&s)
	return c.Status(201).JSON(fiber.Map{"success": true, "message": "Settings created"})
}
