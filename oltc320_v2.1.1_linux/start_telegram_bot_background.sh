#!/bin/bash
# ============================================
# Start Telegram Bot in Background - Linux
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="telegram_bot.pid"
LOG_FILE="logs/telegram_bot.log"

echo ""
echo "================================================"
echo "  Starting Telegram Bot in Background..."
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
    exit 1
fi

# Check if bot is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "[WARNING] Bot sudah berjalan dengan PID: $OLD_PID"
        echo ""
        echo "Untuk stop bot, jalankan: ./stop_telegram_bot.sh"
        echo "Atau kill manual: kill $OLD_PID"
        exit 1
    else
        echo "[INFO] Removing stale PID file..."
        rm -f "$PID_FILE"
    fi
fi

# Create logs directory
mkdir -p logs

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "[WARNING] Virtual environment tidak ditemukan!"
    echo "[INFO] Running installer..."
    echo ""
    
    if [ -f "install.sh" ]; then
        chmod +x install.sh
        ./install.sh
        
        if [ $? -ne 0 ]; then
            echo ""
            echo "[ERROR] Installer gagal!"
            echo "Silakan jalankan manual: ./install.sh"
            exit 1
        fi
    else
        echo "[ERROR] install.sh tidak ditemukan!"
        echo "Silakan jalankan installer terlebih dahulu."
        exit 1
    fi
    echo ""
fi

# Activate virtual environment
if [ -d ".venv" ]; then
    echo "[INFO] Activating virtual environment..."
    source .venv/bin/activate
    
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to activate virtual environment!"
        exit 1
    fi
fi

# Detect Python command
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] Python not found!"
    echo "Jalankan: ./install.sh"
    exit 1
fi

# Detect pip command
PIP_CMD=""
if command -v pip3 &> /dev/null; then
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    PIP_CMD="pip"
else
    PIP_CMD="$PYTHON_CMD -m pip"
fi

# Check critical dependencies
echo "[INFO] Checking dependencies..."
MISSING_DEPS=""

# Check python-telegram-bot
$PYTHON_CMD -c "import telegram" 2>/dev/null
if [ $? -ne 0 ]; then
    MISSING_DEPS="$MISSING_DEPS python-telegram-bot==20.7"
fi

# Check python-dotenv
$PYTHON_CMD -c "import dotenv" 2>/dev/null
if [ $? -ne 0 ]; then
    MISSING_DEPS="$MISSING_DEPS python-dotenv"
fi

# Install missing dependencies
if [ -n "$MISSING_DEPS" ]; then
    echo "[INFO] Installing missing dependencies:$MISSING_DEPS"
    $PIP_CMD install $MISSING_DEPS --quiet
    
    if [ $? -ne 0 ]; then
        echo "[WARNING] Some dependencies failed to install"
        echo "[INFO] Installing all dependencies from requirements.txt..."
        
        if [ -f "requirements.txt" ]; then
            $PIP_CMD install -r requirements.txt --quiet
            
            if [ $? -ne 0 ]; then
                echo "[ERROR] Failed to install dependencies!"
                echo "Try manual: $PIP_CMD install -r requirements.txt"
                exit 1
            fi
        fi
    fi
    echo "[OK] Dependencies installed"
fi

# Verify bot file exists
if [ ! -f "telegram_bot.py" ]; then
    echo "[ERROR] telegram_bot.py tidak ditemukan!"
    echo "Pastikan Anda berada di direktori yang benar."
    exit 1
fi

# Final dependency check
echo "[INFO] Verifying bot dependencies..."
$PYTHON_CMD -c "import telegram, dotenv" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[ERROR] Critical dependencies missing!"
    echo "Run: $PIP_CMD install -r requirements.txt"
    exit 1
fi

# Start bot in background
echo "[OK] All checks passed!"
echo "[INFO] Starting bot in background..."
echo ""

# Redirect output to log file
date >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "Bot starting at $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

nohup $PYTHON_CMD telegram_bot.py >> "$LOG_FILE" 2>&1 &
BOT_PID=$!

# Save PID
echo $BOT_PID > "$PID_FILE"

# Wait a bit to check if bot started successfully
sleep 3

if ps -p $BOT_PID > /dev/null 2>&1; then
    echo "[OK] Bot started successfully in background!"
    echo ""
    echo "Process ID: $BOT_PID"
    echo "Log file:   $LOG_FILE"
    echo ""
    echo "Commands:"
    echo "  View logs:  tail -f $LOG_FILE"
    echo "  Stop bot:   ./stop_telegram_bot.sh"
    echo "  Check PID:  ps -p $BOT_PID"
    echo ""
    echo "Bot is running! Check logs for startup messages."
    echo ""
else
    echo "[ERROR] Bot failed to start!"
    echo ""
    echo "Recent logs:"
    tail -n 20 "$LOG_FILE"
    echo ""
    echo "Full logs: cat $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
fi
