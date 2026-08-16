# GenieACS TR-069 Integration

Complete guide for GenieACS CPE management integration in SALFANET RADIUS.

## 📡 Overview

GenieACS integration allows remote management of customer ONT devices via TR-069 protocol (CWMP). The GenieACS menu in Salfanet Radius provides 11 sub-menus:

| # | Menu | Path | Description |
|---|------|------|-------------|
| 1 | **Devices** | `/admin/genieacs/devices` | View and manage all registered CPE devices |
| 2 | **Tasks** | `/admin/genieacs/tasks` | Monitor TR-069 task queue (setParameterValues, reboot, etc.) |
| 3 | **Virtual Parameters** | `/admin/genieacs/virtual-parameters` | Manage GenieACS virtual parameters (CRUD via NBI API) |
| 4 | **Parameter Config** | `/admin/genieacs/parameter-config` | Configure which parameters appear in device list and detail views |
| 5 | **Presets** | `/admin/genieacs/presets` | Manage GenieACS presets (auto-applied configurations) |
| 6 | **VP Scripts** | `/admin/genieacs/vp-scripts` | Manage VP scripts with sync status, backup & restore |
| 7 | **Provisions** | `/admin/genieacs/provisions` | Manage GenieACS provision scripts |
| 8 | **Faults** | `/admin/genieacs/faults` | View and delete provisioning faults per device (bulk delete supported) |
| 9 | **Config** | `/admin/genieacs/config` | View and edit GenieACS runtime config (NBI settings) |
| 10 | **Auto-Provision** | `/admin/genieacs/auto-provision` | Configure auto-provisioning rules (channel, preconditions, set parameters) |
| 11 | **Guide** | `/admin/genieacs/guide` | In-app documentation and usage guide |

> **Note**: The Files menu (`/admin/genieacs/files`) was removed from Salfanet Radius. Use the GenieACS UI directly for firmware/file uploads.

## 🔧 Setup

### 1. GenieACS Server Installation

Install GenieACS on separate server or same VPS:

```bash
# Install MongoDB
sudo apt install -y mongodb

# Install GenieACS
sudo npm install -g genieacs

# Create systemd services
sudo nano /etc/systemd/system/genieacs-cwmp.service
```

**genieacs-cwmp.service:**
```ini
[Unit]
Description=GenieACS CWMP
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/genieacs-cwmp --config /opt/genieacs/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**genieacs-nbi.service:**
```ini
[Unit]
Description=GenieACS NBI
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/genieacs-nbi --config /opt/genieacs/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**genieacs-fs.service:**
```ini
[Unit]
Description=GenieACS FS
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/genieacs-fs --config /opt/genieacs/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**genieacs-ui.service:**
```ini
[Unit]
Description=GenieACS UI
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/genieacs-ui --config /opt/genieacs/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. GenieACS Configuration

Create `/opt/genieacs/config.json`:

```json
{
  "MONGODB_CONNECTION_URL": "mongodb://127.0.0.1:27017/genieacs",
  "CWMP_INTERFACE": "0.0.0.0",
  "CWMP_PORT": 7547,
  "CWMP_SSL": false,
  "NBI_INTERFACE": "0.0.0.0",
  "NBI_PORT": 7557,
  "FS_INTERFACE": "0.0.0.0",
  "FS_PORT": 7567,
  "UI_INTERFACE": "0.0.0.0",
  "UI_PORT": 3000,
  "LOG_LEVEL": "info"
}
```

### 3. Start Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
sudo systemctl start genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

# Check status
sudo systemctl status genieacs-*
```

### 4. Configure in SALFANET RADIUS

Go to **Admin → Settings → GenieACS** and configure:

- **GenieACS URL**: `http://YOUR_GENIEACS_IP:7557` (NBI port)
- **Username**: Leave empty (or set if auth enabled)
- **Password**: Leave empty (or set if auth enabled)

Click **Test Connection** to verify.

## 🌐 ONT Configuration

### Huawei HG8145V5 Setup

Configure TR-069 client on ONT:

1. Login to ONT web interface (usually `192.168.100.1`)
2. Go to **Management → TR-069 Configuration**
3. Set:
   - **ACS URL**: `http://YOUR_GENIEACS_IP:7547/`
   - **ACS Username**: (leave empty or as required)
   - **ACS Password**: (leave empty or as required)
   - **Periodic Inform Enable**: `Yes`
   - **Periodic Inform Interval**: `300` (5 minutes, can be lower)
   - **Connection Request Username**: `admin`
   - **Connection Request Password**: `admin`

