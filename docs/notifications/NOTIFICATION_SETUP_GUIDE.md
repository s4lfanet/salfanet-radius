# 📬 Notification System Setup Guide

**Document Version:** 2.0  
**Last Updated:** April 5, 2026  
**Status:** ✅ Production Ready

---

## 📋 Overview

SALFANET RADIUS includes a comprehensive multi-channel notification system that sends notifications via:

- ✅ **WhatsApp** (Primary channel - 80% usage)
- ✅ **Email** (Secondary channel - SMTP)
- 🔄 **SMS** (Planned - Twilio/Nexmo integration)
- 🔄 **Push Notifications** (Planned - Firebase/OneSignal)

The system is **already implemented** and just needs configuration through the admin panel.

---

## 🎯 What's Already Implemented

### ✅ WhatsApp Service
**File:** `src/server/services/notifications/whatsapp.service.ts`

**Providers Supported:**
| Provider | Type | Notes |
|----------|------|-------|
| **Fonnte** | `fonnte` | Recommended — simplest setup |
| **WAHA** | `waha` | Self-hosted, free |
| **MPWA** | `mpwa` | Multi-device |
| **Wablas** | `wablas` | V2 API (`/api/v2/send-message`), auth `token.secret_key` |
| **GOWA** | `gowa` | Self-hosted gateway |
| **WABlast** | `wablast` | Self-hosted gateway |
| **Kirimi.id** | `kirimi` | ✅ Fully supported — API Key = `user_code:secret`, Sender Number = Device ID |

**Features:**
- Multi-provider failover (automatic retry with next provider)
- Phone number auto-formatting (62xxx)
- Message delivery tracking
- Provider priority system
- Per-provider error detail saat gagal
- Native broadcast API (Kirimi.id: `/v1/broadcast-message` dengan grouping, delay 30s)
- Incoming message webhook (`POST /api/whatsapp/webhook`)

**Integration Points:**
- Invoice reminders
- Payment confirmations
- User registration approval
- Account creation notifications
- Auto-renewal notifications
- Broadcast messages

### ✅ Email Service
**File:** `src/lib/email.ts`

**Features:**
- SMTP integration via nodemailer
- HTML email templates
- Email delivery tracking
- Fallback to text-only
- Custom branding (logo, colors, company info)

**Integration Points:**
- Invoice reminders
- Payment confirmations  
- User registration approval
- Account creation notifications
- Password reset
- Auto-renewal notifications

### ✅ Admin UI
**Pages:**
- `/admin/settings/whatsapp` - WhatsApp provider configuration
- `/admin/settings/email` - SMTP email configuration
- `/admin/whatsapp/send` - Send test WhatsApp message
- `/admin/whatsapp/history` - View sent messages log
- `/admin/whatsapp/templates` - Manage message templates

### ✅ Database Schema
**Tables:**
- `whatsapp_providers` - Store provider credentials
- `whatsapp_messages` - Message delivery log
- `whatsapp_templates` - Reusable message templates
- `emailSettings` - SMTP configuration
- `emailHistory` - Email delivery log

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Login to Admin Panel
```
Navigate to: http://your-domain.com/admin
Login with SUPER_ADMIN account
```

### Step 2: Configure WhatsApp Provider

**Option A: Fonnte (Recommended - Easiest)**

