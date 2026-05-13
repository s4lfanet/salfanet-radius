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
	ID             string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Date           time.Time `gorm:"index" json:"date"`
	Type           string    `gorm:"index" json:"type"` // INCOME / EXPENSE
	CategoryID     string    `gorm:"index" json:"categoryId"`
	Description    string    `gorm:"type:text" json:"description"`
	Amount         int       `json:"amount"`
	Reference      *string   `json:"reference"`
	Notes          *string   `gorm:"type:text" json:"notes"`
	CreatedBy      *string   `json:"createdBy"`
	JournalEntryID *string   `json:"journalEntryId"`
	InvoiceID      *string   `gorm:"index" json:"invoiceId"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`

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
	Status    string  `gorm:"default:active" json:"status"`

	ODC *NetworkODC `gorm:"foreignKey:ODCID" json:"odc,omitempty"`
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
	Status      string     `gorm:"default:PENDING;index" json:"status"`
	Reason      *string    `gorm:"type:text" json:"reason"`
	StartDate   time.Time  `json:"startDate"`
	EndDate     time.Time  `json:"endDate"`
	AdminNotes  *string    `gorm:"type:text" json:"adminNotes"`
	RequestedAt time.Time  `json:"requestedAt"`
	ApprovedAt  *time.Time `json:"approvedAt"`
	ApprovedBy  *string    `json:"approvedBy"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	User *PppoeUser `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (SuspendRequest) TableName() string { return "suspend_requests" }

// ─── TicketCategory ─────────────────────────────────────────────────────────────────────────

type TicketCategory struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `json:"name"`
	Description *string   `gorm:"type:text" json:"description"`
	Color       *string   `json:"color"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (TicketCategory) TableName() string { return "ticket_categories" }

// ─── EmailSetting ────────────────────────────────────────────────────────────────────────────

type EmailSetting struct {
	ID              string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Enabled         bool      `gorm:"default:false" json:"enabled"`
	SmtpHost        string    `gorm:"default:smtp.gmail.com" json:"smtpHost"`
	SmtpPort        int       `gorm:"default:587" json:"smtpPort"`
	SmtpSecure      bool      `gorm:"default:false" json:"smtpSecure"`
	SmtpUser        string    `json:"smtpUser"`
	SmtpPassword    string    `json:"-"`
	FromEmail       string    `json:"fromEmail"`
	FromName        string    `gorm:"default:RADIUS Notification" json:"fromName"`
	NotifyNewUser   bool      `gorm:"default:true" json:"notifyNewUser"`
	NotifyExpired   bool      `gorm:"default:true" json:"notifyExpired"`
	NotifyInvoice   bool      `gorm:"default:true" json:"notifyInvoice"`
	NotifyPayment   bool      `gorm:"default:true" json:"notifyPayment"`
	ReminderEnabled bool      `gorm:"default:true" json:"reminderEnabled"`
	ReminderTime    string    `gorm:"default:09:00" json:"reminderTime"`
	ReminderDays    string    `gorm:"default:7,3,1" json:"reminderDays"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (EmailSetting) TableName() string { return "email_settings" }

// ─── Permission ─────────────────────────────────────────────────────────────────────────────────

type Permission struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Key         string    `gorm:"uniqueIndex" json:"key"`
	Name        string    `json:"name"`
	Description *string   `gorm:"type:text" json:"description"`
	Category    string    `gorm:"index" json:"category"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (Permission) TableName() string { return "permissions" }

// ─── RolePermission ─────────────────────────────────────────────────────────────────────────

type RolePermission struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Role         string    `gorm:"index" json:"role"`
	PermissionID string    `gorm:"index" json:"permissionId"`
	CreatedAt    time.Time `json:"createdAt"`

	Permission *Permission `gorm:"foreignKey:PermissionID" json:"permission,omitempty"`
}

func (RolePermission) TableName() string { return "role_permissions" }

// ─── Notification ───────────────────────────────────────────────────────────────────────────

type Notification struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Type      string    `gorm:"index" json:"type"`
	Title     string    `json:"title"`
	Message   string    `gorm:"type:text" json:"message"`
	Link      *string   `json:"link"`
	IsRead    bool      `gorm:"default:false" json:"isRead"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (Notification) TableName() string { return "notifications" }

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