4. Click **Apply** and wait for device to appear in GenieACS

### Connection Request URL

For GenieACS to send commands immediately (not wait periodic inform), device needs proper Connection Request URL:

- **If ONT has public IP**: `http://ONT_PUBLIC_IP:7547`
- **If ONT behind NAT**: Setup port forwarding or use STUN server

⚠️ **Important**: If connection request doesn't work, changes will still apply on next periodic inform (every 5 minutes).

## 📋 Features

### Device Management

Navigate to **Admin → GenieACS → Devices**

Features:
- View all registered devices
- Real-time status (Online/Offline)
- Device details modal with:
  - Serial number, model, manufacturer
  - PPPoE username and IP
  - TR-069 IP address
  - Uptime, RX power, PON mode
  - WiFi configurations (all WLANs)
  - Connected WiFi clients

Actions:
- **Force Sync** - Trigger connection request immediately
- **Refresh Parameters** - Get latest device data
- **Reboot** - Restart device remotely
- **Edit WiFi** - Configure SSID and password

### WiFi Configuration

Click device → **Edit WiFi** button

Supported parameters:
- **SSID** - Network name (1-32 characters)
- **Security Mode**:
  - None (Open) - No password
  - WPA-PSK - WPA with TKIP
  - WPA2-PSK - WPA2 with AES (recommended)
  - WPA/WPA2-PSK - Mixed mode
- **Password** - 8-63 characters (required for encrypted modes)
- **Enable/Disable** - Turn WiFi on/off

**How it works:**
1. User clicks "Update WiFi"
2. API creates `setParameterValues` task
3. GenieACS sends connection request to device
4. Device connects and receives task
5. Parameters applied instantly
6. API checks task status after 2 seconds
7. Shows success/pending message

**Parameter mapping for Huawei HG8145V5:**
```
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.SSID
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.BeaconType
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.KeyPassphrase
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.IEEE11iAuthenticationMode
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.IEEE11iEncryptionModes
InternetGatewayDevice.LANDevice.1.WLANConfiguration.{index}.Enable
```

### Task Monitoring

Navigate to **Admin → GenieACS → Tasks**

Features:
- Real-time task list with status
- Auto-refresh every 10 seconds (toggle on/off)
- Filter by status: All / Pending / Fault / Done
- Task details:
  - Task ID
  - Device ID
  - Task name (setParameterValues, getParameterValues, etc.)
  - Timestamp
  - Retry count
  - Status badge
  - Error message (if fault)

Actions:
- **Retry** - Re-execute failed tasks
- **Delete** - Remove task from queue
- **Auto-refresh** - Toggle automatic updates

**Task Status:**
- **Pending** (yellow) - Waiting for device to connect
- **Done** (green) - Successfully executed
- **Fault** (red) - Error occurred, check details

### Device Parameters

Navigate to **Admin → GenieACS → Devices** → click device → **Parameters**

Browse all TR-069 parameters on a device in a tree view. This is a sub-page of the Devices section.

Features:
- Hierarchical parameter tree with expand/collapse
- Search and filter parameters by path or value
- View parameter details: path, value, type, writable flag, timestamp
- Copy parameter path to clipboard
- Select parameters using checkboxes
- Generate VP script from selected parameters (saves to VP Scripts page and syncs to GenieACS)
- Generate Provision script from selected parameters
- Show/hide read-only parameters

### Virtual Parameters

Navigate to **Admin → GenieACS → Virtual Parameters**

Virtual parameters are GenieACS scripts that compute or expose device data (e.g. PPPoE IP, RX Power, WiFi password). They are stored directly in GenieACS via the NBI API (`/virtual_parameters`).

Features:
- List all virtual parameters from GenieACS (`_id` and `script`)
- Create new virtual parameter (name + JavaScript script)
- Edit existing virtual parameter
- Delete virtual parameter from GenieACS

**Data format:**
```json
{
  "_id": "pppoeIP",
  "script": "// JavaScript code that returns {writable, value}"
}
```

**Example VP script (RX Power):**
```javascript
let huawei = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: Date.now()});
let m = "N/A";
for (let p of huawei) {
  if (p.value[0]) { m = p.value[0]; break; }
}
return {writable: false, value: [m, "xsd:string"]};
```

### Parameter Config

Navigate to **Admin → GenieACS → Parameter Config**

