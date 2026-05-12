// Package cron provides scheduled jobs replacing cron-service.js.
package cron

import (
	"fmt"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	"github.com/s4lfanet/salfanet-radius-go/internal/notify"
	"github.com/s4lfanet/salfanet-radius-go/internal/radius"
)

// Scheduler wraps robfig/cron with DB access for all cron jobs.
type Scheduler struct {
	cron   *cron.Cron
	db     *gorm.DB
	radius *radius.Service
}

// New creates a new Scheduler with Asia/Jakarta timezone.
func New(db *gorm.DB, rad *radius.Service) *Scheduler {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	c := cron.New(cron.WithLocation(loc), cron.WithSeconds())
	return &Scheduler{cron: c, db: db, radius: rad}
}

// Start registers all cron jobs and starts the scheduler.
func (s *Scheduler) Start() {
	// ── Core billing ──────────────────────────────────────────────────────────
	// Invoice generator — daily 00:01 WIB
	s.cron.AddFunc("0 1 0 * * *", s.jobGenerateInvoices)

	// Invoice reminder — every hour WIB
	s.cron.AddFunc("0 0 * * * *", s.jobSendReminders)

	// Invoice catch-up (isolated users with no pending invoice) — daily 00:10 WIB
	s.cron.AddFunc("0 10 0 * * *", s.jobInvoiceCatchup)

	// ── PPPoE / RADIUS ────────────────────────────────────────────────────────
	// PPPoE Session Sync — every minute (critical: maintains radacct health)
	s.cron.AddFunc("0 * * * * *", s.jobPPPoESessionSync)

	// Session security monitor — every 5 minutes (close isolated users' sessions)
	s.cron.AddFunc("0 */5 * * * *", s.jobSessionMonitor)

	// Auto isolate expired users — daily 00:05 WIB
	s.cron.AddFunc("0 5 0 * * *", s.jobAutoIsolate)

	// FreeRADIUS health check + NAS sync — every 5 minutes
	s.cron.AddFunc("30 */5 * * * *", s.jobFreeRADIUSHealth)

	// ── Hotspot / Agents ──────────────────────────────────────────────────────
	// Voucher expiry sync — every 5 minutes
	s.cron.AddFunc("0 */5 * * * *", s.jobSyncVoucherExpiry)

	// Agent sales recording — every hour
	s.cron.AddFunc("0 0 * * * *", s.jobAgentSalesRecording)

	s.cron.Start()
	log.Info().Msg("cron: scheduler started (9 jobs registered)")
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}

