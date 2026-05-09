package models

import "time"

// ─── Hotspot ──────────────────────────────────────────────────────────────────

type HotspotProfile struct {
	ID            string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name          string    `gorm:"uniqueIndex;not null" json:"name"`
	Price         int       `json:"price"`
	Duration      int       `json:"duration"`                          // in minutes
	DurationUnit  string    `gorm:"default:HOURS" json:"durationUnit"` // MINUTES/HOURS/DAYS
	BandwidthDown int       `json:"bandwidthDown"`                     // Kbps
	BandwidthUp   int       `json:"bandwidthUp"`                       // Kbps
	SharedUser    bool      `gorm:"default:true" json:"sharedUser"`
	IsActive      bool      `gorm:"default:true" json:"isActive"`
	RouterID      *string   `gorm:"index" json:"routerId"`
	Description   *string   `json:"description"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (HotspotProfile) TableName() string { return "hotspot_profiles" }

type HotspotVoucher struct {
	ID        string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Code      string     `gorm:"uniqueIndex;not null" json:"code"`
	ProfileID string     `gorm:"index" json:"profileId"`
	AgentID   *string    `gorm:"index" json:"agentId"`
	BatchID   *string    `gorm:"index" json:"batchId"`
	Status    string     `gorm:"default:UNUSED;index" json:"status"` // UNUSED/ACTIVE/EXPIRED/USED
	UsedBy    *string    `json:"usedBy"`
	UsedAt    *time.Time `json:"usedAt"`
	ExpiresAt *time.Time `json:"expiresAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`

	Profile *HotspotProfile `gorm:"foreignKey:ProfileID" json:"profile,omitempty"`
}

func (HotspotVoucher) TableName() string { return "hotspot_vouchers" }

// ─── Agent ────────────────────────────────────────────────────────────────────

type Agent struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name       string    `json:"name"`
	Phone      string    `gorm:"uniqueIndex" json:"phone"`
	Email      *string   `json:"email"`
	Address    *string   `gorm:"type:text" json:"address"`
	Balance    int       `gorm:"default:0" json:"balance"`
	PIN        string    `json:"-"` // hashed
	IsActive   bool      `gorm:"default:true" json:"isActive"`
	Commission int       `gorm:"default:0" json:"commission"` // percentage
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (Agent) TableName() string { return "agents" }

type AgentSale struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	AgentID    string    `gorm:"index" json:"agentId"`
	VoucherID  string    `gorm:"index" json:"voucherId"`
	Amount     int       `json:"amount"`
	Commission int       `json:"commission"`
	CreatedAt  time.Time `json:"createdAt"`

	Agent   *Agent          `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	Voucher *HotspotVoucher `gorm:"foreignKey:VoucherID" json:"voucher,omitempty"`
}

func (AgentSale) TableName() string { return "agent_sales" }

type AgentDeposit struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	AgentID   string    `gorm:"index" json:"agentId"`
	Amount    int       `json:"amount"`
	Notes     *string   `gorm:"type:text" json:"notes"`
	CreatedAt time.Time `json:"createdAt"`

	Agent *Agent `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
}

func (AgentDeposit) TableName() string { return "agent_deposits" }

// ─── Transaction (keuangan) ───────────────────────────────────────────────────

type TransactionCategory struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name      string    `gorm:"uniqueIndex" json:"name"`
	Type      string    `json:"type"` // INCOME / EXPENSE
	CreatedAt time.Time `json:"createdAt"`
}

func (TransactionCategory) TableName() string { return "transaction_categories" }

type Transaction struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Date        time.Time `gorm:"index" json:"date"`
	Type        string    `gorm:"index" json:"type"` // INCOME / EXPENSE
	CategoryID  *string   `gorm:"index" json:"categoryId"`
	Description string    `gorm:"type:text" json:"description"`
	Amount      int       `json:"amount"`
	Notes       *string   `gorm:"type:text" json:"notes"`
	InvoiceID   *string   `gorm:"index" json:"invoiceId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	Category *TransactionCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
}

func (Transaction) TableName() string { return "transactions" }

// ─── Network Map ──────────────────────────────────────────────────────────────

type NetworkODC struct {
	ID        string  `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Capacity  int     `gorm:"default:8" json:"capacity"`
	Notes     *string `gorm:"type:text" json:"notes"`
	OLTID     *string `gorm:"index" json:"oltId"`
}

func (NetworkODC) TableName() string { return "network_odcs" }

