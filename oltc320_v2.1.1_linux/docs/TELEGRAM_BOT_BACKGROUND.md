# Running Telegram Bot in Background

## 📖 Overview

Bot Telegram dapat dijalankan di background agar tetap aktif walaupun terminal ditutup atau koneksi SSH terputus.

## 🐧 Linux

### Method 1: Simple Background Script (Recommended)

#### Start Bot
```bash
./start_telegram_bot_background.sh
```

Features:
- ✅ Otomatis jalan di background dengan `nohup`
- ✅ Menyimpan PID untuk management mudah
- ✅ Log output ke `logs/telegram_bot.log`
- ✅ Auto-restart jika script dijalankan ulang

#### Stop Bot
```bash
./stop_telegram_bot.sh
```

#### View Logs
```bash
tail -f logs/telegram_bot.log
```

#### Check Status
```bash
# Check if bot is running
ps aux | grep telegram_bot.py

# View PID
cat telegram_bot.pid
```

---

### Method 2: Systemd Service (Production)

Best untuk production server dengan auto-restart dan startup otomatis saat reboot.

#### Installation

1. **Edit service file dengan path yang benar:**
```bash
nano oltc320-telegram-bot.service
```

Ubah baris berikut sesuai lokasi instalasi Anda:
```ini
WorkingDirectory=/root/oltc320_v2.1.1_linux
ExecStart=/root/oltc320_v2.1.1_linux/.venv/bin/python telegram_bot.py
```

2. **Copy ke systemd:**
```bash
sudo cp oltc320-telegram-bot.service /etc/systemd/system/
```

3. **Reload daemon:**
```bash
sudo systemctl daemon-reload
```

4. **Enable auto-start on boot:**
```bash
sudo systemctl enable oltc320-telegram-bot
```

5. **Start service:**
```bash
sudo systemctl start oltc320-telegram-bot
```

#### Management Commands

```bash
# Start bot
sudo systemctl start oltc320-telegram-bot

# Stop bot
sudo systemctl stop oltc320-telegram-bot

# Restart bot
sudo systemctl restart oltc320-telegram-bot

# Check status
sudo systemctl status oltc320-telegram-bot

# View real-time logs
sudo journalctl -u oltc320-telegram-bot -f

# View recent logs
sudo journalctl -u oltc320-telegram-bot -n 100

# Disable auto-start
sudo systemctl disable oltc320-telegram-bot
```

---

### Method 3: Screen (Alternative)

```bash
# Install screen (if not installed)
sudo apt install screen  # Debian/Ubuntu
sudo yum install screen  # CentOS/RHEL

# Start bot in screen session
screen -dmS oltc320bot ./start_telegram_bot.sh

# Reattach to session
screen -r oltc320bot

# Detach from session: Ctrl+A then D

# Kill session
screen -X -S oltc320bot quit
```

---

### Method 4: Tmux (Alternative)

```bash
# Install tmux
sudo apt install tmux  # Debian/Ubuntu

# Start bot in tmux session
tmux new-session -d -s oltc320bot './start_telegram_bot.sh'

# Attach to session
tmux attach -t oltc320bot

# Detach from session: Ctrl+B then D

# Kill session
tmux kill-session -t oltc320bot
```

---

## 🪟 Windows

### PowerShell Background Script

#### Start Bot
```powershell
.\start_telegram_bot_background.ps1
```

Features:
- ✅ Jalan di background (hidden window)
- ✅ Menyimpan PID untuk management
- ✅ Log output ke `logs\telegram_bot.log`

#### Stop Bot
```powershell
.\stop_telegram_bot.ps1
```

#### View Logs
```powershell
Get-Content logs\telegram_bot.log -Wait
```

#### Check Status
```powershell
# Get PID
$pid = Get-Content telegram_bot.pid
Get-Process -Id $pid

# Or find manually
Get-Process | Where-Object { $_.ProcessName -like '*python*' }
```

---

### Windows Task Scheduler (Production)

Untuk auto-start saat Windows boot:

1. **Buka Task Scheduler:**
   - Win+R → `taskschd.msc`

2. **Create Basic Task:**
   - Name: `OLTC320 Telegram Bot`
   - Trigger: `At startup` atau `At log on`

3. **Action: Start a program**
   ```
   Program: powershell.exe
   Arguments: -File "C:\path\to\oltc320\start_telegram_bot_background.ps1"
   Start in: C:\path\to\oltc320
   ```

4. **Settings:**
   - ✅ Run whether user is logged on or not
   - ✅ Run with highest privileges
   - ✅ If the task fails, restart every: 5 minutes

---

## ⚙️ Configuration

Pastikan file `.env` sudah dikonfigurasi sebelum menjalankan bot:

```bash
# Copy template
cp .env.example .env

# Edit dengan token dan user ID Anda
nano .env  # Linux
notepad .env  # Windows
```

Format `.env`:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_USERS=123456789,987654321
```

---

## 🔍 Troubleshooting

### Bot tidak start
```bash
# Check logs
cat logs/telegram_bot.log

# Check if .env exists
ls -la .env

# Check dependencies
.venv/bin/python -c "import telegram"
```

### Bot berhenti tiba-tiba
```bash
# Check logs untuk error
tail -n 50 logs/telegram_bot.log

# Jika systemd, check journal
sudo journalctl -u oltc320-telegram-bot -n 100
```

### Port sudah digunakan
```bash
# Check process yang menggunakan bot
ps aux | grep telegram_bot.py

# Kill process lama
killall python  # Hati-hati!
# Atau lebih aman:
cat telegram_bot.pid | xargs kill
```

### Permission denied (Linux)
```bash
# Make scripts executable
chmod +x *.sh

# Check .env permissions
chmod 600 .env
```

---

## 📊 Monitoring

### Check Bot Health

**Linux:**
```bash
# Check if process running
ps aux | grep telegram_bot.py

# Check memory usage
ps aux | grep telegram_bot.py | awk '{print $4"%"}'

# Check logs for errors
grep -i error logs/telegram_bot.log
```

**Windows:**
```powershell
# Check process
Get-Process -Name python

# Check log for errors
Select-String -Path logs\telegram_bot.log -Pattern "error" -CaseSensitive:$false
```

---

## 🚀 Best Practices

1. **Use systemd (Linux) atau Task Scheduler (Windows)** untuk production
2. **Monitor logs regularly** untuk detect masalah early
3. **Setup alerting** jika bot down (bisa via Telegram sendiri)
4. **Backup .env file** dengan aman
5. **Jangan commit** `.env`, `*.pid`, atau `logs/` ke git
6. **Test restart** untuk ensure bot dapat recover dari error

---

## 📝 Summary

| Method | Platform | Auto-Restart | Auto-Boot | Best For |
|--------|----------|--------------|-----------|----------|
| Background Script | Linux/Windows | ❌ | ❌ | Development, Testing |
| Systemd Service | Linux | ✅ | ✅ | Production (Linux) |
| Task Scheduler | Windows | ✅ | ✅ | Production (Windows) |
| Screen/Tmux | Linux | ❌ | ❌ | SSH Sessions |

---

## 🆘 Support

Jika ada masalah:
1. Check logs: `logs/telegram_bot.log`
2. Verify `.env` configuration
3. Test dengan foreground mode: `./start_telegram_bot.sh`
4. Check internet connection
5. Verify Telegram token validity
