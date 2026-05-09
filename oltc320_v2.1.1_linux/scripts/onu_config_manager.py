"""
ONU Configuration Manager
Script untuk mengelola konfigurasi ONU pada OLT ZTE C320:
- PPPOE Configuration
- Bridge Configuration  
- Static IP Configuration
- LAN/WLAN Binding (OMCI)
- Remote Management
- TR-069 / ACS Configuration
"""
import sys
import os
import argparse
import time

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from core.telnet_client import TelnetClient
from config.olt_config import OLTConfig


class ONUConfigManager:
    """Manager untuk konfigurasi ONU pada OLT ZTE C320"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
    
    def _parse_onu_interface(self, onu_id: str) -> str:
        """
        Parse ONU ID ke format interface
        Input: 1/1/1:1 atau gpon-onu_1/1/1:1
        Output: gpon-onu_1/1/1:1
        """
        if onu_id.startswith("gpon-onu_"):
            return onu_id
        # Check if format is like 1/1/1:1 (slot/port/port:onu)
        if "/" in onu_id and ":" in onu_id:
            return f"gpon-onu_{onu_id}"
        # If just a number, assume default PON port
        return f"gpon-onu_1/1/1:{onu_id}"
    
    def _enter_onu_config(self, onu_interface: str) -> tuple:
        """Enter ONU interface configuration mode"""
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter ONU interface: {output}"
        return True, "OK"
    
    def _enter_onu_mng(self, onu_interface: str) -> tuple:
        """Enter pon-onu-mng mode for ONU management via OMCI"""
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter pon-onu-mng: {output}"
        return True, "OK"
    
    # ==================== ONU STATUS ====================
    
    def show_onu_status(self, pon_port: str = "1/1/1") -> str:
        """Show status semua ONU pada PON port"""
        # Normalize port format - remove leading 1/ if present
        if pon_port.startswith("1/"):
            port_normalized = pon_port
        else:
            port_normalized = pon_port
        cmd = f"show gpon onu state gpon-olt_{port_normalized}"
        success, output = self.client.execute_command(cmd, timeout=10)
        return output if success else f"Error: {output}"
    
    def show_onu_detail(self, onu_id: str) -> str:
        """Show detail ONU tertentu"""
        onu_interface = self._parse_onu_interface(onu_id)
        cmd = f"show gpon onu detail-info {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        return output if success else f"Error: {output}"
    
    def show_onu_running_config(self, onu_id: str) -> str:
        """Show running config ONU lengkap (interface + pon-onu-mng)"""
        onu_interface = self._parse_onu_interface(onu_id)
        
        results = []
        results.append("="*80)
        results.append(f"RUNNING CONFIG: {onu_interface}")
        results.append("="*80)
        
        # Get interface gpon-onu config
        cmd = f"show running-config interface {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        if success and output:
            results.append("\n--- Interface Configuration ---")
            results.append(output)
        
        # Get pon-onu-mng config (OMCI config: VLAN, SSID, PPPoE, etc)
        # Method 1 (PRIMARY): Parse full running-config for pon-onu-mng section
        # This is the most reliable method to get complete config including SSID
        cmd = "show running-config"
        success2, full_config = self.client.execute_command(cmd, timeout=20)
        mng_output = None
        
        if success2 and full_config:
            # Parse pon-onu-mng section for this ONU
            lines = full_config.split('\n')
            capture = False
            mng_lines = []
            target_section = f"pon-onu-mng {onu_interface}"
            
            for line in lines:
                if target_section in line:
                    capture = True
                    mng_lines.append(line)
                elif capture:
                    # Check if we reached end of pon-onu-mng section
                    stripped = line.strip()
                    
                    # End of section: exclamation mark or new non-indented config line
                    if stripped == '!':
                        mng_lines.append(line)
                        break
                    elif stripped == '' or stripped.startswith('#'):
                        # Empty line or comment, continue
                        mng_lines.append(line)
                    elif line and not line[0].isspace():
                        # Non-indented line = new section started
                        break
                    else:
                        # Still within pon-onu-mng section (indented line)
                        mng_lines.append(line)
            
            if mng_lines:
                mng_output = '\n'.join(mng_lines)
                success2 = True
        
        # Method 2 (FALLBACK): Try show this command if full config failed
        if not success2 or not mng_output:
            self.client.execute_command("configure terminal", timeout=3)
            cmd = f"show this pon-onu-mng {onu_interface}"
            success2, mng_output = self.client.execute_command(cmd, timeout=15)
            self.client.execute_command("end", timeout=2)
        
        # Display PON-ONU-MNG config if available
        if success2 and mng_output and mng_output.strip() and "%" not in str(mng_output):
            results.append("\n--- PON-ONU-MNG Configuration (OMCI) ---")
            results.append(str(mng_output))
            
            # Note: SSID configuration (ssid auth/ctrl) is stored in ONU's OMCI database
            # and is not visible in OLT's running-config. SSID settings are applied
            # directly to the ONU via OMCI commands and persist in the ONU itself.
            results.append("\n--- NOTE ---")
            results.append("SSID configuration is stored in ONU OMCI database (not in OLT running-config)")
            results.append("To verify SSID: Check WiFi broadcast or use ONU web interface if available")
        else:
            # Method 3 (LAST RESORT): Show detail info
            cmd = f"show gpon onu detail-info {onu_interface}"
            success, detail_output = self.client.execute_command(cmd, timeout=10)
            if success and detail_output:
                results.append("\n--- ONU Detail Info (OMCI Status) ---")
                results.append(detail_output)
        
        results.append("\n" + "="*80)
        
        return "\n".join(results)
    
    def show_onu_optical(self, onu_id: str) -> str:
        """Show optical info ONU (Rx/Tx power)"""
        onu_interface = self._parse_onu_interface(onu_id)
        results = []
        
        # Get Rx power from OLT side
        cmd = f"show pon power onu-rx {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        results.append("=== OLT RX Power ===\n" + output)
        
        # Get optical info from ONU side via remote-onu
        cmd = f"show gpon remote-onu interface pon {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        results.append("\n=== ONU Optical Detail ===\n" + output)
        
        return "\n".join(results)
    
    def show_onu_vlan_omci(self, onu_id: str) -> str:
        """Show VLAN OMCI configuration dari ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        results = []
        results.append("="*80)
        results.append(f"VLAN OMCI Configuration: {onu_interface}")
        results.append("="*80)
        
        # Method 1: show gpon remote-onu vlan
        cmd = f"show gpon remote-onu vlan {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        if success and output and "%" not in str(output):
            results.append("\n--- Remote ONU VLAN Status ---")
            results.append(output)
        
        # Method 2: Get VLAN from pon-onu-mng config
        cmd = "show running-config"
        success2, full_config = self.client.execute_command(cmd, timeout=20)
        if success2 and full_config:
            lines = full_config.split('\n')
            capture = False
            vlan_lines = []
            target_section = f"pon-onu-mng {onu_interface}"
            
            for line in lines:
                if target_section in line:
                    capture = True
                elif capture:
                    stripped = line.strip()
                    if stripped == '!':
                        break
                    elif line and not line[0].isspace():
                        break
                    elif 'vlan' in line.lower():
                        vlan_lines.append(line.strip())
            
            if vlan_lines:
                results.append("\n--- VLAN Configuration (OMCI) ---")
                for vline in vlan_lines:
                    results.append(vline)
        
        results.append("\n" + "="*80)
        return "\n".join(results)
    
    def show_service_port(self, onu_id: str) -> tuple:
        """Show service-port configuration untuk ONU tertentu"""
        onu_interface = self._parse_onu_interface(onu_id)
        
        # Command untuk show service port - ada beberapa format:
        # 1. show service-port interface gpon-onu_1/1/1:1
        # 2. show running-config interface gpon-onu_1/1/1:1 (untuk lihat config lengkap)
        
        # Gunakan running-config untuk melihat konfigurasi service
        cmd = f"show running-config interface {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=10)
        
        if not success:
            # Coba alternatif command
            cmd = f"show service-port interface {onu_interface}"
            success, output = self.client.execute_command(cmd, timeout=10)
        
        if not success:
            return False, {'output': output, 'services': []}
        
        # Parse output untuk mendapatkan service port list
        services = []
        lines = output.replace('\r\n', '\n').split('\n')
        for line in lines:
            line = line.strip()
            # Cari line dengan "service-port"
            if 'service-port' in line.lower():
                # Extract service port info
                parts = line.split()
                for i, part in enumerate(parts):
                    if part == 'service-port' and i + 1 < len(parts):
                        svc_id = parts[i + 1]
                        services.append({
                            'index': svc_id,
                            'raw': line
                        })
                        break
            # Juga cek untuk tcont, gemport, service-port config
            if line.startswith('tcont') or line.startswith('gemport') or 'vport' in line:
                services.append({
                    'index': 'config',
                    'raw': line
                })
        
        return True, {'output': output, 'services': services}
    
    def delete_service_port(self, service_index: int) -> tuple:
        """Delete service-port berdasarkan index"""
        print(f"Deleting service-port index {service_index}")
        
        # Masuk ke config mode
        self.client.execute_command("configure terminal")
        
        cmd = f"undo service-port {service_index}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if success or "success" in output.lower():
            return True, f"Service-port {service_index} berhasil dihapus"
        else:
            return False, f"Gagal hapus service-port: {output}"
    
    # ==================== ONU BASIC CONFIG ====================
    
    def set_onu_name(self, onu_id: str, name: str) -> tuple:
        """Set ONU name/description"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Setting name for {onu_interface}: {name}")
        
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        success, output = self.client.execute_command(f"name {name}", timeout=3)
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        return True, f"ONU name set to '{name}'"
    
    def set_onu_tcont(self, onu_id: str, tcont_id: int, profile: str) -> tuple:
        """Set TCONT profile untuk ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Setting TCONT {tcont_id} profile {profile} for {onu_interface}")
        
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        success, output = self.client.execute_command(f"tcont {tcont_id} profile {profile}", timeout=3)
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        return True, f"TCONT {tcont_id} set to profile '{profile}'"
    
    def set_onu_gemport(self, onu_id: str, gemport_id: int, tcont_id: int, 
                        traffic_limit: str = None) -> tuple:
        """Set GEM port untuk ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Setting GEM port {gemport_id} for {onu_interface}")
        
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        self.client.execute_command(f"gemport {gemport_id} tcont {tcont_id}", timeout=3)
        
        if traffic_limit:
            self.client.execute_command(
                f"gemport {gemport_id} traffic-limit downstream {traffic_limit}", 
                timeout=3
            )
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"GEM port {gemport_id} configured"
    
    def set_onu_service_port(self, onu_id: str, service_port: int, vport: int,
                              user_vlan: int, vlan: int) -> tuple:
        """Set service port untuk ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Setting service-port {service_port} for {onu_interface}")
        
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        cmd = f"service-port {service_port} vport {vport} user-vlan {user_vlan} vlan {vlan}"
        success, output = self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        return True, f"Service port {service_port} configured"
    
    # ==================== EXISTING CONFIG PARSER ====================
    
    def get_onu_existing_config(self, onu_id: str) -> dict:
        """
        Parse existing ONU configuration from OLT
        
        Returns:
            {
                'mode': 'pppoe' | 'bridge' | 'static' | 'unknown',
                'interface_config': {
                    'tcont_profile': 'UP-PPPOE',
                    'traffic_profile': 'DOWN-100M',
                    'service_port': {'vport': 1, 'user_vlan': 30, 'vlan': 30},
                    'gemport': [1]
                },
                'omci_config': {
                    'service_name': 'VLAN0030',
                    'vlan': 30,
                    'pppoe': {'username': 'customer@pppoe', 'password': '********', 'nat': 'enable'},
                    'iphost': {'ip': '192.168.1.100', 'netmask': '255.255.255.0', 'gateway': '192.168.1.1'},
                    'eth_port': 1
                },
                'raw_interface': '...',
                'raw_mng': '...'
            }
        """
        onu_interface = self._parse_onu_interface(onu_id)
        result = {
            'mode': 'unknown',
            'interface_config': {},
            'omci_config': {},
            'raw_interface': '',
            'raw_mng': ''
        }
        
        # Parse interface gpon-onu config
        success, output = self.client.execute_command(
            f"show running-config interface {onu_interface}", timeout=10
        )
        
        if success and output:
            result['raw_interface'] = output
            result['interface_config'] = self._parse_interface_config(output)
        
        # Parse pon-onu-mng config
        success, full_config = self.client.execute_command(
            "show running-config", timeout=20
        )
        
        if success and full_config:
            mng_section = self._extract_mng_section(full_config, onu_interface)
            result['raw_mng'] = mng_section
            result['omci_config'] = self._parse_mng_config(mng_section)
            
            # Detect mode based on config
            if result['omci_config'].get('pppoe'):
                result['mode'] = 'pppoe'
            elif result['omci_config'].get('iphost', {}).get('ip'):
                result['mode'] = 'static'
            elif result['omci_config'].get('vlan'):
                result['mode'] = 'bridge'
        
        return result
    
    def _extract_mng_section(self, full_config: str, onu_interface: str) -> str:
        """Extract pon-onu-mng section for specific ONU from full config"""
        lines = full_config.split('\n')
        capture = False
        mng_lines = []
        target_section = f"pon-onu-mng {onu_interface}"
        
        for line in lines:
            if target_section in line:
                capture = True
                mng_lines.append(line)
            elif capture:
                stripped = line.strip()
                
                # End of section: exclamation mark or new non-indented config line
                if stripped == '!':
                    mng_lines.append(line)
                    break
                elif stripped == '' or stripped.startswith('#'):
                    mng_lines.append(line)
                elif line and not line[0].isspace():
                    # Non-indented line = new section started
                    break
                else:
                    # Still within pon-onu-mng section (indented line)
                    mng_lines.append(line)
        
        return '\n'.join(mng_lines)
    
    def _parse_interface_config(self, config_text: str) -> dict:
        """Parse interface gpon-onu config block"""
        import re
        result = {}
        lines = config_text.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Parse: tcont 1 name VLAN0030 profile UP-PPPOE
            if line.startswith('tcont'):
                parts = line.split()
                if 'profile' in parts:
                    idx = parts.index('profile')
                    if idx + 1 < len(parts):
                        result['tcont_profile'] = parts[idx + 1]
            
            # Parse: gemport 1 traffic-limit downstream DOWN-100M
            elif 'traffic-limit downstream' in line:
                parts = line.split()
                if len(parts) > 0:
                    result['traffic_profile'] = parts[-1]
            
            # Parse: service-port 1 vport 1 user-vlan 30 vlan 30
            elif line.startswith('service-port'):
                parts = line.split()
                sp = {}
                try:
                    if 'vport' in parts:
                        sp['vport'] = int(parts[parts.index('vport') + 1])
                    if 'user-vlan' in parts:
                        sp['user_vlan'] = int(parts[parts.index('user-vlan') + 1])
                    # Get last VLAN value (the actual service VLAN)
                    vlan_indices = [i for i, x in enumerate(parts) if x == 'vlan']
                    if vlan_indices:
                        last_vlan_idx = vlan_indices[-1]
                        if last_vlan_idx + 1 < len(parts):
                            sp['vlan'] = int(parts[last_vlan_idx + 1])
                    result['service_port'] = sp
                except (ValueError, IndexError):
                    pass
        
        return result
    
    def _parse_mng_config(self, config_text: str) -> dict:
        """Parse pon-onu-mng config block"""
        import re
        result = {}
        lines = config_text.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Parse: service VLAN0030 gemport 1 iphost 1 vlan 30
            if line.startswith('service '):
                parts = line.split()
                if len(parts) > 1:
                    result['service_name'] = parts[1]
                if 'vlan' in parts:
                    try:
                        result['vlan'] = int(parts[-1])
                    except ValueError:
                        pass
            
            # Parse: pppoe 1 nat enable user customer001@pppoe password abc123
            elif line.startswith('pppoe '):
                parts = line.split()
                pppoe = {}
                try:
                    if 'user' in parts:
                        idx = parts.index('user')
                        if idx + 1 < len(parts):
                            pppoe['username'] = parts[idx + 1]
                    if 'password' in parts:
                        idx = parts.index('password')
                        if idx + 1 < len(parts):
                            pppoe['password'] = '********'  # Mask password for security
                    if 'nat' in parts:
                        idx = parts.index('nat')
                        if idx + 1 < len(parts):
                            pppoe['nat'] = parts[idx + 1]
                    result['pppoe'] = pppoe
                except (ValueError, IndexError):
                    pass
            
            # Parse: iphost 1 ip 192.168.1.100 mask 255.255.255.0 gateway 192.168.1.1
            elif line.startswith('iphost '):
                parts = line.split()
                iphost = {}
                try:
                    if 'ip' in parts:
                        idx = parts.index('ip')
                        if idx + 1 < len(parts):
                            iphost['ip'] = parts[idx + 1]
                    if 'mask' in parts:
                        idx = parts.index('mask')
                        if idx + 1 < len(parts):
                            iphost['netmask'] = parts[idx + 1]
                    if 'gateway' in parts:
                        idx = parts.index('gateway')
                        if idx + 1 < len(parts):
                            iphost['gateway'] = parts[idx + 1]
                    if iphost:  # Only add if we found at least one field
                        result['iphost'] = iphost
                except (ValueError, IndexError):
                    pass
            
            # Parse: port eth_0/1 vlan 100 (Bridge mode - ETH port binding)
            elif 'port eth_' in line and 'vlan' in line:
                parts = line.split()
                try:
                    # Extract port number: eth_0/1 -> 1
                    for part in parts:
                        if 'eth_' in part:
                            port_match = re.search(r'eth_\d+/(\d+)', part)
                            if port_match:
                                result['eth_port'] = int(port_match.group(1))
                                break
                except (ValueError, IndexError):
                    pass
        
        return result
    
    # ==================== PPPOE CONFIGURATION ====================
    
    def _backup_onu_name_description(self, onu_id: str) -> dict:
        """Backup name dan description ONU sebelum modify config"""
        onu_interface = self._parse_onu_interface(onu_id)
        success, output = self.client.execute_command(f"show running-config interface {onu_interface}", timeout=5)
        
        backup = {'name': None, 'description': None}
        if success:
            for line in output.split('\n'):
                line = line.strip()
                if line.startswith('name '):
                    backup['name'] = line.replace('name ', '', 1).strip()
                elif line.startswith('description '):
                    backup['description'] = line.replace('description ', '', 1).strip()
        
        return backup
    
    def _restore_onu_name_description(self, onu_id: str, backup: dict):
        """Restore name dan description ONU setelah modify config"""
        if not backup.get('name') and not backup.get('description'):
            return  # Tidak ada yang perlu di-restore
        
        onu_interface = self._parse_onu_interface(onu_id)
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command(f"interface {onu_interface}", timeout=3)
        
        if backup.get('name'):
            self.client.execute_command(f"name {backup['name']}", timeout=3)
            print(f"  ✓ Restored name: {backup['name']}")
        
        if backup.get('description'):
            self.client.execute_command(f"description {backup['description']}", timeout=3)
            print(f"  ✓ Restored description: {backup['description']}")        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
    
    def configure_pppoe(self, onu_id: str, username: str, password: str,
                        vlan: int = 100, tcont_profile: str = None,
                        traffic_profile: str = None) -> tuple:
        """
        Configure PPPOE untuk ONU (Full configuration via OMCI)
        
        Reference command format (ZTE C320):
        interface gpon-onu_1/1/1:1
          tcont 1 name VLAN{vlan} profile {tcont_profile}
          gemport 1 tcont 1
          gemport 1 traffic-limit downstream {traffic_profile}
          service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
        pon-onu-mng gpon-onu_1/1/1:1
          service VLAN{vlan} gemport 1 iphost 1 vlan {vlan}
          pppoe 1 nat enable user {username} password {password}
          wan 1 service internet host 1
        
        Args:
            onu_id: ONU ID (e.g., "1/1/1:1" atau "1")
            username: PPPOE username
            password: PPPOE password
            vlan: Service VLAN
            tcont_profile: Upstream bandwidth profile
            traffic_profile: Downstream bandwidth profile
        """
        onu_interface = self._parse_onu_interface(onu_id)
        service_name = f"VLAN{vlan:04d}"  # e.g., VLAN0030
        
        print(f"\n{'='*60}")
        print(f"Configuring PPPOE for {onu_interface}")
        print(f"{'='*60}")
        print(f"  PPPOE Username: {username}")
        print(f"  PPPOE Password: {password}")
        print(f"  VLAN: {vlan}")
        print(f"  Service Name: {service_name}")
        print(f"  (Name dan Description ONU akan dipertahankan)")
        
        # Backup name dan description sebelum config
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        if backup.get('name'):
            print(f"      Backed up - Name: {backup['name']}")
        
        # Fetch available profile if not specified
        if not tcont_profile:
            tcont_profile = self._get_first_tcont_profile()
        if not traffic_profile:
            traffic_profile = self._get_first_traffic_profile()
        
        print(f"  TCONT Profile (UP): {tcont_profile}")
        print(f"  Traffic Profile (DOWN): {traffic_profile}")
        
        # ============================================================
        # STEP 1: Configure interface gpon-onu_x/x/x:x
        # ============================================================
        self.client.execute_command("end", timeout=2)
        success, output = self.client.execute_command("configure terminal", timeout=3)
        print(f"  [1] Masuk configure terminal...")
        
        # Masuk ke interface gpon-onu
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            print(f"  ERROR: Gagal masuk interface {onu_interface}")
            self.client.execute_command("end", timeout=2)
            return False, f"Gagal masuk interface: {output}"
        print(f"  [2] Masuk interface {onu_interface}...")
        
        # Configure TCONT: tcont 1 name VLAN0030 profile UP-PPPOE
        cmd = f"tcont 1 name {service_name} profile {tcont_profile}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [3] Set TCONT: {cmd}")
        if "%" in output:
            # Coba format alternatif tanpa name
            cmd = f"tcont 1 profile {tcont_profile}"
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"      Retry: {cmd}")
        
        # Configure GEM port: gemport 1 tcont 1
        cmd = "gemport 1 tcont 1"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [4] Set Gemport: {cmd}")
        
        # Configure downstream traffic limit: gemport 1 traffic-limit downstream DOWN-PPPOE
        cmd = f"gemport 1 traffic-limit downstream {traffic_profile}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [5] Set Traffic Limit: {cmd}")
        
        # Configure service port: service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
        cmd = f"service-port 1 vport 1 user-vlan {vlan} vlan {vlan}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [6] Set Service-port: {cmd}")
        
        # Exit dari interface
        self.client.execute_command("exit", timeout=2)
        
        # ============================================================
        # STEP 2: Configure pon-onu-mng gpon-onu_x/x/x:x
        # ============================================================
        cmd = f"pon-onu-mng {onu_interface}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [7] Masuk pon-onu-mng...")
        
        if "%" in output and "error" in output.lower():
            print(f"      Warning: pon-onu-mng tidak tersedia, skip OMCI config")
            self.client.execute_command("end", timeout=2)
            return True, f"Basic config done for {onu_interface}, OMCI management not available"
        
        # Configure service: service VLAN0030 gemport 1 iphost 1 vlan 30
        cmd = f"service {service_name} gemport 1 iphost 1 vlan {vlan}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [8] Set Service: {cmd}")
        if "%" in output:
            # Format alternatif tanpa iphost
            cmd = f"service {service_name} gemport 1 vlan {vlan}"
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"      Retry: {cmd}")
        
        # Configure PPPOE: pppoe 1 nat enable user {username} password {password}
        cmd = f"pppoe 1 nat enable user {username} password {password}"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [9] Set PPPOE: pppoe 1 nat enable user {username} password ***")
        if "%" in output:
            print(f"      Warning: {output.strip()}")
        
        # Configure firewall (optional - standard setting)
        cmd = "firewall enable level low anti-hack disable"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [10] Set Firewall: {cmd}")
        
        # Configure WAN binding: wan 1 service internet host 1
        cmd = "wan 1 service internet host 1"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [11] Set WAN: {cmd}")
        if "%" in output:
            print(f"      Warning: {output.strip()}")
        
        # Exit dan end
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description jika berubah
        print("  [12] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        # Optional: Write config
        # self.client.execute_command("write", timeout=5)
        
        print(f"{'='*60}")
        print(f"PPPOE Configuration Complete!")
        print(f"{'='*60}")
        
        return True, f"PPPOE configured successfully for {onu_interface}\n  Username: {username}, VLAN: {vlan}"
    
    def _get_first_tcont_profile(self) -> str:
        """Get first available TCONT profile from OLT"""
        # Use proper command to fetch TCONT profiles
        success, output = self.client.execute_command("show gpon profile tcont", timeout=10)
        
        if success and output:
            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                # Format: "Profile name :UP-PPPOE"
                if line.startswith('Profile name'):
                    parts = line.split(':')
                    if len(parts) >= 2:
                        profile_name = parts[1].strip()
                        if profile_name:  # Return first profile found
                            return profile_name
        
        # Fallback: try running-config
        success, output = self.client.execute_command("show running-config | include gpon-profile tcont", timeout=10)
        if success:
            for line in output.split('\n'):
                if 'gpon-profile tcont' in line.lower():
                    parts = line.strip().split()
                    for i, p in enumerate(parts):
                        if p == 'tcont' and i + 1 < len(parts):
                            return parts[i + 1]
        
        # Last resort: return 'default' which should always exist
        return "default"
    
    def _get_first_traffic_profile(self) -> str:
        """Get first available traffic profile from OLT"""
        # Use proper command to fetch Traffic profiles
        success, output = self.client.execute_command("show gpon profile traffic", timeout=10)
        
        if success and output:
            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                # Format: "Profile name :DOWN-100M"
                if line.startswith('Profile name'):
                    parts = line.split(':')
                    if len(parts) >= 2:
                        profile_name = parts[1].strip()
                        if profile_name:  # Return first profile found
                            return profile_name
        
        # Fallback: try running-config
        success, output = self.client.execute_command("show running-config | include gpon-profile traffic", timeout=10)
        if success:
            for line in output.split('\n'):
                if 'gpon-profile traffic' in line.lower():
                    parts = line.strip().split()
                    for i, p in enumerate(parts):
                        if p == 'traffic' and i + 1 < len(parts):
                            return parts[i + 1]
        
        # Last resort: return 'default' which should always exist
        return "default"
    
    def delete_service_config(self, onu_id: str) -> tuple:
        """Delete/Clear semua service configuration pada ONU (TIDAK menghapus name/description)"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"\n{'='*60}")
        print(f"Clearing service config for {onu_interface}")
        print(f"{'='*60}")
        print("  (Name dan Description ONU akan tetap dipertahankan)")
        print(f"{'='*60}")
        
        # Step 1: Masuk config terminal
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        
        # Step 2: Enter pon-onu-mng mode dan hapus wan-ip dan service
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        
        if "%" not in output and "error" not in output.lower():
            print("  [1] Masuk pon-onu-mng...")
            # Hapus wan-ip configuration (semua index)
            for i in range(1, 5):  # Coba hapus wan-ip 1-4
                self.client.execute_command(f"no wan-ip {i}", timeout=2)
            print("  [2] Hapus wan-ip (1-4)")
            
            # Hapus vlan port
            self.client.execute_command("no vlan port veip_1", timeout=3)
            print("  [3] Hapus vlan port veip_1")
            
            # Hapus service (berbagai nama yang mungkin)
            for svc_name in ['INTERNET', 'BRIDGE', 'VOIP', 'ACS']:
                self.client.execute_command(f"no service {svc_name}", timeout=2)
            print("  [4] Hapus service configs")
            self.client.execute_command("exit", timeout=2)
        else:
            print("  pon-onu-mng tidak tersedia, skip OMCI cleanup")
        
        # Step 3: Enter interface config dan hapus service-port, gemport, tcont
        # PENTING: Jangan gunakan 'no' pada name atau description!
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" not in output and "error" not in output.lower():
            print("  [5] Masuk interface config...")
            
            # Hapus service-port (multiple indices)
            for i in range(1, 9):  # Service-port 1-8
                self.client.execute_command(f"no service-port {i}", timeout=2)
            print("  [6] Hapus service-port (1-8)")
            
            # Hapus gemport traffic-limit dulu sebelum hapus gemport
            for i in range(1, 9):
                self.client.execute_command(f"no gemport {i} traffic-limit downstream", timeout=2)
            
            # Hapus gemport
            for i in range(1, 9):  # Gemport 1-8
                self.client.execute_command(f"no gemport {i}", timeout=2)
            print("  [7] Hapus gemport (1-8)")
            
            # Hapus tcont (jangan hapus semua, hanya yang service-related)
            for i in range(1, 9):  # TCONT 1-8
                self.client.execute_command(f"no tcont {i}", timeout=2)
            print("  [8] Hapus tcont (1-8)")
            self.client.execute_command("exit", timeout=2)
        
        self.client.execute_command("end", timeout=2)
        
        print(f"{'='*60}")
        print(f"Service configuration cleared!")
        print(f"{'='*60}")
        
        return True, f"Service configuration cleared for {onu_interface}"
    
    def show_pppoe_status(self, onu_id: str) -> str:
        """Show PPPOE status pada ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        
        # Enter pon-onu-mng mode
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return f"Cannot access OMCI management for {onu_interface}"
        
        # Get WAN status
        success, output = self.client.execute_command("show wan", timeout=5)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return output
    
    # ==================== BRIDGE CONFIGURATION ====================
    
    def configure_bridge(self, onu_id: str, vlan: int = 100,
                         tcont_profile: str = None,
                         eth_port: int = 1) -> tuple:
        """
        Configure Bridge mode untuk ONU
        
        Args:
            onu_id: ONU ID
            vlan: Service VLAN
            tcont_profile: Upstream bandwidth profile (auto fetch if None)
            eth_port: ETH port to bind (1-4)
        """
        # Fetch profiles if not specified
        if not tcont_profile:
            tcont_profile = self._get_first_tcont_profile()
        
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"\n{'='*60}")
        print(f"Configuring Bridge mode for {onu_interface}")
        print(f"{'='*60}")
        print(f"  VLAN: {vlan}")
        print(f"  ETH Port: {eth_port}")
        print(f"  TCONT Profile: {tcont_profile}")
        print(f"  (Name dan Description ONU akan dipertahankan)")
        
        # Backup name/description
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        if backup.get('name'):
            print(f"      Backed up - Name: {backup['name']}")
        
        # Step 1: Masuk config terminal
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        print("  [1] Masuk configure terminal...")
        
        # Step 2: Masuk interface gpon-onu
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return False, f"Gagal masuk interface: {output}"
        print(f"  [2] Masuk interface {onu_interface}...")
        
        # Step 3: Configure TCONT
        cmd = f"tcont 1 name tcont1 profile {tcont_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [3] Set TCONT: {cmd}")
        
        # Step 4: Configure GEM port
        cmd = "gemport 1 name gemport1 tcont 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [4] Set Gemport: {cmd}")
        
        # Step 5: Configure service port - bridge mode dengan user-vlan untagged
        cmd = f"service-port 1 vport 1 user-vlan untagged vlan {vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [5] Set Service-port: {cmd}")
        
        self.client.execute_command("exit", timeout=2)
        
        # Step 6: Enter pon-onu-mng mode
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" not in output or "error" not in output.lower():
            print("  [6] Masuk pon-onu-mng...")
            
            # Configure service for bridge
            cmd = f"service BRIDGE gemport 1 cos 0 vlan {vlan}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [7] Set Service: {cmd}")
            
            # Configure VLAN filter on ETH port
            cmd = f"vlan port eth_0/{eth_port} mode tag vlan {vlan}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [8] Set VLAN port: {cmd}")
            
            self.client.execute_command("exit", timeout=2)
        else:
            print("  pon-onu-mng tidak tersedia, skip OMCI config")
        
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description
        print("  [9] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        print(f"{'='*60}")
        print(f"Bridge Configuration Complete!")
        print(f"{'='*60}")
        
        return True, f"Bridge mode configured for {onu_interface}, VLAN: {vlan}, ETH Port: {eth_port}"
    
    # ==================== STATIC IP CONFIGURATION ====================
    
    def configure_static_ip(self, onu_id: str, ip_address: str, netmask: str,
                            gateway: str, dns1: str = "8.8.8.8", 
                            dns2: str = "8.8.4.4", vlan: int = 100,
                            tcont_profile: str = None) -> tuple:
        """
        Configure Static IP untuk ONU
        
        Args:
            onu_id: ONU ID
            ip_address: Static IP address
            netmask: Subnet mask
            gateway: Default gateway
            dns1, dns2: DNS servers
            vlan: Service VLAN
            tcont_profile: Upstream bandwidth profile (auto fetch if None)
        """
        # Fetch profile if not specified
        if not tcont_profile:
            tcont_profile = self._get_first_tcont_profile()
        
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"\n{'='*60}")
        print(f"Configuring Static IP for {onu_interface}")
        print(f"{'='*60}")
        print(f"  IP: {ip_address}/{netmask}")
        print(f"  Gateway: {gateway}")
        print(f"  DNS: {dns1}, {dns2}")
        print(f"  VLAN: {vlan}")
        print(f"  TCONT Profile: {tcont_profile}")
        print(f"  (Name dan Description ONU akan dipertahankan)")
        
        # Backup name/description
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        if backup.get('name'):
            print(f"      Backed up - Name: {backup['name']}")
        print(f"{'='*60}")
        print(f"  IP: {ip_address}")
        print(f"  Netmask: {netmask}")
        print(f"  Gateway: {gateway}")
        print(f"  DNS: {dns1}, {dns2}")
        print(f"  VLAN: {vlan}")
        print(f"  TCONT Profile: {tcont_profile}")
        
        # Step 1: Masuk config terminal
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        print("  [1] Masuk configure terminal...")
        
        # Step 2: Masuk interface gpon-onu
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return False, f"Gagal masuk interface: {output}"
        print(f"  [2] Masuk interface {onu_interface}...")
        
        # Step 3: Configure TCONT & GEM
        cmd = f"tcont 1 name tcont1 profile {tcont_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [3] Set TCONT: {cmd}")
        
        cmd = "gemport 1 name gemport1 tcont 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [4] Set Gemport: {cmd}")
        
        cmd = f"service-port 1 vport 1 user-vlan {vlan} vlan {vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [5] Set Service-port: {cmd}")
        
        self.client.execute_command("exit", timeout=2)
        
        # Step 4: Enter pon-onu-mng mode
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return True, "Basic config done, OMCI management not available"
        print("  [6] Masuk pon-onu-mng...")
        
        # Configure service
        cmd = f"service INTERNET gemport 1 cos 0 vlan {vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [7] Set Service: {cmd}")
        
        # Configure VLAN port untuk veip
        cmd = f"vlan port veip_1 mode hybrid def-vlan {vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [8] Set VLAN port mode: {cmd}")
        
        cmd = f"vlan port veip_1 vlan {vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [9] Set VLAN port: {cmd}")
        
        # Configure WAN IP Static
        # wan-ip 1 mode static ip-address <ip> mask <mask> gateway <gw> dns1 <dns1> dns2 <dns2> vlan-profile <vlan> host 1
        cmd = (f"wan-ip 1 mode static ip-address {ip_address} mask {netmask} "
               f"gateway {gateway} dns1 {dns1} dns2 {dns2} vlan-profile {vlan} host 1")
        self.client.execute_command(cmd, timeout=3)
        print(f"  [10] Set WAN IP Static: {cmd[:50]}...")
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description
        print("  [11] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        print(f"{'='*60}")
        print(f"Static IP Configuration Complete!")
        print(f"{'='*60}")
        
        return True, f"Static IP {ip_address} configured for {onu_interface}"
    
    # ==================== DHCP CONFIGURATION ====================
    
    def configure_dhcp(self, onu_id: str, vlan: int = 100,
                       tcont_profile: str = "UP-10M") -> tuple:
        """
        Configure DHCP mode untuk ONU
        """
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Configuring DHCP for {onu_interface}")
        
        # Configure ONU interface
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        self.client.execute_command(f"tcont 1 profile {tcont_profile}", timeout=3)
        self.client.execute_command("gemport 1 tcont 1", timeout=3)
        self.client.execute_command(f"service-port 1 vport 1 user-vlan {vlan} vlan {vlan}", timeout=3)
        
        self.client.execute_command("exit")
        
        # Enter pon-onu-mng mode
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return True, "Basic config done, OMCI management not available"
        
        # Configure service
        self.client.execute_command(f"service INTERNET gemport 1 vlan {vlan}", timeout=3)
        
        # Configure WAN IP DHCP
        cmd = f"wan-ip 1 mode dhcp vlan-profile {vlan} host 1"
        self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"DHCP configured for {onu_interface}"
    
    # ==================== LAN/WLAN BINDING (OMCI) ====================
    
    def configure_lan_binding(self, onu_id: str, eth_ports: list = None,
                              wifi_ssid: str = None, vlan: int = 100) -> tuple:
        """
        Configure LAN/WLAN binding untuk ONU via OMCI
        
        Args:
            onu_id: ONU ID
            eth_ports: List of ETH ports to enable (e.g., [1,2,3,4])
            wifi_ssid: WiFi SSID (optional)
            vlan: Service VLAN
        """
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Configuring LAN/WLAN binding for {onu_interface}")
        
        if eth_ports is None:
            eth_ports = [1, 2, 3, 4]
        
        # Enter pon-onu-mng mode
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        # Configure each ETH port
        for port in eth_ports:
            # Enable port
            self.client.execute_command(f"vlan port eth_0/{port} mode tag vlan {vlan}", timeout=3)
        
        # Configure WiFi if SSID provided
        if wifi_ssid:
            # Set SSID
            self.client.execute_command(f"wifi ssid 1 name {wifi_ssid}", timeout=3)
            # Bind to VLAN
            self.client.execute_command(f"wifi ssid 1 bindvlan {vlan}", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"LAN/WLAN binding configured for {onu_interface}"
    
    def configure_wifi(self, onu_id: str, ssid: str, password: str,
                       ssid_id: int = 1, encryption: str = "wpa2-psk",
                       vlan: int = 100) -> tuple:
        """
        Configure WiFi settings untuk ONU via OMCI
        
        Args:
            onu_id: ONU ID
            ssid: WiFi SSID
            password: WiFi password
            ssid_id: SSID index (1-4)
            encryption: Encryption type (wpa2-psk, wpa-psk, wep, open)
            vlan: Bind VLAN
        """
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Configuring WiFi for {onu_interface}")
        print(f"  SSID: {ssid}")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        # Configure SSID
        self.client.execute_command(f"wifi ssid {ssid_id} name {ssid}", timeout=3)
        
        # Configure encryption and password
        if encryption == "wpa2-psk":
            self.client.execute_command(f"wifi ssid {ssid_id} auth wpa2-psk", timeout=3)
        elif encryption == "wpa-psk":
            self.client.execute_command(f"wifi ssid {ssid_id} auth wpa-psk", timeout=3)
        
        self.client.execute_command(f"wifi ssid {ssid_id} wpakey {password}", timeout=3)
        
        # Bind to VLAN
        self.client.execute_command(f"wifi ssid {ssid_id} bindvlan {vlan}", timeout=3)
        
        # Enable SSID
        self.client.execute_command(f"wifi ssid {ssid_id} enable", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"WiFi configured for {onu_interface}"
    
    # ==================== REMOTE MANAGEMENT ====================
    
    def configure_security_mgmt(self, onu_id: str, 
                                mode: str = "allow",
                                ingress_type: str = "wan",
                                services: list = None,
                                mgmt_vlan: int = None,
                                priority: int = 0) -> tuple:
        """
        Configure Security Management / Remote Access untuk ONU (ZTE C320)
        
        Reference command:
        pon-onu-mng gpon-onu_1/1/1:1
          security-mgmt 1 state enable mode forward protocol web
          security-mgmt 2 state enable mode forward
          security-mgmt 1 tag pri 0 vlan 30
        
        Args:
            onu_id: ONU ID
            mode: "allow" (forward) or "block"
            ingress_type: "wan" or "lan" - interface type for remote access
            services: List of services ['web', 'telnet', 'ssh', 'snmp', 'ftp', 'tr069']
                     None = all services enabled
            mgmt_vlan: Management VLAN (optional, for tagged mode)
            priority: VLAN priority (default: 0)
        """
        onu_interface = self._parse_onu_interface(onu_id)
        
        if services is None:
            services = ['web', 'telnet', 'ssh']  # Default services
        
        print(f"\n{'='*60}")
        print(f"Configuring Security Management for {onu_interface}")
        print(f"{'='*60}")
        print(f"  Mode         : {mode.upper()}")
        print(f"  Ingress Type : {ingress_type.upper()}")
        print(f"  Services     : {', '.join(services).upper()}")
        if mgmt_vlan:
            print(f"  Mgmt VLAN    : {mgmt_vlan}")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        # ZTE C320 command format:
        # security-mgmt <index> state enable mode <forward|block> [protocol <service>]
        
        mgmt_mode = "forward" if mode.lower() == "allow" else "block"
        
        # Configure security management entries
        mgmt_index = 1
        
        for service in services:
            service_lower = service.lower()
            
            # Entry untuk service spesifik
            if service_lower in ['web', 'http', 'https', 'telnet', 'ssh', 'snmp', 'ftp']:
                protocol = 'web' if service_lower in ['web', 'http', 'https'] else service_lower
                cmd = f"security-mgmt {mgmt_index} state enable mode {mgmt_mode} protocol {protocol}"
                success, output = self.client.execute_command(cmd, timeout=3)
                print(f"  [{mgmt_index}] {service.upper()}: {mgmt_mode}")
                
                # Set VLAN tag jika ada
                if mgmt_vlan:
                    cmd = f"security-mgmt {mgmt_index} tag pri {priority} vlan {mgmt_vlan}"
                    self.client.execute_command(cmd, timeout=3)
                
                mgmt_index += 1
        
        # Entry untuk TR069 (biasanya terpisah)
        if 'tr069' in [s.lower() for s in services]:
            # TR069 biasanya tidak pakai protocol parameter
            cmd = f"security-mgmt {mgmt_index} state enable mode {mgmt_mode}"
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"  [{mgmt_index}] TR069: {mgmt_mode}")
            
            if mgmt_vlan:
                cmd = f"security-mgmt {mgmt_index} tag pri {priority} vlan {mgmt_vlan}"
                self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        print(f"{'='*60}")
        print(f"Security Management Configured!")
        print(f"{'='*60}")
        
        return True, f"Security management configured for {onu_interface}"
    
    def configure_remote_management(self, onu_id: str, mgmt_vlan: int,
                                     ip_mode: str = "dhcp",
                                     ip_address: str = None,
                                     netmask: str = None,
                                     gateway: str = None) -> tuple:
        """
        Configure remote management untuk ONU
        
        Args:
            onu_id: ONU ID
            mgmt_vlan: Management VLAN
            ip_mode: "dhcp" or "static"
            ip_address, netmask, gateway: For static mode
        """
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Configuring remote management for {onu_interface}")
        print(f"  Management VLAN: {mgmt_vlan}")
        
        # Configure management service
        ok, msg = self._enter_onu_config(onu_interface)
        if not ok:
            return False, msg
        
        # Add management TCONT and GEM (use separate TCONT/GEM for management)
        self.client.execute_command("tcont 2 profile UP-MNG", timeout=3)
        self.client.execute_command("gemport 2 tcont 2", timeout=3)
        self.client.execute_command(
            f"service-port 2 vport 2 user-vlan {mgmt_vlan} vlan {mgmt_vlan}", 
            timeout=3
        )
        
        self.client.execute_command("exit")
        
        # Enter pon-onu-mng mode
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return True, "Basic config done, OMCI management not available"
        
        # Configure management service
        self.client.execute_command(f"service MGMT gemport 2 vlan {mgmt_vlan}", timeout=3)
        
        # Configure management IP
        if ip_mode == "static" and ip_address:
            cmd = (f"wan-ip 2 mode static ip-address {ip_address} mask {netmask} "
                   f"gateway {gateway} vlan-profile {mgmt_vlan} host 1")
        else:
            cmd = f"wan-ip 2 mode dhcp vlan-profile {mgmt_vlan} host 1"
        
        self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Remote management configured for {onu_interface}"
    
    # ==================== FIBERHOME ONU CONFIGURATION (HG6145D2-AC) ====================
    
    def configure_fiberhome_veip(self, onu_id: str,
                                  acs_url: str = "http://192.168.54.254:7547",
                                  acs_username: str = "acs",
                                  acs_password: str = "acs",
                                  tr069_vlan: int = 100,
                                  internet_vlan: int = 30,
                                  voip_vlan: int = 151,
                                  tcont_profile: str = "UP-PPPOE") -> tuple:
        """
        Configure Fiberhome ONU (HG6145D2-AC) dengan VEIP mode.
        
        Konfigurasi ini khusus untuk ONU Fiberhome dengan mode VEIP yang membutuhkan:
        - Multiple TCONT dan Gemport (untuk TR069, Internet/IPTV, VoIP)
        - VEIP port configuration
        - TR069/ACS configuration
        - WiFi dan ETH port binding
        
        Reference config:
        interface gpon-onu_1/1/1:2
          tcont 1 profile UP-PPPOE
          tcont 2 profile UP-PPPOE
          tcont 3 profile UP-PPPOE
          gemport 1 tcont 1
          gemport 2 tcont 2
          gemport 3 tcont 3
          service-port 1 vport 1 user-vlan 100 vlan 100  # TR069/ACS Management
          service-port 2 vport 2 user-vlan 30 vlan 30    # Internet/IPTV
          service-port 3 vport 3 user-vlan 151 vlan 151  # VoIP
        
        pon-onu-mng gpon-onu_1/1/1:2
          service 1 gemport 1 vlan 100                   # TR069 Management
          service 2 gemport 2 vlan 30                    # Internet/IPTV
          service 3 gemport 3 vlan 151                   # VoIP
          vlan port veip_1 mode hybrid
          tr069-mgmt 1 state unlock
          tr069-mgmt 1 acs http://192.168.54.254:7547 validate basic username acs password acs
          vlan port wifi_0/1 mode tag vlan 30            # Internet/IPTV untuk WiFi
          vlan port eth_0/1 mode tag vlan 30             # Internet/IPTV untuk LAN ports
          vlan port eth_0/2 mode tag vlan 30
          vlan port eth_0/3 mode tag vlan 30
          vlan port eth_0/4 mode tag vlan 30
        
        Args:
            onu_id: ONU ID (e.g., "1/1/1:2" atau "2")
            acs_url: ACS server URL
            acs_username: ACS username
            acs_password: ACS password
            tr069_vlan: VLAN for TR069/ACS Management (default: 100)
            internet_vlan: VLAN for Internet/IPTV/WiFi (default: 30)
            voip_vlan: VLAN for VoIP (default: 151)
            tcont_profile: TCONT profile name (default: UP-PPPOE)
        """
        onu_interface = self._parse_onu_interface(onu_id)
        
        print(f"\n{'='*60}")
        print(f"Configuring Fiberhome VEIP for {onu_interface}")
        print(f"{'='*60}")
        print(f"  ONU Type      : HG6145D2-AC (Fiberhome VEIP)")
        print(f"  TR069 VLAN    : {tr069_vlan} (ACS Management)")
        print(f"  Internet VLAN : {internet_vlan} (Internet/IPTV/WiFi)")
        print(f"  VoIP VLAN     : {voip_vlan}")
        print(f"  ACS URL       : {acs_url}")
        print(f"  ACS Username  : {acs_username}")
        print(f"  TCONT Profile : {tcont_profile}")
        print(f"{'='*60}")
        
        # Backup name dan description
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        
        # ============================================================
        # STEP 1: Configure interface gpon-onu
        # ============================================================
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return False, f"Gagal masuk interface: {output}"
        print(f"  [1] Masuk interface {onu_interface}...")
        
        # Configure TCONTs (3 TCONT untuk Internet, IPTV, VoIP)
        for i in range(1, 4):
            cmd = f"tcont {i} profile {tcont_profile}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [2] Set TCONT 1-3 profile {tcont_profile}")
        
        # Configure Gemports (3 gemport masing-masing ke tcont)
        for i in range(1, 4):
            cmd = f"gemport {i} tcont {i}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [3] Set Gemport 1-3 to TCONT 1-3")
        
        # Configure service-ports (TR069, Internet, VoIP)
        vlans = [(1, tr069_vlan), (2, internet_vlan), (3, voip_vlan)]
        for idx, vlan in vlans:
            cmd = f"service-port {idx} vport {idx} user-vlan {vlan} vlan {vlan}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [4] Set Service-ports (TR069:{tr069_vlan}, Internet:{internet_vlan}, VoIP:{voip_vlan})")
        
        self.client.execute_command("exit", timeout=2)
        
        # ============================================================
        # STEP 2: Configure pon-onu-mng
        # ============================================================
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return True, f"Basic config done, pon-onu-mng not available"
        print(f"  [5] Masuk pon-onu-mng...")
        
        # Configure services (TR069, Internet, VoIP)
        services = [(1, 1, tr069_vlan), (2, 2, internet_vlan), (3, 3, voip_vlan)]
        for svc, gp, vlan in services:
            cmd = f"service {svc} gemport {gp} vlan {vlan}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [6] Set Services (1:TR069, 2:Internet, 3:VoIP)")
        
        # Configure VEIP port mode hybrid
        cmd = "vlan port veip_1 mode hybrid"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [7] Set VEIP mode hybrid")
        
        # Configure TR069
        cmd = "tr069-mgmt 1 state unlock"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [8] TR069 state unlock")
        
        cmd = f"tr069-mgmt 1 acs {acs_url} validate basic username {acs_username} password {acs_password}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [9] Set ACS: {acs_url}")
        
        # TR069 VLAN tag - REMOVED (no VLAN tag for TR069/ACS management)
        # cmd = f"tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}"
        # self.client.execute_command(cmd, timeout=3)
        # print(f"  [10] Set TR069 VLAN tag: {tr069_vlan}")
        
        # Configure WiFi port binding (Internet/IPTV VLAN)
        cmd = f"vlan port wifi_0/1 mode tag vlan {internet_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [11] Set WiFi port VLAN {internet_vlan} (Internet/IPTV)")
        
        # Configure ETH ports binding (eth_0/1 to eth_0/4) for Internet/IPTV
        for eth_port in range(1, 5):
            cmd = f"vlan port eth_0/{eth_port} mode tag vlan {internet_vlan}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [12] Set ETH ports 1-4 VLAN {internet_vlan} (Internet/IPTV)")
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description
        print("  [13] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        print(f"{'='*60}")
        print(f"Fiberhome VEIP Configuration Complete!")
        print(f"{'='*60}")
        
        return True, f"Fiberhome HG6145D2-AC configured for {onu_interface}"

    # ==================== ZTE FULL CONFIGURATION ====================
    
    def configure_zte_full(self, onu_id: str, tcont_profile: str, config: dict) -> tuple:
        """
        Configure ZTE ONU with Full Configuration.
        Dual TCONT, Dual Gemport, Dual VLAN, Dual SSID, Traffic Limit, TR069, Firewall.
        
        Template command (ZTE C320):
        interface gpon-onu_1/{slot}/{port}:{id}
          name {onu_name}
          tcont 1 name VLAN{primary_vlan} profile {tcont_profile}
          tcont 2 name VLAN{secondary_vlan} profile {tcont_profile}
          gemport 1 tcont 1
          gemport 1 traffic-limit downstream {traffic_profile}
          gemport 2 tcont 2
          gemport 2 traffic-limit downstream {traffic_profile}
          service-port 1 vport 1 user-vlan {primary_vlan} vlan {primary_vlan}
          service-port 2 vport 2 user-vlan {secondary_vlan} vlan {secondary_vlan}
        
        pon-onu-mng gpon-onu_1/{slot}/{port}:{id}
          service VLAN{primary_vlan} gemport 1 iphost 1 vlan {primary_vlan}
          service VLAN{secondary_vlan} gemport 2 vlan {secondary_vlan}
          vlan port veip_1 mode hybrid
          vlan port veip_1 vlan 1
          pppoe 1 nat enable user {user} password {pass}
          vlan port eth_0/1 mode tag vlan {primary_vlan}
          vlan port eth_0/2 mode tag vlan {primary_vlan}
          vlan port eth_0/3 mode tag vlan {primary_vlan}
          vlan port eth_0/4 mode tag vlan {primary_vlan}
          vlan port wifi_0/1 mode tag vlan {primary_vlan}
          vlan port wifi_0/2 mode tag vlan {secondary_vlan}
          firewall enable level low anti-hack disable
          tr069-mgmt 1 state unlock
          tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}
          tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}
          security-mgmt 1 state enable mode forward
          wan 1 service internet host 1
        """
        onu_interface = self._parse_onu_interface(onu_id)
        
        primary_vlan = config.get('primary_vlan', 30)
        secondary_vlan = config.get('secondary_vlan', 151)
        traffic_profile = config.get('traffic_profile', 'DOWN-PPPOE')
        pppoe_user = config.get('pppoe_user', '')
        pppoe_pass = config.get('pppoe_pass', '')
        
        # ETH port VLANs - semua eth port ke primary VLAN sesuai template
        eth1_vlan = config.get('eth1_vlan', primary_vlan)
        eth2_vlan = config.get('eth2_vlan', primary_vlan)
        eth3_vlan = config.get('eth3_vlan', primary_vlan)
        eth4_vlan = config.get('eth4_vlan', primary_vlan)
        
        # SSID settings
        enable_dual_ssid = config.get('enable_dual_ssid', True)
        ssid1_name = config.get('ssid1_name', '')
        ssid1_password = config.get('ssid1_password', '12345678')
        ssid2_name = config.get('ssid2_name', '')
        ssid2_auth = config.get('ssid2_auth', 'open')
        ssid2_password = config.get('ssid2_password', '')
        
        # TR069 settings
        enable_tr069 = config.get('enable_tr069', True)
        tr069_vlan = config.get('tr069_vlan', 100)
        acs_url = config.get('acs_url', 'http://192.168.54.254:7547')
        acs_user = config.get('acs_user', 'acs')
        acs_pass = config.get('acs_pass', 'acs')
        
        # Security settings
        enable_firewall = config.get('enable_firewall', True)
        firewall_level = config.get('firewall_level', 'low')
        enable_security_mgmt = config.get('enable_security_mgmt', True)
        
        print(f"\n{'='*60}")
        print(f"Configuring ZTE Full for {onu_interface}")
        print(f"{'='*60}")
        print(f"  Primary VLAN: {primary_vlan}, Secondary VLAN: {secondary_vlan}")
        print(f"  TCONT Profile: {tcont_profile}")
        print(f"  Traffic Profile: {traffic_profile}")
        if pppoe_user:
            print(f"  PPPoE: {pppoe_user}")
        print(f"  Dual SSID: {enable_dual_ssid}")
        if ssid1_name:
            print(f"  SSID 1 Name: '{ssid1_name}' Auth: {config.get('ssid1_auth', 'wpa2')}")
        if enable_dual_ssid and ssid2_name:
            print(f"  SSID 2 Name: '{ssid2_name}' Auth: {ssid2_auth}")
        print(f"  TR069: {enable_tr069}, VLAN: {tr069_vlan}")
        
        # Backup name/description
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        if backup.get('name'):
            print(f"      Backed up - Name: {backup['name']}")
        
        # ============================================================
        # STEP 1: Configure interface gpon-onu (TCONT, Gemport, Service-port)
        # ============================================================
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return False, f"Failed to enter ONU interface: {output}"
        print(f"  [1] Masuk interface {onu_interface}")
        
        # Configure TCONT 1 (primary VLAN - Internet)
        tcont1_name = f"VLAN{primary_vlan:04d}"
        cmd = f"tcont 1 name {tcont1_name} profile {tcont_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [2] Set TCONT 1: {tcont1_name} profile {tcont_profile}")
        
        # Configure TCONT 2 (secondary VLAN - VoIP)
        tcont2_name = f"VLAN{secondary_vlan}"
        cmd = f"tcont 2 name {tcont2_name} profile {tcont_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [3] Set TCONT 2: {tcont2_name} profile {tcont_profile}")
        
        # Configure Gemport 1 -> TCONT 1
        self.client.execute_command("gemport 1 tcont 1", timeout=3)
        print(f"  [4] Set gemport 1 tcont 1")
        
        # Traffic limit for gemport 1
        cmd = f"gemport 1 traffic-limit downstream {traffic_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [5] Set gemport 1 traffic-limit downstream {traffic_profile}")
        
        # Configure Gemport 2 -> TCONT 2
        self.client.execute_command("gemport 2 tcont 2", timeout=3)
        print(f"  [6] Set gemport 2 tcont 2")
        
        # Traffic limit for gemport 2
        cmd = f"gemport 2 traffic-limit downstream {traffic_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [7] Set gemport 2 traffic-limit downstream {traffic_profile}")
        
        # Service-port 1 (primary VLAN) - vport 1
        cmd = f"service-port 1 vport 1 user-vlan {primary_vlan} vlan {primary_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [8] Set service-port 1 vport 1 VLAN {primary_vlan}")
        
        # Service-port 2 (secondary VLAN) - vport 2
        cmd = f"service-port 2 vport 2 user-vlan {secondary_vlan} vlan {secondary_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [9] Set service-port 2 vport 2 VLAN {secondary_vlan}")
        
        self.client.execute_command("exit", timeout=2)
        
        # ============================================================
        # STEP 2: Configure pon-onu-mng
        # ============================================================
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return True, f"Basic config done, pon-onu-mng not available"
        print(f"  [10] Masuk pon-onu-mng...")
        
        # Configure service 1 (Internet - primary VLAN)
        service1_name = f"VLAN{primary_vlan:04d}"
        cmd = f"service {service1_name} gemport 1 iphost 1 vlan {primary_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [11] Set service {service1_name} gemport 1 iphost 1")
        
        # Configure service 2 (VoIP - secondary VLAN)
        service2_name = f"VLAN{secondary_vlan}"
        cmd = f"service {service2_name} gemport 2 vlan {secondary_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [12] Set service {service2_name} gemport 2")
        
        # Configure VEIP port mode hybrid
        cmd = "vlan port veip_1 mode hybrid"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [13] Set VEIP mode hybrid")
        
        # Configure VEIP VLAN 1
        cmd = "vlan port veip_1 vlan 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [14] Set VEIP vlan 1")
        
        # Configure PPPoE
        if pppoe_user and pppoe_pass:
            cmd = f"pppoe 1 nat enable user {pppoe_user} password {pppoe_pass}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [15] Set PPPoE: {pppoe_user}")
        
        # Configure ETH port VLAN tagging - semua ke primary VLAN
        for i in range(1, 5):
            cmd = f"vlan port eth_0/{i} mode tag vlan {primary_vlan}"
            self.client.execute_command(cmd, timeout=3)
        print(f"  [16] Set ETH ports 1-4 VLAN {primary_vlan}")
        
        # Configure WiFi 1 VLAN tagging (primary VLAN - Internet)
        cmd = f"vlan port wifi_0/1 mode tag vlan {primary_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [17] Set WiFi 1 VLAN {primary_vlan}")
        
        # Configure WiFi 2 VLAN tagging (secondary VLAN - VoIP)
        if enable_dual_ssid:
            cmd = f"vlan port wifi_0/2 mode tag vlan {secondary_vlan}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [18] Set WiFi 2 VLAN {secondary_vlan}")
        
        # Configure SSID 1 (Main WiFi)
        if ssid1_name:
            ssid1_auth = config.get('ssid1_auth', 'wpa2')
            try:
                # Set SSID name
                cmd = f"wifi ssid 1 name {ssid1_name}"
                self.client.execute_command(cmd, timeout=3)
                
                # Set authentication
                if ssid1_auth == 'wpa2':
                    self.client.execute_command("wifi ssid 1 auth wpa2-psk", timeout=3)
                elif ssid1_auth == 'wpa':
                    self.client.execute_command("wifi ssid 1 auth wpa-psk", timeout=3)
                
                # Set password
                if ssid1_password:
                    cmd = f"wifi ssid 1 wpakey {ssid1_password}"
                    self.client.execute_command(cmd, timeout=3)
                
                # Bind to VLAN
                cmd = f"wifi ssid 1 bindvlan {primary_vlan}"
                self.client.execute_command(cmd, timeout=3)
                
                # Enable SSID
                self.client.execute_command("wifi ssid 1 enable", timeout=3)
                print(f"  [18a] Config SSID 1: '{ssid1_name}' Auth: {ssid1_auth}")
            except Exception as e:
                print(f"  Warning: SSID 1 config may have failed: {e}")
        
        # Configure SSID 2 (Guest/Voucher WiFi)
        if enable_dual_ssid and ssid2_name:
            try:
                # Set SSID name
                cmd = f"wifi ssid 2 name {ssid2_name}"
                self.client.execute_command(cmd, timeout=3)
                
                # Set authentication
                if ssid2_auth == 'wpa2':
                    self.client.execute_command("wifi ssid 2 auth wpa2-psk", timeout=3)
                    if ssid2_password:
                        cmd = f"wifi ssid 2 wpakey {ssid2_password}"
                        self.client.execute_command(cmd, timeout=3)
                elif ssid2_auth == 'wpa':
                    self.client.execute_command("wifi ssid 2 auth wpa-psk", timeout=3)
                    if ssid2_password:
                        cmd = f"wifi ssid 2 wpakey {ssid2_password}"
                        self.client.execute_command(cmd, timeout=3)
                elif ssid2_auth == 'open':
                    self.client.execute_command("wifi ssid 2 auth open", timeout=3)
                
                # Bind to VLAN
                cmd = f"wifi ssid 2 bindvlan {secondary_vlan}"
                self.client.execute_command(cmd, timeout=3)
                
                # Enable SSID
                self.client.execute_command("wifi ssid 2 enable", timeout=3)
                print(f"  [18b] Config SSID 2: '{ssid2_name}' Auth: {ssid2_auth}")
            except Exception as e:
                print(f"  Warning: SSID 2 config may have failed: {e}")
        
        # Configure Firewall
        if enable_firewall:
            cmd = f"firewall enable level {firewall_level} anti-hack disable"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [19] Enable firewall level {firewall_level}")
        
        # Configure TR069
        if enable_tr069:
            self.client.execute_command("tr069-mgmt 1 state unlock", timeout=3)
            cmd = f"tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [20] Set TR069 ACS: {acs_url}")
            
            # TR069 VLAN tag - REMOVED (no VLAN tag for TR069/ACS management)
            # cmd = f"tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}"
            # self.client.execute_command(cmd, timeout=3)
            # print(f"  [21] Set TR069 VLAN tag: {tr069_vlan}")
        
        # Configure Security Management
        if enable_security_mgmt:
            cmd = "security-mgmt 1 state enable mode forward"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [22] Enable security-mgmt")
        
        # Configure WAN service
        cmd = "wan 1 service internet host 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [23] Set wan 1 service internet")
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description
        print("  [24] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        print(f"{'='*60}")
        print(f"ZTE Full Configuration Complete!")
        print(f"{'='*60}")
        
        if ssid1_name or ssid2_name:
            print(f"")
            print(f"  ℹ️ SSID Configuration:")
            if ssid1_name:
                print(f"     SSID 1: '{ssid1_name}' configured")
            if enable_dual_ssid and ssid2_name:
                print(f"     SSID 2: '{ssid2_name}' configured")
            print(f"     Note: Verify SSID names via ONU web interface")
        
        return True, f"ZTE Full configured for {onu_interface}"

    # ==================== HUAWEI FULL CONFIGURATION ====================
    
    def configure_huawei_full(self, onu_id: str, tcont_profile: str, config: dict) -> tuple:
        """
        Configure Huawei ONU with Full Configuration.
        Multi VLAN (Mgmt, Internet, VoIP), WAN DHCP.
        Note: Huawei doesn't support OMCI configuration via ZTE OLT.
        
        Template command:
        interface gpon-onu_1/1/1:{id}
          name {onu_name}
          description {description}
          tcont 1 profile {tcont_profile}
          gemport 1 tcont 1
          gemport 1 traffic-limit downstream {traffic_profile}
          service-port 1 vport 1 user-vlan {mgmt_vlan} vlan {mgmt_vlan}
          service-port 2 vport 1 user-vlan {internet_vlan} vlan {internet_vlan}
          service-port 3 vport 1 user-vlan {voip_vlan} vlan {voip_vlan}
        pon-onu-mng gpon-onu_1/1/1:{id}
          service ServiceONU1 gemport 1
          wan-ip 1 mode dhcp vlan-profile {vlan_profile} host 1
        """
        onu_interface = self._parse_onu_interface(onu_id)
        
        mgmt_vlan = config.get('mgmt_vlan', 1010)
        internet_vlan = config.get('internet_vlan', 30)
        voip_vlan = config.get('voip_vlan', 151)
        vlan_profile = config.get('vlan_profile', 'genieacs')
        traffic_profile = config.get('traffic_profile', '')
        
        print(f"\n{'='*60}")
        print(f"Configuring Huawei Full for {onu_interface}")
        print(f"{'='*60}")
        print(f"  Management VLAN: {mgmt_vlan}")
        print(f"  Internet VLAN: {internet_vlan}")
        print(f"  VoIP VLAN: {voip_vlan}")
        print(f"  TCONT Profile: {tcont_profile}")
        if traffic_profile:
            print(f"  Traffic Profile: {traffic_profile}")
        print(f"  VLAN Profile: {vlan_profile}")
        print(f"")
        print(f"  ⚠️ Note: Huawei tidak support OMCI via ZTE OLT")
        print(f"  ⚠️ WiFi/SSID/Firewall dikonfigurasi via TR069/GenieACS")
        
        # Backup name/description
        print("  [0] Backup ONU name/description...")
        backup = self._backup_onu_name_description(onu_id)
        if backup.get('name'):
            print(f"      Backed up - Name: {backup['name']}")
        
        # ============================================================
        # STEP 1: Configure interface gpon-onu (TCONT, Gemport, Service-port)
        # ============================================================
        self.client.execute_command("end", timeout=2)
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return False, f"Failed to enter ONU interface: {output}"
        print(f"  [1] Masuk interface {onu_interface}")
        
        # Configure TCONT (simpler format for Huawei)
        cmd = f"tcont 1 profile {tcont_profile}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [2] Set TCONT: {cmd}")
        
        # Configure Gemport
        self.client.execute_command("gemport 1 tcont 1", timeout=3)
        print(f"  [3] Set gemport 1 tcont 1")
        
        # Traffic limit if specified
        if traffic_profile:
            cmd = f"gemport 1 traffic-limit downstream {traffic_profile}"
            self.client.execute_command(cmd, timeout=3)
            print(f"  [4] Set traffic limit: {traffic_profile}")
        
        # Service-port 1 (Management VLAN - TR069/GenieACS)
        cmd = f"service-port 1 vport 1 user-vlan {mgmt_vlan} vlan {mgmt_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [5] Set service-port 1 VLAN {mgmt_vlan} (Management)")
        
        # Service-port 2 (Internet VLAN)
        cmd = f"service-port 2 vport 1 user-vlan {internet_vlan} vlan {internet_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [6] Set service-port 2 VLAN {internet_vlan} (Internet)")
        
        # Service-port 3 (VoIP VLAN)
        cmd = f"service-port 3 vport 1 user-vlan {voip_vlan} vlan {voip_vlan}"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [7] Set service-port 3 VLAN {voip_vlan} (VoIP)")
        
        self.client.execute_command("exit", timeout=2)
        
        # ============================================================
        # STEP 2: Configure pon-onu-mng (limited for Huawei)
        # ============================================================
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end", timeout=2)
            return True, f"Basic config done, pon-onu-mng not available"
        print(f"  [8] Masuk pon-onu-mng...")
        
        # Configure service (simple - no OMCI support for Huawei via ZTE)
        cmd = "service ServiceONU1 gemport 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [9] Set service ServiceONU1 gemport 1")
        
        # Configure WAN IP with DHCP mode for TR069/GenieACS
        cmd = f"wan-ip 1 mode dhcp vlan-profile {vlan_profile} host 1"
        self.client.execute_command(cmd, timeout=3)
        print(f"  [10] Set wan-ip 1 mode dhcp vlan-profile {vlan_profile}")
        
        self.client.execute_command("exit", timeout=2)
        self.client.execute_command("end", timeout=2)
        
        # Restore name/description
        print("  [11] Restore ONU name/description...")
        self._restore_onu_name_description(onu_id, backup)
        
        print(f"{'='*60}")
        print(f"Huawei Full Configuration Complete!")
        print(f"{'='*60}")
        print(f"")
        print(f"  ℹ️ Konfigurasi selanjutnya via TR069/GenieACS:")
        print(f"     - WiFi SSID & Password")
        print(f"     - PPPoE Username & Password")
        print(f"     - Firewall Settings")
        print(f"     - LAN Port Binding")
        
        return True, f"Huawei Full configured for {onu_interface}"

    # ==================== TR-069 / ACS CONFIGURATION ====================
    
    def configure_tr069(self, onu_id: str, 
                        enable: bool = True,
                        acs_url: str = None,
                        username: str = None, 
                        password: str = None,
                        vlan_id: int = None, 
                        priority: int = 0) -> tuple:
        """
        Configure TR-069/CWMP untuk ONU (ZTE C320 Format)
        
        Reference command:
        pon-onu-mng gpon-onu_1/1/1:1
          tr069-mgmt 1 state enable/unlock/disable
          tr069-mgmt 1 acs http://192.168.54.254:7547 validate basic username acs password acs
          tr069-mgmt 1 tag pri 0 vlan 1010
        
        Args:
            onu_id: ONU ID
            enable: True = enable TR069, False = disable TR069
            acs_url: ACS server URL (e.g., http://192.168.54.254:7547)
            username: ACS username (optional)
            password: ACS password (optional)
            vlan_id: Management VLAN for TR069 (optional)
            priority: VLAN priority (default: 0)
        """
        onu_interface = self._parse_onu_interface(onu_id)
        
        print(f"\n{'='*60}")
        print(f"Configuring TR-069 for {onu_interface}")
        print(f"{'='*60}")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        if not enable:
            # Disable TR069
            print(f"  Disabling TR069...")
            cmd = "tr069-mgmt 1 state disable"
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"  [1] {cmd}")
            
            self.client.execute_command("exit")
            self.client.execute_command("end")
            
            print(f"{'='*60}")
            print(f"TR-069 Disabled!")
            print(f"{'='*60}")
            
            return True, f"TR069 disabled for {onu_interface}"
        
        # Enable TR069
        print(f"  Enabling TR069...")
        if acs_url:
            print(f"  ACS URL      : {acs_url}")
        if username:
            print(f"  Username     : {username}")
        if vlan_id:
            print(f"  VLAN         : {vlan_id}")
        
        # Step 1: Set TR069-MGMT state (unlock first, then enable)
        cmd = "tr069-mgmt 1 state unlock"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [1] {cmd}")
        
        cmd = "tr069-mgmt 1 state enable"
        success, output = self.client.execute_command(cmd, timeout=3)
        print(f"  [2] {cmd}")
        
        # Step 2: Configure ACS URL with credentials (if provided)
        if acs_url:
            if username and password:
                cmd = f"tr069-mgmt 1 acs {acs_url} validate basic username {username} password {password}"
            else:
                cmd = f"tr069-mgmt 1 acs {acs_url}"
            
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"  [3] Set ACS: {acs_url}")
        
        # Step 3: Configure VLAN tag (if provided)
        if vlan_id:
            cmd = f"tr069-mgmt 1 tag pri {priority} vlan {vlan_id}"
            success, output = self.client.execute_command(cmd, timeout=3)
            print(f"  [4] Set VLAN tag: pri {priority} vlan {vlan_id}")
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        print(f"{'='*60}")
        print(f"TR-069 Configuration Complete!")
        print(f"{'='*60}")
        
        return True, f"TR-069 configured for {onu_interface}"
    
    def show_tr069_status(self, onu_id: str) -> str:
        """Show TR-069 status pada ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return f"Cannot access OMCI management: {msg}"
        
        success, output = self.client.execute_command("show tr069", timeout=5)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return output
    
    # ==================== LAN/WLAN BINDING (OMCI) ====================
    
    def set_lan_binding(self, slot: int, port: int, onu_id: int, 
                       lan_port: int, vlan_id: int, mode: str = "transparent") -> tuple:
        """
        Set LAN port binding untuk ONU via OMCI
        
        Args:
            slot: Slot number
            port: PON port number
            onu_id: ONU ID
            lan_port: LAN port (1-4)
            vlan_id: VLAN ID
            mode: transparent atau tag
        """
        onu_id_full = f"{slot}/1/{port}:{onu_id}"
        onu_interface = self._parse_onu_interface(onu_id_full)
        
        print(f"\nConfiguring LAN port binding for {onu_interface}")
        print(f"  LAN Port: {lan_port}")
        print(f"  VLAN ID: {vlan_id}")
        print(f"  Mode: {mode}")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        # Configure LAN port binding via OMCI
        # ZTE format: eth_0/{lan_port}
        if mode.lower() == "transparent":
            cmd = f"vlan port eth_0/{lan_port} mode transparent"
        else:
            cmd = f"vlan port eth_0/{lan_port} mode tag vlan {vlan_id}"
        
        success, output = self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed to configure LAN binding: {output}"
        
        return True, f"LAN port {lan_port} bound to VLAN {vlan_id} ({mode} mode)"
    
    def set_wlan_binding(self, slot: int, port: int, onu_id: int,
                        ssid_index: int, vlan_id: int, mode: str = "transparent") -> tuple:
        """
        Set WLAN (WiFi) binding untuk ONU via OMCI
        
        Args:
            slot: Slot number
            port: PON port number
            onu_id: ONU ID
            ssid_index: SSID index (1-4)
            vlan_id: VLAN ID
            mode: transparent atau tag
        """
        onu_id_full = f"{slot}/1/{port}:{onu_id}"
        onu_interface = self._parse_onu_interface(onu_id_full)
        
        print(f"\nConfiguring WLAN binding for {onu_interface}")
        print(f"  SSID Index: {ssid_index}")
        print(f"  VLAN ID: {vlan_id}")
        print(f"  Mode: {mode}")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        # Configure WLAN binding via OMCI
        # ZTE format: ssid_0/{ssid_index}
        if mode.lower() == "transparent":
            cmd = f"vlan port ssid_0/{ssid_index} mode transparent"
        else:
            cmd = f"vlan port ssid_0/{ssid_index} mode tag vlan {vlan_id}"
        
        success, output = self.client.execute_command(cmd, timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed to configure WLAN binding: {output}"
        
        return True, f"WLAN SSID {ssid_index} bound to VLAN {vlan_id} ({mode} mode)"
    
    # ==================== ONU REBOOT/RESET ====================
    
    def reboot_onu(self, onu_id: str) -> tuple:
        """Reboot ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Rebooting {onu_interface}...")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        self.client.execute_command("reboot", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Reboot command sent to {onu_interface}"
    
    def factory_reset_onu(self, onu_id: str) -> tuple:
        """Factory reset ONU"""
        onu_interface = self._parse_onu_interface(onu_id)
        print(f"Factory resetting {onu_interface}...")
        
        ok, msg = self._enter_onu_mng(onu_interface)
        if not ok:
            return False, msg
        
        self.client.execute_command("restore factory", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Factory reset command sent to {onu_interface}"
    
    # ==================== DELETE ONU ====================
    
    def delete_onu(self, onu_id: str, pon_port: str = "1/1/1") -> tuple:
        """Delete ONU from PON port"""
        # Convert onu_id to string if it's not already
        onu_id = str(onu_id)
        
        # Extract ONU number from ID
        if ":" in onu_id:
            onu_num = onu_id.split(":")[-1]
        else:
            onu_num = onu_id
        
        # Fix PON interface format - pon_port already includes full path like "1/1/1"
        pon_interface = f"gpon-olt_{pon_port}"
        print(f"Deleting ONU {onu_num} from {pon_interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        success, output = self.client.execute_command(f"interface {pon_interface}", timeout=3)
        
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter PON interface: {output}"
        
        success, output = self.client.execute_command(f"no onu {onu_num}", timeout=5)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"ONU {onu_num} deleted from {pon_interface}"


def create_parser():
    """Create argument parser"""
    parser = argparse.ArgumentParser(
        description="ONU Configuration Manager for ZTE C320",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Show ONU status
  python onu_config_manager.py status 1/1/1
  
  # Show ONU detail
  python onu_config_manager.py detail 1/1/1:1
  
  # Configure PPPOE
  python onu_config_manager.py pppoe 1/1/1:1 --username user@isp --password secret --vlan 100
  
  # Configure Bridge mode
  python onu_config_manager.py bridge 1/1/1:1 --vlan 100
  
  # Configure Static IP
  python onu_config_manager.py static 1/1/1:1 --ip 192.168.1.100 --mask 255.255.255.0 --gateway 192.168.1.1
  
  # Configure WiFi
  python onu_config_manager.py wifi 1/1/1:1 --ssid MyWiFi --password secret123
  
  # Configure TR-069
  python onu_config_manager.py tr069 1/1/1:1 --acs-url http://acs.example.com:7547
  
  # Configure Remote Management
  python onu_config_manager.py remote-mgmt 1/1/1:1 --vlan 69
  
  # Reboot ONU
  python onu_config_manager.py reboot 1/1/1:1
  
  # Delete ONU
  python onu_config_manager.py delete 1 --pon 1/1/1
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Show ONU status on PON port')
    status_parser.add_argument('pon_port', nargs='?', default='1/1/1', help='PON port (e.g., 1/1/1)')
    
    # Detail command
    detail_parser = subparsers.add_parser('detail', help='Show ONU detail')
    detail_parser.add_argument('onu_id', help='ONU ID (e.g., 1/1/1:1)')
    
    # Config command
    config_parser = subparsers.add_parser('config', help='Show ONU running config')
    config_parser.add_argument('onu_id', help='ONU ID')
    
    # Optical command
    optical_parser = subparsers.add_parser('optical', help='Show ONU optical info')
    optical_parser.add_argument('onu_id', help='ONU ID')
    
    # PPPOE command
    pppoe_parser = subparsers.add_parser('pppoe', help='Configure PPPOE')
    pppoe_parser.add_argument('onu_id', help='ONU ID')
    pppoe_parser.add_argument('--username', required=True, help='PPPOE username')
    pppoe_parser.add_argument('--password', required=True, help='PPPOE password')
    pppoe_parser.add_argument('--vlan', type=int, default=100, help='Service VLAN')
    pppoe_parser.add_argument('--tcont', default='UP-PPPOE', help='TCONT profile')
    pppoe_parser.add_argument('--traffic', default='DOWN-PPPOE', help='Traffic profile')
    
    # Bridge command
    bridge_parser = subparsers.add_parser('bridge', help='Configure Bridge mode')
    bridge_parser.add_argument('onu_id', help='ONU ID')
    bridge_parser.add_argument('--vlan', type=int, default=100, help='Service VLAN')
    bridge_parser.add_argument('--tcont', default='UP-10M', help='TCONT profile')
    bridge_parser.add_argument('--traffic', default='DOWN-10M', help='Traffic profile')
    bridge_parser.add_argument('--eth-port', type=int, default=1, help='ETH port (1-4)')
    
    # Static IP command
    static_parser = subparsers.add_parser('static', help='Configure Static IP')
    static_parser.add_argument('onu_id', help='ONU ID')
    static_parser.add_argument('--ip', required=True, help='IP address')
    static_parser.add_argument('--mask', required=True, help='Subnet mask')
    static_parser.add_argument('--gateway', required=True, help='Default gateway')
    static_parser.add_argument('--dns1', default='8.8.8.8', help='Primary DNS')
    static_parser.add_argument('--dns2', default='8.8.4.4', help='Secondary DNS')
    static_parser.add_argument('--vlan', type=int, default=100, help='Service VLAN')
    
    # DHCP command
    dhcp_parser = subparsers.add_parser('dhcp', help='Configure DHCP mode')
    dhcp_parser.add_argument('onu_id', help='ONU ID')
    dhcp_parser.add_argument('--vlan', type=int, default=100, help='Service VLAN')
    dhcp_parser.add_argument('--tcont', default='UP-10M', help='TCONT profile')
    
    # WiFi command
    wifi_parser = subparsers.add_parser('wifi', help='Configure WiFi')
    wifi_parser.add_argument('onu_id', help='ONU ID')
    wifi_parser.add_argument('--ssid', required=True, help='WiFi SSID')
    wifi_parser.add_argument('--password', required=True, help='WiFi password')
    wifi_parser.add_argument('--ssid-id', type=int, default=1, help='SSID index (1-4)')
    wifi_parser.add_argument('--encryption', default='wpa2-psk', 
                            choices=['wpa2-psk', 'wpa-psk', 'wep', 'open'])
    wifi_parser.add_argument('--vlan', type=int, default=100, help='Bind VLAN')
    
    # LAN binding command
    lan_parser = subparsers.add_parser('lan-binding', help='Configure LAN binding')
    lan_parser.add_argument('onu_id', help='ONU ID')
    lan_parser.add_argument('--ports', nargs='+', type=int, default=[1,2,3,4], 
                           help='ETH ports to bind')
    lan_parser.add_argument('--vlan', type=int, default=100, help='Service VLAN')
    
    # Remote management command
    remote_parser = subparsers.add_parser('remote-mgmt', help='Configure remote management')
    remote_parser.add_argument('onu_id', help='ONU ID')
    remote_parser.add_argument('--vlan', type=int, required=True, help='Management VLAN')
    remote_parser.add_argument('--mode', default='dhcp', choices=['dhcp', 'static'])
    remote_parser.add_argument('--ip', help='IP address (for static mode)')
    remote_parser.add_argument('--mask', help='Subnet mask (for static mode)')
    remote_parser.add_argument('--gateway', help='Gateway (for static mode)')
    
    # TR-069 command
    tr069_parser = subparsers.add_parser('tr069', help='Configure TR-069/ACS')
    tr069_parser.add_argument('onu_id', help='ONU ID')
    tr069_parser.add_argument('--acs-url', required=True, help='ACS server URL')
    tr069_parser.add_argument('--acs-user', default='', help='ACS username')
    tr069_parser.add_argument('--acs-pass', default='', help='ACS password')
    tr069_parser.add_argument('--periodic', type=bool, default=True, help='Enable periodic inform')
    tr069_parser.add_argument('--interval', type=int, default=3600, help='Inform interval (seconds)')
    
    # TR-069 status
    tr069_status_parser = subparsers.add_parser('tr069-status', help='Show TR-069 status')
    tr069_status_parser.add_argument('onu_id', help='ONU ID')
    
    # Set name command
    name_parser = subparsers.add_parser('set-name', help='Set ONU name')
    name_parser.add_argument('onu_id', help='ONU ID')
    name_parser.add_argument('--name', required=True, help='ONU name')
    
    # Reboot command
    reboot_parser = subparsers.add_parser('reboot', help='Reboot ONU')
    reboot_parser.add_argument('onu_id', help='ONU ID')
    
    # Factory reset command
    reset_parser = subparsers.add_parser('factory-reset', help='Factory reset ONU')
    reset_parser.add_argument('onu_id', help='ONU ID')
    
    # Delete command
    delete_parser = subparsers.add_parser('delete', help='Delete ONU')
    delete_parser.add_argument('onu_id', help='ONU number')
    delete_parser.add_argument('--pon', default='1/1/1', help='PON port')
    
    return parser


def main():
    """Main function"""
    load_dotenv()
    config = OLTConfig.from_env()
    
    valid, msg = config.validate()
    if not valid:
        print(f"Error: {msg}")
        sys.exit(1)
    
    parser = create_parser()
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    # Connect to OLT
    print(f"Connecting to OLT {config.host}...")
    client = TelnetClient(config)
    
    if not client.connect():
        print("Failed to connect to OLT")
        sys.exit(1)
    
    print("Connected!")
    manager = ONUConfigManager(client)
    
    try:
        if args.command == 'status':
            print(f"\n=== ONU Status on PON {args.pon_port} ===")
            print(manager.show_onu_status(args.pon_port))
        
        elif args.command == 'detail':
            print(f"\n=== ONU Detail {args.onu_id} ===")
            print(manager.show_onu_detail(args.onu_id))
        
        elif args.command == 'config':
            print(f"\n=== ONU Config {args.onu_id} ===")
            print(manager.show_onu_running_config(args.onu_id))
        
        elif args.command == 'optical':
            print(f"\n=== ONU Optical Info {args.onu_id} ===")
            print(manager.show_onu_optical(args.onu_id))
        
        elif args.command == 'pppoe':
            success, msg = manager.configure_pppoe(
                args.onu_id,
                args.username,
                args.password,
                vlan=args.vlan,
                tcont_profile=args.tcont,
                traffic_profile=args.traffic
            )
            print(msg)
        
        elif args.command == 'bridge':
            success, msg = manager.configure_bridge(
                args.onu_id,
                vlan=args.vlan,
                tcont_profile=args.tcont,
                traffic_profile=args.traffic,
                eth_port=args.eth_port
            )
            print(msg)
        
        elif args.command == 'static':
            success, msg = manager.configure_static_ip(
                args.onu_id,
                args.ip,
                args.mask,
                args.gateway,
                dns1=args.dns1,
                dns2=args.dns2,
                vlan=args.vlan
            )
            print(msg)
        
        elif args.command == 'dhcp':
            success, msg = manager.configure_dhcp(
                args.onu_id,
                vlan=args.vlan,
                tcont_profile=args.tcont
            )
            print(msg)
        
        elif args.command == 'wifi':
            success, msg = manager.configure_wifi(
                args.onu_id,
                args.ssid,
                args.password,
                ssid_id=args.ssid_id,
                encryption=args.encryption,
                vlan=args.vlan
            )
            print(msg)
        
        elif args.command == 'lan-binding':
            success, msg = manager.configure_lan_binding(
                args.onu_id,
                eth_ports=args.ports,
                vlan=args.vlan
            )
            print(msg)
        
        elif args.command == 'remote-mgmt':
            success, msg = manager.configure_remote_management(
                args.onu_id,
                args.vlan,
                ip_mode=args.mode,
                ip_address=args.ip,
                netmask=args.mask,
                gateway=args.gateway
            )
            print(msg)
        
        elif args.command == 'tr069':
            success, msg = manager.configure_tr069(
                args.onu_id,
                args.acs_url,
                acs_username=args.acs_user,
                acs_password=args.acs_pass,
                periodic_inform=args.periodic,
                inform_interval=args.interval
            )
            print(msg)
        
        elif args.command == 'tr069-status':
            print(f"\n=== TR-069 Status {args.onu_id} ===")
            print(manager.show_tr069_status(args.onu_id))
        
        elif args.command == 'set-name':
            success, msg = manager.set_onu_name(args.onu_id, args.name)
            print(msg)
        
        elif args.command == 'reboot':
            success, msg = manager.reboot_onu(args.onu_id)
            print(msg)
        
        elif args.command == 'factory-reset':
            confirm = input(f"Factory reset ONU {args.onu_id}? (y/n): ").strip().lower()
            if confirm == 'y':
                success, msg = manager.factory_reset_onu(args.onu_id)
                print(msg)
            else:
                print("Cancelled")
        
        elif args.command == 'delete':
            confirm = input(f"Delete ONU {args.onu_id} from PON {args.pon}? (y/n): ").strip().lower()
            if confirm == 'y':
                success, msg = manager.delete_onu(args.onu_id, args.pon)
                print(msg)
            else:
                print("Cancelled")
    
    finally:
        client.disconnect()
        print("\nDisconnected from OLT")


if __name__ == "__main__":
    main()
