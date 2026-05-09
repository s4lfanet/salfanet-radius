"""
ZTE Command Handler
Menyediakan command-command spesifik untuk OLT ZTE C320 firmware 2.1+
"""
import logging
import time
from typing import Optional, List, Tuple
from core.telnet_client import TelnetClient
from config.olt_config import ZTEConstants

logger = logging.getLogger(__name__)


class ZTECommand:
    """Handler untuk command-command ZTE C320"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
    
    @staticmethod
    def normalize_interface(interface: str, for_onu: bool = False) -> str:
        """
        Normalize interface format untuk ZTE C320
        Input: gpon_olt-1/1/1 (dari discovery)
        Output: 
          - gpon-olt_1/1/1 (untuk register - PON port)
          - gpon-onu_1/1/1:X (untuk konfigurasi ONU - if for_onu=True)
        
        Format ZTE C320:
        - PON port: gpon-olt_1/{card}/{pon}
        - ONU port: gpon-onu_1/{card}/{pon}:{onu_id}
        """
        # Convert gpon_olt-1/2/3 -> gpon-olt_1/2/3
        if 'gpon_olt-' in interface:
            interface = interface.replace('gpon_olt-', 'gpon-olt_')
        elif 'gpon-olt-' in interface:
            interface = interface.replace('gpon-olt-', 'gpon-olt_')
        
        # Jika untuk ONU, convert olt -> onu
        if for_onu:
            interface = interface.replace('gpon-olt_', 'gpon-onu_')
        
        return interface
    
    def show_onu_uncfg(self, pon_port: Optional[str] = None) -> Tuple[bool, str]:
        """
        Show ONU unconfigured
        
        Args:
            pon_port: PON port spesifik (opsional), contoh: gpon_olt-1/1/1
            
        Returns:
            Tuple (success, output)
        """
        if pon_port:
            command = f"show pon onu uncfg {pon_port}"
        else:
            command = "show pon onu uncfg"
        
        logger.debug(f"Getting unconfigured ONUs: {command}")
        success, output = self.client.execute_command(
            command, 
            timeout=ZTEConstants.CMD_TIMEOUT_LONG
        )
        
        return success, output
    
    def show_running_config_interface(self, interface: str) -> Tuple[bool, str]:
        """
        Show running config untuk interface tertentu
        
        Args:
            interface: Interface name (contoh: gpon_olt-1/1/1)
            
        Returns:
            Tuple (success, output)
        """
        command = f"show running-config interface {interface}"
        success, output = self.client.execute_command(
            command,
            timeout=ZTEConstants.CMD_TIMEOUT_MEDIUM
        )
        return success, output
    
    def get_next_available_onu_id(self, pon_port: str) -> Optional[int]:
        """
        Mendapatkan ONU ID yang tersedia berikutnya pada PON port
        
        Args:
            pon_port: PON port (contoh: gpon_olt-1/1/1)
            
        Returns:
            ONU ID yang tersedia (1-128), atau None jika penuh
        """
        # Gunakan show gpon onu-info untuk mendapatkan ONU yang terdaftar
        # Format asli dari discovery: gpon_olt-1/1/1
        command = f"show gpon onu-info {pon_port}"
        success, output = self.client.execute_command(
            command,
            timeout=ZTEConstants.CMD_TIMEOUT_MEDIUM
        )
        
        if not success:
            logger.warning(f"Failed to get ONU info for {pon_port}, starting from ID 1")
            return ZTEConstants.MIN_ONU_ID  # Default ke 1
        
        # Parse ONU IDs yang sudah terpakai
        import re
        used_ids = set()
        
        # Pattern untuk ONU ID di output show gpon onu-info
        # Biasanya format: gpon_onu-1/1/1:1 atau onu 1
        patterns = [
            r'gpon[_-]onu[_-]\d+/\d+/\d+:(\d+)',  # gpon_onu-1/1/1:1
            r'onu\s+(\d+)\s+type',                 # onu 1 type
            r'^(\d+)\s+\w+',                       # Tabel dengan ID di kolom pertama
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, output, re.MULTILINE)
            for match in matches:
                try:
                    used_ids.add(int(match))
                except ValueError:
                    pass
        
        logger.debug(f"Used ONU IDs on {pon_port}: {sorted(used_ids) if used_ids else 'none'}")
        
        # Cari ID yang tersedia
        for onu_id in range(ZTEConstants.MIN_ONU_ID, ZTEConstants.MAX_ONU_PER_PON + 1):
            if onu_id not in used_ids:
                logger.debug(f"Next available ONU ID on {pon_port}: {onu_id}")
                return onu_id
        
        logger.error(f"No available ONU ID on {pon_port} (all {ZTEConstants.MAX_ONU_PER_PON} slots used)")
        return None
    
    def register_onu(
        self, 
        pon_port: str, 
        onu_id: int, 
        onu_type: str, 
        serial_number: str
    ) -> Tuple[bool, str]:
        """
        Register ONU pada PON port (Firmware 2.1+)
        
        Args:
            pon_port: PON port (contoh: gpon_olt-1/1/1)
            onu_id: ONU ID (1-128)
            onu_type: Tipe ONU (contoh: ZTE-F609)
            serial_number: Serial number ONU
            
        Returns:
            Tuple (success, message)
        """
        logger.info(f"Registering ONU {serial_number} as ID {onu_id} on {pon_port}")
        
        # Normalize interface format untuk PON port (gpon-olt_1/1/1)
        normalized_port = self.normalize_interface(pon_port, for_onu=False)
        logger.debug(f"Using normalized PON interface: {normalized_port}")
        
        # Enter config mode
        if not self.client.enter_config_mode():
            return False, "Failed to enter config mode"
        
        # Enter interface PON port
        if not self.client.enter_interface(normalized_port):
            self.client.exit_config_mode()
            return False, f"Failed to enter interface {normalized_port}"
        
        # Register ONU (syntax: "onu {id} type All sn {sn}")
        # Note: Type harus 'All' dengan huruf A kapital, bukan 'ALL'
        command = f"onu {onu_id} type All sn {serial_number}"
        success, output = self.client.execute_command(command, timeout=5)
        
        logger.debug(f"Registration command output: {output}")
        
        # Exit interface dan config mode
        self.client.execute_command("exit")
        self.client.exit_config_mode()
        
        # Check hasil
        if not success:
            return False, f"Command failed: {output}"
        
        # Check for errors in output
        output_lower = output.lower()
        if ZTEConstants.ERROR_ALREADY_EXISTS in output_lower:
            return False, "ONU already exists"
        elif ZTEConstants.ERROR_ONU_ID_CONFLICT in output_lower:
            return False, "ONU ID conflict"
        elif ZTEConstants.ERROR_INVALID_SN in output_lower:
            return False, "Invalid serial number"
        elif "%error" in output_lower:
            return False, f"Registration failed: {output}"
        elif "invalid" in output_lower:
            return False, f"Invalid parameter: {output}"
        
        # Verifikasi ONU terdaftar dengan show command
        time.sleep(1)
        verify_success = self._verify_onu_registered(pon_port, onu_id, serial_number)
        if not verify_success:
            logger.warning(f"ONU {serial_number} registration not verified, but continuing...")
        
        logger.info(f"ONU {serial_number} registered successfully as ID {onu_id}")
        return True, f"ONU registered successfully as ID {onu_id}"
    
    def _verify_onu_registered(self, pon_port: str, onu_id: int, serial_number: str) -> bool:
        """Verifikasi ONU sudah terdaftar"""
        # Try show gpon onu state
        normalized_port = self.normalize_interface(pon_port, for_onu=False)
        command = f"show gpon onu state {normalized_port}"
        success, output = self.client.execute_command(command, timeout=5)
        
        if success and serial_number in output:
            logger.debug(f"Verified: ONU {serial_number} found in {normalized_port}")
            return True
        
        # Try alternative command
        command = f"show running-config interface {normalized_port}"
        success, output = self.client.execute_command(command, timeout=5)
        
        if success and serial_number in output:
            logger.debug(f"Verified: ONU {serial_number} found in running-config")
            return True
        
        return False
    
    def configure_onu_profile(
        self,
        pon_port: str,
        onu_id: int,
        tcont_profile: str = "1G",
        tcont_id: int = 1,
        gemport_id: int = 1,
        user_vlan: int = 100,
        service_vlan: int = 100,
        service_port: int = 1,
        vport: int = 1
    ) -> Tuple[bool, str]:
        """
        Configure profile dan service binding untuk ONU
        
        Args:
            pon_port: PON port
            onu_id: ONU ID
            tcont_profile: TCONT profile name
            tcont_id: TCONT ID
            gemport_id: GEM port ID
            user_vlan: User VLAN
            service_vlan: Service VLAN
            service_port: Service port number
            vport: Virtual port number
            
        Returns:
            Tuple (success, message)
        """
        # Construct ONU interface name: gpon-onu_1/1/1:1 (berdasarkan template)
        # Normalize PON port dulu, lalu convert ke ONU
        normalized_base = self.normalize_interface(pon_port, for_onu=True)
        onu_interface = f"{normalized_base}:{onu_id}"
        
        logger.info(f"Configuring profile for {onu_interface}")
        
        # Make sure we're out of any config mode first
        self.client.execute_command("end")
        time.sleep(1)
        
        # Enter config mode
        if not self.client.enter_config_mode():
            return False, "Failed to enter config mode"
        
        # Enter ONU interface
        if not self.client.enter_interface(onu_interface):
            self.client.exit_config_mode()
            return False, f"Failed to enter interface {onu_interface}"
        
        # Configure TCONT with service name
        service_name = f"VLAN{user_vlan:04d}"
        success, output = self.client.execute_command(f"tcont {tcont_id} name {service_name} profile {tcont_profile}")
        if not success or "%" in output:
            # Fallback without name
            success, output = self.client.execute_command(f"tcont {tcont_id} profile {tcont_profile}")
            if not success:
                self.client.execute_command("exit")
                self.client.exit_config_mode()
                return False, f"Failed to configure TCONT: {output}"
        
        # Configure GEM port
        success, output = self.client.execute_command(f"gemport {gemport_id} tcont {tcont_id}")
        if not success:
            self.client.execute_command("exit")
            self.client.exit_config_mode()
            return False, f"Failed to configure GEM port: {output}"
        
        # Configure service port
        service_cmd = f"service-port {service_port} vport {vport} user-vlan {user_vlan} vlan {service_vlan}"
        success, output = self.client.execute_command(service_cmd)
        
        # Exit interface dan config mode
        self.client.execute_command("exit")
        self.client.exit_config_mode()
        
        if not success:
            return False, f"Failed to configure service port: {output}"
        
        logger.info(f"Profile configured successfully for {onu_interface}")
        return True, "Profile configured successfully"
    
    def delete_onu(self, pon_port: str, onu_id: int) -> Tuple[bool, str]:
        """
        Delete ONU dari PON port
        
        Args:
            pon_port: PON port
            onu_id: ONU ID
            
        Returns:
            Tuple (success, message)
        """
        logger.warning(f"Deleting ONU {onu_id} from {pon_port}")
        
        if not self.client.enter_config_mode():
            return False, "Failed to enter config mode"
        
        if not self.client.enter_interface(pon_port):
            self.client.exit_config_mode()
            return False, f"Failed to enter interface {pon_port}"
        
        success, output = self.client.execute_command(f"no onu {onu_id}")
        
        self.client.execute_command("exit")
        self.client.exit_config_mode()
        
        if success:
            logger.info(f"ONU {onu_id} deleted from {pon_port}")
            return True, "ONU deleted successfully"
        
        return False, f"Failed to delete ONU: {output}"
    
    def register_and_configure_onu_batch(
        self,
        frame: int,
        slot: int,
        port: int,
        onu_id: int,
        serial_number: str,
        tcont_profile: str = "client",
        user_vlan: int = 100
    ) -> Tuple[bool, str]:
        """
        Register dan configure ONU dalam satu batch command (seperti contoh autoregis.py)
        
        Args:
            frame: Frame number (biasanya 1)
            slot: Slot/card number
            port: PON port number
            onu_id: ONU ID
            serial_number: ONU serial number
            tcont_profile: TCONT profile name
            user_vlan: VLAN untuk service
            
        Returns:
            Tuple (success, message)
        """
        logger.info(f"Batch registering ONU {serial_number} as ID {onu_id} on gpon-olt_{frame}/{slot}/{port}")
        
        # Build batch command dengan format yang sesuai referensi
        # Format ZTE C320: gpon-olt_X/Y/Z untuk PON port, gpon-onu_X/Y/Z:N untuk ONU
        service_name = f"VLAN{user_vlan:04d}"
        config_command = (
            f"conf t\n"
            f"interface gpon-olt_{frame}/{slot}/{port}\n"
            f"onu {onu_id} type All sn {serial_number}\n"
            f"exit\n"
            f"interface gpon-onu_{frame}/{slot}/{port}:{onu_id}\n"
            f"tcont 1 name {service_name} profile {tcont_profile}\n"
            f"gemport 1 tcont 1\n"
            f"service-port 1 vport 1 user-vlan {user_vlan} vlan {user_vlan}\n"
            f"exit\n"
            f"end\n"
        )
        
        logger.debug(f"Executing batch command:\n{config_command}")
        
        # Execute batch command
        success, output = self.client.execute_command(config_command, timeout=10)
        
        logger.debug(f"Batch command output: {output}")
        
        # Check for errors
        if "%error" in output.lower() or "invalid" in output.lower():
            return False, f"Batch command failed: {output}"
        
        # Wait for OLT to process
        time.sleep(2)
        
        logger.info(f"ONU {serial_number} registered and configured as ID {onu_id}")
        return True, f"ONU registered and configured as ID {onu_id}"
    
    def parse_pon_port(self, pon_port: str) -> Tuple[int, int, int]:
        """
        Parse PON port string to frame, slot, port numbers
        
        Args:
            pon_port: PON port string (e.g., gpon_olt-1/1/1 or gpon-olt_1/1/1)
            
        Returns:
            Tuple (frame, slot, port)
        """
        import re
        # Match patterns like gpon_olt-1/1/1 or gpon-olt_1/1/1
        match = re.search(r'(\d+)/(\d+)/(\d+)', pon_port)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        return 1, 1, 1  # Default

    def register_onu_stepbystep(
        self,
        frame: int,
        slot: int,
        port: int,
        onu_id: int,
        serial_number: str,
        tcont_profile: str = "1G",
        user_vlan: int = 100
    ) -> Tuple[bool, str]:
        """
        Register ONU step by step berdasarkan template JSON
        
        Format command:
        1. interface gpon-olt_1/{slot}/{port}
        2. onu {id} type GPON sn {sn}
        3. exit
        4. interface gpon-onu_1/{slot}/{port}:{id}
        5. tcont 1 profile {profile}
        6. gemport 1 tcont 1
        7. service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
        """
        logger.info(f"Step-by-step registering ONU {serial_number} as ID {onu_id}")
        
        # Step 1: End any previous mode
        self.client.execute_command("end")
        time.sleep(0.5)
        
        # Step 2: Enter config mode
        success, output = self.client.execute_command("con t", timeout=3)
        if "error" in output.lower():
            return False, f"Failed to enter config mode: {output}"
        
        # Step 3: Enter PON interface - format: gpon-olt_1/{slot}/{port}
        pon_interface = f"gpon-olt_{frame}/{slot}/{port}"
        success, output = self.client.execute_command(f"interface {pon_interface}", timeout=3)
        logger.debug(f"Enter PON interface result: {output}")
        if "%error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter PON interface {pon_interface}: {output}"
        
        # Step 4: Register ONU - format: onu {id} type All sn {sn}
        # Type 'All' adalah universal type yang support semua ONU
        success, output = self.client.execute_command(f"onu {onu_id} type All sn {serial_number}", timeout=5)
        logger.debug(f"Register ONU result: {output}")
        if "%error" in output.lower():
            self.client.execute_command("exit")
            self.client.execute_command("end")
            return False, f"Failed to register ONU: {output}"
        
        # Step 5: Exit PON interface
        self.client.execute_command("exit")
        
        # Wait for ONU to be registered
        time.sleep(2)
        
        # Step 6: Enter ONU interface - format: gpon-onu_1/{slot}/{port}:{id}
        onu_interface = f"gpon-onu_{frame}/{slot}/{port}:{onu_id}"
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        logger.debug(f"Enter ONU interface result: {output}")
        if "%error" in output.lower():
            # ONU interface not ready yet, but registration might have succeeded
            logger.warning(f"ONU interface {onu_interface} not accessible yet, skipping profile config")
            self.client.execute_command("end")
            return True, f"ONU registered as ID {onu_id} (profile config skipped)"
        
        # Step 7: Configure TCONT - format: tcont 1 name VLAN{vlan} profile {profile}
        service_name = f"VLAN{user_vlan:04d}"
        success, output = self.client.execute_command(f"tcont 1 name {service_name} profile {tcont_profile}", timeout=3)
        logger.debug(f"TCONT config result: {output}")
        if "%" in output:
            # Fallback without name
            self.client.execute_command(f"tcont 1 profile {tcont_profile}", timeout=3)
        
        # Step 8: Configure GEM port - format: gemport 1 tcont 1
        success, output = self.client.execute_command("gemport 1 tcont 1", timeout=3)
        logger.debug(f"GEM port config result: {output}")
        
        # Step 9: Configure service port - format: service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
        success, output = self.client.execute_command(
            f"service-port 1 vport 1 user-vlan {user_vlan} vlan {user_vlan}", 
            timeout=3
        )
        logger.debug(f"Service port config result: {output}")
        
        # Step 10: Exit and end
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        logger.info(f"ONU {serial_number} registered and configured as ID {onu_id}")
        return True, f"ONU registered and configured as ID {onu_id}"
    
    def configure_onu_pppoe(
        self,
        pon_port: str,
        onu_id: int,
        pppoe_username: str,
        pppoe_password: str,
        vlan: int = 100,
        paket: str = "20M"
    ) -> Tuple[bool, str]:
        """
        Configure PPPOE untuk ONU (berdasarkan template JSON)
        
        Commands:
        1. interface gpon-onu_1/X/Y:Z - set name, tcont, gemport, service-port
        2. pon-onu-mng gpon-onu_1/X/Y:Z - set service, wan-ip PPPOE
        
        Args:
            pon_port: PON port string
            onu_id: ONU ID
            pppoe_username: PPPOE username
            pppoe_password: PPPOE password
            vlan: VLAN for service
            paket: Traffic profile name
        """
        frame, slot, port = self.parse_pon_port(pon_port)
        onu_interface = f"gpon-onu_{frame}/{slot}/{port}:{onu_id}"
        
        logger.info(f"Configuring PPPOE for {onu_interface}")
        
        # End any previous mode
        self.client.execute_command("end")
        time.sleep(0.5)
        
        # Enter config mode
        success, output = self.client.execute_command("con t", timeout=3)
        if "%error" in output.lower():
            return False, f"Failed to enter config mode: {output}"
        
        # Enter ONU interface
        success, output = self.client.execute_command(f"interface {onu_interface}", timeout=3)
        if "%error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter ONU interface: {output}"
        
        # Set ONU name
        self.client.execute_command(f"name {pppoe_username}")
        
        # Configure TCONT with paket profile
        self.client.execute_command(f"tcont 1 profile {paket}")
        
        # Configure GEM port
        self.client.execute_command("gemport 1 tcont 1")
        
        # Configure traffic limit downstream
        self.client.execute_command(f"gemport 1 traffic-limit downstream {paket}")
        
        # Configure service port
        self.client.execute_command(f"service-port 1 vport 1 user-vlan {vlan} vlan {vlan}")
        
        # Exit interface
        self.client.execute_command("exit")
        
        # Enter pon-onu-mng mode for advanced config
        success, output = self.client.execute_command(f"pon-onu-mng {onu_interface}", timeout=3)
        if "%error" in output.lower():
            logger.warning(f"Failed to enter pon-onu-mng: {output}")
            self.client.execute_command("end")
            return True, "Basic config done, PPPOE management config skipped"
        
        # Configure service
        self.client.execute_command(f"service INTERNET gemport 1 vlan {vlan}")
        
        # Configure WAN IP PPPOE
        self.client.execute_command(
            f"wan-ip 1 mode pppoe username {pppoe_username} password {pppoe_password} vlan-profile {vlan} host 1"
        )
        
        # Exit and end
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        logger.info(f"PPPOE configured for {onu_interface}")
        return True, "PPPOE configured successfully"
    
    def save_config(self) -> Tuple[bool, str]:
        """
        Save running config ke startup config
        """
        logger.info("Saving configuration...")
        self.client.execute_command("end")
        success, output = self.client.execute_command("write", timeout=10)
        
        if success and "error" not in output.lower():
            logger.info("Configuration saved")
            return True, "Configuration saved"
        
        return False, f"Failed to save config: {output}"
