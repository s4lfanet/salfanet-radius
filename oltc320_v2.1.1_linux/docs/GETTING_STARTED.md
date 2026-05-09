# 🚀 GETTING STARTED GUIDE
## ZTE C320 OLT Management System - Step by Step

Panduan lengkap dari download sampai menjalankan aplikasi untuk **Windows** dan **Linux**.

---

## 📥 WINDOWS - Complete Steps

### **Step 1: Download & Extract** 

1. Download file `oltc320_v2.1.0_windows.zip`
2. Extract ke folder pilihan Anda, contoh:
   ```
   C:\OLT\oltc320
   ```

### **Step 2: Install** 

Buka **PowerShell** atau **Command Prompt**, kemudian:

```powershell
cd C:\OLT\oltc320
install.bat
```

**Proses install akan:**
- ✅ Check Python installation (minimal 3.10)
- ✅ Buat virtual environment (.venv)
- ✅ Install dependencies (jika ada)
- ✅ Copy .env.example ke .env
- ✅ Validasi struktur project

**Output yang diharapkan:**
```
=========================================================================
        ZTE C320 OLT Management System - Auto Installer
=========================================================================

[1/7] Checking Python installation...
[OK] Python 3.12.0 detected

[2/7] Creating virtual environment...
[OK] Virtual environment created

[3/7] Activating virtual environment...
[OK] Virtual environment activated

[4/7] Installing dependencies...
[OK] Dependencies installed

[5/7] Setting up configuration...
[OK] Configuration file created: .env

[6/7] Validating installation...
[OK] All core modules found
[OK] Main script validated

[7/7] Installation complete!
=========================================================================
                    ✅ INSTALLATION SUCCESSFUL!
=========================================================================

Next steps:
  1. Edit file .env untuk konfigurasi OLT
  2. Jalankan: run.bat
```

### **Step 3: Konfigurasi OLT** 

Edit file `.env` dengan text editor (Notepad, VSCode, dll):

```ini
# === OLT Connection Settings ===
OLT_HOST=192.168.1.1          # ← Ganti dengan IP OLT Anda
OLT_PORT=23                    # ← Port Telnet (default: 23)
OLT_USERNAME=admin             # ← Username Telnet OLT
OLT_PASSWORD=admin123          # ← Password Telnet OLT

# === Default Configuration ===
OLT_DEFAULT_VLAN=100           # ← VLAN default untuk ONU baru
OLT_TIMEOUT=30                 # ← Timeout koneksi (detik)

# === Operational Settings ===
CHECK_INTERVAL=30              # ← Interval check ONU baru (detik)
ENABLE_AUTO_SAVE=true          # ← Auto save config setelah register
```

**⚠️ PENTING:**
- Pastikan IP OLT bisa di-ping dari komputer Anda
- Username/Password adalah kredensial **Telnet**, bukan web login
- Test koneksi: `telnet 192.168.1.1` (install telnet client jika belum ada)

### **Step 4: Jalankan Aplikasi** 

```powershell
run.bat
```

**Menu interaktif akan muncul:**
```
============================================================
    AUTO REGISTER ONU - OLT ZTE C320 - MENU
============================================================

1.  Discovery Mode - Cek ONU Belum Terdaftar
2.  Register Mode - Daftar ONU Baru (Single Run)
3.  Continuous Mode - Auto Register (Loop)
4.  View Configuration - Tampilkan Config OLT
5.  System Information - Info System OLT
...
14. ONU Type - Add (Live Update)
15. ONU Type - Delete (Live Update)
...
0.  Exit

Pilih menu (0-25):
```

### **Step 5: Test Discovery** 

1. Pilih menu `1` (Discovery Mode)
2. Pilih PON port atau scan semua port
3. Review ONU yang ditemukan:

```
============================================================
UNCONFIGURED ONUs FOUND: 3
============================================================
1. Port: gpon_olt-1/1/1
   SN: ZTEGABCD1234
   Vendor: ZTE
   State: unknown
   Distance: 0.5 km

2. Port: gpon_olt-1/1/2
   SN: HWTCEFGH5678
   Vendor: Huawei
   State: unknown
   Distance: 1.2 km
...
```

### **Step 6: Register ONUs** 

