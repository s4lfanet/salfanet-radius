# ZTE C320 OLT Management System - CLI Edition

Interactive command-line interface untuk management ZTE C320 OLT dengan dukungan REST API sederhana.

## 🚀 Features

### Core Functionality
- **ONU Discovery & Registration** - Otomatis detect dan register ONU
- **Profile Management** - TCONT, Traffic, Line, Service profiles
- **VLAN Configuration** - VLAN management dan binding
- **System Management** - SNMP, NTP, User management
- **Multiple OLT Support** - Switch antar OLT profiles

### CLI Features
- Interactive menu-driven interface
- Full OLT configuration management
- ONU auto-discovery dan registration wizard
- Real-time status monitoring
- Profile-based configuration

## 📋 Requirements

- **Python**: 3.10, 3.11, 3.12, atau 3.13+
- **OS**: Windows, Linux, atau macOS
- **Network**: Akses Telnet ke ZTE C320 OLT

## 🛠️ Installation

### Windows

1. **Install Python** (jika belum ada)
   - Download dari https://python.org
   - Minimal Python 3.10

2. **Install Dependencies**
   ```cmd
   install.bat
   ```

3. **Configure OLT Connection**
   - Edit `config/olt_profiles.json`
   - Atau gunakan menu Profile Management di CLI

### Linux / macOS

```bash
./install.sh
```

## 🎮 Usage

### Pure CLI Mode (Recommended)

Langsung akses ke interactive CLI:

```cmd
start_cli_pure.bat
```

Atau manual:
```bash
# Activate virtual environment
.\.venv\Scripts\activate  # Windows
source .venv/bin/activate # Linux/Mac

# Run CLI
python scripts/olt_complete_menu.py
```

### API Mode (Optional)

Untuk automation atau remote access:

```cmd
start_api_only.bat
```

API akan tersedia di: http://127.0.0.1:8000

- **API Docs**: http://127.0.0.1:8000/docs
- **Health Check**: http://127.0.0.1:8000/api/health

## 📖 Documentation

- `docs/GETTING_STARTED.md` - Panduan awal
- `docs/QUICK_REFERENCE.md` - Command reference
- `docs/CHANGELOG.md` - Version history

## 🔧 Configuration

### OLT Profiles

Edit file `config/olt_profiles.json`:

```json
{
  "profiles": [
    {
      "name": "OLT-Main",
      "host": "192.168.1.100",
      "port": 23,
      "username": "admin",
      "password": "admin",
      "description": "Main OLT",
      "is_active": true
    }
  ]
}
```

Atau gunakan menu **0. Switch OLT / Manage OLT Profiles** di CLI.

## 📁 Project Structure

```
oltc320/
├── scripts/          # CLI scripts
│   ├── olt_complete_menu.py       # Main CLI
│   ├── onu_register_wizard.py     # ONU registration
│   └── ...
├── core/             # Core functionality
│   ├── telnet_client.py           # Telnet client
│   ├── zte_command.py             # ZTE commands
│   └── ...
├── config/           # Configuration
│   ├── olt_profiles.json          # OLT profiles
│   └── olt_config.py              # Config loader
├── api/              # REST API (optional)
│   └── main.py                    # API server
└── docs/             # Documentation
```

## 🐛 Troubleshooting

### Connection Issues

1. Verify OLT IP dan credentials di `config/olt_profiles.json`
2. Test koneksi dengan Telnet: `telnet <OLT_IP> 23`
3. Check firewall settings

### Python Version Issues

Untuk Python 3.13+, telnetlib sudah built-in di `core/vendor/telnetlib.py`.

## 📝 License

MIT License - See LICENSE file for details

## 👥 Support

Untuk issues atau questions, gunakan GitHub Issues.

## 🔄 Version

Current Version: **2.1.1 - CLI Edition**

Mode: Pure CLI dengan optional REST API untuk automation
