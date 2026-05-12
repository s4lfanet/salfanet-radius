package models

import "time"

// ─── Enums ───────────────────────────────────────────────────────────────────

type UsersRole string

const (
	RoleAdmin UsersRole = "ADMIN"
	RoleAgent UsersRole = "AGENT"
	RoleUser  UsersRole = "USER"
)

type InvoiceStatus string

const (
	InvoicePending   InvoiceStatus = "PENDING"
	InvoicePaid      InvoiceStatus = "PAID"
	InvoiceOverdue   InvoiceStatus = "OVERDUE"
	InvoiceCancelled InvoiceStatus = "CANCELLED"
)

type InvoiceType string

const (
	InvoiceMonthly      InvoiceType = "MONTHLY"
	InvoiceInstallation InvoiceType = "INSTALLATION"
	InvoiceAddon        InvoiceType = "ADDON"
	InvoiceTopup        InvoiceType = "TOPUP"
	InvoiceRenewal      InvoiceType = "RENEWAL"
)

type SubscriptionType string

const (
	Postpaid SubscriptionType = "POSTPAID"
	Prepaid  SubscriptionType = "PREPAID"
)

type ConnectionType string

const (
	ConnPPPoE    ConnectionType = "PPPOE"
	ConnHotspot  ConnectionType = "HOTSPOT"
	ConnStaticIP ConnectionType = "STATIC_IP"
)

// ─── User (admin) ─────────────────────────────────────────────────────────────

type User struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Email     string    `gorm:"uniqueIndex;not null" json:"email"`
	Password  string    `gorm:"not null" json:"-"`
	Name      string    `json:"name"`
	Role      UsersRole `gorm:"default:ADMIN" json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (User) TableName() string { return "users" }

// ─── PppoeArea ───────────────────────────────────────────────────────────────

type PppoeArea struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `gorm:"uniqueIndex;not null" json:"name"`
	Description *string   `json:"description"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (PppoeArea) TableName() string { return "pppoe_areas" }

// ─── PppoeProfile ────────────────────────────────────────────────────────────

type PppoeProfile struct {
	ID                  string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name                string    `gorm:"uniqueIndex;not null" json:"name"`
	Price               int       `json:"price"`
	Description         *string   `json:"description"`
	DownloadSpeed       int       `json:"downloadSpeed"`
	UploadSpeed         int       `json:"uploadSpeed"`
	RateLimit           *string   `json:"rateLimit"`
	GroupName           string    `json:"groupName"`
	MikrotikProfileName *string   `json:"mikrotikProfileName"`
	IPPoolName          *string   `json:"ipPoolName"`
	IPPoolRange         *string   `json:"ipPoolRange"`
	LocalAddress        *string   `json:"localAddress"`
	HPP                 *int      `json:"hpp"`
	PPNActive           bool      `gorm:"default:false" json:"ppnActive"`
	PPNRate             int       `gorm:"default:11" json:"ppnRate"`
	IsActive            bool      `gorm:"default:true" json:"isActive"`
	ValidityUnit        string    `gorm:"default:MONTHS" json:"validityUnit"`
	ValidityValue       int       `gorm:"default:1" json:"validityValue"`
	SharedUser          bool      `gorm:"default:true" json:"sharedUser"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

func (PppoeProfile) TableName() string { return "pppoe_profiles" }

// ─── PppoeCustomer ───────────────────────────────────────────────────────────

type PppoeCustomer struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	CustomerID   string    `gorm:"uniqueIndex;type:varchar(10)" json:"customerId"`
	Name         string    `json:"name"`
	Phone        string    `gorm:"index" json:"phone"`
	Email        *string   `json:"email"`
	Address      *string   `gorm:"type:text" json:"address"`
	IDCardNumber *string   `gorm:"type:varchar(50)" json:"idCardNumber"`
	IDCardPhoto  *string   `gorm:"type:varchar(500)" json:"idCardPhoto"`
	IsActive     bool      `gorm:"default:true" json:"isActive"`
	AreaID       *string   `json:"areaId"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	Area       *PppoeArea  `gorm:"foreignKey:AreaID" json:"area,omitempty"`
	PPPoEUsers []PppoeUser `gorm:"foreignKey:PppoeCustomerID" json:"pppoeUsers,omitempty"`
}

func (PppoeCustomer) TableName() string { return "pppoe_customers" }