1. Pilih menu `2` (Register Mode)
2. Confirm registrasi
3. Review hasil:

```
============================================================
REGISTRATION SUMMARY
============================================================
Total ONUs Processed: 3
Successfully Registered: 2
Failed: 1
Skipped: 0
============================================================

✅ Registered:
   - ZTEGABCD1234 → ONU_001 (VLAN 100)
   - HWTCEFGH5678 → ONU_002 (VLAN 100)

❌ Failed:
   - ZTEGIJKL9012 → Error: ONU type not found
```

### **Step 7: Production Mode (Optional)** 

Untuk auto-register otomatis setiap 30 detik:

1. Pilih menu `3` (Continuous Mode)
2. Aplikasi akan loop monitoring ONU baru
3. Press `Ctrl+C` untuk stop

---

## 🐧 LINUX - Complete Steps

### **Step 1: Download & Extract** 

```bash
# Download file
cd ~/Downloads

# Extract (both formats supported)
unzip oltc320_v2.1.0_linux.zip
# or: tar -xzf oltc320_v2.1.0_linux.tar.gz (if available)

# Pindah ke folder
cd oltc320_v2.1.0_linux
```

### **Step 2: Install** 

```bash
chmod +x install.sh
./install.sh
```

**Proses install akan:**
- ✅ Check Python 3.10+ installation
- ✅ Install python3-venv (jika belum ada)
- ✅ Buat virtual environment (.venv)
- ✅ Install dependencies (jika ada)
- ✅ Copy .env.example ke .env
- ✅ Set permissions untuk script
- ✅ Validasi installation

**Output yang diharapkan:**
```
=========================================================================
        ZTE C320 OLT Management System - Auto Installer
=========================================================================

[1/8] Checking Python installation...
[OK] Python 3.12.0 detected

[2/8] Installing system dependencies...
[OK] python3-venv is already installed

[3/8] Creating virtual environment...
[OK] Virtual environment created

[4/8] Activating virtual environment...
[OK] Virtual environment activated

[5/8] Installing Python dependencies...
[OK] Dependencies installed

[6/8] Setting up configuration...
[OK] Configuration file created: .env

[7/8] Setting permissions...
[OK] Permissions set

[8/8] Validating installation...
[OK] All modules validated

=========================================================================
                    ✅ INSTALLATION SUCCESSFUL!
=========================================================================

Next steps:
  1. Edit konfigurasi: nano .env
  2. Jalankan aplikasi: ./run.sh
```

### **Step 3: Konfigurasi OLT** 

```bash
nano .env
# atau
vi .env
```

Edit konfigurasi:

```ini
# === OLT Connection Settings ===
OLT_HOST=192.168.1.1          # ← Ganti dengan IP OLT Anda
OLT_PORT=23                    # ← Port Telnet (default: 23)
OLT_USERNAME=admin             # ← Username Telnet OLT
OLT_PASSWORD=admin123          # ← Password Telnet OLT

# === Default Configuration ===
OLT_DEFAULT_VLAN=100           # ← VLAN default untuk ONU baru
OLT_TIMEOUT=30                 # ← Timeout koneksi (detik)

# === Operational Settings ===
CHECK_INTERVAL=30              # ← Interval check ONU baru (detik)
ENABLE_AUTO_SAVE=true          # ← Auto save config setelah register
```

Save: `Ctrl+O` (nano) atau `:wq` (vi)

### **Step 4: Jalankan Aplikasi** 

```bash
chmod +x run.sh
./run.sh
```

**Menu interaktif akan muncul** (sama seperti Windows)

### **Step 5: Test Discovery** 

Sama seperti Windows Step 5

### **Step 6: Register ONUs** 

Sama seperti Windows Step 6

### **Step 7: Production Mode (Optional)** 

Sama seperti Windows Step 7

---

## 📱 Alternative: Direct Python Commands

Jika tidak ingin pakai `.bat` atau `.sh`:

### **Windows:**

```powershell
# Activate venv
.venv\Scripts\Activate.ps1

# Run menu
python main.py --mode menu

# Discovery only
python main.py --mode discovery

# Register once
python main.py --mode register

# Continuous mode
python main.py --mode register --continuous
```

### **Linux/Mac:**

