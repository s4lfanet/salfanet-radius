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

	// Company
	api.Get("/company", companyH.GetCompany)
	api.Put("/company", companyH.UpdateCompany)

	// Cron
	cronGrp := api.Group("/cron")
	cronGrp.Get("/history", cronH.ListHistory)
	cronGrp.Post("/trigger/:job", cronH.TriggerJob)

	// Customer Portal (JWT-less, uses customer session token validated against DB)
	customer := app.Group("/api/customer", middleware.NewCustomerAuthMiddleware(db))
	customer.Get("/profile", customerH.GetProfile)
	customer.Get("/invoices", customerH.GetInvoices)
	customer.Post("/invoices/:id/pay", customerH.PayInvoice)
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

	return app
}
