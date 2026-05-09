"""
ONU Registration Wizard
Menu interaktif untuk register ONU dengan step-by-step wizard
Fitur:
- Show unconfigured ONU
- Register satu per satu atau semua
- Input nama, deskripsi, type ONU
- Set profile TCONT, Traffic, VLAN
- Konfigurasi service: PPPOE, Bridge, Static IP
"""
import sys
import os
import time
import re

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from core.telnet_client import TelnetClient
from config.olt_config import OLTConfig
from scripts.onu_config_manager import ONUConfigManager


class ONURegistrationWizard:
    """Wizard untuk registrasi ONU dengan menu interaktif"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
        self.config_manager = ONUConfigManager(client)
        self.unconfigured_onus = []
        self.onu_types = []
        self.tcont_profiles = []
        self.traffic_profiles = []
        self.vlans = []
    
    def clear_screen(self):
        """Clear terminal"""
        os.system('cls' if os.name == 'nt' else 'clear')
    
    def print_header(self, title: str):
        """Print header"""
        print("\n" + "=" * 70)
        print(f"  {title}")
        print("=" * 70)
    
    def print_menu_item(self, num: int, text: str, extra: str = ""):
        """Print menu item dengan format"""
        if extra:
            print(f"  [{num:2d}] {text} - {extra}")
        else:
            print(f"  [{num:2d}] {text}")
    
    def input_with_default(self, prompt: str, default: str = "") -> str:
        """Input dengan default value"""
        if default:
            result = input(f"{prompt} [{default}]: ").strip()
            return result if result else default
        return input(f"{prompt}: ").strip()
    
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
                print("  Masukkan angka yang valid!")
    
    def press_enter(self):
        """Wait for Enter"""
        input("\n  Tekan Enter untuk melanjutkan...")
    
    def sync_onu_data(self):
        """Sinkronisasi data ONU dari OLT (refresh unconfigured & working ONU)"""
        print("\n  ╔════════════════════════════════════════════════════╗")
        print("  ║  SINKRONISASI DATA ONU DARI OLT                    ║")
        print("  ╚════════════════════════════════════════════════════╝")
        
        print("\n  [1/2] Syncing ONU yang belum terdaftar (unconfigured)...")
        unconfigured = self.fetch_unconfigured_onus()
        print(f"        ✓ Ditemukan {len(unconfigured)} ONU unconfigured")
        
        print("\n  [2/2] Syncing ONU yang sudah terdaftar (working)...")
        # Note: fetch_all_working_onus scan semua 16 port, bisa lambat
        # Untuk performa lebih baik, bisa batasi hanya port yang aktif
        print("        Scanning PON ports...")
        working = self.fetch_all_working_onus()
        print(f"        ✓ Ditemukan {len(working)} ONU working")
        
        print("\n  ✓ Sinkronisasi selesai!")
        print(f"     - Unconfigured : {len(unconfigured)} ONU")
        print(f"     - Working      : {len(working)} ONU")
        
        return unconfigured, working
    
    # ==================== DATA FETCHING ====================
    
    def fetch_unconfigured_onus(self) -> list:
        """Fetch daftar ONU yang belum dikonfigurasi"""
        print("  Mengambil daftar ONU unconfigured...")
        
        onus = []
        
        # Try command 1: show gpon onu uncfg
        # Format output bisa berbeda tergantung firmware:
        # - Format 1 (tabel): No | PON Port | Serial Number | Model | Password
        # - Format 2 (list): gpon-onu_1/1/1:1  HWTC1F14CAAD  unknown
        success, output = self.client.execute_command("show gpon onu uncfg", timeout=15)
        
        if success and output:
            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                
                # Skip header lines
                if '----' in line or 'PON Port' in line or 'No |' in line or not line:
                    continue
                
                # Try to parse table format: "1 | 1/1/1 | HWTCIF14CAAD | - | -"
                if '|' in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 3:
                        # parts[0] = No, parts[1] = PON Port, parts[2] = SN, parts[3] = Model, parts[4] = Password
                        try:
                            pon_port = parts[1]
                            sn = parts[2]
                            model = parts[3] if len(parts) > 3 and parts[3] != '-' else ''
                            password = parts[4] if len(parts) > 4 and parts[4] != '-' else ''
                            
                            # Jika model masih kosong, coba fetch dari show gpon onu by sn
                            if not model or model == '-':
                                model = self._fetch_onu_model_by_sn(sn)
                            
                            onu_info = {
                                'pon_port': pon_port,
                                'onu_index': f"gpon-onu_{pon_port}",
                                'sn': sn,
                                'model': model,
                                'password': password,
                            }
                            onus.append(onu_info)
                        except:
                            continue
                
                # Try to parse list format: "gpon-onu_1/1/1:1  HWTC1F14CAAD  unknown"
                elif 'gpon-onu' in line.lower() and ':' in line:
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
                        
                        # Fetch model by SN
                        model = self._fetch_onu_model_by_sn(sn)
                        
                        onu_info = {
                            'pon_port': pon_port,
                            'onu_index': onu_index,
                            'sn': sn,
                            'model': model,
                            'password': '',
                        }
                        onus.append(onu_info)
        
        # If no results, try command 2: show pon onu uncfg
        # Format: gpon-olt_1/1/1  EG8041V5  HWTC1F14CAAD  GD824CDF3
        if not onus:
            success2, output2 = self.client.execute_command("show pon onu uncfg", timeout=15)
            
            if success2 and output2:
                lines = output2.split('\n')
                for line in lines:
                    line = line.strip()
                    # Match gpon-olt_X/X/X format
                    if 'gpon-olt' in line.lower():
                        parts = line.split()
                        if len(parts) >= 3:
                            # gpon-olt_1/1/1  EG8041V5  HWTC1F14CAAD  PW
                            olt_index = parts[0]  # gpon-olt_1/1/1
                            model = parts[1] if len(parts) > 1 else ''
                            sn = parts[2] if len(parts) > 2 else 'Unknown'
                            password = parts[3] if len(parts) > 3 else ''
                            
                            # Extract PON port from gpon-olt_1/1/1
                            if '_' in olt_index:
                                pon_port = olt_index.split('_')[1]  # 1/1/1
                            else:
                                pon_port = olt_index
                            
                            onu_info = {
                                'pon_port': pon_port,
                                'onu_index': olt_index,
                                'sn': sn,
                                'model': model,
                                'password': password,
                            }
                            onus.append(onu_info)
        
        self.unconfigured_onus = onus
        return onus
    
    def _fetch_onu_model_by_sn(self, sn: str) -> str:
        """Fetch ONU model/type by serial number from OLT (only real data, no defaults)"""
        if not sn or sn == 'Unknown':
            return ''
        
        # Method 1: show gpon remote-onu all
        # Format output untuk unconfigured ONU biasanya menampilkan Equipment ID
        cmd = "show gpon remote-onu all"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if success and output:
            lines = output.split('\n')
            in_onu_block = False
            
            for i, line in enumerate(lines):
                # Cari block yang mengandung SN ini
                if sn in line:
                    in_onu_block = True
                    # Cek 10 baris ke depan untuk Equipment ID
                    for j in range(i, min(i+10, len(lines))):
                        check_line = lines[j].strip()
                        
                        # Format: "Equipment ID        : F672YV9.1" 
                        if 'equipment' in check_line.lower() and 'id' in check_line.lower():
                            if ':' in check_line:
                                eq_value = check_line.split(':', 1)[1].strip()
                                # Remove extra spaces and get first word
                                model = eq_value.split()[0] if eq_value else ''
                                if model and model not in ['-', 'unknown', 'Unknown', '']:
                                    print(f"    [Debug] Found Equipment ID for {sn}: {model}")
                                    return model
                        
                        # Format alternatif: "Vendor ID           : ZTEG"
                        #                     "Equipment ID        : F672YV9.1"
                        # Atau dalam satu baris: "Type: F670L"
                        if 'type' in check_line.lower() and ':' in check_line:
                            type_val = check_line.split(':', 1)[1].strip()
                            type_model = type_val.split()[0] if type_val else ''
                            if type_model and type_model not in ['-', 'unknown', 'Unknown', ''] and type_model[0].upper() in ['F', 'G', 'H', 'E']:
                                print(f"    [Debug] Found Type for {sn}: {type_model}")
                                return type_model
                        
                        # Jika sudah menemukan ONU baru (SN lain), stop
                        if j > i and ('gpon-onu' in check_line.lower() or (len(check_line) > 8 and check_line[:4].isupper())):
                            break
        
        # Method 2: show gpon onu by sn {sn}
        # Command khusus untuk query berdasarkan SN
        cmd = f"show gpon onu by sn {sn}"
        success, output = self.client.execute_command(cmd, timeout=8)
        
        if success and output:
            lines = output.split('\n')
            for line in lines:
                line_lower = line.lower()
                # Cari Equipment ID atau Type
                if ('equipment' in line_lower or 'type' in line_lower) and ':' in line:
                    value = line.split(':', 1)[1].strip()
                    model = value.split()[0] if value else ''
                    if model and model not in ['-', 'unknown', 'Unknown', ''] and len(model) > 2:
                        print(f"    [Debug] Found from 'show gpon onu by sn' for {sn}: {model}")
                        return model
        
        # Method 3: Parse dari output show gpon onu uncfg yang lebih detail
        # Beberapa firmware menampilkan model di kolom terpisah
        print(f"    [Debug] No model found from OLT for SN {sn}, returning empty")
        return ''
    
    def fetch_all_working_onus(self) -> list:
        """Fetch daftar ONU yang sudah working dari semua PON port (1-16)"""
        all_onus = []
        print("  Scanning semua PON port (1-16)...")
        
        for port_num in range(1, 17):
            pon_port = f"1/1/{port_num}"
            cmd = f"show gpon onu state gpon-olt_{pon_port}"
            success, output = self.client.execute_command(cmd, timeout=10)
            
            if success:
                lines = output.replace('\r\n', '\n').split('\n')
                for line in lines:
                    line = line.strip()
                    # Parse line seperti: 1/1/1:1     enable       enable      working      1(GPON)
                    if ':' in line and ('working' in line.lower() or 'enable' in line.lower()):
                        parts = line.split()
                        if len(parts) >= 4:
                            onu_id_full = parts[0]  # e.g., 1/1/1:1
                            # Extract ONU ID number from full string
                            onu_num = onu_id_full.split(':')[1] if ':' in onu_id_full else onu_id_full
                            
                            # Get ONU name/description (fetch detail untuk mendapat nama)
                            detail = self.fetch_onu_detail(onu_id_full)
                            name = detail.get('name', '') or detail.get('description', '') or f"ONU-{onu_id_full}"
                            sn = detail.get('sn', '') or detail.get('serial_number', '') or 'N/A'
                            onu_type = detail.get('type', 'N/A')
                            
                            onu_info = {
                                'onu_id': int(onu_num),
                                'onu_id_full': onu_id_full,
                                'slot': 1,
                                'port': port_num,
                                'pon_port': f"gpon-olt_{pon_port}",
                                'admin_state': parts[1],
                                'omcc_state': parts[2],
                                'status': parts[3],
                                'phase_state': parts[3],
                                'channel': parts[4] if len(parts) > 4 else '',
                                'name': name,
                                'sn': sn,
                                'type': onu_type
                            }
                            all_onus.append(onu_info)
        
        print(f"  Ditemukan {len(all_onus)} ONU yang sudah terdaftar")
        return all_onus
    
    def fetch_working_onus(self, pon_port: str = "1/1/1") -> list:
        """Fetch daftar ONU yang sudah working"""
        print(f"  Mengambil daftar ONU working di PON {pon_port}...")
        
        cmd = f"show gpon onu state gpon-olt_{pon_port}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        onus = []
        if success:
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                line = line.strip()
                # Parse line seperti: 1/1/1:1     enable       enable      working      1(GPON)
                if ':' in line and ('working' in line.lower() or 'enable' in line.lower()):
                    parts = line.split()
                    if len(parts) >= 4:
                        onu_info = {
                            'onu_id': parts[0],
                            'admin_state': parts[1],
                            'omcc_state': parts[2],
                            'phase_state': parts[3],
                            'channel': parts[4] if len(parts) > 4 else ''
                        }
                        onus.append(onu_info)
        
        return onus
    
    def fetch_onu_mac_address(self, onu_id: str) -> str:
        """Fetch MAC address dari ONU"""
        # Command yang berhasil tested: show gpon remote-onu ip-host gpon-onu_X
        # Output format:
        # MAC address:        48d6.82ce.1a06
        
        cmd = f"show gpon remote-onu ip-host gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if success and output and "Error" not in output:
            import re
            lines = output.replace('\r\n', '\n').split('\n')
            
            for line in lines:
                if 'MAC address' in line or 'mac address' in line:
                    # Extract MAC address: XXXX.XXXX.XXXX or XX:XX:XX:XX:XX:XX
                    # Pattern 1: XXXX.XXXX.XXXX (ZTE format)
                    mac_pattern1 = r'([0-9A-Fa-f]{4}\.){2}([0-9A-Fa-f]{4})'
                    match = re.search(mac_pattern1, line)
                    if match:
                        return match.group(0)
                    
                    # Pattern 2: XX:XX:XX:XX:XX:XX (standard format)
                    mac_pattern2 = r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})'
                    match = re.search(mac_pattern2, line)
                    if match:
                        return match.group(0)
        
        return 'N/A'
    
    def fetch_onu_temperature(self, onu_id: str) -> str:
        """Fetch temperature sensor dari ONU (jika tersedia)"""
        cmd = f"show gpon onu detail-info gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if success and output:
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                if 'temp' in line.lower():
                    parts = line.split(':')
                    if len(parts) >= 2:
                        temp = parts[1].strip()
                        if temp and temp != '-':
                            return temp
        return '-'
    
    def fetch_onu_traffic_stats(self, onu_id: str) -> dict:
        """Fetch traffic statistics dari ONU"""
        # Command yang berhasil: show interface gpon-onu_X
        # Output format ZTE C320:
        # Total statistic:
        #   Input:
        #     Bytes:8623314917           Packets:103940
        #   Output:
        #     Bytes:374695076            Packets:1883688
        
        stats = {
            'rx_bytes': 'N/A',
            'tx_bytes': 'N/A',
            'rx_packets': 'N/A',
            'tx_packets': 'N/A',
            'rx_errors': '0',
            'tx_errors': '0'
        }
        
        cmd = f"show interface gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if success and output and "Error" not in output:
            import re
            
            # Parse Input section (RX)
            input_match = re.search(r'Input:\s*Bytes:(\d+)\s*Packets:(\d+)', output)
            if input_match:
                stats['rx_bytes'] = input_match.group(1)
                stats['rx_packets'] = input_match.group(2)
            
            # Parse Output section (TX)
            output_match = re.search(r'Output:\s*Bytes:(\d+)\s*Packets:(\d+)', output)
            if output_match:
                stats['tx_bytes'] = output_match.group(1)
                stats['tx_packets'] = output_match.group(2)
        
        return stats
    
    def fetch_onu_port_status(self, onu_id: str) -> list:
        """Fetch status ETH ports dari ONU"""
        # Try multiple commands
        commands = [
            f"show gpon remote-onu eth-port gpon-onu_{onu_id}",
            f"show gpon remote-onu port state gpon-onu_{onu_id}",
            f"show port state gpon-onu_{onu_id}"
        ]
        
        ports = []
        for cmd in commands:
            success, output = self.client.execute_command(cmd, timeout=10)
            
            if success and output:
                lines = output.replace('\r\n', '\n').split('\n')
                for line in lines:
                    line = line.strip()
                    # Parse various formats:
                    # eth_0/1  enable  auto  down  -
                    # eth_0/1  up  1000M  full
                    # 1  enable  up  100M
                    if 'eth' in line.lower() or (line and line[0].isdigit() and 'enable' in line.lower()):
                        parts = line.split()
                        if len(parts) >= 2:
                            port_info = {
                                'port': parts[0] if 'eth' in parts[0].lower() else f"eth_0/{parts[0]}",
                                'admin': parts[1] if len(parts) > 1 else '-',
                                'speed': parts[2] if len(parts) > 2 else '-',
                                'link': parts[3] if len(parts) > 3 else parts[2] if 'up' in parts[2].lower() or 'down' in parts[2].lower() else '-',
                                'duplex': parts[4] if len(parts) > 4 else '-'
                            }
                            ports.append(port_info)
                
                # If we found ports, break
                if ports:
                    break
        
        return ports
    
    def fetch_onu_optical_power(self, pon_port: str = "1/1/1") -> dict:
        """Fetch optical power untuk semua ONU di port tertentu"""
        print(f"  Mengambil data optical power PON {pon_port}...")
        
        cmd = f"show pon power onu-rx gpon-olt_{pon_port}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        power_data = {}
        if success and output:
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                line = line.strip()
                # Format: gpon-onu_1/1/1:1    -10.270(dbm)
                if 'gpon-onu_' in line and 'dbm' in line.lower():
                    parts = line.split()
                    if len(parts) >= 2:
                        onu_interface = parts[0].replace('gpon-onu_', '')
                        rx_power = parts[1]  # e.g. "-10.270(dbm)"
                        power_data[onu_interface] = rx_power
        
        return power_data
    
    def fetch_onu_detail(self, onu_id: str) -> dict:
        """Fetch detail info untuk satu ONU"""
        cmd = f"show gpon onu detail-info gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        detail = {
            'onu_id': onu_id,
            'name': '',
            'type': '',
            'state': '',
            'serial_number': '',
            'description': '',
            'phase_state': '',
            'config_state': '',
            'distance': '',
            'online_duration': '',
            'auth_mode': '',
            'last_up_time': '-',
            'last_down_time': '-',
            'last_down_cause': '-'
        }
        
        if success and output:
            lines = output.replace('\r\n', '\n').split('\n')
            
            # Parse main fields
            for line in lines:
                line = line.strip()
                if ':' in line:
                    if line.startswith('Name:'):
                        detail['name'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Type:'):
                        detail['type'] = line.split(':', 1)[1].strip()
                    elif line.startswith('State:'):
                        detail['state'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Serial number:'):
                        detail['serial_number'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Description:'):
                        detail['description'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Phase state:'):
                        detail['phase_state'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Config state:'):
                        detail['config_state'] = line.split(':', 1)[1].strip()
                    elif line.startswith('ONU Distance:'):
                        detail['distance'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Online Duration:'):
                        detail['online_duration'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Authentication mode:'):
                        detail['auth_mode'] = line.split(':', 1)[1].strip()
            
            # Parse history table (Authpass Time, OfflineTime, Cause)
            # Format:
            #    1   2001-04-26 23:27:59    2001-04-26 23:31:02     LOS
            #    4   2001-04-28 00:40:50    0000-00-00 00:00:00
            # Find valid entries (most recent)
            import re
            history_entries = []
            
            for line in lines:
                line = line.strip()
                # Match pattern: number, datetime, datetime, optional cause
                # Skip lines with 0000-00-00 (empty entries)
                if re.match(r'^\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}', line):
                    parts = line.split()
                    if len(parts) >= 3:
                        auth_time = f"{parts[1]} {parts[2]}"
                        
                        # Check if not empty date
                        if '0000-00-00' not in auth_time:
                            offline_time = ''
                            cause = ''
                            
                            if len(parts) >= 5:
                                offline_time = f"{parts[3]} {parts[4]}"
                                if len(parts) >= 6:
                                    cause = ' '.join(parts[5:])
                            
                            history_entries.append({
                                'auth_time': auth_time,
                                'offline_time': offline_time,
                                'cause': cause
                            })
            
            # Get the most recent entry (last valid entry)
            if history_entries:
                latest = history_entries[-1]  # Last non-empty entry (most recent up time)
                detail['last_up_time'] = latest['auth_time']
                
                # If current entry has no down time (0000-00-00), ONU is online
                # Get last down from previous entry
                if latest['offline_time'] and '0000-00-00' not in latest['offline_time']:
                    # This entry has down time, ONU went offline
                    detail['last_down_time'] = latest['offline_time']
                    detail['last_down_cause'] = latest['cause'] if latest['cause'] else '-'
                elif len(history_entries) >= 2:
                    # ONU currently online, get last down from previous entry
                    previous = history_entries[-2]
                    if previous['offline_time'] and '0000-00-00' not in previous['offline_time']:
                        detail['last_down_time'] = previous['offline_time']
                        detail['last_down_cause'] = previous['cause'] if previous['cause'] else '-'
                    else:
                        detail['last_down_time'] = '-'
                        detail['last_down_cause'] = '-'
                else:
                    # No previous down history
                    detail['last_down_time'] = '-'
                    detail['last_down_cause'] = '-'
        
        return detail
    
    def fetch_olt_tx_power(self, pon_port: str = "1/1/1") -> float:
        """Fetch Tx power dari OLT untuk port tertentu"""
        cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        tx_power = None
        if success and output:
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                line = line.strip()
                # Format: 1(GPON)    6.578(dbm)
                if '(gpon)' in line.lower() and 'dbm' in line.lower():
                    parts = line.split()
                    if len(parts) >= 2:
                        # Extract number from "6.578(dbm)"
                        power_str = parts[1].replace('(dbm)', '').replace('dbm', '').strip()
                        try:
                            tx_power = float(power_str)
                        except:
                            pass
        
        return tx_power
    
    def calculate_attenuation(self, tx_power: float, rx_power_str: str) -> dict:
        """Calculate attenuation (redaman) dari Tx dan Rx power
        
        Args:
            tx_power: Tx power OLT dalam dBm (float)
            rx_power_str: Rx power ONU dalam format "-10.245(dbm)" (string)
            
        Returns:
            dict dengan keys: attenuation (float), status (str), color (str)
        """
        result = {
            'attenuation': None,
            'attenuation_str': '-',
            'status': 'Unknown',
            'color': 'gray'
        }
        
        if tx_power is None or not rx_power_str or rx_power_str == '-':
            return result
        
        try:
            # Extract Rx power from string like "-10.245(dbm)"
            rx_str = rx_power_str.replace('(dbm)', '').replace('dbm', '').strip()
            rx_power = float(rx_str)
            
            # Calculate attenuation: Tx - Rx (karena Rx biasanya negatif, hasilnya positif)
            attenuation = tx_power - rx_power
            
            # Determine status based on attenuation value
            # Typical values:
            # < 15 dB: Excellent
            # 15-20 dB: Good
            # 20-25 dB: Fair
            # 25-28 dB: Poor
            # > 28 dB: Critical
            
            if attenuation < 15:
                status = 'Excellent'
                color = 'green'
            elif attenuation < 20:
                status = 'Good'
                color = 'green'
            elif attenuation < 25:
                status = 'Fair'
                color = 'yellow'
            elif attenuation < 28:
                status = 'Poor'
                color = 'orange'
            else:
                status = 'Critical'
                color = 'red'
            
            result = {
                'attenuation': attenuation,
                'attenuation_str': f"{attenuation:.2f} dB",
                'status': status,
                'color': color,
                'tx_power': tx_power,
                'rx_power': rx_power
            }
        except Exception as e:
            pass
        
        return result
    
    def fetch_working_onus_full(self, pon_port: str = "1/1/1") -> list:
        """Fetch daftar ONU working dengan data lengkap (detail + optical power + attenuation)"""
        # Get basic state
        onus = self.fetch_working_onus(pon_port)
        
        if not onus:
            return []
        
        # Get optical power for all ONUs
        power_data = self.fetch_onu_optical_power(pon_port)
        
        # Get OLT Tx power
        print(f"  Mengambil Tx power OLT untuk PON {pon_port}...")
        tx_power = self.fetch_olt_tx_power(pon_port)
        
        # Fetch detail for each ONU
        full_onus = []
        for onu in onus:
            onu_id = onu['onu_id']
            
            # Get detail info
            print(f"    Mengambil detail ONU {onu_id}...")
            detail = self.fetch_onu_detail(onu_id)
            
            # Get Rx power and calculate attenuation
            rx_power_str = power_data.get(onu_id, '-')
            attenuation_data = self.calculate_attenuation(tx_power, rx_power_str)
            
            # Merge data
            full_info = {
                'onu_id': onu_id,
                'name': detail.get('name', '-'),
                'type': detail.get('type', '-'),
                'serial_number': detail.get('serial_number', '-'),
                'description': detail.get('description', '-'),
                'phase_state': onu.get('phase_state', '-'),
                'admin_state': onu.get('admin_state', '-'),
                'config_state': detail.get('config_state', '-'),
                'rx_power': rx_power_str,
                'tx_power': f"{tx_power:.2f} dBm" if tx_power else '-',
                'attenuation': attenuation_data.get('attenuation_str', '-'),
                'attenuation_status': attenuation_data.get('status', 'Unknown'),
                'distance': detail.get('distance', '-'),
                'online_duration': detail.get('online_duration', '-'),
            }
            full_onus.append(full_info)
        
        return full_onus
    
    def fetch_onu_types(self) -> list:
        """Fetch daftar ONU type yang tersedia"""
        print("  Mengambil daftar ONU types...")
        
        # Command yang benar untuk ZTE C320
        success, output = self.client.execute_command("show run | include onu-type", timeout=30)
        
        types = set()  # Use set to avoid duplicates
        if success and output:
            # Split by \r\n first, then by \n as fallback
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                line = line.strip()
                # Format: "onu-type F660 gpon description..." or line containing "onu-type XXX gpon"
                if 'onu-type' in line and 'gpon' in line:
                    parts = line.split()
                    for i, p in enumerate(parts):
                        if p == 'onu-type' and i + 1 < len(parts):
                            onu_type = parts[i + 1]
                            if onu_type and not onu_type.startswith('%') and not onu_type.startswith('^'):
                                types.add(onu_type)
        
        # Convert to sorted list
        types_list = sorted(list(types))
        
        # Hanya gunakan types yang ditemukan dari OLT
        if types_list:
            self.onu_types = types_list
            print(f"  Ditemukan {len(self.onu_types)} ONU types dari OLT.")
        else:
            # Fallback: coba command lain untuk mendapatkan onu-type
            success2, output2 = self.client.execute_command("show gpon onu profile", timeout=10)
            if success2:
                for line in output2.split('\n'):
                    if 'onu-type' in line.lower():
                        parts = line.strip().split()
                        for i, p in enumerate(parts):
                            if p.lower() == 'onu-type' and i + 1 < len(parts):
                                types.add(parts[i + 1])
            types_list = sorted(list(types))
            self.onu_types = types_list if types_list else []
            print(f"  Ditemukan {len(self.onu_types)} ONU types.")
        
        return self.onu_types
    
    def fetch_tcont_profiles(self) -> list:
        """Fetch daftar TCONT profile dari OLT (dynamic)"""
        print("  Mengambil daftar TCONT profiles dari OLT...")
        
        # Try different commands based on vendor
        commands = [
            "show gpon profile tcont",  # ZTE C300/C320 - Best output format
            "show running-config | include profile tcont",  # ZTE fallback
            "display tcont-profile",  # Fiberhome
            "display dba-profile",  # Huawei
        ]
        
        profiles = []
        
        for cmd in commands:
            success, output = self.client.execute_command(cmd, timeout=10)
            
            if success and output and "Error" not in output and "Invalid" not in output:
                lines = output.split('\n')
                
                for line in lines:
                    line = line.strip()
                    
                    # Format 1: "Profile name :UP-PPPOE" (ZTE show gpon profile tcont)
                    if line.startswith('Profile name'):
                        parts = line.split(':')
                        if len(parts) >= 2:
                            profile_name = parts[1].strip()
                            if profile_name and profile_name != 'default':
                                profiles.append(profile_name)
                    
                    # Format 2: "profile tcont UP-PPPOE type 4..." (running-config)
                    elif 'profile tcont' in line.lower():
                        parts = line.split()
                        # Find 'tcont' keyword and get next word as profile name
                        for i, part in enumerate(parts):
                            if part.lower() == 'tcont' and i + 1 < len(parts):
                                profile_name = parts[i + 1]
                                # Validate profile name (should start with letter or contain hyphen)
                                if profile_name and (profile_name[0].isupper() or '-' in profile_name):
                                    profiles.append(profile_name)
                                break
                    
                    # Format 3: Fiberhome/Huawei formats (add specific parsing if needed)
                    # Add more parsing logic here based on actual output from other vendors
                
                # If we found profiles, stop trying other commands
                if profiles:
                    break
        
        # Remove duplicates and sort
        profiles = list(set(profiles))
        profiles.sort()
        
        # If no profiles found, return empty (no dummy data)
        if not profiles:
            print("  [ERROR] Tidak dapat mengambil TCONT profiles dari OLT!")
            print("  [ERROR] Pastikan koneksi OLT OK dan command 'show gpon profile tcont' didukung")
        else:
            print(f"  [OK] Ditemukan {len(profiles)} TCONT profiles")
        
        self.tcont_profiles = profiles
        return self.tcont_profiles
    
    def fetch_traffic_profiles(self) -> list:
        """Fetch daftar Traffic profile dari OLT (dynamic)"""
        print("  Mengambil daftar Traffic profiles dari OLT...")
        
        # Try different commands based on vendor
        commands = [
            "show gpon profile traffic",  # ZTE C300/C320 - Best output format
            "show running-config | include profile traffic",  # ZTE fallback
            "display traffic-profile",  # Fiberhome
            "display traffic table",  # Huawei
        ]
        
        profiles = []
        
        for cmd in commands:
            success, output = self.client.execute_command(cmd, timeout=10)
            
            if success and output and "Error" not in output and "Invalid" not in output:
                lines = output.split('\n')
                
                for line in lines:
                    line = line.strip()
                    
                    # Format 1: "Profile name :DOWN-100M" (ZTE show gpon profile traffic)
                    if line.startswith('Profile name'):
                        parts = line.split(':')
                        if len(parts) >= 2:
                            profile_name = parts[1].strip()
                            if profile_name and profile_name != 'default':
                                profiles.append(profile_name)
                    
                    # Format 2: "profile traffic DOWN-100M ..." (running-config)
                    elif 'profile traffic' in line.lower():
                        parts = line.split()
                        # Find 'traffic' keyword and get next word as profile name
                        for i, part in enumerate(parts):
                            if part.lower() == 'traffic' and i + 1 < len(parts):
                                profile_name = parts[i + 1]
                                # Validate profile name
                                if profile_name and (profile_name[0].isupper() or '-' in profile_name):
                                    profiles.append(profile_name)
                                break
                    
                    # Format 3: Fiberhome/Huawei formats (add specific parsing if needed)
                
                # If we found profiles, stop trying other commands
                if profiles:
                    break
        
        # Remove duplicates and sort
        profiles = list(set(profiles))
        profiles.sort()
        
        # If no profiles found, return empty (no dummy data)
        if not profiles:
            print("  [ERROR] Tidak dapat mengambil Traffic profiles dari OLT!")
            print("  [ERROR] Pastikan koneksi OLT OK dan command 'show gpon profile traffic' didukung")
        else:
            print(f"  [OK] Ditemukan {len(profiles)} Traffic profiles")
        
        self.traffic_profiles = profiles
        return self.traffic_profiles
    
    def fetch_vlans(self) -> list:
        """Fetch daftar VLAN"""
        print("  Mengambil daftar VLANs...")
        
        success, output = self.client.execute_command("show vlan summary", timeout=10)
        
        vlans = []
        if success:
            lines = output.split('\n')
            for line in lines:
                # Parse VLAN ID from lines
                match = re.search(r'\b(\d{1,4})\b', line)
                if match:
                    vlan_id = int(match.group(1))
                    if 1 <= vlan_id <= 4094:
                        vlans.append(vlan_id)
        
        self.vlans = sorted(set(vlans)) if vlans else [100, 200, 1010]
        return self.vlans
    
    def get_next_onu_id(self, pon_port: str) -> int:
        """Get next available ONU ID untuk PON port"""
        working = self.fetch_working_onus(pon_port)
        
        used_ids = []
        for onu in working:
            if ':' in onu['onu_id']:
                try:
                    onu_num = int(onu['onu_id'].split(':')[1])
                    used_ids.append(onu_num)
                except:
                    pass
        
        # Find next available
        next_id = 1
        while next_id in used_ids:
            next_id += 1
        
        return next_id
    
    # ==================== ONU OPERATIONS ====================
    
    def register_onu(self, pon_port: str, sn: str, onu_id: int, onu_type: str,
                     name: str = "", description: str = "") -> tuple:
        """Register ONU baru"""
        print(f"\n  Registering ONU...")
        print(f"    PON Port: {pon_port}")
        print(f"    SN: {sn}")
        print(f"    ONU ID: {onu_id}")
        print(f"    Type: {onu_type}")
        if name:
            print(f"    Name: {name}")
        if description:
            print(f"    Description: {description}")
        
        # Normalize PON port format - extract just the port number (e.g., 1/1/1)
        # Input bisa: "1/1/1", "gpon-olt_1/1/1", "gpon_olt-1/1/1"
        match = re.search(r'(\d+/\d+/\d+)', pon_port)
        if match:
            port_num = match.group(1)  # Always get just "1/1/1"
        else:
            port_num = pon_port
        
        pon_interface = f"gpon-olt_{port_num}"
        
        # Enter config mode
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # Enter PON interface
        success, output = self.client.execute_command(f"interface {pon_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        # Register ONU
        cmd = f"onu {onu_id} type {onu_type} sn {sn}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        if "%" in output and "error" in output.lower():
            self.client.execute_command("exit")
            self.client.execute_command("end")
            return False, f"Failed to register: {output}"
        
        print(f"    ✓ ONU registered successfully!")
        
        # Set name and description if provided
        if name or description:
            # Build correct ONU interface: gpon-onu_1/1/1:2
            onu_interface = f"gpon-onu_{port_num}:{onu_id}"
            
            self.client.execute_command("exit")  # Exit from PON interface
            success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
            
            if "%" not in output or "error" not in output.lower():
                if name:
                    self.client.execute_command(f"name {name}", timeout=3)
                    print(f"    ✓ Name set: {name}")
                
                if description:
                    self.client.execute_command(f"description {description}", timeout=3)
                    print(f"    ✓ Description set: {description}")
            else:
                print(f"    ⚠ Warning: Could not enter ONU interface to set name/description")
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"ONU {onu_id} registered successfully"
    
    def set_onu_name(self, onu_id: str, name: str) -> tuple:
        """Set name untuk ONU"""
        onu_interface = f"gpon-onu_{onu_id}" if not onu_id.startswith("gpon") else onu_id
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed: {output}"
        
        success, output = self.client.execute_command(f"name {name}", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Name set to '{name}'"
    
    def set_onu_description(self, onu_id: str, description: str) -> tuple:
        """Set description untuk ONU"""
        onu_interface = f"gpon-onu_{onu_id}" if not onu_id.startswith("gpon") else onu_id
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed: {output}"
        
        success, output = self.client.execute_command(f"description {description}", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Description set to '{description}'"
    
    def set_onu_name_and_description(self, onu_id: str, name: str = None, description: str = None) -> tuple:
        """Set name dan/atau description untuk ONU dalam satu transaksi"""
        onu_interface = f"gpon-onu_{onu_id}" if not onu_id.startswith("gpon") else onu_id
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter ONU interface: {output}"
        
        results = []
        
        if name:
            self.client.execute_command(f"name {name}", timeout=3)
            results.append(f"Name: {name}")
        
        if description:
            self.client.execute_command(f"description {description}", timeout=3)
            results.append(f"Description: {description}")
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Updated: {', '.join(results)}"

    def get_batch_service_config(self) -> dict:
        """
        Menu interaktif untuk konfigurasi service batch (untuk register all/multiple)
        Returns dict dengan semua konfigurasi service yang dipilih
        """
        print("""
  ╔════════════════════════════════════════════════════════════════╗
  ║             KONFIGURASI SERVICE UNTUK SEMUA ONU                ║
  ╠════════════════════════════════════════════════════════════════╣
  ║  [1] PPPoE           - PPPoE untuk internet dial-up            ║
  ║  [2] Bridge          - Bridge mode (transparent)               ║
  ║  [3] VLAN Only       - TCONT/Traffic/VLAN/Gemport              ║
  ║  [4] Fiberhome VEIP  - HG6145D2-AC (TR069+Internet+VoIP)       ║
  ║  [5] ZTE Full        - Dual SSID, Dual VLAN, TR069, Firewall   ║
  ║  [6] Huawei Full     - Multi VLAN, WAN DHCP (no OMCI)          ║
  ║  [N] Skip            - Register saja, tanpa konfigurasi        ║
  ╚════════════════════════════════════════════════════════════════╝
        """)
        
        service_choice = input("  Pilih service [1-6/N]: ").strip().upper()
        
        config = {
            'service_type': None,
            'tcont_profile': '',
            'traffic_profile': '',
            'vlan_id': 100,
            'gemport': 1,
            'tcont': 1,
            'service_config': {}
        }
        
        if service_choice == 'N' or not service_choice:
            return config
        
        if service_choice == '1':
            # PPPOE
            config['service_type'] = 'pppoe'
            print("\n  --- Konfigurasi PPPoE ---")
            username = input("    PPPoE Username (kosongkan untuk skip): ").strip()
            password = input("    PPPoE Password: ").strip() if username else ""
            if username and password:
                config['service_config'] = {'username': username, 'password': password}
            else:
                config['service_type'] = 'vlan'  # Fallback ke VLAN only
                
        elif service_choice == '2':
            # BRIDGE
            config['service_type'] = 'bridge'
            
        elif service_choice == '3':
            # VLAN Only
            config['service_type'] = 'vlan'
            
        elif service_choice == '4':
            # FIBERHOME VEIP
            config['service_type'] = 'fiberhome_veip'
            print("\n  --- Konfigurasi Fiberhome VEIP (HG6145D2-AC) ---")
            print("    Default: TR069=100, Internet=30, VoIP=151")
            
            tr069_vlan = self.input_int("    TR069/Management VLAN", default=100, min_val=1, max_val=4094)
            internet_vlan = self.input_int("    Internet/IPTV VLAN", default=30, min_val=1, max_val=4094)
            voip_vlan = self.input_int("    VoIP VLAN", default=151, min_val=1, max_val=4094)
            
            print("\n  --- Konfigurasi ACS/TR069 ---")
            acs_url = input("    ACS URL (default http://192.168.54.254:7547): ").strip()
            if not acs_url:
                acs_url = "http://192.168.54.254:7547"
            acs_user = input("    ACS Username (default acs): ").strip() or "acs"
            acs_pass = input("    ACS Password (default acs): ").strip() or "acs"
            
            # TCONT Profile Selection (Dynamic)
            print("\n  --- TCONT Profile ---")
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            if self.tcont_profiles:
                print("    Available TCONT Profiles:")
                for i, prof in enumerate(self.tcont_profiles[:10], 1):
                    print(f"      [{i}] {prof}")
                tcont_idx = self.input_int("    Pilih TCONT Profile", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile_fh = self.tcont_profiles[tcont_idx - 1]
            else:
                tcont_profile_fh = input("    TCONT Profile (default UP-PPPOE): ").strip() or "UP-PPPOE"
            
            config['service_config'] = {
                'tr069_vlan': tr069_vlan,
                'internet_vlan': internet_vlan,
                'voip_vlan': voip_vlan,
                'acs_url': acs_url,
                'acs_username': acs_user,
                'acs_password': acs_pass,
                'tcont_profile': tcont_profile_fh
            }
            return config  # Fiberhome VEIP punya konfigurasi sendiri
        
        elif service_choice == '5':
            # ZTE FULL CONFIG
            config['service_type'] = 'zte_full'
            print("\n  --- Konfigurasi ZTE Full (Dual SSID, Dual VLAN) ---")
            
            # Dual VLAN
            print("\n  -- VLAN Settings --")
            primary_vlan = self.input_int("    Primary VLAN (Internet)", default=30, min_val=1, max_val=4094)
            secondary_vlan = self.input_int("    Secondary VLAN (Voucher/VoIP)", default=151, min_val=1, max_val=4094)
            
            # Traffic Profile
            print("\n  -- Traffic Limit --")
            if not self.traffic_profiles:
                self.fetch_traffic_profiles()
            traffic_profile = ""
            if self.traffic_profiles:
                print("    Pilih Traffic Profile (downstream limit):")
                print("    [0] No Limit")
                for i, t in enumerate(self.traffic_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                traffic_choice = self.input_int("    Pilih", default=0, min_val=0, max_val=min(10, len(self.traffic_profiles)))
                if traffic_choice > 0:
                    traffic_profile = self.traffic_profiles[traffic_choice - 1]
            
            # PPPoE
            print("\n  -- PPPoE Configuration --")
            pppoe_user = input("    PPPoE Username: ").strip()
            pppoe_pass = input("    PPPoE Password: ").strip() if pppoe_user else ""
            
            # ETH Port VLAN Assignment
            print("\n  -- ETH Port VLAN Assignment --")
            print(f"    Default: ETH 1-2 = VLAN {primary_vlan}, ETH 3-4 = VLAN {secondary_vlan}")
            use_default_eth = input("    Use default? [Y/n]: ").strip().upper() != 'N'
            
            eth_vlans = {}
            if use_default_eth:
                eth_vlans = {
                    'eth1_vlan': primary_vlan,
                    'eth2_vlan': primary_vlan,
                    'eth3_vlan': secondary_vlan,
                    'eth4_vlan': secondary_vlan
                }
            else:
                eth_vlans['eth1_vlan'] = self.input_int("    ETH 1 VLAN", default=primary_vlan, min_val=1, max_val=4094)
                eth_vlans['eth2_vlan'] = self.input_int("    ETH 2 VLAN", default=primary_vlan, min_val=1, max_val=4094)
                eth_vlans['eth3_vlan'] = self.input_int("    ETH 3 VLAN", default=secondary_vlan, min_val=1, max_val=4094)
                eth_vlans['eth4_vlan'] = self.input_int("    ETH 4 VLAN", default=secondary_vlan, min_val=1, max_val=4094)
            
            # Dual SSID
            print("\n  -- WiFi SSID Configuration --")
            enable_dual_ssid = input("    Enable Dual SSID? [Y/n]: ").strip().upper() != 'N'
            
            # SSID 1 (Internet)
            ssid1_name = input("    SSID 1 Name (Internet) [Internet_SSID]: ").strip() or "Internet_SSID"
            print("    SSID 1 Auth Type:")
            print("      [1] WPA2-PSK (recommended)")
            print("      [2] WPA/WPA2-Mixed (TKIP+AES)")
            print("      [3] WEP")
            print("      [4] Open (no password)")
            ssid1_auth_choice = input("    Pilih [1-4]: ").strip() or "1"
            
            ssid1_auth = "wpa2"
            ssid1_password = ""
            if ssid1_auth_choice == "1":
                ssid1_auth = "wpa2"
                ssid1_password = input("    SSID 1 Password [12345678]: ").strip() or "12345678"
            elif ssid1_auth_choice == "2":
                ssid1_auth = "wpa_mixed"
                ssid1_password = input("    SSID 1 Password [12345678]: ").strip() or "12345678"
            elif ssid1_auth_choice == "3":
                ssid1_auth = "wep"
                ssid1_password = input("    SSID 1 WEP Key: ").strip()
            else:
                ssid1_auth = "open"
            
            # SSID 2 (Voucher/Guest)
            ssid2_name = ""
            ssid2_auth = "open"
            ssid2_password = ""
            if enable_dual_ssid:
                ssid2_name = input("    SSID 2 Name (Voucher) [Voucher_SSID]: ").strip() or "Voucher_SSID"
                print("    SSID 2 Auth Type:")
                print("      [1] WPA2-PSK")
                print("      [2] WPA/WPA2-Mixed (TKIP+AES)")
                print("      [3] WEP")
                print("      [4] Open (no password) - recommended for voucher")
                ssid2_auth_choice = input("    Pilih [1-4]: ").strip() or "4"
                
                if ssid2_auth_choice == "1":
                    ssid2_auth = "wpa2"
                    ssid2_password = input("    SSID 2 Password: ").strip()
                elif ssid2_auth_choice == "2":
                    ssid2_auth = "wpa_mixed"
                    ssid2_password = input("    SSID 2 Password: ").strip()
                elif ssid2_auth_choice == "3":
                    ssid2_auth = "wep"
                    ssid2_password = input("    SSID 2 WEP Key: ").strip()
                else:
                    ssid2_auth = "open"
            
            # TR069
            print("\n  -- TR069/ACS Configuration --")
            enable_tr069 = input("    Enable TR069? [Y/n]: ").strip().upper() != 'N'
            acs_url = ""
            acs_user = ""
            acs_pass = ""
            if enable_tr069:
                acs_url = input("    ACS URL (default http://192.168.54.254:7547): ").strip() or "http://192.168.54.254:7547"
                acs_user = input("    ACS Username (default admin): ").strip() or "admin"
                acs_pass = input("    ACS Password (default admin): ").strip() or "admin"
            
            # Firewall & Security
            print("\n  -- Security Settings --")
            enable_firewall = input("    Enable Firewall? [Y/n]: ").strip().upper() != 'N'
            firewall_level = "low"
            if enable_firewall:
                print("    Firewall Level: [1] Low  [2] Medium  [3] High")
                level_choice = input("    Pilih [1/2/3]: ").strip()
                if level_choice == '2':
                    firewall_level = "medium"
                elif level_choice == '3':
                    firewall_level = "high"
            enable_security_mgmt = input("    Enable Security Management? [Y/n]: ").strip().upper() != 'N'
            
            # TCONT Profile
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            tcont_profile = "UP-PPPOE"
            if self.tcont_profiles:
                print("\n    Pilih TCONT Profile:")
                for i, t in enumerate(self.tcont_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                tcont_choice = self.input_int("    Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile = self.tcont_profiles[tcont_choice - 1]
            
            config['tcont_profile'] = tcont_profile
            config['traffic_profile'] = traffic_profile
            config['vlan_id'] = primary_vlan
            config['service_config'] = {
                'primary_vlan': primary_vlan,
                'secondary_vlan': secondary_vlan,
                'traffic_profile': traffic_profile,
                'pppoe_user': pppoe_user,
                'pppoe_pass': pppoe_pass,
                **eth_vlans,
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
                'enable_security_mgmt': enable_security_mgmt
            }
            return config  # ZTE Full punya konfigurasi sendiri
        
        elif service_choice == '6':
            # HUAWEI FULL CONFIG (no OMCI support via ZTE OLT)
            config['service_type'] = 'huawei_full'
            print("\n  --- Konfigurasi Huawei Full (Multi VLAN, WAN DHCP) ---")
            print("    ⚠️ Huawei ONU tidak support OMCI via ZTE OLT")
            print("    ⚠️ WiFi/SSID/Firewall harus dikonfigurasi via TR069/GenieACS")
            
            # Multi VLAN
            print("\n  -- VLAN Settings --")
            mgmt_vlan = self.input_int("    Management/TR069 VLAN", default=1010, min_val=1, max_val=4094)
            internet_vlan = self.input_int("    Internet VLAN", default=30, min_val=1, max_val=4094)
            voip_vlan = self.input_int("    VoIP VLAN", default=151, min_val=1, max_val=4094)
            
            # VLAN Profile
            print("\n  -- WAN-IP Settings --")
            vlan_profile = input("    VLAN Profile Name (default genieacs): ").strip() or "genieacs"
            
            # Traffic Profile
            print("\n  -- Traffic Limit --")
            if not self.traffic_profiles:
                self.fetch_traffic_profiles()
            traffic_profile = ""
            if self.traffic_profiles:
                print("    Pilih Traffic Profile (downstream limit):")
                print("    [0] No Limit")
                for i, t in enumerate(self.traffic_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                traffic_choice = self.input_int("    Pilih", default=0, min_val=0, max_val=min(10, len(self.traffic_profiles)))
                if traffic_choice > 0:
                    traffic_profile = self.traffic_profiles[traffic_choice - 1]
            
            # TCONT Profile
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            tcont_profile = "UP-PPPOE"
            if self.tcont_profiles:
                print("\n    Pilih TCONT Profile:")
                for i, t in enumerate(self.tcont_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                tcont_choice = self.input_int("    Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile = self.tcont_profiles[tcont_choice - 1]
            
            config['tcont_profile'] = tcont_profile
            config['traffic_profile'] = traffic_profile
            config['vlan_id'] = internet_vlan
            config['service_config'] = {
                'mgmt_vlan': mgmt_vlan,
                'internet_vlan': internet_vlan,
                'voip_vlan': voip_vlan,
                'vlan_profile': vlan_profile,
                'traffic_profile': traffic_profile
            }
            return config  # Huawei Full punya konfigurasi sendiri
        
        # Untuk non-Fiberhome, minta TCONT/Traffic/VLAN/Gemport
        if config['service_type'] and config['service_type'] != 'fiberhome_veip':
            print("\n  --- Konfigurasi Profile ---")
            
            # TCONT Profile
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            if self.tcont_profiles:
                print("\n  Pilih TCONT Profile:")
                for i, t in enumerate(self.tcont_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                config['tcont_profile'] = self.tcont_profiles[tcont_choice - 1]
            else:
                config['tcont_profile'] = input("    TCONT Profile name: ").strip() or "UP-PPPOE"
            
            # Traffic Profile
            if not self.traffic_profiles:
                self.fetch_traffic_profiles()
            
            if self.traffic_profiles:
                print("\n  Pilih Traffic Profile:")
                for i, t in enumerate(self.traffic_profiles[:10], 1):
                    print(f"    [{i}] {t}")
                traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
                config['traffic_profile'] = self.traffic_profiles[traffic_choice - 1]
            else:
                config['traffic_profile'] = input("    Traffic Profile name (optional): ").strip()
            
            # VLAN
            config['vlan_id'] = self.input_int("  VLAN ID", default=100, min_val=1, max_val=4094)
            
            # Gemport & TCONT number
            config['gemport'] = self.input_int("  Gemport number", default=1, min_val=1, max_val=16)
            config['tcont'] = self.input_int("  TCONT number", default=1, min_val=1, max_val=8)
        
        return config

    def apply_batch_service_config(self, onu_full_id: str, config: dict) -> tuple:
        """
        Apply konfigurasi service ke ONU berdasarkan config dari get_batch_service_config
        Returns (success, message)
        """
        service_type = config.get('service_type')
        
        if not service_type:
            return True, "Skip (no service configured)"
        
        service_config = config.get('service_config', {})
        
        if service_type == 'fiberhome_veip':
            return self.config_manager.configure_fiberhome_veip(
                onu_full_id,
                acs_url=service_config.get('acs_url', 'http://192.168.54.254:7547'),
                acs_username=service_config.get('acs_username', 'acs'),
                acs_password=service_config.get('acs_password', 'acs'),
                tr069_vlan=service_config.get('tr069_vlan', 100),
                internet_vlan=service_config.get('internet_vlan', 30),
                voip_vlan=service_config.get('voip_vlan', 151),
                tcont_profile=service_config.get('tcont_profile', 'UP-PPPOE')
            )
        
        elif service_type == 'pppoe' and service_config:
            return self.config_manager.configure_pppoe(
                onu_full_id,
                service_config['username'],
                service_config['password'],
                config['vlan_id'],
                config['tcont_profile'],
                config['traffic_profile']
            )
        
        elif service_type == 'bridge':
            return self.config_manager.configure_bridge(
                onu_full_id,
                config['vlan_id'],
                config['tcont_profile'],
                eth_port=1
            )
        
        elif service_type == 'zte_full':
            return self.config_manager.configure_zte_full(
                onu_full_id,
                config.get('tcont_profile', 'UP-PPPOE'),
                service_config
            )
        
        elif service_type == 'huawei_full':
            return self.config_manager.configure_huawei_full(
                onu_full_id,
                config.get('tcont_profile', 'UP-PPPOE'),
                service_config
            )
        
        elif service_type == 'vlan':
            return self.configure_onu_service(
                onu_full_id,
                config['tcont_profile'],
                config['traffic_profile'],
                config['vlan_id'],
                config['gemport'],
                config['tcont']
            )
        
        return True, "Skip"

    def configure_onu_service(self, onu_id: str, tcont_profile: str, 
                              traffic_profile: str, vlan_id: int,
                              gemport: int = 1, tcont: int = 1) -> tuple:
        """
        Configure service untuk ONU (TCONT, GEM, VLAN)
        
        Reference format (ZTE C320):
        interface gpon-onu_1/1/1:1
          tcont 1 name VLAN{vlan} profile {tcont_profile}
          gemport 1 tcont 1
          gemport 1 traffic-limit downstream {traffic_profile}
          service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
        """
        onu_interface = f"gpon-onu_{onu_id}" if not onu_id.startswith("gpon") else onu_id
        service_name = f"VLAN{vlan_id:04d}"  # e.g., VLAN0030
        
        print(f"\n  Configuring service for {onu_interface}...")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # Enter ONU interface
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed: {output}"
        
        # Set TCONT with name: tcont 1 name VLAN0030 profile UP-PPPOE
        cmd = f"tcont {tcont} name {service_name} profile {tcont_profile}"
        success, output = self.client.execute_command(cmd, timeout=3)
        if "%" in output:
            # Fallback tanpa name
            cmd = f"tcont {tcont} profile {tcont_profile}"
            self.client.execute_command(cmd, timeout=3)
        print(f"    ✓ TCONT {tcont} = {tcont_profile}")
        
        # Set GEM port: gemport 1 tcont 1
        cmd = f"gemport {gemport} tcont {tcont}"
        self.client.execute_command(cmd, timeout=3)
        print(f"    ✓ GEM port {gemport} -> TCONT {tcont}")
        
        # Set traffic limit downstream: gemport 1 traffic-limit downstream {profile}
        if traffic_profile:
            cmd = f"gemport {gemport} traffic-limit downstream {traffic_profile}"
            self.client.execute_command(cmd, timeout=3)
            print(f"    ✓ Traffic limit downstream = {traffic_profile}")
        
        # Set service-port (di interface, bukan pon-onu-mng)
        cmd = f"service-port 1 vport 1 user-vlan {vlan_id} vlan {vlan_id}"
        self.client.execute_command(cmd, timeout=3)
        print(f"    ✓ Service-port VLAN {vlan_id}")
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, "Service configured successfully"
    
    # ==================== MENUS ====================
    
    def main_menu(self):
        """Menu utama"""
        while True:
            self.clear_screen()
            self.print_header("ONU REGISTRATION WIZARD - ZTE C320")
            
            print("""
    ╔══════════════════════════════════════════════════════════════╗
    ║                     MENU UTAMA                               ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  [1] 📡 Lihat ONU Belum Terdaftar (Unconfigured)             ║
    ║  [2] 📋 Lihat ONU Sudah Terdaftar (Working)                  ║
    ║  [3] ✏️  Edit Nama/Deskripsi ONU                              ║
    ║  [4] ⚙️  Konfigurasi Service ONU                              ║
    ║  [5] 🔧 Management Profile (TCONT/Traffic/VLAN)              ║
    ║  [6] 💾 Simpan Konfigurasi                                   ║
    ║  [0] 🚪 Keluar                                               ║
    ╚══════════════════════════════════════════════════════════════╝
            """)
            
            choice = input("\n  Pilih menu [0-6]: ").strip()
            
            if choice == '1':
                self.menu_unconfigured_onu()
            elif choice == '2':
                self.menu_working_onu()
            elif choice == '3':
                self.menu_edit_onu()
            elif choice == '4':
                self.menu_configure_service()
            elif choice == '5':
                self.menu_profile_management()
            elif choice == '6':
                self.save_configuration()
            elif choice == '0':
                print("\n  Terima kasih! Sampai jumpa.")
                break
    
    def menu_unconfigured_onu(self):
        """Menu untuk ONU yang belum terdaftar"""
        self.clear_screen()
        self.print_header("ONU BELUM TERDAFTAR (UNCONFIGURED)")
        
        onus = self.fetch_unconfigured_onus()
        
        if not onus:
            print("\n  ✓ Tidak ada ONU yang belum terdaftar.")
            self.press_enter()
            return
        
        while True:
            self.clear_screen()
            self.print_header("ONU BELUM TERDAFTAR (UNCONFIGURED)")
            
            print(f"\n  Ditemukan {len(onus)} ONU belum terdaftar:\n")
            print("  " + "-" * 75)
            print(f"  {'No':>3} | {'PON Port':<15} | {'Serial Number':<20} | {'Model':<15} | {'Password':<10}")
            print("  " + "-" * 75)
            
            for i, onu in enumerate(onus, 1):
                model = onu.get('model', '-') or '-'
                pw = onu.get('password', '-') or '-'
                print(f"  {i:>3} | {onu['pon_port']:<15} | {onu['sn']:<20} | {model:<15} | {pw:<10}")
            
            print("  " + "-" * 75)
            print(f"""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  PILIHAN:                                                     ║
  ║  [1-{len(onus):<3}] Register ONU tertentu (masukkan nomor)             ║
  ║  [A]   Register SEMUA ONU sekaligus                           ║
  ║  [M]   Register BEBERAPA ONU (pilih multiple)                 ║
  ║  [R]   Refresh daftar ONU                                     ║
  ║  [0]   Kembali ke menu utama                                  ║
  ╚═══════════════════════════════════════════════════════════════╝
            """)
            
            choice = input("  Pilihan Anda: ").strip().upper()
            
            if choice == '0':
                return
            elif choice == 'R':
                print("\n  Refreshing...")
                onus = self.fetch_unconfigured_onus()
                continue
            elif choice == 'A':
                self.register_all_onus(onus)
                print("\n  Refreshing data...")
                onus = self.fetch_unconfigured_onus()
                if not onus:
                    print("\n  ✓ Semua ONU sudah terdaftar!")
                    self.press_enter()
                    return
            elif choice == 'M':
                self.register_multiple_onus(onus)
                print("\n  Refreshing data...")
                onus = self.fetch_unconfigured_onus()
                if not onus:
                    print("\n  ✓ Semua ONU sudah terdaftar!")
                    self.press_enter()
                    return
            else:
                try:
                    idx = int(choice) - 1
                    if 0 <= idx < len(onus):
                        self.register_single_onu_wizard(onus[idx])
                        print("\n  Refreshing data...")
                        onus = self.fetch_unconfigured_onus()
                        if not onus:
                            print("\n  ✓ Semua ONU sudah terdaftar!")
                            self.press_enter()
                            return
                    else:
                        print("  ❌ Nomor tidak valid!")
                        self.press_enter()
                except ValueError:
                    print("  ❌ Input tidak valid!")
                    self.press_enter()
    
    def register_multiple_onus(self, onus: list):
        """Register beberapa ONU yang dipilih dengan konfigurasi service"""
        self.clear_screen()
        self.print_header("REGISTER BEBERAPA ONU")
        
        print(f"\n  Total {len(onus)} ONU tersedia.\n")
        print("  Masukkan nomor ONU yang ingin didaftarkan.")
        print("  Pisahkan dengan koma atau spasi. Contoh: 1,3,5 atau 1 3 5")
        print("  Untuk range gunakan dash. Contoh: 1-5 atau 1,3,5-8")
        
        selection = input("\n  Pilih ONU: ").strip()
        
        # Parse selection
        selected_indices = []
        
        # Replace comma and space with single separator
        selection = selection.replace(' ', ',')
        parts = [p.strip() for p in selection.split(',') if p.strip()]
        
        for part in parts:
            if '-' in part:
                # Range like 1-5
                try:
                    start, end = part.split('-')
                    start, end = int(start), int(end)
                    for i in range(start, end + 1):
                        if 1 <= i <= len(onus) and (i - 1) not in selected_indices:
                            selected_indices.append(i - 1)
                except:
                    pass
            else:
                # Single number
                try:
                    idx = int(part) - 1
                    if 0 <= idx < len(onus) and idx not in selected_indices:
                        selected_indices.append(idx)
                except:
                    pass
        
        if not selected_indices:
            print("  ❌ Tidak ada ONU yang dipilih!")
            self.press_enter()
            return
        
        # Show selected ONUs
        selected_onus = [onus[i] for i in selected_indices]
        print(f"\n  ONU yang akan didaftarkan ({len(selected_onus)} unit):")
        print("  " + "-" * 50)
        for i, onu in enumerate(selected_onus, 1):
            print(f"    {i}. {onu['pon_port']} - {onu['sn']}")
        print("  " + "-" * 50)
        
        # Get default type
        if not self.onu_types:
            self.fetch_onu_types()
        
        max_display = min(len(self.onu_types), 20)
        print("\n  Pilih Type ONU untuk semua:")
        for i, t in enumerate(self.onu_types[:max_display], 1):
            print(f"    [{i:2d}] {t}")
        
        type_choice = self.input_int("  Pilih type", default=1, min_val=1, max_val=max_display)
        default_type = self.onu_types[type_choice - 1] if type_choice <= len(self.onu_types) else self.onu_types[0]
        
        # Get service configuration
        service_config = self.get_batch_service_config()
        
        # Summary
        print("\n  " + "=" * 60)
        print("  RINGKASAN KONFIGURASI:")
        print("  " + "-" * 60)
        print(f"    ONU Count    : {len(selected_onus)}")
        print(f"    ONU Type     : {default_type}")
        if service_config['service_type']:
            print(f"    Service Type : {service_config['service_type'].upper()}")
            if service_config['service_type'] == 'fiberhome_veip':
                svc = service_config['service_config']
                print(f"    TR069 VLAN   : {svc.get('tr069_vlan', 100)}")
                print(f"    Internet VLAN: {svc.get('internet_vlan', 30)}")
                print(f"    VoIP VLAN    : {svc.get('voip_vlan', 151)}")
                print(f"    ACS URL      : {svc.get('acs_url', '-')}")
            else:
                print(f"    VLAN ID      : {service_config.get('vlan_id', 100)}")
                print(f"    TCONT Profile: {service_config.get('tcont_profile', '-')}")
                print(f"    Traffic Prof : {service_config.get('traffic_profile', '-')}")
                print(f"    Gemport      : {service_config.get('gemport', 1)}")
        else:
            print("    Service Type : SKIP (tanpa konfigurasi)")
        print("  " + "=" * 60)
        
        confirm = input(f"\n  Lanjutkan registrasi? [Y/n]: ").strip().lower()
        
        if confirm == 'n':
            print("  Dibatalkan.")
            self.press_enter()
            return
        
        success_count = 0
        fail_count = 0
        config_success = 0
        config_fail = 0
        
        for i, onu in enumerate(selected_onus, 1):
            print(f"\n  [{i}/{len(selected_onus)}] Registering {onu['sn']}...")
            
            match = re.search(r'(\d+/\d+/\d+)', onu['pon_port'])
            port_num = match.group(1) if match else "1/1/1"
            
            next_id = self.get_next_onu_id(port_num)
            name = f"ONU-{port_num.replace('/', '')}:{next_id}"
            
            success, msg = self.register_onu(
                onu['pon_port'],
                onu['sn'],
                next_id,
                default_type,
                name
            )
            
            if success:
                success_count += 1
                onu_full_id = f"{port_num}:{next_id}"
                print(f"    ✓ Registered - ID: {onu_full_id}")
                
                # Apply service configuration
                if service_config['service_type']:
                    print(f"      Configuring {service_config['service_type']}...")
                    svc_success, svc_msg = self.apply_batch_service_config(onu_full_id, service_config)
                    if svc_success:
                        config_success += 1
                        print(f"      ✓ Service: {svc_msg}")
                    else:
                        config_fail += 1
                        print(f"      ✗ Service: {svc_msg}")
            else:
                fail_count += 1
                print(f"    ✗ Failed: {msg}")
            
            time.sleep(0.5)
        
        print(f"\n  " + "=" * 60)
        print(f"  HASIL REGISTRASI:")
        print(f"  " + "-" * 60)
        print(f"  Registrasi : {success_count} BERHASIL, {fail_count} GAGAL")
        if service_config['service_type']:
            print(f"  Konfigurasi: {config_success} BERHASIL, {config_fail} GAGAL")
        print(f"  " + "=" * 60)
        
        # Auto-sync setelah register multiple
        if success_count > 0:
            print("\n  Sinkronisasi data OLT...")
            time.sleep(2)
            self.sync_onu_data()
            print("  " + "=" * 60)
        
        self.press_enter()
    
    def register_single_onu_wizard(self, onu: dict):
        """Wizard untuk register satu ONU"""
        self.clear_screen()
        self.print_header("REGISTER ONU - STEP BY STEP")
        
        print(f"\n  ONU yang akan didaftarkan:")
        print(f"    PON Port : {onu['pon_port']}")
        print(f"    SN       : {onu['sn']}")
        
        # Get port number
        match = re.search(r'(\d+/\d+/\d+)', onu['pon_port'])
        port_num = match.group(1) if match else "1/1/1"
        
        # Step 1: ONU Type
        print("\n  STEP 1: Pilih Type ONU")
        print("  " + "-" * 40)
        
        if not self.onu_types:
            self.fetch_onu_types()
        
        max_display = min(len(self.onu_types), 20)  # Show up to 20 types
        for i, t in enumerate(self.onu_types[:max_display], 1):
            print(f"    [{i:2d}] {t}")
        print(f"    [M ] Manual input")
        
        type_choice = input(f"\n  Pilih type [1-{max_display}/M]: ").strip().upper()
        
        if type_choice == 'M':
            onu_type = input("  Masukkan nama type: ").strip()
        else:
            try:
                idx = int(type_choice) - 1
                onu_type = self.onu_types[idx] if 0 <= idx < len(self.onu_types) else self.onu_types[0]
            except:
                if self.onu_types:
                    onu_type = self.onu_types[0]
                else:
                    onu_type = input("  Tidak ada type tersedia. Masukkan nama type manual: ").strip()
        
        # Step 2: ONU ID
        print("\n  STEP 2: ONU ID")
        print("  " + "-" * 40)
        
        next_id = self.get_next_onu_id(port_num)
        onu_id = self.input_int(f"  ONU ID (next available: {next_id})", default=next_id, min_val=1, max_val=128)
        
        # Step 3: Name & Description
        print("\n  STEP 3: Nama & Deskripsi")
        print("  " + "-" * 40)
        
        name = input("  Nama perangkat (tanpa spasi): ").strip()
        if not name:
            name = f"ONU-{port_num.replace('/', '')}:{onu_id}"
        description = input("  Deskripsi (opsional): ").strip()
        
        # Step 4: Service Configuration
        print("\n  STEP 4: Konfigurasi Service (opsional)")
        print("  " + "-" * 40)
        
        print("""
    Pilih tipe service:
      [1] PPPOE          - PPPoE untuk internet dial-up
      [2] BRIDGE         - Bridge mode (transparent)
      [3] STATIC IP      - Static IP untuk ONU
      [4] VLAN Only      - TCONT/Traffic/VLAN saja
      [5] FIBERHOME VEIP - Fiberhome HG6145D2-AC (VEIP mode)
      [6] ZTE Full       - Dual SSID, Dual VLAN, TR069, Firewall
      [7] Huawei Full    - Multi VLAN, WAN DHCP (no OMCI)
      [N] Skip           - Tidak konfigurasi sekarang
        """)
        
        service_choice = input("  Pilih service [1-7/N]: ").strip().upper()
        
        service_type = None
        service_config = {}
        
        if service_choice == '1':
            # PPPOE
            service_type = 'pppoe'
            username = input("    PPPoE Username: ").strip()
            password = input("    PPPoE Password: ").strip()
            if username and password:
                service_config = {'username': username, 'password': password}
        elif service_choice == '2':
            # BRIDGE
            service_type = 'bridge'
        elif service_choice == '3':
            # STATIC IP
            service_type = 'static'
            ip_addr = input("    IP Address: ").strip()
            if ip_addr:
                netmask = self.input_with_default("    Netmask", "255.255.255.0")
                gateway = input("    Gateway: ").strip()
                dns1 = self.input_with_default("    DNS Primary", "8.8.8.8")
                dns2 = self.input_with_default("    DNS Secondary", "8.8.4.4")
                service_config = {
                    'ip': ip_addr, 'netmask': netmask, 
                    'gateway': gateway, 'dns1': dns1, 'dns2': dns2
                }
        elif service_choice == '4':
            # VLAN Only
            service_type = 'vlan'
        elif service_choice == '5':
            # FIBERHOME VEIP
            service_type = 'fiberhome_veip'
            print("\n    --- Konfigurasi Fiberhome VEIP (HG6145D2-AC) ---")
            print("    VLAN 100 = TR069/ACS Management")
            print("    VLAN 30  = Internet/IPTV/WiFi")
            print("    VLAN 151 = VoIP")
            tr069_vlan = self.input_int("    TR069/Management VLAN", default=100, min_val=1, max_val=4094)
            internet_vlan = self.input_int("    Internet/IPTV VLAN", default=30, min_val=1, max_val=4094)
            voip_vlan = self.input_int("    VoIP VLAN", default=151, min_val=1, max_val=4094)
            
            print("\n    --- Konfigurasi ACS/TR069 ---")
            acs_url = input("    ACS URL (default http://192.168.54.254:7547): ").strip()
            if not acs_url:
                acs_url = "http://192.168.54.254:7547"
            acs_user = input("    ACS Username (default acs): ").strip() or "acs"
            acs_pass = input("    ACS Password (default acs): ").strip() or "acs"
            
            # TCONT Profile Selection (Dynamic)
            print("\\n    --- TCONT Profile ---")
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            if self.tcont_profiles:
                print("    Available TCONT Profiles:")
                for i, prof in enumerate(self.tcont_profiles[:10], 1):
                    print(f"      [{i}] {prof}")
                tcont_idx = self.input_int("    Pilih TCONT Profile", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile_fh = self.tcont_profiles[tcont_idx - 1]
            else:
                tcont_profile_fh = input("    TCONT Profile (default UP-PPPOE): ").strip() or "UP-PPPOE"
            
            service_config = {
                'tr069_vlan': tr069_vlan,
                'internet_vlan': internet_vlan,
                'voip_vlan': voip_vlan,
                'acs_url': acs_url,
                'acs_username': acs_user,
                'acs_password': acs_pass,
                'tcont_profile': tcont_profile_fh
            }
        elif service_choice == '6':
            # ZTE Full
            service_type = 'zte_full'
            print("\n    --- Konfigurasi ZTE Full (Dual SSID, Dual VLAN) ---")
            
            # VLAN Settings
            print("\n    -- VLAN Settings --")
            primary_vlan = self.input_int("    Primary/Internet VLAN", default=30, min_val=1, max_val=4094)
            secondary_vlan = self.input_int("    Secondary/Voucher VLAN", default=151, min_val=1, max_val=4094)
            
            # ETH Port VLAN Assignment
            print("\n    -- ETH Port VLAN Assignment --")
            print(f"    Default: ETH 1-2 = VLAN {primary_vlan}, ETH 3-4 = VLAN {secondary_vlan}")
            use_default_eth = input("    Use default? [Y/n]: ").strip().upper() != 'N'
            
            if use_default_eth:
                eth1_vlan = primary_vlan
                eth2_vlan = primary_vlan
                eth3_vlan = secondary_vlan
                eth4_vlan = secondary_vlan
            else:
                eth1_vlan = self.input_int("    ETH 1 VLAN", default=primary_vlan, min_val=1, max_val=4094)
                eth2_vlan = self.input_int("    ETH 2 VLAN", default=primary_vlan, min_val=1, max_val=4094)
                eth3_vlan = self.input_int("    ETH 3 VLAN", default=secondary_vlan, min_val=1, max_val=4094)
                eth4_vlan = self.input_int("    ETH 4 VLAN", default=secondary_vlan, min_val=1, max_val=4094)
            
            # PPPoE Configuration
            print("\n    -- PPPoE Configuration --")
            enable_pppoe = input("    Enable PPPoE? [Y/n]: ").strip().upper() != 'N'
            pppoe_user = ""
            pppoe_pass = ""
            if enable_pppoe:
                pppoe_user = input("    PPPoE Username: ").strip()
                pppoe_pass = input("    PPPoE Password: ").strip() if pppoe_user else ""
            
            # WiFi/SSID Configuration
            print("\n    -- WiFi SSID Configuration --")
            enable_dual_ssid = input("    Enable Dual SSID? [Y/n]: ").strip().upper() != 'N'
            
            # SSID 1 (Internet)
            ssid1_name = input("    SSID 1 Name (Internet) [Internet_SSID]: ").strip() or "Internet_SSID"
            print("    SSID 1 Auth Type:")
            print("      [1] WPA2-PSK (recommended)")
            print("      [2] WPA/WPA2-Mixed (TKIP+AES)")
            print("      [3] WEP")
            print("      [4] Open (no password)")
            ssid1_auth_choice = input("    Pilih [1-4]: ").strip() or "1"
            
            ssid1_auth = "wpa2"
            ssid1_password = ""
            if ssid1_auth_choice == "1":
                ssid1_auth = "wpa2"
                ssid1_password = input("    SSID 1 Password [12345678]: ").strip() or "12345678"
            elif ssid1_auth_choice == "2":
                ssid1_auth = "wpa_mixed"
                ssid1_password = input("    SSID 1 Password [12345678]: ").strip() or "12345678"
            elif ssid1_auth_choice == "3":
                ssid1_auth = "wep"
                ssid1_password = input("    SSID 1 WEP Key: ").strip()
            else:
                ssid1_auth = "open"
            
            # SSID 2 (Voucher/Guest)
            ssid2_name = ""
            ssid2_auth = "open"
            ssid2_password = ""
            if enable_dual_ssid:
                ssid2_name = input("    SSID 2 Name (Voucher) [Voucher_SSID]: ").strip() or "Voucher_SSID"
                print("    SSID 2 Auth Type:")
                print("      [1] WPA2-PSK")
                print("      [2] WPA/WPA2-Mixed (TKIP+AES)")
                print("      [3] WEP")
                print("      [4] Open (no password) - recommended for voucher")
                ssid2_auth_choice = input("    Pilih [1-4]: ").strip() or "4"
                
                if ssid2_auth_choice == "1":
                    ssid2_auth = "wpa2"
                    ssid2_password = input("    SSID 2 Password: ").strip()
                elif ssid2_auth_choice == "2":
                    ssid2_auth = "wpa_mixed"
                    ssid2_password = input("    SSID 2 Password: ").strip()
                elif ssid2_auth_choice == "3":
                    ssid2_auth = "wep"
                    ssid2_password = input("    SSID 2 WEP Key: ").strip()
                else:
                    ssid2_auth = "open"
            
            # TR069 Configuration
            print("\n    -- TR069/ACS Configuration --")
            enable_tr069 = input("    Enable TR069? [Y/n]: ").strip().upper() != 'N'
            acs_url = ""
            acs_user = ""
            acs_pass = ""
            if enable_tr069:
                acs_url = input("    ACS URL [http://192.168.54.254:7547]: ").strip() or "http://192.168.54.254:7547"
                acs_user = input("    ACS Username [admin]: ").strip() or "admin"
                acs_pass = input("    ACS Password [admin]: ").strip() or "admin"
            
            # Firewall Configuration
            print("\n    -- Firewall Configuration --")
            enable_firewall = input("    Enable Firewall? [Y/n]: ").strip().upper() != 'N'
            firewall_level = "low"
            if enable_firewall:
                print("    Firewall Level: [1] Low  [2] Medium  [3] High")
                fw_choice = input("    Pilih [1-3]: ").strip() or "1"
                if fw_choice == "2":
                    firewall_level = "medium"
                elif fw_choice == "3":
                    firewall_level = "high"
            
            # TCONT Profile Selection (Dynamic)
            print("\n    -- TCONT Profile --")
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            if self.tcont_profiles:
                print("    Available TCONT Profiles:")
                for i, prof in enumerate(self.tcont_profiles[:10], 1):
                    print(f"      [{i}] {prof}")
                tcont_idx = self.input_int("    Pilih TCONT Profile", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile_zte = self.tcont_profiles[tcont_idx - 1]
            else:
                tcont_profile_zte = input("    TCONT Profile [UP-PPPOE]: ").strip() or "UP-PPPOE"
            
            service_config = {
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
                'enable_security_mgmt': True,
                'tcont_profile': tcont_profile_zte
            }
        elif service_choice == '7':
            # Huawei Full
            service_type = 'huawei_full'
            print("\n    --- Konfigurasi Huawei Full (Multi VLAN) ---")
            mgmt_vlan = self.input_int("    Management/TR069 VLAN", default=1010, min_val=1, max_val=4094)
            internet_vlan = self.input_int("    Internet VLAN", default=30, min_val=1, max_val=4094)
            voip_vlan = self.input_int("    VoIP VLAN", default=151, min_val=1, max_val=4094)
            
            print("\n    --- WAN Mode ---")
            print("      [1] DHCP (default)")
            print("      [2] Static IP")
            print("      [3] PPPoE")
            wan_choice = input("    Pilih WAN mode [1-3]: ").strip() or "1"
            
            wan_mode = "dhcp"
            wan_config = {}
            
            if wan_choice == "2":
                wan_mode = "static"
                wan_config['ip'] = input("      Static IP: ").strip()
                wan_config['netmask'] = input("      Netmask [255.255.255.0]: ").strip() or "255.255.255.0"
                wan_config['gateway'] = input("      Gateway: ").strip()
            elif wan_choice == "3":
                wan_mode = "pppoe"
                wan_config['username'] = input("      PPPoE Username: ").strip()
                wan_config['password'] = input("      PPPoE Password: ").strip()
            
            print("\n    --- TR069/ACS Configuration ---")
            acs_url = input("    ACS URL [http://genieacs.example.com:7547]: ").strip() or "http://genieacs.example.com:7547"
            
            # TCONT Profile Selection (Dynamic)
            print("\n    --- TCONT Profile ---")
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            if self.tcont_profiles:
                print("    Available TCONT Profiles:")
                for i, prof in enumerate(self.tcont_profiles[:10], 1):
                    print(f"      [{i}] {prof}")
                tcont_idx = self.input_int("    Pilih TCONT Profile", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
                tcont_profile_hw = self.tcont_profiles[tcont_idx - 1]
            else:
                tcont_profile_hw = input("    TCONT Profile [UP-PPPOE]: ").strip() or "UP-PPPOE"
            
            service_config = {
                'mgmt_vlan': mgmt_vlan,
                'internet_vlan': internet_vlan,
                'voip_vlan': voip_vlan,
                'wan_mode': wan_mode,
                'wan_config': wan_config,
                'acs_url': acs_url,
                'tcont_profile': tcont_profile_hw
            }
        
        # If service selected, get profiles
        tcont_profile = ""
        traffic_profile = ""
        vlan_id = 100
        
        if service_type and service_type not in ['fiberhome_veip', 'zte_full', 'huawei_full']:
            # TCONT Profile
            if not self.tcont_profiles:
                self.fetch_tcont_profiles()
            
            print("\n  Pilih TCONT Profile:")
            for i, t in enumerate(self.tcont_profiles[:10], 1):
                print(f"    [{i}] {t}")
            
            tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
            tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-DEFAULT"
            
            # Traffic Profile
            if not self.traffic_profiles:
                self.fetch_traffic_profiles()
            
            print("\n  Pilih Traffic Profile:")
            for i, t in enumerate(self.traffic_profiles[:10], 1):
                print(f"    [{i}] {t}")
            
            traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
            traffic_profile = self.traffic_profiles[traffic_choice - 1] if self.traffic_profiles else "TRAFFIC-DEFAULT"
            
            # VLAN
            vlan_id = self.input_int("  VLAN ID untuk service", default=100, min_val=1, max_val=4094)
        
        # Confirmation
        print("\n  " + "=" * 60)
        print("  KONFIRMASI REGISTRASI:")
        print("  " + "=" * 60)
        print(f"    PON Port    : {onu['pon_port']}")
        print(f"    SN          : {onu['sn']}")
        print(f"    Type        : {onu_type}")
        print(f"    ONU ID      : {onu_id}")
        print(f"    Nama        : {name}")
        print(f"    Deskripsi   : {description or '-'}")
        if service_type:
            print(f"    Service     : {service_type.upper()}")
            if service_type == 'fiberhome_veip':
                print(f"    TR069 VLAN   : {service_config.get('tr069_vlan', 100)}")
                print(f"    Internet VLAN: {service_config.get('internet_vlan', 30)}")
                print(f"    VoIP VLAN    : {service_config.get('voip_vlan', 151)}")
                print(f"    ACS URL      : {service_config.get('acs_url', '-')}")
                print(f"    ACS Username : {service_config.get('acs_username', 'acs')}")
                print(f"    TCONT Profile: {service_config.get('tcont_profile', 'UP-PPPOE')}")
            elif service_type == 'zte_full':
                print(f"    Mgmt VLAN    : {service_config.get('mgmt_vlan', 1010)}")
                print(f"    Internet VLAN: {service_config.get('internet_vlan', 30)}")
                print(f"    VoIP VLAN    : {service_config.get('voip_vlan', 151)}")
                print(f"    Mgmt SSID    : {service_config.get('mgmt_ssid', 'ISP_Mgmt')}")
                print(f"    Internet SSID: {service_config.get('internet_ssid', 'ISP_Internet')}")
                print(f"    ACS URL      : {service_config.get('acs_url', '-')}")
                print(f"    TCONT Profile: {service_config.get('tcont_profile', 'UP-PPPOE')}")
            elif service_type == 'huawei_full':
                print(f"    Mgmt VLAN    : {service_config.get('mgmt_vlan', 1010)}")
                print(f"    Internet VLAN: {service_config.get('internet_vlan', 30)}")
                print(f"    VoIP VLAN    : {service_config.get('voip_vlan', 151)}")
                print(f"    WAN Mode     : {service_config.get('wan_mode', 'dhcp')}")
                print(f"    ACS URL      : {service_config.get('acs_url', '-')}")
                print(f"    TCONT Profile: {service_config.get('tcont_profile', 'UP-PPPOE')}")
            else:
                print(f"    TCONT       : {tcont_profile}")
                print(f"    Traffic     : {traffic_profile}")
                print(f"    VLAN        : {vlan_id}")
                if service_type == 'pppoe' and service_config:
                    print(f"    PPPoE User  : {service_config.get('username', '-')}")
                elif service_type == 'static' and service_config:
                    print(f"    IP Address  : {service_config.get('ip', '-')}")
        print("  " + "=" * 60)
        
        confirm = input("\n  Lanjutkan registrasi? [Y/n]: ").strip().lower()
        
        if confirm != 'n':
            # Register ONU
            print("\n  Registering ONU...")
            success, msg = self.register_onu(
                onu['pon_port'], 
                onu['sn'], 
                onu_id, 
                onu_type,
                name,
                description
            )
            
            if success:
                print(f"  ✓ {msg}")
                
                # Configure service based on type
                onu_full_id = f"{port_num}:{onu_id}"
                
                if service_type == 'pppoe' and service_config:
                    print("\n  Mengkonfigurasi PPPOE...")
                    svc_success, svc_msg = self.config_manager.configure_pppoe(
                        onu_full_id,
                        service_config['username'],
                        service_config['password'],
                        vlan_id,
                        tcont_profile,
                        traffic_profile
                    )
                    print(f"  {'✓' if svc_success else '✗'} PPPOE: {svc_msg}")
                    
                elif service_type == 'bridge':
                    print("\n  Mengkonfigurasi Bridge...")
                    svc_success, svc_msg = self.config_manager.configure_bridge(
                        onu_full_id,
                        vlan_id,
                        tcont_profile,
                        eth_port=1
                    )
                    print(f"  {'✓' if svc_success else '✗'} Bridge: {svc_msg}")
                    
                elif service_type == 'static' and service_config:
                    print("\n  Mengkonfigurasi Static IP...")
                    svc_success, svc_msg = self.config_manager.configure_static_ip(
                        onu_full_id,
                        service_config['ip'],
                        service_config['netmask'],
                        service_config.get('gateway', ''),
                        service_config.get('dns1', '8.8.8.8'),
                        service_config.get('dns2', '8.8.4.4'),
                        vlan_id,
                        tcont_profile
                    )
                    print(f"  {'✓' if svc_success else '✗'} Static IP: {svc_msg}")
                    
                elif service_type == 'vlan':
                    print("\n  Mengkonfigurasi VLAN...")
                    svc_success, svc_msg = self.configure_onu_service(
                        onu_full_id,
                        tcont_profile,
                        traffic_profile,
                        vlan_id
                    )
                    print(f"  {'✓' if svc_success else '✗'} VLAN: {svc_msg}")
                    
                elif service_type == 'fiberhome_veip':
                    print("\n  Mengkonfigurasi Fiberhome VEIP...")
                    svc_success, svc_msg = self.config_manager.configure_fiberhome_veip(
                        onu_full_id,
                        acs_url=service_config.get('acs_url', 'http://192.168.54.254:7547'),
                        acs_username=service_config.get('acs_username', 'acs'),
                        acs_password=service_config.get('acs_password', 'acs'),
                        tr069_vlan=service_config.get('tr069_vlan', 100),
                        internet_vlan=service_config.get('internet_vlan', 30),
                        voip_vlan=service_config.get('voip_vlan', 151),
                        tcont_profile=service_config.get('tcont_profile', 'UP-PPPOE')
                    )
                    print(f"  {'✓' if svc_success else '✗'} Fiberhome VEIP: {svc_msg}")
                    
                elif service_type == 'zte_full':
                    print("\n  Mengkonfigurasi ZTE Full (Dual SSID, Dual VLAN)...")
                    svc_success, svc_msg = self.config_manager.configure_zte_full(
                        onu_full_id,
                        service_config.get('tcont_profile', 'UP-PPPOE'),
                        service_config
                    )
                    print(f"  {'✓' if svc_success else '✗'} ZTE Full: {svc_msg}")
                    
                elif service_type == 'huawei_full':
                    print("\n  Mengkonfigurasi Huawei Full (Multi VLAN)...")
                    svc_success, svc_msg = self.config_manager.configure_huawei_full(
                        onu_full_id,
                        service_config.get('tcont_profile', 'UP-PPPOE'),
                        service_config
                    )
                    print(f"  {'✓' if svc_success else '✗'} Huawei Full: {svc_msg}")
            else:
                print(f"  ✗ Gagal: {msg}")
            
            # Auto-sync data setelah registrasi
            print("\n  " + "=" * 60)
            print("  Sinkronisasi data OLT...")
            time.sleep(2)  # Wait untuk OLT proses registrasi
            self.sync_onu_data()
            print("  " + "=" * 60)
            self.press_enter()
        else:
            print("\n  Registrasi dibatalkan.")
    
    def register_all_onus(self, onus: list):
        """Register semua ONU sekaligus dengan konfigurasi service"""
        self.clear_screen()
        self.print_header("REGISTER SEMUA ONU")
        
        print(f"\n  ╔════════════════════════════════════════════════════════╗")
        print(f"  ║  Akan mendaftarkan {len(onus):>3} ONU secara otomatis            ║")
        print(f"  ╚════════════════════════════════════════════════════════╝")
        
        print("\n  Daftar ONU yang akan didaftarkan:")
        print("  " + "-" * 50)
        for i, onu in enumerate(onus, 1):
            print(f"    {i:>2}. {onu['pon_port']} - {onu['sn']}")
        print("  " + "-" * 50)
        
        # Get default type
        if not self.onu_types:
            self.fetch_onu_types()
        
        max_display = min(len(self.onu_types), 20)
        print("\n  Pilih Type ONU default untuk semua:")
        for i, t in enumerate(self.onu_types[:max_display], 1):
            print(f"    [{i:2d}] {t}")
        
        type_choice = self.input_int("  Pilih type", default=1, min_val=1, max_val=max_display)
        default_type = self.onu_types[type_choice - 1] if type_choice <= len(self.onu_types) else self.onu_types[0]
        
        # Get service configuration
        service_config = self.get_batch_service_config()
        
        # Summary
        print("\n  " + "=" * 60)
        print("  RINGKASAN KONFIGURASI:")
        print("  " + "-" * 60)
        print(f"    ONU Count    : {len(onus)}")
        print(f"    ONU Type     : {default_type}")
        if service_config['service_type']:
            print(f"    Service Type : {service_config['service_type'].upper()}")
            if service_config['service_type'] == 'fiberhome_veip':
                svc = service_config['service_config']
                print(f"    TR069 VLAN   : {svc.get('tr069_vlan', 100)}")
                print(f"    Internet VLAN: {svc.get('internet_vlan', 30)}")
                print(f"    VoIP VLAN    : {svc.get('voip_vlan', 151)}")
                print(f"    ACS URL      : {svc.get('acs_url', '-')}")
            else:
                print(f"    VLAN ID      : {service_config.get('vlan_id', 100)}")
                print(f"    TCONT Profile: {service_config.get('tcont_profile', '-')}")
                print(f"    Traffic Prof : {service_config.get('traffic_profile', '-')}")
                print(f"    Gemport      : {service_config.get('gemport', 1)}")
        else:
            print("    Service Type : SKIP (tanpa konfigurasi)")
        print("  " + "=" * 60)
        
        confirm = input(f"\n  Lanjutkan registrasi? [Y/n]: ").strip().lower()
        
        if confirm == 'n':
            print("  Dibatalkan.")
            return
        
        success_count = 0
        fail_count = 0
        config_success = 0
        config_fail = 0
        results = []
        
        print("\n  Proses registrasi dimulai...")
        print("  " + "-" * 60)
        
        for i, onu in enumerate(onus, 1):
            print(f"\n  [{i}/{len(onus)}] Registering {onu['sn']}...")
            
            match = re.search(r'(\d+/\d+/\d+)', onu['pon_port'])
            port_num = match.group(1) if match else "1/1/1"
            
            next_id = self.get_next_onu_id(port_num)
            name = f"ONU-{port_num.replace('/', '')}:{next_id}"
            
            success, msg = self.register_onu(
                onu['pon_port'],
                onu['sn'],
                next_id,
                default_type,
                name
            )
            
            if success:
                success_count += 1
                onu_full_id = f"{port_num}:{next_id}"
                results.append(f"    ✓ {onu['sn']} -> {onu_full_id}")
                print(f"    ✓ Registered - ID: {onu_full_id}")
                
                # Apply service configuration
                if service_config['service_type']:
                    print(f"      Configuring {service_config['service_type']}...")
                    svc_success, svc_msg = self.apply_batch_service_config(onu_full_id, service_config)
                    if svc_success:
                        config_success += 1
                        print(f"      ✓ Service: {svc_msg}")
                    else:
                        config_fail += 1
                        print(f"      ✗ Service: {svc_msg}")
            else:
                fail_count += 1
                results.append(f"    ✗ {onu['sn']} - {msg}")
                print(f"    ✗ Failed: {msg}")
            
            time.sleep(0.5)  # Small delay between registrations
        
        print("\n  " + "=" * 60)
        print("  HASIL REGISTRASI:")
        print("  " + "=" * 60)
        for r in results:
            print(r)
        print("  " + "-" * 60)
        print(f"  Registrasi : {success_count} BERHASIL, {fail_count} GAGAL")
        if service_config['service_type']:
            print(f"  Konfigurasi: {config_success} BERHASIL, {config_fail} GAGAL")
        print("  " + "=" * 60)
        
        # Auto-sync setelah register semua
        if success_count > 0:
            print("\n  Sinkronisasi data OLT...")
            time.sleep(2)
            self.sync_onu_data()
            print("  " + "=" * 60)
        
        self.press_enter()
    
    def menu_working_onu(self):
        """Menu untuk melihat ONU yang sudah working dengan data lengkap"""
        self.clear_screen()
        self.print_header("ONU SUDAH TERDAFTAR (WORKING)")
        
        # Pilihan mode tampilan
        print("\n  Pilih mode tampilan:")
        print("    [1] Tampilan Ringkas (cepat)")
        print("    [2] Tampilan Lengkap dengan Optical Power (lebih lambat)")
        print("    [A] Semua PON Port (scan 16 port)")
        
        mode = input("\n  Pilih mode [1/2/A]: ").strip().upper()
        
        if mode == 'A':
            self.show_all_working_onus()
            return
        
        pon_port = self.input_with_default("\n  PON Port (contoh: 1/1/1)", "1/1/1")
        
        if mode == '2':
            self.show_working_onus_full(pon_port)
        else:
            self.show_working_onus_simple(pon_port)
    
    def show_working_onus_simple(self, pon_port: str):
        """Tampilan ringkas ONU working"""
        onus = self.fetch_working_onus(pon_port)
        
        if not onus:
            print("\n  Tidak ada ONU working di PON port ini.")
            self.press_enter()
            return
        
        print(f"\n  Ditemukan {len(onus)} ONU working di PON {pon_port}:\n")
        print("  " + "-" * 75)
        print(f"  {'No':>3} | {'ONU ID':<12} | {'Admin':<8} | {'OMCC':<8} | {'Phase':<10} | {'Channel':<10}")
        print("  " + "-" * 75)
        
        for i, onu in enumerate(onus, 1):
            print(f"  {i:>3} | {onu['onu_id']:<12} | {onu['admin_state']:<8} | {onu['omcc_state']:<8} | {onu['phase_state']:<10} | {onu['channel']:<10}")
        
        print("  " + "-" * 75)
        print(f"""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  PILIHAN:                                                     ║
  ║  [1-{len(onus):<3}] Lihat detail ONU                                    ║
  ║  [R]   Refresh / Sync data                                    ║
  ║  [F]   Tampilan lengkap dengan optical power                  ║
  ║  [0]   Kembali                                                ║
  ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        choice = input("  Pilihan: ").strip().upper()
        
        if choice == '0':
            return
        elif choice == 'R':
            self.show_working_onus_simple(pon_port)
            return
        elif choice == 'F':
            self.show_working_onus_full(pon_port)
            return
        else:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(onus):
                    self.show_onu_detail_full(onus[idx]['onu_id'])
            except:
                pass
        
        self.press_enter()
    
    def show_working_onus_full(self, pon_port: str):
        """Tampilan lengkap ONU working dengan optical power dan detail"""
        onus = self.fetch_working_onus_full(pon_port)
        
        if not onus:
            print("\n  Tidak ada ONU working di PON port ini.")
            self.press_enter()
            return
        
        while True:
            self.clear_screen()
            self.print_header(f"ONU WORKING - PON {pon_port} (DETAIL)")
            
            print(f"\n  Ditemukan {len(onus)} ONU working:\n")
            
            # Show Tx Power info
            tx_power = onus[0].get('tx_power', '-') if onus else '-'
            print(f"  OLT Tx Power: {tx_power}\n")
            
            # Header dengan kolom redaman
            print("  " + "=" * 130)
            print(f"  {'No':>3} | {'ONU ID':<10} | {'Name':<12} | {'Type':<10} | {'SN':<14} | {'Rx Power':<12} | {'Redaman':<12} | {'Status':<10}")
            print("  " + "=" * 130)
            
            for i, onu in enumerate(onus, 1):
                name = (onu['name'][:11] + '..') if len(onu['name']) > 12 else onu['name']
                onu_type = (onu['type'][:9] + '..') if len(onu['type']) > 10 else onu['type']
                sn = onu['serial_number'][:14] if onu['serial_number'] else '-'
                rx = onu['rx_power'] if onu['rx_power'] else '-'
                redaman = onu.get('attenuation', '-')
                redaman_status = onu.get('attenuation_status', '-')
                phase = onu['phase_state']
                
                # Color indicator untuk redaman
                if redaman_status == 'Excellent' or redaman_status == 'Good':
                    indicator = '✓'
                elif redaman_status == 'Fair':
                    indicator = '○'
                elif redaman_status == 'Poor':
                    indicator = '△'
                else:
                    indicator = '✗'
                
                redaman_display = f"{redaman} {indicator}"
                
                print(f"  {i:>3} | {onu['onu_id']:<10} | {name:<12} | {onu_type:<10} | {sn:<14} | {rx:<12} | {redaman_display:<12} | {phase:<10}")
            
            print("  " + "=" * 130)
            
            # Legend untuk redaman
            print("\n  KETERANGAN REDAMAN:")
            print("    ✓ Excellent/Good (<20 dB)  |  ○ Fair (20-25 dB)  |  △ Poor (25-28 dB)  |  ✗ Critical (>28 dB)")
            
            # Detail info
            print("\n  DETAIL TAMBAHAN:")
            print("  " + "-" * 100)
            for i, onu in enumerate(onus, 1):
                desc = onu.get('description', '-') or '-'
                dist = onu.get('distance', '-') or '-'
                online = onu.get('online_duration', '-') or '-'
                redaman_status = onu.get('attenuation_status', '-')
                print(f"    {i}. {onu['onu_id']}: Redaman={redaman_status}, Desc={desc}, Distance={dist}, Online={online}")
            print("  " + "-" * 100)
            
            print(f"""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  PILIHAN:                                                     ║
  ║  [1-{len(onus):<3}] Lihat detail lengkap ONU                            ║
  ║  [R]   Refresh / Sync ulang data                              ║
  ║  [0]   Kembali                                                ║
  ╚═══════════════════════════════════════════════════════════════╝
            """)
            
            choice = input("  Pilihan: ").strip().upper()
            
            if choice == '0':
                return
            elif choice == 'R':
                print("\n  Syncing data...")
                onus = self.fetch_working_onus_full(pon_port)
                continue
            else:
                try:
                    idx = int(choice) - 1
                    if 0 <= idx < len(onus):
                        self.show_onu_detail_full(onus[idx]['onu_id'])
                except:
                    pass
    
    def show_all_working_onus(self):
        """Scan dan tampilkan semua ONU working dari semua port"""
        self.clear_screen()
        self.print_header("SCAN SEMUA ONU WORKING (16 PORT)")
        
        print("\n  Scanning semua PON port...")
        
        all_onus = []
        for port in range(1, 17):
            pon_port = f"1/1/{port}"
            print(f"    Scanning PON {pon_port}...")
            
            onus = self.fetch_working_onus(pon_port)
            if onus:
                # Get optical power for this port
                power_data = self.fetch_onu_optical_power(pon_port)
                
                for onu in onus:
                    onu_id = onu['onu_id']
                    onu['rx_power'] = power_data.get(onu_id, '-')
                    onu['pon_port'] = pon_port
                    all_onus.append(onu)
        
        if not all_onus:
            print("\n  Tidak ada ONU working ditemukan di semua port.")
            self.press_enter()
            return
        
        self.clear_screen()
        self.print_header("SEMUA ONU WORKING")
        
        print(f"\n  Total {len(all_onus)} ONU working ditemukan:\n")
        print("  " + "=" * 90)
        print(f"  {'No':>3} | {'ONU ID':<12} | {'PON Port':<10} | {'Status':<10} | {'Rx Power':<15} | {'Admin':<8}")
        print("  " + "=" * 90)
        
        for i, onu in enumerate(all_onus, 1):
            print(f"  {i:>3} | {onu['onu_id']:<12} | {onu.get('pon_port', '-'):<10} | {onu['phase_state']:<10} | {onu.get('rx_power', '-'):<15} | {onu['admin_state']:<8}")
        
        print("  " + "=" * 90)
        print(f"\n  Total: {len(all_onus)} ONU")
        
        self.press_enter()
    
    def show_onu_detail_full(self, onu_id: str):
        """Show detail lengkap ONU dengan redaman dan running config"""
        self.clear_screen()
        self.print_header(f"DETAIL ONU: {onu_id}")
        
        onu_interface = f"gpon-onu_{onu_id}"
        
        # Get detail info
        print("\n  Mengambil data detail...")
        detail = self.fetch_onu_detail(onu_id)
        
        # Get equipment info
        print("  Mengambil data equipment...")
        equip = self.fetch_onu_equipment(onu_id)
        
        # Get MAC address
        print("  Mengambil MAC address...")
        mac_address = self.fetch_onu_mac_address(onu_id)
        
        # Get temperature
        print("  Mengambil data temperature...")
        temperature = self.fetch_onu_temperature(onu_id)
        
        # Get traffic statistics
        print("  Mengambil statistik traffic...")
        traffic_stats = self.fetch_onu_traffic_stats(onu_id)
        
        # Get ETH port status
        print("  Mengambil status ETH ports...")
        eth_ports = self.fetch_onu_port_status(onu_id)
        
        # Get optical power and calculate attenuation
        pon_port = onu_id.rsplit(':', 1)[0]  # Extract "1/1/1" from "1/1/1:1"
        print(f"  Mengambil data optical power PON {pon_port}...")
        
        power_data = self.fetch_onu_optical_power(pon_port)
        rx_power = power_data.get(onu_id, '-')
        
        print(f"  Mengambil Tx power OLT...")
        tx_power = self.fetch_olt_tx_power(pon_port)
        tx_power_str = f"{tx_power:.2f} dBm" if tx_power else '-'
        
        # Calculate attenuation
        attenuation_data = self.calculate_attenuation(tx_power, rx_power)
        
        # Get running config for working ONU
        print(f"  Mengambil running config...")
        running_config = self.fetch_onu_running_config(onu_id)
        
        print("\n  " + "=" * 70)
        print("  INFORMASI ONU")
        print("  " + "=" * 70)
        print(f"    ONU ID          : {onu_id}")
        print(f"    Name            : {detail.get('name', '-')}")
        print(f"    Description     : {detail.get('description', '-')}")
        print(f"    Type            : {detail.get('type', '-')}")
        print(f"    Serial Number   : {detail.get('serial_number', '-')}")
        if mac_address != 'N/A':
            print(f"    MAC Address     : {mac_address}")
        print(f"    Password        : {detail.get('password', '-')}")
        print(f"    State           : {detail.get('state', '-')}")
        print(f"    Phase State     : {detail.get('phase_state', '-')}")
        print(f"    Config State    : {detail.get('config_state', '-')}")
        print(f"    Auth Mode       : {detail.get('auth_mode', '-')}")
        print(f"    Match Fallback  : {detail.get('match_fallback', '-')}")
        print(f"    Distance        : {detail.get('distance', '-')}")
        print(f"    Online Duration : {detail.get('online_duration', '-')}")
        print(f"    Last Down       : {detail.get('last_down_cause', '-')}")
        print(f"    Last Up Time    : {detail.get('last_up_time', '-')}")
        print(f"    Last Down Time  : {detail.get('last_down_time', '-')}")
        
        print("\n  " + "-" * 70)
        print("  OPTICAL POWER & REDAMAN")
        print("  " + "-" * 70)
        print(f"    Tx Power (OLT)  : {tx_power_str}")
        print(f"    Rx Power (ONU)  : {rx_power}")
        if temperature != '-' and temperature != 'N/A':
            print(f"    Temperature     : {temperature}")
        
        # Display attenuation with status
        redaman = attenuation_data.get('attenuation_str', '-')
        redaman_status = attenuation_data.get('status', 'Unknown')
        
        # Add indicator
        if redaman_status == 'Excellent':
            indicator = '[OK] EXCELLENT'
        elif redaman_status == 'Good':
            indicator = '[OK] GOOD'
        elif redaman_status == 'Fair':
            indicator = '[!] FAIR'
        elif redaman_status == 'Poor':
            indicator = '[!] POOR'
        elif redaman_status == 'Critical':
            indicator = '[X] CRITICAL'
        else:
            indicator = '[-] UNKNOWN'
        
        print(f"    Redaman         : {redaman} ({indicator})")
        
        if attenuation_data.get('attenuation'):
            print("\n    Keterangan:")
            print("      < 15 dB  : Excellent (Sinyal sangat baik)")
            print("      15-20 dB : Good (Sinyal baik)")
            print("      20-25 dB : Fair (Sinyal cukup)")
            print("      25-28 dB : Poor (Sinyal buruk, perlu pengecekan)")
            print("      > 28 dB  : Critical (Sinyal sangat buruk, segera perbaiki)")
        
        # Display ETH port status only if available
        if eth_ports:
            print("\n  " + "-" * 70)
            print("  STATUS ETH PORTS")
            print("  " + "-" * 70)
            for port in eth_ports:
                link_status = "[UP]" if 'up' in port['link'].lower() else "[DOWN]"
                print(f"    {port['port']:<10} : {link_status} Admin={port['admin']}, Speed={port['speed']}, Duplex={port.get('duplex', '-')}")
        
        # Display traffic statistics only if available (not all N/A)
        has_traffic_data = any(v != 'N/A' for v in [traffic_stats['rx_bytes'], traffic_stats['tx_bytes'], 
                                                      traffic_stats['rx_packets'], traffic_stats['tx_packets']])
        if has_traffic_data:
            print("\n  " + "-" * 70)
            print("  TRAFFIC STATISTICS")
            print("  " + "-" * 70)
            
            # Helper function to format bytes
            def format_bytes(byte_str):
                try:
                    b = int(byte_str)
                    if b < 1024:
                        return f"{b} B"
                    elif b < 1024**2:
                        return f"{b/1024:.2f} KB"
                    elif b < 1024**3:
                        return f"{b/1024**2:.2f} MB"
                    else:
                        return f"{b/1024**3:.2f} GB"
                except:
                    return byte_str
            
            # Format RX
            rx_bytes_formatted = format_bytes(traffic_stats['rx_bytes'])
            tx_bytes_formatted = format_bytes(traffic_stats['tx_bytes'])
            
            print(f"    RX: {rx_bytes_formatted} ({traffic_stats['rx_packets']} packets, {traffic_stats['rx_errors']} errors)")
            print(f"    TX: {tx_bytes_formatted} ({traffic_stats['tx_packets']} packets, {traffic_stats['tx_errors']} errors)")
        
        print("\n  " + "-" * 70)
        print("  EQUIPMENT INFO")
        print("  " + "-" * 70)
        print(f"    Vendor          : {equip.get('vendor', '-')}")
        print(f"    Model           : {equip.get('model', '-')}")
        print(f"    Equipment ID    : {equip.get('equipment_id', '-')}")
        print(f"    Version         : {equip.get('version', '-')}")
        print(f"    H/W Version     : {equip.get('hw_version', '-')}")
        print(f"    S/W Version     : {equip.get('sw_version', '-')}")
        print(f"    System Uptime   : {equip.get('uptime', '-')}")
        print(f"    Memory Usage    : {equip.get('memory_usage', '-')}")
        print(f"    CPU Usage       : {equip.get('cpu_usage', '-')}")
        
        # Display running config for working ONU
        if running_config and detail.get('state', '').lower() == 'working':
            print("\n  " + "-" * 70)
            print("  RUNNING CONFIGURATION")
            print("  " + "-" * 70)
            
            # Parse and display key config items
            config_items = self.parse_running_config(running_config)
            
            if config_items.get('vlans'):
                print("\n    VLANs Configured:")
                for vlan in config_items['vlans']:
                    print(f"      [!] VLAN {vlan['vlan']} - {vlan['service']} (gemport {vlan['gemport']})")
            
            if config_items.get('pppoe'):
                print("\n    PPPoE:")
                for pppoe in config_items['pppoe']:
                    print(f"      [!] PPPoE {pppoe['id']}: {pppoe['mode']} - user: {pppoe.get('user', '-')}")
            
            if config_items.get('ssids'):
                print("\n    WiFi SSIDs:")
                for ssid in config_items['ssids']:
                    auth_info = f" ({ssid['auth']})" if ssid.get('auth') else ""
                    print(f"      [!] {ssid['interface']}: {ssid['name']}{auth_info}")
            
            if config_items.get('eth_ports'):
                print("\n    ETH Ports:")
                for port in config_items['eth_ports']:
                    print(f"      [!] {port['port']}: {port['mode']} VLAN {port['vlan']}")
            
            if config_items.get('tr069'):
                tr069 = config_items['tr069']
                print(f"\n    TR069/ACS:")
                print(f"      [!] URL: {tr069.get('url', '-')}")
                print(f"      [!] User: {tr069.get('user', '-')}")
                print(f"      [!] Periodic: {tr069.get('periodic', '-')}")
            
            if config_items.get('security'):
                print(f"\n    Security:")
                for sec in config_items['security']:
                    print(f"      [!] {sec}")
        
        print("\n  " + "=" * 70)
        
        self.press_enter()
    
    def fetch_onu_equipment(self, onu_id: str) -> dict:
        """Fetch equipment info untuk ONU"""
        cmd = f"show gpon remote-onu equip gpon-onu_{onu_id}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        equip = {
            'vendor': '',
            'model': '',
            'equipment_id': '',
            'version': '',
            'hw_version': '',
            'sw_version': '',
            'uptime': '',
            'uptime_seconds': 0,
            'memory_usage': '',
            'cpu_usage': ''
        }
        
        if success and output:
            lines = output.replace('\r\n', '\n').split('\n')
            for line in lines:
                line = line.strip()
                if ':' in line:
                    if line.startswith('Vendor ID:'):
                        equip['vendor'] = line.split(':', 1)[1].strip()
                    elif line.startswith('Model:') or line.startswith('Equipment ID:'):
                        key = 'model' if line.startswith('Model:') else 'equipment_id'
                        equip[key] = line.split(':', 1)[1].strip()
                    elif line.startswith('Version:') or 'Software Version' in line:
                        equip['version'] = line.split(':', 1)[1].strip()
                    elif 'Hardware Version' in line or 'H/W Version' in line:
                        equip['hw_version'] = line.split(':', 1)[1].strip()
                    elif 'Software Version' in line or 'S/W Version' in line:
                        equip['sw_version'] = line.split(':', 1)[1].strip()
                    elif line.startswith('System uptime:') or 'Uptime' in line:
                        uptime_raw = line.split(':', 1)[1].strip()
                        equip['uptime'] = uptime_raw
                        
                        # Extract seconds and convert to readable format
                        # Format: "106570.00 s" or "106570s" or "106570"
                        try:
                            import re
                            seconds_match = re.search(r'([\d.]+)', uptime_raw)
                            if seconds_match:
                                seconds = float(seconds_match.group(1))
                                equip['uptime_seconds'] = int(seconds)
                                equip['uptime'] = self._format_uptime(int(seconds))
                        except:
                            pass
                    elif 'Memory' in line and '%' in line:
                        equip['memory_usage'] = line.split(':', 1)[1].strip()
                    elif 'CPU' in line and '%' in line:
                        equip['cpu_usage'] = line.split(':', 1)[1].strip()
        
        return equip
    
    def _format_uptime(self, seconds: int) -> str:
        """Convert seconds to human readable format"""
        if seconds <= 0:
            return '-'
        
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if secs > 0 or not parts:  # Show seconds if no other units
            parts.append(f"{secs}s")
        
        return ' '.join(parts)
    
    def fetch_onu_running_config(self, onu_id: str) -> str:
        """Fetch running configuration dari ONU"""
        onu_interface = f"gpon-onu_{onu_id}"
        cmd = f"show running-config interface {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=15)
        
        if success and output:
            return output
        return ""
    
    def parse_running_config(self, config_output: str) -> dict:
        """Parse running config output menjadi dictionary terstruktur"""
        config_items = {
            'vlans': [],
            'pppoe': [],
            'ssids': [],
            'eth_ports': [],
            'tr069': {},
            'security': []
        }
        
        if not config_output:
            return config_items
        
        lines = config_output.replace('\r\n', '\n').split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Parse VLAN service
            if line.startswith('service ') and 'vlan' in line.lower():
                # service VLAN0030 gemport 1 vlan 30
                parts = line.split()
                if len(parts) >= 5:
                    vlan_info = {
                        'service': parts[1],
                        'gemport': parts[3] if 'gemport' in line else '-',
                        'vlan': parts[-1]
                    }
                    config_items['vlans'].append(vlan_info)
            
            # Parse PPPoE
            elif line.startswith('pppoe '):
                # pppoe 1 nat enable user xxx password yyy
                parts = line.split()
                pppoe_info = {
                    'id': parts[1] if len(parts) > 1 else '1',
                    'mode': ' '.join(parts[2:4]) if len(parts) > 3 else 'nat enable',
                    'user': ''
                }
                if 'user' in line:
                    user_idx = parts.index('user')
                    pppoe_info['user'] = parts[user_idx + 1] if len(parts) > user_idx + 1 else ''
                config_items['pppoe'].append(pppoe_info)
            
            # Parse SSID name
            elif 'ssid ctrl' in line and 'name' in line:
                # ssid ctrl wifi_0/1 name TEST_SSID
                parts = line.split()
                if 'name' in parts:
                    name_idx = parts.index('name')
                    ssid_name = ' '.join(parts[name_idx + 1:])
                    ssid_interface = parts[2] if len(parts) > 2 else ''
                    
                    # Check if already exists
                    existing = None
                    for s in config_items['ssids']:
                        if s['interface'] == ssid_interface:
                            existing = s
                            break
                    
                    if existing:
                        existing['name'] = ssid_name
                    else:
                        config_items['ssids'].append({
                            'interface': ssid_interface,
                            'name': ssid_name,
                            'auth': ''
                        })
            
            # Parse SSID auth
            elif 'ssid auth' in line:
                # ssid auth wpa wifi_0/1 key xxx
                # ssid auth wep wifi_0/2 open-system
                parts = line.split()
                if len(parts) >= 3:
                    auth_type = parts[2]
                    ssid_interface = parts[3] if len(parts) > 3 else ''
                    
                    # Determine auth method
                    auth_method = auth_type
                    if 'wpa-mixed' in line:
                        auth_method = 'WPA/WPA2-Mixed'
                    elif auth_type == 'wpa':
                        auth_method = 'WPA2-PSK'
                    elif auth_type == 'wep':
                        if 'open-system' in line:
                            auth_method = 'Open'
                        else:
                            auth_method = 'WEP'
                    
                    # Check if already exists
                    existing = None
                    for s in config_items['ssids']:
                        if s['interface'] == ssid_interface:
                            existing = s
                            break
                    
                    if existing:
                        existing['auth'] = auth_method
                    else:
                        config_items['ssids'].append({
                            'interface': ssid_interface,
                            'name': '',
                            'auth': auth_method
                        })
            
            # Parse ETH port VLAN
            elif line.startswith('vlan port eth_'):
                # vlan port eth_0/1 mode tag vlan 30
                parts = line.split()
                if len(parts) >= 6:
                    config_items['eth_ports'].append({
                        'port': parts[2],
                        'mode': parts[4],
                        'vlan': parts[6]
                    })
            
            # Parse TR069
            elif 'tr069' in line.lower():
                if 'server url' in line.lower():
                    url = line.split('url', 1)[1].strip() if 'url' in line else ''
                    config_items['tr069']['url'] = url
                elif 'username' in line.lower():
                    parts = line.split()
                    if 'username' in parts:
                        idx = parts.index('username')
                        config_items['tr069']['user'] = parts[idx + 1] if len(parts) > idx + 1 else ''
                elif 'periodic' in line.lower():
                    config_items['tr069']['periodic'] = 'Enabled' if 'enable' in line else 'Disabled'
            
            # Parse Security/Firewall
            elif 'security-mgmt' in line or 'ip-host' in line:
                config_items['security'].append(line)
        
        return config_items
    
    def menu_edit_onu(self):
        """Menu untuk edit nama/deskripsi ONU"""
        self.clear_screen()
        self.print_header("EDIT NAMA / DESKRIPSI ONU")
        
        onu_id = input("\n  Masukkan ONU ID (contoh: 1/1/1:1): ").strip()
        
        if not onu_id:
            return
        
        print(f"\n  Editing ONU {onu_id}")
        print("  " + "-" * 40)
        
        name = input("  Nama baru (kosong = skip): ").strip()
        description = input("  Deskripsi baru (kosong = skip): ").strip()
        
        if name or description:
            success, msg = self.set_onu_name_and_description(onu_id, name, description)
            if success:
                if name:
                    print(f"  ✓ Nama diubah ke: {name}")
                if description:
                    print(f"  ✓ Deskripsi diubah ke: {description}")
            else:
                print(f"  ✗ Gagal: {msg}")
        else:
            print("  Tidak ada perubahan.")
        
        self.press_enter()
    
    def menu_configure_service(self):
        """Menu untuk konfigurasi service ONU (PPPOE, Bridge, Static IP)"""
        self.clear_screen()
        self.print_header("KONFIGURASI SERVICE ONU")
        
        onu_id = input("\n  Masukkan ONU ID (contoh: 1/1/1:1): ").strip()
        
        if not onu_id:
            return
        
        # Show ONU info
        print(f"\n  Mengecek ONU {onu_id}...")
        detail = self.fetch_onu_detail(onu_id)
        
        print(f"\n  ONU Info:")
        print(f"    ID   : {onu_id}")
        print(f"    Name : {detail.get('name', '-')}")
        print(f"    Type : {detail.get('type', '-')}")
        print(f"    SN   : {detail.get('serial_number', '-')}")
        print(f"    State: {detail.get('phase_state', '-')}")
        
        print(f"""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  PILIH TIPE SERVICE:                                          ║
  ╠═══════════════════════════════════════════════════════════════╣
  ║  [1] PPPOE          - PPPoE untuk internet dial-up            ║
  ║  [2] BRIDGE         - Bridge mode (transparent)               ║
  ║  [3] STATIC IP      - Static IP untuk ONU                     ║
  ║  [4] VLAN Only      - Konfigurasi TCONT/Traffic/VLAN saja     ║
  ║  [5] Fiberhome VEIP - HG6145D2-AC (TR069+Internet+VoIP)       ║
  ║  [6] ZTE Full       - Dual SSID, Dual VLAN, TR069, Firewall   ║
  ║  [7] Huawei Full    - Multi VLAN, WAN DHCP (no OMCI)          ║
  ║  [0] Batal                                                    ║
  ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        choice = input("  Pilih service [0-7]: ").strip()
        
        if choice == '1':
            self.configure_service_pppoe(onu_id)
        elif choice == '2':
            self.configure_service_bridge(onu_id)
        elif choice == '3':
            self.configure_service_static_ip(onu_id)
        elif choice == '4':
            self.configure_service_vlan_only(onu_id)
        elif choice == '5':
            self.configure_service_fiberhome_veip(onu_id)
        elif choice == '6':
            self.configure_service_zte_full(onu_id)
        elif choice == '7':
            self.configure_service_huawei_full(onu_id)
        else:
            print("\n  Dibatalkan.")
        
        self.press_enter()
    
    def configure_service_pppoe(self, onu_id: str):
        """Konfigurasi PPPOE untuk ONU"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI PPPOE - ONU {onu_id}")
        
        print("\n  Masukkan konfigurasi PPPOE:")
        
        # PPPOE credentials
        username = input("    Username PPPoE: ").strip()
        if not username:
            print("  ✗ Username tidak boleh kosong!")
            return
        
        password = input("    Password PPPoE: ").strip()
        if not password:
            print("  ✗ Password tidak boleh kosong!")
            return
        
        # Profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        if not self.traffic_profiles:
            self.fetch_traffic_profiles()
        
        print("\n  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-PPPOE"
        
        print("\n  Traffic Profiles:")
        for i, t in enumerate(self.traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
        traffic_profile = self.traffic_profiles[traffic_choice - 1] if self.traffic_profiles else "TRAFFIC-PPPOE"
        
        # VLAN
        vlan_id = self.input_int("  VLAN ID untuk PPPOE", default=100, min_val=1, max_val=4094)
        
        # Confirmation
        print("\n  " + "=" * 60)
        print("  KONFIRMASI KONFIGURASI PPPOE:")
        print("  " + "=" * 60)
        print(f"    ONU ID   : {onu_id}")
        print(f"    Username : {username}")
        print(f"    Password : {'*' * len(password)}")
        print(f"    TCONT    : {tcont_profile}")
        print(f"    Traffic  : {traffic_profile}")
        print(f"    VLAN     : {vlan_id}")
        print("  " + "=" * 60)
        
        confirm = input("\n  Lanjutkan konfigurasi? [Y/n]: ").strip().lower()
        
        if confirm != 'n':
            print("\n  Mengkonfigurasi PPPOE...")
            success, msg = self.config_manager.configure_pppoe(
                onu_id, username, password, vlan_id, 
                tcont_profile, traffic_profile
            )
            
            if success:
                print(f"\n  ✓ PPPOE berhasil dikonfigurasi!")
                print(f"  {msg}")
            else:
                print(f"\n  ✗ Gagal: {msg}")
        else:
            print("\n  Konfigurasi dibatalkan.")
    
    def configure_service_bridge(self, onu_id: str):
        """Konfigurasi Bridge mode untuk ONU"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI BRIDGE - ONU {onu_id}")
        
        print("\n  Bridge Mode - Transparent Bridging")
        print("  ONU akan meneruskan semua traffic tanpa NAT\n")
        
        # Profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        if not self.traffic_profiles:
            self.fetch_traffic_profiles()
        
        print("  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-BRIDGE"
        
        print("\n  Traffic Profiles:")
        for i, t in enumerate(self.traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
        traffic_profile = self.traffic_profiles[traffic_choice - 1] if self.traffic_profiles else "TRAFFIC-BRIDGE"
        
        # VLAN
        vlan_id = self.input_int("  VLAN ID untuk Bridge", default=100, min_val=1, max_val=4094)
        
        # Confirmation
        print("\n  " + "=" * 60)
        print("  KONFIRMASI KONFIGURASI BRIDGE:")
        print("  " + "=" * 60)
        print(f"    ONU ID  : {onu_id}")
        print(f"    Mode    : Bridge (Transparent)")
        print(f"    TCONT   : {tcont_profile}")
        print(f"    Traffic : {traffic_profile}")
        print(f"    VLAN    : {vlan_id}")
        print("  " + "=" * 60)
        
        confirm = input("\n  Lanjutkan konfigurasi? [Y/n]: ").strip().lower()
        
        if confirm != 'n':
            print("\n  Mengkonfigurasi Bridge...")
            success, msg = self.config_manager.configure_bridge(
                onu_id, vlan_id, tcont_profile, eth_port=1
            )
            
            if success:
                print(f"\n  ✓ Bridge berhasil dikonfigurasi!")
                print(f"  {msg}")
            else:
                print(f"\n  ✗ Gagal: {msg}")
        else:
            print("\n  Konfigurasi dibatalkan.")
    
    def configure_service_static_ip(self, onu_id: str):
        """Konfigurasi Static IP untuk ONU"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI STATIC IP - ONU {onu_id}")
        
        print("\n  Masukkan konfigurasi Static IP:")
        
        # IP configuration
        ip_address = input("    IP Address  : ").strip()
        if not ip_address:
            print("  ✗ IP Address tidak boleh kosong!")
            return
        
        netmask = self.input_with_default("    Netmask     ", "255.255.255.0")
        gateway = input("    Gateway     : ").strip()
        dns1 = self.input_with_default("    DNS Primary ", "8.8.8.8")
        dns2 = self.input_with_default("    DNS Secondary", "8.8.4.4")
        
        # Profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        if not self.traffic_profiles:
            self.fetch_traffic_profiles()
        
        print("\n  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-STATIC"
        
        print("\n  Traffic Profiles:")
        for i, t in enumerate(self.traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
        traffic_profile = self.traffic_profiles[traffic_choice - 1] if self.traffic_profiles else "TRAFFIC-STATIC"
        
        # VLAN
        vlan_id = self.input_int("  VLAN ID", default=100, min_val=1, max_val=4094)
        
        # Confirmation
        print("\n  " + "=" * 60)
        print("  KONFIRMASI KONFIGURASI STATIC IP:")
        print("  " + "=" * 60)
        print(f"    ONU ID     : {onu_id}")
        print(f"    IP Address : {ip_address}")
        print(f"    Netmask    : {netmask}")
        print(f"    Gateway    : {gateway}")
        print(f"    DNS 1      : {dns1}")
        print(f"    DNS 2      : {dns2}")
        print(f"    TCONT      : {tcont_profile}")
        print(f"    Traffic    : {traffic_profile}")
        print(f"    VLAN       : {vlan_id}")
        print("  " + "=" * 60)
        
        confirm = input("\n  Lanjutkan konfigurasi? [Y/n]: ").strip().lower()
        
        if confirm != 'n':
            print("\n  Mengkonfigurasi Static IP...")
            success, msg = self.config_manager.configure_static_ip(
                onu_id, ip_address, netmask, gateway,
                dns1, dns2, vlan_id, tcont_profile
            )
            
            if success:
                print(f"\n  ✓ Static IP berhasil dikonfigurasi!")
                print(f"  {msg}")
            else:
                print(f"\n  ✗ Gagal: {msg}")
        else:
            print("\n  Konfigurasi dibatalkan.")
    
    def configure_service_vlan_only(self, onu_id: str):
        """Konfigurasi VLAN/TCONT/Traffic saja"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI VLAN - ONU {onu_id}")
        
        # Fetch profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        if not self.traffic_profiles:
            self.fetch_traffic_profiles()
        
        print(f"\n  Konfigurasi VLAN untuk ONU {onu_id}")
        print("  " + "-" * 40)
        
        # TCONT
        print("\n  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-DEFAULT"
        
        # Traffic
        print("\n  Traffic Profiles:")
        for i, t in enumerate(self.traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic", default=1, min_val=1, max_val=min(10, len(self.traffic_profiles)))
        traffic_profile = self.traffic_profiles[traffic_choice - 1] if self.traffic_profiles else "TRAFFIC-DEFAULT"
        
        # VLAN
        vlan_id = self.input_int("  VLAN ID", default=100, min_val=1, max_val=4094)
        
        # Configure
        print(f"\n  Mengkonfigurasi service...")
        success, msg = self.configure_onu_service(
            onu_id, tcont_profile, traffic_profile, vlan_id
        )
        
        print(f"\n  {'✓' if success else '✗'} {msg}")

    def configure_service_fiberhome_veip(self, onu_id: str):
        """Konfigurasi Fiberhome VEIP (HG6145D2-AC) dengan TR069+Internet+VoIP"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI FIBERHOME VEIP - ONU {onu_id}")
        
        print("""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  FIBERHOME VEIP - HG6145D2-AC                                 ║
  ║  VLAN: TR069(1010) + Internet(30) + VoIP(151)                 ║
  ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        # Fetch profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        
        print("  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-DEFAULT"
        
        # VLAN Configuration
        mgmt_vlan = self.input_int("  Management/TR069 VLAN", default=1010, min_val=1, max_val=4094)
        internet_vlan = self.input_int("  Internet VLAN", default=30, min_val=1, max_val=4094)
        voip_vlan = self.input_int("  VoIP VLAN", default=151, min_val=1, max_val=4094)
        
        # Confirm
        print(f"\n  " + "=" * 50)
        print(f"  KONFIRMASI FIBERHOME VEIP:")
        print(f"  " + "=" * 50)
        print(f"    ONU ID        : {onu_id}")
        print(f"    TCONT         : {tcont_profile}")
        print(f"    Mgmt VLAN     : {mgmt_vlan}")
        print(f"    Internet VLAN : {internet_vlan}")
        print(f"    VoIP VLAN     : {voip_vlan}")
        
        confirm = input("\n  Lanjutkan? [Y/n]: ").strip().upper()
        if confirm == 'N':
            print("\n  Dibatalkan.")
            return
        
        # Configure
        print(f"\n  Mengkonfigurasi Fiberhome VEIP...")
        config = {
            'mgmt_vlan': mgmt_vlan,
            'internet_vlan': internet_vlan,
            'voip_vlan': voip_vlan
        }
        success, msg = self.config_manager.configure_fiberhome_veip(onu_id, tcont_profile, config)
        print(f"\n  {'✓' if success else '✗'} {msg}")

    def configure_service_zte_full(self, onu_id: str):
        """Konfigurasi ZTE Full - Dual SSID, Dual VLAN, TR069, Firewall, PPPoE"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI ZTE FULL - ONU {onu_id}")
        
        print("""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  ZTE FULL MODE - F670L/F680 Series                            ║
  ║  Features: Dual SSID, Dual VLAN, PPPoE, TR069, Firewall       ║
  ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        # Fetch profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        if not self.traffic_profiles:
            self.fetch_traffic_profiles()
        
        print("  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-DEFAULT"
        
        # Traffic Profile (optional)
        print("\n  Traffic Profiles (untuk limit bandwidth):")
        print("    [0] Skip (no limit)")
        for i, t in enumerate(self.traffic_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        traffic_choice = self.input_int("  Pilih Traffic Profile", default=0, min_val=0, max_val=min(10, len(self.traffic_profiles)))
        traffic_profile = self.traffic_profiles[traffic_choice - 1] if traffic_choice > 0 and self.traffic_profiles else ""
        
        # VLAN Configuration
        print("\n  --- VLAN Configuration ---")
        primary_vlan = self.input_int("  Primary/Internet VLAN", default=30, min_val=1, max_val=4094)
        secondary_vlan = self.input_int("  Secondary/Voucher VLAN", default=151, min_val=1, max_val=4094)
        
        # ETH Port VLAN Assignment
        print("\n  --- ETH Port VLAN Assignment ---")
        print(f"    Default: All ETH 1-4 = VLAN {primary_vlan} (sesuai template)")
        custom_eth = input("  Custom ETH VLAN? [y/N]: ").strip().upper()
        
        if custom_eth == 'Y':
            eth1_vlan = self.input_int("  ETH 1 VLAN", default=primary_vlan, min_val=1, max_val=4094)
            eth2_vlan = self.input_int("  ETH 2 VLAN", default=primary_vlan, min_val=1, max_val=4094)
            eth3_vlan = self.input_int("  ETH 3 VLAN", default=primary_vlan, min_val=1, max_val=4094)
            eth4_vlan = self.input_int("  ETH 4 VLAN", default=primary_vlan, min_val=1, max_val=4094)
        else:
            eth1_vlan = primary_vlan
            eth2_vlan = primary_vlan
            eth3_vlan = primary_vlan
            eth4_vlan = primary_vlan
        
        # PPPoE Configuration
        print("\n  --- PPPoE Configuration ---")
        enable_pppoe = input("  Enable PPPoE? [Y/n]: ").strip().upper() != 'N'
        pppoe_user = ""
        pppoe_pass = ""
        if enable_pppoe:
            pppoe_user = input("  PPPoE Username: ").strip()
            pppoe_pass = input("  PPPoE Password: ").strip()
        
        # WiFi/SSID Configuration
        print("\n  --- WiFi/SSID Configuration ---")
        enable_dual_ssid = input("  Enable Dual SSID? [Y/n]: ").strip().upper() != 'N'
        
        # SSID 1 (Internet)
        print("\n  SSID 1 (Internet):")
        ssid1_name = input("  SSID 1 Name [Internet_SSID]: ").strip() or "Internet_SSID"
        print("    Auth Type:")
        print("      [1] WPA2-PSK (recommended)")
        print("      [2] WPA/WPA2-PSK Mixed (TKIP+AES)")
        print("      [3] WEP")
        print("      [4] Open (no password)")
        ssid1_auth_choice = input("  Pilih Auth Type [1-4]: ").strip() or "1"
        
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
            print("\n  SSID 2 (Voucher/Guest):")
            ssid2_name = input("  SSID 2 Name [Voucher_SSID]: ").strip() or "Voucher_SSID"
            print("    Auth Type:")
            print("      [1] WPA2-PSK")
            print("      [2] WPA/WPA2-PSK Mixed (TKIP+AES)")
            print("      [3] WEP")
            print("      [4] Open (no password) - recommended for voucher")
            ssid2_auth_choice = input("  Pilih Auth Type [1-4]: ").strip() or "4"
            
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
        
        # TR069 Configuration
        print("\n  --- TR069/ACS Configuration ---")
        enable_tr069 = input("  Enable TR069? [Y/n]: ").strip().upper() != 'N'
        acs_url = ""
        acs_user = ""
        acs_pass = ""
        tr069_vlan = 100
        if enable_tr069:
            acs_url = input("  ACS URL [http://192.168.54.254:7547]: ").strip() or "http://192.168.54.254:7547"
            acs_user = input("  ACS Username [acs]: ").strip() or "acs"
            acs_pass = input("  ACS Password [acs]: ").strip() or "acs"
            tr069_vlan = self.input_int("  TR069 VLAN", default=100, min_val=1, max_val=4094)
        
        # Firewall Configuration
        print("\n  --- Firewall Configuration ---")
        enable_firewall = input("  Enable Firewall? [Y/n]: ").strip().upper() != 'N'
        firewall_level = "low"
        if enable_firewall:
            print("    Firewall Level:")
            print("      [1] Low (recommended)")
            print("      [2] Medium")
            print("      [3] High")
            fw_choice = input("  Pilih Level [1-3]: ").strip() or "1"
            if fw_choice == "2":
                firewall_level = "medium"
            elif fw_choice == "3":
                firewall_level = "high"
        
        # Confirm
        print(f"\n  " + "=" * 60)
        print(f"  KONFIRMASI ZTE FULL:")
        print(f"  " + "=" * 60)
        print(f"    ONU ID          : {onu_id}")
        print(f"    TCONT           : {tcont_profile}")
        print(f"    Traffic Profile : {traffic_profile if traffic_profile else 'None'}")
        print(f"    Primary VLAN    : {primary_vlan}")
        print(f"    Secondary VLAN  : {secondary_vlan}")
        print(f"    ETH Ports       : {eth1_vlan}, {eth2_vlan}, {eth3_vlan}, {eth4_vlan}")
        if enable_pppoe:
            print(f"    PPPoE User      : {pppoe_user}")
        print(f"    Dual SSID       : {enable_dual_ssid}")
        print(f"    SSID 1          : {ssid1_name} ({ssid1_auth})")
        if enable_dual_ssid:
            print(f"    SSID 2          : {ssid2_name} ({ssid2_auth})")
        if enable_tr069:
            print(f"    TR069 ACS       : {acs_url}")
            print(f"    TR069 VLAN      : {tr069_vlan}")
        print(f"    Firewall        : {firewall_level if enable_firewall else 'Disabled'}")
        
        confirm = input("\n  Lanjutkan? [Y/n]: ").strip().upper()
        if confirm == 'N':
            print("\n  Dibatalkan.")
            return
        
        # Configure
        print(f"\n  Mengkonfigurasi ZTE Full...")
        config = {
            'primary_vlan': primary_vlan,
            'secondary_vlan': secondary_vlan,
            'traffic_profile': traffic_profile,
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
            'tr069_vlan': tr069_vlan,
            'acs_url': acs_url,
            'acs_user': acs_user,
            'acs_pass': acs_pass,
            'enable_firewall': enable_firewall,
            'firewall_level': firewall_level,
            'enable_security_mgmt': True
        }
        success, msg = self.config_manager.configure_zte_full(onu_id, tcont_profile, config)
        print(f"\n  {'✓' if success else '✗'} {msg}")

    def configure_service_huawei_full(self, onu_id: str):
        """Konfigurasi Huawei Full - Multi VLAN, WAN DHCP (no OMCI)"""
        self.clear_screen()
        self.print_header(f"KONFIGURASI HUAWEI FULL - ONU {onu_id}")
        
        print("""
  ╔═══════════════════════════════════════════════════════════════╗
  ║  HUAWEI FULL MODE - HG8245/EG8145 Series                      ║
  ║  Features: Multi VLAN, WAN DHCP (OMCI Limited via ZTE OLT)    ║
  ╚═══════════════════════════════════════════════════════════════╝
        """)
        
        # Fetch profiles
        if not self.tcont_profiles:
            self.fetch_tcont_profiles()
        
        print("  TCONT Profiles:")
        for i, t in enumerate(self.tcont_profiles[:10], 1):
            print(f"    [{i:2d}] {t}")
        tcont_choice = self.input_int("  Pilih TCONT", default=1, min_val=1, max_val=min(10, len(self.tcont_profiles)))
        tcont_profile = self.tcont_profiles[tcont_choice - 1] if self.tcont_profiles else "TCONT-DEFAULT"
        
        # VLAN Configuration
        print("\n  --- VLAN Configuration ---")
        mgmt_vlan = self.input_int("  Management/TR069 VLAN", default=1010, min_val=1, max_val=4094)
        internet_vlan = self.input_int("  Internet VLAN", default=30, min_val=1, max_val=4094)
        voip_vlan = self.input_int("  VoIP VLAN", default=151, min_val=1, max_val=4094)
        
        # WAN Mode
        print("\n  --- WAN Mode ---")
        print("    [1] DHCP (default)")
        print("    [2] Static IP")
        print("    [3] PPPoE")
        wan_choice = input("  Pilih WAN mode [1-3]: ").strip() or "1"
        
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
        
        # TR069 Configuration  
        print("\n  --- TR069/ACS Configuration ---")
        acs_url = input("  ACS URL [http://genieacs.example.com:7547]: ").strip() or "http://genieacs.example.com:7547"
        
        # Confirm
        print(f"\n  " + "=" * 50)
        print(f"  KONFIRMASI HUAWEI FULL:")
        print(f"  " + "=" * 50)
        print(f"    ONU ID        : {onu_id}")
        print(f"    TCONT         : {tcont_profile}")
        print(f"    Mgmt VLAN     : {mgmt_vlan}")
        print(f"    Internet VLAN : {internet_vlan}")
        print(f"    VoIP VLAN     : {voip_vlan}")
        print(f"    WAN Mode      : {wan_mode}")
        print(f"    ACS URL       : {acs_url}")
        
        confirm = input("\n  Lanjutkan? [Y/n]: ").strip().upper()
        if confirm == 'N':
            print("\n  Dibatalkan.")
            return
        
        # Configure
        print(f"\n  Mengkonfigurasi Huawei Full...")
        config = {
            'mgmt_vlan': mgmt_vlan,
            'internet_vlan': internet_vlan,
            'voip_vlan': voip_vlan,
            'wan_mode': wan_mode,
            'wan_config': wan_config,
            'acs_url': acs_url
        }
        success, msg = self.config_manager.configure_huawei_full(onu_id, tcont_profile, config)
        print(f"\n  {'✓' if success else '✗'} {msg}")
    
    def menu_profile_management(self):
        """Menu management profile"""
        while True:
            self.clear_screen()
            self.print_header("MANAGEMENT PROFILE")
            
            print("""
    [1] Lihat TCONT Profiles
    [2] Lihat Traffic Profiles
    [3] Lihat VLANs
    [4] Tambah VLAN Baru
    [0] Kembali
            """)
            
            choice = input("  Pilih [0-4]: ").strip()
            
            if choice == '1':
                success, output = self.client.execute_command(
                    "show running-config | include profile tcont", timeout=10
                )
                print("\n  TCONT Profiles:")
                print("  " + "-" * 40)
                print(output)
                self.press_enter()
            elif choice == '2':
                success, output = self.client.execute_command(
                    "show running-config | include profile traffic", timeout=10
                )
                print("\n  Traffic Profiles:")
                print("  " + "-" * 40)
                print(output)
                self.press_enter()
            elif choice == '3':
                success, output = self.client.execute_command("show vlan summary", timeout=10)
                print("\n  VLANs:")
                print("  " + "-" * 40)
                print(output)
                self.press_enter()
            elif choice == '4':
                vlan_id = self.input_int("  VLAN ID baru", min_val=1, max_val=4094)
                name = self.input_with_default("  Nama VLAN", f"VLAN{vlan_id}")
                
                self.client.execute_command("end")
                self.client.execute_command("configure terminal", timeout=3)
                self.client.execute_command(f"vlan {vlan_id}", timeout=3)
                self.client.execute_command(f"name {name}", timeout=3)
                self.client.execute_command("exit")
                self.client.execute_command("end")
                
                print(f"\n  ✓ VLAN {vlan_id} ({name}) dibuat")
                self.press_enter()
            elif choice == '0':
                break
    
    def save_configuration(self):
        """Simpan konfigurasi"""
        print("\n  Menyimpan konfigurasi...")
        
        self.client.execute_command("end")
        success, output = self.client.execute_command("write", timeout=30)
        
        if "%" not in output.lower():
            print("  ✓ Konfigurasi tersimpan!")
        else:
            print(f"  ✗ Gagal menyimpan: {output}")
        
        self.press_enter()


def main():
    """Main function"""
    load_dotenv()
    config = OLTConfig.from_env()
    
    valid, msg = config.validate()
    if not valid:
        print(f"Error: {msg}")
        sys.exit(1)
    
    print("=" * 60)
    print("  ONU REGISTRATION WIZARD - ZTE C320")
    print("=" * 60)
    print(f"\n  Connecting to OLT {config.host}:{config.port}...")
    
    client = TelnetClient(config)
    
    if not client.connect():
        print("  GAGAL terhubung ke OLT!")
        sys.exit(1)
    
    print("  ✓ Terhubung ke OLT!")
    
    try:
        wizard = ONURegistrationWizard(client)
        wizard.main_menu()
    finally:
        client.disconnect()
        print("\n  Disconnected dari OLT.")


if __name__ == "__main__":
    main()