Configure which device parameters appear in the **Device List** and **Device Detail** views. This controls the columns and sections displayed in the Devices page.

Features:
- Two tabs: **DEVICE_LIST** (columns in device table) and **DEVICE_DETAIL** (sections in device detail modal)
- Add/edit/remove parameter display configurations
- Configure: section name, parameter name, label, parameter paths, display order, column width, format, color coding, icon
- Drag-and-drop reordering
- Enable/disable individual parameters
- Virtual parameters from GenieACS are available in the parameter dropdown
- Reset to defaults

**Config types:**
- `DEVICE_LIST` - Controls which columns appear in the device list table
- `DEVICE_DETAIL` - Controls which sections appear in the device detail view

### Presets

Navigate to **Admin → GenieACS → Presets**

Presets are auto-applied configuration rules in GenieACS. They define parameter values and provisions that are automatically applied to devices matching certain criteria.

Features:
- List all presets from GenieACS
- Create new preset (JSON editor with full preset structure)
- Edit existing preset
- Delete preset
- Backup presets to JSON file
- Restore presets from JSON file

**Preset structure:**
```json
{
  "_id": "preset-name",
  "weight": 0,
  "channel": "default",
  "precondition": "",
  "configurations": [],
  "events": {}
}
```

**Fields:**
- **_id** - Unique preset name
- **weight** - Priority (lower = higher priority)
- **channel** - Communication channel (`default`, `0`, etc.)
- **precondition** - JavaScript expression that must evaluate to true
- **configurations** - Array of parameter/provision configurations
- **events** - Map of event triggers (e.g. `bootstrap: true`)

### VP Scripts

Navigate to **Admin → GenieACS → VP Scripts**

VP Scripts is an enhanced management interface for virtual parameters with sync tracking, backup/restore, and GenieACS integration. Unlike the Virtual Parameters page which directly proxies to GenieACS, VP Scripts stores scripts locally in Prisma and syncs them to GenieACS.

Features:
- List all VP scripts with sync status badges (Synced / Pending / Error)
- Create new VP script (name, script, description)
- Edit existing VP script
- Delete VP script (also removes from GenieACS)
- Sync individual VP to GenieACS
- Sync all VPs at once
- Backup VP scripts to JSON file
- Restore VP scripts from JSON file
- Generate VP automatically from device parameters (via Device Parameters page)

**Sync status:**
- **Synced** (green) - Script successfully synced to GenieACS
- **Pending** (yellow) - Script not yet synced
- **Error** (red) - Sync attempt failed (check `syncError` field)

**Auto-generate VP from device:**
1. Open **Devices** → click device → **Parameters**
2. Select desired parameters using checkboxes
3. Click **Generate VP** button
4. Script is automatically saved here and synced to GenieACS

### Provisions

Navigate to **Admin → GenieACS → Provisions**

Provisions are JavaScript scripts executed by GenieACS during the provisioning process. They can set parameter values, declare dependencies, and run custom logic on devices.

Features:
- List all provisions from GenieACS
- Create new provision script (name + JavaScript)
- Edit existing provision script
- Delete provision
- Backup provisions to JSON file
- Restore provisions from JSON file

**Provision structure:**
```json
{
  "_id": "provision-name",
  "script": "// JavaScript provision code",
  "description": "Optional description"
}
```

**Example provision script:**
```javascript
// Set WiFi SSID for 2.4GHz
declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", {value: Date.now()}, {value: "MyNetwork"});
```

### Faults

Navigate to **Admin → GenieACS → Faults**

View provisioning faults that occurred during device communication. Faults are errors recorded by GenieACS when tasks fail or devices report issues.

Features:
- List all faults from GenieACS
- Filter faults by device ID
- View fault details: device, channel, error code, message, timestamp, retries
- Delete individual fault
- Delete all faults

**Fault fields:**
- **device** - Device ID that triggered the fault
- **channel** - Communication channel
- **code** - TR-069 error code (e.g. `cwmp.9002`)
- **message** - Error description
- **timestamp** - When the fault occurred
- **retries** - Number of retry attempts

### Config

Navigate to **Admin → GenieACS → Config**

View and edit GenieACS runtime configuration via the NBI API. These are low-level GenieACS settings stored in the database.

Features:
- List all config entries from GenieACS
- Edit config value (string, number, or boolean)
- Add new config entry
- Delete config entry

