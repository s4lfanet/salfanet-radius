# SALFANET RADIUS - Documentation Index

**Version**: 2.11.6  
**Last Updated**: March 27, 2026

---

## 🤖 For AI/LLM Assistants

**👉 START HERE:** **[AI_PROJECT_MEMORY.md](AI_PROJECT_MEMORY.md)** ⭐ **NEW!**

Complete project context in one file:
- Tech stack & architecture
- Database schema
- Known issues & solutions
- Configuration locations
- Recent changes
- Development guidelines

**Benefits**: Instant project understanding, no repetitive questions, proven solutions included.

---

## 📖 Quick Start

### 🎯 New to SALFANET RADIUS?
Start here → **[COMPREHENSIVE_FEATURE_GUIDE.md](COMPREHENSIVE_FEATURE_GUIDE.md)**
- Complete overview of all features (100+)
- 15 major sections covering entire system
- Quick reference for all capabilities

### 📋 Recent Updates
See what changed → **[RECENT_UPDATES_2025-12-29.md](RECENT_UPDATES_2025-12-29.md)**
- L2TP VPN fixes (v2.9.4)
- Documentation improvements
- All file changes listed

---

## 📚 Documentation Categories

### 🚀 Installation & Deployment

| Document | Description | Size | Updated |
|----------|-------------|------|---------|
| **[DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)** | Complete VPS deployment guide | 9.8 KB | Dec 23 |
| **[FREERADIUS-SETUP.md](FREERADIUS-SETUP.md)** | FreeRADIUS installation & configuration | 14.8 KB | Dec 23 |
| **[VPS_OPTIMIZATION_GUIDE.md](VPS_OPTIMIZATION_GUIDE.md)** | Performance tuning for low-resource VPS | 8.9 KB | Dec 23 |
| **[VPN_CLIENT_SETUP_GUIDE.md](VPN_CLIENT_SETUP_GUIDE.md)** | VPN setup for remote routers | 5.8 KB | **Dec 29** ⭐ |
| **[PROXMOX_L2TP_SETUP.md](PROXMOX_L2TP_SETUP.md)** | Proxmox LXC L2TP fixes | 4.2 KB | **Dec 29** ⭐ |

**When to use**: First-time installation, server migration, VPN configuration

**Recent changes**: Added L2TP troubleshooting for pppd exit code 2, CHAP secrets, duplicate settings fixes

---

### ⚙️ Core Systems

| Document | Description | Size | Updated |
|----------|-------------|------|---------|
| **[CRON-SYSTEM.md](CRON-SYSTEM.md)** | 10 automated jobs & scheduling | 20.1 KB | Dec 23 |
| **[ACTIVITY_LOG_IMPLEMENTATION.md](ACTIVITY_LOG_IMPLEMENTATION.md)** | Activity tracking & audit logs | 9.9 KB | Dec 23 |

**When to use**: Understanding automation, debugging cron jobs, audit requirements

---

### 💰 Billing & Payment

| Document | Description | Size | Updated |
|----------|-------------|------|---------|
| **[PREPAID_POSTPAID_IMPLEMENTATION.md](PREPAID_POSTPAID_IMPLEMENTATION.md)** | Prepaid vs Postpaid billing types | 11.2 KB | Dec 23 |
| **[MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md)** | Upload bukti transfer & approval | 7.8 KB | Dec 23 |
| **[INVOICE_NUMBER_FORMAT.md](INVOICE_NUMBER_FORMAT.md)** | Invoice numbering system | 4.6 KB | Dec 23 |
| **[AGENT_DEPOSIT_SYSTEM.md](AGENT_DEPOSIT_SYSTEM.md)** | Agent balance & deposit management | 7.4 KB |

**When to use**: Setting up billing, payment gateway integration, agent system

---

### 📢 Notifications & Communication

| Document | Description | Size |
|----------|-------------|------|
| **[BROADCAST_NOTIFICATION_SYSTEM.md](BROADCAST_NOTIFICATION_SYSTEM.md)** | Mass WhatsApp & Email notifications | 7.1 KB |
| **[OUTAGE_NOTIFICATION_SYSTEM.md](OUTAGE_NOTIFICATION_SYSTEM.md)** | Automated downtime alerts | 9.7 KB |

**When to use**: Setting up notification templates, broadcast messages

---

### 🔧 Advanced Features

