"""
OLT Complete Management Menu
Menu interaktif lengkap untuk mengelola OLT ZTE C320
Menggabungkan semua fitur:
- OLT Config Manager (TCONT, Traffic, VLAN, Uplink, Line/Service Profile)
- OLT System Manager (SNMP, NTP, Syslog, User, TR-069)
- ONU Config Manager (PPPOE, Bridge, Static IP, LAN/WLAN binding, Remote)
- Multi-OLT Profile Manager
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from core.telnet_client import TelnetClient
from config.olt_config import OLTConfig
from config.olt_profile_manager import OLTProfileManager, OLTProfile


class OLTCompleteMenu:
    """Interactive menu untuk semua fitur OLT"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
        self.profile_manager = OLTProfileManager()
        
        # Import managers
        from olt_config_manager import OLTConfigManager
        from olt_system_manager import OLTSystemManager
        from onu_config_manager import ONUConfigManager
        from onu_register_wizard import ONURegistrationWizard
        
        self.config_mgr = OLTConfigManager(client)
        self.system_mgr = OLTSystemManager(client)
        self.onu_mgr = ONUConfigManager(client)
        self.register_wizard = ONURegistrationWizard(client)
    
    def clear_screen(self):
        """Clear terminal screen"""
        os.system('cls' if os.name == 'nt' else 'clear')
    
    def print_header(self, title: str):
        """Print section header"""
        print("\n" + "=" * 60)
        print(f"  {title}")
        print("=" * 60)
    
    def input_int(self, prompt: str, default: int = None, min_val: int = None, max_val: int = None) -> int:
        """Input integer dengan validasi"""
        while True:
            try:
                if default is not None:
                    val = input(f"{prompt} [{default}]: ").strip()
                    if not val:
                        return default
                else:
                    val = input(f"{prompt}: ").strip()
                
                num = int(val)
                if min_val is not None and num < min_val:
                    print(f"  Nilai minimum adalah {min_val}")
                    continue
                if max_val is not None and num > max_val:
                    print(f"  Nilai maksimum adalah {max_val}")
                    continue
                return num
            except ValueError:
                if default is not None:
                    return default
                print("  Input harus berupa angka")
    
    def press_enter(self):
        """Wait for Enter key"""
        input("\nTekan Enter untuk melanjutkan...")
    
    # ==================== MAIN MENU ====================
    
    def main_menu(self):
        """Main menu utama"""
        while True:
            active_profile = self.profile_manager.get_active_profile()
            profile_info = f"Current OLT: {active_profile.name} ({active_profile.host})" if active_profile else "No active OLT"
            
            self.print_header("OLT ZTE C320 - COMPLETE MANAGEMENT")
            print(f"\n  {profile_info}\n")
            print("""
    =================== OLT SELECTION =====================
    0. Switch OLT / Manage OLT Profiles
    
    ===================== ONU MANAGEMENT =====================
    1. Show Unconfigured ONU
    2. ONU Register Wizard (Register & Configure)
    3. Show ONU Status (All Ports)
    4. ONU Configuration (PPPOE, Bridge, Static IP)
    5. ONU OMCI Configuration (LAN/WLAN Binding)
    6. Delete ONU Configuration & Unregister
    
    =================== PROFILE & VLAN ====================
    7. Profile Management (TCONT, Traffic, Line, Service)
    8. VLAN Management
    9. Uplink Interface Management
    
    =================== SYSTEM CONFIG =====================
    10. SNMP Management
    11. TR-069/ACS Configuration
    12. NTP & Time Configuration
    13. User Management
    14. System Information & Alarms
    
    ====================== UTILITY ========================
    15. Sync ONU Data (Refresh All)
    16. Save Configuration
    17. Show Running Config
    
    99. Exit
            """)
            
            choice = input("Pilih menu [0-17,99]: ").strip()
            
            if choice == '0':
                self.olt_profile_menu()
            elif choice == '1':
                self.show_unconfigured_onus()
            elif choice == '2':
                self.register_wizard.main_menu()
            elif choice == '3':
                self.show_all_onu_status()
            elif choice == '4':
                self.onu_config_menu()
            elif choice == '5':
                self.onu_omci_menu()
            elif choice == '6':
                self.delete_onu_menu()
            elif choice == '7':
                self.profile_menu()
            elif choice == '8':
                self.vlan_menu()
            elif choice == '9':
                self.uplink_menu()
            elif choice == '10':
                self.snmp_menu()
            elif choice == '11':
                self.tr069_menu()
            elif choice == '12':
                self.ntp_menu()
            elif choice == '13':
                self.user_menu()
            elif choice == '14':
                self.system_info_menu()
            elif choice == '15':
                self.sync_onu_data()
            elif choice == '16':
                self.save_config()
            elif choice == '17':
                self.show_running_config()
            elif choice == '99':
                print("\nKeluar dari program...")
                break
    
    # ==================== ONU STATUS ====================
    
    def show_all_onu_status(self):
        """Show status ONU dari semua PON ports dengan data lengkap"""
        self.print_header("ONU STATUS - ALL PORTS")
        
        print("\n  Pilih mode tampilan:")
        print("    [1] Pilih PON Port - Scan port tertentu (rekomendasi)")
        print("    [2] Ringkas - Scan cepat semua port")
        print("    [3] Lengkap - Dengan optical power (lebih lambat)")
        
        mode = input("\n  Pilih mode [1/2/3]: ").strip()
        
        # Option 1: Select specific PON port
        if mode == '1':
            self.show_onu_status_by_port()
            return
        
        # Option 1: Select specific PON port
        if mode == '1':
            self.show_onu_status_by_port()
            return
        
        print(f"\nScanning 16 PON ports (1/1/1 - 1/1/16)...\n")
        
        total_onu = 0
        working = 0
        offline = 0
        all_onus = []
        
        for port in range(1, 17):
            pon_port = f"1/1/{port}"
            print(f"  Scanning PON {pon_port}...", end='\r')
            
            cmd = f"show gpon onu state gpon-olt_{pon_port}"
            success, output = self.client.execute_command(cmd, timeout=5)
            
            if not success or 'Invalid' in output or 'error' in output.lower():
                continue
            
            # Get optical power if full mode
            power_data = {}
            tx_power = None
            
            if mode == '3':  # Full mode (dulu '2')
                # Get OLT Tx power
                tx_cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
                tx_success, tx_output = self.client.execute_command(tx_cmd, timeout=10)
                if tx_success and tx_output:
                    for line in tx_output.replace('\r\n', '\n').split('\n'):
                        line = line.strip()
                        if '(gpon)' in line.lower() and 'dbm' in line.lower():
                            parts = line.split()
                            if len(parts) >= 2:
                                power_str = parts[1].replace('(dbm)', '').replace('dbm', '').strip()
                                try:
                                    tx_power = float(power_str)
                                except:
                                    pass
                
                # Get Rx power
                power_cmd = f"show pon power onu-rx gpon-olt_{pon_port}"
                power_success, power_output = self.client.execute_command(power_cmd, timeout=10)
                if power_success and power_output:
                    for line in power_output.replace('\r\n', '\n').split('\n'):
                        line = line.strip()
                        if 'gpon-onu_' in line and 'dbm' in line.lower():
                            parts = line.split()
                            if len(parts) >= 2:
                                onu_if = parts[0].replace('gpon-onu_', '')
                                power_data[onu_if] = parts[1]
            
            # Parse output
            for line in output.replace('\r\n', '\n').split('\n'):
                line = line.strip()
                if ':' in line and not line.startswith('---') and 'OnuIndex' not in line:
                    parts = line.split()
                    if len(parts) >= 4:
                        # Parse ONU interface to extract only ONU ID number
                        onu_if = parts[0]  # e.g., "gpon-onu_1/1/1:1" or "1/1/1:1" or just "1"
                        
                        # Extract ONU ID: if format is "x/x/x:N" or "gpon-onu_x/x/x:N", get the N
                        if ':' in onu_if:
                            onu_id = onu_if.split(':')[-1]  # Get last part after ':'
                        else:
                            onu_id = onu_if  # Already just the ID
                        
                        admin_state = parts[1] if len(parts) > 1 else 'unknown'
                        omcc_state = parts[2] if len(parts) > 2 else 'unknown'
                        phase_state = parts[3] if len(parts) > 3 else 'unknown'
                        
                        is_working = 'working' in phase_state.lower()
                        if is_working:
                            working += 1
                            status = "✓"
                        else:
                            offline += 1
                            status = "✗"
                        
                        # Store with full path as key for power lookup
                        onu_key = f"{pon_port}:{onu_id}"
                        rx_power = power_data.get(onu_key, '-') if mode == '3' else '-'
                        
                        # Calculate attenuation if we have both Tx and Rx
                        attenuation_str = '-'
                        attenuation_indicator = '-'
                        if mode == '3' and tx_power is not None and rx_power != '-':
                            try:
                                rx_str = rx_power.replace('(dbm)', '').replace('dbm', '').strip()
                                rx_val = float(rx_str)
                                attenuation = tx_power - rx_val
                                attenuation_str = f"{attenuation:.1f} dB"
                                
                                # Status indicator
                                if attenuation < 20:
                                    attenuation_indicator = '✓'
                                elif attenuation < 25:
                                    attenuation_indicator = '○'
                                elif attenuation < 28:
                                    attenuation_indicator = '△'
                                else:
                                    attenuation_indicator = '✗'
                            except:
                                pass
                        
                        all_onus.append({
                            'pon_port': pon_port,
                            'onu_id': onu_id,
                            'admin': admin_state,
                            'omcc': omcc_state,
                            'phase': phase_state,
                            'status': status,
                            'rx_power': rx_power,
                            'attenuation': attenuation_str,
                            'attenuation_indicator': attenuation_indicator
                        })
                        total_onu += 1
        
        # Clear scanning message
        print(" " * 40)
        
        if not all_onus:
            print("  Tidak ada ONU ditemukan.")
            self.press_enter()
            return
        
        # Display results
        self.clear_screen()
        self.print_header("ONU STATUS - ALL PORTS")
        
        if mode == '3':
            print(f"\n  " + "=" * 120)
            print(f"  {'No':>3} | {'PON Port':<10} | {'ONU ID':<12} | {'Admin':<8} | {'Phase':<10} | {'Rx Power':<15} | {'Redaman':<15} | {'St':<3}")
            print(f"  " + "=" * 120)
            
            for i, onu in enumerate(all_onus, 1):
                redaman_display = f"{onu['attenuation']} {onu['attenuation_indicator']}"
                print(f"  {i:>3} | {onu['pon_port']:<10} | {onu['onu_id']:<12} | {onu['admin']:<8} | {onu['phase']:<10} | {onu['rx_power']:<15} | {redaman_display:<15} | {onu['status']:<3}")
            
            print(f"  " + "=" * 120)
            print("\n  KETERANGAN REDAMAN: ✓ Good (<20dB) | ○ Fair (20-25dB) | △ Poor (25-28dB) | ✗ Critical (>28dB)")
        else:
            print(f"\n  " + "=" * 80)
            print(f"  {'No':>3} | {'PON Port':<10} | {'ONU ID':<12} | {'Admin':<8} | {'OMCC':<8} | {'Phase':<10} | {'St':<3}")
            print(f"  " + "=" * 80)
            
            for i, onu in enumerate(all_onus, 1):
                print(f"  {i:>3} | {onu['pon_port']:<10} | {onu['onu_id']:<12} | {onu['admin']:<8} | {onu['omcc']:<8} | {onu['phase']:<10} | {onu['status']:<3}")
        
        print(f"\n  " + "=" * 60)
        print(f"  SUMMARY: Total={total_onu}, Working={working} ✓, Offline={offline} ✗")
        print(f"  " + "=" * 60)
        
        # Option to view detail
        choice = input("\n  Masukkan nomor untuk detail ONU [0 = kembali]: ").strip()
        
        if choice != '0':
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(all_onus):
                    # Build full ONU ID path
                    pon_port = all_onus[idx]['pon_port']  # e.g., "1/1/1"
                    onu_num = all_onus[idx]['onu_id']      # e.g., "1"
                    onu_id = f"{pon_port}:{onu_num}"       # Result: "1/1/1:1"
                    # Use full detail function from register wizard
                    self.register_wizard.show_onu_detail_full(onu_id)
            except:
                pass
        
        self.press_enter()
    
    def show_onu_detail_info(self, onu_id: str):
        """Show detail info untuk satu ONU dengan running config"""
        print(f"\n  Mengambil detail ONU {onu_id}...")
        
        # Get detail info
        cmd = f"show gpon onu detail-info gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        onu_state = ""
        detail_info = {}
        
        if success and output:
            print("\n  " + "=" * 60)
            print(f"  DETAIL ONU: {onu_id}")
            print("  " + "=" * 60)
            
            for line in output.replace('\r\n', '\n').split('\n'):
                line = line.strip()
                if line and ':' in line and not line.startswith('---'):
                    # Extract key info
                    if 'Name:' in line:
                        detail_info['name'] = line.split(':', 1)[1].strip()
                    elif 'Type:' in line:
                        detail_info['type'] = line.split(':', 1)[1].strip()
                    elif 'State:' in line and 'Config' not in line and 'Phase' not in line:
                        onu_state = line.split(':', 1)[1].strip().lower()
                        detail_info['state'] = onu_state
                    elif 'Serial number:' in line:
                        detail_info['sn'] = line.split(':', 1)[1].strip()
                    elif 'Password:' in line:
                        detail_info['password'] = line.split(':', 1)[1].strip()
                    elif 'Description:' in line:
                        detail_info['description'] = line.split(':', 1)[1].strip()
                    elif 'Distance:' in line:
                        detail_info['distance'] = line.split(':', 1)[1].strip()
                    elif 'Online duration:' in line:
                        detail_info['online_duration'] = line.split(':', 1)[1].strip()
                    elif 'Last down cause:' in line:
                        detail_info['last_down'] = line.split(':', 1)[1].strip()
                    elif 'Last up time:' in line:
                        detail_info['last_up'] = line.split(':', 1)[1].strip()
                    elif 'Last down time:' in line:
                        detail_info['last_down_time'] = line.split(':', 1)[1].strip()
                    
                    # Print important lines
                    if any(k in line.lower() for k in ['name', 'type', 'state', 'serial', 'description', 
                                                        'distance', 'online', 'password', 'auth', 
                                                        'last down', 'last up']):
                        print(f"  {line}")
            
            print("  " + "-" * 60)
        
        # Get equipment info
        cmd = f"show gpon remote-onu equip gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        if success and output:
            print("\n  EQUIPMENT INFO:")
            for line in output.replace('\r\n', '\n').split('\n'):
                line = line.strip()
                if line and ':' in line:
                    if any(k in line.lower() for k in ['vendor', 'model', 'equipment', 'version', 
                                                        'uptime', 'sn', 'memory', 'cpu', 'hardware', 'software']):
                        print(f"    {line}")
            print("  " + "-" * 60)
        
        # Get optical power
        cmd = f"show pon power onu-rx gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if success and output:
            print("\n  OPTICAL POWER:")
            for line in output.replace('\r\n', '\n').split('\n'):
                line = line.strip()
                if line and ('dbm' in line.lower() or 'power' in line.lower() or 'rx' in line.lower()):
                    if not line.startswith('---') and not line.startswith('==='):
                        print(f"    {line}")
            print("  " + "-" * 60)
        
        # Get running config if ONU is working
        if onu_state == 'working':
            print("\n  RUNNING CONFIGURATION:")
            cmd = f"show running-config interface gpon-onu_{onu_id}"
            success, output = self.client.execute_command(cmd, timeout=15)
            
            if success and output:
                # Parse important config
                vlans = []
                pppoe_configs = []
                ssids = []
                eth_ports = []
                tr069_enabled = False
                
                for line in output.replace('\r\n', '\n').split('\n'):
                    line = line.strip()
                    
                    # VLAN services
                    if line.startswith('service ') and 'vlan' in line.lower():
                        vlans.append(line)
                    
                    # PPPoE
                    elif line.startswith('pppoe '):
                        pppoe_configs.append(line)
                    
                    # SSID
                    elif 'ssid ctrl' in line or 'ssid auth' in line:
                        ssids.append(line)
                    
                    # ETH ports
                    elif line.startswith('vlan port eth_'):
                        eth_ports.append(line)
                    
                    # TR069
                    elif 'tr069' in line.lower():
                        tr069_enabled = True
                
                if vlans:
                    print("\n    VLANs:")
                    for vlan in vlans:
                        print(f"      • {vlan}")
                
                if pppoe_configs:
                    print("\n    PPPoE:")
                    for pppoe in pppoe_configs:
                        print(f"      • {pppoe}")
                
                if ssids:
                    print("\n    WiFi SSIDs:")
                    for ssid in ssids:
                        print(f"      • {ssid}")
                
                if eth_ports:
                    print("\n    ETH Ports:")
                    for port in eth_ports:
                        print(f"      • {port}")
                
                if tr069_enabled:
                    print("\n    TR069: Enabled")
                
                print("  " + "-" * 60)
            else:
                print("    (No configuration found)")
        elif onu_state:
            print(f"\n  ONU State: {onu_state.upper()} - Running config only shown for working ONUs")
        
        print("  " + "=" * 60)
    
    def show_onu_status_by_port(self):
        """Show ONU status for selected PON port - sama dengan bot"""
        self.print_header("ONU STATUS - SELECT PON PORT")
        
        print("\n  PON Port Selection (1-16):")
        print("\n  Port 1-4:   ", end="")
        for i in range(1, 5):
            print(f"[{i}]  ", end="")
        print("\n  Port 5-8:   ", end="")
        for i in range(5, 9):
            print(f"[{i}]  ", end="")
        print("\n  Port 9-12:  ", end="")
        for i in range(9, 13):
            print(f"[{i}]  ", end="")
        print("\n  Port 13-16: ", end="")
        for i in range(13, 17):
            print(f"[{i}]  ", end="")
        
        port_choice = input("\n\n  Pilih PON Port [1-16, 0=batal]: ").strip()
        
        if port_choice == '0':
            return
        
        try:
            port = int(port_choice)
            if port < 1 or port > 16:
                print("\n  ❌ Port tidak valid. Harus 1-16.")
                self.press_enter()
                return
        except ValueError:
            print("\n  ❌ Input tidak valid.")
            self.press_enter()
            return
        
        # Sub menu for scan mode
        print(f"\n  PON Port 1/1/{port} - Pilih mode scan:")
        print(f"    [1] Quick Scan - Scan cepat")
        print(f"    [2] Full Scan - Dengan optical power")
        
        mode = input("\n  Pilih mode [1/2]: ").strip()
        
        if mode not in ['1', '2']:
            print("\n  ❌ Mode tidak valid.")
            self.press_enter()
            return
        
        # Execute scan
        pon_port = f"1/1/{port}"
        print(f"\n  Scanning PON port {pon_port}...")
        
        cmd = f"show gpon onu state gpon-olt_{pon_port}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if not success or 'Invalid' in output or 'error' in output.lower():
            print(f"\n  ❌ Failed to scan port {pon_port}")
            self.press_enter()
            return
        
        # Get optical power if full mode
        power_data = {}
        tx_power = None
        
        if mode == '2':
            # Get OLT Tx power
            tx_cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
            tx_success, tx_output = self.client.execute_command(tx_cmd, timeout=10)
            if tx_success and tx_output:
                for line in tx_output.replace('\r\n', '\n').split('\n'):
                    line = line.strip()
                    if '(gpon)' in line.lower() and 'dbm' in line.lower():
                        parts = line.split()
                        if len(parts) >= 2:
                            power_str = parts[1].replace('(dbm)', '').replace('dbm', '').strip()
                            try:
                                tx_power = float(power_str)
                            except:
                                pass
            
            # Get Rx power
            power_cmd = f"show pon power onu-rx gpon-olt_{pon_port}"
            power_success, power_output = self.client.execute_command(power_cmd, timeout=10)
            if power_success and power_output:
                for line in power_output.replace('\r\n', '\n').split('\n'):
                    line = line.strip()
                    if 'gpon-onu_' in line and 'dbm' in line.lower():
                        parts = line.split()
                        if len(parts) >= 2:
                            onu_if = parts[0].replace('gpon-onu_', '')
                            power_data[onu_if] = parts[1]
            
            # Get ONU names from running-config
            print(f"  Fetching ONU names...")
        
        # Parse ONU list
        working = 0
        offline = 0
        port_onus = []
        
        for line in output.replace('\r\n', '\n').split('\n'):
            line = line.strip()
            if ':' in line and not line.startswith('---') and 'OnuIndex' not in line:
                parts = line.split()
                if len(parts) >= 4:
                    # Parse ONU interface to extract only ONU ID number
                    onu_if = parts[0]  # e.g., "gpon-onu_1/1/1:1" or "1/1/1:1" or just "1"
                    
                    # Extract ONU ID: if format is "x/x/x:N" or "gpon-onu_x/x/x:N", get the N
                    if ':' in onu_if:
                        onu_id = onu_if.split(':')[-1]  # Get last part after ':'
                    else:
                        onu_id = onu_if  # Already just the ID
                    
                    admin_state = parts[1] if len(parts) > 1 else 'unknown'
                    omcc_state = parts[2] if len(parts) > 2 else 'unknown'
                    phase_state = parts[3] if len(parts) > 3 else 'unknown'
                    
                    is_working = 'working' in phase_state.lower()
                    if is_working:
                        working += 1
                        status = "✓"
                    else:
                        offline += 1
                        status = "✗"
                    
                    # Get ONU name if full mode
                    name = '-'
                    if mode == '2' and is_working:
                        # Use the full interface path for querying
                        full_onu_path = f"1/1/{port}:{onu_id}"
                        name_cmd = f"show running-config interface gpon-onu_{full_onu_path}"
                        name_success, name_output = self.client.execute_command(name_cmd, timeout=5)
                        if name_success and name_output:
                            for name_line in name_output.replace('\r\n', '\n').split('\n'):
                                if 'name ' in name_line and 'interface gpon-onu' in name_line:
                                    name_parts = name_line.split('name ')
                                    if len(name_parts) > 1:
                                        name = name_parts[1].strip()
                                        break
                    
                    # Store parsed data with ONU ID as key for power lookup
                    onu_key = f"1/1/{port}:{onu_id}"  # Full path for power data lookup
                    rx_power = power_data.get(onu_key, '-') if mode == '2' else '-'
                    
                    # Calculate attenuation
                    attenuation_str = '-'
                    attenuation_indicator = '-'
                    if mode == '2' and tx_power is not None and rx_power != '-':
                        try:
                            rx_str = rx_power.replace('(dbm)', '').replace('dbm', '').strip()
                            rx_val = float(rx_str)
                            attenuation = tx_power - rx_val
                            attenuation_str = f"{attenuation:.1f}"
                            
                            # Status indicator
                            if attenuation < 20:
                                attenuation_indicator = '✓'
                            elif attenuation < 25:
                                attenuation_indicator = '○'
                            elif attenuation < 28:
                                attenuation_indicator = '△'
                            else:
                                attenuation_indicator = '✗'
                        except:
                            pass
                    
                    port_onus.append({
                        'id': onu_id,
                        'admin': admin_state,
                        'omcc': omcc_state,
                        'phase': phase_state,
                        'status': status,
                        'name': name,
                        'rx': rx_power,
                        'atten': attenuation_str,
                        'atten_indicator': attenuation_indicator
                    })
        
        # Display results
        self.clear_screen()
        self.print_header(f"ONU STATUS - PON Port 1/1/{port}")
        
        if not port_onus:
            print(f"\n  Tidak ada ONU ditemukan pada port {pon_port}")
            self.press_enter()
            return
        
        if mode == '2':
            print(f"\n  " + "=" * 100)
            print(f"  {'No':>3} | {'ID':<4} | {'Name':<25} | {'Phase':<10} | {'RxPwr':<10} | {'Att':<8} | {'St':<3}")
            print(f"  " + "=" * 100)
            
            for i, onu in enumerate(port_onus, 1):
                name_display = onu['name'][:23] if onu['name'] != '-' else '-'
                atten_display = f"{onu['atten']}{onu['atten_indicator']}" if onu['atten'] != '-' else '-'
                print(f"  {i:>3} | {onu['id']:<4} | {name_display:<25} | {onu['phase']:<10} | {onu['rx']:<10} | {atten_display:<8} | {onu['status']:<3}")
            
            print(f"  " + "=" * 100)
            
            # Calculate average attenuation
            atten_values = []
            for onu in port_onus:
                if onu['atten'] != '-':
                    try:
                        atten_values.append(float(onu['atten']))
                    except:
                        pass
            
            if atten_values:
                avg_atten = sum(atten_values) / len(atten_values)
                print(f"\n  Average Attenuation: {avg_atten:.1f} dB")
                if avg_atten < 20:
                    print(f"  Quality: ✓ Excellent")
                elif avg_atten < 25:
                    print(f"  Quality: ○ Good")
                elif avg_atten < 28:
                    print(f"  Quality: △ Fair")
                else:
                    print(f"  Quality: ✗ Poor")
        else:
            print(f"\n  " + "=" * 80)
            print(f"  {'No':>3} | {'ID':<4} | {'Admin':<8} | {'OMCC':<8} | {'Phase':<10} | {'St':<3}")
            print(f"  " + "=" * 80)
            
            for i, onu in enumerate(port_onus, 1):
                print(f"  {i:>3} | {onu['id']:<4} | {onu['admin']:<8} | {onu['omcc']:<8} | {onu['phase']:<10} | {onu['status']:<3}")
        
        print(f"\n  " + "=" * 60)
        print(f"  Port 1/1/{port}: Total={len(port_onus)}, Working={working} ✓, Offline={offline} ✗")
        print(f"  " + "=" * 60)
        
        # Option to view ONU detail
        if port_onus:
            choice = input("\n  Masukkan nomor untuk detail ONU [0 = kembali]: ").strip()
            
            if choice != '0':
                try:
                    idx = int(choice) - 1
                    if 0 <= idx < len(port_onus):
                        onu_id = f"1/1/{port}:{port_onus[idx]['id']}"
                        self.register_wizard.show_onu_detail_full(onu_id)
                except:
                    pass
        
        self.press_enter()
    
    def show_unconfigured_onus(self):
        """Show unconfigured ONUs"""
        self.print_header("UNCONFIGURED ONUs")
        print("\nMengambil daftar ONU yang belum terdaftar...\n")
        
        onus = []
        output_found = ""
        
        # Command 1: show gpon onu uncfg
        # Format: gpon-onu_1/1/1:1  HWTC1F14CAAD  unknown
        success, output = self.client.execute_command("show gpon onu uncfg", timeout=15)
        if success and output:
            output_found = output
            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                # Match gpon-onu_X/X/X:Y format
                if 'gpon-onu' in line.lower() and ':' in line and not line.startswith('-'):
                    parts = line.split()
                    if len(parts) >= 2:
                        onu_index = parts[0]  # gpon-onu_1/1/1:1
                        sn = parts[1] if len(parts) > 1 else 'Unknown'
                        
                        # Extract PON port from gpon-onu_1/1/1:1
                        if '_' in onu_index and ':' in onu_index:
                            port_part = onu_index.split('_')[1]  # 1/1/1:1
                            pon_port = port_part.split(':')[0]   # 1/1/1
                        else:
                            pon_port = onu_index
                        
                        onu_info = {
                            'onu_index': onu_index,
                            'pon_port': pon_port,
                            'sn': sn,
                            'model': '',
                            'password': '',
                        }
                        onus.append(onu_info)
        
        # If no results, try Command 2: show pon onu uncfg
        # Format: gpon-olt_1/1/1  EG8041V5  HWTC1F14CAAD  GD824CDF3
        if not onus:
            success2, output2 = self.client.execute_command("show pon onu uncfg", timeout=15)
            if success2 and output2:
                output_found = output2
                lines = output2.split('\n')
                for line in lines:
                    line = line.strip()
                    if 'gpon-olt' in line.lower() and not line.startswith('-'):
                        parts = line.split()
                        if len(parts) >= 3:
                            olt_index = parts[0]  # gpon-olt_1/1/1
                            model = parts[1] if len(parts) > 1 else ''
                            sn = parts[2] if len(parts) > 2 else 'Unknown'
                            password = parts[3] if len(parts) > 3 else ''
                            
                            # Extract PON port from gpon-olt_1/1/1
                            if '_' in olt_index:
                                pon_port = olt_index.split('_')[1]
                            else:
                                pon_port = olt_index
                            
                            onu_info = {
                                'onu_index': olt_index,
                                'pon_port': pon_port,
                                'sn': sn,
                                'model': model,
                                'password': password,
                            }
                            onus.append(onu_info)
        
        # Display results
        if onus:
            print(f"  {'No':<4} {'PON Port':<12} {'Serial Number':<18} {'Model':<15} {'Password'}")
            print(f"  {'-'*70}")
            for i, onu in enumerate(onus, 1):
                print(f"  {i:<4} {onu['pon_port']:<12} {onu['sn']:<18} {onu.get('model',''):<15} {onu.get('password','')}")
            
            print(f"\n  {'='*50}")
            print(f"  TOTAL UNCONFIGURED: {len(onus)}")
            print(f"  {'='*50}")
        else:
            print("  ✅ Tidak ada ONU unconfigured")
            if output_found:
                print(f"\n  Raw output:\n{output_found}")
        
        self.press_enter()
    
    # ==================== PROFILE MENU ====================
    
    def profile_menu(self):
        """Menu profile management"""
        while True:
            self.print_header("PROFILE MANAGEMENT")
            print("""
    ================ TCONT PROFILE ================
    1. TCONT Profile - Show
    2. TCONT Profile - Add
    3. TCONT Profile - Delete
    
    ============== TRAFFIC PROFILE ================
    4. Traffic Profile - Show
    5. Traffic Profile - Add
    6. Traffic Profile - Delete
    
    =============== LINE PROFILE ==================
    7. Line Profile - Show
    8. Line Profile - Add
    9. Line Profile - Delete
    
    ============= SERVICE PROFILE =================
    10. Service Profile - Show
    11. Service Profile - Add
    12. Service Profile - Delete
    
    ================ ONU TYPES ====================
    13. ONU Types - Show
    14. ONU Type - Add (Live Update)
    15. ONU Type - Delete (Live Update)
    
    Note: Add/Delete ONU type langsung efektif di running-config.
          Gunakan menu "Save Configuration" untuk menyimpan permanen.
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-15]: ").strip()
            
            if choice == '1':
                print(self.config_mgr.show_tcont_profiles())
                self.press_enter()
            elif choice == '2':
                name = input("Nama TCONT Profile: ").strip()
                if name:
                    max_bw = self.input_int("Maximum Bandwidth (kbps, default 51200): ", 51200)
                    type_id = self.input_int("Type (1-5, default 4): ", 4)
                    assured = self.input_int("Assured bandwidth (optional, 0 for none): ", 0) or None
                    success, msg = self.config_mgr.add_tcont_profile(name, max_bw, type_id, assured)
                    print(msg)
                self.press_enter()
            elif choice == '3':
                name = input("Nama TCONT Profile untuk dihapus: ").strip()
                if name:
                    confirm = input(f"Hapus '{name}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.config_mgr.delete_tcont_profile(name)
                        print(msg)
                self.press_enter()
            elif choice == '4':
                print(self.config_mgr.show_traffic_profiles())
                self.press_enter()
            elif choice == '5':
                name = input("Nama Traffic Profile: ").strip()
                if name:
                    pir = self.input_int("PIR (Peak Rate) kbps (default 10240): ", 10240)
                    sir = self.input_int("SIR (Sustained Rate) kbps (optional): ", 0) or None
                    success, msg = self.config_mgr.add_traffic_profile(name, pir, sir)
                    print(msg)
                self.press_enter()
            elif choice == '6':
                name = input("Nama Traffic Profile untuk dihapus: ").strip()
                if name:
                    confirm = input(f"Hapus '{name}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.config_mgr.delete_traffic_profile(name)
                        print(msg)
                self.press_enter()
            elif choice == '7':
                print(self.config_mgr.show_line_profiles())
                self.press_enter()
            elif choice == '8':
                # Add Line Profile
                print("\n--- Add Line Profile ---")
                name = input("Nama Line Profile: ").strip()
                if name:
                    tcont = input("TCONT Profile: ").strip()
                    gemport = self.input_int("Gemport (default 1): ", 1)
                    vlan = self.input_int("VLAN ID: ", 100)
                    if tcont:
                        success, msg = self.config_mgr.add_line_profile(name, tcont, gemport, vlan)
                        print(msg)
                self.press_enter()
            elif choice == '9':
                # Delete Line Profile
                name = input("Nama Line Profile untuk dihapus: ").strip()
                if name:
                    confirm = input(f"Hapus '{name}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.config_mgr.delete_line_profile(name)
                        print(msg)
                self.press_enter()
            elif choice == '10':
                print(self.config_mgr.show_service_profiles())
                self.press_enter()
            elif choice == '11':
                # Add Service Profile
                print("\n--- Add Service Profile ---")
                name = input("Nama Service Profile: ").strip()
                if name:
                    print("Port Type: eth, pots, veip")
                    port_type = input("Port Type (default eth): ").strip() or "eth"
                    port_count = self.input_int("Port Count (default 4): ", 4)
                    success, msg = self.config_mgr.add_service_profile(name, port_type, port_count)
                    print(msg)
                self.press_enter()
            elif choice == '12':
                # Delete Service Profile
                name = input("Nama Service Profile untuk dihapus: ").strip()
                if name:
                    confirm = input(f"Hapus '{name}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.config_mgr.delete_service_profile(name)
                        print(msg)
                self.press_enter()
            elif choice == '13':
                print(self.config_mgr.show_onu_types())
                self.press_enter()
            elif choice == '14':
                # Add ONU Type
                print("\n--- Add ONU Type ---")
                print("Note: Perubahan akan langsung efektif tanpa perlu reload.")
                name = input("\nNama ONU Type (1-64 karakter): ").strip()
                if name:
                    desc = input("Description (optional): ").strip() or None
                    max_tcont = self.input_int("Max T-CONT (default 8): ", 8)
                    max_gemport = self.input_int("Max GEM port (default 32): ", 32)
                    max_switch = self.input_int("Max switch per slot (default 8): ", 8)
                    max_flow = self.input_int("Max flow per switch (default 32): ", 32)
                    max_iphost = self.input_int("Max IP host (default 16): ", 16)
                    
                    # Ask for auto-save
                    auto_save_input = input("\nSave configuration otomatis? (y/n, default n): ").strip().lower()
                    auto_save = auto_save_input == 'y'
                    
                    success, msg = self.config_mgr.add_onu_type(
                        name, desc, max_tcont, max_gemport, 
                        max_switch, max_flow, max_iphost, auto_save
                    )
                    print(msg)
                self.press_enter()
            elif choice == '15':
                # Delete ONU Type
                print("\n--- Delete ONU Type ---")
                print("Note: Perubahan akan langsung efektif tanpa perlu reload.\n")
                print(self.config_mgr.show_onu_types())
                name = input("\nNama ONU Type untuk dihapus: ").strip()
                if name:
                    confirm = input(f"Hapus ONU type '{name}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        # Ask for auto-save
                        auto_save_input = input("Save configuration otomatis? (y/n, default n): ").strip().lower()
                        auto_save = auto_save_input == 'y'
                        
                        success, msg = self.config_mgr.delete_onu_type(name, auto_save)
                        print(msg)
                        
                        if success:
                            print("\n✅ ONU type berhasil dihapus dari running-config.")
                            if auto_save:
                                print("✅ Configuration telah disimpan ke startup-config.")
                            else:
                                print("⚠️  Jangan lupa save configuration manual jika ingin permanen.")
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== VLAN MENU ====================
    
    def vlan_menu(self):
        """Menu VLAN management"""
        while True:
            self.print_header("VLAN MANAGEMENT")
            print("""
    1. Show VLANs
    2. Add VLAN
    3. Delete VLAN
    4. Uplink VLAN Configuration
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-4]: ").strip()
            
            if choice == '1':
                print(self.config_mgr.show_vlans())
                self.press_enter()
            elif choice == '2':
                vlan_id = self.input_int("VLAN ID: ")
                if vlan_id:
                    name = input("VLAN Name (optional): ").strip() or None
                    success, msg = self.config_mgr.add_vlan(vlan_id, name)
                    print(msg)
                self.press_enter()
            elif choice == '3':
                vlan_id = self.input_int("VLAN ID untuk dihapus: ")
                if vlan_id:
                    confirm = input(f"Hapus VLAN {vlan_id}? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.config_mgr.delete_vlan(vlan_id)
                        print(msg)
                self.press_enter()
            elif choice == '4':
                self.uplink_vlan_config_wizard()
            elif choice == '0':
                break
    
    # ==================== UPLINK MENU ====================
    
    def uplink_menu(self):
        """Menu uplink interface"""
        while True:
            self.print_header("UPLINK INTERFACE MANAGEMENT")
            print("""
    1. Show Uplink Interfaces
    2. Show Interface Status
    3. Configure VLAN on Uplink
    4. Delete VLAN from Uplink
    5. Shutdown Interface
    6. Enable Interface
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-6]: ").strip()
            
            if choice == '1':
                print(self.config_mgr.show_uplink_interfaces())
                self.press_enter()
            elif choice == '2':
                iface = input("Interface (kosong untuk semua): ").strip() or None
                print(self.system_mgr.show_interface_status(iface))
                self.press_enter()
            elif choice == '3':
                self.uplink_vlan_config_wizard()
            elif choice == '4':
                self.uplink_vlan_delete_wizard()
            elif choice == '5':
                self.uplink_shutdown_wizard()
            elif choice == '6':
                self.uplink_enable_wizard()
            elif choice == '0':
                break
    
    def uplink_vlan_config_wizard(self):
        """Wizard untuk configure VLAN pada uplink interface"""
        print("\n=== Configure VLAN on Uplink Interface ===\n")
        
        # Get available interfaces
        interfaces = self.config_mgr.get_uplink_interfaces_list()
        
        if not interfaces:
            print("Tidak dapat menemukan uplink interfaces.")
            self.press_enter()
            return
        
        # Display available interfaces
        print("Available Uplink Interfaces:")
        for idx, iface in enumerate(interfaces, 1):
            # Show interface config
            config = self.config_mgr.show_uplink_config(iface)
            status = "Configured" if "switchport" in config else "Not configured"
            print(f"  [{idx}] {iface} - {status}")
        
        print(f"  [0] Input manual")
        
        # Select interface
        try:
            choice = int(input(f"\nPilih interface [0-{len(interfaces)}]: ").strip())
            if choice == 0:
                interface = input("Interface name (e.g., gei_1/3/1): ").strip()
            elif 1 <= choice <= len(interfaces):
                interface = interfaces[choice - 1]
            else:
                print("Pilihan tidak valid")
                self.press_enter()
                return
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        if not interface:
            print("Interface tidak boleh kosong")
            self.press_enter()
            return
        
        # Input VLAN ID
        try:
            vlan_id = int(input("VLAN ID: ").strip())
        except ValueError:
            print("VLAN ID harus angka")
            self.press_enter()
            return
        
        # Select mode
        print("\nMode:")
        print("  1. Trunk (Tagged)")
        print("  2. Access (Untagged)")
        mode_choice = input("Pilih mode [1-2]: ").strip()
        mode = "trunk" if mode_choice == "1" else "access"
        
        # Configure
        success, msg = self.config_mgr.configure_uplink_vlan(interface, vlan_id, mode)
        print(f"\n{'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    def uplink_vlan_delete_wizard(self):
        """Wizard untuk delete VLAN dari uplink interface"""
        print("\n=== Delete VLAN from Uplink Interface ===\n")
        
        # Get available interfaces
        interfaces = self.config_mgr.get_uplink_interfaces_list()
        
        if not interfaces:
            print("Tidak dapat menemukan uplink interfaces.")
            self.press_enter()
            return
        
        # Display configured interfaces
        print("Available Uplink Interfaces:")
        for idx, iface in enumerate(interfaces, 1):
            config = self.config_mgr.show_uplink_config(iface)
            # Extract VLANs if configured
            if "switchport vlan" in config:
                print(f"  [{idx}] {iface} - Configured")
            else:
                print(f"  [{idx}] {iface} - Not configured")
        
        print(f"  [0] Input manual")
        
        # Select interface
        try:
            choice = int(input(f"\nPilih interface [0-{len(interfaces)}]: ").strip())
            if choice == 0:
                interface = input("Interface name (e.g., gei_1/3/1): ").strip()
            elif 1 <= choice <= len(interfaces):
                interface = interfaces[choice - 1]
            else:
                print("Pilihan tidak valid")
                self.press_enter()
                return
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        if not interface:
            print("Interface tidak boleh kosong")
            self.press_enter()
            return
        
        # Show current config
        print(f"\nCurrent configuration for {interface}:")
        print(self.config_mgr.show_uplink_config(interface))
        
        # Input VLAN ID to delete
        try:
            vlan_id = int(input("\nVLAN ID to delete: ").strip())
        except ValueError:
            print("VLAN ID harus angka")
            self.press_enter()
            return
        
        # Confirm
        confirm = input(f"Delete VLAN {vlan_id} from {interface}? [y/n]: ").strip().lower()
        if confirm != 'y':
            print("Dibatalkan")
            self.press_enter()
            return
        
        # Delete
        success, msg = self.config_mgr.remove_uplink_vlan(interface, vlan_id)
        print(f"\n{'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    def uplink_shutdown_wizard(self):
        """Wizard untuk shutdown interface"""
        print("\n=== Shutdown Interface ===\n")
        
        # Get available interfaces
        interfaces = self.config_mgr.get_uplink_interfaces_list()
        
        if not interfaces:
            print("Tidak dapat menemukan uplink interfaces.")
            self.press_enter()
            return
        
        # Display interfaces
        print("Available Uplink Interfaces:")
        for idx, iface in enumerate(interfaces, 1):
            print(f"  [{idx}] {iface}")
        
        print(f"  [0] Input manual")
        
        # Select interface
        try:
            choice = int(input(f"\nPilih interface [0-{len(interfaces)}]: ").strip())
            if choice == 0:
                interface = input("Interface name: ").strip()
            elif 1 <= choice <= len(interfaces):
                interface = interfaces[choice - 1]
            else:
                print("Pilihan tidak valid")
                self.press_enter()
                return
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        if not interface:
            print("Interface tidak boleh kosong")
            self.press_enter()
            return
        
        # Confirm
        confirm = input(f"Shutdown {interface}? [y/n]: ").strip().lower()
        if confirm != 'y':
            print("Dibatalkan")
            self.press_enter()
            return
        
        # Execute shutdown
        success, msg = self.system_mgr.shutdown_interface(interface)
        print(f"\n{'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    def uplink_enable_wizard(self):
        """Wizard untuk enable interface"""
        print("\n=== Enable Interface ===\n")
        
        # Get available interfaces
        interfaces = self.config_mgr.get_uplink_interfaces_list()
        
        if not interfaces:
            print("Tidak dapat menemukan uplink interfaces.")
            self.press_enter()
            return
        
        # Display interfaces
        print("Available Uplink Interfaces:")
        for idx, iface in enumerate(interfaces, 1):
            print(f"  [{idx}] {iface}")
        
        print(f"  [0] Input manual")
        
        # Select interface
        try:
            choice = int(input(f"\nPilih interface [0-{len(interfaces)}]: ").strip())
            if choice == 0:
                interface = input("Interface name: ").strip()
            elif 1 <= choice <= len(interfaces):
                interface = interfaces[choice - 1]
            else:
                print("Pilihan tidak valid")
                self.press_enter()
                return
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        if not interface:
            print("Interface tidak boleh kosong")
            self.press_enter()
            return
        
        # Confirm
        confirm = input(f"Enable {interface}? [y/n]: ").strip().lower()
        if confirm != 'y':
            print("Dibatalkan")
            self.press_enter()
            return
        
        # Execute enable
        success, msg = self.system_mgr.no_shutdown_interface(interface)
        print(f"\n{'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    # ==================== ONU CONFIG MENU ====================
    
    def onu_config_menu(self):
        """Menu ONU configuration"""
        while True:
            self.print_header("ONU CONFIGURATION")
            print("""
    1. Show ONU List
    2. Show ONU Detail
    3. Configure ONU PPPOE
    4. Configure ONU Bridge
    5. Configure ONU Static IP
    6. Restart ONU
    7. Configure Security Management (Remote Access)
    8. Configure TR069
    9. Enable Remote Web Management
    10. Configure Fiberhome VEIP (HG6145D2-AC)
    11. Configure ZTE Full (Dual SSID, Dual VLAN)
    12. Configure Huawei Full (Multi VLAN)
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-12]: ").strip()
            
            if choice == '1':
                # Tampilkan daftar semua ONU yang sudah terdaftar
                print("\nMengambil daftar ONU yang sudah terdaftar...")
                working_onus = self.register_wizard.fetch_all_working_onus()
                
                if not working_onus:
                    print("Tidak ada ONU yang terdaftar.")
                else:
                    print("\n" + "=" * 100)
                    print(f"{'No':<4} {'PON Port':<15} {'ONU ID':<8} {'Deskripsi':<35} {'Status'}")
                    print("=" * 100)
                    
                    for idx, onu in enumerate(working_onus, 1):
                        print(f"{idx:<4} {onu['pon_port']:<15} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<35} {onu.get('status', 'N/A')}")
                    
                    print("=" * 100)
                    print(f"\nTotal: {len(working_onus)} ONU")
                
                self.press_enter()
            elif choice == '2':
                # Tampilkan daftar dan pilih untuk melihat detail
                print("\nMengambil daftar ONU yang sudah terdaftar...")
                working_onus = self.register_wizard.fetch_all_working_onus()
                
                if not working_onus:
                    print("Tidak ada ONU yang terdaftar.")
                    self.press_enter()
                else:
                    print("\n" + "=" * 80)
                    print(f"{'No':<4} {'PON Port':<15} {'ONU ID':<8} {'Deskripsi':<30}")
                    print("=" * 80)
                    
                    for idx, onu in enumerate(working_onus, 1):
                        print(f"{idx:<4} {onu['pon_port']:<15} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30}")
                    
                    print("=" * 80)
                    
                    choice = input("\nPilih nomor ONU untuk melihat detail [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
                    
                    if choice and choice != '0':
                        try:
                            idx = int(choice) - 1
                            if 0 <= idx < len(working_onus):
                                selected_onu = working_onus[idx]
                                # Tampilkan detail lengkap - format onu_id: "1/1/port:onu_id"
                                onu_id_full = f"1/1/{selected_onu['port']}:{selected_onu['onu_id']}"
                                self.register_wizard.show_onu_detail_full(onu_id_full)
                            else:
                                print("Nomor tidak valid")
                        except ValueError:
                            print("Input tidak valid")
                    
                    self.press_enter()
            elif choice == '3':
                self.configure_pppoe()
            elif choice == '4':
                self.configure_bridge()
            elif choice == '5':
                self.configure_static_ip()
            elif choice == '6':
                slot = self.input_int("Slot: ", 1)
                port = self.input_int("Port: ", 1)
                onu_id = self.input_int("ONU ID: ")
                if onu_id:
                    confirm = input("Restart ONU? (y/n): ").strip().lower()
                    if confirm == 'y':
                        onu_id_str = f"{slot}/{port}/1:{onu_id}"
                        success, msg = self.onu_mgr.reboot_onu(onu_id_str)
                        print(msg)
                self.press_enter()
            elif choice == '7':
                self.configure_security_management()
            elif choice == '8':
                self.configure_tr069_wizard()
            elif choice == '9':
                slot = self.input_int("Slot: ", 1)
                port = self.input_int("Port: ", 1)
                onu_id = self.input_int("ONU ID: ")
                if onu_id:
                    ip = input("Management IP (e.g., 192.168.1.1): ").strip()
                    mask = input("Netmask (default 255.255.255.0): ").strip() or "255.255.255.0"
                    gateway = input("Gateway: ").strip()
                    success, msg = self.onu_mgr.configure_remote_management(
                        slot, port, onu_id, ip, mask, gateway
                    )
                    print(msg)
                self.press_enter()
            elif choice == '10':
                self.configure_fiberhome_veip()
            elif choice == '11':
                self.configure_zte_full()
            elif choice == '12':
                self.configure_huawei_full()
            elif choice == '0':
                break
    
    def configure_fiberhome_veip(self):
        """Configure Fiberhome HG6145D2-AC ONU dengan VEIP mode"""
        self.print_header("CONFIGURE FIBERHOME VEIP (HG6145D2-AC)")
        print("""
  Konfigurasi ini khusus untuk ONU Fiberhome dengan:
  - ONU Type: HG6145D2-AC
  - Mode: VEIP (Virtual Ethernet Interface Point)
  - 3 TCONT/Gemport (Internet, IPTV, VoIP)
  - TR069/ACS Remote Management
  - WiFi dan ETH port binding
        """)
        
        slot = self.input_int("Slot: ", 1)
        port = self.input_int("Port: ", 1)
        onu_id = self.input_int("ONU ID: ")
        
        if not onu_id:
            print("ONU ID diperlukan!")
            self.press_enter()
            return
        
        # VLAN Configuration
        print("\n--- VLAN Configuration ---")
        print("  VLAN 100 = TR069/ACS Management")
        print("  VLAN 30  = Internet/IPTV/WiFi")
        print("  VLAN 151 = VoIP")
        tr069_vlan = self.input_int("TR069/Management VLAN (default 100): ", 100)
        internet_vlan = self.input_int("Internet/IPTV VLAN (default 30): ", 30)
        voip_vlan = self.input_int("VoIP VLAN (default 151): ", 151)
        
        # ACS Configuration
        print("\n--- ACS/TR069 Configuration ---")
        acs_url = input("ACS URL (default http://192.168.54.254:7547): ").strip()
        if not acs_url:
            acs_url = "http://192.168.54.254:7547"
        
        acs_user = input("ACS Username (default acs): ").strip() or "acs"
        acs_pass = input("ACS Password (default acs): ").strip() or "acs"
        
        # TCONT Profile
        tcont_profile = input("TCONT Profile (default UP-PPPOE): ").strip() or "UP-PPPOE"
        
        # Show summary
        print(f"\n{'='*60}")
        print("Configuration Summary:")
        print(f"{'='*60}")
        print(f"  ONU Interface   : gpon-onu_1/{slot}/{port}:{onu_id}")
        print(f"  TR069 VLAN      : {tr069_vlan} (ACS Management)")
        print(f"  Internet VLAN   : {internet_vlan} (Internet/IPTV/WiFi)")
        print(f"  VoIP VLAN       : {voip_vlan}")
        print(f"  ACS URL         : {acs_url}")
        print(f"  ACS Username    : {acs_user}")
        print(f"  TCONT Profile   : {tcont_profile}")
        print(f"{'='*60}")
        
        confirm = input("\nProceed with configuration? (y/n): ").strip().lower()
        if confirm != 'y':
            print("Configuration cancelled.")
            self.press_enter()
            return
        
        # Execute configuration
        onu_id_str = f"{slot}/{port}/1:{onu_id}"
        success, msg = self.onu_mgr.configure_fiberhome_veip(
            onu_id=onu_id_str,
            acs_url=acs_url,
            acs_username=acs_user,
            acs_password=acs_pass,
            tr069_vlan=tr069_vlan,
            internet_vlan=internet_vlan,
            voip_vlan=voip_vlan,
            tcont_profile=tcont_profile
        )
        
        print(f"\n{msg}")
        self.press_enter()

    def configure_zte_full(self):
        """Configure ZTE Full mode - Dual SSID, Dual VLAN, PPPoE, TR069, Firewall"""
        self.print_header("CONFIGURE ZTE FULL (F670L/F680 Series)")
        print("""
  Konfigurasi lengkap untuk ONU ZTE F670L/F680:
  - Dual SSID (Internet + Voucher)
  - Dual VLAN (Primary + Secondary)
  - PPPoE Configuration
  - TR069/ACS Configuration
  - WiFi Security Settings (WPA2/WPA-Mixed/WEP/Open)
  - Firewall Configuration
        """)
        
        slot = self.input_int("Slot", 1)
        port = self.input_int("Port", 1)
        onu_id = self.input_int("ONU ID")
        
        if not onu_id:
            print("ONU ID diperlukan!")
            self.press_enter()
            return
        
        # VLAN Configuration
        print("\n--- VLAN Configuration ---")
        primary_vlan = self.input_int("Primary/Internet VLAN", 30)
        secondary_vlan = self.input_int("Secondary/Voucher VLAN", 151)
        
        # ETH Port VLAN Assignment
        print("\n--- ETH Port VLAN Assignment ---")
        print(f"  Default: ETH 1-2 = VLAN {primary_vlan}, ETH 3-4 = VLAN {secondary_vlan}")
        use_default_eth = input("  Use default? [Y/n]: ").strip().upper() != 'N'
        
        if use_default_eth:
            eth1_vlan = primary_vlan
            eth2_vlan = primary_vlan
            eth3_vlan = secondary_vlan
            eth4_vlan = secondary_vlan
        else:
            eth1_vlan = self.input_int("  ETH 1 VLAN", primary_vlan)
            eth2_vlan = self.input_int("  ETH 2 VLAN", primary_vlan)
            eth3_vlan = self.input_int("  ETH 3 VLAN", secondary_vlan)
            eth4_vlan = self.input_int("  ETH 4 VLAN", secondary_vlan)
        
        # PPPoE Configuration
        print("\n--- PPPoE Configuration ---")
        enable_pppoe = input("Enable PPPoE? [Y/n]: ").strip().upper() != 'N'
        pppoe_user = ""
        pppoe_pass = ""
        if enable_pppoe:
            pppoe_user = input("  PPPoE Username: ").strip()
            pppoe_pass = input("  PPPoE Password: ").strip() if pppoe_user else ""
        
        # WiFi/SSID Configuration
        print("\n--- WiFi SSID Configuration ---")
        enable_dual_ssid = input("Enable Dual SSID? [Y/n]: ").strip().upper() != 'N'
        
        # SSID 1 (Internet)
        ssid1_name = input("SSID 1 Name (Internet) [Internet_SSID]: ").strip() or "Internet_SSID"
        print("  SSID 1 Auth Type:")
        print("    [1] WPA2-PSK (recommended)")
        print("    [2] WPA/WPA2-Mixed (TKIP+AES)")
        print("    [3] WEP")
        print("    [4] Open (no password)")
        ssid1_auth_choice = input("  Pilih [1-4]: ").strip() or "1"
        
        ssid1_auth = "wpa2"
        ssid1_password = ""
        if ssid1_auth_choice == "1":
            ssid1_auth = "wpa2"
            ssid1_password = input("  SSID 1 Password [12345678]: ").strip() or "12345678"
        elif ssid1_auth_choice == "2":
            ssid1_auth = "wpa_mixed"
            ssid1_password = input("  SSID 1 Password [12345678]: ").strip() or "12345678"
        elif ssid1_auth_choice == "3":
            ssid1_auth = "wep"
            ssid1_password = input("  SSID 1 WEP Key: ").strip()
        else:
            ssid1_auth = "open"
        
        # SSID 2 (Voucher/Guest)
        ssid2_name = ""
        ssid2_auth = "open"
        ssid2_password = ""
        if enable_dual_ssid:
            ssid2_name = input("SSID 2 Name (Voucher) [Voucher_SSID]: ").strip() or "Voucher_SSID"
            print("  SSID 2 Auth Type:")
            print("    [1] WPA2-PSK")
            print("    [2] WPA/WPA2-Mixed (TKIP+AES)")
            print("    [3] WEP")
            print("    [4] Open (no password) - recommended for voucher")
            ssid2_auth_choice = input("  Pilih [1-4]: ").strip() or "4"
            
            if ssid2_auth_choice == "1":
                ssid2_auth = "wpa2"
                ssid2_password = input("  SSID 2 Password: ").strip()
            elif ssid2_auth_choice == "2":
                ssid2_auth = "wpa_mixed"
                ssid2_password = input("  SSID 2 Password: ").strip()
            elif ssid2_auth_choice == "3":
                ssid2_auth = "wep"
                ssid2_password = input("  SSID 2 WEP Key: ").strip()
            else:
                ssid2_auth = "open"
        
        # TR069/ACS Configuration
        print("\n--- TR069/ACS Configuration ---")
        enable_tr069 = input("Enable TR069? [Y/n]: ").strip().upper() != 'N'
        acs_url = ""
        acs_user = ""
        acs_pass = ""
        if enable_tr069:
            acs_url = input("  ACS URL [http://192.168.54.254:7547]: ").strip() or "http://192.168.54.254:7547"
            acs_user = input("  ACS Username [admin]: ").strip() or "admin"
            acs_pass = input("  ACS Password [admin]: ").strip() or "admin"
        
        # Firewall Configuration
        print("\n--- Firewall Configuration ---")
        enable_firewall = input("Enable Firewall? [Y/n]: ").strip().upper() != 'N'
        firewall_level = "low"
        if enable_firewall:
            print("  Firewall Level: [1] Low  [2] Medium  [3] High")
            fw_choice = input("  Pilih [1-3]: ").strip() or "1"
            if fw_choice == "2":
                firewall_level = "medium"
            elif fw_choice == "3":
                firewall_level = "high"
        
        # TCONT Profile
        tcont_profile = input("TCONT Profile [UP-PPPOE]: ").strip() or "UP-PPPOE"
        
        # Show summary
        print(f"\n{'='*60}")
        print("Configuration Summary:")
        print(f"{'='*60}")
        print(f"  ONU Interface   : gpon-onu_1/{slot}/{port}:{onu_id}")
        print(f"  Primary VLAN    : {primary_vlan}")
        print(f"  Secondary VLAN  : {secondary_vlan}")
        print(f"  ETH Ports       : {eth1_vlan}, {eth2_vlan}, {eth3_vlan}, {eth4_vlan}")
        if enable_pppoe and pppoe_user:
            print(f"  PPPoE User      : {pppoe_user}")
        print(f"  Dual SSID       : {enable_dual_ssid}")
        print(f"  SSID 1          : {ssid1_name} ({ssid1_auth})")
        if enable_dual_ssid:
            print(f"  SSID 2          : {ssid2_name} ({ssid2_auth})")
        if enable_tr069:
            print(f"  ACS URL         : {acs_url}")
        print(f"  Firewall        : {firewall_level if enable_firewall else 'Disabled'}")
        print(f"  TCONT Profile   : {tcont_profile}")
        print(f"{'='*60}")
        
        confirm = input("\nProceed with configuration? (y/n): ").strip().lower()
        if confirm != 'y':
            print("Configuration cancelled.")
            self.press_enter()
            return
        
        # Execute configuration
        onu_id_str = f"{slot}/{port}/1:{onu_id}"
        config = {
            'primary_vlan': primary_vlan,
            'secondary_vlan': secondary_vlan,
            'eth1_vlan': eth1_vlan,
            'eth2_vlan': eth2_vlan,
            'eth3_vlan': eth3_vlan,
            'eth4_vlan': eth4_vlan,
            'pppoe_user': pppoe_user,
            'pppoe_pass': pppoe_pass,
            'enable_dual_ssid': enable_dual_ssid,
            'ssid1_name': ssid1_name,
            'ssid1_auth': ssid1_auth,
            'ssid1_password': ssid1_password,
            'ssid2_name': ssid2_name,
            'ssid2_auth': ssid2_auth,
            'ssid2_password': ssid2_password,
            'enable_tr069': enable_tr069,
            'acs_url': acs_url,
            'acs_user': acs_user,
            'acs_pass': acs_pass,
            'enable_firewall': enable_firewall,
            'firewall_level': firewall_level,
            'enable_security_mgmt': True
        }
        success, msg = self.onu_mgr.configure_zte_full(onu_id_str, tcont_profile, config)
        
        print(f"\n{msg}")
        self.press_enter()

    def configure_huawei_full(self):
        """Configure Huawei Full mode - Multi VLAN, WAN DHCP"""
        self.print_header("CONFIGURE HUAWEI FULL (HG8245/EG8145 Series)")
        print("""
  Konfigurasi lengkap untuk ONU Huawei:
  - Multi VLAN support (Mgmt, Internet, VoIP)
  - WAN Mode (DHCP/Static/PPPoE)
  - TR069/ACS Configuration
  - Note: OMCI capabilities limited via ZTE OLT
        """)
        
        slot = self.input_int("Slot: ", 1)
        port = self.input_int("Port: ", 1)
        onu_id = self.input_int("ONU ID: ")
        
        if not onu_id:
            print("ONU ID diperlukan!")
            self.press_enter()
            return
        
        # VLAN Configuration
        print("\n--- VLAN Configuration ---")
        mgmt_vlan = self.input_int("Management/TR069 VLAN (default 1010): ", 1010)
        internet_vlan = self.input_int("Internet VLAN (default 30): ", 30)
        voip_vlan = self.input_int("VoIP VLAN (default 151): ", 151)
        
        # WAN Mode
        print("\n--- WAN Mode ---")
        print("  [1] DHCP (default)")
        print("  [2] Static IP")
        print("  [3] PPPoE")
        wan_choice = input("Pilih WAN mode [1-3]: ").strip() or "1"
        
        wan_mode = "dhcp"
        wan_config = {}
        
        if wan_choice == "2":
            wan_mode = "static"
            wan_config['ip'] = input("  Static IP: ").strip()
            wan_config['netmask'] = input("  Netmask [255.255.255.0]: ").strip() or "255.255.255.0"
            wan_config['gateway'] = input("  Gateway: ").strip()
        elif wan_choice == "3":
            wan_mode = "pppoe"
            wan_config['username'] = input("  PPPoE Username: ").strip()
            wan_config['password'] = input("  PPPoE Password: ").strip()
        
        # ACS Configuration
        print("\n--- ACS/TR069 Configuration ---")
        acs_url = input("ACS URL [http://genieacs.example.com:7547]: ").strip() or "http://genieacs.example.com:7547"
        
        # TCONT Profile
        tcont_profile = input("TCONT Profile [UP-PPPOE]: ").strip() or "UP-PPPOE"
        
        # Show summary
        print(f"\n{'='*60}")
        print("Configuration Summary:")
        print(f"{'='*60}")
        print(f"  ONU Interface   : gpon-onu_1/{slot}/{port}:{onu_id}")
        print(f"  Management VLAN : {mgmt_vlan}")
        print(f"  Internet VLAN   : {internet_vlan}")
        print(f"  VoIP VLAN       : {voip_vlan}")
        print(f"  WAN Mode        : {wan_mode}")
        print(f"  ACS URL         : {acs_url}")
        print(f"  TCONT Profile   : {tcont_profile}")
        print(f"{'='*60}")
        
        confirm = input("\nProceed with configuration? (y/n): ").strip().lower()
        if confirm != 'y':
            print("Configuration cancelled.")
            self.press_enter()
            return
        
        # Execute configuration
        onu_id_str = f"{slot}/{port}/1:{onu_id}"
        config = {
            'mgmt_vlan': mgmt_vlan,
            'internet_vlan': internet_vlan,
            'voip_vlan': voip_vlan,
            'wan_mode': wan_mode,
            'wan_config': wan_config,
            'acs_url': acs_url
        }
        success, msg = self.onu_mgr.configure_huawei_full(onu_id_str, tcont_profile, config)
        
        print(f"\n{msg}")
        self.press_enter()

    def configure_pppoe(self):
        """Configure PPPOE on ONU"""
        print("\n--- Configure PPPOE ---")
        
        # Tampilkan daftar ONU yang sudah terdaftar
        print("\nMengambil daftar ONU yang sudah terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar
        print("\n" + "=" * 80)
        print(f"{'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Deskripsi':<30} {'Status'}")
        print("=" * 80)
        
        for idx, onu in enumerate(working_onus, 1):
            print(f"{idx:<4} {onu['pon_port']:<12} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30} {onu.get('status', 'N/A')}")
        
        print("=" * 80)
        
        # Pilih ONU
        choice = input("\nPilih nomor ONU [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
        
        if not choice or choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(working_onus):
                print("Nomor tidak valid")
                self.press_enter()
                return
            
            selected_onu = working_onus[idx]
            slot = 1
            port = selected_onu['port']
            onu_id = selected_onu['onu_id']
            onu_id_full = f"1/1/{port}:{onu_id}"
            
            print(f"\nONU Terpilih: {selected_onu['pon_port']} - {selected_onu.get('name', 'N/A')}")
            
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        # Tampilkan service yang sudah ada
        print("\n--- Memeriksa Service Configuration ---")
        success, result = self.onu_mgr.show_service_port(onu_id_full)
        
        if success and result.get('services'):
            print("\nKonfigurasi yang sudah ada pada ONU ini:")
            print("=" * 80)
            print(result.get('output', ''))
            print("=" * 80)
            
            # Cek apakah sudah ada service config
            has_service = any('service-port' in s.get('raw', '').lower() or 'tcont' in s.get('raw', '').lower() 
                            for s in result.get('services', []))
            
            if has_service:
                # Tanya mau add, update atau delete
                print("\nPilihan:")
                print("  [1] Tambah/Update Service PPPOE")
                print("  [2] Hapus Service Configuration")
                print("  [3] Lihat Running Config Lengkap")
                print("  [0] Batal")
                
                action = input("\nPilih aksi [0-3]: ").strip()
                
                if action == '2':
                    # Hapus service config
                    confirm = input("\nYakin hapus semua service config pada ONU ini? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.onu_mgr.delete_service_config(onu_id_full)
                        print(msg)
                    self.press_enter()
                    return
                elif action == '3':
                    # Show full running config
                    print("\n" + "=" * 80)
                    print(self.onu_mgr.show_onu_running_config(onu_id_full))
                    print("=" * 80)
                    self.press_enter()
                    return
                elif action != '1':
                    return
        else:
            print("Belum ada service terkonfigurasi.")
        
        # Tambah service baru
        print("\n--- Tambah Service PPPOE ---")
        username = input("PPPOE Username: ").strip()
        password = input("PPPOE Password: ").strip()
        vlan_id = self.input_int("VLAN ID: ")
        
        # Pilih TCONT Profile (Upstream)
        tcont_profiles = self.register_wizard.fetch_tcont_profiles()
        print("\n  TCONT Profiles (Upstream/Upload):")
        for i, t in enumerate(tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(tcont_profiles)))
        tcont_profile = tcont_profiles[tcont_choice - 1] if tcont_profiles else None
        
        # Pilih Traffic Profile (Downstream)
        traffic_profiles = self.register_wizard.fetch_traffic_profiles()
        print("\n  Traffic Profiles (Downstream/Download):")
        for i, t in enumerate(traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(traffic_profiles)))
        traffic_profile = traffic_profiles[traffic_choice - 1] if traffic_profiles else None
        
        if username and password and vlan_id:
            success, msg = self.onu_mgr.configure_pppoe(
                onu_id_full, username, password, vlan_id, tcont_profile, traffic_profile
            )
            print(msg)
        else:
            print("Data tidak lengkap")
        self.press_enter()
    
    def configure_bridge(self):
        """Configure Bridge mode on ONU"""
        print("\n--- Configure Bridge ---")
        
        # Tampilkan daftar ONU yang sudah terdaftar
        print("\nMengambil daftar ONU yang sudah terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar
        print("\n" + "=" * 80)
        print(f"{'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Deskripsi':<30} {'Status'}")
        print("=" * 80)
        
        for idx, onu in enumerate(working_onus, 1):
            print(f"{idx:<4} {onu['pon_port']:<12} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30} {onu.get('status', 'N/A')}")
        
        print("=" * 80)
        
        # Pilih ONU
        choice = input("\nPilih nomor ONU [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
        
        if not choice or choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(working_onus):
                print("Nomor tidak valid")
                self.press_enter()
                return
            
            selected_onu = working_onus[idx]
            slot = 1
            port = selected_onu['port']
            onu_id = selected_onu['onu_id']
            
            print(f"\nONU Terpilih: {selected_onu['pon_port']} - {selected_onu.get('name', 'N/A')}")
            
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        vlan_id = self.input_int("VLAN ID: ")
        lan_port = self.input_int("LAN Port (1-4, default 1): ", 1)
        
        # Pilih TCONT Profile
        tcont_profiles = self.register_wizard.fetch_tcont_profiles()
        print("\n  TCONT Profiles:")
        for i, t in enumerate(tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(tcont_profiles)))
        tcont_profile = tcont_profiles[tcont_choice - 1] if tcont_profiles else None
        
        if vlan_id:
            # Format onu_id_full: "1/1/1:1"
            onu_id_full = f"1/1/{port}:{onu_id}"
            success, msg = self.onu_mgr.configure_bridge(
                onu_id_full, vlan_id, tcont_profile, eth_port=lan_port
            )
            print(msg)
        else:
            print("VLAN ID diperlukan")
        self.press_enter()
    
    def configure_static_ip(self):
        """Configure Static IP on ONU"""
        print("\n--- Configure Static IP ---")
        
        # Tampilkan daftar ONU yang sudah terdaftar
        print("\nMengambil daftar ONU yang sudah terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar
        print("\n" + "=" * 80)
        print(f"{'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Deskripsi':<30} {'Status'}")
        print("=" * 80)
        
        for idx, onu in enumerate(working_onus, 1):
            print(f"{idx:<4} {onu['pon_port']:<12} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30} {onu.get('status', 'N/A')}")
        
        print("=" * 80)
        
        # Pilih ONU
        choice = input("\nPilih nomor ONU [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
        
        if not choice or choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(working_onus):
                print("Nomor tidak valid")
                self.press_enter()
                return
            
            selected_onu = working_onus[idx]
            slot = 1
            port = selected_onu['port']
            onu_id = selected_onu['onu_id']
            
            print(f"\nONU Terpilih: {selected_onu['pon_port']} - {selected_onu.get('name', 'N/A')}")
            
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        ip = input("IP Address: ").strip()
        mask = input("Netmask: ").strip()
        gateway = input("Gateway: ").strip()
        vlan_id = self.input_int("VLAN ID: ")
        
        dns1 = input("DNS Primary (default 8.8.8.8): ").strip() or "8.8.8.8"
        dns2 = input("DNS Secondary (default 8.8.4.4): ").strip() or "8.8.4.4"
        
        # Pilih TCONT Profile
        tcont_profiles = self.register_wizard.fetch_tcont_profiles()
        print("\n  TCONT Profiles:")
        for i, t in enumerate(tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(tcont_profiles)))
        tcont_profile = tcont_profiles[tcont_choice - 1] if tcont_profiles else None
        
        if ip and mask and gateway and vlan_id:
            # Format onu_id_full: "1/1/1:1"
            onu_id_full = f"1/1/{port}:{onu_id}"
            success, msg = self.onu_mgr.configure_static_ip(
                onu_id_full, ip, mask, gateway, dns1, dns2, vlan_id, tcont_profile
            )
            print(msg)
        else:
            print("Data tidak lengkap")
        self.press_enter()
    
    # ==================== ONU OMCI MENU ====================
    
    def onu_omci_menu(self):
        """Menu ONU OMCI configuration (LAN/WLAN binding)"""
        while True:
            self.print_header("ONU OMCI CONFIGURATION")
            print("""
    ZTE OMCI Features (untuk ONU ZTE yang support OMCI)
    
    1. Set LAN Port Binding (with ONU list)
    2. Set WLAN (WiFi) Binding (with ONU list)
    3. Show ONU Running Config
    4. Show VLAN OMCI Configuration
    5. Auto-Provision Management (Discovery & Register)
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-5]: ").strip()
            
            if choice == '1':
                self.set_lan_binding_with_list()
                self.press_enter()
            elif choice == '2':
                self.set_wlan_binding_with_list()
                self.press_enter()
            elif choice == '3':
                self.show_onu_running_config_with_list()
                self.press_enter()
            elif choice == '4':
                self.show_onu_vlan_omci()
                self.press_enter()
            elif choice == '5':
                self.auto_bind_config_menu()
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== DELETE ONU MENU ====================
    
    def delete_onu_menu(self):
        """Menu untuk delete ONU configuration dan unregister ONU"""
        while True:
            self.print_header("DELETE ONU & UNREGISTER")
            print("""
    ⚠ WARNING: Operasi ini akan menghapus konfigurasi/registrasi ONU
    
    1. Clear ONU Configuration (Hapus config, ONU tetap terdaftar)
    2. Unregister ONU (Hapus dari OLT, config otomatis terhapus)
    3. Clear Config + Unregister (Auto Sync - Recommended)
    4. Show Registered ONU List
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-4]: ").strip()
            
            if choice == '1':
                self.clear_onu_config_only()
            elif choice == '2':
                self.unregister_onu_only()
            elif choice == '3':
                self.delete_onu_complete()
            elif choice == '4':
                self.show_registered_onu_list()
            elif choice == '0':
                break
    
    def show_registered_onu_list(self):
        """Tampilkan daftar ONU yang terdaftar"""
        self.print_header("REGISTERED ONU LIST")
        
        print("\n  Mengambil daftar ONU terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("\n  Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        print(f"\n  Total: {len(working_onus)} ONU\n")
        print("  " + "="*100)
        print(f"  {'No':<4} {'PON Port':<15} {'ONU ID':<8} {'Type':<25} {'SN':<18} {'Status':<12} {'Name'}")
        print("  " + "="*100)
        
        for i, onu in enumerate(working_onus, 1):
            port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')[:24]
            sn = onu.get('sn', 'N/A')
            status = onu.get('status', 'N/A')[:11]
            name = onu.get('name', '-')[:30]
            
            print(f"  {i:<4} {port:<15} {onu_id:<8} {onu_type:<25} {sn:<18} {status:<12} {name}")
        
        print("  " + "="*100)
        self.press_enter()
    
    def clear_onu_config_only(self):
        """Hapus konfigurasi ONU tanpa unregister"""
        self.print_header("CLEAR ONU CONFIGURATION")
        
        print("\n  ⚠ Operasi ini akan menghapus semua konfigurasi service ONU")
        print("  ONU akan tetap terdaftar (registered)")
        print("  Name dan Description ONU akan dipertahankan\n")
        
        # Opsi pilih dari list atau manual
        print("  Pilih metode:")
        print("    [1] Pilih dari list ONU terdaftar (Otomatis)")
        print("    [2] Input manual PON Port & ONU ID")
        
        method = input("\n  Pilih [1/2]: ").strip()
        
        pon_port = None
        onu_id = None
        onu_info = None
        
        if method == '1':
            # Auto: Fetch dan tampilkan list
            print("\n  Mengambil daftar ONU terdaftar...")
            working_onus = self.register_wizard.fetch_all_working_onus()
            
            if not working_onus:
                print("\n  Tidak ada ONU yang terdaftar.")
                self.press_enter()
                return
            
            # Tampilkan list
            print(f"\n  Total: {len(working_onus)} ONU\n")
            print("  " + "="*90)
            print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<22} {'SN':<18} {'Name'}")
            print("  " + "="*90)
            
            for i, onu in enumerate(working_onus, 1):
                port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                oid = onu.get('onu_id', '?')
                otype = onu.get('type', 'N/A')[:21]
                sn = onu.get('sn', 'N/A')
                name = onu.get('name', '-')[:20]
                
                print(f"  {i:<4} {port:<12} {oid:<8} {otype:<22} {sn:<18} {name}")
            
            print("  " + "="*90)
            
            # Pilih ONU - clear_onu_config_only
            try:
                choice = int(input("\n  Pilih nomor ONU (0=batal): ").strip())
                if choice == 0 or choice < 1 or choice > len(working_onus):
                    print("\n  Dibatalkan.")
                    self.press_enter()
                    return
                
                selected = working_onus[choice - 1]
                pon_port = selected['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = str(selected.get('onu_id', ''))  # Convert to string
                onu_info = f"{selected.get('name', 'N/A')} ({selected.get('type', 'N/A')})"
                
            except (ValueError, IndexError):
                print("\n  Input tidak valid. Dibatalkan.")
                self.press_enter()
                return
        else:
            # Manual input
            pon_port = input("  PON Port (contoh: 1/1/1): ").strip()
            if not pon_port:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
            
            onu_id = input("  ONU ID: ").strip()
            if not onu_id:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
        
        # Konfirmasi
        print(f"\n  Target: PON {pon_port}, ONU ID {onu_id}")
        if onu_info:
            print(f"  Info: {onu_info}")
        confirm = input(f"\n  Yakin hapus config ONU {pon_port}:{onu_id}? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("\n  Dibatalkan.")
            self.press_enter()
            return
        
        # Execute delete service config
        full_id = f"{pon_port}:{onu_id}"
        success, msg = self.onu_mgr.delete_service_config(full_id)
        
        print(f"\n  {'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    def unregister_onu_only(self):
        """Unregister ONU dari OLT"""
        self.print_header("UNREGISTER ONU")
        
        print("\n  ⚠ Operasi ini akan menghapus ONU dari OLT")
        print("  Semua konfigurasi akan terhapus otomatis")
        print("  ONU akan kembali ke status unconfigured\n")
        
        # Opsi pilih dari list atau manual
        print("  Pilih metode:")
        print("    [1] Pilih dari list ONU terdaftar (Otomatis)")
        print("    [2] Input manual PON Port & ONU ID")
        
        method = input("\n  Pilih [1/2]: ").strip()
        
        pon_port = None
        onu_id = None
        onu_info = None
        
        if method == '1':
            # Auto: Fetch dan tampilkan list
            print("\n  Mengambil daftar ONU terdaftar...")
            working_onus = self.register_wizard.fetch_all_working_onus()
            
            if not working_onus:
                print("\n  Tidak ada ONU yang terdaftar.")
                self.press_enter()
                return
            
            # Tampilkan list
            print(f"\n  Total: {len(working_onus)} ONU\n")
            print("  " + "="*90)
            print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<22} {'SN':<18} {'Name'}")
            print("  " + "="*90)
            
            for i, onu in enumerate(working_onus, 1):
                port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                oid = onu.get('onu_id', '?')
                otype = onu.get('type', 'N/A')[:21]
                sn = onu.get('sn', 'N/A')
                name = onu.get('name', '-')[:20]
                
                print(f"  {i:<4} {port:<12} {oid:<8} {otype:<22} {sn:<18} {name}")
            
            print("  " + "="*90)
            
            # Pilih ONU - unregister_onu_only
            try:
                choice = int(input("\n  Pilih nomor ONU (0=batal): ").strip())
                if choice == 0 or choice < 1 or choice > len(working_onus):
                    print("\n  Dibatalkan.")
                    self.press_enter()
                    return
                
                selected = working_onus[choice - 1]
                pon_port = selected['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = str(selected.get('onu_id', ''))  # Convert to string
                onu_info = f"{selected.get('name', 'N/A')} ({selected.get('type', 'N/A')})"
                
            except (ValueError, IndexError):
                print("\n  Input tidak valid. Dibatalkan.")
                self.press_enter()
                return
        else:
            # Manual input
            pon_port = input("  PON Port (contoh: 1/1/1): ").strip()
            if not pon_port:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
            
            onu_id = input("  ONU ID: ").strip()
            if not onu_id:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
        
        # Konfirmasi
        print(f"\n  Target: PON {pon_port}, ONU ID {onu_id}")
        if onu_info:
            print(f"  Info: {onu_info}")
        confirm = input(f"\n  Yakin unregister ONU {pon_port}:{onu_id}? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("\n  Dibatalkan.")
            self.press_enter()
            return
        
        # Execute unregister
        success, msg = self.onu_mgr.delete_onu(onu_id, pon_port)
        
        print(f"\n  {'✅' if success else '❌'} {msg}")
        self.press_enter()
    
    def delete_onu_complete(self):
        """Delete ONU lengkap: Clear config + Unregister (Auto Sync)"""
        self.print_header("DELETE ONU COMPLETE (AUTO SYNC)")
        
        print("\n  ✓ Proses otomatis 2 langkah:")
        print("     1. Clear service configuration")
        print("     2. Unregister ONU dari OLT")
        print("\n  ⚠ ONU akan hilang dari daftar registered ONU\n")
        
        # Opsi pilih dari list atau manual
        print("  Pilih metode:")
        print("    [1] Pilih dari list ONU terdaftar (Otomatis)")
        print("    [2] Input manual PON Port & ONU ID")
        
        method = input("\n  Pilih [1/2]: ").strip()
        
        pon_port = None
        onu_id = None
        onu_info = None
        
        if method == '1':
            # Auto: Fetch dan tampilkan list
            print("\n  Mengambil daftar ONU terdaftar...")
            working_onus = self.register_wizard.fetch_all_working_onus()
            
            if not working_onus:
                print("\n  Tidak ada ONU yang terdaftar.")
                self.press_enter()
                return
            
            # Tampilkan list
            print(f"\n  Total: {len(working_onus)} ONU\n")
            print("  " + "="*90)
            print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<22} {'SN':<18} {'Name'}")
            print("  " + "="*90)
            
            for i, onu in enumerate(working_onus, 1):
                port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                oid = onu.get('onu_id', '?')
                otype = onu.get('type', 'N/A')[:21]
                sn = onu.get('sn', 'N/A')
                name = onu.get('name', '-')[:20]
                
                print(f"  {i:<4} {port:<12} {oid:<8} {otype:<22} {sn:<18} {name}")
            
            print("  " + "="*90)
            
            # Pilih ONU - delete_onu_complete
            try:
                choice = int(input("\n  Pilih nomor ONU (0=batal): ").strip())
                if choice == 0 or choice < 1 or choice > len(working_onus):
                    print("\n  Dibatalkan.")
                    self.press_enter()
                    return
                
                selected = working_onus[choice - 1]
                pon_port = selected['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = str(selected.get('onu_id', ''))  # Convert to string
                onu_info = f"{selected.get('name', 'N/A')} ({selected.get('type', 'N/A')})"
                
            except (ValueError, IndexError):
                print("\n  Input tidak valid. Dibatalkan.")
                self.press_enter()
                return
        else:
            # Manual input
            pon_port = input("  PON Port (contoh: 1/1/1): ").strip()
            if not pon_port:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
            
            onu_id = input("  ONU ID: ").strip()
            if not onu_id:
                print("\n  Dibatalkan.")
                self.press_enter()
                return
        
        # Konfirmasi
        print(f"\n  Target: PON {pon_port}, ONU ID {onu_id}")
        if onu_info:
            print(f"  Info: {onu_info}")
        confirm = input(f"  Yakin DELETE COMPLETE? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("\n  Dibatalkan.")
            self.press_enter()
            return
        
        # Step 1: Clear config
        print("\n  [Step 1/2] Clearing service configuration...")
        full_id = f"{pon_port}:{onu_id}"
        success1, msg1 = self.onu_mgr.delete_service_config(full_id)
        
        if success1:
            print(f"  ✅ Config cleared")
        else:
            print(f"  ⚠ Config clear: {msg1}")
        
        # Step 2: Unregister
        print("\n  [Step 2/2] Unregistering ONU...")
        success2, msg2 = self.onu_mgr.delete_onu(onu_id, pon_port)
        
        if success2:
            print(f"  ✅ ONU unregistered")
        else:
            print(f"  ❌ Unregister failed: {msg2}")
        
        # Summary
        print("\n  " + "="*60)
        if success1 and success2:
            print("  ✅ DELETE COMPLETE BERHASIL")
            print(f"     ONU {pon_port}:{onu_id} telah dihapus dari OLT")
        elif success2:
            print("  ⚠ SEBAGIAN BERHASIL")
            print("     ONU unregistered, tapi config clear gagal")
        else:
            print("  ❌ DELETE GAGAL")
            print("     Periksa koneksi dan coba lagi")
        print("  " + "="*60)
        
        self.press_enter()
    
    # ==================== SNMP MENU ====================
    
    def snmp_menu(self):
        """Menu SNMP management"""
        while True:
            self.print_header("SNMP MANAGEMENT")
            print("""
    1. Show SNMP Configuration
    2. Show SNMP Communities
    3. Add SNMP Community
    4. Delete SNMP Community
    5. Enable SNMP
    6. Disable SNMP
    7. Set Contact Info
    8. Set Location Info
    9. Add Trap Host
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-9]: ").strip()
            
            if choice == '1':
                print(self.system_mgr.show_snmp())
                self.press_enter()
            elif choice == '2':
                print(self.system_mgr.show_snmp_community())
                self.press_enter()
            elif choice == '3':
                community = input("Community String: ").strip()
                if community:
                    permission = input("Permission [ro/rw] (default ro): ").strip() or "ro"
                    acl = input("ACL (optional): ").strip() or None
                    success, msg = self.system_mgr.add_snmp_community(
                        community, permission, acl
                    )
                    print(msg)
                self.press_enter()
            elif choice == '4':
                community = input("Community untuk dihapus: ").strip()
                if community:
                    permission = input("Permission [ro/rw]: ").strip() or "ro"
                    success, msg = self.system_mgr.delete_snmp_community(
                        community, permission
                    )
                    print(msg)
                self.press_enter()
            elif choice == '5':
                success, msg = self.system_mgr.enable_snmp()
                print(msg)
                self.press_enter()
            elif choice == '6':
                success, msg = self.system_mgr.disable_snmp()
                print(msg)
                self.press_enter()
            elif choice == '7':
                contact = input("Contact Info: ").strip()
                if contact:
                    success, msg = self.system_mgr.set_snmp_contact(contact)
                    print(msg)
                self.press_enter()
            elif choice == '8':
                location = input("Location Info: ").strip()
                if location:
                    success, msg = self.system_mgr.set_snmp_location(location)
                    print(msg)
                self.press_enter()
            elif choice == '9':
                host = input("Trap Host IP: ").strip()
                community = input("Community: ").strip()
                if host and community:
                    port = self.input_int("Port (default 162): ", 162)
                    success, msg = self.system_mgr.add_snmp_trap_host(host, community, port)
                    print(msg)
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== TR-069 MENU ====================
    
    def tr069_menu(self):
        """Menu TR-069/ACS configuration"""
        while True:
            self.print_header("TR-069 / ACS CONFIGURATION")
            print("""
    1. Show TR-069 Global Configuration
    2. Set Global ACS Server
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-2]: ").strip()
            
            if choice == '1':
                print(self.system_mgr.show_tr069_global())
                self.press_enter()
            elif choice == '2':
                url = input("ACS URL (e.g., http://acs.example.com:7547): ").strip()
                if url:
                    username = input("ACS Username (optional): ").strip() or ""
                    password = input("ACS Password (optional): ").strip() or ""
                    interval = self.input_int("Inform Interval in seconds (default 3600): ", 3600)
                    success, msg = self.system_mgr.set_tr069_acs_global(
                        url, username, password, interval=interval
                    )
                    print(msg)
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== NTP MENU ====================
    
    def ntp_menu(self):
        """Menu NTP & Time configuration"""
        while True:
            self.print_header("NTP & TIME CONFIGURATION")
            print("""
    1. Show NTP Configuration
    2. Add NTP Server
    3. Delete NTP Server
    4. Set Timezone
    5. Show Syslog Config
    6. Add Syslog Server
    7. Delete Syslog Server
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-7]: ").strip()
            
            if choice == '1':
                print(self.system_mgr.show_ntp())
                self.press_enter()
            elif choice == '2':
                server = input("NTP Server (e.g., 0.id.pool.ntp.org): ").strip()
                if server:
                    prefer = input("Set as preferred? (y/n): ").strip().lower() == 'y'
                    success, msg = self.system_mgr.set_ntp_server(server, prefer)
                    print(msg)
                self.press_enter()
            elif choice == '3':
                server = input("NTP Server untuk dihapus: ").strip()
                if server:
                    success, msg = self.system_mgr.delete_ntp_server(server)
                    print(msg)
                self.press_enter()
            elif choice == '4':
                name = input("Timezone Name (e.g., WIB, UTC): ").strip()
                if name:
                    offset = self.input_int("UTC Offset (e.g., 7 for WIB): ", 0)
                    success, msg = self.system_mgr.set_timezone(name, offset)
                    print(msg)
                self.press_enter()
            elif choice == '5':
                print(self.system_mgr.show_syslog())
                self.press_enter()
            elif choice == '6':
                server = input("Syslog Server IP: ").strip()
                if server:
                    facility = input("Facility (default local0): ").strip() or "local0"
                    level = input("Level (default informational): ").strip() or "informational"
                    success, msg = self.system_mgr.add_syslog_server(server, facility, level)
                    print(msg)
                self.press_enter()
            elif choice == '7':
                server = input("Syslog Server untuk dihapus: ").strip()
                if server:
                    success, msg = self.system_mgr.delete_syslog_server(server)
                    print(msg)
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== USER MENU ====================
    
    def user_menu(self):
        """Menu user management"""
        while True:
            self.print_header("USER MANAGEMENT")
            print("""
    1. Show Users
    2. Add User
    3. Delete User
    4. Change Password
    5. Set Hostname
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-5]: ").strip()
            
            if choice == '1':
                print(self.system_mgr.show_users())
                self.press_enter()
            elif choice == '2':
                username = input("Username: ").strip()
                if username:
                    password = input("Password: ").strip()
                    privilege = self.input_int("Privilege Level (0-15, default 15): ", 15)
                    if password:
                        success, msg = self.system_mgr.add_user(username, password, privilege)
                        print(msg)
                self.press_enter()
            elif choice == '3':
                username = input("Username untuk dihapus: ").strip()
                if username:
                    confirm = input(f"Hapus user '{username}'? (y/n): ").strip().lower()
                    if confirm == 'y':
                        success, msg = self.system_mgr.delete_user(username)
                        print(msg)
                self.press_enter()
            elif choice == '4':
                username = input("Username: ").strip()
                if username:
                    password = input("New Password: ").strip()
                    if password:
                        success, msg = self.system_mgr.change_password(username, password)
                        print(msg)
                self.press_enter()
            elif choice == '5':
                hostname = input("Hostname baru: ").strip()
                if hostname:
                    success, msg = self.system_mgr.set_hostname(hostname)
                    print(msg)
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== SYSTEM INFO MENU ====================
    
    def system_info_menu(self):
        """Menu system information"""
        while True:
            self.print_header("SYSTEM INFORMATION")
            print("""
    1. Show System Info (Version & Hostname)
    2. Show System Overview (Card, Version, Config)
    3. Show Card Status
    4. Show Active Alarms
    5. Show Interface Status
    
    Note: ZTE C320 tidak menyediakan command untuk monitoring
          CPU usage, memory usage, atau temperature secara real-time.
    
    0. Kembali
            """)
            
            choice = input("Pilih [0-5]: ").strip()
            
            if choice == '1':
                print(self.system_mgr.show_system_info())
                self.press_enter()
            elif choice == '2':
                print(self.system_mgr.show_system_status())
                self.press_enter()
            elif choice == '3':
                print(self.system_mgr.show_card_status())
                self.press_enter()
            elif choice == '4':
                print(self.system_mgr.show_alarm())
                self.press_enter()
            elif choice == '5':
                iface = input("Interface (kosong untuk semua): ").strip() or None
                print(self.system_mgr.show_interface_status(iface))
                self.press_enter()
            elif choice == '0':
                break
    
    # ==================== UTILITY ====================
    
    def sync_onu_data(self):
        """Sync/Refresh semua data ONU dari OLT"""
        self.print_header("SYNC ONU DATA")
        
        print("""
    Pilih data yang akan di-sync:
    
    [1] Sync Unconfigured ONU (ONU belum terdaftar)
    [2] Sync Working ONU (ONU yang sudah terdaftar)
    [3] Sync All (Unconfigured + Working)
    [4] Sync Profiles (TCONT, Traffic, Line, Service)
    [5] Sync Everything (ONU + Profiles)
    
    [0] Batal
        """)
        
        choice = input("Pilih [0-5]: ").strip()
        
        if choice == '0':
            return
        
        print("\n" + "=" * 60)
        print("  SYNCING DATA FROM OLT...")
        print("=" * 60)
        
        if choice in ['1', '3', '5']:
            print("\n  [1/4] Syncing Unconfigured ONU...")
            unconfigured = self.register_wizard.fetch_unconfigured_onus()
            print(f"        ✓ Found {len(unconfigured)} unconfigured ONU")
        
        if choice in ['2', '3', '5']:
            print("\n  [2/4] Syncing Working ONU...")
            working = self.register_wizard.fetch_all_working_onus()
            print(f"        ✓ Found {len(working)} working ONU")
        
        if choice in ['4', '5']:
            print("\n  [3/4] Syncing TCONT Profiles...")
            tcont_profiles = self.register_wizard.fetch_tcont_profiles()
            print(f"        ✓ Found {len(tcont_profiles)} TCONT profiles")
            
            print("\n  [4/4] Syncing Traffic Profiles...")
            traffic_profiles = self.register_wizard.fetch_traffic_profiles()
            print(f"        ✓ Found {len(traffic_profiles)} Traffic profiles")
        
        print("\n" + "=" * 60)
        print("  SYNC COMPLETE!")
        print("=" * 60)
        
        # Tampilkan summary
        if choice in ['1', '3', '5']:
            if unconfigured:
                print("\n  Unconfigured ONU:")
                print("  " + "-" * 50)
                for idx, onu in enumerate(unconfigured[:10], 1):
                    print(f"    {idx}. PON {onu.get('pon_port', 'N/A')} - SN: {onu.get('sn', 'N/A')} - Model: {onu.get('model', 'N/A')}")
                if len(unconfigured) > 10:
                    print(f"    ... dan {len(unconfigured) - 10} lainnya")
        
        if choice in ['2', '3', '5']:
            if working:
                print("\n  Working ONU:")
                print("  " + "-" * 50)
                for idx, onu in enumerate(working[:10], 1):
                    print(f"    {idx}. {onu.get('pon_port', 'N/A')}:{onu.get('onu_id', 'N/A')} - {onu.get('name', 'N/A')} - {onu.get('status', 'N/A')}")
                if len(working) > 10:
                    print(f"    ... dan {len(working) - 10} lainnya")
        
        if choice in ['4', '5']:
            print("\n  Profiles:")
            print("  " + "-" * 50)
            print(f"    TCONT   : {', '.join(tcont_profiles[:5])}{'...' if len(tcont_profiles) > 5 else ''}")
            print(f"    Traffic : {', '.join(traffic_profiles[:5])}{'...' if len(traffic_profiles) > 5 else ''}")
        
        self.press_enter()
    
    def save_config(self):
        """Save configuration"""
        self.print_header("SAVE CONFIGURATION")
        confirm = input("Simpan konfigurasi ke startup-config? (y/n): ").strip().lower()
        if confirm == 'y':
            success, msg = self.system_mgr.save_config()
            print(msg)
        self.press_enter()
    
    def show_running_config(self):
        """Show running config"""
        self.print_header("RUNNING CONFIGURATION")
        filter_str = input("Filter string (kosong untuk semua): ").strip() or None
        print(self.system_mgr.show_running_config(filter_str))
        self.press_enter()
    
    def show_onu_running_config_with_list(self):
        """Show running config ONU dengan list working ONUs"""
        self.print_header("SHOW ONU RUNNING CONFIG")
        
        print("\n  Mengambil daftar ONU working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Filter hanya ONU working
        working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
        
        if not working_onus:
            print("  Tidak ada ONU dengan status working.")
            return
        
        # Tampilkan list
        print("\n" + "=" * 90)
        print(f"{'No':<5} {'PON Port':<12} {'ONU ID':<8} {'Name':<25} {'Type':<15} {'Status'}")
        print("=" * 90)
        
        for idx, onu in enumerate(working_onus, 1):
            onu_name = onu.get('name', 'N/A')[:24]
            onu_type = onu.get('type', 'N/A')[:14]
            # Clean pon_port display: "gpon-olt_1/1/1" -> "1/1/1"
            pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"{idx:<5} {pon_port_display:<12} {onu['onu_id']:<8} {onu_name:<25} {onu_type:<15} {onu.get('status', 'N/A')}")
        
        print("=" * 90)
        
        # Pilih ONU
        try:
            choice = input(f"\n  Pilih nomor ONU [1-{len(working_onus)}] atau [0] untuk batal: ").strip()
            
            if not choice or choice == '0':
                return
            
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                
                # Clean pon_port format: "gpon-olt_1/1/1" -> "1/1/1"
                pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id_full = f"{pon_port_clean}:{selected_onu['onu_id']}"
                
                print(f"\n  Mengambil running config untuk ONU {onu_id_full}...")
                print("\n" + self.onu_mgr.show_onu_running_config(onu_id_full))
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    def show_onu_vlan_omci(self):
        """Show VLAN OMCI configuration untuk ONU yang working"""
        self.clear_screen()
        self.print_header("SHOW VLAN OMCI CONFIGURATION")
        
        # Tampilkan daftar ONU yang working
        print("\n  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Tampilkan daftar
        print("\n  " + "="*70)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Name':<20} {'SN':<16}")
        print("  " + "="*70)
        
        for i, onu in enumerate(working_onus, 1):
            name = onu.get('name', '-')[:19]
            sn = onu.get('sn', '-')
            pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"  {i:<4} {pon_port_display:<12} {onu['onu_id']:<8} {name:<20} {sn:<16}")
        
        print("  " + "="*70)
        
        # Pilih ONU
        choice = input("\n  Pilih nomor ONU (0=batal): ").strip()
        if choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                
                # Clean pon_port format
                pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id_full = f"{pon_port_clean}:{selected_onu['onu_id']}"
                
                print(f"\n  Mengambil VLAN OMCI config untuk ONU {onu_id_full}...")
                print("\n" + self.onu_mgr.show_onu_vlan_omci(onu_id_full))
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    def set_lan_binding_with_list(self):
        """Set LAN Port Binding dengan list ONU working"""
        self.clear_screen()
        self.print_header("SET LAN PORT BINDING")
        
        # Tampilkan daftar ONU yang working
        print("\n  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Tampilkan daftar
        print("\n  " + "="*70)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Name':<20} {'SN':<16}")
        print("  " + "="*70)
        
        for i, onu in enumerate(working_onus, 1):
            name = onu.get('name', '-')[:19]
            sn = onu.get('sn', '-')
            pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"  {i:<4} {pon_port_display:<12} {onu['onu_id']:<8} {name:<20} {sn:<16}")
        
        print("  " + "="*70)
        
        # Pilih ONU
        choice = input("\n  Pilih nomor ONU (0=batal): ").strip()
        if choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                
                # Parse PON info
                pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                parts = pon_port_clean.split('/')
                slot = int(parts[0]) if len(parts) > 0 else 1
                port = int(parts[1]) if len(parts) > 1 else 1
                onu_id = int(selected_onu['onu_id'])
                
                print(f"\n  ONU Selected: {pon_port_clean}:{onu_id} - {selected_onu.get('name', 'N/A')}")
                print("  " + "-"*70)
                
                # Input LAN binding config
                lan_port = self.input_int("  LAN Port (1-4): ", 1)
                if not lan_port:
                    return
                
                vlan_id = self.input_int("  VLAN ID: ")
                if not vlan_id:
                    return
                
                mode = input("  Mode [transparent/tag]: ").strip().lower()
                if mode not in ['transparent', 'tag']:
                    print("  Mode tidak valid. Gunakan 'transparent' atau 'tag'")
                    return
                
                # Execute LAN binding
                print(f"\n  Setting LAN Port {lan_port} binding...")
                success, msg = self.onu_mgr.set_lan_binding(slot, port, onu_id, lan_port, vlan_id, mode)
                print(f"\n  {msg}")
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    def set_wlan_binding_with_list(self):
        """Set WLAN (WiFi) Binding dengan list ONU working"""
        self.clear_screen()
        self.print_header("SET WLAN (WiFi) BINDING")
        
        # Tampilkan daftar ONU yang working
        print("\n  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Tampilkan daftar
        print("\n  " + "="*70)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Name':<20} {'SN':<16}")
        print("  " + "="*70)
        
        for i, onu in enumerate(working_onus, 1):
            name = onu.get('name', '-')[:19]
            sn = onu.get('sn', '-')
            pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"  {i:<4} {pon_port_display:<12} {onu['onu_id']:<8} {name:<20} {sn:<16}")
        
        print("  " + "="*70)
        
        # Pilih ONU
        choice = input("\n  Pilih nomor ONU (0=batal): ").strip()
        if choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                
                # Parse PON info
                pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                parts = pon_port_clean.split('/')
                slot = int(parts[0]) if len(parts) > 0 else 1
                port = int(parts[1]) if len(parts) > 1 else 1
                onu_id = int(selected_onu['onu_id'])
                
                print(f"\n  ONU Selected: {pon_port_clean}:{onu_id} - {selected_onu.get('name', 'N/A')}")
                print("  " + "-"*70)
                
                # Input WLAN binding config
                ssid_index = self.input_int("  SSID Index (1-4, default 1): ", 1)
                if not ssid_index:
                    ssid_index = 1
                
                vlan_id = self.input_int("  VLAN ID: ")
                if not vlan_id:
                    return
                
                mode = input("  Mode [transparent/tag]: ").strip().lower()
                if mode not in ['transparent', 'tag']:
                    print("  Mode tidak valid. Gunakan 'transparent' atau 'tag'")
                    return
                
                # Execute WLAN binding
                print(f"\n  Setting WLAN (WiFi) SSID {ssid_index} binding...")
                success, msg = self.onu_mgr.set_wlan_binding(slot, port, onu_id, ssid_index, vlan_id, mode)
                print(f"\n  {msg}")
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    def auto_bind_config_menu(self):
        """Menu konfigurasi auto-provision (untuk working ONU saja)"""
        self.clear_screen()
        self.print_header("AUTO-PROVISION MANAGEMENT")
        
        print("""
  📋 KONSEP AUTO-PROVISION:
  
  ✔ Discovery      : ONU uncfg terdeteksi di 'show gpon onu uncfg'
  ✔ Register       : MANUAL - User pilih ONU dari uncfg list
  ✔ Provision      : Configure profile untuk ONU yang sudah working
  
  ⚠️  Auto-Learning ZTE C320 = Auto-Register
      Jika diaktifkan, SEMUA ONU uncfg akan OTOMATIS terdaftar.
      Disarankan tetap DISABLED untuk kontrol manual.
  
  === DISCOVERY & REGISTER ===
  1. Show ONU Unconfigured (untuk register manual)
  2. Register ONU dari Uncfg List → Ke Menu Register Wizard
  
  === PROVISION (Working ONU) ===
  3. Show ONU Working (yang sudah terdaftar)
  4. Auto-Provision ONU (pilih individual)
  5. Clone Config ONU (copy dari ONU template)
  6. Delete ONU yang Tidak Diinginkan
  
  === AUTO-LEARNING STATUS ===
  7. Show Auto-Learning Status (per PON port)
  8. Enable Auto-Learning (⚠ auto-register semua ONU!)
  9. Disable Auto-Learning (✓ recommended)
  
  0. Kembali
        """)
        
        choice = input("Pilih [0-9]: ").strip()
        
        if choice == '1':
            self.show_unconfigured_onus_for_register()
        
        elif choice == '2':
            # Redirect ke register wizard
            print("\n  Mengarahkan ke Register ONU Wizard...")
            self.press_enter()
            return  # User akan kembali ke menu dan pilih register manual
        
        elif choice == '3':
            self.show_working_onus_detail()
        
        elif choice == '4':
            self.auto_provision_working_onus()
        
        elif choice == '5':
            self.clone_onu_configuration()
        
        elif choice == '6':
            self.delete_unwanted_onu()
        
        elif choice == '7':
            self.show_auto_learning_status()
        
        elif choice == '8':
            self.enable_auto_bind_with_list()
        
        elif choice == '9':
            self.disable_auto_bind_with_list()
    
    def auto_provision_working_onus(self):
        """Provision ONU working secara individual (pilih satu-satu)"""
        self.clear_screen()
        self.print_header("AUTO-PROVISION ONU")
        
        print("\n  📋 FITUR AUTO-PROVISION:")
        print("  - Pilih ONU working yang akan dikonfigurasi")
        print("  - Configure VLAN, Profile, Service secara individual")
        print("  - Untuk kontrol penuh atas konfigurasi ONU")
        
        print("\n  Mengambil daftar ONU working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("\n  Tidak ada ONU working untuk di-provision.")
            self.press_enter()
            return
        
        # Tampilkan SEMUA ONU working
        print(f"\n  Ditemukan {len(working_onus)} ONU working:")
        print("\n  " + "="*85)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<18} {'SN':<16} {'Name'}")
        print("  " + "="*85)
        
        for i, onu in enumerate(working_onus, 1):
            port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')[:16]
            sn = onu.get('sn', 'N/A')
            name = onu.get('name', 'N/A')[:15]
            
            # Mark ONU yang belum di-provision (universalOnuType)
            marker = "⚠" if 'universal' in onu_type.lower() else " "
            
            print(f"  {marker}{i:<3} {port_clean:<12} {onu_id:<8} {onu_type:<18} {sn:<16} {name}")
        
        print("  " + "="*85)
        print("\n  ⚠ = ONU yang mungkin perlu konfigurasi (auto-registered)")
        
        # Pilih ONU untuk di-provision
        choice = input("\n  Pilih nomor ONU untuk provision (0=kembali): ").strip()
        if choice == '0' or not choice:
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                self.provision_single_onu(selected_onu)
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
        
        self.press_enter()
    
    def provision_single_onu(self, onu):
        """Provision satu ONU dengan konfigurasi"""
        port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
        onu_id = onu.get('onu_id', '?')
        onu_type = onu.get('type', 'N/A')
        sn = onu.get('sn', 'N/A')
        name = onu.get('name', 'N/A')
        
        print(f"\n  {'='*70}")
        print(f"  PROVISION ONU - gpon-olt_{port_clean}:{onu_id}")
        print(f"  {'='*70}")
        print(f"  Type    : {onu_type}")
        print(f"  SN      : {sn}")
        print(f"  Name    : {name}")
        print(f"  {'='*70}")
        
        print("\n  Pilih konfigurasi:")
        print("  1. Configure VLAN (manual)")
        print("  2. Re-Apply Config (dari OLT)")
        print("  3. View Current Config")
        print("  0. Kembali")
        
        sub_choice = input("\n  Pilih [0-3]: ").strip()
        
        if sub_choice == '1':
            self.provision_onu_vlan(onu, port_clean, onu_id)
        elif sub_choice == '2':
            self.provision_onu_all_config(onu, port_clean, onu_id)
        elif sub_choice == '3':
            self.show_onu_current_config(port_clean, onu_id)
    
    def provision_onu_all_config(self, onu, port_clean, onu_id):
        """Re-apply config yang sudah tersimpan di OLT ke ONU (untuk kasus ONU di-reset)"""
        print(f"\n  {'='*70}")
        print(f"  RE-APPLY CONFIG - ONU {onu_id}")
        print(f"  {'='*70}")
        print("  Fitur ini akan:")
        print("  - Membaca config yang SUDAH tersimpan di OLT")
        print("  - Re-apply config ke ONU (untuk ONU yang di-reset)")
        print(f"  {'='*70}")
        
        onu_id_full = f"1/1/{port_clean.split('/')[0]}:{onu_id}"
        
        # 1. Baca config yang sudah tersimpan di OLT
        print("\n  📖 Membaca config dari OLT...")
        
        # Get running-config untuk interface gpon-onu
        success1, onu_config = self.client.execute_command(
            f"show running-config interface gpon-onu_{onu_id_full}", 
            timeout=10
        )
        
        # Get running-config untuk pon-onu-mng
        success2, mng_config = self.client.execute_command(
            f"show pon-onu-mng gpon-onu_{onu_id_full}", 
            timeout=10
        )
        
        if not success1 and not success2:
            print("\n  ✗ Gagal membaca config dari OLT")
            return
        
        # Parse config interface gpon-onu
        onu_commands = []
        if success1 and onu_config:
            in_interface = False
            for line in onu_config.split('\n'):
                line = line.strip()
                if line.startswith('interface gpon-onu'):
                    in_interface = True
                    continue
                elif line.startswith('!') or line.startswith('end'):
                    in_interface = False
                    continue
                
                if in_interface and line and not line.startswith('#'):
                    # Skip sn dan type-xxx (sudah di-set saat register)
                    if not line.startswith('sn') and not line.startswith('type-'):
                        onu_commands.append(line)
        
        # Parse config pon-onu-mng  
        mng_commands = []
        if success2 and mng_config:
            in_mng = False
            for line in mng_config.split('\n'):
                line = line.strip()
                if 'pon-onu-mng' in line:
                    in_mng = True
                    continue
                elif line.startswith('!') or line.startswith('end') or not line:
                    continue
                
                if in_mng and line and not line.startswith('#'):
                    mng_commands.append(line)
        
        total_commands = len(onu_commands) + len(mng_commands)
        
        if total_commands == 0:
            print("\n  ⚠️  Tidak ada config tambahan yang tersimpan di OLT")
            print("  ONU ini mungkin belum pernah dikonfigurasi")
            return
        
        # Tampilkan config yang ditemukan
        print(f"\n  ✓ Ditemukan {total_commands} config di OLT:")
        
        if onu_commands:
            print(f"\n  [Interface gpon-onu] ({len(onu_commands)} cmd):")
            for cmd in onu_commands[:5]:
                print(f"    - {cmd}")
            if len(onu_commands) > 5:
                print(f"    ... dan {len(onu_commands)-5} lainnya")
        
        if mng_commands:
            print(f"\n  [PON-ONU-MNG] ({len(mng_commands)} cmd):")
            for cmd in mng_commands[:5]:
                print(f"    - {cmd}")
            if len(mng_commands) > 5:
                print(f"    ... dan {len(mng_commands)-5} lainnya")
        
        # Konfirmasi
        print(f"\n  {'='*70}")
        confirm = input("  Re-apply config ini ke ONU? (y/n): ").strip().lower()
        if confirm != 'y':
            print("  Dibatalkan")
            return
        
        # 2. Apply config ke ONU
        print(f"\n  ⏳ Re-applying config ke ONU {onu_id}...")
        
        success_count = 0
        failed_count = 0
        
        # Apply interface gpon-onu commands
        if onu_commands:
            print("\n  [1/2] Apply interface gpon-onu config...")
            self.client.execute_command("configure terminal", timeout=3)
            self.client.execute_command(f"interface gpon-onu_{onu_id_full}", timeout=3)
            
            for cmd in onu_commands:
                success, output = self.client.execute_command(cmd, timeout=5)
                if success and '%error' not in output.lower():
                    success_count += 1
                    print(f"  ✓ {cmd[:55]}")
                else:
                    failed_count += 1
                    print(f"  ✗ {cmd[:55]}")
            
            self.client.execute_command("exit", timeout=2)
            self.client.execute_command("exit", timeout=2)
        
        # Apply pon-onu-mng commands
        if mng_commands:
            print("\n  [2/2] Apply pon-onu-mng config...")
            self.client.execute_command("configure terminal", timeout=3)
            self.client.execute_command(f"pon-onu-mng gpon-onu_{onu_id_full}", timeout=3)
            
            for cmd in mng_commands:
                success, output = self.client.execute_command(cmd, timeout=5)
                if success and '%error' not in output.lower():
                    success_count += 1
                    print(f"  ✓ {cmd[:55]}")
                else:
                    failed_count += 1
                    print(f"  ✗ {cmd[:55]}")
            
            self.client.execute_command("exit", timeout=2)
            self.client.execute_command("exit", timeout=2)
        
        # Save (optional, config sudah ada di OLT)
        print("\n  💾 Menyimpan...")
        self.client.execute_command("write", timeout=10)
        
        # Summary
        print(f"\n  {'='*70}")
        print(f"  HASIL RE-APPLY CONFIG:")
        print(f"  ✓ Berhasil: {success_count} command")
        print(f"  ✗ Gagal: {failed_count} command")
        print(f"  {'='*70}")
        
        if success_count > 0:
            print(f"\n  ✓ Config berhasil di-apply ke ONU {onu_id}!")
            print(f"  ONU akan menerima config dari OLT")
        else:
            print(f"\n  ⚠ Re-apply gagal, cek koneksi ONU")
    
    def provision_onu_vlan(self, onu, port_clean, onu_id):
        """Configure VLAN untuk ONU"""
        print(f"\n  Configure VLAN untuk ONU {onu_id} di port {port_clean}")
        
        vlan = input("\n  Masukkan VLAN ID (misal: 100): ").strip()
        if not vlan:
            print("  Dibatalkan")
            return
        
        print(f"\n  Mengkonfigurasi VLAN {vlan} untuk ONU...")
        
        # Configure VLAN via gpon commands
        onu_id_full = f"1/1/{port_clean.split('/')[0]}:{onu_id}"
        
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command(f"interface gpon-onu_{onu_id_full}", timeout=3)
        
        # Set VLAN
        success, output = self.client.execute_command(f"vlan port eth_0/1 mode tag vlan {vlan}", timeout=5)
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("exit", timeout=2)
        
        # Save
        self.client.execute_command("write", timeout=10)
        
        if success and "%error" not in output.lower():
            print(f"\n  ✓ VLAN {vlan} berhasil dikonfigurasi")
        else:
            print(f"\n  ✗ Gagal configure VLAN: {output}")
    
    def provision_onu_static_ip(self, onu, port_clean, onu_id):
        """Configure Static IP untuk ONU"""
        print(f"\n  Configure Static IP untuk ONU {onu_id} di port {port_clean}")
        print("  Gunakan menu: [2] ONU Management > [4] Set Static IP")
        print(f"  Atau gunakan ONU Config Manager untuk konfigurasi detail")
    
    def show_onu_current_config(self, port_clean, onu_id):
        """Show current config ONU"""
        print(f"\n  Current Config ONU {onu_id} di port {port_clean}:")
        
        onu_id_full = f"1/1/{port_clean.split('/')[0]}:{onu_id}"
        
        success, output = self.client.execute_command(f"show running-config interface gpon-onu_{onu_id_full}", timeout=10)
        
        if success and output:
            print("\n" + output)
        else:
            print("\n  ✗ Gagal mengambil config")
    
    def auto_apply_from_template(self, target_onu, target_port_clean, target_id):
        """Otomatis apply config dari ONU template yang sudah ada"""
        
        # Cari ONU template (ONU lain yang sudah punya config)
        print("\n  🔍 Mencari template ONU...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        # Filter ONU selain target dan cari yang punya config lengkap
        template_onu = None
        template_config_lines = []
        
        for onu in working_onus:
            onu_port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', 0)
            
            # Skip ONU target
            if onu_port == target_port_clean and onu_id == target_id:
                continue
            
            # Skip ONU universal (belum dikonfigurasi)
            onu_type = onu.get('type', '')
            if 'universal' in onu_type.lower():
                continue
            
            # Check apakah ONU ini punya config
            onu_full = f"1/1/{onu_port.split('/')[0]}:{onu_id}"
            success, config = self.client.execute_command(
                f"show running-config interface gpon-onu_{onu_full}", 
                timeout=10
            )
            
            if not success or not config:
                continue
            
            # Parse config
            config_lines = []
            in_interface = False
            for line in config.split('\n'):
                line = line.strip()
                if line.startswith('interface gpon-onu'):
                    in_interface = True
                    continue
                elif line.startswith('!') or line.startswith('end'):
                    in_interface = False
                    continue
                
                if in_interface and line and not line.startswith('#'):
                    if 'sn ' not in line.lower() and 'onu ' not in line.lower():
                        config_lines.append(line)
            
            # Jika punya config, gunakan sebagai template
            if len(config_lines) > 0:
                template_onu = onu
                template_config_lines = config_lines
                break
        
        if not template_onu or not template_config_lines:
            print("\n  ⚠️  Tidak ada ONU template dengan konfigurasi.")
            print("  Anda perlu mengkonfigurasi minimal 1 ONU terlebih dahulu.")
            print("\n  Gunakan menu: [2] ONU Management > [3] Configure Existing ONU")
            return
        
        # Template ditemukan
        template_port = template_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
        template_id = template_onu.get('onu_id', '?')
        
        print(f"\n  ✓ Template ditemukan: ONU {template_id} di port {template_port}")
        print(f"    Type: {template_onu.get('type', 'N/A')}")
        print(f"    Config: {len(template_config_lines)} commands")
        
        # Preview config
        print("\n  📋 Konfigurasi yang akan diterapkan:")
        for i, line in enumerate(template_config_lines[:5], 1):
            print(f"    {i}. {line}")
        if len(template_config_lines) > 5:
            print(f"    ... dan {len(template_config_lines)-5} config lainnya")
        
        # Konfirmasi singkat
        print(f"\n  " + "="*60)
        print(f"  TARGET : ONU {target_id} @ port {target_port_clean}")
        print(f"  SOURCE : ONU {template_id} @ port {template_port}")
        print(f"  " + "="*60)
        
        confirm = input("\n  Apply config? (y/n): ").strip().lower()
        if confirm != 'y':
            print("  Dibatalkan")
            return
        
        # Apply config langsung
        print(f"\n  ⏳ Menerapkan {len(template_config_lines)} config...")
        target_onu_full = f"1/1/{target_port_clean.split('/')[0]}:{target_id}"
        
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command(f"interface gpon-onu_{target_onu_full}", timeout=3)
        
        success_count = 0
        failed_count = 0
        
        for cmd in template_config_lines:
            success, output = self.client.execute_command(cmd, timeout=5)
            if success and '%error' not in output.lower():
                success_count += 1
                print(f"  ✓ {cmd[:55]}")
            else:
                failed_count += 1
                print(f"  ✗ {cmd[:55]}")
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("exit", timeout=2)
        
        # Save
        print("\n  💾 Menyimpan...")
        self.client.execute_command("write", timeout=10)
        
        # Result
        print(f"\n  " + "="*60)
        if success_count > 0:
            print(f"  ✓ AUTO-PROVISION BERHASIL!")
            print(f"    {success_count} config diterapkan")
            if failed_count > 0:
                print(f"    {failed_count} config gagal")
        else:
            print(f"  ✗ AUTO-PROVISION GAGAL")
        print(f"  " + "="*60)
    
    def apply_all_config_to_onu(self, target_onu, target_port_clean, target_id):
        """Apply semua konfigurasi dari ONU template ke ONU target"""
        print("\n  " + "="*70)
        print("  APPLY ALL CONFIG - AUTO PROVISION")
        print("  " + "="*70)
        
        print("\n  Fitur ini akan:")
        print("  1. Pilih ONU template (yang sudah dikonfigurasi)")
        print("  2. Copy SEMUA konfigurasi ke ONU ini")
        print("  3. Apply secara otomatis")
        
        # Get all working ONUs untuk pilih template
        print("\n  Mengambil daftar ONU working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if len(working_onus) < 2:
            print("\n  ⚠️  Minimal perlu 2 ONU working.")
            print("  (1 sebagai template, 1 sebagai target)")
            self.press_enter()
            return
        
        # Filter ONU selain target
        template_list = []
        for onu in working_onus:
            onu_port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', 0)
            # Skip ONU target
            if onu_port == target_port_clean and onu_id == target_id:
                continue
            template_list.append(onu)
        
        if not template_list:
            print("\n  ⚠️  Tidak ada ONU lain yang bisa dijadikan template")
            self.press_enter()
            return
        
        # Tampilkan ONU yang bisa jadi template
        print("\n  PILIH ONU TEMPLATE (sumber konfigurasi):")
        print("  " + "="*90)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<18} {'SN':<16} {'Name'}")
        print("  " + "="*90)
        
        for i, onu in enumerate(template_list, 1):
            port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')[:16]
            sn = onu.get('sn', 'N/A')
            name = onu.get('name', 'N/A')[:15]
            
            # Highlight ONU dengan type lengkap
            marker = "✓" if 'universal' not in onu_type.lower() else " "
            
            print(f"  {marker}{i:<3} {port_clean:<12} {onu_id:<8} {onu_type:<18} {sn:<16} {name}")
        
        print("  " + "="*90)
        print("\n  ✓ = ONU dengan konfigurasi lengkap (recommended)")
        
        # Pilih template
        template_choice = input("\n  Pilih nomor ONU template (0=batal): ").strip()
        if template_choice == '0' or not template_choice:
            return
        
        try:
            template_idx = int(template_choice) - 1
            if not (0 <= template_idx < len(template_list)):
                print("  Pilihan tidak valid")
                self.press_enter()
                return
            
            template_onu = template_list[template_idx]
            template_port = template_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            template_id = template_onu.get('onu_id', '?')
            
            print(f"\n  ✓ Template: ONU {template_id} di port {template_port}")
            print(f"    Type: {template_onu.get('type', 'N/A')}")
            
            # Get template config
            print("\n  Mengambil konfigurasi template...")
            template_onu_full = f"1/1/{template_port.split('/')[0]}:{template_id}"
            success, template_config = self.client.execute_command(
                f"show running-config interface gpon-onu_{template_onu_full}", 
                timeout=15
            )
            
            if not success or not template_config:
                print("  ✗ Gagal mengambil config template")
                self.press_enter()
                return
            
            # Parse config
            config_lines = []
            in_interface = False
            for line in template_config.split('\n'):
                line = line.strip()
                if line.startswith('interface gpon-onu'):
                    in_interface = True
                    continue
                elif line.startswith('!') or line.startswith('end'):
                    in_interface = False
                    continue
                
                if in_interface and line and not line.startswith('#'):
                    # Skip unique commands
                    if 'sn ' not in line.lower() and 'onu ' not in line.lower():
                        config_lines.append(line)
            
            if not config_lines:
                print("  ⚠️  Template tidak memiliki konfigurasi tambahan")
                self.press_enter()
                return
            
            print(f"\n  ✓ Ditemukan {len(config_lines)} baris konfigurasi")
            print("\n  Konfigurasi yang akan diterapkan:")
            for i, line in enumerate(config_lines[:8], 1):
                print(f"    {i}. {line}")
            if len(config_lines) > 8:
                print(f"    ... dan {len(config_lines)-8} config lainnya")
            
            # Konfirmasi
            print("\n  " + "="*70)
            print(f"  TARGET: ONU {target_id} di port {target_port_clean}")
            print(f"  SOURCE: ONU {template_id} di port {template_port}")
            print(f"  TOTAL CONFIG: {len(config_lines)} commands")
            print("  " + "="*70)
            
            confirm = input("\n  Yakin apply semua config? (y/n): ").strip().lower()
            if confirm != 'y':
                print("  Dibatalkan")
                self.press_enter()
                return
            
            # Apply config
            print(f"\n  Menerapkan konfigurasi ke ONU {target_id}...")
            target_onu_full = f"1/1/{target_port_clean.split('/')[0]}:{target_id}"
            
            self.client.execute_command("configure terminal", timeout=3)
            self.client.execute_command(f"interface gpon-onu_{target_onu_full}", timeout=3)
            
            success_count = 0
            failed_count = 0
            failed_commands = []
            
            for cmd in config_lines:
                success, output = self.client.execute_command(cmd, timeout=5)
                if success and '%error' not in output.lower():
                    success_count += 1
                    print(f"  ✓ {cmd[:60]}")
                else:
                    failed_count += 1
                    failed_commands.append(cmd)
                    print(f"  ✗ {cmd[:60]}")
            
            self.client.execute_command("exit", timeout=2)
            self.client.execute_command("exit", timeout=2)
            
            # Save config
            print("\n  Menyimpan konfigurasi...")
            self.client.execute_command("write", timeout=10)
            
            # Summary
            print("\n  " + "="*70)
            print("  HASIL AUTO-PROVISION:")
            print(f"  ✓ Berhasil: {success_count} command")
            print(f"  ✗ Gagal: {failed_count} command")
            
            if failed_count > 0 and failed_commands:
                print("\n  Command yang gagal:")
                for cmd in failed_commands[:3]:
                    print(f"    - {cmd}")
                if len(failed_commands) > 3:
                    print(f"    ... dan {len(failed_commands)-3} lagi")
            
            print("  " + "="*70)
            
            if success_count > 0:
                print(f"\n  ✓ Auto-provision berhasil!")
                print(f"  ONU {target_id} sekarang memiliki konfigurasi yang sama dengan ONU {template_id}")
            else:
                print("\n  ✗ Auto-provision gagal")
            
        except ValueError:
            print("  Input tidak valid")
        except Exception as e:
            print(f"\n  ✗ Error: {str(e)}")
        
        self.press_enter()
    
    def clone_onu_configuration(self):
        """Clone konfigurasi dari ONU template ke ONU target"""
        self.clear_screen()
        self.print_header("CLONE ONU CONFIGURATION")
        
        print("\n  📋 FITUR CLONE CONFIG:")
        print("  - Pilih ONU sebagai TEMPLATE (yang sudah dikonfigurasi)")
        print("  - Pilih ONU TARGET (yang akan dikonfigurasi)")
        print("  - Copy semua konfigurasi dari template ke target")
        
        print("\n  Mengambil daftar ONU working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if len(working_onus) < 2:
            print("\n  ⚠️  Minimal perlu 2 ONU working untuk clone config.")
            print("  (1 sebagai template, 1 sebagai target)")
            self.press_enter()
            return
        
        # Tampilkan semua ONU
        print(f"\n  Ditemukan {len(working_onus)} ONU working:")
        print("\n  " + "="*90)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<18} {'SN':<16} {'Name'}")
        print("  " + "="*90)
        
        for i, onu in enumerate(working_onus, 1):
            port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')[:16]
            sn = onu.get('sn', 'N/A')
            name = onu.get('name', 'N/A')[:15]
            
            # Highlight ONU dengan type lengkap (bukan universalOnuType)
            marker = "✓" if 'universal' not in onu_type.lower() else " "
            
            print(f"  {marker}{i:<3} {port_clean:<12} {onu_id:<8} {onu_type:<18} {sn:<16} {name}")
        
        print("  " + "="*90)
        print("\n  ✓ = ONU dengan konfigurasi lengkap (recommended sebagai template)")
        
        # Step 1: Pilih ONU Template
        print("\n  STEP 1: PILIH ONU TEMPLATE (sumber konfigurasi)")
        template_choice = input("  Pilih nomor ONU template (0=batal): ").strip()
        if template_choice == '0' or not template_choice:
            return
        
        try:
            template_idx = int(template_choice) - 1
            if not (0 <= template_idx < len(working_onus)):
                print("  Pilihan tidak valid")
                self.press_enter()
                return
            
            template_onu = working_onus[template_idx]
            template_port = template_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            template_id = template_onu.get('onu_id', '?')
            
            print(f"\n  ✓ Template: ONU {template_id} di port {template_port}")
            print(f"    Type: {template_onu.get('type', 'N/A')}")
            print(f"    SN: {template_onu.get('sn', 'N/A')}")
            
            # Get template config
            print("\n  Mengambil konfigurasi template...")
            template_onu_full = f"1/1/{template_port.split('/')[0]}:{template_id}"
            success, template_config = self.client.execute_command(
                f"show running-config interface gpon-onu_{template_onu_full}", 
                timeout=15
            )
            
            if not success or not template_config:
                print("  ✗ Gagal mengambil config template")
                self.press_enter()
                return
            
            # Parse config untuk ekstrak command penting
            config_lines = []
            in_interface = False
            for line in template_config.split('\n'):
                line = line.strip()
                if line.startswith('interface gpon-onu'):
                    in_interface = True
                    continue
                elif line.startswith('!') or line.startswith('end'):
                    in_interface = False
                    continue
                
                if in_interface and line and not line.startswith('#'):
                    # Skip commands yang tidak bisa di-copy
                    if 'sn ' not in line.lower() and 'onu ' not in line.lower():
                        config_lines.append(line)
            
            if not config_lines:
                print("  ⚠️  Template tidak memiliki konfigurasi tambahan")
                print("  Hanya ada basic configuration")
                self.press_enter()
                return
            
            print(f"\n  ✓ Ditemukan {len(config_lines)} baris konfigurasi:")
            for line in config_lines[:5]:
                print(f"    - {line}")
            if len(config_lines) > 5:
                print(f"    ... dan {len(config_lines)-5} lagi")
            
            # Step 2: Pilih ONU Target
            print("\n  STEP 2: PILIH ONU TARGET (yang akan dikonfigurasi)")
            print("  " + "="*90)
            
            # Tampilkan ONU selain template
            target_list = []
            for i, onu in enumerate(working_onus):
                if i == template_idx:
                    continue
                target_list.append((i, onu))
            
            for idx, (original_idx, onu) in enumerate(target_list, 1):
                port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id = onu.get('onu_id', '?')
                onu_type = onu.get('type', 'N/A')[:16]
                sn = onu.get('sn', 'N/A')
                name = onu.get('name', 'N/A')[:15]
                
                print(f"  {idx:<4} {port_clean:<12} {onu_id:<8} {onu_type:<18} {sn:<16} {name}")
            
            print("  " + "="*90)
            
            target_choice = input("\n  Pilih nomor ONU target (0=batal): ").strip()
            if target_choice == '0' or not target_choice:
                return
            
            target_idx_in_list = int(target_choice) - 1
            if not (0 <= target_idx_in_list < len(target_list)):
                print("  Pilihan tidak valid")
                self.press_enter()
                return
            
            _, target_onu = target_list[target_idx_in_list]
            target_port = target_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            target_id = target_onu.get('onu_id', '?')
            
            print(f"\n  ✓ Target: ONU {target_id} di port {target_port}")
            print(f"    Type: {target_onu.get('type', 'N/A')}")
            print(f"    SN: {target_onu.get('sn', 'N/A')}")
            
            # Step 3: Konfirmasi
            print("\n  " + "="*70)
            print("  KONFIRMASI CLONE CONFIG:")
            print(f"  FROM: ONU {template_id} ({template_port}) → TO: ONU {target_id} ({target_port})")
            print(f"  Total commands: {len(config_lines)}")
            print("  " + "="*70)
            
            confirm = input("\n  Yakin ingin clone konfigurasi? (y/n): ").strip().lower()
            if confirm != 'y':
                print("  Dibatalkan")
                self.press_enter()
                return
            
            # Step 4: Apply Config ke Target
            print(f"\n  Menerapkan konfigurasi ke ONU {target_id}...")
            target_onu_full = f"1/1/{target_port.split('/')[0]}:{target_id}"
            
            self.client.execute_command("configure terminal", timeout=3)
            self.client.execute_command(f"interface gpon-onu_{target_onu_full}", timeout=3)
            
            success_count = 0
            failed_count = 0
            
            for cmd in config_lines:
                success, output = self.client.execute_command(cmd, timeout=5)
                if success and '%error' not in output.lower():
                    success_count += 1
                else:
                    failed_count += 1
                    print(f"  ⚠ Gagal: {cmd[:50]}...")
            
            self.client.execute_command("exit", timeout=2)
            self.client.execute_command("exit", timeout=2)
            
            # Save config
            print("\n  Menyimpan konfigurasi...")
            self.client.execute_command("write", timeout=10)
            
            # Summary
            print("\n  " + "="*70)
            print("  HASIL CLONE CONFIG:")
            print(f"  ✓ Berhasil: {success_count} command")
            print(f"  ✗ Gagal: {failed_count} command")
            print("  " + "="*70)
            
            if success_count > 0:
                print(f"\n  ✓ Konfigurasi berhasil di-clone ke ONU {target_id}")
                print(f"  Gunakan 'View Current Config' untuk verifikasi")
            else:
                print("\n  ✗ Clone config gagal. Periksa compatibility ONU")
            
        except ValueError:
            print("  Input tidak valid")
        except Exception as e:
            print(f"\n  ✗ Error: {str(e)}")
        
        self.press_enter()
    
    def show_unconfigured_onus_for_register(self):
        """Show ONU unconfigured untuk register manual"""
        self.clear_screen()
        self.print_header("ONU UNCONFIGURED (UNTUK REGISTER MANUAL)")
        
        print("\n  Mengambil daftar ONU yang belum dikonfigurasi...")
        
        success, output = self.client.execute_command("show gpon onu uncfg", timeout=10)
        
        if success and output:
            if "no related information" in output.lower():
                print("\n  ✓ Tidak ada ONU unconfigured saat ini.")
                print("\n  Semua ONU yang terdeteksi sudah terdaftar.")
            else:
                print("\n  ONU yang belum dikonfigurasi:")
                print("  " + "="*70)
                # Parse and display output
                lines = output.split('\n')
                for line in lines:
                    if line.strip() and not line.startswith('ZXAN'):
                        print(f"  {line}")
                print("  " + "="*70)
                print("\n  📋 Untuk register ONU, gunakan menu:")
                print("     [2] ONU Management > [2] Register ONU (Wizard)")
        else:
            print("\n  ✗ Gagal mengambil data ONU unconfigured")
        
        self.press_enter()
    
    def show_working_onus_detail(self):
        """Show detail ONU yang sudah working"""
        self.clear_screen()
        self.print_header("ONU WORKING (SUDAH TERDAFTAR)")
        
        print("\n  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("\n  Tidak ada ONU yang working saat ini.")
            self.press_enter()
            return
        
        print("\n  " + "="*90)
        print(f"  {'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Type':<18} {'SN':<16} {'Status'}")
        print("  " + "="*90)
        
        for i, onu in enumerate(working_onus, 1):
            port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')[:16]
            sn = onu.get('sn', 'N/A')
            status = onu.get('status', 'N/A')
            
            # Mark auto-registered ONU
            if 'universal' in onu_type.lower():
                onu_type = f"⚠{onu_type}"
            
            print(f"  {i:<4} {port_clean:<12} {onu_id:<8} {onu_type:<18} {sn:<16} {status}")
        
        print("  " + "="*90)
        print(f"\n  Total: {len(working_onus)} ONU working")
        print("\n  ⚠ = ONU dengan type 'universalOnuType' (hasil auto-learning)")
        
        self.press_enter()
    
    def show_auto_learning_status(self):
        """Show status auto-learning per PON port"""
        self.clear_screen()
        self.print_header("AUTO-LEARNING STATUS")
        
        print("\n  Mengambil status auto-learning dari ONU yang sudah terdaftar...\n")
        
        # Get all working ONUs untuk cek port nya
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang terdaftar untuk dicek status auto-learning")
            self.press_enter()
            return
        
        # Get unique PON ports
        pon_ports_raw = {}
        for onu in working_onus:
            port = onu['pon_port']
            if port not in pon_ports_raw:
                pon_ports_raw[port] = []
            pon_ports_raw[port].append(onu)
        
        print("  " + "="*70)
        print(f"  {'PON Port':<15} {'Auto-Learning Status':<25} {'Total ONU'}")
        print("  " + "="*70)
        
        for port in sorted(pon_ports_raw.keys()):
            port_clean = port.replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            cmd = f"show running-config interface gpon-olt_{port_clean}"
            success, config_output = self.client.execute_command(cmd, timeout=10)
            
            if success and config_output:
                if 'auto-learning enable' in config_output.lower():
                    status = "⚠ ENABLED (auto-register)"
                else:
                    status = "✓ DISABLED (manual)"
            else:
                status = "? UNKNOWN"
            
            onu_count = len(pon_ports_raw[port])
            print(f"  {port_clean:<15} {status:<25} {onu_count} ONU")
        
        print("  " + "="*70)
        print("\n  📋 Rekomendasi:")
        print("  - DISABLED (manual): ONU harus di-register manual dari uncfg list ✓")
        print("  - ENABLED: Semua ONU uncfg akan OTOMATIS terdaftar ⚠")
        print("\n  Untuk register ONU manual, gunakan menu:")
        print("     [2] ONU Management > [2] Register ONU (Wizard)")
        
        self.press_enter()
    
    def delete_unwanted_onu(self):
        """Delete ONU yang tidak diinginkan (biasanya hasil auto-learning)"""
        self.clear_screen()
        self.print_header("DELETE ONU YANG TIDAK DIINGINKAN")
        
        print("\n  Mengambil daftar semua ONU...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar ONU dengan info type
        print("\n  " + "="*80)
        print(f"  {'No':<4} {'PON Port':<15} {'ONU ID':<8} {'Type':<20} {'SN':<16} {'Status'}")
        print("  " + "="*80)
        
        for i, onu in enumerate(working_onus, 1):
            port_clean = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = onu.get('onu_id', '?')
            onu_type = onu.get('type', 'N/A')
            sn = onu.get('sn', 'N/A')
            status = onu.get('status', 'N/A')
            
            # Highlight ONU yang auto-registered (universalOnuType)
            type_display = onu_type
            if 'universal' in onu_type.lower():
                type_display = f"⚠ {onu_type}"
            
            print(f"  {i:<4} {port_clean:<15} {onu_id:<8} {type_display:<20} {sn:<16} {status}")
        
        print("  " + "="*80)
        print("\n  ⚠ ONU dengan type 'universalOnuType' kemungkinan hasil auto-learning")
        
        # Pilih ONU untuk dihapus
        choice = input("\n  Pilih nomor ONU yang akan dihapus (0=batal): ").strip()
        if choice == '0' or not choice:
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(working_onus):
                selected_onu = working_onus[idx]
                port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id = selected_onu.get('onu_id', '?')
                sn = selected_onu.get('sn', 'N/A')
                
                print(f"\n  ONU yang akan dihapus:")
                print(f"    Port: gpon-olt_{port_clean}")
                print(f"    ONU ID: {onu_id}")
                print(f"    SN: {sn}")
                
                confirm = input("\n  Yakin ingin menghapus ONU ini? (y/n): ").strip().lower()
                if confirm != 'y':
                    print("  Dibatalkan.")
                    return
                
                print(f"\n  Menghapus ONU {onu_id} dari gpon-olt_{port_clean}...")
                
                # Delete ONU
                self.client.execute_command("configure terminal", timeout=3)
                self.client.execute_command(f"interface gpon-olt_{port_clean}", timeout=3)
                success, output = self.client.execute_command(f"no onu {onu_id}", timeout=5)
                self.client.execute_command("exit", timeout=2)
                self.client.execute_command("exit", timeout=2)
                
                # Save configuration
                print("  Menyimpan konfigurasi...")
                self.client.execute_command("write", timeout=10)
                
                if success and "%error" not in output.lower():
                    print(f"\n  ✓ ONU {onu_id} berhasil dihapus dari gpon-olt_{port_clean}")
                else:
                    print(f"\n  ✗ Gagal menghapus ONU: {output}")
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
        
        self.press_enter()
    
    def enable_auto_bind_with_list(self):
        """Enable auto-bind dengan list PON port yang memiliki ONU working"""
        self.clear_screen()
        self.print_header("ENABLE AUTO-LEARNING")
        
        # Warning message
        print("""
  ⚠️  PERINGATAN:
  
  Dengan mengaktifkan Auto-Learning, SEMUA ONU yang terdeteksi di PON port
  akan OTOMATIS TERDAFTAR dengan type 'universalOnuType'.
  
  Ini termasuk ONU yang belum dikonfigurasi sebelumnya!
  
  ONU yang auto-register perlu dikonfigurasi profile-nya secara manual.
        """)
        
        # Tampilkan daftar ONU yang working
        print("  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Group by PON port untuk menampilkan unique PON ports
        pon_ports = {}
        for onu in working_onus:
            port = onu['pon_port']
            if port not in pon_ports:
                pon_ports[port] = []
            pon_ports[port].append(onu)
        
        # Tampilkan daftar PON port
        print("\n  " + "="*70)
        print(f"  {'No':<4} {'PON Port':<15} {'Total ONU':<12} {'ONU IDs'}")
        print("  " + "="*70)
        
        port_list = list(pon_ports.keys())
        for i, port in enumerate(port_list, 1):
            onus = pon_ports[port]
            onu_ids = ', '.join([str(o['onu_id']) for o in onus[:5]])
            if len(onus) > 5:
                onu_ids += f" ... (+{len(onus)-5} lagi)"
            port_display = port.replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"  {i:<4} {port_display:<15} {len(onus):<12} {onu_ids}")
        
        print("  " + "="*70)
        
        # Pilih PON port
        choice = input("\n  Pilih nomor PON Port untuk enable auto-learning (0=batal): ").strip()
        if choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(port_list):
                selected_port = port_list[idx]
                port_clean = selected_port.replace('gpon-olt_', '').replace('gpon_olt_', '')
                
                # Konfirmasi
                print(f"\n  ⚠️  KONFIRMASI:")
                print(f"  Mengaktifkan auto-learning untuk gpon-olt_{port_clean}")
                print(f"  Semua ONU yang terdeteksi akan OTOMATIS terdaftar!")
                confirm = input("\n  Yakin ingin melanjutkan? (y/n): ").strip().lower()
                if confirm != 'y':
                    print("  Dibatalkan.")
                    return
                
                print(f"\n  Enabling auto-learning for gpon-olt_{port_clean}...")
                print("  " + "-"*70)
                
                # ZTE C320 uses 'auto-learning enable' in interface mode
                self.client.execute_command("configure terminal", timeout=3)
                cmd = f"interface gpon-olt_{port_clean}"
                self.client.execute_command(cmd, timeout=3)
                success, output = self.client.execute_command("auto-learning enable", timeout=5)
                self.client.execute_command("exit", timeout=2)
                self.client.execute_command("exit", timeout=2)
                
                # Save configuration
                print("\n  Menyimpan konfigurasi...")
                save_success, save_output = self.client.execute_command("write", timeout=10)
                
                if success and "%error" not in output.lower():
                    print(f"\n  ✓ Auto-learning ENABLED untuk gpon-olt_{port_clean}")
                    if save_success or "successful" in save_output.lower() or "complete" in save_output.lower():
                        print("  ✓ Konfigurasi berhasil disimpan")
                    else:
                        print("  ⚠ Warning: Konfigurasi mungkin belum tersimpan")
                    
                    # Get ONU list for this port
                    onu_list = pon_ports.get(selected_port, [])
                    
                    # Debug: print keys and selected
                    # print(f"\nDEBUG: pon_ports keys = {list(pon_ports.keys())}")
                    # print(f"DEBUG: selected_port = {selected_port}")
                    # print(f"DEBUG: onu_list count = {len(onu_list)}")
                    
                    if onu_list:
                        print(f"\n  {len(onu_list)} ONU yang terdaftar di port ini akan auto-register setelah reset.")
                        print("\n  ONU List:")
                        for onu in onu_list:
                            onu_id = onu.get('onu_id', '?')
                            name = onu.get('name', 'N/A')
                            sn = onu.get('sn', 'N/A')
                            print(f"    - ONU {onu_id}: {name} (SN: {sn})")
                    else:
                        print(f"\n  Port ini memiliki ONU terdaftar yang akan auto-register setelah reset.")
                        print(f"  (Detail ONU dapat dilihat dengan 'Show ONU Detail')")
                        # If list empty, show all ports for debugging
                        print(f"\n  Available ports in data: {', '.join([p.replace('gpon-olt_', '') for p in pon_ports.keys()])}")
                else:
                    print(f"\n  ✗ Gagal enable auto-bind: {output}")
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    def disable_auto_bind_with_list(self):
        """Disable auto-bind dengan list PON port yang memiliki ONU working"""
        self.clear_screen()
        self.print_header("DISABLE AUTO-BIND")
        
        # Tampilkan daftar ONU yang working
        print("\n  Mengambil daftar ONU yang working...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("  Tidak ada ONU yang working.")
            return
        
        # Group by PON port
        pon_ports = {}
        for onu in working_onus:
            port = onu['pon_port']
            if port not in pon_ports:
                pon_ports[port] = []
            pon_ports[port].append(onu)
        
        # Tampilkan daftar PON port
        print("\n  " + "="*70)
        print(f"  {'No':<4} {'PON Port':<15} {'Total ONU':<12} {'ONU IDs'}")
        print("  " + "="*70)
        
        port_list = list(pon_ports.keys())
        for i, port in enumerate(port_list, 1):
            onus = pon_ports[port]
            onu_ids = ', '.join([str(o['onu_id']) for o in onus[:5]])
            if len(onus) > 5:
                onu_ids += f" ... (+{len(onus)-5} lagi)"
            port_display = port.replace('gpon-olt_', '').replace('gpon_olt_', '')
            print(f"  {i:<4} {port_display:<15} {len(onus):<12} {onu_ids}")
        
        print("  " + "="*70)
        
        # Pilih PON port
        choice = input("\n  Pilih nomor PON Port untuk disable auto-bind (0=batal): ").strip()
        if choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(port_list):
                selected_port = port_list[idx]
                port_clean = selected_port.replace('gpon-olt_', '').replace('gpon_olt_', '')
                
                print(f"\n  Disabling auto-learning for gpon-olt_{port_clean}...")
                print("  " + "-"*70)
                
                # ZTE C320 uses 'auto-learning disable' in interface mode
                self.client.execute_command("configure terminal", timeout=3)
                cmd = f"interface gpon-olt_{port_clean}"
                self.client.execute_command(cmd, timeout=3)
                success, output = self.client.execute_command("auto-learning disable", timeout=5)
                self.client.execute_command("exit", timeout=2)
                self.client.execute_command("exit", timeout=2)
                
                # Save configuration
                print("\n  Menyimpan konfigurasi...")
                save_success, save_output = self.client.execute_command("write", timeout=10)
                
                if success and "%error" not in output.lower():
                    print(f"\n  ✓ Auto-learning DISABLED untuk gpon-olt_{port_clean}")
                    if save_success or "successful" in save_output.lower() or "complete" in save_output.lower():
                        print("  ✓ Konfigurasi berhasil disimpan")
                    else:
                        print("  ⚠ Warning: Konfigurasi mungkin belum tersimpan")
                    print(f"\n  ONU di port ini tidak akan auto-register setelah reset.")
                else:
                    print(f"\n  ✗ Gagal disable auto-bind: {output}")
            else:
                print("  Pilihan tidak valid")
        except ValueError:
            print("  Input tidak valid")
    
    # ==================== SECURITY MANAGEMENT ====================
    
    def configure_security_management(self):
        """Configure Security Management / Remote Access"""
        print("\n--- Configure Security Management (Remote Access) ---")
        
        # Tampilkan daftar ONU yang sudah terdaftar
        print("\nMengambil daftar ONU yang sudah terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar
        print("\n" + "=" * 80)
        print(f"{'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Deskripsi':<30} {'Status'}")
        print("=" * 80)
        
        for idx, onu in enumerate(working_onus, 1):
            print(f"{idx:<4} {onu['pon_port']:<12} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30} {onu.get('status', 'N/A')}")
        
        print("=" * 80)
        
        # Pilih ONU
        choice = input("\nPilih nomor ONU [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
        
        if not choice or choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(working_onus):
                print("Nomor tidak valid")
                self.press_enter()
                return
            
            selected_onu = working_onus[idx]
            onu_id_full = f"1/1/{selected_onu['port']}:{selected_onu['onu_id']}"
            
            print(f"\nONU Terpilih: {selected_onu['pon_port']} - {selected_onu.get('name', 'N/A')}")
            
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        # Pilih mode
        print("\n--- Security Management Mode ---")
        print("  [1] Allow (Forward) - Izinkan akses remote")
        print("  [2] Block (Discard) - Blok akses remote")
        
        mode_choice = input("Pilih mode [1-2]: ").strip()
        mode = "allow" if mode_choice == "1" else "block"
        
        # Pilih ingress type
        print("\n--- Ingress Type ---")
        print("  [1] WAN - Remote access dari internet")
        print("  [2] LAN - Remote access dari local network")
        
        ingress_choice = input("Pilih ingress type [1-2] (default: WAN): ").strip() or "1"
        ingress_type = "wan" if ingress_choice == "1" else "lan"
        
        # Pilih services
        print("\n--- Select Services ---")
        print("Pilih service yang akan di-allow/block (pisahkan dengan koma)")
        print("Contoh: 1,2,3,7 atau kosongkan untuk semua service default")
        print("\nAvailable Services:")
        print("  [1] WEB (HTTP/HTTPS)")
        print("  [2] TELNET")
        print("  [3] SSH")
        print("  [4] SNMP")
        print("  [5] FTP")
        print("  [6] TR069")
        
        service_map = {
            '1': 'web',
            '2': 'telnet',
            '3': 'ssh',
            '4': 'snmp',
            '5': 'ftp',
            '6': 'tr069'
        }
        
        service_input = input("\nPilih services [1-6] (default: 1,2,3): ").strip() or "1,2,3"
        selected_services = []
        
        for s in service_input.split(','):
            s = s.strip()
            if s in service_map:
                selected_services.append(service_map[s])
        
        if not selected_services:
            selected_services = ['web', 'telnet', 'ssh']  # Default
        
        # Management VLAN (optional)
        print("\n--- Management VLAN (Optional) ---")
        use_vlan = input("Gunakan Management VLAN? (y/n, default: n): ").strip().lower()
        
        mgmt_vlan = None
        priority = 0
        
        if use_vlan == 'y':
            mgmt_vlan = self.input_int("Management VLAN ID: ")
            priority = self.input_int("VLAN Priority (0-7, default: 0): ", 0)
        
        # Execute configuration
        print("\n" + "=" * 60)
        print(f"Configuring Security Management...")
        print(f"  ONU        : {onu_id_full}")
        print(f"  Mode       : {mode.upper()}")
        print(f"  Ingress    : {ingress_type.upper()}")
        print(f"  Services   : {', '.join(selected_services).upper()}")
        if mgmt_vlan:
            print(f"  VLAN       : {mgmt_vlan} (Priority: {priority})")
        print("=" * 60)
        
        confirm = input("\nProceed? (y/n): ").strip().lower()
        if confirm == 'y':
            success, msg = self.onu_mgr.configure_security_mgmt(
                onu_id_full,
                mode=mode,
                ingress_type=ingress_type,
                services=selected_services,
                mgmt_vlan=mgmt_vlan,
                priority=priority
            )
            if success:
                print(f"\n✓ {msg}")
            else:
                print(f"\n✗ {msg}")
        
        self.press_enter()
    
    def configure_tr069_wizard(self):
        """Configure TR069 / CWMP for ONU"""
        print("\n--- Configure TR069 (CWMP) ---")
        
        # Tampilkan daftar ONU yang sudah terdaftar
        print("\nMengambil daftar ONU yang sudah terdaftar...")
        working_onus = self.register_wizard.fetch_all_working_onus()
        
        if not working_onus:
            print("Tidak ada ONU yang terdaftar.")
            self.press_enter()
            return
        
        # Tampilkan daftar
        print("\n" + "=" * 80)
        print(f"{'No':<4} {'PON Port':<12} {'ONU ID':<8} {'Deskripsi':<30} {'Status'}")
        print("=" * 80)
        
        for idx, onu in enumerate(working_onus, 1):
            print(f"{idx:<4} {onu['pon_port']:<12} {onu['onu_id']:<8} {onu.get('name', 'N/A'):<30} {onu.get('status', 'N/A')}")
        
        print("=" * 80)
        
        # Pilih ONU
        choice = input("\nPilih nomor ONU [1-{}] atau [0] untuk batal: ".format(len(working_onus))).strip()
        
        if not choice or choice == '0':
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(working_onus):
                print("Nomor tidak valid")
                self.press_enter()
                return
            
            selected_onu = working_onus[idx]
            onu_id_full = f"1/1/{selected_onu['port']}:{selected_onu['onu_id']}"
            
            print(f"\nONU Terpilih: {selected_onu['pon_port']} - {selected_onu.get('name', 'N/A')}")
            
        except ValueError:
            print("Input tidak valid")
            self.press_enter()
            return
        
        # TR069 Configuration
        print("\n--- TR069 Configuration ---")
        
        # Enable/Disable
        enable_choice = input("Enable TR069? (y/n, default: y): ").strip().lower() or 'y'
        enable = enable_choice == 'y'
        
        if not enable:
            # Disable only
            confirm = input("Disable TR069 on this ONU? (y/n): ").strip().lower()
            if confirm == 'y':
                success, msg = self.onu_mgr.configure_tr069(
                    onu_id_full,
                    enable=False
                )
                print(msg)
            self.press_enter()
            return
        
        # ACS Configuration
        print("\n--- ACS Server Configuration ---")
        acs_url = input("ACS URL (e.g., http://acs.example.com:7547): ").strip()
        
        if not acs_url:
            print("ACS URL required!")
            self.press_enter()
            return
        
        username = input("ACS Username (optional): ").strip() or None
        password = input("ACS Password (optional): ").strip() or None
        
        # VLAN Configuration
        print("\n--- VLAN Configuration ---")
        use_vlan = input("Use VLAN tagging? (y/n, default: n): ").strip().lower()
        
        vlan_id = None
        priority = 0
        
        if use_vlan == 'y':
            vlan_id = self.input_int("TR069 VLAN ID: ")
            priority = self.input_int("VLAN Priority (0-7, default: 0): ", 0)
        
        # Summary
        print("\n" + "=" * 60)
        print(f"TR069 Configuration Summary:")
        print(f"  ONU        : {onu_id_full}")
        print(f"  Status     : ENABLED")
        print(f"  ACS URL    : {acs_url}")
        if username:
            print(f"  Username   : {username}")
        if vlan_id:
            print(f"  VLAN       : {vlan_id} (Priority: {priority})")
        print("=" * 60)
        
        confirm = input("\nProceed? (y/n): ").strip().lower()
        if confirm == 'y':
            success, msg = self.onu_mgr.configure_tr069(
                onu_id_full,
                enable=True,
                acs_url=acs_url,
                username=username,
                password=password,
                vlan_id=vlan_id,
                priority=priority
            )
            if success:
                print(f"\n✓ {msg}")
            else:
                print(f"\n✗ {msg}")
        
        self.press_enter()
    
    # ==================== OLT PROFILE MANAGEMENT ====================
    
    def olt_profile_menu(self):
        """Menu manajemen OLT profiles"""
        while True:
            active_profile = self.profile_manager.get_active_profile()
            profiles = self.profile_manager.list_profiles()
            
            self.print_header("OLT PROFILE MANAGEMENT")
            
            print("\n  Available OLT Profiles:")
            print("-" * 80)
            print(f"{'No':<4} {'Name':<15} {'Host':<20} {'Port':<6} {'Active':<8}")
            print("-" * 80)
            
            for idx, profile in enumerate(profiles, 1):
                active_mark = "✓" if profile.is_active else ""
                print(f"{idx:<4} {profile.name:<15} {profile.host:<20} {profile.port:<6} {active_mark:<8}")
            
            if not profiles:
                print("  (No profiles configured)")
            
            print("\n" + "=" * 80)
            print("""
  1. Add New OLT Profile
  2. Edit OLT Profile
  3. Delete OLT Profile
  4. Switch Active OLT
  5. Reconnect to Active OLT
  
  0. Back to Main Menu
            """)
            
            choice = input("Pilih menu [0-5]: ").strip()
            
            if choice == '1':
                self.add_olt_profile()
            elif choice == '2':
                self.edit_olt_profile()
            elif choice == '3':
                self.delete_olt_profile()
            elif choice == '4':
                self.switch_olt_profile()
            elif choice == '5':
                self.reconnect_olt()
            elif choice == '0':
                break
    
    def add_olt_profile(self):
        """Tambah OLT profile baru"""
        self.print_header("ADD NEW OLT PROFILE")
        
        print("\nMasukkan informasi OLT baru:")
        name = input("  Profile Name: ").strip()
        if not name:
            print("  ✗ Profile name tidak boleh kosong")
            self.press_enter()
            return
        
        if self.profile_manager.get_profile(name):
            print(f"  ✗ Profile '{name}' sudah ada")
            self.press_enter()
            return
        
        host = input("  OLT Host/IP: ").strip()
        port = self.input_int("  Telnet Port", default=23)
        username = input("  Username: ").strip()
        password = input("  Password: ").strip()
        enable_password = input("  Enable Password (optional): ").strip()
        description = input("  Description (optional): ").strip()
        
        profile = OLTProfile(
            name=name,
            host=host,
            port=port,
            username=username,
            password=password,
            enable_password=enable_password if enable_password else None,
            description=description
        )
        
        if self.profile_manager.add_profile(profile):
            print(f"\n✓ Profile '{name}' berhasil ditambahkan")
        else:
            print(f"\n✗ Gagal menambahkan profile '{name}'")
        
        self.press_enter()
    
    def edit_olt_profile(self):
        """Edit OLT profile yang ada"""
        profiles = self.profile_manager.list_profiles()
        if not profiles:
            print("\n  Tidak ada profile yang tersedia")
            self.press_enter()
            return
        
        self.print_header("EDIT OLT PROFILE")
        
        print("\n  Select profile to edit:")
        for idx, profile in enumerate(profiles, 1):
            print(f"  {idx}. {profile.name} ({profile.host})")
        
        choice = self.input_int("\n  Pilih profile", min_val=1, max_val=len(profiles))
        selected_profile = profiles[choice - 1]
        
        print(f"\nEdit profile: {selected_profile.name}")
        print("(Tekan Enter untuk tidak mengubah)")
        
        name = input(f"  Profile Name [{selected_profile.name}]: ").strip() or selected_profile.name
        host = input(f"  OLT Host/IP [{selected_profile.host}]: ").strip() or selected_profile.host
        port_input = input(f"  Telnet Port [{selected_profile.port}]: ").strip()
        port = int(port_input) if port_input else selected_profile.port
        username = input(f"  Username [{selected_profile.username}]: ").strip() or selected_profile.username
        password_input = input(f"  Password [{'*' * len(selected_profile.password)}]: ").strip()
        password = password_input if password_input else selected_profile.password
        enable_password_input = input(f"  Enable Password [{'*' * len(selected_profile.enable_password or '')}]: ").strip()
        enable_password = enable_password_input if enable_password_input else selected_profile.enable_password
        description = input(f"  Description [{selected_profile.description}]: ").strip() or selected_profile.description
        
        updated_profile = OLTProfile(
            name=name,
            host=host,
            port=port,
            username=username,
            password=password,
            enable_password=enable_password if enable_password else None,
            description=description
        )
        
        if self.profile_manager.update_profile(selected_profile.name, updated_profile):
            print(f"\n✓ Profile '{selected_profile.name}' berhasil diupdate")
        else:
            print(f"\n✗ Gagal mengupdate profile")
        
        self.press_enter()
    
    def delete_olt_profile(self):
        """Hapus OLT profile"""
        profiles = self.profile_manager.list_profiles()
        if not profiles:
            print("\n  Tidak ada profile yang tersedia")
            self.press_enter()
            return
        
        self.print_header("DELETE OLT PROFILE")
        
        print("\n  Select profile to delete:")
        for idx, profile in enumerate(profiles, 1):
            active_mark = " (ACTIVE)" if profile.is_active else ""
            print(f"  {idx}. {profile.name} ({profile.host}){active_mark}")
        
        choice = self.input_int("\n  Pilih profile", min_val=1, max_val=len(profiles))
        selected_profile = profiles[choice - 1]
        
        if selected_profile.is_active:
            print(f"\n  ✗ Tidak dapat menghapus profile aktif '{selected_profile.name}'")
            print("    Switch ke profile lain terlebih dahulu")
            self.press_enter()
            return
        
        confirm = input(f"\n  Hapus profile '{selected_profile.name}'? (yes/no): ").strip().lower()
        if confirm == 'yes':
            if self.profile_manager.delete_profile(selected_profile.name):
                print(f"\n✓ Profile '{selected_profile.name}' berhasil dihapus")
            else:
                print(f"\n✗ Gagal menghapus profile")
        else:
            print("\n  Batal menghapus")
        
        self.press_enter()
    
    def switch_olt_profile(self):
        """Switch active OLT profile"""
        profiles = self.profile_manager.list_profiles()
        if not profiles:
            print("\n  Tidak ada profile yang tersedia")
            self.press_enter()
            return
        
        self.print_header("SWITCH ACTIVE OLT")
        
        print("\n  Available OLT Profiles:")
        for idx, profile in enumerate(profiles, 1):
            active_mark = " (CURRENT)" if profile.is_active else ""
            print(f"  {idx}. {profile.name} ({profile.host}){active_mark}")
        
        choice = self.input_int("\n  Pilih OLT", min_val=1, max_val=len(profiles))
        selected_profile = profiles[choice - 1]
        
        if selected_profile.is_active:
            print(f"\n  Profile '{selected_profile.name}' sudah aktif")
            self.press_enter()
            return
        
        if self.profile_manager.set_active_profile(selected_profile.name):
            print(f"\n✓ Active OLT switched to: {selected_profile.name}")
            print(f"  Host: {selected_profile.host}")
            print(f"\n  Silakan restart aplikasi atau pilih menu 'Reconnect' untuk terhubung ke OLT baru")
        else:
            print(f"\n✗ Gagal switch profile")
        
        self.press_enter()
    
    def reconnect_olt(self):
        """Reconnect to active OLT"""
        self.print_header("RECONNECT TO OLT")
        
        active_profile = self.profile_manager.get_active_profile()
        if not active_profile:
            print("\n  ✗ Tidak ada active profile")
            self.press_enter()
            return
        
        print(f"\nReconnecting to: {active_profile.name} ({active_profile.host})")
        
        # Disconnect current connection
        print("  Disconnecting from current OLT...")
        self.client.disconnect()
        
        # Create new config from active profile
        config = OLTConfig.from_profile(active_profile)
        
        # Update client config
        self.client.config = config
        
        # Reconnect
        print(f"  Connecting to {config.host}:{config.port}...")
        if self.client.connect():
            print("\n✓ Successfully reconnected to OLT")
        else:
            print("\n✗ Failed to reconnect to OLT")
            print("  Periksa koneksi dan kredensial")
        
        self.press_enter()


def main():
    """Main function"""
    load_dotenv()
    
    # Try to load from active profile first, fallback to env
    config = OLTConfig.from_active_profile()
    
    valid, msg = config.validate()
    if not valid:
        print(f"Configuration Error: {msg}")
        print("Pastikan sudah ada OLT profile yang aktif atau file .env sudah benar!")
        sys.exit(1)
    
    print("=" * 60)
    print("  OLT ZTE C320 - COMPLETE MANAGEMENT SYSTEM")
    print("=" * 60)
    print(f"\nConnecting to OLT {config.host}:{config.port}...")
    
    client = TelnetClient(config)
    
    if not client.connect():
        print("GAGAL terhubung ke OLT!")
        print("Periksa koneksi dan kredensial Anda.")
        sys.exit(1)
    
    print("BERHASIL terhubung ke OLT!")
    
    try:
        menu = OLTCompleteMenu(client)
        menu.main_menu()
    finally:
        client.disconnect()
        print("\nDisconnected dari OLT. Sampai jumpa!")


if __name__ == "__main__":
    main()
