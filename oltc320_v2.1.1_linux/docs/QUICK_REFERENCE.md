# ⚡ Quick Reference - Common Commands

Referensi cepat untuk perintah-perintah yang sering digunakan.

---

## ⚡ 5-Minute Quick Start

### Quick Setup
```bash
# Extract aplikasi
cd oltc320

# Run installer  
.\install.bat     # Windows
# ./install.sh    # Linux

# Edit konfigurasi OLT
# File: .env
OLT_HOST=192.168.1.1
OLT_USERNAME=admin
OLT_PASSWORD=admin
OLT_DEFAULT_VLAN=100

# Start aplikasi
.\run.ps1         # Windows  
# ./run.sh        # Linux
```

---

## 🚀 Start Application

```bash
# Windows
.\run.ps1

# Linux
./run.sh

# Or direct menu access
python scripts/olt_complete_menu.py
```

## 🎯 Common Use Cases

### Discovery Mode (Check Unconfigured ONUs)
```bash
python main.py --mode discovery
```
**Use for:** Manual check, monitoring, troubleshooting

### Register Mode (One-time)  
```bash
python main.py --mode register
```
**Use for:** Batch registration, scheduled tasks

### Continuous Mode (24/7 Monitoring)
```bash
python main.py --mode register --continuous  
```
**Use for:** Production auto-registration every 30 seconds

---

## 📊 Show ONU Status

```bash
# All ONU di PON port
python scripts/onu_config_manager.py status 1/1/1

# Detail specific ONU (Basic)
python scripts/onu_config_manager.py detail 1/1/1:1

# Detail dengan Running Config (untuk ONU working)
# Menampilkan:
# - Informasi lengkap ONU (Name, SN, Type, State, dll)
# - Equipment info (Vendor, Model, Version, Uptime, Memory, CPU)
# - Optical power & redaman
# - Running configuration (VLAN, PPPoE, SSID, ETH ports, TR069)
# Gunakan menu: Main Menu > 2. Show ONU Detail

# Optical power
python scripts/onu_config_manager.py optical 1/1/1:1
```

---

## 🔧 ONU Configuration

### PPPoE
```bash
python scripts/onu_config_manager.py pppoe 1/1/1:1 \
  --username user@isp \
  --password secret123 \
  --vlan 100
```

### Bridge
```bash
python scripts/onu_config_manager.py bridge 1/1/1:1 --vlan 200
```

### TR069
```bash
python scripts/onu_config_manager.py tr069 1/1/1:1 \
  --enable \
  --acs-url http://acs.example.com:7547 \
  --username admin \
  --password secret \
  --vlan 300
```

### Security Management (Remote Access)
```bash
python scripts/onu_config_manager.py security-mgmt 1/1/1:1 \
  --enable \
  --services WEB TELNET \
  --vlan 400
```

---

## 🏗️ OLT Configuration

### TCONT Profile
```bash
# Show all
python scripts/olt_config_manager.py tcont show

# Add profile
python scripts/olt_config_manager.py tcont add 100M --max 102400

# Delete profile
python scripts/olt_config_manager.py tcont delete 100M
```

### VLAN
```bash
# Show all
python scripts/olt_config_manager.py vlan show

# Add VLAN
python scripts/olt_config_manager.py vlan add 100 --name INTERNET

# Delete VLAN
python scripts/olt_config_manager.py vlan delete 100
```

### Uplink
```bash
# Show interfaces
python scripts/olt_config_manager.py uplink show

# Add VLAN to trunk
python scripts/olt_config_manager.py uplink config gei_1/4/1 --vlan 100
```

---

## 🔧 System Management

### SNMP
```bash
# Show communities
python scripts/olt_system_manager.py snmp community show

# Add community
python scripts/olt_system_manager.py snmp community add public --permission ro

# Set contact
python scripts/olt_system_manager.py snmp contact "NOC Team"
```

### NTP
```bash
# Add server
python scripts/olt_system_manager.py ntp server add 0.id.pool.ntp.org

# Set timezone
python scripts/olt_system_manager.py ntp timezone WIB --offset 7
```

### Users
```bash
# Show users
python scripts/olt_system_manager.py user show

# Add user
python scripts/olt_system_manager.py user add operator --password Secret123 --level 5
```

---

## 📝 Logging

```bash
# View latest log (Windows)
Get-Content -Tail 50 logs\olt_$(Get-Date -Format "yyyyMMdd").log

# Follow live log (Linux)
tail -f logs/olt_$(date +%Y%m%d).log

# Search errors
# Windows
Select-String -Path "logs\*.log" -Pattern "ERROR"

# Linux
grep -r "ERROR" logs/
```

---

## 💾 Backup

```bash
# Backup config
python scripts/olt_system_manager.py backup save --filename backup_$(date +%Y%m%d).cfg

# Save to startup
python scripts/olt_config_manager.py save
```

---

## 🔍 Troubleshooting

```bash
# Test connection
ping 136.1.1.100
telnet 136.1.1.100 23

# Check Python version
python --version

# Check venv
# Windows
.venv\Scripts\Activate.ps1

# Linux
source .venv/bin/activate

# Reinstall venv
# Windows
Remove-Item -Recurse .venv
python -m venv .venv

# Linux
rm -rf .venv
python3 -m venv .venv
```

---

## 🎯 Common Workflows

### Register New ONU
1. Start menu: `python scripts/olt_complete_menu.py`
2. Select `[1] Register ONU`
3. Follow wizard

### Check Customer ONU
1. Start menu
2. Select `[2] Show ONU Status`
3. Enter PON port

### Configure PPPoE for Customer
1. Start menu
2. Select `[3] Configure PPPoE`
3. Enter ONU ID, username, password, VLAN

### Manage Bandwidth Profile
1. Start menu
2. Select `[6] Profile Management`
3. Choose TCONT/Traffic/Line/Service profile
4. Add/modify/delete profile

### Manage ONU Types
1. Start menu
2. Select `[6] Profile Management`
3. Select `[14] ONU Type - Add` or `[15] ONU Type - Delete`
4. Follow wizard
5. Choose auto-save or save manually later

**Note:** ONU type changes are live (no reload needed)

---

## 📚 More Information

- Full documentation: [README.md](README.md)
- Installation guide: [INSTALL.md](INSTALL.md)
- Project structure: [CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md)