// ─── Inventory ────────────────────────────────────────────────────────────────

type InventoryCategory struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `gorm:"uniqueIndex" json:"name"`
	Description *string   `gorm:"type:text" json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	Items []InventoryItem `gorm:"foreignKey:CategoryID" json:"items,omitempty"`
}

func (InventoryCategory) TableName() string { return "inventory_categories" }

type InventorySupplier struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `gorm:"uniqueIndex" json:"name"`
	ContactName *string   `json:"contactName"`
	Phone       *string   `json:"phone"`
	Email       *string   `json:"email"`
	Address     *string   `gorm:"type:text" json:"address"`
	Notes       *string   `gorm:"type:text" json:"notes"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (InventorySupplier) TableName() string { return "inventory_suppliers" }

type InventoryItem struct {
	ID            string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Sku           string    `gorm:"uniqueIndex" json:"sku"`
	Name          string    `json:"name"`
	Description   *string   `gorm:"type:text" json:"description"`
	CategoryID    *string   `gorm:"index" json:"categoryId"`
	SupplierID    *string   `gorm:"index" json:"supplierId"`
	Unit          string    `gorm:"default:pcs" json:"unit"`
	MinimumStock  int       `gorm:"default:0" json:"minimumStock"`
	CurrentStock  int       `gorm:"default:0" json:"currentStock"`
	PurchasePrice int       `gorm:"default:0" json:"purchasePrice"`
	SellingPrice  int       `gorm:"default:0" json:"sellingPrice"`
	Location      *string   `json:"location"`
	Notes         *string   `gorm:"type:text" json:"notes"`
	IsActive      bool      `gorm:"default:true" json:"isActive"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`

	Category *InventoryCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Supplier *InventorySupplier `gorm:"foreignKey:SupplierID" json:"supplier,omitempty"`
}

func (InventoryItem) TableName() string { return "inventory_items" }

type InventoryMovement struct {
	ID            string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	ItemID        string    `gorm:"index" json:"itemId"`
	MovementType  string    `gorm:"index" json:"movementType"` // IN / OUT / ADJUSTMENT
	Quantity      int       `json:"quantity"`
	PreviousStock int       `json:"previousStock"`
	NewStock      int       `json:"newStock"`
	ReferenceNo   *string   `json:"referenceNo"`
	Notes         *string   `gorm:"type:text" json:"notes"`
	UserID        *string   `json:"userId"`
	UserName      *string   `json:"userName"`
	CreatedAt     time.Time `gorm:"index" json:"createdAt"`

	Item *InventoryItem `gorm:"foreignKey:ItemID" json:"item,omitempty"`
}

func (InventoryMovement) TableName() string { return "inventory_movements" }

// ─── OdpCustomerAssignment ────────────────────────────────────────────────────