```bash
# Activate venv
source .venv/bin/activate

# Run menu
python main.py --mode menu

# Discovery only
python main.py --mode discovery

# Register once
python main.py --mode register

# Continuous mode
python main.py --mode register --continuous
```

---

## 🔧 Troubleshooting

### **1. Python Not Found (Windows)**

```powershell
# Install Python dari: https://www.python.org/downloads/
# Pastikan centang "Add Python to PATH"
# Verify:
python --version
```

### **2. Execution Policy Error (Windows)**

```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Coba lagi
.venv\Scripts\Activate.ps1
```

### **3. Permission Denied (Linux)**

```bash
chmod +x install.sh run.sh
./install.sh
```

### **4. Python Version Too Old**

```bash
# Linux/Ubuntu - Install Python 3.12
sudo apt update
sudo apt install python3.12 python3.12-venv

# Verify
python3.12 --version
```

### **5. Telnet Connection Failed**

```
❌ Error: Connection timeout to 192.168.1.1:23
```

**Solusi:**
1. Check IP OLT bisa di-ping: `ping 192.168.1.1`
2. Check Telnet service aktif di OLT
3. Check firewall tidak block port 23
4. Verify username/password di `.env`

### **6. File .env Not Found**

```bash
# Copy dari template
cp .env.example .env

# Edit kredensial
nano .env  # Linux
notepad .env  # Windows
```

### **7. Module Import Error**

```bash
# Reinstall dependencies
source .venv/bin/activate  # Linux
.venv\Scripts\Activate.ps1  # Windows

# Re-run install
./install.sh  # Linux
install.bat   # Windows
```

---

## 📚 Next Steps

Setelah aplikasi berjalan, lihat dokumentasi lain:

- **[QUICKSTART.md](QUICKSTART.md)** - Use cases & examples
- **[MENU_STRUCTURE.md](MENU_STRUCTURE.md)** - Penjelasan semua menu
- **[MOBILE_ACCESS.md](MOBILE_ACCESS.md)** - Setup untuk Termius Android/iOS
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Command reference
- **[VPS_DEPLOYMENT.md](VPS_DEPLOYMENT.md)** - Deploy ke VPS untuk remote access

---

## ⚙️ Configuration Reference

### **Minimal Configuration (.env)**

```ini
OLT_HOST=192.168.1.1
OLT_USERNAME=admin
OLT_PASSWORD=admin123
OLT_DEFAULT_VLAN=100
```

### **Full Configuration (.env)**

```ini
# === OLT Connection ===
OLT_HOST=192.168.1.1
OLT_PORT=23
OLT_USERNAME=admin
OLT_PASSWORD=admin123
OLT_TIMEOUT=30

# === Default Settings ===
OLT_DEFAULT_VLAN=100
OLT_DEFAULT_ONU_TYPE=ZTE-F601
OLT_DEFAULT_PROFILE=HSI_100M

# === Operational ===
CHECK_INTERVAL=30
ENABLE_AUTO_SAVE=true
LOG_LEVEL=INFO
MAX_RETRY=3

# === Naming Convention ===
ONU_NAME_PREFIX=ONU
ONU_NAME_FORMAT=auto  # auto, sn, custom
```

---

## 🎯 Quick Command Reference

| Task | Windows | Linux |
|------|---------|-------|
| **Install** | `install.bat` | `./install.sh` |
| **Run Menu** | `run.bat` | `./run.sh` |
| **Discovery** | `python main.py --mode discovery` | `python main.py --mode discovery` |
| **Register** | `python main.py --mode register` | `python main.py --mode register` |
| **Continuous** | `python main.py --mode register --continuous` | `python main.py --mode register --continuous` |
| **Edit Config** | `notepad .env` | `nano .env` |
| **Check Logs** | `type logs\app.log` | `tail -f logs/app.log` |

---

## 📞 Support

Jika mengalami masalah:
1. Check [TROUBLESHOOTING section](#-troubleshooting) di atas
2. Review logs: `logs/app.log`
3. Check [CHANGELOG.md](CHANGELOG.md) untuk known issues
4. Verify Python version: 3.10 - 3.12 (NOT 3.13+)

---

**Last Updated:** January 2026 | **Version:** 2.1.0
