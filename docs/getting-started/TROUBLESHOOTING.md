# SALFANET RADIUS - Troubleshooting Guide

## Common Installation Issues

### 1. "bad interpreter: No such file or directory" - Shell Script Error

**Error Message:**
```bash
./vps-install-local.sh: /bin/bash^M: bad interpreter: No such file or directory
```

**Cause:**
File memiliki Windows line endings (CRLF - `\r\n`) sedangkan Linux membutuhkan Unix line endings (LF - `\n`).

**Quick Fix (On Server):**
```bash
# Fix single file
sed -i 's/\r$//' vps-install-local.sh
chmod +x vps-install-local.sh

# Fix all shell scripts
find . -name "*.sh" -exec sed -i 's/\r$//' {} \;
find . -name "*.sh" -exec chmod +x {} \;
```

**Prevention (On Development Machine):**

1. **Add `.gitattributes` file** (already included in repo):
   ```
   *.sh text eol=lf
   ```

2. **Configure Git globally:**
   ```bash
   # On Windows
   git config --global core.autocrlf input
   
   # On Linux/Mac
   git config --global core.autocrlf false
   ```

3. **Convert existing files (Windows PowerShell):**
   ```powershell
   Get-ChildItem -Filter "*.sh" -Recurse | ForEach-Object {
     $content = Get-Content $_.FullName -Raw
     $content = $content -replace "`r`n", "`n"
     [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
   }
   ```

---

## FreeRADIUS Issues

### 2. RADIUS Authentication Failed

**Test Authentication:**
```bash
# Test PPPoE user
echo "User-Name=testuser,User-Password=testpass" | radclient localhost:1812 auth testing123

# Check RADIUS debug mode
sudo systemctl stop freeradius
sudo freeradius -X
```

**Common Causes:**
- Secret mismatch between RADIUS and NAS
- User not synced to RADIUS
- Database connection issue

**Solutions:**
```bash
# Check RADIUS client config
sudo cat /etc/freeradius/3.0/clients.conf

# Check SQL connection
sudo mysql -u radius_user -p radius_db

# Restart RADIUS
sudo systemctl restart freeradius
```

---

## Database Issues

### 3. Database Connection Failed

**Check Connection:**
```bash
# Test MySQL connection
mysql -u salfanet_user -p salfanet_radius

# Check if MySQL is running
sudo systemctl status mysql
```

**Fix Permissions:**
```bash
# Grant all privileges
sudo mysql -e "GRANT ALL PRIVILEGES ON salfanet_radius.* TO 'salfanet_user'@'localhost'; FLUSH PRIVILEGES;"
```

---

## PM2 Issues

### 4. Application Won't Start

**Check PM2 Logs:**
```bash
pm2 logs salfanet-backend --lines 50
pm2 status
```

**Common Issues:**

1. **Port Already in Use:**
   ```bash
   # Check what's using port 3005
   sudo lsof -i :3005
   
   # Kill process
   sudo kill -9 <PID>
   ```

2. **Missing Dependencies:**
   ```bash
   cd /var/www/salfanet-radius
   npm install
   npm run build
   ```

3. **Environment Variables:**
   ```bash
   # Check .env file
   cat /var/www/salfanet-radius/.env
   
   # Verify DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET
   ```

---

## Network Issues

### 5. MikroTik Connection Failed

**Test RouterOS API:**
```bash
# From server
telnet <mikrotik-ip> 8728

# Check firewall
sudo iptables -L -n -v
```

**MikroTik Side:**
```routeros
# Enable API
/ip service set api port=8728 disabled=no

# Add firewall rule
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept
```

---

## SSL/HTTPS Issues

### 6. Certificate Errors

**Generate New Self-Signed Certificate:**
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/salfanet.key \
  -out /etc/ssl/certs/salfanet.crt
```

**Update Nginx:**
```bash
sudo nano /etc/nginx/sites-available/salfanet-radius
sudo nginx -t
sudo systemctl reload nginx
```