type OdpCustomerAssignment struct {
	ID         string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	CustomerID string    `gorm:"uniqueIndex" json:"customerId"`
	OdpID      string    `gorm:"index" json:"odpId"`
	PortNumber int       `json:"portNumber"`
	Distance   *float64  `json:"distance"`
	Notes      *string   `gorm:"type:text" json:"notes"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	ODP *NetworkODP `gorm:"foreignKey:OdpID" json:"odp,omitempty"`
}

func (OdpCustomerAssignment) TableName() string { return "odp_customer_assignments" }

// ─── Employee ─────────────────────────────────────────────────────────────────

type Employee struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `json:"name"`
	PhoneNumber string    `gorm:"uniqueIndex" json:"phoneNumber"`
	Email       *string   `json:"email"`
	Address     *string   `gorm:"type:text" json:"address"`
	Roles       string    `gorm:"type:json" json:"roles"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	EmployeeID  *string   `gorm:"uniqueIndex" json:"employeeId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (Employee) TableName() string { return "employees" }

// ─── JobAssignment ────────────────────────────────────────────────────────────

type JobAssignment struct {
	ID               string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	JobType          string     `gorm:"index" json:"jobType"`
	JobCategory      *string    `json:"jobCategory"`
	Priority         string     `gorm:"default:MEDIUM;index" json:"priority"`
	Status           string     `gorm:"default:ASSIGNED;index" json:"status"`
	ScheduledDate    *time.Time `gorm:"index" json:"scheduledDate"`
	CompletedDate    *time.Time `json:"completedDate"`
	CustomerName     string     `json:"customerName"`
	CustomerPhone    string     `json:"customerPhone"`
	CustomerAddress  string     `gorm:"type:text" json:"customerAddress"`
	Latitude         *float64   `json:"latitude"`
	Longitude        *float64   `json:"longitude"`
	Description      *string    `gorm:"type:text" json:"description"`
	TechnicianNotes  *string    `gorm:"type:text" json:"technicianNotes"`
	AssignedTo       *string    `gorm:"index" json:"assignedTo"`
	AssignedBy       *string    `gorm:"index" json:"assignedBy"`
	CheckInTime      *time.Time `json:"checkInTime"`
	CheckOutTime     *time.Time `json:"checkOutTime"`
	RegistrationID   *string    `gorm:"index" json:"registrationId"`
	TicketID         *string    `gorm:"index" json:"ticketId"`
	RequiresApproval bool       `gorm:"default:false" json:"requiresApproval"`
	ApprovalStatus   *string    `json:"approvalStatus"`
	ApprovedBy       *string    `json:"approvedBy"`
	ApprovedAt       *time.Time `json:"approvedAt"`
	EstimatedCost    *float64   `gorm:"type:decimal(15,2)" json:"estimatedCost"`
	PhotoCount       int        `gorm:"default:0" json:"photoCount"`
	CreatedAt        time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`

	AssignedToEmployee *Employee `gorm:"foreignKey:AssignedTo" json:"assignedToEmployee,omitempty"`
	AssignedByEmployee *Employee `gorm:"foreignKey:AssignedBy" json:"assignedByEmployee,omitempty"`
}

func (JobAssignment) TableName() string { return "job_assignments" }

// ─── GenieACS Settings ────────────────────────────────────────────────────────

type GenieacsSettings struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Host      string    `json:"host"`
	Username  string    `json:"username"`
	Password  string    `json:"-"`
	IsActive  bool      `gorm:"default:true" json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (GenieacsSettings) TableName() string { return "genieacs_settings" }

// ─── AdminUser ────────────────────────────────────────────────────────────────

type AdminUser struct {
	ID               string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Username         string     `gorm:"uniqueIndex" json:"username"`
	Email            *string    `gorm:"uniqueIndex" json:"email"`
	Password         string     `json:"-"`
	Name             string     `json:"name"`
	Role             string     `gorm:"default:CUSTOMER_SERVICE;index" json:"role"`
	IsActive         bool       `gorm:"default:true" json:"isActive"`
	Phone            *string    `json:"phone"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	LastLogin        *time.Time `json:"lastLogin"`
	TwoFactorEnabled bool       `gorm:"default:false" json:"twoFactorEnabled"`
}

func (AdminUser) TableName() string { return "admin_users" }

// ─── UserPermission ───────────────────────────────────────────────────────────

type UserPermission struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID       string    `gorm:"index" json:"userId"`
	PermissionID string    `gorm:"index" json:"permissionId"`
	CreatedAt    time.Time `json:"createdAt"`

	Permission *Permission `gorm:"foreignKey:PermissionID" json:"permission,omitempty"`
}

func (UserPermission) TableName() string { return "user_permissions" }

// ─── Technician ───────────────────────────────────────────────────────────────

type Technician struct {
	ID          string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string     `json:"name"`
	PhoneNumber string     `gorm:"uniqueIndex" json:"phoneNumber"`
	Email       *string    `json:"email"`
	IsActive    bool       `gorm:"default:true" json:"isActive"`
	RequireOtp  bool       `gorm:"default:true" json:"requireOtp"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	LastLoginAt *time.Time `json:"lastLoginAt"`
}

func (Technician) TableName() string { return "technicians" }

// ─── ReferralReward ───────────────────────────────────────────────────────────

type ReferralReward struct {
	ID         string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	ReferrerID string     `gorm:"index" json:"referrerId"`
	ReferredID string     `gorm:"index" json:"referredId"`
	Amount     int        `json:"amount"`
	Status     string     `gorm:"default:PENDING;index" json:"status"`
	Type       string     `gorm:"default:FIRST_PAYMENT" json:"type"`
	CreditedAt *time.Time `json:"creditedAt"`
	CreatedAt  time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`

	Referrer *PppoeUser `gorm:"foreignKey:ReferrerID" json:"referrer,omitempty"`
	Referred *PppoeUser `gorm:"foreignKey:ReferredID" json:"referred,omitempty"`
}

