package handlers

import (
	"math"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
)

// SessionsHandler handles active session listing, disconnect, and sync.
type SessionsHandler struct {
	db *gorm.DB
}

func NewSessionsHandler(db *gorm.DB) *SessionsHandler {
	return &SessionsHandler{db: db}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func formatBytes(bytes int64) string {
	if bytes == 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	exp := int(math.Log(float64(bytes)) / math.Log(1024))
	if exp >= len(units) {
		exp = len(units) - 1
	}
	val := float64(bytes) / math.Pow(1024, float64(exp))
	return strconv.FormatFloat(val, 'f', 2, 64) + " " + units[exp]
}

func formatDuration(seconds int64) string {
	if seconds <= 0 {
		return "0s"
	}
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	if h > 0 {
		return strconv.FormatInt(h, 10) + "h " + strconv.FormatInt(m, 10) + "m"
	}
	if m > 0 {
		return strconv.FormatInt(m, 10) + "m " + strconv.FormatInt(s, 10) + "s"
	}
	return strconv.FormatInt(s, 10) + "s"
}

// cleanupStaleSessions marks stale radacct sessions (no update in 8h) as stopped.
// Uses only DB timestamps — clock-skew-safe.
func (h *SessionsHandler) cleanupStaleSessions() int64 {
	const staleHours = 8
	res := h.db.Exec(`
		UPDATE radacct
		SET acctstoptime        = acctupdatetime,
		    acctterminatecause  = 'Lost-Carrier',
		    acctsessiontime     = GREATEST(0, LEAST(
		                              TIMESTAMPDIFF(SECOND, acctstarttime, acctupdatetime),
		                              2147483647))
		WHERE acctstoptime    IS NULL
		  AND acctupdatetime  IS NOT NULL
		  AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) > ?
		  AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) < 720
	`, staleHours)
	if res.RowsAffected > 0 {
		return res.RowsAffected
	}
	return 0
}

// ─── GET /api/sessions ────────────────────────────────────────────────────────

// ListSessions returns all active RADIUS sessions with PPPoE user info.
// Query params:
//   - type: pppoe | hotspot (default: all)
//   - routerId: filter by router
//   - search: username / IP / MAC substring
//   - page: page number (default 1)
//   - limit: page size (0 = no pagination)
func (h *SessionsHandler) ListSessions(c fiber.Ctx) error {
	sessionType := c.Query("type")
	routerID := c.Query("routerId")
	search := c.Query("search")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "0"))
	if page < 1 {
		page = 1
	}

	// 1. Cleanup stale sessions inline
	h.cleanupStaleSessions()

	// 2. Build NAS IP list for router filter
	nasIPs := []string{}
	routerNameByIP := map[string]struct {
		ID   string
		Name string
	}{}
	var routers []models.Router
	rq := h.db.Where("isActive = true")
	if routerID != "" {
		rq = rq.Where("id = ?", routerID)
	}
	rq.Find(&routers)
	for _, r := range routers {
		entry := struct {
			ID   string
			Name string
		}{r.ID, r.Name}
		routerNameByIP[r.NASName] = entry
		nasIPs = append(nasIPs, r.NASName)
		if r.IPAddress != r.NASName && r.IPAddress != "" {
			routerNameByIP[r.IPAddress] = entry
			nasIPs = append(nasIPs, r.IPAddress)
		}
	}

	// 3. Query radacct active sessions
	q := h.db.Model(&models.Radacct{}).Where("acctstoptime IS NULL")
	if routerID != "" && len(nasIPs) > 0 {
		q = q.Where("nasipaddress IN ?", nasIPs)
	}
	if search != "" {
		q = q.Where("username LIKE ? OR framedipaddress LIKE ? OR callingstationid LIKE ?",
			"%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var accts []models.Radacct
	qData := q.Order("acctstarttime DESC")
	if limit > 0 {
		qData = qData.Offset((page - 1) * limit).Limit(limit)
	}
	qData.Find(&accts)

	// 4. Batch-load PPPoE user info
	usernames := make([]string, 0, len(accts))
	for _, a := range accts {
		usernames = append(usernames, a.Username)
	}

	type pppoeInfo struct {
		ID         string
		Username   string
		CustomerID string
		Name       string
		Phone      string
		Profile    string
		AreaName   string
		AreaID     string
	}
	pppoeByUsername := map[string]pppoeInfo{}

	if len(usernames) > 0 {
		rows, _ := h.db.Raw(`
			SELECT u.id, u.username, u.customerId, u.name, u.phone,
			       p.name as profile, a.name as areaName, a.id as areaId
			FROM pppoe_users u
			LEFT JOIN pppoe_profiles p ON u.profileId = p.id
			LEFT JOIN pppoe_areas    a ON u.areaId    = a.id
			WHERE u.username IN ?
		`, usernames).Rows()
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var info pppoeInfo
				_ = rows.Scan(&info.ID, &info.Username, &info.CustomerID, &info.Name,
					&info.Phone, &info.Profile, &info.AreaName, &info.AreaID)
				pppoeByUsername[info.Username] = info
			}
		}
	}

	// 5. Load hotspot voucher codes for type detection
	voucherCodes := map[string]struct{}{}
	if len(usernames) > 0 {
		var codes []struct{ Code string }
		h.db.Raw("SELECT code FROM hotspot_vouchers WHERE code IN ?", usernames).Scan(&codes)
		for _, v := range codes {
			voucherCodes[v.Code] = struct{}{}
		}
	}

	// 6. Build response
	type sessionItem struct {
		ID                string      `json:"id"`
		Username          string      `json:"username"`
		SessionID         string      `json:"sessionId"`
		Type              string      `json:"type"`
		NasIPAddress      string      `json:"nasIpAddress"`
		FramedIPAddress   string      `json:"framedIpAddress"`
		MACAddress        string      `json:"macAddress"`
		CalledStationID   string      `json:"calledStationId"`
		StartTime         interface{} `json:"startTime"`
		LastUpdate        interface{} `json:"lastUpdate"`
		Duration          int64       `json:"duration"`
		DurationFormatted string      `json:"durationFormatted"`
		UploadBytes       int64       `json:"uploadBytes"`
		DownloadBytes     int64       `json:"downloadBytes"`
		TotalBytes        int64       `json:"totalBytes"`
		UploadFormatted   string      `json:"uploadFormatted"`
		DownloadFormatted string      `json:"downloadFormatted"`
		TotalFormatted    string      `json:"totalFormatted"`
		Router            interface{} `json:"router"`
		User              interface{} `json:"user"`
	}

	now := time.Now()
	result := make([]sessionItem, 0, len(accts))
	for _, a := range accts {
		// determine type
		sType := "pppoe"
		if _, isVoucher := voucherCodes[a.Username]; isVoucher {
			sType = "hotspot"
		} else if _, isPppoe := pppoeByUsername[a.Username]; !isPppoe {
			// unknown — skip ghost users
			continue
		}

		// apply type filter
		if sessionType == "pppoe" && sType != "pppoe" {
			continue
		}
		if sessionType == "hotspot" && sType != "hotspot" {
			continue
		}

		// duration
		var duration int64
		if a.AcctSessionTime != nil && *a.AcctSessionTime > 0 {
			duration = *a.AcctSessionTime
		} else if a.AcctStartTime != nil {
			duration = int64(now.Sub(*a.AcctStartTime).Seconds())
		}

		// router
		var routerInfo interface{}
		if rn, ok := routerNameByIP[a.NASIPAddress]; ok {
			routerInfo = fiber.Map{"id": rn.ID, "name": rn.Name}
		}

		// user info
		var userInfo interface{}
		if info, ok := pppoeByUsername[a.Username]; ok {
			userInfo = fiber.Map{
				"id":         info.ID,
				"customerId": info.CustomerID,
				"name":       info.Name,
				"phone":      info.Phone,
				"profile":    info.Profile,
				"area":       fiber.Map{"id": info.AreaID, "name": info.AreaName},
			}
		}

		var upload, download int64
		if a.AcctOutputOctets != nil {
			upload = *a.AcctOutputOctets
		}
		if a.AcctInputOctets != nil {
			download = *a.AcctInputOctets
		}
		total := upload + download

		result = append(result, sessionItem{
			ID:                strconv.FormatInt(a.RadacctID, 10),
			Username:          a.Username,
			SessionID:         a.AcctUniqueID,
			Type:              sType,
			NasIPAddress:      a.NASIPAddress,
			FramedIPAddress:   a.FramedIPAddress,
			MACAddress:        a.CallingStationID,
			CalledStationID:   a.CalledStationID,
			StartTime:         a.AcctStartTime,
			LastUpdate:        a.AcctUpdateTime,
			Duration:          duration,
			DurationFormatted: formatDuration(duration),
			UploadBytes:       upload,
			DownloadBytes:     download,
			TotalBytes:        total,
			UploadFormatted:   formatBytes(upload),
			DownloadFormatted: formatBytes(download),
			TotalFormatted:    formatBytes(total),
			Router:            routerInfo,
			User:              userInfo,
		})
	}

	return c.JSON(fiber.Map{
		"sessions": result,
		"total":    total,
		"page":     page,
	})
}

