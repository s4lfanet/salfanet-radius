#!/bin/bash
# ============================================
# Start Telegram Bot - OLT Manager
# ============================================

echo ""
echo "================================================"
echo "  Starting OLT Telegram Bot..."
echo "================================================"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "[ERROR] File .env tidak ditemukan!"
    echo ""
    echo "Silakan buat file .env dengan format:"
    echo "TELEGRAM_BOT_TOKEN=your_token_here"
    echo "TELEGRAM_ADMIN_USERS=your_user_id"
    echo ""
    echo "Contoh lengkap ada di .env.example"
    echo ""
    exit 1
fi

# Activate virtual environment if exists
if [ -d ".venv" ]; then
    echo "[INFO] Activating virtual environment..."
    source .venv/bin/activate
    if [ $? -eq 0 ]; then
        echo "[OK] Virtual environment activated"
    else
        echo "[WARNING] Failed to activate virtual environment"
    fi
    echo ""
fi

# Detect Python command
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] Python not found! Please install Python 3.10+"
    exit 1
fi

# Detect pip command
PIP_CMD=""
if command -v pip3 &> /dev/null; then
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    PIP_CMD="pip"
else
    # Fallback to python -m pip
    PIP_CMD="$PYTHON_CMD -m pip"
fi

# Check if python-telegram-bot installed
$PYTHON_CMD -c "import telegram" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[WARNING] Library python-telegram-bot belum terinstall!"
    echo ""
    echo "Installing python-telegram-bot..."
    $PIP_CMD install python-telegram-bot==20.7
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Gagal menginstall python-telegram-bot!"
        echo "Silakan install manual dengan:"
        echo "  $PIP_CMD install python-telegram-bot==20.7"
        echo ""
        echo "Atau jalankan: ./install.sh"
        exit 1
    fi
    echo ""
fi

# Run the bot
echo "[OK] Starting bot..."
echo ""
echo "TIP: Untuk background mode, gunakan: ./start_telegram_bot_background.sh"
echo ""
$PYTHON_CMD telegram_bot.py