// TriggerJob runs a job by name for manual invocation.
func (s *Scheduler) TriggerJob(job string) error {
	switch job {
	case "invoice_generate":
		go s.jobGenerateInvoices()
	case "invoice_reminder":
		go s.jobSendReminders()
	case "invoice_catchup":
		go s.jobInvoiceCatchup()
	case "isolate_expired":
		go s.jobAutoIsolate()
	case "pppoe_session_sync":
		go s.jobPPPoESessionSync()
	case "session_monitor":
		go s.jobSessionMonitor()
	case "freeradius_health":
		go s.jobFreeRADIUSHealth()
	case "voucher_sync":
		go s.jobSyncVoucherExpiry()
	case "agent_sales_recording":
		go s.jobAgentSalesRecording()
	default:
		return fmt.Errorf("unknown job: %s", job)
	}
	return nil
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

func (s *Scheduler) jobGenerateInvoices() {
	h := s.startHistory("invoice_generate")
	defer func() { s.completeHistory(h, recover()) }()

	// Get company settings
	var company models.Company
	if err := s.db.First(&company).Error; err != nil {
		s.failHistory(h, err)
		return
	}

	generateDays := 7
	if company.InvoiceGenerateDays != nil {
		generateDays = *company.InvoiceGenerateDays
	}

	// Find POSTPAID users whose expiry is within generateDays and no pending invoice
	cutoff := time.Now().AddDate(0, 0, generateDays)

	var users []models.PppoeUser
	s.db.Where(`subscription_type = 'POSTPAID' AND status IN ('active','isolated') 
		AND expired_at IS NOT NULL AND expired_at <= ?
		AND id NOT IN (
			SELECT user_id FROM invoices 
			WHERE status = 'PENDING' AND invoice_type = 'MONTHLY'
		)`, cutoff).
		Preload("Profile").
		Find(&users)

	count := 0
	for _, u := range users {
		if err := s.generateMonthlyInvoice(&u, &company); err != nil {
			log.Error().Err(err).Str("username", u.Username).Msg("cron: invoice generate error")
			continue
		}
		count++
	}

	s.finishHistory(h, fmt.Sprintf("Generated %d invoices", count))
	log.Info().Int("count", count).Msg("cron: invoice_generate done")
}

func (s *Scheduler) generateMonthlyInvoice(u *models.PppoeUser, _ *models.Company) error {
	amount := u.Profile.Price

	now := time.Now()
	dueDate := now.AddDate(0, 0, 7) // 7 days from now

	inv := models.Invoice{
		ID:               newID(),
		InvoiceNumber:    fmt.Sprintf("INV-%s", now.Format("20060102150405")),
		UserID:           &u.ID,
		Amount:           amount,
		Status:           models.InvoicePending,
		DueDate:          dueDate,
		InvoiceType:      models.InvoiceMonthly,
		CustomerName:     &u.Name,
		CustomerPhone:    &u.Phone,
		CustomerUsername: &u.Username,
	}
	return s.db.Create(&inv).Error
}

func (s *Scheduler) jobSendReminders() {
	h := s.startHistory("invoice_reminder")
	defer func() { s.completeHistory(h, recover()) }()

	var settings []models.WhatsappReminderSetting
	s.db.Where("enabled = true").Find(&settings)

	if len(settings) == 0 {
		s.finishHistory(h, "no active reminder settings")
		return
	}

	total := 0
	for _, setting := range settings {
		// Calculate target due date
		target := time.Now().AddDate(0, 0, setting.DaysBefore)
		dateStart := time.Date(target.Year(), target.Month(), target.Day(), 0, 0, 0, 0, target.Location())
		dateEnd := dateStart.Add(24 * time.Hour)

		var invoices []models.Invoice
		s.db.Where("status = 'PENDING' AND due_date >= ? AND due_date < ?", dateStart, dateEnd).
			Limit(setting.BatchSize).
			Find(&invoices)

		for _, inv := range invoices {
			if inv.CustomerPhone == nil || inv.CustomerName == nil {
				continue
			}
			paymentLink := ""
			if inv.PaymentLink != nil {
				paymentLink = *inv.PaymentLink
			}
			_ = notify.SendInvoiceReminder(
				*inv.CustomerPhone,
				*inv.CustomerName,
				inv.InvoiceNumber,
				inv.Amount,
				inv.DueDate,
				paymentLink,
			)
			total++
			if setting.BatchDelayMs > 0 {
				time.Sleep(time.Duration(setting.BatchDelayMs) * time.Millisecond)
			}
		}
	}

	s.finishHistory(h, fmt.Sprintf("Sent %d reminders", total))
}

func (s *Scheduler) jobAutoIsolate() {
	h := s.startHistory("isolate_expired")
	defer func() { s.completeHistory(h, recover()) }()

	var company models.Company
	_ = s.db.First(&company)

	grace := 0
	if company.GracePeriodDays != nil {
		grace = *company.GracePeriodDays
	}

	cutoff := time.Now().AddDate(0, 0, -grace)

	var users []models.PppoeUser
	s.db.Where(`subscription_type = 'POSTPAID' AND status = 'active' 
		AND auto_isolation_enabled = true
		AND expired_at IS NOT NULL AND expired_at < ?`, cutoff).
		Find(&users)

	count := 0
	for _, u := range users {
		// Isolate in FreeRADIUS
		if err := s.radius.Isolate(u.Username); err != nil {
			log.Error().Err(err).Str("user", u.Username).Msg("cron: radius isolate error")
			continue
		}

		// Update status in DB
		s.db.Model(&u).Update("status", "isolated")

		// Notify customer
		_ = notify.SendIsolationNotice(u.Phone, u.Name)
		count++
	}

	s.finishHistory(h, fmt.Sprintf("Isolated %d users", count))
	log.Info().Int("count", count).Msg("cron: isolate_expired done")
}

func (s *Scheduler) jobSyncVoucherExpiry() {
	now := time.Now()
	result := s.db.Model(&models.HotspotVoucher{}).
		Where("status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?", now).
		Update("status", "EXPIRED")
	if result.Error != nil {
		log.Error().Err(result.Error).Msg("cron: voucher sync error")
	}
}

// ─── History helpers ─────────────────────────────────────────────────────────

func (s *Scheduler) startHistory(jobType string) *models.CronHistory {
	h := &models.CronHistory{
		ID:        newID(),
		JobType:   jobType,
		Status:    "running",
		StartedAt: time.Now(),
	}
	s.db.Create(h)
	return h
}

func (s *Scheduler) completeHistory(h *models.CronHistory, rec interface{}) {
	if rec != nil {
		errStr := fmt.Sprintf("panic: %v", rec)
		h.Status = "failed"
		h.Error = &errStr
		now := time.Now()
		h.CompletedAt = &now
		s.db.Save(h)
		log.Error().Str("job", h.JobType).Str("panic", errStr).Msg("cron: panic recovered")
	}
}

func (s *Scheduler) finishHistory(h *models.CronHistory, result string) {
	now := time.Now()
	dur := int(now.Sub(h.StartedAt).Milliseconds())
	h.Status = "success"
	h.Result = &result
	h.CompletedAt = &now
	h.Duration = &dur
	s.db.Save(h)
}

func (s *Scheduler) failHistory(h *models.CronHistory, err error) {
	now := time.Now()
	errStr := err.Error()
	h.Status = "failed"
	h.Error = &errStr
	h.CompletedAt = &now
	s.db.Save(h)
}

func newID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