| Document | Description | Size |
|----------|-------------|------|
| **[GENIEACS-GUIDE.md](GENIEACS-GUIDE.md)** | TR-069 device management (ONT/ONU) | 12 KB |
| **[MULTIPLE_NAS_SAME_IP.md](MULTIPLE_NAS_SAME_IP.md)** | Multi-router VPN support | 9.1 KB |
| **[GPS_LOCATION_FEATURE.md](GPS_LOCATION_FEATURE.md)** | Customer GPS tracking | 2.6 KB |
| **[IMPORT_PPPOE_USERS.md](IMPORT_PPPOE_USERS.md)** | Sync from MikroTik PPPoE secrets | 5.3 KB |

**When to use**: GenieACS setup, VPN scenarios, bulk import, GPS features

---

### 🧪 Testing & Troubleshooting

| Document | Description | Size |
|----------|-------------|------|
| **[TESTING_GUIDE.md](TESTING_GUIDE.md)** | Test procedures & verification | 12.3 KB |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Common issues & solutions | 7.1 KB |

**When to use**: QA testing, debugging issues, error resolution

---

## 🗂️ Documentation Structure

```
docs/
├── README.md (this file)
├── COMPREHENSIVE_FEATURE_GUIDE.md  ⭐ START HERE
│
├── Installation & Deployment/
│   ├── DEPLOYMENT-GUIDE.md
│   ├── FREERADIUS-SETUP.md
│   ├── VPS_OPTIMIZATION_GUIDE.md
│   └── VPN_CLIENT_SETUP_GUIDE.md
│
├── Core Systems/
│   ├── CRON-SYSTEM.md
│   └── ACTIVITY_LOG_IMPLEMENTATION.md
│
├── Billing & Payment/
│   ├── PREPAID_POSTPAID_IMPLEMENTATION.md
│   ├── MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md
│   ├── INVOICE_NUMBER_FORMAT.md
│   └── AGENT_DEPOSIT_SYSTEM.md
│
├── Notifications/
│   ├── BROADCAST_NOTIFICATION_SYSTEM.md
│   └── OUTAGE_NOTIFICATION_SYSTEM.md
│
├── Advanced Features/
│   ├── GENIEACS-GUIDE.md
│   ├── MULTIPLE_NAS_SAME_IP.md
│   ├── GPS_LOCATION_FEATURE.md
│   └── IMPORT_PPPOE_USERS.md
│
└── Testing & Troubleshooting/
    ├── TESTING_GUIDE.md
    └── TROUBLESHOOTING.md
```

---

## 🎯 Common Tasks

### "I want to deploy to VPS for the first time"
1. Read [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)
2. Follow [FREERADIUS-SETUP.md](FREERADIUS-SETUP.md)
3. Run `./vps-install.sh` on server
4. Test with [TESTING_GUIDE.md](TESTING_GUIDE.md)

### "I need to setup prepaid/postpaid billing"
1. Read [PREPAID_POSTPAID_IMPLEMENTATION.md](PREPAID_POSTPAID_IMPLEMENTATION.md)
2. Configure invoice generation in [CRON-SYSTEM.md](CRON-SYSTEM.md#generate-invoices)
3. Setup payment notifications

### "I want to enable manual payment upload"
1. Read [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md)
2. Configure payment gateway (if needed)
3. Test upload & approval workflow

### "I need to send mass notifications"
1. Read [BROADCAST_NOTIFICATION_SYSTEM.md](BROADCAST_NOTIFICATION_SYSTEM.md)
2. Configure WhatsApp/Email templates
3. Use admin panel broadcast feature

### "I want to manage TR-069 devices"
1. Read [GENIEACS-GUIDE.md](GENIEACS-GUIDE.md)
2. Install GenieACS server
3. Configure ACS parameters

### "Something is not working"
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) first
2. Review relevant feature documentation
3. Check activity logs & cron execution history

---

## 📊 Statistics

- **Total Documents**: 18 markdown files
- **Total Size**: ~170 KB
- **Features Documented**: 100+
- **Code Examples**: 200+
- **API Endpoints**: 50+

---

## 🔄 Version History

### v2.7.5 (December 23, 2025)
- ✅ Added COMPREHENSIVE_FEATURE_GUIDE.md
- ✅ Cleaned up session notes (moved to CHAT_HISTORY)
- ✅ Documentation index (this file)

### v2.7.4 (December 2025)
- Hotspot sync improvements
- Isolation templates
- Activity log system

### v2.7.0 (October 2025)
- Manual payment system
- Prepaid/Postpaid implementation
- Broadcast notifications

---

## 📞 Support

**Documentation Issues**: Report in GitHub Issues  
**Technical Support**: support@yourdomain.com  
**Community**: Join our Discord/Telegram

---

**Generated**: December 23, 2025  
**Maintained by**: SALFANET RADIUS Team  
**License**: Proprietary