// ─── POST /api/sessions/disconnect ───────────────────────────────────────────

func (h *SessionsHandler) DisconnectSession(c fiber.Ctx) error {
	var body struct {
		Username  string `json:"username"`
		SessionID string `json:"sessionId"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if body.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username required"})
	}

	q := h.db.Model(&models.Radacct{}).
		Where("username = ? AND acctstoptime IS NULL", body.Username).
		Updates(map[string]interface{}{
			"acctstoptime":       time.Now(),
			"acctterminatecause": "Admin-Reset",
			"acctsessiontime":    gorm.Expr("GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))"),
		})
	if body.SessionID != "" {
		_ = q // discard default query
		q = h.db.Model(&models.Radacct{}).
			Where("acctuniqueid = ? OR acctsessionid = ?", body.SessionID, body.SessionID).
			Updates(map[string]interface{}{
				"acctstoptime":       time.Now(),
				"acctterminatecause": "Admin-Reset",
				"acctsessiontime":    gorm.Expr("GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))"),
			})
	}

	return c.JSON(fiber.Map{
		"message":  "disconnected",
		"affected": q.RowsAffected,
	})
}

// ─── POST /api/sessions/sync ─────────────────────────────────────────────────

// SyncSessions closes stale sessions explicitly.
func (h *SessionsHandler) SyncSessions(c fiber.Ctx) error {
	cleaned := h.cleanupStaleSessions()
	return c.JSON(fiber.Map{
		"message": "sync complete",
		"cleaned": cleaned,
	})
}

// ─── GET /api/sessions/export ─────────────────────────────────────────────────

// ExportSessions returns active session data as CSV.
func (h *SessionsHandler) ExportSessions(c fiber.Ctx) error {
	type exportRow struct {
		Username    string
		SessionID   string
		NasIP       string
		FramedIP    string
		MAC         string
		StartTime   *time.Time
		SessionTime *int64
	}
	var rows []exportRow
	h.db.Raw(`
		SELECT username, acctsessionid, nasipaddress, framedipaddress,
		       callingstationid, acctstarttime, acctsessiontime
		FROM radacct
		WHERE acctstoptime IS NULL
		ORDER BY acctstarttime DESC
		LIMIT 5000
	`).Scan(&rows)

	csv := "Username,SessionID,NAS IP,Framed IP,MAC,Start Time,Duration(s)\n"
	for _, r := range rows {
		start := ""
		if r.StartTime != nil {
			start = r.StartTime.Format(time.RFC3339)
		}
		dur := "0"
		if r.SessionTime != nil {
			dur = strconv.FormatInt(*r.SessionTime, 10)
		}
		csv += r.Username + "," + r.SessionID + "," + r.NasIP + "," +
			r.FramedIP + "," + r.MAC + "," + start + "," + dur + "\n"
	}

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", "attachment; filename=sessions.csv")
	return c.SendString(csv)
}