---

## Build Issues

### 7. Next.js Build Failures

**Clear Cache and Rebuild:**
```bash
cd /var/www/salfanet-radius
sudo rm -rf .next
sudo rm -rf node_modules
sudo npm install
sudo npm run build
```

**Check Node.js Version:**
```bash
node --version  # Should be 18.x or higher
npm --version
```

---

## Permission Issues

### 8. File Permission Errors

**Fix Ownership:**
```bash
# Set correct owner
sudo chown -R www-data:www-data /var/www/salfanet-radius

# Set correct permissions
sudo find /var/www/salfanet-radius -type d -exec chmod 755 {} \;
sudo find /var/www/salfanet-radius -type f -exec chmod 644 {} \;
sudo chmod +x /var/www/salfanet-radius/*.sh
```

---

## Monitoring & Debugging

### Useful Commands

**System Resources:**
```bash
# Memory usage
free -h

# Disk usage
df -h

# CPU usage
top

# PM2 monitoring
pm2 monit
```

**Logs:**
```bash
# Application logs
pm2 logs salfanet-backend

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log

# FreeRADIUS log
sudo tail -f /var/log/freeradius/radius.log

# MySQL log
sudo tail -f /var/log/mysql/error.log
```

**Service Status:**
```bash
# Check all services
sudo systemctl status nginx
sudo systemctl status mysql
sudo systemctl status freeradius
pm2 status
```

---

## Getting Help

If issues persist:

1. **Check Logs First:**
   - Application: `pm2 logs salfanet-backend`
   - System: `/var/log/syslog`
   - Nginx: `/var/log/nginx/error.log`

2. **Verify Configuration:**
   - Database: Check `.env` file
   - RADIUS: Check `/etc/freeradius/3.0/`
   - Nginx: Check `/etc/nginx/sites-available/`

3. **Test Components Individually:**
   - Database connection
   - RADIUS authentication
   - API endpoints
   - Frontend access

4. **Documentation:**
   - `docs/DEPLOYMENT-GUIDE.md`
   - `docs/FREERADIUS-SETUP.md`
   - `CHANGELOG.md` (recent changes)
   - `CHAT_MEMORY.md` (session notes)

---

## Timezone Issues

### 12. Session Start Time Shows Different Time from Voucher First Login

**Symptoms:**
- Start Time di Sesi Hotspot menampilkan waktu berbeda 7 jam dari First Login di Voucher
- Contoh: First Login 08:28, tapi Start Time 15:28

**Cause:**
- Sessions API mengirim datetime dengan 'Z' suffix (UTC marker)
- Browser menginterpretasi sebagai UTC dan mengkonversi ke timezone lokal (+7 WIB)
- Voucher API mengirim tanpa 'Z' suffix sehingga tidak dikonversi

**Solution (Fixed in v2.6.4):**
```typescript
// Di sessions/route.ts - hapus 'Z' suffix
const startTimeFormatted = session.acctstarttime 
  ? session.acctstarttime.toISOString().replace('Z', '') 
  : null;
```

**Verification:**
- Start Time dan First Login sekarang menampilkan waktu yang sama (WIB)

---

## Quick Health Check

Run this complete health check:

```bash
#!/bin/bash
echo "=== SALFANET RADIUS Health Check ==="
echo ""
echo "1. Services Status:"
sudo systemctl is-active nginx mysql freeradius
pm2 list | grep salfanet-radius
echo ""
echo "2. Ports:"
sudo netstat -tlnp | grep -E '(80|443|3005|1812|1813|3799)'
echo ""
echo "3. Disk Space:"
df -h /var/www/salfanet-radius
echo ""
echo "4. Memory:"
free -h
echo ""
echo "5. Database:"
mysql -u salfanet_user -p -e "SELECT COUNT(*) FROM radcheck;" salfanet_radius
echo ""
echo "6. Application URL:"
curl -I http://localhost:3005
```

---

**Last Updated:** March 27, 2026
**Version:** 2.11.6