**Common config keys:**
- `cwmp.queue_threshold` - Maximum CWMP queue size
- `cwmp.connection_request_timeout` - Timeout for connection requests (ms)
- `nbi.max_commit_interval` - Maximum interval between NBI commits (ms)
- `fs.max_file_size` - Maximum file upload size (bytes)

⚠️ **Warning**: Changing config values can affect GenieACS behavior. Only modify if you understand the implications.

### Auto-Provision

Navigate to **Admin → GenieACS → Auto-Provision**

Configure auto-provisioning rules that automatically apply parameter values when devices connect. This is a user-friendly UI for creating GenieACS provision scripts with `setParameterValues` calls.

Features:
- View current auto-provision script
- Configure provision parameters:
  - **Channel** - Communication channel (`default`, `0`, etc.)
  - **Precondition** - JavaScript expression (must return `true` for provision to run)
  - **Weight** - Priority (lower = higher priority)
  - **Set Parameters** - List of parameter path + value + type entries
  - **Additional Script** - Custom JavaScript code appended to the provision
- Save provision to GenieACS
- Delete auto-provision

**Parameter types:**
- `xsd:string` - Text value
- `xsd:boolean` - True/false
- `xsd:int` - Integer
- `xsd:unsignedInt` - Unsigned integer
- `xsd:dateTime` - Date/time value

> **Files**: The Files menu was removed from Salfanet Radius. Use the GenieACS UI directly for firmware/file uploads (`http://GENIEACS_IP:3000`).

## 🔄 API Endpoints

### Device Management

**Get Devices:**
```http
GET /api/settings/genieacs/devices
```

**Get Device Detail:**
```http
GET /api/settings/genieacs/devices/{deviceId}/detail
```

**Refresh Device:**
```http
POST /api/settings/genieacs/devices/{deviceId}/refresh
```

**Reboot Device:**
```http
POST /api/settings/genieacs/devices/{deviceId}/reboot
```

**Delete Device:**
```http
DELETE /api/settings/genieacs/devices/{deviceId}
```

### WiFi Configuration

**Update WiFi:**
```http
POST /api/genieacs/devices/{deviceId}/wifi
Content-Type: application/json

{
  "wlanIndex": 1,
  "ssid": "MyNetwork",
  "password": "MyPassword123",
  "securityMode": "WPA2-PSK",
  "enabled": true
}
```

Response:
```json
{
  "success": true,
  "message": "Konfigurasi WiFi berhasil dikirim ke device",
  "info": "Task berhasil dieksekusi",
  "taskId": "6930ee9736857bde5d1ca3ee",
  "taskStatus": "pending",
  "parameters": {
    "ssid": "MyNetwork",
    "securityMode": "WPA2-PSK",
    "enabled": true,
    "wlanIndex": 1
  }
}
```

### Task Management

**Get Tasks:**
```http
GET /api/genieacs/tasks
```

**Delete Task:**
```http
DELETE /api/genieacs/tasks/{taskId}
```

**Retry Task:**
```http
POST /api/genieacs/tasks/{taskId}/retry
```

### Connection Request

**Trigger Connection Request:**
```http
POST /api/genieacs/devices/{deviceId}/connection-request
```

This endpoint first attempts a **direct connection request** to the device (bypassing GenieACS) using the device's `ConnectionRequestURL`. It tries basic auth first, then falls back to digest auth (RFC 2617) if the device responds with a 401 Digest challenge. If no direct CR URL is available, it falls back to the GenieACS NBI connection-request task.

**Refresh Device (with polling):**
```http
POST /api/genieacs/devices/{deviceId}/refresh
Content-Type: application/json

{ "objectName": "InternetGatewayDevice" }
```

This endpoint:
1. Fetches the device to get its `ConnectionRequestURL` and CR credentials.
2. Queues a `getParameterValues` task with a curated parameter list.
3. Sends a direct connection request to the device (fire-and-forget).
4. Polls the task list for up to 20 seconds (10 iterations × 2s) to report whether the task was executed.

Response includes `taskExecuted: true/false` indicating whether the task completed within the polling window.

### Virtual Parameters (Settings proxy)

**List Virtual Parameters:**
```http
GET /api/settings/genieacs/virtual-parameters
```

**Get Single VP:**
```http
GET /api/settings/genieacs/virtual-parameters/{id}
```

**Create VP:**
```http
POST /api/settings/genieacs/virtual-parameters
Content-Type: application/json

{ "name": "myVP", "script": "return {writable: false, value: ['test', 'xsd:string']};" }
```

