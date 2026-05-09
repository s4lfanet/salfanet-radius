// Package notify provides HTTP client to the wa-service.js sidecar.
package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/s4lfanet/salfanet-radius-go/internal/config"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

type sendPayload struct {
	Phone   string `json:"phone"`
	Message string `json:"message"`
}

// Send sends a WhatsApp message via wa-service.js.
func Send(phone, message string) error {
	// Normalize phone: strip leading 0, ensure starts with 62
	phone = normalizePhone(phone)

	payload, _ := json.Marshal(sendPayload{Phone: phone, Message: message})
	url := config.C.WAServiceURL + "/send"

	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		log.Error().Err(err).Str("phone", phone).Msg("notify: wa-service send failed")
		return fmt.Errorf("wa-service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("wa-service: status %d", resp.StatusCode)
	}
	return nil
}

// SendOTP sends a 6-digit OTP to the customer via WhatsApp.
func SendOTP(phone, otp string) error {
	msg := fmt.Sprintf("Kode OTP Anda: *%s*\n\nBerlaku 5 menit. Jangan bagikan ke siapapun.", otp)
	return Send(phone, msg)
}

// SendInvoiceReminder sends an invoice reminder.
func SendInvoiceReminder(phone, name, invoiceNumber string, amount int, dueDate time.Time, paymentLink string) error {
	msg := fmt.Sprintf(
		"Halo *%s*,\n\nTagihan Anda:\nNo. Invoice: *%s*\nJumlah: *Rp %s*\nJatuh tempo: *%s*\n\nBayar: %s",
		name,
		invoiceNumber,
		formatRupiah(amount),
		dueDate.Format("02 Jan 2006"),
		paymentLink,
	)
	return Send(phone, msg)
}

// SendPaymentSuccess sends a payment confirmation.
func SendPaymentSuccess(phone, name, invoiceNumber string, amount int) error {
	msg := fmt.Sprintf(
		"Halo *%s*,\n\nPembayaran Anda telah diterima:\nNo. Invoice: *%s*\nJumlah: *Rp %s*\n\nTerima kasih!",
		name,
		invoiceNumber,
		formatRupiah(amount),
	)
	return Send(phone, msg)
}

// SendIsolationNotice notifies customer of isolation.
func SendIsolationNotice(phone, name string) error {
	msg := fmt.Sprintf(
		"Halo *%s*,\n\nLayanan internet Anda telah dinonaktifkan karena belum ada pembayaran.\n\nHubungi kami untuk informasi lebih lanjut.",
		name,
	)
	return Send(phone, msg)
}

// SendActivationNotice notifies customer of account activation.
func SendActivationNotice(phone, name, username string) error {
	msg := fmt.Sprintf(
		"Halo *%s*,\n\nAkun Anda telah diaktifkan!\nUsername: *%s*\n\nSilakan hubungi kami jika ada kendala.",
		name,
		username,
	)
	return Send(phone, msg)
}

func normalizePhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if strings.HasPrefix(phone, "0") {
		phone = "62" + phone[1:]
	}
	if !strings.HasPrefix(phone, "62") && !strings.HasPrefix(phone, "+") {
		phone = "62" + phone
	}
	return strings.TrimPrefix(phone, "+")
}

func formatRupiah(amount int) string {
	s := fmt.Sprintf("%d", amount)
	result := ""
	for i, c := range reverse(s) {
		if i > 0 && i%3 == 0 {
			result = "." + result
		}
		result = string(c) + result
	}
	return result
}

func reverse(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
