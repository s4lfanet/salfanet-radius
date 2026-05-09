# Quick Reference - Telegram Bot Background Mode

## 🚀 One-Command Start (Fully Automated)

### Linux:
```bash
./start_telegram_bot_background.sh
```

### Windows:
```powershell
.\start_telegram_bot_background.ps1
```

## ✅ What Happens Automatically?

Script akan **OTOMATIS** melakukan:

### 1. ✅ Check & Install Virtual Environment
- Detect jika `.venv` tidak ada
- Jalankan `install.sh` / `install.bat` otomatis
- Aktivasi virtual environment

### 2. ✅ Check & Install Dependencies
- Detect `python-telegram-bot` → Auto install jika missing
- Detect `python-dotenv` → Auto install jika missing
- Install semua `requirements.txt` jika diperlukan

### 3. ✅ Check Configuration
- Verify `.env` file exists
- Check jika bot sudah running (prevent duplicate)
- Verify `telegram_bot.py` file exists

### 4. ✅ Auto Python/Pip Detection
- Coba `python3` → fallback ke `python`
- Coba `pip3` → fallback ke `pip` → fallback ke `python -m pip`

### 5. ✅ Process Management
- Create PID file untuk tracking
- Auto-create `logs/` directory
- Timestamp semua log entries
- Check jika process berhasil start (3 detik wait)

### 6. ✅ Error Handling
- Show recent logs jika bot fail to start
- Clear stale PID files
- Helpful error messages dengan solusi

## 🛑 Stop Bot

### Linux:
```bash
./stop_telegram_bot.sh
```

### Windows:
```powershell
.\stop_telegram_bot.ps1
```

**Auto handle:**
- ✅ Graceful shutdown
- ✅ Force kill jika tidak response
- ✅ Clean up PID file
- ✅ Verify process stopped

## 📊 Monitor Bot

### View Real-time Logs

**Linux:**
```bash
tail -f logs/telegram_bot.log
```

**Windows:**
```powershell
Get-Content logs\telegram_bot.log -Wait
```

### Check if Running

**Linux:**
```bash
# Check PID
cat telegram_bot.pid

# Verify process
ps -p $(cat telegram_bot.pid)

# Or search manually
ps aux | grep telegram_bot.py
```

**Windows:**
```powershell
# Check PID
Get-Content telegram_bot.pid

# Verify process
Get-Process -Id (Get-Content telegram_bot.pid)

# Or search manually
Get-Process | Where-Object { $_.ProcessName -like '*python*' }
```

## 🔄 Restart Bot

**Linux:**
```bash
./stop_telegram_bot.sh && ./start_telegram_bot_background.sh
```

**Windows:**
```powershell
.\stop_telegram_bot.ps1; .\start_telegram_bot_background.ps1
```

## ⚙️ First Time Setup (Only Once)

1. **Copy and edit .env file:**
```bash
cp .env.example .env
nano .env  # Linux
notepad .env  # Windows
```

2. **Add your tokens:**
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_USERS=123456789,987654321
```

3. **Start bot (everything else is automatic!):**
```bash
./start_telegram_bot_background.sh  # Linux
.\start_telegram_bot_background.ps1  # Windows
```

## 📝 What You DON'T Need to Do Manually

❌ Install Python → Script checks & auto-installs (Linux only)
❌ Create virtual environment → Auto-run `install.sh`
❌ Install dependencies → Auto-install from `requirements.txt`
❌ Check if bot already running → Auto-detect & warn
❌ Create logs directory → Auto-created
❌ Handle PID file → Auto-managed
❌ Check process status → Auto-verified after start

## ✨ What You ONLY Need to Do

✅ Create `.env` file (one time setup)
✅ Run `./start_telegram_bot_background.sh`

**That's it!** Everything else is automatic! 🎉

## 🐛 Troubleshooting

### Bot won't start?

```bash
# Check recent logs
tail -n 50 logs/telegram_bot.log

# Try foreground mode for debugging
./start_telegram_bot.sh  # Won't background, shows output
```

### Dependencies issue?

```bash
# Manual install (script should do this automatically)
pip install -r requirements.txt
```

### Permission denied (Linux)?

```bash
chmod +x *.sh
```

### Bot token invalid?

```bash
# Check .env file
cat .env

# Verify token format (should be: 1234567890:ABC...)
```

## 🎯 Summary

| Action | Manual Steps Required |
|--------|----------------------|
| **First Setup** | Copy `.env.example` → `.env`, edit tokens |
| **Start Bot** | Just run: `./start_telegram_bot_background.sh` |
| **Stop Bot** | Just run: `./stop_telegram_bot.sh` |
| **View Logs** | `tail -f logs/telegram_bot.log` |
| **Check Status** | `ps -p $(cat telegram_bot.pid)` |

Everything else is **100% AUTOMATIC!** ✨

## 📚 More Info

- Full background guide: `docs/TELEGRAM_BOT_BACKGROUND.md`
- Bot token setup: `GET_TELEGRAM_TOKEN.md`
- General documentation: `README.md`