**Update VP:**
```http
PUT /api/settings/genieacs/virtual-parameters/{id}
Content-Type: application/json

{ "name": "myVP", "script": "// updated script" }
```

**Delete VP:**
```http
DELETE /api/settings/genieacs/virtual-parameters/{id}
```

### Parameter Display Config

**List Parameter Display:**
```http
GET /api/settings/genieacs/parameter-display?configType=DEVICE_LIST
```

**Update Parameter Display:**
```http
PUT /api/settings/genieacs/parameter-display/{id}
Content-Type: application/json

{ "label": "RX Power", "enabled": true, "displayOrder": 1 }
```

**Reset to Defaults:**
```http
POST /api/settings/genieacs/parameter-display/reset
```

### Presets

**List Presets:**
```http
GET /api/genieacs/presets
```

**Create Preset:**
```http
POST /api/genieacs/presets
Content-Type: application/json

{ "_id": "my-preset", "weight": 0, "channel": "default" }
```

**Update Preset:**
```http
PUT /api/genieacs/presets/{presetId}
```

**Delete Preset:**
```http
DELETE /api/genieacs/presets/{presetId}
```

### VP Scripts (with sync)

**List VP Scripts:**
```http
GET /api/genieacs/virtual-parameters
```

**Create VP Script:**
```http
POST /api/genieacs/virtual-parameters
Content-Type: application/json

{ "_id": "myVP", "script": "// script", "description": "Optional" }
```

**Update VP Script (re-syncs to GenieACS):**
```http
PUT /api/genieacs/virtual-parameters/{vpId}
```

**Delete VP Script:**
```http
DELETE /api/genieacs/virtual-parameters/{vpId}
```

**Sync All VPs:**
```http
POST /api/genieacs/sync
Content-Type: application/json

{ "types": ["virtualParameters"] }
```

### Provisions

**List Provisions:**
```http
GET /api/genieacs/provisions
```

**Create Provision:**
```http
POST /api/genieacs/provisions
Content-Type: application/json

{ "_id": "my-provision", "script": "// provision code" }
```

**Update Provision:**
```http
PUT /api/genieacs/provisions/{provisionId}
```

**Delete Provision:**
```http
DELETE /api/genieacs/provisions/{provisionId}
```

### Faults

**List Faults:**
```http
GET /api/genieacs/faults
```

**Filter by Device:**
```http
GET /api/genieacs/faults?device={deviceId}
```

**Delete Fault:**
```http
DELETE /api/genieacs/faults
Content-Type: application/json

{ "id": "{faultId}" }
```

**Bulk Delete Faults:**
```http
POST /api/genieacs/faults/bulk-delete
Content-Type: application/json

{ "ids": ["{faultId1}", "{faultId2}", "{faultId3}"] }
```

Response:
```json
{
  "success": true,
  "data": { "success": 3, "failed": 0, "errors": [] }
}
```

### Config

**List Config:**
```http
GET /api/genieacs/config
```

**Update Config:**
```http
PUT /api/genieacs/config
Content-Type: application/json

{ "id": "cwmp.queue_threshold", "value": 100 }
```

**Delete Config:**
```http
DELETE /api/genieacs/config
Content-Type: application/json

{ "id": "cwmp.queue_threshold" }
```

### Auto-Provision

**Get Auto-Provision:**
```http
GET /api/genieacs/auto-provision
```

**Create/Update Auto-Provision:**
```http
POST /api/genieacs/auto-provision
Content-Type: application/json

{ "channel": "default", "precondition": "true", "weight": 0, "setParameters": [], "additionalScript": "" }
```

**Delete Auto-Provision:**
```http
DELETE /api/genieacs/auto-provision
```

### Backup & Restore

**Export Backup:**
```http
GET /api/genieacs/backup?type=presets
GET /api/genieacs/backup?type=provisions
GET /api/genieacs/backup?type=vp
```

**Restore Backup:**
```http
POST /api/genieacs/backup
Content-Type: application/json

{ "presets": [...] }  // or { "provisions": [...] } or { "vpScripts": [...] }
```

## 🐛 Troubleshooting

### Device Not Appearing

**Problem**: ONT not showing in GenieACS devices list

**Solutions**:
1. Check TR-069 configuration on ONT
2. Verify ACS URL is correct: `http://GENIEACS_IP:7547/`
3. Check firewall - port 7547 must be open
4. Check GenieACS CWMP service: `systemctl status genieacs-cwmp`
5. View logs: `journalctl -u genieacs-cwmp -f`

