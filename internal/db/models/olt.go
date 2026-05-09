package models

import "time"

// ─── Enums ───────────────────────────────────────────────────────────────────

type OltOnuStatus string

const (
	OnuOnline       OltOnuStatus = "online"
	OnuOffline      OltOnuStatus = "offline"
	OnuDyingGasp    OltOnuStatus = "dying_gasp"
	OnuLOS          OltOnuStatus = "los"
	OnuAuthFailed   OltOnuStatus = "auth_failed"
	OnuUnregistered OltOnuStatus = "unregistered"
)

type OltAlertType string

const (
	AlertOLTOffline      OltAlertType = "olt_offline"
	AlertOLTHighTemp     OltAlertType = "olt_high_temp"
	AlertONUOffline      OltAlertType = "onu_offline"
	AlertLowSignal       OltAlertType = "low_signal"
	AlertHighErrors      OltAlertType = "high_errors"
	AlertDyingGasp       OltAlertType = "dying_gasp"
	AlertUnauthorizedONU OltAlertType = "unauthorized_onu"
)

type OltAlertSeverity string

const (
	SeverityInfo     OltAlertSeverity = "info"
	SeverityWarning  OltAlertSeverity = "warning"
	SeverityCritical OltAlertSeverity = "critical"
)

// ─── NetworkOLT ──────────────────────────────────────────────────────────────

type NetworkOLT struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name       string    `gorm:"not null" json:"name"`
	IPAddress  string    `gorm:"not null" json:"ipAddress"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	Status     string    `gorm:"default:active" json:"status"`
	FollowRoad bool      `gorm:"default:false" json:"followRoad"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	// Monitoring fields
	Vendor            *string    `gorm:"default:huawei" json:"vendor"`
	Model             *string    `json:"model"`
	FirmwareVersion   *string    `json:"firmwareVersion"`
	SNMPEnabled       bool       `gorm:"default:true" json:"snmpEnabled"`
	SNMPCommunity     string     `gorm:"default:public" json:"snmpCommunity"`
	SNMPPort          int        `gorm:"default:161" json:"snmpPort"`
	TelnetEnabled     bool       `gorm:"default:false" json:"telnetEnabled"`
	TelnetPort        int        `gorm:"default:23" json:"telnetPort"`
	SSHEnabled        bool       `gorm:"default:false" json:"sshEnabled"`
	SSHPort           int        `gorm:"default:22" json:"sshPort"`
	Username          *string    `json:"username"`
	Password          *string    `json:"-"`
	MonitoringEnabled bool       `gorm:"default:false" json:"monitoringEnabled"`
	PollingInterval   int        `gorm:"default:300" json:"pollingInterval"`
	LastPollAt        *time.Time `json:"lastPollAt"`
	IsOnline          bool       `gorm:"default:false" json:"isOnline"`
	Uptime            int64      `gorm:"default:0" json:"uptime"`
	Temperature       *float64   `json:"temperature"`
	TotalONU          int        `gorm:"default:0" json:"totalOnu"`
	OnlineONU         int        `gorm:"default:0" json:"onlineOnu"`
	OfflineONU        int        `gorm:"default:0" json:"offlineOnu"`

	// Relations
	ONUStatuses []OLTONUStatus `gorm:"foreignKey:OltID" json:"onuStatuses,omitempty"`
	Alerts      []OLTAlert     `gorm:"foreignKey:OltID" json:"alerts,omitempty"`
}

func (NetworkOLT) TableName() string { return "network_olts" }

// ─── OLTONUStatus ─────────────────────────────────────────────────────────────

