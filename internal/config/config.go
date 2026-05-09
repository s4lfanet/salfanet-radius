package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port        string
	JWTSecret   string
	CORSOrigins []string
	AppBaseURL  string
	AppTimezone string
	Timezone    *time.Location

	// Database
	DatabaseURL string

	// WhatsApp service
	WAServiceURL string

	// Payment gateways
	MidtransServerKey  string
	MidtransClientKey  string
	XenditAPIKey       string
	DuitkuMerchantCode string
	DuitkuAPIKey       string
	TripayAPIKey       string
	TripayPrivateKey   string
	TripayMerchantCode string

	// Web Push
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDEmail      string
}

var C *Config

// Load reads environment variables (from .env file if present) and returns a Config.
func Load() (*Config, error) {
	// Try loading .env — ignore error if not found (e.g. production with real env vars)
	_ = godotenv.Load()

	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		JWTSecret:          requireEnv("JWT_SECRET"),
		CORSOrigins:        strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
		AppBaseURL:         getEnv("APP_BASE_URL", "http://localhost:3000"),
		AppTimezone:        getEnv("APP_TIMEZONE", "Asia/Jakarta"),
		DatabaseURL:        requireEnv("DATABASE_URL"),
		WAServiceURL:       getEnv("WA_SERVICE_URL", "http://localhost:3001"),
		MidtransServerKey:  getEnv("MIDTRANS_SERVER_KEY", ""),
		MidtransClientKey:  getEnv("MIDTRANS_CLIENT_KEY", ""),
		XenditAPIKey:       getEnv("XENDIT_API_KEY", ""),
		DuitkuMerchantCode: getEnv("DUITKU_MERCHANT_CODE", ""),
		DuitkuAPIKey:       getEnv("DUITKU_API_KEY", ""),
		TripayAPIKey:       getEnv("TRIPAY_API_KEY", ""),
		TripayPrivateKey:   getEnv("TRIPAY_PRIVATE_KEY", ""),
		TripayMerchantCode: getEnv("TRIPAY_MERCHANT_CODE", ""),
		VAPIDPublicKey:     getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:    getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDEmail:         getEnv("VAPID_EMAIL", ""),
	}

	loc, err := time.LoadLocation(cfg.AppTimezone)
	if err != nil {
		return nil, fmt.Errorf("invalid APP_TIMEZONE %q: %w", cfg.AppTimezone, err)
	}
	cfg.Timezone = loc

	C = cfg
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %q is not set", key))
	}
	return v
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
