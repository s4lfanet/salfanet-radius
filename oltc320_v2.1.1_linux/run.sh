#!/bin/bash
################################################################################
#  ZTE C320 OLT Management System - Quick Launcher
#  Launcher untuk menu interaktif
################################################################################

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${RED}[ERROR]${RESET} Virtual environment tidak ditemukan!"
    echo -e "${YELLOW}[INFO]${RESET} Jalankan install.sh terlebih dahulu:"
    echo -e "        ${CYAN}./install.sh${RESET}"
    exit 1
fi

# Activate virtual environment
echo -e "${GREEN}[OK]${RESET} Mengaktifkan virtual environment..."
source .venv/bin/activate

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[WARNING]${RESET} File .env tidak ditemukan!"
    echo -e "${YELLOW}[INFO]${RESET} Membuat dari template..."
    
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}[OK]${RESET} File .env berhasil dibuat"
        echo -e "${CYAN}[INFO]${RESET} Edit file .env untuk konfigurasi OLT:"
        echo -e "        ${CYAN}nano .env${RESET} atau ${CYAN}vi .env${RESET}"
        echo ""
    else
        echo -e "${RED}[ERROR]${RESET} File .env.example tidak ditemukan!"
        exit 1
    fi
fi

# Run main application
echo -e "${GREEN}[OK]${RESET} Menjalankan aplikasi..."
python main.py --mode menu

# Deactivate on exit
deactivate
