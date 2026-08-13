#!/bin/bash

# Auto Backup Database Script
# Simpan di: /root/backup-db.sh
# Cron: 0 */6 * * * /root/backup-db.sh

BACKUP_DIR="/root/db_backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/radius_backup_$DATE.sql"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
mysqldump -h 172.30.0.1 -u radius -pDeveloperGame21 radius > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Keep only last 7 days backups
find $BACKUP_DIR -name "radius_backup_*.sql.gz" -mtime +7 -delete

echo "[$(date)] Backup completed: $BACKUP_FILE.gz"
