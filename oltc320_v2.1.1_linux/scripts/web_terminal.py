#!/usr/bin/env python3
"""
Web Terminal - Interactive CLI Menu via API
Menu CLI yang sama dengan olt_complete_menu.py tapi menggunakan API untuk eksekusi command
"""
import sys
import os
import json

# Force unbuffered output
os.environ['PYTHONUNBUFFERED'] = '1'
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=False)

API_BASE = "http://127.0.0.1:8000"


def api_call(endpoint, method="GET", data=None):
    """Call API endpoint"""
    try:
        import requests
        url = f"{API_BASE}{endpoint}"
        
        if method == "GET":
            resp = requests.get(url, timeout=30)
        else:
            resp = requests.post(url, json=data, timeout=30)
        
        if resp.status_code == 200:
            return resp.json()
        else:
            return None
    except Exception as e:
        return None


def print_line(text=""):
    """Print line dengan flush"""
    print(text, flush=True)


def print_header(title):
    """Print header"""
    print_line()
    print_line("=" * 60)
    print_line(f"  {title}")
    print_line("=" * 60)


def get_olt_status():
    """Get OLT connection status dari API"""
    try:
        import requests
        resp = requests.get(f"{API_BASE}/api/health", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            connected = data.get("olt_configured", False)
            host = data.get("olt_host", "Unknown")
            return connected, host
    except Exception as e:
        print(f"[DEBUG] get_olt_status error: {e}", flush=True)
    return False, "Unknown"


def press_enter():
    """Wait for enter"""
    sys.stdout.write("\nTekan Enter untuk melanjutkan...")
    sys.stdout.flush()
    try:
        sys.stdin.readline()
    except:
        pass


def main_menu():
    """Main menu - sama dengan olt_complete_menu.py"""
    while True:
        connected, host = get_olt_status()
        status = f"Connected to {host}" if connected else "Disconnected"
        
        print_header("OLT ZTE C320 - COMPLETE MANAGEMENT")
        print_line(f"\n  OLT Status: {status}\n")
        print_line("    =================== OLT SELECTION =====================")
        print_line("    0. Switch OLT / Manage OLT Profiles")
        print_line()
        print_line("    ===================== ONU MANAGEMENT =====================")
        print_line("    1. Show Unconfigured ONU")
        print_line("    2. ONU Register Wizard (Register & Configure)")
        print_line("    3. Show ONU Status (All Ports)")
        print_line("    4. ONU Configuration (PPPOE, Bridge, Static IP)")
        print_line("    5. ONU OMCI Configuration (LAN/WLAN Binding)")
        print_line()
        print_line("    =================== PROFILE & VLAN ====================")
        print_line("    6. Profile Management (TCONT, Traffic, Line, Service)")
        print_line("    7. VLAN Management")
        print_line("    8. Uplink Interface Management")
        print_line()
        print_line("    =================== SYSTEM CONFIG =====================")
        print_line("    9. SNMP Management")
        print_line("    10. TR-069/ACS Configuration")
        print_line("    11. NTP & Time Configuration")
        print_line("    12. User Management")
        print_line("    13. System Information & Alarms")
        print_line()
        print_line("    ====================== UTILITY ========================")
        print_line("    14. Sync ONU Data (Refresh All)")
        print_line("    15. Save Configuration")
        print_line("    16. Show Running Config")
        print_line()
        print_line("    99. Exit")
        print_line()
        print_line("=" * 60)
        
        sys.stdout.write("Pilih menu [0-16,99]: ")
        sys.stdout.flush()
        
        try:
            choice = sys.stdin.readline().strip()
        except:
            break
            
        if not choice:
            continue
            
        if choice == '0':
            olt_profile_menu()
        elif choice == '1':
            show_unconfigured_onu()
        elif choice == '2':
            onu_register_wizard()
        elif choice == '3':
            show_onu_status()
        elif choice == '4':
            onu_config_menu()
        elif choice == '5':
            onu_omci_menu()
        elif choice == '6':
            profile_menu()
        elif choice == '7':
            vlan_menu()
        elif choice == '8':
            uplink_menu()
        elif choice == '9':
            snmp_menu()
        elif choice == '10':
            tr069_menu()
        elif choice == '11':
            ntp_menu()
        elif choice == '12':
            user_menu()
        elif choice == '13':
            system_info_menu()
        elif choice == '14':
            sync_onu_data()
        elif choice == '15':
            save_config()
        elif choice == '16':
            show_running_config()
        elif choice == '99':
            print_line("\nKeluar dari program...")
            break
        else:
            print_line(f"\n  Menu '{choice}' tidak valid!")
            press_enter()


# ==================== OLT PROFILE ====================

def olt_profile_menu():
    """OLT Profile management"""
    while True:
        print_header("OLT PROFILE MANAGEMENT")
        print_line()
        print_line("    1. List All OLT Profiles")
        print_line("    2. Add New OLT Profile")
        print_line("    3. Switch Active OLT")
        print_line("    4. Delete OLT Profile")
        print_line("    5. Test Connection")
        print_line()
        print_line("    0. Back to Main Menu")
        print_line()
        
        sys.stdout.write("Pilih [0-5]: ")
        sys.stdout.flush()
        
        try:
            choice = sys.stdin.readline().strip()
        except:
            break
            
        if choice == '0':
            break
        elif choice == '1':
            list_olt_profiles()
        elif choice == '2':
            add_olt_profile()
        elif choice == '3':
            switch_olt()
        elif choice == '4':
            delete_olt_profile()
        elif choice == '5':
            test_connection()


def list_olt_profiles():
    """List all OLT profiles"""
    print_header("LIST OLT PROFILES")
    
    data = api_call("/olt/profiles")
    if data and "profiles" in data:
        profiles = data["profiles"]
        active = data.get("active_profile", "")
        
        print_line()
        for p in profiles:
            marker = " [ACTIVE]" if p["name"] == active else ""
            print_line(f"  - {p['name']}: {p['host']}:{p['port']}{marker}")
        print_line()
    else:
        print_line("\n  Tidak ada profile OLT.")
    
    press_enter()


def add_olt_profile():
    """Add new OLT profile"""
    print_header("ADD NEW OLT PROFILE")
    
    sys.stdout.write("\n  Nama Profile: ")
    sys.stdout.flush()
    name = sys.stdin.readline().strip()
    
    sys.stdout.write("  Host/IP: ")
    sys.stdout.flush()
    host = sys.stdin.readline().strip()
    
    sys.stdout.write("  Port [23]: ")
    sys.stdout.flush()
    port = sys.stdin.readline().strip() or "23"
    
    sys.stdout.write("  Username: ")
    sys.stdout.flush()
    username = sys.stdin.readline().strip()
    
    sys.stdout.write("  Password: ")
    sys.stdout.flush()
    password = sys.stdin.readline().strip()
    
    if name and host and username:
        data = {
            "name": name,
            "host": host,
            "port": int(port),
            "username": username,
            "password": password
        }
        result = api_call("/olt/profiles", "POST", data)
        if result:
            print_line(f"\n  Profile '{name}' berhasil ditambahkan!")
        else:
            print_line("\n  Gagal menambah profile!")
    else:
        print_line("\n  Data tidak lengkap!")
    
    press_enter()


def switch_olt():
    """Switch active OLT"""
    print_header("SWITCH ACTIVE OLT")
    
    data = api_call("/olt/profiles")
    if data and "profiles" in data:
        profiles = data["profiles"]
        
        print_line()
        for i, p in enumerate(profiles, 1):
            print_line(f"  {i}. {p['name']} ({p['host']})")
        print_line("  0. Cancel")
        print_line()
        
        sys.stdout.write("Pilih OLT: ")
        sys.stdout.flush()
        choice = sys.stdin.readline().strip()
        
        try:
            idx = int(choice)
            if 0 < idx <= len(profiles):
                name = profiles[idx-1]["name"]
                result = api_call(f"/olt/profiles/{name}/activate", "POST")
                if result:
                    print_line(f"\n  OLT '{name}' diaktifkan!")
                else:
                    print_line("\n  Gagal mengaktifkan OLT!")
        except:
            pass
    
    press_enter()


def delete_olt_profile():
    """Delete OLT profile"""
    print_header("DELETE OLT PROFILE")
    print_line("\n  (Fitur ini akan menghapus profile)")
    press_enter()


def test_connection():
    """Test OLT connection"""
    print_header("TEST CONNECTION")
    
    print_line("\n  Testing connection to OLT...")
    connected, host = get_olt_status()
    
    if connected:
        print_line(f"\n  Connected to {host}")
    else:
        print_line(f"\n  Not connected")
    
    press_enter()


# ==================== ONU MANAGEMENT ====================

def show_unconfigured_onu():
    """Show unconfigured ONUs"""
    print_header("UNCONFIGURED ONU")
    
    print_line("\n  Scanning all PON ports...")
    print_line("  Mohon tunggu, sedang koneksi ke OLT...\n")
    
    data = api_call("/api/discovery")
    if data and "unconfigured" in data:
        onus = data["unconfigured"]
        
        if onus:
            print_line(f"\n  Found {len(onus)} unconfigured ONU(s):\n")
            for onu in onus:
                print_line(f"  - PON {onu.get('pon_port', 'N/A')}: {onu.get('sn', 'Unknown')}")
        else:
            print_line("\n  Tidak ada ONU unconfigured.")
    else:
        connected, host = get_olt_status()
        if not connected:
            print_line("\n  [!] OLT tidak terkoneksi!")
            print_line("  Silakan pilih menu 0 untuk koneksi ke OLT.")
        else:
            print_line("\n  [!] Gagal mengambil data dari OLT.")
    
    press_enter()


def onu_register_wizard():
    """ONU Registration wizard - Interactive version dengan sub-menu lengkap"""
    while True:
        print_header("ONU REGISTER WIZARD")
        
        print_line()
        print_line("    ==============================================================")
        print_line("                         MENU UTAMA                            ")
        print_line("    ==============================================================")
        print_line("      [1] Lihat ONU Belum Terdaftar (Unconfigured)              ")
        print_line("      [2] Lihat ONU Sudah Terdaftar (Working)                   ")
        print_line("      [3] Edit Nama/Deskripsi ONU                               ")
        print_line("      [4] Konfigurasi Service ONU                               ")
        print_line("      [5] Management Profile (TCONT/Traffic/VLAN)               ")
        print_line("      [6] Simpan Konfigurasi                                    ")
        print_line("      [0] Keluar                                                ")
        print_line("    ==============================================================")
        print_line()
        
        sys.stdout.write("  Pilih menu [0-6]: ")
        sys.stdout.flush()
        choice = sys.stdin.readline().strip()
        
        if choice == '0':
            break
        elif choice == '1':
            menu_unconfigured_onu()
        elif choice == '2':
            menu_working_onu()
        elif choice == '3':
            menu_edit_onu()
        elif choice == '4':
            menu_configure_service()
        elif choice == '5':
            menu_profile_management()
        elif choice == '6':
            save_configuration()
        else:
            print_line("\n  Pilihan tidak valid!")
            press_enter()


def menu_unconfigured_onu():
    """Menu untuk ONU yang belum terdaftar"""
    try:
        print_header("ONU BELUM TERDAFTAR (UNCONFIGURED)")
        
        print_line("\n  Scanning unconfigured ONUs...")
        print_line("  Mohon tunggu, sedang koneksi ke OLT...\n")
        sys.stdout.flush()
        
        data = api_call("/api/discovery")
        
        if not data or "data" not in data:
            # Check connection status
            connected, host = get_olt_status()
            if not connected:
                print_line("\n  [!] OLT tidak terkoneksi!")
                print_line(f"  Host: {host}")
                print_line("\n  Silakan pilih menu 0 untuk koneksi ke OLT.")
            else:
                print_line("\n  [!] Gagal mengambil data ONU dari OLT.")
                print_line("  Kemungkinan: timeout atau OLT tidak merespon.")
            press_enter()
            return
        
        onus = data["data"]
        
        if not onus:
            print_line("\n  Tidak ada ONU unconfigured.")
            press_enter()
            return
        
        print_line(f"\n  Ditemukan {len(onus)} ONU unconfigured:\n")
        
        for i, onu in enumerate(onus, 1):
            pon = onu.get('pon_port', 'N/A')
            sn = onu.get('sn', 'Unknown')
            model = onu.get('onu_type', 'Unknown')
            print_line(f"  [{i}] PON {pon}: {sn} ({model})")
        
        print_line()
        print_line("  Pilihan:")
        print_line("  1. Register satu ONU")
        print_line("  2. Register semua ONU")
        print_line("  0. Kembali")
        print_line()
        
        sys.stdout.write("Pilih [0-2]: ")
        sys.stdout.flush()
        choice = sys.stdin.readline().strip()
        
        if choice == '0':
            return
        elif choice == '1':
            register_single_onu(onus)
        elif choice == '2':
            register_all_onus(onus)
    except Exception as e:
        print_line(f"\n  ERROR: {str(e)}")
        import traceback
        print_line(f"  {traceback.format_exc()}")
        press_enter()


def register_single_onu(onus):
    """Register single ONU"""
    print_line()
    sys.stdout.write(f"Pilih ONU [1-{len(onus)}]: ")
    sys.stdout.flush()
    
    try:
        idx = int(sys.stdin.readline().strip())
        if 1 <= idx <= len(onus):
            onu = onus[idx-1]
            perform_onu_registration(onu)
        else:
            print_line("\n  Pilihan tidak valid!")
            press_enter()
    except:
        print_line("\n  Input tidak valid!")
        press_enter()


def register_all_onus(onus):
    """Register all unconfigured ONUs"""
    print_header("REGISTER ALL ONU")
    
    print_line(f"\n  Akan meregistrasi {len(onus)} ONU")
    print_line("  Lanjutkan? (y/n): ")
    
    confirm = sys.stdin.readline().strip().lower()
    
    if confirm != 'y':
        print_line("\n  Dibatalkan.")
        press_enter()
        return
    
    success_count = 0
    fail_count = 0
    
    for i, onu in enumerate(onus, 1):
        print_line(f"\n  [{i}/{len(onus)}] Registrasi {onu.get('sn', 'Unknown')}...")
        
        if perform_onu_registration(onu, auto_mode=True):
            success_count += 1
            print_line("  Berhasil!")
        else:
            fail_count += 1
            print_line("  Gagal!")
    
    print_line(f"\n  Selesai: {success_count} berhasil, {fail_count} gagal")
    press_enter()


def perform_onu_registration(onu, auto_mode=False):
    """Perform ONU registration with wizard"""
    print_header("REGISTRASI ONU")
    
    pon_port = onu.get('pon_port', '')
    sn = onu.get('sn', '')
    model = onu.get('model', 'Unknown')
    
    print_line(f"\n  PON Port: {pon_port}")
    print_line(f"  Serial Number: {sn}")
    print_line(f"  Model: {model}")
    print_line()
    
    # Input ONU ID
    if not auto_mode:
        sys.stdout.write("  ONU ID (1-128): ")
        sys.stdout.flush()
        onu_id = sys.stdin.readline().strip()
        
        sys.stdout.write("  Nama ONU: ")
        sys.stdout.flush()
        name = sys.stdin.readline().strip() or f"ONU-{pon_port}-{onu_id}"
        
        sys.stdout.write("  Deskripsi: ")
        sys.stdout.flush()
        description = sys.stdin.readline().strip()
        
        sys.stdout.write("  VLAN ID: ")
        sys.stdout.flush()
        vlan = sys.stdin.readline().strip() or "100"
        
        print_line("\n  Service Type:")
        print_line("  1. PPPOE")
        print_line("  2. Bridge")
        print_line("  3. Static IP")
        sys.stdout.write("  Pilih [1-3]: ")
        sys.stdout.flush()
        service_choice = sys.stdin.readline().strip()
        
        service_type = {
            '1': 'pppoe',
            '2': 'bridge',
            '3': 'static'
        }.get(service_choice, 'bridge')
        
        # If PPPOE, ask for credentials
        pppoe_user = None
        pppoe_pass = None
        if service_type == 'pppoe':
            print_line("\n  PPPOE Configuration:")
            sys.stdout.write("  Username: ")
            sys.stdout.flush()
            pppoe_user = sys.stdin.readline().strip()
            
            sys.stdout.write("  Password: ")
            sys.stdout.flush()
            pppoe_pass = sys.stdin.readline().strip()
        
        # If Static IP, ask for IP details
        ip_address = None
        subnet = None
        gateway = None
        if service_type == 'static':
            print_line("\n  Static IP Configuration:")
            sys.stdout.write("  IP Address: ")
            sys.stdout.flush()
            ip_address = sys.stdin.readline().strip()
            
            sys.stdout.write("  Netmask: ")
            sys.stdout.flush()
            subnet = sys.stdin.readline().strip() or "255.255.255.0"
            
            sys.stdout.write("  Gateway: ")
            sys.stdout.flush()
            gateway = sys.stdin.readline().strip()
    else:
        # Auto mode - gunakan default
        onu_id = str(get_next_available_onu_id(pon_port))
        name = f"ONU-{sn[-6:]}"
        description = f"Auto registered {sn}"
        vlan = "100"
        service_type = "bridge"
        pppoe_user = None
        pppoe_pass = None
        ip_address = None
        subnet = None
        gateway = None
    
    # Register via API
    print_line("\n  Melakukan registrasi...")
    
    reg_data = {
        "pon_port": pon_port,
        "sn": sn,
        "onu_name": name,
        "onu_type": model,
        "onu_description": description,
        "vlan": int(vlan),
        "service_mode": service_type
    }
    
    # Add PPPOE credentials if provided
    if pppoe_user and pppoe_pass:
        reg_data["pppoe_user"] = pppoe_user
        reg_data["pppoe_pass"] = pppoe_pass
    
    # Add Static IP details if provided
    if ip_address and gateway:
        reg_data["ip_address"] = ip_address
        reg_data["subnet"] = subnet
        reg_data["gateway"] = gateway
    
    result = api_call("/api/onu-manage/register", "POST", reg_data)
    
    if result and result.get("success"):
        print_line("\n  [OK] Registrasi berhasil!")
        onu_id_result = result.get("data", {}).get("onu_id", "N/A")
        print_line(f"  ONU ID: {onu_id_result}")
        print_line(f"  Interface: {result.get('data', {}).get('onu_interface', 'N/A')}")
        
        if not auto_mode:
            press_enter()
        return True
    else:
        error_msg = result.get("detail", "Unknown error") if result else "API call failed"
        print_line(f"\n  [ERROR] Registrasi gagal: {error_msg}")
        if not auto_mode:
            press_enter()
        return False


def get_next_available_onu_id(pon_port):
    """Get next available ONU ID for PON port"""
    # Use API to get ONU status on port
    data = api_call(f"/api/onu-manage/status?pon_port={pon_port}")
    if data and "data" in data:
        used_ids = [int(o.get('onu_id', 0)) for o in data["data"]]
        # Find first available ID from 1-128
        for i in range(1, 129):
            if i not in used_ids:
                return i
    return 1


def menu_working_onu():
    """Menu untuk ONU yang sudah terdaftar"""
    print_header("ONU SUDAH TERDAFTAR (WORKING)")
    
    print_line("\n  Fetching working ONUs...")
    print_line("  Mohon tunggu, proses ini bisa memakan waktu...")
    print_line("  (Scanning 16 PON ports)\n")
    sys.stdout.flush()
    
    # Increase timeout for this call as it scans all ports
    import requests
    try:
        url = f"{API_BASE}/api/onu-manage/working"
        resp = requests.get(url, timeout=120)  # 2 minute timeout
        
        if resp.status_code == 200:
            data = resp.json()
        else:
            print_line(f"\n  [!] API Error: {resp.status_code}")
            print_line(f"  {resp.text}")
            press_enter()
            return
    except requests.exceptions.Timeout:
        print_line("\n  [!] Timeout - Proses terlalu lama")
        print_line("  Coba lagi atau gunakan Web UI")
        press_enter()
        return
    except Exception as e:
        print_line(f"\n  [!] Error: {str(e)}")
        press_enter()
        return
    
    if not data or "data" not in data:
        print_line("\n  [!] Gagal mengambil data ONU.")
        press_enter()
        return
    
    onus = data["data"]
    
    if not onus:
        print_line("\n  Tidak ada ONU working.")
        press_enter()
        return
    
    print_line(f"\n  Total: {len(onus)} ONU(s)\n")
    print_line(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Name':<20} {'Status':<10}")
    print_line(f"  {'-'*65}")
    
    for i, onu in enumerate(onus[:50], 1):  # Limit to first 50
        pon = onu.get('pon_port', 'N/A')
        onu_id = onu.get('onu_id', 'N/A')
        name = onu.get('name', 'N/A')
        status = onu.get('status', 'N/A')
        print_line(f"  {i:<4} {pon:<12} {onu_id:<8} {name:<20} {status:<10}")
    
    if len(onus) > 50:
        print_line(f"\n  ... dan {len(onus) - 50} lainnya")
    
    press_enter()


def menu_edit_onu():
    """Menu edit nama/deskripsi ONU"""
    print_header("EDIT NAMA/DESKRIPSI ONU")
    
    print_line("\n  Fitur ini untuk mengedit nama dan deskripsi ONU")
    print_line("  yang sudah terdaftar.")
    print_line("\n  (Coming soon - use Web UI for now)")
    
    press_enter()


def menu_configure_service():
    """Menu konfigurasi service ONU"""
    print_header("KONFIGURASI SERVICE ONU")
    
    print_line("\n  Fitur ini untuk konfigurasi service pada ONU:")
    print_line("  - PPPOE Configuration")
    print_line("  - Bridge Mode")
    print_line("  - Static IP")
    print_line("  - VLAN Configuration")
    print_line("\n  (Coming soon - use Web UI for now)")
    
    press_enter()


def menu_profile_management():
    """Menu management profile"""
    print_header("MANAGEMENT PROFILE (TCONT/TRAFFIC/VLAN)")
    
    print_line("\n  Fitur ini untuk manage profile:")
    print_line("  - TCONT Profile")
    print_line("  - Traffic Profile")
    print_line("  - VLAN Management")
    print_line("\n  (Coming soon - use Web UI for now)")
    
    press_enter()


def save_configuration():
    """Simpan konfigurasi OLT"""
    print_header("SIMPAN KONFIGURASI")
    
    print_line("\n  Menyimpan konfigurasi ke OLT...")
    
    data = api_call("/api/system/save-config", "POST")
    
    if data and data.get("success"):
        print_line("\n  [OK] Konfigurasi berhasil disimpan!")
    else:
        print_line("\n  [!] Gagal menyimpan konfigurasi")
    
    press_enter()


def show_onu_status():
    """Show ONU status"""
    print_header("ONU STATUS - ALL PORTS")
    
    print_line("\n  Fetching ONU status from all ports...")
    
    data = api_call("/onu/list?include_status=true")
    if data and "onus" in data:
        onus = data["onus"]
        
        if onus:
            print_line(f"\n  Total: {len(onus)} ONU(s)\n")
            
            working = [o for o in onus if o.get("status") == "working"]
            offline = [o for o in onus if o.get("status") != "working"]
            
            print_line(f"  Working: {len(working)} | Offline: {len(offline)}\n")
            
            for onu in onus[:20]:
                status = "[OK]" if onu.get("status") == "working" else "[X]"
                print_line(f"  {status} {onu.get('name', 'N/A')} - {onu.get('pon_port', '')}:{onu.get('onu_id', '')}")
            
            if len(onus) > 20:
                print_line(f"\n  ... dan {len(onus)-20} ONU lainnya")
        else:
            print_line("\n  Tidak ada ONU terdaftar.")
    else:
        print_line("\n  Gagal mengambil data.")
    
    press_enter()


def onu_config_menu():
    """ONU Configuration menu"""
    while True:
        print_header("ONU CONFIGURATION")
        print_line()
        print_line("    1. Configure PPPOE")
        print_line("    2. Configure Bridge Mode")
        print_line("    3. Configure Static IP")
        print_line("    4. Show ONU Detail")
        print_line()
        print_line("    0. Back")
        print_line()
        
        sys.stdout.write("Pilih [0-4]: ")
        sys.stdout.flush()
        choice = sys.stdin.readline().strip()
        
        if choice == '0':
            break
        elif choice == '1':
            configure_pppoe()
        elif choice == '2':
            configure_bridge()
        elif choice == '3':
            configure_static_ip()
        elif choice == '4':
            show_onu_detail()


def configure_pppoe():
    """Configure PPPOE"""
    print_header("CONFIGURE PPPOE")
    print_line("\n  Gunakan Web UI untuk konfigurasi lebih mudah:")
    print_line("  http://localhost:3000/onu")
    press_enter()


def configure_bridge():
    """Configure Bridge"""
    print_header("CONFIGURE BRIDGE")
    print_line("\n  Gunakan Web UI untuk konfigurasi lebih mudah:")
    print_line("  http://localhost:3000/onu")
    press_enter()


def configure_static_ip():
    """Configure Static IP"""
    print_header("CONFIGURE STATIC IP")
    print_line("\n  Gunakan Web UI untuk konfigurasi lebih mudah:")
    print_line("  http://localhost:3000/onu")
    press_enter()


def show_onu_detail():
    """Show ONU detail"""
    print_header("ONU DETAIL")
    
    sys.stdout.write("\n  Masukkan PON Port (contoh: 1/1/1): ")
    sys.stdout.flush()
    pon = sys.stdin.readline().strip()
    
    sys.stdout.write("  Masukkan ONU ID: ")
    sys.stdout.flush()
    onu_id = sys.stdin.readline().strip()
    
    if pon and onu_id:
        data = api_call(f"/onu/{pon}/{onu_id}")
        if data:
            print_line(f"\n  ONU: {data.get('name', 'N/A')}")
            print_line(f"  SN: {data.get('sn', 'N/A')}")
            print_line(f"  Status: {data.get('status', 'N/A')}")
            print_line(f"  Type: {data.get('type', 'N/A')}")
        else:
            print_line("\n  ONU tidak ditemukan")
    
    press_enter()


def onu_omci_menu():
    """OMCI Configuration"""
    print_header("ONU OMCI CONFIGURATION")
    print_line("\n  LAN/WLAN Binding configuration")
    print_line("  Gunakan Web UI untuk konfigurasi lebih mudah")
    press_enter()


# ==================== PROFILE & VLAN ====================

def profile_menu():
    """Profile Management"""
    while True:
        print_header("PROFILE MANAGEMENT")
        print_line()
        print_line("    1. TCONT Management")
        print_line("    2. Traffic Profile Management")
        print_line("    3. Line Profile Management")
        print_line("    4. Service Profile Management")
        print_line()
        print_line("    0. Back")
        print_line()
        
        sys.stdout.write("Pilih [0-4]: ")
        sys.stdout.flush()
        choice = sys.stdin.readline().strip()
        
        if choice == '0':
            break
        elif choice in ['1', '2', '3', '4']:
            print_line("\n  Lihat dokumentasi untuk detail profile management.")
            press_enter()


def vlan_menu():
    """VLAN Management"""
    print_header("VLAN MANAGEMENT")
    
    print_line("\n  Fetching VLAN list...")
    
    data = api_call("/system/vlans")
    if data and "vlans" in data:
        vlans = data["vlans"]
        print_line(f"\n  Total: {len(vlans)} VLAN(s)\n")
        for v in vlans[:15]:
            print_line(f"  - VLAN {v.get('id', 'N/A')}: {v.get('name', 'N/A')}")
    else:
        print_line("\n  Gagal mengambil data VLAN")
    
    press_enter()


def uplink_menu():
    """Uplink Management"""
    print_header("UPLINK INTERFACE MANAGEMENT")
    print_line("\n  Konfigurasi uplink interface")
    print_line("  Gunakan Web UI atau CLI langsung untuk konfigurasi")
    press_enter()


# ==================== SYSTEM CONFIG ====================

def snmp_menu():
    """SNMP Management"""
    print_header("SNMP MANAGEMENT")
    print_line("\n  SNMP configuration via API")
    press_enter()


def tr069_menu():
    """TR-069 Configuration"""
    print_header("TR-069/ACS CONFIGURATION")
    print_line("\n  TR-069 ACS Server configuration")
    press_enter()


def ntp_menu():
    """NTP Configuration"""
    print_header("NTP & TIME CONFIGURATION")
    
    data = api_call("/system/time")
    if data:
        print_line(f"\n  System Time: {data.get('time', 'N/A')}")
        print_line(f"  NTP Server: {data.get('ntp_server', 'N/A')}")
    
    press_enter()


def user_menu():
    """User Management"""
    print_header("USER MANAGEMENT")
    print_line("\n  OLT User management")
    press_enter()


def system_info_menu():
    """System Information"""
    print_header("SYSTEM INFORMATION & ALARMS")
    
    data = api_call("/system/info")
    if data:
        print_line(f"\n  Hostname: {data.get('hostname', 'N/A')}")
        print_line(f"  Model: {data.get('model', 'N/A')}")
        print_line(f"  Version: {data.get('version', 'N/A')}")
        print_line(f"  Uptime: {data.get('uptime', 'N/A')}")
    else:
        print_line("\n  Gagal mengambil system info")
    
    press_enter()


# ==================== UTILITY ====================

def sync_onu_data():
    """Sync ONU Data"""
    print_header("SYNC ONU DATA")
    
    print_line("\n  Syncing ONU data from OLT...")
    
    result = api_call("/onu/sync", "POST")
    if result:
        print_line(f"\n  Sync completed!")
        print_line(f"  Total ONU: {result.get('total', 0)}")
    else:
        print_line("\n  Sync failed")
    
    press_enter()


def save_config():
    """Save Configuration"""
    print_header("SAVE CONFIGURATION")
    
    print_line("\n  Saving running config to startup...")
    
    result = api_call("/system/save-config", "POST")
    if result and result.get("success"):
        print_line("\n  Configuration saved!")
    else:
        print_line("\n  Failed to save configuration")
    
    press_enter()


def show_running_config():
    """Show Running Config"""
    print_header("RUNNING CONFIGURATION")
    
    print_line("\n  Fetching running config...")
    
    data = api_call("/system/running-config")
    if data and "config" in data:
        config = data["config"]
        lines = config.split('\n')[:50]
        print_line()
        for line in lines:
            print_line(f"  {line}")
        if len(config.split('\n')) > 50:
            print_line("\n  ... (truncated)")
    else:
        print_line("\n  Gagal mengambil running config")
    
    press_enter()


if __name__ == "__main__":
    print_line("Web Terminal Started")
    try:
        main_menu()
    except KeyboardInterrupt:
        print_line("\n\nTerminal closed.")
    except Exception as e:
        print_line(f"\nError: {e}")