type NetworkODP struct {
	ID        string  `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Capacity  int     `gorm:"default:8" json:"capacity"`
	Notes     *string `gorm:"type:text" json:"notes"`
	ODCID     *string `gorm:"index" json:"odcId"`
}

func (NetworkODP) TableName() string { return "network_odps" }

type NetworkOTB struct {
	ID        string  `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Capacity  int     `gorm:"default:4" json:"capacity"`
	Notes     *string `gorm:"type:text" json:"notes"`
	ODPID     *string `gorm:"index" json:"odpId"`
}

func (NetworkOTB) TableName() string { return "network_otbs" }

// ─── Payment Gateway ──────────────────────────────────────────────────────────

type PaymentGateway struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Provider     string    `gorm:"uniqueIndex" json:"provider"` // midtrans/xendit/duitku/tripay
	IsActive     bool      `gorm:"default:false" json:"isActive"`
	ServerKey    string    `json:"-"`
	ClientKey    *string   `json:"clientKey"`
	MerchantCode *string   `json:"merchantCode"`
	BaseURL      *string   `json:"baseUrl"`
	IsProduction bool      `gorm:"default:false" json:"isProduction"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (PaymentGateway) TableName() string { return "payment_gateways" }

// ─── Registration Request ─────────────────────────────────────────────────────

type RegistrationRequest struct {
	ID          string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string     `json:"name"`
	Phone       string     `gorm:"index" json:"phone"`
	Address     *string    `gorm:"type:text" json:"address"`
	AreaID      *string    `gorm:"index" json:"areaId"`
	ProfileID   *string    `gorm:"index" json:"profileId"`
	Notes       *string    `gorm:"type:text" json:"notes"`
	Status      string     `gorm:"default:PENDING;index" json:"status"` // PENDING/APPROVED/REJECTED
	ProcessedAt *time.Time `json:"processedAt"`
	ProcessedBy *string    `json:"processedBy"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	Area    *PppoeArea    `gorm:"foreignKey:AreaID" json:"area,omitempty"`
	Profile *PppoeProfile `gorm:"foreignKey:ProfileID" json:"profile,omitempty"`
}

func (RegistrationRequest) TableName() string { return "registration_requests" }

// ─── Suspend Request ──────────────────────────────────────────────────────────

type SuspendRequest struct {
	ID          string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID      string     `gorm:"index" json:"userId"`
	Reason      *string    `gorm:"type:text" json:"reason"`
	Status      string     `gorm:"default:PENDING;index" json:"status"`
	RequestedAt time.Time  `json:"requestedAt"`
	ProcessedAt *time.Time `json:"processedAt"`

	User *PppoeUser `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (SuspendRequest) TableName() string { return "suspend_requests" }

// ─── Push Subscription ────────────────────────────────────────────────────────

type PushSubscription struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID    string    `gorm:"index" json:"userId"`
	Endpoint  string    `gorm:"type:text;uniqueIndex:idx_push_endpoint" json:"endpoint"`
	P256dh    string    `gorm:"type:text" json:"p256dh"`
	Auth      string    `json:"auth"`
	CreatedAt time.Time `json:"createdAt"`
}

func (PushSubscription) TableName() string { return "push_subscriptions" }

// ─── WhatsApp History ─────────────────────────────────────────────────────────

type WhatsappHistory struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Phone      string    `gorm:"index" json:"phone"`
	Message    string    `gorm:"type:text" json:"message"`
	Status     string    `gorm:"default:sent;index" json:"status"` // sent/failed
	TemplateID *string   `json:"templateId"`
	Error      *string   `gorm:"type:text" json:"error"`
	SentAt     time.Time `gorm:"index" json:"sentAt"`
}

func (WhatsappHistory) TableName() string { return "whatsapp_history" }

// ─── WhatsApp Reminder Settings ──────────────────────────────────────────────

type WhatsappReminderSetting struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	DaysBefore   int       `gorm:"uniqueIndex" json:"daysBefore"` // e.g. 7, 5, 3, 1, 0
	IsActive     bool      `gorm:"default:true" json:"isActive"`
	SendTime     string    `gorm:"default:08:00" json:"sendTime"` // HH:MM
	BatchSize    int       `gorm:"default:50" json:"batchSize"`
	BatchDelayMs int       `gorm:"default:500" json:"batchDelayMs"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (WhatsappReminderSetting) TableName() string { return "whatsapp_reminder_settings" }

// ─── Ticket Reply ─────────────────────────────────────────────────────────────

type TicketReply struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	TicketID  string    `gorm:"index" json:"ticketId"`
	Message   string    `gorm:"type:text" json:"message"`
	IsAdmin   bool      `gorm:"default:false" json:"isAdmin"`
	CreatedAt time.Time `json:"createdAt"`
}

func (TicketReply) TableName() string { return "ticket_replies" }
