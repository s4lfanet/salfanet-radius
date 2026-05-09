# 🚀 Cara Mendapatkan Token & User ID Telegram Bot

## 📍 LANGKAH 1: Dapatkan Bot Token

### Via @BotFather

1. **Buka Telegram** (bisa di HP atau Desktop)

2. **Cari @BotFather**
   - Di search box, ketik: `@BotFather`
   - Atau klik: https://t.me/BotFather

3. **Klik Start** atau send `/start`

4. **Buat Bot Baru**
   - Send command: `/newbot`
   
5. **Beri Nama Bot**
   ```
   BotFather: Alright, a new bot. How are we going to call it?
   You: OLT Manager Bot
   ```

6. **Beri Username Bot**
   ```
   BotFather: Good. Now let's choose a username for your bot.
   You: your_olt_manager_bot
   ```
   
   **Catatan:**
   - Username harus unik (globally unique)
   - Harus diakhiri dengan "bot"
   - Contoh: `olt_manager_bot`, `my_olt_bot`, `network_admin_bot`

7. **Copy Token**
   ```
   BotFather: Done! Congratulations on your new bot.
   
   Use this token to access the HTTP API:
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
   
   Keep your token secure and store it safely...
   ```
   
   **Copy token ini!** (Contoh di atas, token Anda akan berbeda)

8. **Paste ke .env**
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
   ```

---

## 📍 LANGKAH 2: Dapatkan User ID (Chat ID)

### Via @userinfobot

1. **Cari @userinfobot**
   - Di search box, ketik: `@userinfobot`
   - Atau klik: https://t.me/userinfobot

2. **Klik Start** atau send any message

3. **Copy User ID**
   ```
   Id: 123456789
   First Name: John
   Username: @johndoe
   Language: en
   ```
   
   **Copy angka ID** (contoh: `123456789`)

4. **Paste ke .env**
   ```env
   TELEGRAM_ADMIN_USERS=123456789
   ```
   
   **Multiple users** (pisahkan dengan koma):
   ```env
   TELEGRAM_ADMIN_USERS=123456789,987654321,555666777
   ```

---

## 📝 Contoh .env Lengkap

```env
# ============================================
# TELEGRAM BOT CONFIGURATION
# ============================================

# Token dari @BotFather (GANTI dengan token Anda!)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890

# User ID dari @userinfobot (GANTI dengan ID Anda!)
TELEGRAM_ADMIN_USERS=123456789,987654321
```

---

## ✅ Test Token (Optional)

Test apakah token valid via browser:

```
https://api.telegram.org/bot<TOKEN>/getMe
```

Ganti `<TOKEN>` dengan token Anda:
```
https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz/getMe
```

**Response jika valid:**
```json
{
  "ok": true,
  "result": {
    "id": 1234567890,
    "is_bot": true,
    "first_name": "OLT Manager Bot",
    "username": "your_olt_manager_bot"
  }
}
```

**Response jika invalid:**
```json
{
  "ok": false,
  "error_code": 401,
  "description": "Unauthorized"
}
```

---

## 🚀 Jalankan Bot

Setelah dapat token & user ID:

```bash
# Windows
start_telegram_bot.bat

# Linux
./start_telegram_bot.sh

# Manual
python telegram_bot.py
```

---

## ❌ Common Errors

### Error: Invalid token format
```
❌ Error: Invalid TELEGRAM_BOT_TOKEN format!
⚠️ Token masih menggunakan contoh/placeholder!
```

**Solusi:** Token masih contoh dari dokumentasi. Dapatkan token asli dari @BotFather.

---

### Error: Timeout
```
telegram.error.TimedOut: Timed out
```

**Penyebab:**
1. Token tidak valid
2. Internet connection issue
3. Cannot reach api.telegram.org
4. Firewall/Proxy blocking

**Solusi:**
1. Pastikan token dari @BotFather (bukan contoh)
2. Check internet connection
3. Test: `ping api.telegram.org`
4. Disable firewall temporary untuk test

---

### Error: Unauthorized
```
telegram.error.Unauthorized: Forbidden
```

**Solusi:** Token expired atau invalid. Generate token baru:
1. Chat @BotFather
2. Send: `/token`
3. Pilih bot Anda
4. Copy token baru
5. Update .env

---

## 🔒 Keamanan

**PENTING:**
- ✅ Jangan share token bot ke orang lain
- ✅ Jangan commit .env ke git/public repo
- ✅ Token bersifat rahasia seperti password
- ✅ Jika token leak, revoke dan generate baru via @BotFather

**Revoke token:**
```
Chat @BotFather → /revoke → Pilih bot → Confirm
```

---

## 📞 Need Help?

1. **BotFather commands:**
   - `/newbot` - Create new bot
   - `/token` - Generate new token
   - `/revoke` - Revoke token
   - `/deletebot` - Delete bot
   - `/mybots` - Manage your bots

2. **Test connectivity:**
   ```bash
   ping api.telegram.org
   curl https://api.telegram.org/bot<TOKEN>/getMe
   ```

3. **Documentation:**
   - [TELEGRAM_BOT_SETUP.md](TELEGRAM_BOT_SETUP.md)
   - [TELEGRAM_BOT_TROUBLESHOOTING.md](TELEGRAM_BOT_TROUBLESHOOTING.md)

---

**READY TO GO!** 🚀

Setelah dapat token & user ID, bot siap digunakan!
