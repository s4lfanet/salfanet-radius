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
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/poller"
	"github.com/s4lfanet/salfanet-radius-go/internal/ws"
)

var wsUpgrader = fws.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool {
		return true
	},
}

// New builds and returns the configured Fiber app.
func New(db *gorm.DB, p *poller.Poller, hub *ws.Hub) *fiber.App {
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
	olt.Get("/:id", oltH.GetOLT)
	olt.Put("/:id", oltH.UpdateOLT)
	olt.Delete("/:id", oltH.DeleteOLT)
	olt.Post("/:id/sync", oltH.SyncOLT)
	olt.Get("/:id/onus", oltH.ListONUs)
	olt.Get("/:id/onus/register", oltH.GetRegisterMetadata) // must be before /:id/onus/:onuId
	olt.Get("/:id/onus/:onuId", oltH.GetONU)
	olt.Post("/:id/onus/:onuId/register", oltH.RegisterONU)
	olt.Delete("/:id/onus/:onuId", oltH.DeregisterONU)
	olt.Post("/:id/onus/:onuId/assign", oltH.AssignONU)
	olt.Get("/:id/alerts", oltH.ListAlerts)
	olt.Get("/:id/performance", oltH.ListPerformance)
	olt.Get("/:id/chassis", oltH.GetChassis)

	// ─── WebSocket (uses fasthttp upgrader directly) ──────────────────────────
	app.Get("/ws/olt/:id", func(c fiber.Ctx) error {
		oltID := c.Params("id")
		// Type assert to get the underlying *fasthttp.RequestCtx
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

			// Read pump — keep alive until client disconnects
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