### Task Stuck in Pending

**Problem**: WiFi edit task shows "Pending" forever

**Causes**:
- Connection request URL not working (device behind NAT)
- Firewall blocking connection request
- Device offline

**Solutions**:
1. Wait for periodic inform (5 minutes by default)
2. Setup port forwarding if device behind NAT
3. Reduce periodic inform interval on device
4. Click "Force Sync" to retry connection request

### Error cwmp.9002 - Internal Error

**Problem**: Task fails with `cwmp.9002 Internal error`

**Causes**:
- Wrong parameter path
- Parameter is read-only
- Value doesn't match expected type

**Solutions**:
1. Check device data model in GenieACS UI
2. Verify parameter is writable
3. Use correct path for your device model
4. For Huawei HG8145V5: Use `KeyPassphrase` not `PreSharedKey.1.KeyPassphrase`

### Connection Request Failed

**Problem**: "Force Sync" doesn't trigger device

**Check**:
```bash
# From GenieACS server, test connection to device
curl -v http://DEVICE_IP:7547/

# Expected: HTTP 401 Unauthorized (device responds)
# If timeout: Device not reachable
```

**Solutions**:
1. Verify device Connection Request URL is correct
2. Check device firewall allows incoming on port 7547
3. If behind NAT, setup port forwarding
4. Alternative: Wait for periodic inform instead

## 📊 Monitoring

### GenieACS Logs

View logs for debugging:

```bash
# CWMP service (device connections)
journalctl -u genieacs-cwmp -f

# NBI service (API)
journalctl -u genieacs-nbi -f

# UI service
journalctl -u genieacs-ui -f
```

### MongoDB Check

```bash
# Connect to MongoDB
mongo

# Use GenieACS database
use genieacs

# Count devices
db.devices.count()

# View recent devices
db.devices.find().limit(5)

# Count tasks
db.tasks.count()

# View pending tasks
db.tasks.find({ status: { $exists: false } })
```

### Network Test

```bash
# Test GenieACS API
curl http://localhost:7557/devices

# Test CWMP port
nc -zv localhost 7547

# Test from device to GenieACS
# (run on device or router)
curl -v http://GENIEACS_IP:7547/
```

## 🔐 Security

### Best Practices

1. **Use HTTPS** - Setup reverse proxy with SSL
2. **Enable Authentication** - Configure username/password in GenieACS
3. **Firewall Rules** - Only allow necessary ports
4. **VPN** - For devices to reach GenieACS securely
5. **Regular Updates** - Keep GenieACS updated

### Nginx Reverse Proxy (HTTPS)

```nginx
server {
    listen 443 ssl http2;
    server_name genieacs.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/genieacs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/genieacs.yourdomain.com/privkey.pem;
    
    # GenieACS UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # GenieACS NBI API
    location /api/ {
        proxy_pass http://localhost:7557/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# CWMP (TR-069) - HTTP only (device connections)
server {
    listen 7547;
    server_name genieacs.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:7547;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📚 References

- [GenieACS Documentation](https://docs.genieacs.com/)
- [TR-069 CWMP Protocol](https://www.broadband-forum.org/technical/download/TR-069.pdf)
- [Huawei TR-069 Data Model](https://support.huawei.com/)

## 🎯 Roadmap

Implemented features:
- [x] Device monitoring (status, uptime, signal, WiFi)
- [x] WiFi configuration (SSID, password, security)
- [x] Task management with auto-refresh
- [x] Virtual parameters CRUD (direct GenieACS proxy)
- [x] VP Scripts with sync tracking & backup/restore
- [x] Parameter display configuration (device list & detail)
- [x] Presets management with backup/restore
- [x] Provisions management with backup/restore
- [x] Faults monitoring and deletion (including bulk delete)
- [x] GenieACS runtime config editor
- [x] Auto-provisioning rules
- [x] Backup & restore (presets, provisions, VP scripts)
- [x] Device parameters browser with VP generation
- [x] Direct connection request with digest auth (bypass GenieACS)
- [x] Refresh with task polling (20s status check)
- [x] In-app guide page

> **Removed**: File upload menu — use GenieACS UI directly for firmware/file management.

Future enhancements:
- [ ] Firmware upgrade workflow (push firmware to devices)
- [ ] Bulk operations (multiple devices at once)
- [ ] Device grouping and tagging
- [ ] Scheduled tasks
- [ ] Alert notifications for device offline
- [ ] Preset templates library
- [ ] Device configuration backup/restore