// ─── PppoeUser ───────────────────────────────────────────────────────────────

type PppoeUser struct {
	ID                   string           `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Username             string           `gorm:"uniqueIndex;not null" json:"username"`
	CustomerID           *string          `gorm:"uniqueIndex;column:customer_id;type:varchar(20)" json:"customerId"`
	PppoeCustomerID      *string          `gorm:"column:pppoe_customer_id;index" json:"pppoeCustomerId"`
	Password             string           `gorm:"not null" json:"-"`
	ProfileID            string           `gorm:"index" json:"profileId"`
	AreaID               *string          `gorm:"index" json:"areaId"`
	Status               string           `gorm:"default:active;index" json:"status"`
	IPAddress            *string          `json:"ipAddress"`
	MACAddress           *string          `json:"macAddress"`
	Comment              *string          `json:"comment"`
	CreatedAt            time.Time        `json:"createdAt"`
	UpdatedAt            time.Time        `json:"updatedAt"`
	ExpiredAt            *time.Time       `gorm:"index" json:"expiredAt"`
	Address              *string          `json:"address"`
	Latitude             *float64         `json:"latitude"`
	Longitude            *float64         `json:"longitude"`
	Email                *string          `json:"email"`
	Name                 string           `json:"name"`
	Phone                string           `gorm:"index" json:"phone"`
	RouterID             *string          `gorm:"index" json:"routerId"`
	SubscriptionType     SubscriptionType `gorm:"default:POSTPAID;index" json:"subscriptionType"`
	LastPaymentDate      *time.Time       `json:"lastPaymentDate"`
	BillingDay           *int             `gorm:"default:1" json:"billingDay"`
	AutoIsolationEnabled bool             `gorm:"default:true" json:"autoIsolationEnabled"`
	Balance              int              `gorm:"default:0" json:"balance"`
	AutoRenewal          bool             `gorm:"default:false" json:"autoRenewal"`
	ConnectionType       ConnectionType   `gorm:"default:PPPOE" json:"connectionType"`
	ReferralCode         *string          `gorm:"uniqueIndex;type:varchar(10)" json:"referralCode"`
	ReferredByID         *string          `gorm:"column:referred_by_id" json:"referredById"`
	SyncedToRadius       bool             `gorm:"default:false" json:"syncedToRadius"`

	Profile  PppoeProfile `gorm:"foreignKey:ProfileID" json:"profile,omitempty"`
	Area     *PppoeArea   `gorm:"foreignKey:AreaID" json:"area,omitempty"`
	Invoices []Invoice    `gorm:"foreignKey:UserID" json:"invoices,omitempty"`
}

func (PppoeUser) TableName() string { return "pppoe_users" }

// ─── Invoice ─────────────────────────────────────────────────────────────────

type Invoice struct {
	ID               string        `gorm:"primaryKey;type:varchar(191)" json:"id"`
	InvoiceNumber    string        `gorm:"uniqueIndex;not null" json:"invoiceNumber"`
	UserID           *string       `gorm:"index" json:"userId"`
	Amount           int           `json:"amount"`
	Status           InvoiceStatus `gorm:"default:PENDING;index" json:"status"`
	DueDate          time.Time     `gorm:"index" json:"dueDate"`
	PaidAt           *time.Time    `json:"paidAt"`
	CreatedAt        time.Time     `json:"createdAt"`
	UpdatedAt        time.Time     `json:"updatedAt"`
	PaymentLink      *string       `json:"paymentLink"`
	PaymentToken     *string       `gorm:"uniqueIndex" json:"paymentToken"`
	CustomerName     *string       `json:"customerName"`
	CustomerPhone    *string       `json:"customerPhone"`
	CustomerEmail    *string       `json:"customerEmail"`
	CustomerUsername *string       `json:"customerUsername"`
	SentReminders    *string       `gorm:"type:text" json:"sentReminders"`
	Notes            *string       `gorm:"type:text" json:"notes"`
	InvoiceType      InvoiceType   `gorm:"default:MONTHLY;index" json:"invoiceType"`
	BaseAmount       *int          `json:"baseAmount"`

	User *PppoeUser `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (Invoice) TableName() string { return "invoices" }

// ─── Router (NAS) ────────────────────────────────────────────────────────────

type Router struct {
	ID          string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name        string    `json:"name"`
	NASName     string    `gorm:"column:nasname" json:"nasname"`
	ShortName   string    `gorm:"column:shortname;index" json:"shortname"`
	Type        string    `gorm:"default:mikrotik" json:"type"`
	IPAddress   string    `json:"ipAddress"`
	Username    string    `json:"username"`
	Password    string    `json:"-"`
	Port        int       `gorm:"default:8728" json:"port"`
	APIPort     int       `gorm:"default:8729" json:"apiPort"`
	Secret      string    `gorm:"default:secret123" json:"-"`
	Ports       int       `gorm:"default:1812" json:"ports"`
	Description *string   `json:"description"`
	Latitude    *float64  `json:"latitude"`
	Longitude   *float64  `json:"longitude"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (Router) TableName() string { return "nas" }

// ─── Company ─────────────────────────────────────────────────────────────────

type Company struct {
	ID                   string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name                 string    `json:"name"`
	Address              *string   `json:"address"`
	Phone                *string   `json:"phone"`
	Email                *string   `json:"email"`
	Logo                 *string   `json:"logo"`
	AdminPhone           *string   `json:"adminPhone"`
	BaseURL              *string   `gorm:"default:http://localhost:3000" json:"baseUrl"`
	Timezone             *string   `gorm:"default:Asia/Jakarta" json:"timezone"`
	PoweredBy            *string   `gorm:"default:SALFANET RADIUS" json:"poweredBy"`
	CustomerIDPrefix     *string   `gorm:"type:varchar(10)" json:"customerIdPrefix"`
	InvoiceGenerateDays  *int      `gorm:"default:7" json:"invoiceGenerateDays"`
	GracePeriodDays      *int      `gorm:"default:0" json:"gracePeriodDays"`
	IsolationEnabled     *bool     `gorm:"default:true" json:"isolationEnabled"`
	ReferralEnabled      *bool     `gorm:"default:false" json:"referralEnabled"`
	ReferralRewardAmount *int      `gorm:"default:10000" json:"referralRewardAmount"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

func (Company) TableName() string { return "companies" }

// ─── CronHistory ─────────────────────────────────────────────────────────────

type CronHistory struct {
	ID          string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	JobType     string     `gorm:"column:jobType;index" json:"jobType"`
	Status      string     `gorm:"column:status;index" json:"status"`
	StartedAt   time.Time  `gorm:"column:startedAt;autoCreateTime;index" json:"startedAt"`
	CompletedAt *time.Time `gorm:"column:completedAt" json:"completedAt"`
	Duration    *int       `gorm:"column:duration" json:"duration"`
	Result      *string    `gorm:"column:result;type:text" json:"result"`
	Error       *string    `gorm:"column:error;type:text" json:"error"`
}

func (CronHistory) TableName() string { return "cron_history" }

// ─── Radcheck ────────────────────────────────────────────────────────────────

type Radcheck struct {
	ID        int    `gorm:"primaryKey;autoIncrement" json:"id"`
	Username  string `gorm:"type:varchar(64);index" json:"username"`
	Attribute string `gorm:"type:varchar(64)" json:"attribute"`
	Op        string `gorm:"type:char(2);default::=" json:"op"`
	Value     string `gorm:"type:varchar(253)" json:"value"`
}

func (Radcheck) TableName() string { return "radcheck" }

// ─── Radreply ────────────────────────────────────────────────────────────────

type Radreply struct {
	ID        int    `gorm:"primaryKey;autoIncrement" json:"id"`
	Username  string `gorm:"type:varchar(64);index" json:"username"`
	Attribute string `gorm:"type:varchar(64)" json:"attribute"`
	Op        string `gorm:"type:char(2);default:=" json:"op"`
	Value     string `gorm:"type:varchar(253)" json:"value"`
}

func (Radreply) TableName() string { return "radreply" }

// ─── Radusergroup ─────────────────────────────────────────────────────────────

type Radusergroup struct {
	ID        int    `gorm:"primaryKey;autoIncrement" json:"id"`
	Username  string `gorm:"type:varchar(64);index" json:"username"`
	Groupname string `gorm:"type:varchar(64);index" json:"groupname"`
	Priority  int    `gorm:"default:1" json:"priority"`
}

func (Radusergroup) TableName() string { return "radusergroup" }

// ─── Radacct ─────────────────────────────────────────────────────────────────

type Radacct struct {
	RadacctID          int64      `gorm:"primaryKey;autoIncrement;column:radacctid" json:"radacctid"`
	AcctSessionID      string     `gorm:"type:varchar(64);column:acctsessionid" json:"acctsessionid"`
	AcctUniqueID       string     `gorm:"uniqueIndex;type:varchar(32);column:acctuniqueid" json:"acctuniqueid"`
	Username           string     `gorm:"type:varchar(64);index;column:username" json:"username"`
	NASIPAddress       string     `gorm:"type:varchar(15);index;column:nasipaddress" json:"nasipaddress"`
	AcctStartTime      *time.Time `gorm:"column:acctstarttime" json:"acctstarttime"`
	AcctUpdateTime     *time.Time `gorm:"column:acctupdatetime" json:"acctupdatetime"`
	AcctStopTime       *time.Time `gorm:"index;column:acctstoptime" json:"acctstoptime"`
	AcctSessionTime    *int64     `gorm:"column:acctsessiontime" json:"acctsessiontime"`
	FramedIPAddress    string     `gorm:"type:varchar(15);index;column:framedipaddress" json:"framedipaddress"`
	AcctInputOctets    *int64     `gorm:"column:acctinputoctets" json:"acctinputoctets"`
	AcctOutputOctets   *int64     `gorm:"column:acctoutputoctets" json:"acctoutputoctets"`
	CalledStationID    string     `gorm:"type:varchar(50);column:calledstationid" json:"calledstationid"`
	CallingStationID   string     `gorm:"type:varchar(50);column:callingstationid" json:"callingstationid"`
	AcctTerminateCause string     `gorm:"type:varchar(32);column:acctterminatecause" json:"acctterminatecause"`
}

func (Radacct) TableName() string { return "radacct" }

// ─── CustomerSession ─────────────────────────────────────────────────────────

type CustomerSession struct {
	ID        string     `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID    string     `gorm:"index" json:"userId"`
	Phone     string     `gorm:"index" json:"phone"`
	OTPCode   *string    `json:"-"`
	OTPExpiry *time.Time `json:"-"`
	Token     *string    `gorm:"uniqueIndex" json:"-"`
	ExpiresAt *time.Time `json:"expiresAt"`
	Verified  bool       `gorm:"default:false" json:"verified"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

func (CustomerSession) TableName() string { return "customer_sessions" }

// ─── WhatsappProvider ────────────────────────────────────────────────────────

type WhatsappProvider struct {
	ID           string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	APIKey       string    `json:"-"`
	APIURL       string    `json:"apiUrl"`
	SenderNumber *string   `json:"senderNumber"`
	IsActive     bool      `gorm:"default:true" json:"isActive"`
	Priority     int       `gorm:"default:0" json:"priority"`
	Description  *string   `gorm:"type:text" json:"description"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (WhatsappProvider) TableName() string { return "whatsapp_providers" }

// ─── WhatsappTemplate ────────────────────────────────────────────────────────

type WhatsappTemplate struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	Name      string    `json:"name"`
	Type      string    `gorm:"uniqueIndex" json:"type"`
	Message   string    `gorm:"type:text" json:"message"`
	IsActive  bool      `gorm:"default:true" json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (WhatsappTemplate) TableName() string { return "whatsapp_templates" }

// ─── ManualPayment ────────────────────────────────────────────────────────────

type ManualPayment struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	InvoiceID string    `gorm:"index" json:"invoiceId"`
	UserID    *string   `gorm:"index" json:"userId"`
	Amount    int       `json:"amount"`
	Method    string    `json:"method"`
	Notes     *string   `gorm:"type:text" json:"notes"`
	PaidAt    time.Time `json:"paidAt"`
	CreatedAt time.Time `json:"createdAt"`
}

func (ManualPayment) TableName() string { return "manual_payments" }

// ─── Ticket ───────────────────────────────────────────────────────────────────

type Ticket struct {
	ID        string    `gorm:"primaryKey;type:varchar(191)" json:"id"`
	UserID    string    `gorm:"index" json:"userId"`
	Subject   string    `json:"subject"`
	Status    string    `gorm:"default:open;index" json:"status"`
	Priority  string    `gorm:"default:normal" json:"priority"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User *PppoeUser `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (Ticket) TableName() string { return "tickets" }
