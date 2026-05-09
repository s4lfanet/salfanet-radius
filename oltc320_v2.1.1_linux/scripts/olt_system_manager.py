"""
OLT System Configuration Manager
Script untuk mengelola konfigurasi sistem OLT ZTE C320:
- SNMP Community (show/add/delete)
- System Info
- NTP Configuration
- Syslog Configuration
- User Management
- Interface Configuration
- ACL Configuration
- TR-069 ACS Global Configuration
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


class OLTSystemManager:
    """Manager untuk konfigurasi sistem OLT ZTE C320"""
    
    def __init__(self, client: TelnetClient):
        self.client = client
    
    # ==================== SYSTEM INFO ====================
    
    def get_system_info(self) -> dict:
        """Get system info as dictionary"""
        info = {
            "hostname": "Unknown",
            "uptime": "Unknown",
            "version": "Unknown"
        }
        
        try:
            # Hostname (Try 'show hostname' or parse prompt)
            success, output = self.client.execute_command("show hostname", timeout=5)
            if success and output and "%" not in output:
                info["hostname"] = output.strip()
            elif success:
                 # Fallback: try from running config
                 success, output = self.client.execute_command("show running-config | include hostname", timeout=5)
                 if success and "hostname" in output:
                     info["hostname"] = output.split("hostname")[-1].strip()

            # Version
            success, output = self.client.execute_command("show version", timeout=5)
            if success and "%" not in output:
                # Extract version info
                for line in output.split('\n'):
                    if "Software Version" in line:
                        info["version"] = line.split(':')[-1].strip()
                        
            # Uptime (from show system-group)
            success, output = self.client.execute_command("show system-group", timeout=5)
            if success and "%" not in output and "System Uptime" in output:
                for line in output.split('\n'):
                    if "System Uptime" in line:
                        info["uptime"] = line.split('is')[-1].strip()
            
            # If uptime still unknown, try 'show processor' which usually contains uptime
            if info["uptime"] == "Unknown":
                success, output = self.client.execute_command("show processor", timeout=5)
                if success and "%" not in output:
                     for line in output.split('\n'):
                        if "System Uptime" in line:
                             info["uptime"] = line.split('is')[-1].strip()

            # If still unknown, try 'show system-time' as last resort
            if info["uptime"] == "Unknown":
                success, output = self.client.execute_command("show system-time", timeout=5)
                if success and "%" not in output:
                    info["uptime"] = output.strip()
                        
        except Exception as e:
            print(f"Error getting system info: {e}")
            
        return info

    def show_system_info(self) -> str:
        """Show system information (Version & Hostname only)"""
        results = []
        
        # Software version from config
        success, output = self.client.execute_command("show running-config | include version", timeout=10)
        if success and "%" not in output:
            results.append("=== Software Version ===\n" + output)
        
        # Hostname
        success, output = self.client.execute_command("show hostname", timeout=10)
        if success and "%" not in output:
            results.append("\n=== Hostname ===\n" + output)
        
        return "\n".join(results) if results else "Error: Could not retrieve system info"
    
    def show_system_status(self) -> str:
        """Show comprehensive system overview (uptime, interfaces, resources)"""
        results = []
        
        # System uptime and basic info
        success, output = self.client.execute_command("show system-group", timeout=10)
        if success and "%" not in output and "Error" not in output:
            results.append("=== System Group Info ===\n" + output)
        else:
            # Fallback to show version for basic info
            success, output = self.client.execute_command("show version", timeout=10)
            if success and "%" not in output:
                results.append("=== System Version ===\n" + output)
        
        # Environment status (temperature, fans, power) if available
        success, output = self.client.execute_command("show environment", timeout=10)
        if success and "%" not in output and "Error" not in output and output.strip():
            results.append("\n=== Environment Status ===\n" + output)
        
        # Interface summary
        success, output = self.client.execute_command("show interface brief", timeout=10)
        if success and "%" not in output and "Error" not in output:
            results.append("\n=== Interface Summary ===\n" + output)
        
        return "\n".join(results) if results else "Error: Could not retrieve system overview"
    
    def show_card_status(self) -> str:
        """Show card status"""
        success, output = self.client.execute_command("show card", timeout=10)
        return output if success else f"Error: {output}"
    
    def show_alarm(self) -> str:
        """Show active alarms"""
        results = []
        
        # Show current active alarms
        success, output = self.client.execute_command("show alarm crtv-active", timeout=10)
        if success and "%" not in output and "Error" not in output:
            results.append("=== Active Alarms ===\n" + (output.strip() if output.strip() else "No active alarms"))
        
        # Show alarm events
        success, output = self.client.execute_command("show alarm crtv-event", timeout=10)
        if success and "%" not in output and "Error" not in output and output.strip():
            results.append("\n=== Recent Alarm Events ===\n" + output.strip())
        
        return "\n".join(results) if results else "No alarm information available"
    
    # ==================== SNMP CONFIGURATION ====================
    
    def show_snmp(self) -> str:
        """Show SNMP configuration"""
        success, output = self.client.execute_command("show snmp", timeout=10)
        if not success or "%" in output:
            # Try alternative
            success, output = self.client.execute_command(
                "show running-config | include snmp", timeout=10
            )
        return output if success else f"Error: {output}"
    
    def show_snmp_community(self) -> str:
        """Show SNMP community strings"""
        # ZTE C320 doesn't have 'show snmp community' command
        # Use running-config instead
        success, output = self.client.execute_command(
            "show running-config | include community", timeout=10
        )
        return output if success else f"Error: Could not retrieve SNMP communities"
    
    def add_snmp_community(self, community: str, permission: str = "ro",
                           acl: str = None) -> tuple:
        """
        Add SNMP community
        
        Args:
            community: Community string
            permission: "ro" (read-only) or "rw" (read-write)
            acl: Access list name (optional, used as view name)
        """
        print(f"Adding SNMP community: {community} ({permission})")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # ZTE C320 syntax: snmp-server community <name> [view <viewname>] ro|rw
        cmd = f"snmp-server community {community}"
        if acl:
            cmd += f" view {acl}"
        else:
            cmd += " view AllView"  # Default view
        cmd += f" {permission}"
        
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"SNMP community '{community}' added"
    
    def delete_snmp_community(self, community: str, permission: str = "ro") -> tuple:
        """Delete SNMP community (permission parameter kept for compatibility but not used in command)"""
        print(f"Deleting SNMP community: {community}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # ZTE C320 syntax: no snmp-server community <name>
        # Note: Does NOT require ro/rw specification
        success, output = self.client.execute_command(
            f"no snmp-server community {community}", timeout=5
        )
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"SNMP community '{community}' deleted"
    
    def enable_snmp(self) -> tuple:
        """Enable SNMP agent (Note: ZTE C320 has SNMP enabled by default)"""
        # ZTE C320 does not have explicit enable/disable SNMP command
        # SNMP is enabled by default when communities are configured
        print("Note: ZTE C320 SNMP is enabled by default.")
        print("Add SNMP communities to configure access.")
        return True, "SNMP is enabled by default on ZTE C320"
    
    def disable_snmp(self) -> tuple:
        """Disable SNMP agent (Note: ZTE C320 requires removing all communities instead)"""
        # ZTE C320 does not have explicit disable command
        # To disable SNMP, remove all community strings
        print("Note: ZTE C320 does not have 'disable SNMP' command.")
        print("To restrict SNMP access, delete all SNMP communities.")
        return True, "To disable SNMP, delete all community strings"
    
    def set_snmp_contact(self, contact: str) -> tuple:
        """Set SNMP contact info"""
        print(f"Setting SNMP contact: {contact}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(
            f"snmp-server contact {contact}", timeout=5
        )
        
        self.client.execute_command("end")
        
        return True, f"SNMP contact set to '{contact}'"
    
    def set_snmp_location(self, location: str) -> tuple:
        """Set SNMP location info"""
        print(f"Setting SNMP location: {location}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(
            f"snmp-server location {location}", timeout=5
        )
        
        self.client.execute_command("end")
        
        return True, f"SNMP location set to '{location}'"
    
    def add_snmp_trap_host(self, host: str, community: str, 
                          port: int = 162, version: str = "2c") -> tuple:
        """
        Add SNMP trap host
        
        Args:
            host: Trap receiver IP address
            community: Community string
            port: Trap port (default 162)
            version: SNMP version (1, 2c, 3)
        """
        print(f"Adding SNMP trap host: {host}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # ZTE C320 syntax: snmp-server host <ip> <community>
        cmd = f"snmp-server host {host} {community}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"SNMP trap host {host} added"
    
    # ==================== NTP CONFIGURATION ====================
    
    def show_ntp(self) -> str:
        """Show NTP configuration"""
        success, output = self.client.execute_command("show ntp status", timeout=10)
        if not success or "%" in output:
            success, output = self.client.execute_command(
                "show running-config | include ntp", timeout=10
            )
        return output if success else f"Error: {output}"
    
    def enable_ntp(self) -> tuple:
        """Enable NTP service"""
        import re
        
        print("Enabling NTP...")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command("ntp enable", timeout=5)
        
        self.client.execute_command("end")
        
        # Check for errors
        if "%" in output:
            error_match = re.search(r'%.*', output)
            if error_match:
                error_msg = error_match.group(0)
                return False, f"Failed: {error_msg}"
        
        return True, "NTP service enabled successfully"
    
    def disable_ntp(self) -> tuple:
        """Disable NTP service"""
        import re
        
        print("Disabling NTP...")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command("no ntp enable", timeout=5)
        
        self.client.execute_command("end")
        
        # Check for errors
        if "%" in output:
            error_match = re.search(r'%.*', output)
            if error_match:
                error_msg = error_match.group(0)
                return False, f"Failed: {error_msg}"
        
        return True, "NTP service disabled successfully"
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, "NTP disabled"
    
    def set_ntp_server(self, server: str, prefer: bool = False) -> tuple:
        """
        Set NTP server - ZTE C320 uses 'ntp server <ip> priority <n>'
        Note: Requires IP address, not hostname
        """
        import socket
        import re
        
        print(f"Setting NTP server: {server}")
        
        # Resolve hostname to IP if needed
        ip_address = server
        try:
            # Try to resolve if it's a hostname
            if not server.replace('.', '').isdigit():  # Not an IP
                print(f"Resolving hostname {server}...")
                ip_address = socket.gethostbyname(server)
                print(f"Resolved to: {ip_address}")
        except socket.gaierror as e:
            return False, f"Failed to resolve hostname {server}: {e}"
        
        # Check if server already exists
        self.client.execute_command("end")
        success_check, assoc_output = self.client.execute_command("show ntp associations", timeout=5)
        
        # Parse existing servers and priorities
        used_priorities = set()
        existing_server = False
        for line in assoc_output.split('\n'):
            if 'Remote address' in line:
                remote_ip = line.split(':')[-1].strip()
                if remote_ip == ip_address:
                    existing_server = True
            if 'Priority' in line and ':' in line:
                try:
                    prio = int(line.split(':')[-1].strip())
                    used_priorities.add(prio)
                except:
                    pass
        
        if existing_server:
            return False, f"NTP server {ip_address} already configured"
        
        # Find available priority
        if prefer:
            # Try priorities 1-3 for preferred servers
            available_priority = None
            for p in range(1, 4):
                if p not in used_priorities:
                    available_priority = p
                    break
            if available_priority is None:
                return False, "All priority slots (1-3) are in use. Please delete a server first."
        else:
            # Try priorities 5-10 for non-preferred
            available_priority = None
            for p in range(5, 11):
                if p not in used_priorities:
                    available_priority = p
                    break
            if available_priority is None:
                return False, "All priority slots (5-10) are in use. Please delete a server first."
        
        self.client.execute_command("configure terminal", timeout=3)
        
        # Enable NTP first
        self.client.execute_command("ntp enable", timeout=3)
        
        # ZTE C320 syntax: ntp server <ip> priority <1-10>
        cmd = f"ntp server {ip_address} priority {available_priority}"
        
        print(f"Executing: {cmd}")
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        # Check for errors
        if "%" in output:
            error_match = re.search(r'%.*', output)
            if error_match:
                error_msg = error_match.group(0)
                return False, f"Failed: {error_msg}"
        
        return True, f"NTP server {server} ({ip_address}) configured with priority {available_priority}"
    
    def delete_ntp_server(self, server: str) -> tuple:
        """Delete NTP server"""
        import socket
        
        print(f"Deleting NTP server: {server}")
        
        # Resolve hostname to IP if needed
        ip_address = server
        try:
            if not server.replace('.', '').isdigit():
                ip_address = socket.gethostbyname(server)
        except:
            pass  # Use original if resolution fails
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # ZTE C320: no ntp server <ip>
        success, output = self.client.execute_command(
            f"no ntp server {ip_address}", timeout=5
        )
        
        self.client.execute_command("end")
        
        return True, f"NTP server {server} removed"
    
    def show_clock(self) -> str:
        """Show current system time - try multiple commands"""
        # Try different clock commands
        commands = [
            "show clock",
            "show system-time",
            "show time",
            "display clock"
        ]
        
        for cmd in commands:
            success, output = self.client.execute_command(cmd, timeout=5)
            # If command succeeds and has actual time info
            if success and "%" not in output and "invalid" not in output.lower() and output.strip():
                return output
        
        # If all failed, return error
        return "Error: Unable to retrieve system time. OLT may not support clock display command."
    
    def set_clock(self, datetime_obj=None) -> tuple:
        """
        Set system clock time
        Format: clock set HH:MM:SS month DD YYYY
        Example: clock set 14:05:00 feb 5 2026
        
        Args:
            datetime_obj: datetime object. If None, uses current system time
        """
        from datetime import datetime
        
        if datetime_obj is None:
            datetime_obj = datetime.now()
        
        # Month names mapping
        month_names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        month = month_names[datetime_obj.month - 1]
        
        # Build command: clock set HH:MM:SS month DD YYYY
        cmd = (f"clock set {datetime_obj.hour:02d}:{datetime_obj.minute:02d}:"
               f"{datetime_obj.second:02d} {month} {datetime_obj.day} {datetime_obj.year}")
        
        print(f"Setting clock: {cmd}")
        
        self.client.execute_command("end")
        success, output = self.client.execute_command(cmd, timeout=5)
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        # Verify
        success2, verify = self.client.execute_command("show clock", timeout=3)
        
        return True, f"Clock set successfully. Current time: {verify.strip()}"
    
    def set_timezone(self, timezone: str, offset: int = 0) -> tuple:
        """
        Set timezone
        
        Args:
            timezone: Timezone name (e.g., "WIB", "UTC", "GMT")
            offset: Offset from UTC in hours (e.g., 7 for WIB)
        """
        print(f"Setting timezone: {timezone} (UTC+{offset})")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # clock timezone <name> <offset>
        cmd = f"clock timezone {timezone} {offset}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Timezone set to {timezone} (UTC+{offset})"
    
    # ==================== SYSLOG CONFIGURATION ====================
    
    def show_syslog(self) -> str:
        """Show syslog configuration"""
        success, output = self.client.execute_command(
            "show running-config | include syslog", timeout=10
        )
        return output if success else f"Error: {output}"
    
    def add_syslog_server(self, server: str, facility: str = "local0",
                          level: str = "informational") -> tuple:
        """
        Add syslog server
        
        Args:
            server: Syslog server IP
            facility: Syslog facility
            level: Log level (emergencies, alerts, critical, errors, 
                   warnings, notifications, informational, debugging)
        """
        print(f"Adding syslog server: {server}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # syslog host <ip> [facility <fac>] [level <level>]
        cmd = f"syslog host {server} facility {facility} level {level}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Syslog server {server} added"
    
    def delete_syslog_server(self, server: str) -> tuple:
        """Delete syslog server"""
        print(f"Deleting syslog server: {server}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"no syslog host {server}", timeout=5)
        
        self.client.execute_command("end")
        
        return True, f"Syslog server {server} removed"
    
    # ==================== USER MANAGEMENT ====================
    
    def show_users(self) -> str:
        """Show configured users - filter only actual username entries"""
        success, output = self.client.execute_command(
            "show running-config | include username", timeout=10
        )
        if not success:
            return f"Error: {output}"
        
        # Filter only lines that start with 'username' (actual user entries)
        # Ignore lines like 'user-suspend', 'high-level-security', etc.
        user_lines = []
        for line in output.split('\n'):
            line = line.strip()
            # Valid user line starts with 'username' followed by space and name
            if line.startswith('username ') and 'password' in line:
                user_lines.append(line)
        
        if user_lines:
            return '\n'.join(user_lines)
        return "No users configured"
    
    def add_user(self, username: str, password: str, 
                 privilege: int = 15) -> tuple:
        """
        Add user account
        
        Args:
            username: Username
            password: Password
            privilege: Privilege level (0-15, default 15=admin)
        """
        print(f"Adding user: {username}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # username <name> password <pass> [privilege <level>]
        cmd = f"username {username} password {password} privilege {privilege}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"User '{username}' added"
    
    def delete_user(self, username: str) -> tuple:
        """Delete user account"""
        print(f"Deleting user: {username}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"no username {username}", timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"User '{username}' deleted"
    
    def change_password(self, username: str, password: str) -> tuple:
        """Change user password"""
        print(f"Changing password for: {username}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        cmd = f"username {username} password {password}"
        success, output = self.client.execute_command(cmd, timeout=5)
        
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"Password changed for '{username}'"
    
    # ==================== HOSTNAME & BANNER ====================
    
    def set_hostname(self, hostname: str) -> tuple:
        """Set system hostname"""
        print(f"Setting hostname: {hostname}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"hostname {hostname}", timeout=5)
        
        self.client.execute_command("end")
        
        return True, f"Hostname set to '{hostname}'"
    
    def set_banner(self, banner_text: str) -> tuple:
        """Set login banner"""
        print("Setting login banner...")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        # banner login <text>
        success, output = self.client.execute_command(f"banner login {banner_text}", timeout=5)
        
        self.client.execute_command("end")
        
        return True, "Login banner set"
    
    # ==================== INTERFACE MANAGEMENT ====================
    
    def show_interface_status(self, interface: str = None) -> str:
        """Show interface status"""
        if interface:
            # Show specific interface (e.g., gpon-olt_1/1/1)
            success, output = self.client.execute_command(f"show interface {interface}", timeout=15)
            if success and "%" not in output and "Error" not in output:
                return output
            
            # Try running-config as fallback
            success, output = self.client.execute_command(f"show running-config interface {interface}", timeout=15)
            return output if success else f"Error: Could not retrieve status for {interface}"
        else:
            # Show all GPON interfaces (iterate through known ports)
            results = []
            results.append("=== All GPON Interfaces ===\n")
            
            # Try to get interfaces from card info first
            success, card_output = self.client.execute_command("show card", timeout=10)
            if success:
                results.append(card_output)
            
            # Try common interfaces (adjust based on your card config)
            for port in range(1, 17):  # Assuming max 16 PON ports per card
                cmd = f"show running-config interface gpon-olt_1/1/{port}"
                success, output = self.client.execute_command(cmd, timeout=5)
                if success and "%" not in output and "Error" not in output and "Invalid" not in output:
                    results.append(f"\n--- Port 1/1/{port} ---\n{output}")
            
            return "\n".join(results) if len(results) > 1 else "No GPON interfaces found"
    
    def set_interface_ip(self, interface: str, ip_address: str, 
                         netmask: str) -> tuple:
        """Set IP address on interface"""
        print(f"Setting IP {ip_address}/{netmask} on {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed to enter interface: {output}"
        
        success, output = self.client.execute_command(
            f"ip address {ip_address} {netmask}", timeout=5
        )
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        if "%" in output and "error" in output.lower():
            return False, f"Failed: {output}"
        
        return True, f"IP {ip_address}/{netmask} set on {interface}"
    
    def shutdown_interface(self, interface: str) -> tuple:
        """Shutdown interface"""
        print(f"Shutting down {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed: {output}"
        
        self.client.execute_command("shutdown", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Interface {interface} shutdown"
    
    def no_shutdown_interface(self, interface: str) -> tuple:
        """Enable interface (no shutdown)"""
        print(f"Enabling {interface}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        
        success, output = self.client.execute_command(f"interface {interface}", timeout=3)
        if "%" in output and "error" in output.lower():
            self.client.execute_command("end")
            return False, f"Failed: {output}"
        
        self.client.execute_command("no shutdown", timeout=3)
        
        self.client.execute_command("exit")
        self.client.execute_command("end")
        
        return True, f"Interface {interface} enabled"
    
    # ==================== GLOBAL TR-069/ACS CONFIG ====================
    
    def show_tr069_global(self) -> str:
        """Show global TR-069 configuration"""
        success, output = self.client.execute_command(
            "show running-config | include tr069", timeout=10
        )
        return output if success else f"Error: {output}"
    
    def set_tr069_acs_global(self, acs_url: str, acs_username: str = "",
                             acs_password: str = "", periodic: bool = True,
                             interval: int = 3600) -> tuple:
        """
        Set global TR-069 ACS configuration (applies to all ONUs by default)
        
        Args:
            acs_url: ACS server URL
            acs_username: ACS username
            acs_password: ACS password
            periodic: Enable periodic inform
            interval: Inform interval in seconds
        """
        print(f"Setting global TR-069 ACS: {acs_url}")
        
        self.client.execute_command("end")
        self.client.execute_command("configure terminal", timeout=3)
        self.client.execute_command("gpon", timeout=3)
        
        # Set ACS URL
        self.client.execute_command(f"tr069 acs-url {acs_url}", timeout=5)
        
        # Set credentials if provided
        if acs_username:
            self.client.execute_command(f"tr069 acs-username {acs_username}", timeout=3)
        if acs_password:
            self.client.execute_command(f"tr069 acs-password {acs_password}", timeout=3)
        
        # Set periodic inform
        if periodic:
            self.client.execute_command("tr069 periodic-inform enable", timeout=3)
            self.client.execute_command(f"tr069 periodic-inform-interval {interval}", timeout=3)
        
        self.client.execute_command("end")
        
        return True, f"Global TR-069 ACS set to {acs_url}"
    
    # ==================== SAVE & BACKUP ====================
    
    def save_config(self) -> tuple:
        """Save running config to startup config"""
        print("Saving configuration...")
        
        self.client.execute_command("end")
        success, output = self.client.execute_command("write", timeout=30)
        
        if success and "%" not in output.lower():
            return True, "Configuration saved"
        return False, f"Failed: {output}"
    
    def show_running_config(self, filter_str: str = None) -> str:
        """Show running configuration"""
        if filter_str:
            cmd = f"show running-config | include {filter_str}"
        else:
            cmd = "show running-config"
        
        success, output = self.client.execute_command(cmd, timeout=60)
        return output if success else f"Error: {output}"
    
    def show_startup_config(self) -> str:
        """Show startup configuration"""
        success, output = self.client.execute_command("show startup-config", timeout=60)
        return output if success else f"Error: {output}"


def create_parser():
    """Create argument parser"""
    parser = argparse.ArgumentParser(
        description="OLT System Configuration Manager for ZTE C320",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # System info
  python olt_system_manager.py system-info
  python olt_system_manager.py system-status
  python olt_system_manager.py alarms
  
  # SNMP Management
  python olt_system_manager.py snmp show
  python olt_system_manager.py snmp community show
  python olt_system_manager.py snmp community add public --permission ro
  python olt_system_manager.py snmp community add private --permission rw
  python olt_system_manager.py snmp community delete public
  python olt_system_manager.py snmp enable
  python olt_system_manager.py snmp trap-host add 192.168.1.100 --community public
  python olt_system_manager.py snmp contact "NOC Team"
  python olt_system_manager.py snmp location "DC Jakarta"
  
  # NTP
  python olt_system_manager.py ntp show
  python olt_system_manager.py ntp server add 0.id.pool.ntp.org
  python olt_system_manager.py ntp timezone WIB --offset 7
  
  # Syslog
  python olt_system_manager.py syslog show
  python olt_system_manager.py syslog add 192.168.1.200
  
  # User management
  python olt_system_manager.py user show
  python olt_system_manager.py user add admin2 --password secret123
  python olt_system_manager.py user delete admin2
  
  # Hostname
  python olt_system_manager.py hostname OLT-JAKARTA-01
  
  # TR-069 Global
  python olt_system_manager.py tr069 show
  python olt_system_manager.py tr069 set --url http://acs.example.com:7547
  
  # Save config
  python olt_system_manager.py save
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # System info
    subparsers.add_parser('system-info', help='Show system information')
    subparsers.add_parser('system-status', help='Show system status (CPU/memory/temp)')
    subparsers.add_parser('cards', help='Show card status')
    subparsers.add_parser('alarms', help='Show active alarms')
    
    # SNMP commands
    snmp_parser = subparsers.add_parser('snmp', help='SNMP management')
    snmp_sub = snmp_parser.add_subparsers(dest='action')
    
    snmp_sub.add_parser('show', help='Show SNMP configuration')
    snmp_sub.add_parser('enable', help='Enable SNMP agent')
    snmp_sub.add_parser('disable', help='Disable SNMP agent')
    
    # SNMP community
    snmp_comm = snmp_sub.add_parser('community', help='SNMP community management')
    snmp_comm_sub = snmp_comm.add_subparsers(dest='comm_action')
    snmp_comm_sub.add_parser('show', help='Show communities')
    
    snmp_comm_add = snmp_comm_sub.add_parser('add', help='Add community')
    snmp_comm_add.add_argument('community', help='Community string')
    snmp_comm_add.add_argument('--permission', default='ro', choices=['ro', 'rw'])
    snmp_comm_add.add_argument('--acl', help='Access list')
    
    snmp_comm_del = snmp_comm_sub.add_parser('delete', help='Delete community')
    snmp_comm_del.add_argument('community', help='Community string')
    snmp_comm_del.add_argument('--permission', default='ro', choices=['ro', 'rw'])
    
    # SNMP trap
    snmp_trap = snmp_sub.add_parser('trap-host', help='SNMP trap host management')
    snmp_trap_sub = snmp_trap.add_subparsers(dest='trap_action')
    
    snmp_trap_add = snmp_trap_sub.add_parser('add', help='Add trap host')
    snmp_trap_add.add_argument('host', help='Trap receiver IP')
    snmp_trap_add.add_argument('--community', required=True, help='Community')
    snmp_trap_add.add_argument('--port', type=int, default=162, help='Trap port')
    
    # SNMP contact/location
    snmp_contact = snmp_sub.add_parser('contact', help='Set SNMP contact')
    snmp_contact.add_argument('contact', help='Contact info')
    
    snmp_location = snmp_sub.add_parser('location', help='Set SNMP location')
    snmp_location.add_argument('location', help='Location info')
    
    # NTP commands
    ntp_parser = subparsers.add_parser('ntp', help='NTP management')
    ntp_sub = ntp_parser.add_subparsers(dest='action')
    
    ntp_sub.add_parser('show', help='Show NTP config')
    
    ntp_server = ntp_sub.add_parser('server', help='NTP server management')
    ntp_server_sub = ntp_server.add_subparsers(dest='server_action')
    
    ntp_add = ntp_server_sub.add_parser('add', help='Add NTP server')
    ntp_add.add_argument('server', help='NTP server address')
    ntp_add.add_argument('--prefer', action='store_true', help='Prefer this server')
    
    ntp_del = ntp_server_sub.add_parser('delete', help='Delete NTP server')
    ntp_del.add_argument('server', help='NTP server address')
    
    ntp_tz = ntp_sub.add_parser('timezone', help='Set timezone')
    ntp_tz.add_argument('name', help='Timezone name (e.g., WIB, UTC)')
    ntp_tz.add_argument('--offset', type=int, default=0, help='UTC offset in hours')
    
    # Syslog commands
    syslog_parser = subparsers.add_parser('syslog', help='Syslog management')
    syslog_sub = syslog_parser.add_subparsers(dest='action')
    
    syslog_sub.add_parser('show', help='Show syslog config')
    
    syslog_add = syslog_sub.add_parser('add', help='Add syslog server')
    syslog_add.add_argument('server', help='Syslog server IP')
    syslog_add.add_argument('--facility', default='local0')
    syslog_add.add_argument('--level', default='informational')
    
    syslog_del = syslog_sub.add_parser('delete', help='Delete syslog server')
    syslog_del.add_argument('server', help='Syslog server IP')
    
    # User commands
    user_parser = subparsers.add_parser('user', help='User management')
    user_sub = user_parser.add_subparsers(dest='action')
    
    user_sub.add_parser('show', help='Show users')
    
    user_add = user_sub.add_parser('add', help='Add user')
    user_add.add_argument('username', help='Username')
    user_add.add_argument('--password', required=True, help='Password')
    user_add.add_argument('--privilege', type=int, default=15, help='Privilege level')
    
    user_del = user_sub.add_parser('delete', help='Delete user')
    user_del.add_argument('username', help='Username')
    
    user_passwd = user_sub.add_parser('password', help='Change password')
    user_passwd.add_argument('username', help='Username')
    user_passwd.add_argument('--password', required=True, help='New password')
    
    # Hostname
    hostname_parser = subparsers.add_parser('hostname', help='Set hostname')
    hostname_parser.add_argument('name', help='Hostname')
    
    # Interface
    iface_parser = subparsers.add_parser('interface', help='Interface management')
    iface_sub = iface_parser.add_subparsers(dest='action')
    
    iface_show = iface_sub.add_parser('show', help='Show interface status')
    iface_show.add_argument('--name', help='Interface name')
    
    iface_ip = iface_sub.add_parser('ip', help='Set interface IP')
    iface_ip.add_argument('interface', help='Interface name')
    iface_ip.add_argument('--ip', required=True, help='IP address')
    iface_ip.add_argument('--mask', required=True, help='Netmask')
    
    iface_shutdown = iface_sub.add_parser('shutdown', help='Shutdown interface')
    iface_shutdown.add_argument('interface', help='Interface name')
    
    iface_enable = iface_sub.add_parser('enable', help='Enable interface')
    iface_enable.add_argument('interface', help='Interface name')
    
    # TR-069 global
    tr069_parser = subparsers.add_parser('tr069', help='TR-069 global config')
    tr069_sub = tr069_parser.add_subparsers(dest='action')
    
    tr069_sub.add_parser('show', help='Show TR-069 config')
    
    tr069_set = tr069_sub.add_parser('set', help='Set TR-069 ACS')
    tr069_set.add_argument('--url', required=True, help='ACS URL')
    tr069_set.add_argument('--username', default='', help='ACS username')
    tr069_set.add_argument('--password', default='', help='ACS password')
    tr069_set.add_argument('--interval', type=int, default=3600, help='Inform interval')
    
    # Running config
    run_parser = subparsers.add_parser('running-config', help='Show running config')
    run_parser.add_argument('--filter', help='Filter string')
    
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
    manager = OLTSystemManager(client)
    
    try:
        if args.command == 'system-info':
            print("\n=== System Information ===")
            print(manager.show_system_info())
        
        elif args.command == 'system-status':
            print("\n=== System Status ===")
            print(manager.show_system_status())
        
        elif args.command == 'cards':
            print("\n=== Card Status ===")
            print(manager.show_card_status())
        
        elif args.command == 'alarms':
            print("\n=== Active Alarms ===")
            print(manager.show_alarm())
        
        elif args.command == 'snmp':
            if args.action == 'show':
                print("\n=== SNMP Configuration ===")
                print(manager.show_snmp())
            elif args.action == 'enable':
                success, msg = manager.enable_snmp()
                print(msg)
            elif args.action == 'disable':
                success, msg = manager.disable_snmp()
                print(msg)
            elif args.action == 'community':
                if args.comm_action == 'show':
                    print("\n=== SNMP Communities ===")
                    print(manager.show_snmp_community())
                elif args.comm_action == 'add':
                    success, msg = manager.add_snmp_community(
                        args.community, args.permission, args.acl
                    )
                    print(msg)
                elif args.comm_action == 'delete':
                    success, msg = manager.delete_snmp_community(
                        args.community, args.permission
                    )
                    print(msg)
            elif args.action == 'trap-host':
                if args.trap_action == 'add':
                    success, msg = manager.add_snmp_trap_host(
                        args.host, args.community, args.port
                    )
                    print(msg)
            elif args.action == 'contact':
                success, msg = manager.set_snmp_contact(args.contact)
                print(msg)
            elif args.action == 'location':
                success, msg = manager.set_snmp_location(args.location)
                print(msg)
        
        elif args.command == 'ntp':
            if args.action == 'show':
                print("\n=== NTP Configuration ===")
                print(manager.show_ntp())
            elif args.action == 'server':
                if args.server_action == 'add':
                    success, msg = manager.set_ntp_server(args.server, args.prefer)
                    print(msg)
                elif args.server_action == 'delete':
                    success, msg = manager.delete_ntp_server(args.server)
                    print(msg)
            elif args.action == 'timezone':
                success, msg = manager.set_timezone(args.name, args.offset)
                print(msg)
        
        elif args.command == 'syslog':
            if args.action == 'show':
                print("\n=== Syslog Configuration ===")
                print(manager.show_syslog())
            elif args.action == 'add':
                success, msg = manager.add_syslog_server(
                    args.server, args.facility, args.level
                )
                print(msg)
            elif args.action == 'delete':
                success, msg = manager.delete_syslog_server(args.server)
                print(msg)
        
        elif args.command == 'user':
            if args.action == 'show':
                print("\n=== Users ===")
                print(manager.show_users())
            elif args.action == 'add':
                success, msg = manager.add_user(
                    args.username, args.password, args.privilege
                )
                print(msg)
            elif args.action == 'delete':
                confirm = input(f"Delete user '{args.username}'? (y/n): ").strip().lower()
                if confirm == 'y':
                    success, msg = manager.delete_user(args.username)
                    print(msg)
            elif args.action == 'password':
                success, msg = manager.change_password(args.username, args.password)
                print(msg)
        
        elif args.command == 'hostname':
            success, msg = manager.set_hostname(args.name)
            print(msg)
        
        elif args.command == 'interface':
            if args.action == 'show':
                print("\n=== Interface Status ===")
                print(manager.show_interface_status(args.name if hasattr(args, 'name') else None))
            elif args.action == 'ip':
                success, msg = manager.set_interface_ip(args.interface, args.ip, args.mask)
                print(msg)
            elif args.action == 'shutdown':
                success, msg = manager.shutdown_interface(args.interface)
                print(msg)
            elif args.action == 'enable':
                success, msg = manager.no_shutdown_interface(args.interface)
                print(msg)
        
        elif args.command == 'tr069':
            if args.action == 'show':
                print("\n=== TR-069 Configuration ===")
                print(manager.show_tr069_global())
            elif args.action == 'set':
                success, msg = manager.set_tr069_acs_global(
                    args.url, args.username, args.password, 
                    interval=args.interval
                )
                print(msg)
        
        elif args.command == 'running-config':
            print("\n=== Running Config ===")
            print(manager.show_running_config(args.filter if hasattr(args, 'filter') else None))
        
        elif args.command == 'save':
            success, msg = manager.save_config()
            print(msg)
    
    finally:
        client.disconnect()
        print("\nDisconnected from OLT")


if __name__ == "__main__":
    main()
