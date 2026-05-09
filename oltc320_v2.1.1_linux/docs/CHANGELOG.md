# Changelog - ZTE C320 OLT Management System

## [2.1.1] - 2026-01-25

### ✨ Added
- **Auto-Learning Configuration** - Complete feature untuk ONU auto-detection
  - Menu "Auto-Learning Configuration" di OMCI Config
  - Enable/Disable auto-learning per PON port
  - Show auto-learning status dengan real-time check
  - Command: `auto-learning enable/disable` di interface mode
  - Auto-save configuration setelah enable/disable
  - **Web UI**: New auto-learning page dengan switch controls

- **Enhanced ONU Details** - Expanded ONU information display
  - Added 15+ fields: name, SN, admin state, OMCC state, phase state
  - Multiple fallback methods untuk fetch ONU details
  - Serial number (SN) field di semua ONU lists
  - Better error handling dan graceful degradation

- **VLAN OMCI Display** - New method untuk show VLAN OMCI config
  - Command: `show gpon remote-onu vlan gpon-onu_x/x/x:x`
  - Integrated di ONU Config Manager menu

### 🔧 Fixed
- **Auto-Learning Commands** - Discovered correct ZTE C320 syntax
  - ❌ Previous: `onu auto-bind enable` (invalid command)
  - ✅ Current: `auto-learning enable` di interface mode
  - Fixed command flow: `configure terminal` → `interface gpon-olt_x/x/x` → `auto-learning enable`
  - Status check via `show running-config interface`

- **Serial Number Missing** - Fixed SN tidak muncul di ONU lists
  - Updated `fetch_all_working_onus()` untuk include SN field
  - Added fallback: `sn = detail.get('sn', '') or detail.get('serial_number', '') or 'N/A'`

- **Package Build Issues** - Fixed empty logs folder error
  - Added `mkdir logs` di package creation scripts
  - All packages now build successfully

- **PON Port Format** - Consistent formatting across modules
  - Cleaned format: gpon-olt_1/1/1 → 1/1/1 untuk display
  - Fixed port grouping di ONU selection lists

### 🎨 Improved  
- **Menu Restructure** - Better organization
  - Moved auto-learning dari "Auto-Bind" ke "Auto-Learning"
  - Updated menu descriptions untuk clarity
  - Consistent terminology: auto-learning vs auto-bind

- **Error Handling** - More robust command execution
  - Improved telnet client timeout handling
  - Better command validation dan error messages
  - Added debug output untuk troubleshooting

- **User Experience** - Enhanced workflows
  - Real-time status updates
  - Progress indicators untuk long operations  
  - Clear success/failure messages
  - Helpful tips dan command references

### 🧹 Cleanup
- **File Cleanup** - Removed unused files
  - Deleted: `test_auto_bind.py`, `test_olt_ssh.py`
  - Deleted: `show_commands_list.txt`
  - Cleaner project structure

### 📚 Documentation
- **AUTO_PROVISION.md** - Complete rewrite
  - Focus on auto-learning vs auto-bind differences
  - ZTE C320 specific commands dan workflows
  - Real command examples dengan expected output
  - Best practices untuk ONU detection dan registration

- **Web UI Integration** - Updated interface
  - New auto-learning page dengan real-time status
  - PON port management dengan toggle switches
  - Statistics dashboard untuk monitoring
  - Quick actions untuk bulk enable/disable

### 🔍 Technical Discovery
Via direct SSH access ke OLT (103.191.165.156:9006), discovered:
- ZTE C320 tidak support `onu auto-bind enable` command
- Correct command: `auto-learning enable` di interface mode  
- Default behavior: auto-learning ENABLED untuk semua port
- Status check: look for `auto-learning disable` di running-config

## [2.1.0] - 2026-01-22

### ✨ Added
- **ONU Type Management** - Full support untuk add dan delete ONU types
  - Command menggunakan PON mode (`configure terminal` → `pon`)
  - Add ONU type: `onu-type <NAME> gpon <property> <value>`
  - Delete ONU type: `no onu-type <NAME>`
  - Live update - perubahan langsung efektif di running-config
  - Auto-save configuration option
  - Wizard dengan input validation

### 🔧 Fixed
- **System Information Menu** - Fixed command syntax untuk ZTE C320
  - Menggunakan `show running-config | include version`
  - Menggunakan `show hostname` dan `show card`
  - Removed unsupported CPU/memory/temperature monitoring
  
- **Alarm Commands** - Updated ke syntax yang benar
  - `show alarm crtv-active` untuk active alarms
  - `show alarm crtv-event` untuk alarm events
  
- **Interface Status** - Fixed dengan format yang benar
  - `show interface gpon-olt_X/X/X`
  - Fallback ke `show running-config interface`
  
- **SNMP Management** - Semua command updated
  - Changed dari `snmp-agent` ke `snmp-server`
  - Fixed community add/delete syntax
  - Fixed delete command (tidak perlu ro/rw parameter)
  
- **Uplink Interface Management** - Enhanced features
  - Added support untuk xgei interfaces (selain gei)
  - VLAN configuration wizard dengan interface selection
  - Delete VLAN wizard dengan multi-mode support (trunk/access)
  - Shutdown/Enable interface wizards
  - Interface list parsing dari running-config

- **VLAN Menu** - Fixed method call error
  - Updated dari `uplink_vlan_config` ke `uplink_vlan_config_wizard`

### 🎨 Improved
- **User Interface** - Lebih informatif dan user-friendly
  - Added "Live Update" labels untuk real-time features
  - Better success/error messages
  - Clear warnings untuk save configuration
  - Progress indicators untuk operasi batch

### 📚 Documentation
- Updated README.md dengan ONU Type Management
- Updated MENU_STRUCTURE.md dengan detail lengkap
- Added CHANGELOG.md untuk tracking changes
- Improved inline code comments

### 🧹 Cleanup
- Removed all test files (test_*.py)
- Removed exploration scripts (explore_*.py, find_*.py)
- Cleaned up project structure
- Organized documentation files

---

## [2.0.0] - 2026-01-20

### ✨ Initial Release
- Complete OLT management system
- ONU registration and configuration
- Profile management (TCONT, Traffic, Line, Service)
- VLAN management
- System configuration (SNMP, NTP, Users)
- Security management
- TR-069/ACS configuration
- Batch operations
- Auto installer for Windows and Linux
- Comprehensive documentation

---

## Version Numbering Scheme

Format: **MAJOR.MINOR.PATCH**

- **MAJOR**: Breaking changes or major feature additions
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes and minor improvements

---

## Future Roadmap

### Planned Features (v2.2.0)
- [ ] Web UI dashboard
- [ ] REST API support
- [ ] Database integration
- [ ] Advanced reporting
- [ ] Multi-OLT management
- [ ] Backup scheduler
- [ ] Email notifications
- [ ] Performance monitoring

### Under Consideration
- [ ] SNMP trap receiver
- [ ] Firmware upgrade management
- [ ] Topology mapping
- [ ] QoS optimization wizard
- [ ] Automated troubleshooting
- [ ] Mobile app

---

## Support & Contribution

For bug reports, feature requests, or contributions:
- Contact: ISP Technical Team
- Internal Issue Tracker
- Documentation: See README.md

---

**Note**: This is an internal tool for ISP operations. All changes are tracked and reviewed before deployment.
