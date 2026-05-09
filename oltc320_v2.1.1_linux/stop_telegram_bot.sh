#!/bin/bash
# ============================================
# Stop Telegram Bot - Linux
# ============================================

PID_FILE="telegram_bot.pid"

echo ""
echo "================================================"
echo "  Stopping Telegram Bot..."
echo "================================================"
echo ""

if [ ! -f "$PID_FILE" ]; then
    echo "[WARNING] PID file tidak ditemukan!"
    echo ""
    echo "Bot mungkin tidak berjalan atau tidak dijalankan dengan script background."
    echo ""
    echo "Untuk mencari proses manual:"
    echo "  ps aux | grep telegram_bot.py"
    echo ""
    exit 1
fi

BOT_PID=$(cat "$PID_FILE")

if ! ps -p "$BOT_PID" > /dev/null 2>&1; then
    echo "[WARNING] Process dengan PID $BOT_PID tidak ditemukan!"
    echo "[INFO] Removing stale PID file..."
    rm -f "$PID_FILE"
    exit 1
fi

echo "[INFO] Stopping bot (PID: $BOT_PID)..."
kill $BOT_PID

# Wait for process to stop
sleep 2

if ps -p "$BOT_PID" > /dev/null 2>&1; then
    echo "[WARNING] Bot masih berjalan, forcing stop..."
    kill -9 $BOT_PID
    sleep 1
fi

if ! ps -p "$BOT_PID" > /dev/null 2>&1; then
    echo "[OK] Bot stopped successfully!"
    rm -f "$PID_FILE"
else
    echo "[ERROR] Failed to stop bot!"
    echo "Try manual: kill -9 $BOT_PID"
    exit 1
fi

echo ""