func (ReferralReward) TableName() string { return "referral_rewards" }

// ─── ActivityLog ──────────────────────────────────────────────────────────────

type ActivityLog struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID      *string   `gorm:"index" json:"userId"`
	Username    string    `json:"username"`
	UserRole    *string   `json:"userRole"`
	Action      string    `json:"action"`
	Description string    `gorm:"type:text" json:"description"`
	Module      string    `gorm:"index" json:"module"`
	Status      string    `gorm:"default:success;index" json:"status"`
	IPAddress   *string   `json:"ipAddress"`
	Metadata    *string   `gorm:"type:text" json:"metadata"`
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

func (ActivityLog) TableName() string { return "activity_logs" }

// ─── VoucherTemplate ─────────────────────────────────────────────────────────

type VoucherTemplate struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name         string    `json:"name"`
	HtmlTemplate string    `gorm:"type:text" json:"htmlTemplate"`
	IsDefault    bool      `gorm:"default:false" json:"isDefault"`
	IsActive     bool      `gorm:"default:true" json:"isActive"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (VoucherTemplate) TableName() string { return "voucher_templates" }

// ─── VoucherOrder ─────────────────────────────────────────────────────────────

type VoucherOrder struct {
	ID            string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	OrderNumber   string     `gorm:"uniqueIndex" json:"orderNumber"`
	ProfileID     string     `gorm:"index" json:"profileId"`
	Quantity      int        `gorm:"default:1" json:"quantity"`
	CustomerName  string     `json:"customerName"`
	CustomerPhone string     `json:"customerPhone"`
	CustomerEmail *string    `json:"customerEmail"`
	TotalAmount   int        `json:"totalAmount"`
	Status        string     `gorm:"default:PENDING;index" json:"status"`
	PaymentToken  *string    `gorm:"uniqueIndex" json:"paymentToken"`
	PaymentLink   *string    `json:"paymentLink"`
	PaidAt        *time.Time `json:"paidAt"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`

	Profile *HotspotProfile `gorm:"foreignKey:ProfileID" json:"profile,omitempty"`
}

func (VoucherOrder) TableName() string { return "voucher_orders" }

// ─── EmailHistory ─────────────────────────────────────────────────────────────

type EmailHistory struct {
	ID      string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	ToEmail string    `gorm:"index" json:"toEmail"`
	ToName  *string   `json:"toName"`
	Subject string    `json:"subject"`
	Body    string    `gorm:"type:text" json:"body"`
	Status  string    `gorm:"index" json:"status"`
	Error   *string   `gorm:"type:text" json:"error"`
	SentAt  time.Time `gorm:"index" json:"sentAt"`
}

func (EmailHistory) TableName() string { return "email_history" }

// ─── BackupHistory ────────────────────────────────────────────────────────────

type BackupHistory struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Filename  string    `json:"filename"`
	Filepath  *string   `json:"filepath"`
	Filesize  int64     `json:"filesize"`
	Type      string    `gorm:"index" json:"type"`
	Status    string    `gorm:"index" json:"status"`
	Method    string    `gorm:"default:local" json:"method"`
	Error     *string   `gorm:"type:text" json:"error"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (BackupHistory) TableName() string { return "backup_history" }

// ─── IsolationTemplate ────────────────────────────────────────────────────────

