#!/usr/bin/env bash
# backup-freeradius-local.sh
# Membuat arsip tar.gz dari /etc/freeradius/3.0/ dan menyimpannya di SALFANET_BACKUP_DIR
# Dijalankan oleh API /api/admin/system/freeradius-backup
# Output ditangkap ke /tmp/salfanet-fr-backup.log

set -euo pipefail

FR_DIR="/etc/freeradius/3.0"
APP_DIR="${SALFANET_APP_DIR:-/var/www/salfanet-radius}"
BACKUP_DIR="${SALFANET_BACKUP_DIR:-${APP_DIR}/backups/freeradius}"

echo "=== FreeRADIUS Backup ==="
echo "Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Sumber: ${FR_DIR}"
echo "Tujuan: ${BACKUP_DIR}"
echo ""

# Pastikan direktori backup ada
mkdir -p "${BACKUP_DIR}"

# Cek FreeRADIUS dir ada
if [ ! -d "${FR_DIR}" ]; then
  echo "✘ ERROR: Direktori FreeRADIUS tidak ditemukan: ${FR_DIR}"
  exit 1
fi

# Buat nama file dengan timestamp
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
FILENAME="freeradius-config-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${FILENAME}"

echo "Membuat arsip: ${FILENAME}"

# Buat tar.gz dari seluruh direktori FreeRADIUS
if tar -czf "${ARCHIVE_PATH}" -C "$(dirname "${FR_DIR}")" "$(basename "${FR_DIR}")" 2>&1; then
  SIZE=$(du -sh "${ARCHIVE_PATH}" 2>/dev/null | cut -f1 || echo "?")
  echo "✔ Backup selesai"
  echo "✔ Ukuran: ${SIZE}"
  # Bersihkan backup lama (simpan 10 terakhir)
  BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | wc -l || echo "0")
  if [ "${BACKUP_COUNT}" -gt 10 ]; then
    echo "Membersihkan backup lama (simpan 10 terbaru)..."
    ls -1t "${BACKUP_DIR}"/*.tar.gz | tail -n +11 | xargs rm -f
    echo "✔ Cleanup selesai"
  fi
  echo ""
  echo "BACKUP_FILE: ${FILENAME}"
else
  echo "✘ ERROR: Gagal membuat arsip"
  rm -f "${ARCHIVE_PATH}" 2>/dev/null || true
  exit 1
fi