type OLTONUStatus struct {
	ID              string       `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OltID           string       `gorm:"not null;index" json:"oltId"`
	OnuIndex        int          `gorm:"default:0" json:"onuIndex"`
	Frame           int          `gorm:"default:0" json:"frame"`
	Slot            int          `gorm:"default:0" json:"slot"`
	Port            int          `json:"port"`
	OnuID           int          `json:"onuId"`
	MACAddress      *string      `json:"macAddress"`
	SerialNumber    *string      `gorm:"index" json:"serialNumber"`
	Description     *string      `gorm:"type:text" json:"description"`
	Status          OltOnuStatus `gorm:"default:offline" json:"status"`
	RxPower         *float64     `json:"rxPower"`
	TxPower         *float64     `json:"txPower"`
	Distance        *int         `json:"distance"`
	Temperature     *float64     `json:"temperature"`
	Voltage         *float64     `json:"voltage"`
	BiasCurrent     *float64     `json:"biasCurrent"`
	LastDeregReason *string      `json:"lastDeregReason"`
	IPAddress       *string      `json:"ipAddress"`
	VlanID          *int         `json:"vlanId"`
	BandwidthUp     int64        `gorm:"default:0" json:"bandwidthUp"`
	BandwidthDown   int64        `gorm:"default:0" json:"bandwidthDown"`
	CustomerID      *string      `gorm:"index" json:"customerId"`
	FirstSeenAt     time.Time    `gorm:"autoCreateTime" json:"firstSeenAt"`
	LastSeenAt      *time.Time   `json:"lastSeenAt"`
	LastOfflineAt   *time.Time   `json:"lastOfflineAt"`
	CreatedAt       time.Time    `json:"createdAt"`
	UpdatedAt       time.Time    `json:"updatedAt"`

	OLT      NetworkOLT `gorm:"foreignKey:OltID" json:"-"`
	Customer *PppoeUser `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
}

func (OLTONUStatus) TableName() string { return "olt_onu_status" }

// ─── OLTAlert ────────────────────────────────────────────────────────────────

type OLTAlert struct {
	ID                  string           `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OltID               *string          `gorm:"index" json:"oltId"`
	OnuID               *string          `gorm:"index" json:"onuId"`
	AlertType           OltAlertType     `gorm:"default:onu_offline" json:"alertType"`
	Severity            OltAlertSeverity `gorm:"default:warning" json:"severity"`
	Message             string           `gorm:"type:text" json:"message"`
	IsResolved          bool             `gorm:"default:false" json:"isResolved"`
	ResolvedAt          *time.Time       `json:"resolvedAt"`
	NotifiedViaEmail    bool             `gorm:"default:false" json:"notifiedViaEmail"`
	NotifiedViaWhatsapp bool             `gorm:"default:false" json:"notifiedViaWhatsapp"`
	CreatedAt           time.Time        `json:"createdAt"`
	UpdatedAt           time.Time        `json:"updatedAt"`
}

func (OLTAlert) TableName() string { return "olt_alerts" }

// ─── OLTPerformanceMetric ─────────────────────────────────────────────────────

type OLTPerformanceMetric struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OltID       string    `gorm:"not null;index" json:"oltId"`
	CPUUsage    *float64  `json:"cpuUsage"`
	MemoryUsage *float64  `json:"memoryUsage"`
	Temperature *float64  `json:"temperature"`
	Uptime      *int64    `json:"uptime"`
	TotalONU    int       `gorm:"default:0" json:"totalOnu"`
	OnlineONU   int       `gorm:"default:0" json:"onlineOnu"`
	OfflineONU  int       `gorm:"default:0" json:"offlineOnu"`
	RxBytes     int64     `gorm:"default:0" json:"rxBytes"`
	TxBytes     int64     `gorm:"default:0" json:"txBytes"`
	RxErrors    int64     `gorm:"default:0" json:"rxErrors"`
	TxErrors    int64     `gorm:"default:0" json:"txErrors"`
	RecordedAt  time.Time `gorm:"autoCreateTime" json:"recordedAt"`
}

func (OLTPerformanceMetric) TableName() string { return "olt_performance_metrics" }

// ─── NetworkOLTRouter ─────────────────────────────────────────────────────────

type NetworkOLTRouter struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OltID      string    `gorm:"not null;index" json:"oltId"`
	RouterID   string    `gorm:"not null;index" json:"routerId"`
	UplinkPort *string   `json:"uplinkPort"`
	Priority   int       `gorm:"default:0" json:"priority"`
	IsActive   bool      `gorm:"default:true" json:"isActive"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (NetworkOLTRouter) TableName() string { return "network_olt_routers" }

// ─── OLTMonitoringLog ─────────────────────────────────────────────────────────

type OLTMonitoringLog struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OltID     string    `gorm:"not null;index" json:"oltId"`
	LogType   string    `gorm:"default:poll" json:"logType"`
	Message   *string   `gorm:"type:text" json:"message"`
	Severity  string    `gorm:"default:info" json:"severity"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (OLTMonitoringLog) TableName() string { return "olt_monitoring_logs" }