type IsolationTemplate struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Type      string    `gorm:"index" json:"type"`
	Name      string    `json:"name"`
	Subject   *string   `json:"subject"`
	Message   string    `gorm:"type:text" json:"message"`
	Variables *string   `gorm:"type:json" json:"variables"`
	IsActive  bool      `gorm:"default:true" json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (IsolationTemplate) TableName() string { return "isolation_templates" }

// ─── TelegramBackupSettings ───────────────────────────────────────────────────

type TelegramBackupSettings struct {
	ID            string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Enabled       bool      `gorm:"default:false" json:"enabled"`
	BotToken      string    `json:"botToken"`
	ChatID        string    `json:"chatId"`
	BackupTopicID *string   `json:"backupTopicId"`
	HealthTopicID *string   `json:"healthTopicId"`
	Schedule      string    `gorm:"default:daily" json:"schedule"`
	ScheduleTime  string    `gorm:"default:02:00" json:"scheduleTime"`
	KeepLastN     int       `gorm:"default:7" json:"keepLastN"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (TelegramBackupSettings) TableName() string { return "telegram_backup_settings" }

// ─── WorkOrder ────────────────────────────────────────────────────────────────

type WorkOrder struct {
	ID              string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	TechnicianID    *string    `gorm:"index" json:"technicianId"`
	CustomerName    string     `json:"customerName"`
	CustomerPhone   string     `json:"customerPhone"`
	CustomerAddress string     `gorm:"type:text" json:"customerAddress"`
	IssueType       string     `json:"issueType"`
	Description     string     `gorm:"type:text" json:"description"`
	Priority        string     `gorm:"default:MEDIUM;index" json:"priority"`
	Status          string     `gorm:"default:OPEN;index" json:"status"`
	ScheduledDate   *time.Time `json:"scheduledDate"`
	EstimatedHours  *float64   `json:"estimatedHours"`
	Notes           *string    `gorm:"type:text" json:"notes"`
	TechnicianNotes *string    `gorm:"type:text" json:"technicianNotes"`
	CompletedAt     *time.Time `json:"completedAt"`
	AssignedAt      *time.Time `json:"assignedAt"`
	CreatedAt       time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`

	Technician *Technician `gorm:"foreignKey:TechnicianID" json:"technician,omitempty"`
}

func (WorkOrder) TableName() string { return "work_orders" }

// ─── TechnicianOtp ────────────────────────────────────────────────────────────

type TechnicianOtp struct {
	ID           string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	TechnicianID string     `gorm:"index" json:"technicianId"`
	Token        string     `gorm:"uniqueIndex;type:varchar(10)" json:"token"`
	ExpiresAt    time.Time  `json:"expiresAt"`
	UsedAt       *time.Time `json:"usedAt"`
	CreatedAt    time.Time  `json:"createdAt"`

	Technician *Technician `gorm:"foreignKey:TechnicianID" json:"technician,omitempty"`
}

func (TechnicianOtp) TableName() string { return "technician_otp" }

// ─── PushBroadcast ────────────────────────────────────────────────────────────

type PushBroadcast struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Title       string    `json:"title"`
	Body        string    `gorm:"type:text" json:"body"`
	Type        string    `gorm:"default:broadcast;index" json:"type"`
	TargetType  string    `gorm:"default:all" json:"targetType"`
	TargetIDs   *string   `gorm:"type:text" json:"targetIds"`
	SentCount   int       `gorm:"default:0" json:"sentCount"`
	FailedCount int       `gorm:"default:0" json:"failedCount"`
	SentBy      *string   `json:"sentBy"`
	Data        *string   `gorm:"type:text" json:"data"`
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

func (PushBroadcast) TableName() string { return "push_broadcasts" }

// ─── AgentPushSubscription ────────────────────────────────────────────────────

type AgentPushSubscription struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	AgentID   string    `gorm:"index" json:"agentId"`
	Endpoint  string    `gorm:"type:text" json:"endpoint"`
	P256dh    string    `gorm:"type:text" json:"p256dh"`
	Auth      string    `json:"auth"`
	CreatedAt time.Time `json:"createdAt"`
}

func (AgentPushSubscription) TableName() string { return "agent_push_subscriptions" }

// ─── TechnicianPushSubscription ───────────────────────────────────────────────

type TechnicianPushSubscription struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	TechnicianID string    `gorm:"index" json:"technicianId"`
	Endpoint     string    `gorm:"type:text" json:"endpoint"`
	P256dh       string    `gorm:"type:text" json:"p256dh"`
	Auth         string    `json:"auth"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (TechnicianPushSubscription) TableName() string { return "technician_push_subscriptions" }

