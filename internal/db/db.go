package db

import (
	"fmt"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Init connects to MySQL using the given DSN and configures a connection pool.
// The DSN should be in the format: user:pass@tcp(host:port)/dbname?parseTime=True&loc=Local
func Init(databaseURL string) (*gorm.DB, error) {
	// Convert Prisma-style URL to Go MySQL DSN
	// Prisma: mysql://user:pass@localhost:3306/dbname
	// GORM:   user:pass@tcp(localhost:3306)/dbname?parseTime=True&loc=Local
	dsn, err := convertDSN(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid DATABASE_URL: %w", err)
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
		NowFunc: func() time.Time {
			return time.Now()
		},
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Connection pool settings
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	DB = db
	return db, nil
}

// convertDSN converts a Prisma-style mysql:// URL to a GORM DSN.
// Example: mysql://user:pass@localhost:3306/dbname
//
//	→ user:pass@tcp(localhost:3306)/dbname?parseTime=True&loc=Local&charset=utf8mb4
func convertDSN(url string) (string, error) {
	// Strip scheme
	const scheme = "mysql://"
	if len(url) <= len(scheme) {
		return "", fmt.Errorf("too short")
	}
	rest := url[len(scheme):]

	// user:pass@host:port/dbname[?params]
	atIdx := -1
	for i := len(rest) - 1; i >= 0; i-- {
		if rest[i] == '@' {
			atIdx = i
			break
		}
	}
	if atIdx < 0 {
		return "", fmt.Errorf("missing @ in URL")
	}
	userInfo := rest[:atIdx]
	hostDB := rest[atIdx+1:]

	// hostDB → host:port/dbname
	slashIdx := -1
	for i, c := range hostDB {
		if c == '/' {
			slashIdx = i
			break
		}
	}
	if slashIdx < 0 {
		return "", fmt.Errorf("missing / after host")
	}
	host := hostDB[:slashIdx]
	dbname := hostDB[slashIdx+1:]

	dsn := fmt.Sprintf("%s@tcp(%s)/%s?parseTime=True&loc=Local&charset=utf8mb4&collation=utf8mb4_unicode_ci", userInfo, host, dbname)
	return dsn, nil
}
