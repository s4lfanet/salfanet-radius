"""
OLT Configuration Manager
Script untuk mengelola konfigurasi OLT ZTE C320:
- TCONT Profile (add/delete/show)
- Traffic Profile (add/delete/show) 
- GEM Port
- VLAN
- Uplink
- Service Profile
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


class OLTConfigManager:
    """Manager untuk konfigurasi OLT ZTE C320"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
    
    # ==================== TCONT PROFILE ====================
    
    def show_tcont_profiles(self) -> str:
        """Show semua TCONT profile"""
        success, output = self.client.execute_command("show gpon profile tcont", timeout=10)
        return output if success else f"Error: {output}"
    
    def add_tcont_profile(self, name: str, type_id: int = 4, 
                          fixed_bw: int = 0, assured_bw: int = 0, 
                          max_bw: int = 1024000) -> tuple:
        """
        Add TCONT profile
        
        Args:
            name: Profile name (e.g., "10M", "20M", "100M")
            type_id: TCONT type (1-5, default 4=best effort)
            fixed_bw: Fixed bandwidth (kbps)
            assured_bw: Assured bandwidth (kbps)
            max_bw: Maximum bandwidth (kbps)
            
        TCONT Types:
        1: Fixed bandwidth
        2: Assured bandwidth
        3: Non-assured bandwidth
        4: Best effort
        5: Mixed (Fixed + Assured + Maximum)
        """
        print(f"Adding TCONT profile: {name}")
        
        # Enter config mode
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # Enter GPON mode
        self.client.execute_command("gpon", timeout=3)
        
        # ZTE C320 syntax dalam gpon mode: profile tcont <name> type <type> [fixed <bw>] [assured <bw>] maximum <bw>
        cmd = f"profile tcont {name} type {type_id}"
        if fixed_bw > 0:
            cmd += f" fixed {fixed_bw}"
        if assured_bw > 0:
            cmd += f" assured {assured_bw}"
        cmd += f" maximum {max_bw}"
        
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"TCONT profile '{name}' created (type {type_id}, max {max_bw} kbps)"
    
    def delete_tcont_profile(self, name: str) -> tuple:
        """Delete TCONT profile"""
        print(f"Deleting TCONT profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command("gpon", timeout=3)
        
        # ZTE C320 syntax: no profile tcont <name>
        success, output = self.client.execute_command(f"no profile tcont {name}", timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"TCONT profile '{name}' deleted"
    
    # ==================== TRAFFIC PROFILE ====================
    
    def show_traffic_profiles(self) -> str:
        """Show semua traffic profile (downstream bandwidth limit)"""
        # Use running-config to show traffic profiles
        success, output = self.client.execute_command("show running-config | include traffic", timeout=10)
        return output if success else f"Error: {output}"
    
    def add_traffic_profile(self, name: str, cir: int = 0, pir: int = 1024000, 
                            cbs: int = 0, pbs: int = 0) -> tuple:
        """
        Add traffic profile (bandwidth limit for downstream)
        
        Args:
            name: Profile name (e.g., "DOWN-10M", "DOWN-20M")
            cir: SIR - Sustained Information Rate (kbps)
            pir: PIR - Peak Information Rate (kbps)
        """
        print(f"Adding traffic profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command("gpon", timeout=3)
        
        # ZTE C320 syntax dalam gpon mode: profile traffic <name> sir <sir> pir <pir>
        success, output = self.client.execute_command(
            f"profile traffic {name} sir {cir if cir > 0 else pir} pir {pir}",
            timeout=5
        )
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Traffic profile '{name}' created (PIR {pir} kbps)"
    
    def delete_traffic_profile(self, name: str) -> tuple:
        """Delete traffic profile"""
        print(f"Deleting traffic profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command("gpon", timeout=3)
        
        success, output = self.client.execute_command(f"no profile traffic {name}", timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Traffic profile '{name}' deleted"
    
    # ==================== VLAN ====================
    
    def show_vlans(self) -> str:
        """Show semua VLAN"""
        success, output = self.client.execute_command("show vlan summary", timeout=10)
        return output if success else f"Error: {output}"
    
    def show_vlan_detail(self, vlan_id: int) -> str:
        """Show detail VLAN tertentu"""
        success, output = self.client.execute_command(f"show vlan {vlan_id}", timeout=10)
        return output if success else f"Error: {output}"
    
    def add_vlan(self, vlan_id: int, name: str = None) -> tuple:
        """
        Add VLAN
        
        Args:
            vlan_id: VLAN ID (2-4094)
            name: VLAN name (optional)
        """
        print(f"Adding VLAN: {vlan_id}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # Create VLAN
        success, output = self.client.execute_command(f"vlan {vlan_id}", timeout=5)
        
        if name and "%" not in output:
            self.client.execute_command(f"name {name}", timeout=3)
            self.client.execute_command("exit", timeout=3)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower() and "exist" not in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"VLAN {vlan_id} created"
    
    def delete_vlan(self, vlan_id: int) -> tuple:
        """Delete VLAN"""
        print(f"Deleting VLAN: {vlan_id}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"no vlan {vlan_id}", timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"VLAN {vlan_id} deleted"
    
    # ==================== UPLINK ====================
    
    def get_uplink_interfaces_list(self) -> list:
        """Get list of available uplink interfaces (GE and XGE)"""
        interfaces = []
        
        # Get all interfaces from running-config
        success, output = self.client.execute_command(
            "show running-config | include interface", timeout=10)
        
        if success:
            import re
            lines = output.split('\n')
            for line in lines:
                # Match gei_1/x/x or xgei_1/x/x interfaces
                match = re.search(r'interface\s+((?:x)?gei_1/\d+/\d+)', line)
                if match:
                    iface = match.group(1)
                    if iface not in interfaces:
                        interfaces.append(iface)
        
        # Sort interfaces (gei first, then xgei)
        interfaces.sort(key=lambda x: (0 if x.startswith('gei_') else 1, x))
        
        # If still empty, add common defaults
        if not interfaces:
            interfaces = [
                "gei_1/3/1", "gei_1/3/2", "gei_1/3/3",
                "xgei_1/3/1", "xgei_1/3/2",
                "gei_1/4/1", "gei_1/4/2", "gei_1/4/3",
                "xgei_1/4/1", "xgei_1/4/2"
            ]
        
        return interfaces
    
    def show_uplink_interfaces(self) -> str:
        """Show uplink interfaces (GE/XGE interfaces)"""
        # ZTE C320: show card untuk melihat slot
        success, output = self.client.execute_command("show card", timeout=15)
        if success:
            # Show running-config untuk interface uplink
            success2, output2 = self.client.execute_command(
                "show running-config | include gei_1", timeout=15)
            if success2:
                output = output + "\n\n=== GE Interfaces Config ===\n" + output2
        return output if success else f"Error: {output}"
    
    def show_uplink_config(self, interface: str) -> str:
        """Show running config untuk interface"""
        success, output = self.client.execute_command(
            f"show running-config interface {interface}", 
            timeout=10
        )
        return output if success else f"Error: {output}"
    
    def configure_uplink_vlan(self, interface: str, vlan_id: int, 
                               mode: str = "trunk") -> tuple:
        """
        Configure VLAN pada uplink interface
        
        Args:
            interface: Interface name (e.g., "gei_1/3/1", "xgei_1/3/2")
            vlan_id: VLAN ID
            mode: "trunk" atau "access"
        """
        print(f"Configuring VLAN {vlan_id} on {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # Enter interface
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        if mode == "trunk":
            # Trunk mode - allow VLAN (tagged)
            success, output = self.client.execute_command(f"switchport vlan {vlan_id} tag", timeout=3)
        else:
            # Access mode (untagged)
            success, output = self.client.execute_command(f"switchport default vlan {vlan_id}", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"VLAN {vlan_id} configured on {interface} ({mode})"
    
    def remove_uplink_vlan(self, interface: str, vlan_id: int) -> tuple:
        """Remove VLAN dari uplink interface"""
        print(f"Removing VLAN {vlan_id} from {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        # Try to remove tagged VLAN (trunk mode)
        success, output = self.client.execute_command(f"no switchport vlan {vlan_id} tag", timeout=3)
        
        # If failed, try to remove as default VLAN (access mode)
        if "%" in output and "error" in output.lower():
            success, output = self.client.execute_command(f"no switchport default vlan", timeout=3)
            if "%" in output and "error" in output.lower():
                # Last try: plain no switchport vlan
                success, output = self.client.execute_command(f"no switchport vlan {vlan_id}", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"VLAN {vlan_id} removed from {interface}"
    
    def show_interface_status(self, interface: str = None) -> str:
        """Show interface status (up/down, speed, duplex)"""
        if interface:
            success, output = self.client.execute_command(
                f"show interface {interface}", timeout=10)
        else:
            # Show all uplink interfaces status
            success, output = self.client.execute_command(
                "show interface brief", timeout=15)
        return output if success else f"Error: {output}"
    
    def shutdown_interface(self, interface: str) -> tuple:
        """Shutdown an interface (disable it)"""
        print(f"Shutting down interface {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        success, output = self.client.execute_command("shutdown", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Interface {interface} has been shutdown"
    
    def enable_interface(self, interface: str) -> tuple:
        """Enable an interface (no shutdown)"""
        print(f"Enabling interface {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        success, output = self.client.execute_command("no shutdown", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Interface {interface} has been enabled"
    
    # ==================== LINE PROFILE ====================
    
    def show_line_profiles(self) -> str:
        """Show semua line profile / ONU profiles"""
    def show_line_profiles(self) -> str:
        """Show semua line profile / ONU VLAN profile
        
        In ZTE C320, Line profiles are 'onu profile vlan' which defines
        VLAN tagging and service mappings for ONUs.
        """
        success, output = self.client.execute_command(
            "show running-config | include onu profile vlan", 
            timeout=10
        )
        return output if success else f"Error: {output}"
    
    def add_line_profile(self, name: str, vlan: int = 100, priority: int = 0) -> tuple:
        """
        Add line profile / ONU VLAN profile
        
        Args:
            name: Profile name
            vlan: VLAN ID (1-4094)
            priority: Priority (0-7)
        """
        print(f"Adding ONU VLAN profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("con t", timeout=3)
        
        # Enter gpon mode
        self.client.execute_command("gpon", timeout=3)
        
        # Create onu profile vlan
        # Format: onu profile vlan <name> tag-mode tag cvlan <vlan> [pri <priority>]
        cmd = f"onu profile vlan {name} tag-mode tag cvlan {vlan}"
        if priority > 0:
            cmd += f" pri {priority}"
        
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%error" in output.lower():
            return False, f"Failed: {output}"
        
        # Save config
        self.client.execute_command("write", timeout=10)
        
        return True, f"Line profile (onu profile vlan) '{name}' created with VLAN {vlan}"
    
    def delete_line_profile(self, name: str) -> tuple:
        """Delete line/ONU VLAN profile"""
        print(f"Deleting ONU VLAN profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("con t", timeout=3)
        
        # Enter gpon mode
        self.client.execute_command("gpon", timeout=3)
        
        success, output = self.client.execute_command(f"no onu profile vlan {name}", timeout=5)
        
        self.client.execute_command("end")
        
        if "%error" in output.lower():
            return False, f"Failed: {output}"
        
        # Save config
        self.client.execute_command("write", timeout=10)
        
        return True, f"Line profile '{name}' deleted"
    
    # ==================== SERVICE PROFILE ====================
    
    def show_service_profiles(self) -> str:
        """Show semua service profile (TCONT + Traffic profiles)
        
        In ZTE C320, Service profiles are the combination of:
        - TCONT profiles: Define bandwidth allocation
        - Traffic profiles: Define traffic shaping
        """
        print("\n=== TCONT Profiles (Upstream Bandwidth) ===")
        success1, tcont = self.client.execute_command(
            "show running-config | include profile tcont", 
            timeout=10
        )
        
        print("\n=== Traffic Profiles (Downstream Bandwidth) ===")
        success2, traffic = self.client.execute_command(
            "show running-config | include profile traffic", 
            timeout=10
        )
        
        if success1 and success2:
            return tcont + "\n\n" + traffic
        return "Error retrieving service profiles"
    
    def add_service_profile(self, name: str, profile_type: str = "tcont", 
                            **kwargs) -> tuple:
        """
        Add service profile (TCONT or Traffic profile)
        
        Args:
            name: Profile name
            profile_type: 'tcont' or 'traffic'
            **kwargs: Additional parameters
                For TCONT: type_id, fixed, assured, maximum
                For Traffic: sir, pir
        """
        self.client.execute_command("end")
        self.client.execute_command("con t", timeout=3)
        
        if profile_type.lower() == "tcont":
            # Add TCONT profile
            type_id = kwargs.get('type_id', 4)
            maximum = kwargs.get('maximum', 1024000)
            fixed = kwargs.get('fixed', 0)
            assured = kwargs.get('assured', 0)
            
            cmd = f"profile tcont {name} type {type_id}"
            if fixed > 0:
                cmd += f" fixed {fixed}"
            if assured > 0:
                cmd += f" assured {assured}"
            cmd += f" maximum {maximum}"
            
            print(f"Adding TCONT profile: {name}")
            success, output = self.client.execute_command(cmd, timeout=5)
            
        elif profile_type.lower() == "traffic":
            # Add Traffic profile
            sir = kwargs.get('sir', 102400)
            pir = kwargs.get('pir', 102400)
            
            cmd = f"profile traffic {name} sir {sir} pir {pir}"
            
            print(f"Adding Traffic profile: {name}")
            success, output = self.client.execute_command(cmd, timeout=5)
        else:
            self.client.execute_command("end")
            return False, f"Invalid profile type: {profile_type}. Use 'tcont' or 'traffic'"
        
        self.client.execute_command("end")
        
        if "%error" in output.lower():
            return False, f"Failed: {output}"
        
        # Save config
        self.client.execute_command("write", timeout=10)
        
        return True, f"Service profile ({profile_type}) '{name}' created"
    
    def delete_service_profile(self, name: str, profile_type: str = "tcont") -> tuple:
        """Delete service profile (TCONT or Traffic)
        
        Args:
            name: Profile name
            profile_type: 'tcont' or 'traffic'
        """
        print(f"Deleting {profile_type} profile: {name}")
        
        self.client.execute_command("end")
        self.client.execute_command("con t", timeout=3)
        
        if profile_type.lower() == "tcont":
            success, output = self.client.execute_command(f"no profile tcont {name}", timeout=5)
        elif profile_type.lower() == "traffic":
            success, output = self.client.execute_command(f"no profile traffic {name}", timeout=5)
        else:
            self.client.execute_command("end")
            return False, f"Invalid profile type: {profile_type}"
        
        self.client.execute_command("end")
        
        if "%error" in output.lower():
            return False, f"Failed: {output}"
        
        # Save config
        self.client.execute_command("write", timeout=10)
        
        return True, f"Service profile ({profile_type}) '{name}' deleted"
    
    # ==================== ONU TYPE ====================
    
    def show_onu_types(self) -> str:
        """Show semua ONU type yang tersedia"""
        # Increase timeout for long output with pagination
        success, output = self.client.execute_command("show onu-type gpon", timeout=30)
        return output if success else f"Error: {output}"
    
    def add_onu_type(self, name: str, description: str = None, 
                     max_tcont: int = 8, max_gemport: int = 32,
                     max_switch: int = 8, max_flow: int = 32,
                     max_iphost: int = 16, auto_save: bool = False) -> tuple:
        """
        Add ONU type baru
        
        Args:
            name: Nama ONU type (1-64 karakter)
            description: Deskripsi ONU type
            max_tcont: Maximum T-CONT (default: 8)
            max_gemport: Maximum GEM port (default: 32)
            max_switch: Maximum switch per slot (default: 8)
            max_flow: Maximum flow per switch (default: 32)
            max_iphost: Maximum IP host (default: 16)
            auto_save: Otomatis save configuration setelah add (default: False)
        
        Returns:
            tuple: (success: bool, message: str)
        
        Note:
            Add ONU type langsung efektif tanpa perlu reload cache.
            Configuration otomatis ter-update di running-config.
        """
        print(f"Adding ONU type '{name}'...")
        
        # Enter PON mode
        self.client.execute_command("configure terminal")
        success, output = self.client.execute_command("pon")
        
        if not success or "error" in output.lower():
            return False, f"Failed to enter PON mode: {output}"
        
        # Set description if provided
        if description:
            cmd = f"onu-type {name} gpon description {description}"
            success, output = self.client.execute_command(cmd)
            if not success:
                self.client.execute_command("exit")
                self.client.execute_command("exit")
                return False, f"Failed to set description: {output}"
        
        # Set max-tcont
        cmd = f"onu-type {name} gpon max-tcont {max_tcont}"
        success, output = self.client.execute_command(cmd)
        if not success:
            self.client.execute_command("exit")
            self.client.execute_command("exit")
            return False, f"Failed to set max-tcont: {output}"
        
        # Set max-gemport
        cmd = f"onu-type {name} gpon max-gemport {max_gemport}"
        success, output = self.client.execute_command(cmd)
        if not success:
            self.client.execute_command("exit")
            self.client.execute_command("exit")
            return False, f"Failed to set max-gemport: {output}"
        
        # Set max-switch-perslot
        cmd = f"onu-type {name} gpon max-switch-perslot {max_switch}"
        success, output = self.client.execute_command(cmd)
        
        # Set max-flow-perswitch
        cmd = f"onu-type {name} gpon max-flow-perswitch {max_flow}"
        success, output = self.client.execute_command(cmd)
        
        # Set max-iphost
        cmd = f"onu-type {name} gpon max-iphost {max_iphost}"
        success, output = self.client.execute_command(cmd)
        
        # Exit PON mode and config mode
        self.client.execute_command("exit")
        self.client.execute_command("exit")
        
        # Auto save if requested
        if auto_save:
            print("Auto-saving configuration...")
            save_success, save_msg = self.save_config()
            if not save_success:
                return True, f"ONU type '{name}' added but failed to save: {save_msg}"
        
        return True, f"ONU type '{name}' added successfully (changes applied immediately)"
    
    def delete_onu_type(self, name: str, auto_save: bool = False) -> tuple:
        """
        Delete ONU type
        
        Args:
            name: Nama ONU type yang akan dihapus
            auto_save: Otomatis save configuration setelah delete (default: False)
        
        Returns:
            tuple: (success: bool, message: str)
        
        Note:
            Delete ONU type langsung efektif tanpa perlu reload cache.
            Configuration otomatis ter-update di running-config.
        """
        print(f"Deleting ONU type '{name}'...")
        
        # Enter PON mode
        self.client.execute_command("configure terminal")
        success, output = self.client.execute_command("pon")
        
        if not success or "error" in output.lower():
            return False, f"Failed to enter PON mode: {output}"
        
        # Delete ONU type (without gpon keyword)
        cmd = f"no onu-type {name}"
        success, output = self.client.execute_command(cmd)
        
        # Exit PON mode and config mode
        self.client.execute_command("exit")
        self.client.execute_command("exit")
        
        if not success or "error" in output.lower():
            return False, f"Failed to delete ONU type: {output}"
        
        # Auto save if requested
        if auto_save:
            print("Auto-saving configuration...")
            save_success, save_msg = self.save_config()
            if not save_success:
                return True, f"ONU type '{name}' deleted but failed to save: {save_msg}"
        
        return True, f"ONU type '{name}' deleted successfully (changes applied immediately)"
    
    # ==================== SAVE CONFIG ====================
    
    def save_config(self) -> tuple:
        """Save running config"""
        print("Saving configuration...")
        self.client.execute_command("end")
        success, output = self.client.execute_command("write", timeout=15)
        
        if success and "%error" not in output.lower():
            return True, "Configuration saved"
        return False, f"Failed: {output}"
    
    # ==================== RUNNING CONFIG ====================
    
    def show_running_config(self, section: str = None) -> str:
        """
        Show running config
        
        Args:
            section: Optional section (e.g., "interface gpon-olt_1/1/1")
        """
        if section:
            cmd = f"show running-config {section}"
        else:
            cmd = "show running-config"
        
        # Increase timeout for complete running config (can be very large)
        success, output = self.client.execute_command(cmd, timeout=60)
        return output if success else f"Error: {output}"


def create_parser():
    """Create argument parser"""
    parser = argparse.ArgumentParser(
        description="OLT ZTE C320 Configuration Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Show TCONT profiles
  python olt_config_manager.py tcont show
  
  # Add TCONT profile 10M (10Mbps max)
  python olt_config_manager.py tcont add 10M --max 10240
  
  # Add TCONT profile 100M (100Mbps max)
  python olt_config_manager.py tcont add 100M --max 102400
  
  # Delete TCONT profile
  python olt_config_manager.py tcont delete 10M
  
  # Show VLANs
  python olt_config_manager.py vlan show
  
  # Add VLAN 200
  python olt_config_manager.py vlan add 200 --name Internet
  
  # Show traffic profiles
  python olt_config_manager.py traffic show
  
  # Add traffic profile
  python olt_config_manager.py traffic add 20M --pir 20480
  
  # Configure uplink VLAN
  python olt_config_manager.py uplink config gei_1/4/1 --vlan 100
  
  # Show all profiles
  python olt_config_manager.py show-all
  
  # Save configuration
  python olt_config_manager.py save
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # TCONT commands
    tcont_parser = subparsers.add_parser('tcont', help='TCONT profile management')
    tcont_sub = tcont_parser.add_subparsers(dest='action')
    
    tcont_show = tcont_sub.add_parser('show', help='Show TCONT profiles')
    
    tcont_add = tcont_sub.add_parser('add', help='Add TCONT profile')
    tcont_add.add_argument('name', help='Profile name')
    tcont_add.add_argument('--type', type=int, default=4, help='TCONT type (1-5, default 4)')
    tcont_add.add_argument('--fixed', type=int, default=0, help='Fixed bandwidth (kbps)')
    tcont_add.add_argument('--assured', type=int, default=0, help='Assured bandwidth (kbps)')
    tcont_add.add_argument('--max', type=int, default=1024000, help='Max bandwidth (kbps)')
    
    tcont_del = tcont_sub.add_parser('delete', help='Delete TCONT profile')
    tcont_del.add_argument('name', help='Profile name')
    
    # Traffic commands
    traffic_parser = subparsers.add_parser('traffic', help='Traffic profile management')
    traffic_sub = traffic_parser.add_subparsers(dest='action')
    
    traffic_show = traffic_sub.add_parser('show', help='Show traffic profiles')
    
    traffic_add = traffic_sub.add_parser('add', help='Add traffic profile')
    traffic_add.add_argument('name', help='Profile name')
    traffic_add.add_argument('--cir', type=int, default=0, help='CIR (kbps)')
    traffic_add.add_argument('--pir', type=int, default=1024000, help='PIR (kbps)')
    
    traffic_del = traffic_sub.add_parser('delete', help='Delete traffic profile')
    traffic_del.add_argument('name', help='Profile name')
    
    # VLAN commands
    vlan_parser = subparsers.add_parser('vlan', help='VLAN management')
    vlan_sub = vlan_parser.add_subparsers(dest='action')
    
    vlan_show = vlan_sub.add_parser('show', help='Show VLANs')
    vlan_show.add_argument('--id', type=int, help='VLAN ID for detail')
    
    vlan_add = vlan_sub.add_parser('add', help='Add VLAN')
    vlan_add.add_argument('id', type=int, help='VLAN ID')
    vlan_add.add_argument('--name', help='VLAN name')
    
    vlan_del = vlan_sub.add_parser('delete', help='Delete VLAN')
    vlan_del.add_argument('id', type=int, help='VLAN ID')
    
    # Uplink commands
    uplink_parser = subparsers.add_parser('uplink', help='Uplink management')
    uplink_sub = uplink_parser.add_subparsers(dest='action')
    
    uplink_show = uplink_sub.add_parser('show', help='Show uplink interfaces')
    uplink_show.add_argument('--interface', help='Interface name for detail')
    
    uplink_config = uplink_sub.add_parser('config', help='Configure uplink VLAN')
    uplink_config.add_argument('interface', help='Interface name (e.g., gei_1/4/1)')
    uplink_config.add_argument('--vlan', type=int, required=True, help='VLAN ID')
    uplink_config.add_argument('--mode', default='trunk', choices=['trunk', 'access'])
    
    uplink_remove = uplink_sub.add_parser('remove', help='Remove VLAN from uplink')
    uplink_remove.add_argument('interface', help='Interface name')
    uplink_remove.add_argument('--vlan', type=int, required=True, help='VLAN ID')
    
    # Line profile commands
    line_parser = subparsers.add_parser('line-profile', help='Line/VLAN profile management')
    line_sub = line_parser.add_subparsers(dest='action')
    
    line_show = line_sub.add_parser('show', help='Show line/VLAN profiles')
    
    line_add = line_sub.add_parser('add', help='Add line/VLAN profile')
    line_add.add_argument('name', help='Profile name (e.g., internet, pppoe, voip)')
    line_add.add_argument('--vlan', type=int, required=True, help='VLAN ID (1-4094)')
    line_add.add_argument('--priority', type=int, default=0, help='Priority (0-7)')
    
    line_del = line_sub.add_parser('delete', help='Delete line/VLAN profile')
    line_del.add_argument('name', help='Profile name')
    
    # Service profile commands
    srv_parser = subparsers.add_parser('srv-profile', help='Service profile management (TCONT/Traffic)')
    srv_sub = srv_parser.add_subparsers(dest='action')
    
    srv_show = srv_sub.add_parser('show', help='Show service profiles (TCONT + Traffic)')
    
    srv_add = srv_sub.add_parser('add', help='Add service profile')
    srv_add.add_argument('name', help='Profile name')
    srv_add.add_argument('--type', choices=['tcont', 'traffic'], required=True, 
                        help='Profile type: tcont (upstream) or traffic (downstream)')
    # TCONT arguments
    srv_add.add_argument('--tcont-type', type=int, default=4, choices=[1,2,3,4,5],
                        help='TCONT type (1-5), default: 4 (Best Effort)')
    srv_add.add_argument('--fixed', type=int, default=0, help='Fixed bandwidth (Kbps)')
    srv_add.add_argument('--assured', type=int, default=0, help='Assured bandwidth (Kbps)')
    srv_add.add_argument('--maximum', type=int, default=1024000, help='Maximum bandwidth (Kbps)')
    # Traffic arguments
    srv_add.add_argument('--sir', type=int, default=102400, help='SIR - Committed rate (Kbps)')
    srv_add.add_argument('--pir', type=int, default=102400, help='PIR - Peak rate (Kbps)')
    
    srv_del = srv_sub.add_parser('delete', help='Delete service profile')
    srv_del.add_argument('name', help='Profile name')
    srv_del.add_argument('--type', choices=['tcont', 'traffic'], required=True, 
                        help='Profile type to delete')
    
    # ONU Type
    subparsers.add_parser('onu-types', help='Show available ONU types')
    
    # Show all
    subparsers.add_parser('show-all', help='Show all profiles and VLANs')
    
    # Running config
    run_parser = subparsers.add_parser('running-config', help='Show running config')
    run_parser.add_argument('--section', help='Config section')
    
    # Save
    subparsers.add_parser('save', help='Save configuration')
    
    return parser


def main():
    """Main function"""
    load_dotenv()
    config = OLTConfig.from_env()
    
    valid, msg = config.validate()
    if not valid:
        print(f"Error: {msg}")
        print("Set environment variables di .env file")
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
    manager = OLTConfigManager(client)
    
    try:
        # Process commands
        if args.command == 'tcont':
            if args.action == 'show':
                print("\n=== TCONT Profiles ===")
                print(manager.show_tcont_profiles())
            elif args.action == 'add':
                success, msg = manager.add_tcont_profile(
                    args.name,
                    type_id=args.type,
                    fixed_bw=args.fixed,
                    assured_bw=args.assured,
                    max_bw=args.max
                )
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_tcont_profile(args.name)
                print(msg)
        
        elif args.command == 'traffic':
            if args.action == 'show':
                print("\n=== Traffic Profiles ===")
                print(manager.show_traffic_profiles())
            elif args.action == 'add':
                success, msg = manager.add_traffic_profile(
                    args.name,
                    cir=args.cir,
                    pir=args.pir
                )
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_traffic_profile(args.name)
                print(msg)
        
        elif args.command == 'vlan':
            if args.action == 'show':
                if hasattr(args, 'id') and args.id:
                    print(f"\n=== VLAN {args.id} Detail ===")
                    print(manager.show_vlan_detail(args.id))
                else:
                    print("\n=== VLANs ===")
                    print(manager.show_vlans())
            elif args.action == 'add':
                success, msg = manager.add_vlan(args.id, args.name)
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_vlan(args.id)
                print(msg)
        
        elif args.command == 'uplink':
            if args.action == 'show':
                if hasattr(args, 'interface') and args.interface:
                    print(f"\n=== {args.interface} Config ===")
                    print(manager.show_uplink_config(args.interface))
                else:
                    print("\n=== Interfaces ===")
                    print(manager.show_uplink_interfaces())
            elif args.action == 'config':
                success, msg = manager.configure_uplink_vlan(
                    args.interface,
                    args.vlan,
                    args.mode
                )
                print(msg)
            elif args.action == 'remove':
                success, msg = manager.remove_uplink_vlan(args.interface, args.vlan)
                print(msg)
        
        elif args.command == 'line-profile':
            if args.action == 'show':
                print("\n=== Line/VLAN Profiles ===")
                print(manager.show_line_profiles())
            elif args.action == 'add':
                success, msg = manager.add_line_profile(
                    args.name,
                    vlan=args.vlan,
                    priority=args.priority
                )
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_line_profile(args.name)
                print(msg)
        
        elif args.command == 'srv-profile':
            if args.action == 'show':
                print("\n=== Service Profiles (TCONT + Traffic) ===")
                print(manager.show_service_profiles())
            elif args.action == 'add':
                if args.type == 'tcont':
                    success, msg = manager.add_service_profile(
                        args.name, 
                        profile_type='tcont',
                        type_id=args.tcont_type,
                        fixed=args.fixed,
                        assured=args.assured,
                        maximum=args.maximum
                    )
                else:  # traffic
                    success, msg = manager.add_service_profile(
                        args.name,
                        profile_type='traffic',
                        sir=args.sir,
                        pir=args.pir
                    )
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_service_profile(args.name, profile_type=args.type)
                print(msg)
        
        elif args.command == 'onu-types':
            print("\n=== ONU Types ===")
            print(manager.show_onu_types())
        
        elif args.command == 'show-all':
            print("\n" + "="*60)
            print("=== TCONT Profiles ===")
            print(manager.show_tcont_profiles())
            time.sleep(0.5)
            
            print("\n=== Traffic Profiles ===")
            print(manager.show_traffic_profiles())
            time.sleep(0.5)
            
            print("\n=== Line Profiles ===")
            print(manager.show_line_profiles())
            time.sleep(0.5)
            
            print("\n=== Service Profiles ===")
            print(manager.show_service_profiles())
            time.sleep(0.5)
            
            print("\n=== VLANs ===")
            print(manager.show_vlans())
        
        elif args.command == 'running-config':
            print("\n=== Running Config ===")
            print(manager.show_running_config(args.section if hasattr(args, 'section') else None))
        
        elif args.command == 'save':
            success, msg = manager.save_config()
            print(msg)
    
    finally:
        client.disconnect()
        print("\nDisconnected from OLT")


if __name__ == "__main__":
    main()