1. Go to: `/admin/settings/whatsapp`
2. Click "Add Provider"
3. Fill in the form:
   - **Name:** Fonnte Primary
   - **Type:** Fonnte
   - **API URL:** `https://api.fonnte.com/send`
   - **API Key:** `your-fonnte-api-key` (get from [fonnte.com](https://fonnte.com))
   - **Priority:** 1 (higher priority = tried first)
   - **Status:** Active ✅

4. Click "Save"
5. Click "Test Connection" to verify

**Option B: WAHA (Self-Hosted WhatsApp)**

1. Setup WAHA server: [https://waha.devlike.pro/](https://waha.devlike.pro/)
2. In admin panel: `/admin/settings/whatsapp`
3. Add provider:
   - **Name:** WAHA Local
   - **Type:** WAHA
   - **API URL:** `http://your-waha-server:3000`
   - **API Key:** `your-waha-api-key`
   - **Session Name:** `default` (or your session name)
   - **Priority:** 1
   - **Status:** Active ✅

**Option C: Kirimi.id (Cloud-Based, Recommended for Broadcast)**

1. Daftar di [kirimi.id](https://kirimi.id) dan sambungkan WA device
2. Catat **User Code**, **Secret Key**, dan **Device ID** dari dashboard
3. Di admin panel: `/admin/whatsapp/providers`
4. Tambah provider:
   - **Name:** Kirimi Primary
   - **Type:** `kirimi`
   - **API URL:** `https://api.kirimi.id`
   - **API Key:** `USER_CODE:SECRET_KEY` (format gabung dengan `:`)
   - **Sender Number (Device ID):** `D-XXXXX` (dari dashboard Kirimi.id)
   - **Priority:** 1
   - **Status:** Active ✅
5. Klik "Save" lalu "Test Connection"

> **Broadcast Kirimi.id**: Menggunakan endpoint native `/v1/broadcast-message` dengan delay 30 detik antar pesan (rekomendasi resmi). Status "menunggu" di dashboard Kirimi.id adalah normal — pesan sedang dalam antrian.

**Option D: MPWA/Wablas/GOWA**
Similar process - choose provider type and enter credentials.

**Wablas — format API Key:** `token.secret_key` (gabungkan token dengan titik)

### Step 3: Configure Email (SMTP)

1. Go to: `/admin/settings/email`
2. Fill in SMTP settings:

**Gmail Example:**
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
SMTP Secure: No (use TLS)
SMTP User: your-email@gmail.com
SMTP Password: your-app-specific-password
From Name: Your ISP Name
From Email: noreply@yourdomain.com
Status: Enabled ✅
```

**Amazon SES Example:**
```
SMTP Host: email-smtp.us-east-1.amazonaws.com
SMTP Port: 587
SMTP Secure: No
SMTP User: your-smtp-username
SMTP Password: your-smtp-password
From Name: Your ISP Name
From Email: verified@yourdomain.com
Status: Enabled ✅
```

**Custom SMTP Server:**
```
SMTP Host: mail.yourdomain.com
SMTP Port: 465 (SSL) or 587 (TLS)
SMTP Secure: Yes (for 465), No (for 587)
SMTP User: your-email@yourdomain.com
SMTP Password: your-password
From Name: Your ISP Name
From Email: noreply@yourdomain.com
Status: Enabled ✅
```

3. Click "Save Settings"
4. Click "Send Test Email" to verify

### Step 4: Test Notifications

**Test WhatsApp:**
1. Go to: `/admin/whatsapp/send`
2. Enter your phone number (08xxx or +628xxx)
3. Type a test message
4. Click "Send"
5. Check delivery in `/admin/whatsapp/history`

**Test Email:**
1. Go to: `/admin/settings/email`
2. Enter test email address
3. Click "Send Test Email"
4. Check inbox (and spam folder)

### Step 5: Verify Integration

Create a test invoice and check if notifications are sent:

1. Go to: `/admin/invoices`
2. Create a new invoice for a customer
3. Check if WhatsApp/Email notifications were sent
4. Verify in notification history

---

## 🔧 Advanced Configuration

### Multi-Provider Failover

You can configure multiple WhatsApp providers for redundancy:

1. **Primary Provider** (Priority: 1)
   - Fonnte - Main account
   
2. **Backup Provider** (Priority: 2)
   - WAHA - Local fallback
   
3. **Tertiary Provider** (Priority: 3)
   - Wablas - Emergency backup

**How it works:**
- System tries Priority 1 first
- If it fails, automatically tries Priority 2
- If that fails, tries Priority 3
- Logs all attempts and uses first successful provider

### Message Templates

**Location:** `/admin/whatsapp/templates`

**Default Templates:**
- Invoice Reminder
- Payment Confirmation
- User Registration Approval
- Account Creation
- Auto-Renewal Reminder
- Service Activation/Deactivation
- Isolation Warning
- Broadcast Announcement

**Template Variables:**
```
{{customerName}} - Customer full name
{{username}} - PPPoE/Hotspot username
{{password}} - Password (for new accounts)
{{amount}} - Invoice amount
{{dueDate}} - Payment due date
{{invoiceNumber}} - Invoice ID
{{paymentLink}} - Payment URL
{{profileName}} - Internet package name
{{expiredDate}} - Service expiration date
{{companyName}} - Your ISP name
{{companyPhone}} - Support phone number
```

**Edit Templates:**
1. Go to template management
2. Click "Edit" on template
3. Modify message text
4. Use variables like `{{customerName}}`
5. Preview before saving
6. Save and activate

### Email Templates

Email templates support full HTML with custom branding.

**Edit Email Templates:**
Files located in: `src/lib/email.ts`

**Customize:**
- Company logo
- Brand colors
- Email header/footer
- Social media links
- Legal disclaimer

### Rate Limiting

**WhatsApp Rate Limits:**
- Default: 5 messages per 10 seconds
- Adjustable per provider
- Automatic queue management

**Email Rate Limits:**
- 500ms delay between emails (configurable)
- No strict limit (depends on SMTP provider)

**Configure in:** `src/lib/utils/rateLimiter.ts`

---

## 🛠️ Troubleshooting

### WhatsApp Not Sending

**Check #1: Provider Status**
```
Go to: /admin/settings/whatsapp
Verify provider is "Active" ✅
Check API Key is correct
Test connection
```

**Check #2: Phone Number Format**
```
Valid formats:
✅ 081234567890
✅ 6281234567890
✅ +6281234567890

Invalid formats:
❌ 1234567890 (no prefix)
❌ 021-xxx-xxxx (landline)
```

**Check #3: Provider Balance/Credits**
```
Login to provider dashboard (Fonnte/Wablas)
Check remaining credits
Top up if needed
```

**Check #4: Check Logs**
```
Go to: /admin/whatsapp/history
Filter by status: "Failed"
Check error messages
```

**Common Errors:**
- `Invalid API Key` - Check credentials
- `Insufficient balance` - Top up provider account
- `Invalid phone number` - Format issue
- `Rate limit exceeded` - Wait and retry

### Email Not Sending

**Check #1: SMTP Credentials**
```
Go to: /admin/settings/email
Verify SMTP settings
Use "Test Email" feature
Check error message
```

**Check #2: Firewall/Ports**
```powershell
# Test SMTP connection
Test-NetConnection -ComputerName smtp.gmail.com -Port 587

# Should return: TcpTestSucceeded : True
```

**Check #3: Gmail App Password**
```
If using Gmail:
1. Enable 2FA on Google account
2. Generate App-Specific Password
3. Use app password (not regular password)
4. Allow less secure apps (if needed)
```

**Check #4: Email Logs**
```
Check: prisma.emailHistory
Filter by status: "failed"
Review error messages
```

**Common Errors:**
- `Authentication failed` - Wrong username/password
- `Connection timeout` - Firewall blocking port
- `TLS error` - Use correct port (587 with TLS or 465 with SSL)
- `Sender not verified` - Verify email in provider (SES/SendGrid)

### Database Issues

**Check Message Logs:**
```sql
-- Check recent WhatsApp messages
SELECT * FROM whatsapp_messages 
ORDER BY createdAt DESC 
LIMIT 20;

-- Check failed messages
SELECT * FROM whatsapp_messages 
WHERE status = 'failed'
ORDER BY createdAt DESC;

-- Check email history
SELECT * FROM emailHistory
WHERE status = 'failed'
ORDER BY createdAt DESC;
```

### Provider-Specific Troubleshooting

**Fonnte:**
- Check: [https://api.fonnte.com/validate](https://api.fonnte.com/validate)
- Dashboard: [https://fonnte.com/dashboard](https://fonnte.com/dashboard)
- Support: [https://wa.me/6282227097005](https://wa.me/6282227097005)

**WAHA:**
- Dashboard: `http://your-waha-server:3000/dashboard`
- QR Code: Check session status
- Restart: Use restart button if disconnected

**Wablas:**
- Dashboard: [https://console.wablas.com](https://console.wablas.com)
- Check device status
- Verify webhook configuration

---

## 📊 Monitoring & Analytics

### Check Delivery Statistics

**WhatsApp Stats:**
```
Location: /admin/whatsapp/history

Metrics:
- Total sent
- Delivery rate
- Failed messages
- Provider distribution
- Hourly/daily volume
```

**Email Stats:**
```
Location: /admin/settings/email (Stats section)

Metrics:
- Total emails sent
- Delivery rate
- Bounce rate
- Failed deliveries
```

### Database Queries

**WhatsApp delivery rate (last 7 days):**
```sql
SELECT 
  DATE(createdAt) as date,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as delivery_rate
FROM whatsapp_messages
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(createdAt)
ORDER BY date DESC;
```

**Most used WhatsApp provider:**
```sql
SELECT 
  providerName,
  COUNT(*) as total_messages,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
  ROUND(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM whatsapp_messages
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY providerName
ORDER BY total_messages DESC;
```

---

## 🔐 Security Best Practices

### API Key Storage
✅ **DO:**
- Store API keys in database (encrypted if possible)
- Use environment variables for sensitive defaults
- Rotate keys periodically
- Use separate keys for dev/staging/production

❌ **DON'T:**
- Commit API keys to Git
- Share keys in public channels
- Use same key across multiple systems
- Store keys in frontend code

### Access Control
- Only SUPER_ADMIN can configure providers
- FINANCE/CUSTOMER_SERVICE can send messages
- View-only access for VIEWER role
- Audit log tracks all configuration changes

### Rate Limiting
- Enforce rate limits to prevent abuse
- Monitor unusual spike in messages
- Set up alerts for failed deliveries
- Implement daily/monthly caps if needed

---

## 💡 Best Practices

### WhatsApp Messages
1. **Keep it concise** - Under 500 characters
2. **Use templates** - Consistent branding
3. **Include CTA** - Payment link, support contact
4. **Test thoroughly** - Before mass broadcast
5. **Respect opt-outs** - Honor unsubscribe requests
6. **Schedule wisely** - Avoid late night (after 9 PM)
7. **Personalize** - Use customer name

### Email Messages
1. **Mobile responsive** - 60% users read on phone
2. **Clear subject** - Avoid spam triggers
3. **Brand consistency** - Logo, colors, fonts
4. **Contact info** - Support email/phone
5. **Unsubscribe link** - Legal requirement
6. **Test rendering** - Different email clients
7. **Track metrics** - Open rate, click rate

### Bulk Notifications
1. **Batch processing** - Don't send all at once
2. **Rate limiting** - Respect provider limits
3. **Progress tracking** - Show admin the progress
4. **Error handling** - Retry failed messages
5. **Schedule off-peak** - Avoid busy hours
6. **Segment audience** - Target specific groups
7. **A/B testing** - Test message variations

---

## 🆘 Support & Resources

### Documentation
- Notification System Docs
- [API Testing Guide](../getting-started/API_TESTING_GUIDE.md)
- Roadmap Progress

### Provider Documentation
- **Fonnte:** [https://api.fonnte.com/docs](https://api.fonnte.com/docs)
- **WAHA:** [https://waha.devlike.pro/docs](https://waha.devlike.pro/docs)
- **Wablas:** [https://wablas.com/documentation](https://wablas.com/documentation)
- **Nodemailer (Email):** [https://nodemailer.com/](https://nodemailer.com/)

### Community Support
- **GitHub Issues:** Report bugs and feature requests
- **Discord:** Join ISP community discussions
- **WhatsApp Group:** Quick support from other admins

### Professional Support
For priority support, integration assistance, or custom development:
- Email: support@yourcompany.com
- WhatsApp: +62xxxxxxxxxxxx
- Response time: 24-48 hours

---

## 📅 Maintenance Checklist

### Daily
- [ ] Check failed messages in history
- [ ] Monitor delivery rates
- [ ] Review error logs

### Weekly
- [ ] Verify provider balances
- [ ] Test message delivery
- [ ] Review template performance
- [ ] Clean old message logs (optional)

### Monthly
- [ ] Rotate API keys (optional)
- [ ] Review and update templates
- [ ] Analyze notification metrics
- [ ] Provider performance comparison
- [ ] Update contact lists

### Quarterly
- [ ] Audit notification settings
- [ ] Review security policies
- [ ] Test disaster recovery
- [ ] Provider contract renewal
- [ ] Feature requests review

---

**🎉 Congratulations!** Your notification system is now configured and ready to use.

For questions or issues, refer to the troubleshooting section or contact support.

---

**Last Updated:** February 17, 2026  
**Document Version:** 1.0  
**Maintainer:** Development Team
