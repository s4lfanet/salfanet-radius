// Package api wires up the Fiber router with all handlers and middleware.
package api

import (
	fws "github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/valyala/fasthttp"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/api/handlers"
	"github.com/s4lfanet/salfanet-radius-go/internal/api/middleware"
	"github.com/s4lfanet/salfanet-radius-go/internal/config"
	"github.com/s4lfanet/salfanet-radius-go/internal/cron"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/poller"
	"github.com/s4lfanet/salfanet-radius-go/internal/radius"
	"github.com/s4lfanet/salfanet-radius-go/internal/ws"
)

var wsUpgrader = fws.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool {
		return true
	},
}

// New builds and returns the configured Fiber app.
func New(db *gorm.DB, p *poller.Poller, hub *ws.Hub, rad *radius.Service, sched *cron.Scheduler) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName: "Salfanet RADIUS API",
	})

	// Global middleware
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: config.C.CORSOrigins,
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
	}))

	// ─── Handlers ────────────────────────────────────────────────────────────
	authH := handlers.NewAuthHandler(db)
	adminH := handlers.NewAdminHandler(db)
	oltH := handlers.NewOLTHandler(db, p, hub)
	pppoeH := handlers.NewPPPoEHandler(db, rad)
	billingH := handlers.NewBillingHandler(db)
	radiusH := handlers.NewRadiusHandler(db, rad)
	hotspotH := handlers.NewHotspotHandler(db)
	agentH := handlers.NewAgentHandler(db)
	networkH := handlers.NewNetworkHandler(db)
	waH := handlers.NewWhatsappHandler(db)
	ticketH := handlers.NewTicketHandler(db)
	companyH := handlers.NewCompanyHandler(db)
	cronH := handlers.NewCronHandler(db, sched)
	customerH := handlers.NewCustomerPortalHandler(db)
	sessionsH := handlers.NewSessionsHandler(db)
	settingsH := handlers.NewSettingsHandler(db)
	permsH := handlers.NewPermissionsHandler(db)
	inventoryH := handlers.NewInventoryHandler(db)
	keuanganH := handlers.NewKeuanganHandler(db)
	manualPayH := handlers.NewManualPaymentHandler(db)
	jobH := handlers.NewJobHandler(db)
	empAdminH := handlers.NewEmployeeAdminHandler(db)
	genieacsH := handlers.NewGenieacsHandler(db)

	// ─── Public routes ───────────────────────────────────────────────────────
	app.Get("/api/system/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/api/system/version", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"version": "2.0.0-go", "engine": "Go"})
	})

	// Auth (public)
	auth := app.Group("/api/auth")
	auth.Post("/login", authH.Login)
	auth.Post("/logout", authH.Logout)
	auth.Post("/refresh", authH.Refresh)
	auth.Post("/customer/login", authH.CustomerLogin)
	auth.Post("/customer/verify-otp", authH.CustomerVerifyOTP)
	auth.Post("/agent/login", authH.AgentLogin)

	// Payment gateway webhooks (public — verified by signature)
	webhooks := app.Group("/api/billing/payment-gateway/webhook")
	webhooks.Post("/midtrans", billingH.WebhookMidtrans)
	webhooks.Post("/xendit", billingH.WebhookXendit)
	webhooks.Post("/duitku", billingH.WebhookDuitku)
	webhooks.Post("/tripay", billingH.WebhookTripay)

	// ─── Protected routes (JWT required) ─────────────────────────────────────
	api := app.Group("/api", middleware.AuthMiddleware)

	// Session
	api.Get("/auth/session", authH.Session)

	// Admin dashboard
	admin := api.Group("/admin")
	admin.Get("/stats", adminH.Stats)
	admin.Get("/revenue-chart", adminH.RevenueChart)
	admin.Get("/activity", adminH.Activity)
	admin.Get("/isolated-users", adminH.IsolatedUsers)
	admin.Get("/topup-requests", adminH.TopupRequests)
	admin.Post("/topup-requests/:id/approve", adminH.ApproveTopup)
	admin.Post("/topup-requests/:id/reject", adminH.RejectTopup)
	admin.Get("/suspend-requests", adminH.SuspendRequests)
	admin.Post("/suspend-requests/:id/approve", adminH.ApproveSuspend)
	admin.Post("/suspend-requests/:id/reject", adminH.RejectSuspend)

	// Dashboard alias (same stats, different path)
	api.Get("/dashboard/stats", adminH.Stats)
	api.Get("/dashboard/revenue-chart", adminH.RevenueChart)

	// OLT management
	olt := api.Group("/olt")
	olt.Get("/", oltH.ListOLTs)
	olt.Post("/", oltH.CreateOLT)
	olt.Get("/:id/onus/register", oltH.GetRegisterMetadata) // before /:id
	olt.Get("/:id", oltH.GetOLT)
	olt.Put("/:id", oltH.UpdateOLT)
	olt.Delete("/:id", oltH.DeleteOLT)
	olt.Post("/:id/sync", oltH.SyncOLT)
	olt.Get("/:id/onus", oltH.ListONUs)
	olt.Get("/:id/onus/:onuId", oltH.GetONU)
	olt.Post("/:id/onus/:onuId/register", oltH.RegisterONU)
	olt.Delete("/:id/onus/:onuId", oltH.DeregisterONU)
	olt.Post("/:id/onus/:onuId/assign", oltH.AssignONU)
	olt.Get("/:id/alerts", oltH.ListAlerts)
	olt.Get("/:id/performance", oltH.ListPerformance)
	olt.Get("/:id/chassis", oltH.GetChassis)

	// PPPoE
	pppoe := api.Group("/pppoe")
	pppoe.Get("/areas", pppoeH.ListAreas)
	pppoe.Post("/areas", pppoeH.CreateArea)
	pppoe.Put("/areas/:id", pppoeH.UpdateArea)
	pppoe.Delete("/areas/:id", pppoeH.DeleteArea)

	pppoe.Get("/profiles", pppoeH.ListProfiles)
	pppoe.Post("/profiles", pppoeH.CreateProfile)
	pppoe.Put("/profiles/:id", pppoeH.UpdateProfile)
	pppoe.Delete("/profiles/:id", pppoeH.DeleteProfile)

	pppoe.Get("/customers", pppoeH.ListCustomers)
	pppoe.Post("/customers", pppoeH.CreateCustomer)
	pppoe.Get("/customers/:id", pppoeH.GetCustomer)
	pppoe.Put("/customers/:id", pppoeH.UpdateCustomer)

	pppoe.Get("/users", pppoeH.ListUsers)
	pppoe.Post("/users", pppoeH.CreateUser)
	pppoe.Get("/users/:id", pppoeH.GetUser)
	pppoe.Put("/users/:id", pppoeH.UpdateUser)
	pppoe.Delete("/users/:id", pppoeH.DeleteUser)
	pppoe.Post("/users/:id/suspend", pppoeH.SuspendUser)
	pppoe.Post("/users/:id/activate", pppoeH.ActivateUser)
	pppoe.Post("/users/:id/isolate", pppoeH.IsolateUser)
	pppoe.Post("/users/:id/unisolate", pppoeH.UnisolateUser)
	pppoe.Get("/users/:id/sessions", pppoeH.GetUserSessions)
	pppoe.Get("/users/:id/invoices", pppoeH.GetUserInvoices)
	pppoe.Post("/users/:id/sync-radius", pppoeH.SyncToRadius)

	pppoe.Get("/registrations", pppoeH.ListRegistrations)
	pppoe.Post("/registrations/:id/approve", pppoeH.ApproveRegistration)
	pppoe.Post("/registrations/:id/reject", pppoeH.RejectRegistration)

	// Registrations (root-level alias — matches TypeScript path /api/registrations)
	regs := api.Group("/registrations")
	regs.Get("/", pppoeH.ListRegistrations)
	regs.Get("/:id", pppoeH.GetRegistration)
	regs.Put("/:id", pppoeH.UpdateRegistration)
	regs.Delete("/:id", pppoeH.DeleteRegistration)
	regs.Post("/:id/approve", pppoeH.ApproveRegistration)
	regs.Post("/:id/reject", pppoeH.RejectRegistration)

	// Billing
	billing := api.Group("/billing")
	billing.Get("/invoices", billingH.ListInvoices)
	billing.Post("/invoices", billingH.CreateInvoice)
	billing.Get("/invoices/:id", billingH.GetInvoice)
	billing.Put("/invoices/:id", billingH.UpdateInvoice)
	billing.Delete("/invoices/:id", billingH.DeleteInvoice)
	billing.Post("/invoices/:id/pay", billingH.PayInvoice)
	billing.Post("/invoices/:id/send-wa", billingH.SendReminderWA)
	billing.Post("/generate-monthly", billingH.GenerateMonthlyInvoices)
	billing.Get("/manual-payments", billingH.ListManualPayments)
	billing.Get("/transactions", billingH.ListTransactions)
	billing.Post("/transactions", billingH.CreateTransaction)
	billing.Get("/transaction-categories", billingH.ListTransactionCategories)
	billing.Post("/transaction-categories", billingH.CreateTransactionCategory)

	// FreeRADIUS
	radiusGrp := api.Group("/radius")
	radiusGrp.Get("/users", radiusH.ListUsers)
	radiusGrp.Post("/users", radiusH.UpsertUser)
	radiusGrp.Delete("/users/:username", radiusH.DeleteUser)
	radiusGrp.Get("/sessions", radiusH.ActiveSessions)
	radiusGrp.Get("/stats", radiusH.Stats)
	radiusGrp.Post("/disconnect/:username", radiusH.Disconnect)

	// Hotspot
	hotspot := api.Group("/hotspot")
	hotspot.Get("/profiles", hotspotH.ListProfiles)
	hotspot.Post("/profiles", hotspotH.CreateProfile)
	hotspot.Put("/profiles/:id", hotspotH.UpdateProfile)
	hotspot.Delete("/profiles/:id", hotspotH.DeleteProfile)
	hotspot.Get("/vouchers", hotspotH.ListVouchers)
	hotspot.Post("/vouchers/generate", hotspotH.GenerateVouchers)
	hotspot.Delete("/vouchers/:id", hotspotH.DeleteVoucher)

	// Agents
	agent := api.Group("/agents")
	agent.Get("/", agentH.ListAgents)
	agent.Post("/", agentH.CreateAgent)
	agent.Get("/vouchers", agentH.ListAgentVouchers)
	agent.Get("/:id", agentH.GetAgent)
	agent.Put("/:id", agentH.UpdateAgent)
	agent.Delete("/:id", agentH.DeleteAgent)
	agent.Get("/:id/sales", agentH.GetAgentSales)
	agent.Get("/:id/deposits", agentH.GetAgentDeposits)
	agent.Post("/:id/topup-balance", agentH.TopupBalance)

	// Network Map
	network := api.Group("/network")
	network.Get("/olts", networkH.ListOLTsForMap)
	network.Get("/odcs", networkH.ListODCs)
	network.Post("/odcs", networkH.CreateODC)
	network.Put("/odcs/:id", networkH.UpdateODC)
	network.Delete("/odcs/:id", networkH.DeleteODC)
	network.Get("/odps", networkH.ListODPs)
	network.Post("/odps", networkH.CreateODP)
	network.Put("/odps/:id", networkH.UpdateODP)
	network.Delete("/odps/:id", networkH.DeleteODP)
	network.Get("/otbs", networkH.ListOTBs)
	network.Post("/otbs", networkH.CreateOTB)
	network.Get("/routers", networkH.ListRouters)
	network.Post("/routers", networkH.CreateRouter)

	// WhatsApp
	wa := api.Group("/whatsapp")
	wa.Get("/providers", waH.ListProviders)
	wa.Post("/providers", waH.CreateProvider)
	wa.Put("/providers/:id", waH.UpdateProvider)
	wa.Get("/templates", waH.ListTemplates)
	wa.Put("/templates/:type", waH.UpdateTemplate)
	wa.Post("/send", waH.SendMessage)
	wa.Get("/history", waH.ListHistory)
	wa.Get("/reminder-settings", waH.GetReminderSettings)
	wa.Put("/reminder-settings", waH.UpdateReminderSettings)

	// Tickets
	tickets := api.Group("/tickets")
	tickets.Get("/", ticketH.ListTickets)
	tickets.Post("/", ticketH.CreateTicket)
	tickets.Get("/:id", ticketH.GetTicket)
	tickets.Put("/:id", ticketH.UpdateTicket)
	tickets.Post("/:id/reply", ticketH.ReplyTicket)
	tickets.Post("/:id/close", ticketH.CloseTicket)

	// Sessions
	sessions := api.Group("/sessions")
	sessions.Get("/", sessionsH.ListSessions)
	sessions.Post("/disconnect", sessionsH.DisconnectSession)
	sessions.Post("/sync", sessionsH.SyncSessions)
	sessions.Get("/export", sessionsH.ExportSessions)

	// Company
	api.Get("/company", companyH.GetCompany)
	api.Put("/company", companyH.UpdateCompany)

	// Settings
	settings := api.Group("/settings")
	settings.Get("/email", settingsH.GetEmailSettings)
	settings.Post("/email", settingsH.UpdateEmailSettings)
	settings.Get("/isolation", settingsH.GetIsolationSettings)
	settings.Put("/isolation", settingsH.UpdateIsolationSettings)
	// settings/company → alias to company endpoint
	settings.Get("/company", companyH.GetCompany)
	settings.Put("/company", companyH.UpdateCompany)
	// GenieACS settings
	settings.Get("/genieacs", genieacsH.GetSettings)
	settings.Post("/genieacs", genieacsH.SaveSettings)

	// Permissions (RBAC)
	perms := api.Group("/permissions")
	perms.Get("/", permsH.GetPermissions)
	perms.Get("/role-templates", permsH.GetRoleTemplates)
	perms.Get("/role/:role", permsH.GetRolePermissions)
	perms.Put("/role/:role", permsH.UpdateRolePermissions)

	// Inventory
	inv := api.Group("/inventory")
	inv.Get("/categories", inventoryH.ListCategories)
	inv.Post("/categories", inventoryH.CreateCategory)
	inv.Put("/categories/:id", inventoryH.UpdateCategory)
	inv.Delete("/categories/:id", inventoryH.DeleteCategory)
	inv.Get("/suppliers", inventoryH.ListSuppliers)
	inv.Post("/suppliers", inventoryH.CreateSupplier)
	inv.Put("/suppliers/:id", inventoryH.UpdateSupplier)
	inv.Delete("/suppliers/:id", inventoryH.DeleteSupplier)
	inv.Get("/items", inventoryH.ListItems)
	inv.Post("/items", inventoryH.CreateItem)
	inv.Put("/items/:id", inventoryH.UpdateItem)
	inv.Delete("/items/:id", inventoryH.DeleteItem)
	inv.Get("/movements", inventoryH.ListMovements)
	inv.Post("/movements", inventoryH.CreateMovement)

	// Keuangan
	keu := api.Group("/keuangan")
	keu.Get("/transactions", keuanganH.ListTransactions)
	keu.Post("/transactions", keuanganH.CreateTransaction)
	keu.Delete("/transactions/:id", keuanganH.DeleteTransaction)
	keu.Get("/categories", keuanganH.ListCategories)
	keu.Post("/categories", keuanganH.CreateCategory)
	keu.Get("/export", keuanganH.Export)

	// Manual Payments
	manPay := api.Group("/manual-payments")
	manPay.Get("", manualPayH.List)
	manPay.Post("", manualPayH.Create)
	manPay.Put("/:id", manualPayH.Review)
	manPay.Delete("/:id", manualPayH.Delete)

	// Jobs (Admin)
	jobs := api.Group("/admin/jobs")
	jobs.Get("", jobH.List)
	jobs.Get("/stats", jobH.Stats)
	jobs.Post("", jobH.Create)
	jobs.Get("/:id", jobH.Get)
	jobs.Patch("/:id/status", jobH.UpdateStatus)

	// Employees (for job assignment dropdown)
	api.Get("/admin/employees", jobH.ListEmployees)

	// Admin Employees full CRUD
	api.Post("/admin/employees", empAdminH.Create)
	api.Put("/admin/employees/:id", empAdminH.Update)
	api.Delete("/admin/employees/:id", empAdminH.Delete)

	// Job Assignments (alias for jobs with dedicated delete path)
	api.Get("/admin/job-assignments", jobH.List)
	api.Delete("/admin/job-assignments/:id", jobH.DeleteJob)

	// GenieACS proxy
	api.Post("/genieacs/devices/:deviceId/wifi", genieacsH.UpdateWifi)
	api.Post("/genieacs/devices/:deviceId/connection-request", genieacsH.ConnectionRequest)
	api.Get("/genieacs/tasks", genieacsH.ListTasks)
	api.Delete("/genieacs/tasks/:taskId", genieacsH.DeleteTask)

	// Users list (with ODP/ODC filters)
	api.Get("/users/list", pppoeH.ListUsersForSelect)

	// Cron
	cronGrp := api.Group("/cron")
	cronGrp.Get("/history", cronH.ListHistory)
	cronGrp.Post("/trigger/:job", cronH.TriggerJob)

	// Customer Portal (JWT-less, uses customer session token validated against DB)
	customer := app.Group("/api/customer", middleware.NewCustomerAuthMiddleware(db))
	customer.Get("/profile", customerH.GetProfile)
	customer.Get("/me", customerH.GetMe)
	customer.Get("/dashboard", customerH.GetDashboard)
	customer.Get("/packages", customerH.GetPackages)
	customer.Post("/auto-renewal", customerH.ToggleAutoRenewal)
	customer.Get("/notifications", customerH.GetNotifications)
	customer.Get("/payment-history", customerH.GetPaymentHistory)
	customer.Get("/invoices", customerH.GetInvoices)
	customer.Post("/invoices/:id/pay", customerH.PayInvoice)
	customer.Get("/usage", customerH.GetUsage)
	customer.Post("/topup-request", customerH.CreateTopupRequest)
	customer.Get("/suspend-request", customerH.GetSuspendRequest)
	customer.Post("/suspend-request", customerH.CreateSuspendRequest)
	customer.Delete("/suspend-request", customerH.CancelSuspendRequest)
	customer.Get("/tickets", customerH.GetCustomerTickets)
	customer.Post("/tickets", customerH.CreateCustomerTicket)
	customer.Post("/push-subscribe", customerH.PushSubscribe)

	// ─── WebSocket ────────────────────────────────────────────────────────────
	app.Get("/ws/olt/:id", func(c fiber.Ctx) error {
		oltID := c.Params("id")
		type rawFasthttpCtx interface {
			RequestCtx() *fasthttp.RequestCtx
		}
		rc, ok := c.(rawFasthttpCtx)
		if !ok {
			return fiber.ErrUpgradeRequired
		}
		return wsUpgrader.Upgrade(rc.RequestCtx(), func(conn *fws.Conn) {
			client := hub.Register(conn, oltID)
			defer hub.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					break
				}
			}
		})
	})

	// ─── NEW HANDLERS (Batch 5) ──────────────────────────────────────────────

	// Notifications
	notifH := handlers.NewNotificationHandler(db)
	api.Get("/notifications", notifH.List)
	api.Put("/notifications", notifH.MarkRead)
	api.Delete("/notifications/:id", notifH.Delete)

	// Public (no auth required)
	pubH := handlers.NewPublicHandler(db)
	app.Get("/api/public/company", pubH.GetCompany)
	app.Get("/api/public/areas", pubH.GetAreas)
	app.Get("/api/public/profiles", pubH.GetProfiles)
	app.Get("/api/public/stats", pubH.GetStats)
	app.Get("/api/public/payment-gateways", pubH.GetPaymentGateways)
	app.Post("/api/public/upload-registration", pubH.UploadRegistration)

	// FreeRADIUS management
	frH := handlers.NewFreeradiusHandler(db)
	freeradius := api.Group("/freeradius")
	freeradius.Get("/status", frH.GetStatus)
	freeradius.Post("/start", frH.Start)
	freeradius.Post("/stop", frH.Stop)
	freeradius.Post("/restart", frH.Restart)
	freeradius.Get("/logs", frH.GetLogs)
	freeradius.Get("/radcheck", frH.GetRadcheck)
	freeradius.Post("/radtest", frH.RunRadtest)
	freeradius.Get("/config/list", frH.ListConfigs)
	freeradius.Get("/config/read", frH.ReadConfig)
	freeradius.Post("/config/save", frH.SaveConfig)

	// Root-level invoices (separate from /billing/invoices)
	invExtH := handlers.NewInvoiceExtHandler(db)
	invoicesGrp := api.Group("/invoices")
	invoicesGrp.Get("/export", invExtH.Export)
	invoicesGrp.Get("/counts", invExtH.Counts)
	invoicesGrp.Post("/generate", invExtH.Generate)
	invoicesGrp.Post("/send-reminder", invExtH.SendReminder)
	invoicesGrp.Post("/send-reminders-bulk", invExtH.SendRemindersBulk)
	invoicesGrp.Get("/by-token/:token", invExtH.GetByToken)
	invoicesGrp.Get("/:id/pdf", invExtH.GetPDF)
	invoicesGrp.Get("/", invExtH.List)
	invoicesGrp.Post("/", invExtH.Create)
	invoicesGrp.Delete("/", invExtH.Delete)

	// Referrals
	refH := handlers.NewReferralHandler(db)
	api.Get("/admin/referrals/config", refH.GetConfig)
	api.Put("/admin/referrals/config", refH.UpdateConfig)
	api.Get("/admin/referrals", refH.List)
	api.Put("/admin/referrals/:id", refH.UpdateStatus)
	api.Delete("/admin/referrals/:id", refH.Delete)

	// Admin Users
	adminUserH := handlers.NewAdminUserHandler(db)
	api.Get("/admin/users", adminUserH.List)
	api.Post("/admin/users", adminUserH.Create)
	api.Get("/admin/users/:id/permissions", adminUserH.GetPermissions)
	api.Put("/admin/users/:id/permissions", adminUserH.SetPermissions)
	api.Get("/admin/users/:id", adminUserH.Get)
	api.Put("/admin/users/:id", adminUserH.Update)
	api.Delete("/admin/users/:id", adminUserH.Delete)

	// Admin Technicians
	techAdminH := handlers.NewTechnicianAdminHandler(db)
	api.Get("/admin/technicians", techAdminH.List)
	api.Post("/admin/technicians", techAdminH.Create)
	api.Get("/admin/technicians/:id", techAdminH.Get)
	api.Put("/admin/technicians/:id", techAdminH.Update)
	api.Delete("/admin/technicians/:id", techAdminH.Delete)

	// Activity Log
	actH := handlers.NewActivityLogHandler(db)
	api.Get("/admin/activity-logs", actH.List)

	// Hotspot extensions (singular /voucher for individual ops)
	hotspotExtH := handlers.NewHotspotExtHandler(db)
	hotspot.Get("/voucher/export", hotspotExtH.Export)
	hotspot.Post("/voucher/bulk", hotspotExtH.BulkGenerate)
	hotspot.Post("/voucher/bulk-delete", hotspotExtH.BulkDelete)
	hotspot.Post("/voucher/resync", hotspotExtH.Resync)
	hotspot.Post("/voucher/send-whatsapp", hotspotExtH.SendWhatsapp)
	hotspot.Delete("/voucher/delete-expired", hotspotExtH.DeleteExpired)
	hotspot.Get("/vouchers/validate", hotspotExtH.ValidateVoucher)
	hotspot.Get("/voucher/:id", hotspotExtH.GetVoucher)
	hotspot.Delete("/voucher/:id", hotspotExtH.DeleteVoucher)
	hotspot.Get("/rekap-voucher/export", hotspotExtH.ExportRekap)
	hotspot.Get("/rekap-voucher", hotspotExtH.RekapVoucher)
	hotspot.Get("/agents/balance", hotspotExtH.AgentBalance)
	hotspot.Get("/agents/:id/history", hotspotExtH.AgentHistory)
	hotspot.Get("/agents", hotspotExtH.ListAgents)

	// Voucher Templates
	voucherTplH := handlers.NewVoucherTemplateHandler(db)
	api.Get("/voucher-templates", voucherTplH.List)
	api.Post("/voucher-templates", voucherTplH.Create)
	api.Get("/voucher-templates/:id", voucherTplH.Get)
	api.Put("/voucher-templates/:id", voucherTplH.Update)
	api.Delete("/voucher-templates/:id", voucherTplH.Delete)

	// Ticket extensions
	ticketExtH := handlers.NewTicketExtHandler(db)
	api.Get("/tickets/categories", ticketExtH.ListCategories)
	api.Post("/tickets/categories", ticketExtH.CreateCategory)
	api.Get("/tickets/stats", ticketExtH.Stats)
	api.Get("/tickets/messages", ticketExtH.ListMessages)
	api.Get("/tickets/dispatch", ticketExtH.ListDispatch)
	api.Post("/tickets/dispatch", ticketExtH.Dispatch)

	// Analytics
	analyticsH := handlers.NewAnalyticsHandler(db)
	api.Get("/admin/analytics", analyticsH.GetAnalytics)
	api.Get("/dashboard/analytics", analyticsH.GetAnalytics)
	api.Get("/dashboard/traffic", analyticsH.GetTraffic)

	// Settings extensions
	settingsExtH := handlers.NewSettingsExtHandler(db)
	api.Get("/settings/email/templates", settingsExtH.ListEmailTemplates)
	api.Put("/settings/email/templates/:type", settingsExtH.UpdateEmailTemplate)
	api.Post("/settings/email/test", settingsExtH.TestEmail)
	api.Get("/settings/timezone", settingsExtH.GetTimezone)
	api.Get("/settings/map", settingsExtH.GetMapSettings)
	api.Put("/settings/map", settingsExtH.UpdateMapSettings)
	api.Get("/email/history", settingsExtH.EmailHistory)

	// Backup
	backupH := handlers.NewBackupHandler(db)
	api.Get("/backup/history", backupH.History)
	api.Post("/backup/create", backupH.Create)
	api.Get("/backup/download/:id", backupH.Download)
	api.Post("/backup/restore", backupH.Restore)
	api.Get("/backup/telegram/settings", backupH.GetTelegramSettings)
	api.Put("/backup/telegram/settings", backupH.UpdateTelegramSettings)
	api.Delete("/backup/:id", backupH.Delete)

	// Telegram
	telegramH := handlers.NewTelegramHandler(db)
	api.Get("/telegram/settings", telegramH.GetSettings)
	api.Put("/telegram/settings", telegramH.UpdateSettings)
	api.Post("/telegram/test", telegramH.Test)
	api.Post("/telegram/send-backup", telegramH.SendBackup)
	api.Post("/telegram/test-backup", telegramH.TestBackup)

	// Push Notifications
	pushH := handlers.NewPushHandler(db)
	api.Get("/admin/push-notifications", pushH.ListBroadcasts)
	api.Post("/push/send", pushH.Send)
	api.Post("/push/subscribe", pushH.Subscribe)
	api.Delete("/push/unsubscribe", pushH.Unsubscribe)
	api.Get("/push/vapid-public-key", pushH.GetVapidKey)

	// OLT extensions (alert management, monitoring, metrics)
	oltExtH := handlers.NewOltExtHandler(db)
	api.Get("/olt/alerts", oltExtH.ListAlerts)
	api.Get("/olt/monitoring", oltExtH.Monitoring)
	api.Get("/olt/metrics", oltExtH.Metrics)
	api.Get("/olt/alerts/:id", oltExtH.GetAlert)
	api.Put("/olt/alerts/:id/resolve", oltExtH.ResolveAlert)

	// Health alias
	app.Get("/api/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "engine": "go"})
	})

	// ─────────────────────────────────────────────────────────────────────────

	return app
}
