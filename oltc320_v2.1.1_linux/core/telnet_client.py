"""
Telnet Client untuk OLT ZTE C320
Menangani koneksi Telnet dengan auto-login dan prompt detection

Requirements:
- Python 3.10, 3.11, or 3.12 (telnetlib is built-in)
- Python 3.13+: Uses vendored telnetlib from Python 3.12
"""
try:
    # Try built-in telnetlib (Python 3.10-3.12)
    import telnetlib
except ImportError:
    # Fallback to vendored version (Python 3.13+)
    try:
        from core.vendor import telnetlib
    except ImportError:
        raise ImportError(
            "telnetlib not available. \n"
            "For Python 3.13+, the vendored telnetlib should be included.\n"
            "Please ensure core/vendor/telnetlib.py exists, or use Python 3.10-3.12."
        )

import time
import re
import logging
from typing import Optional, Tuple
from config.olt_config import OLTConfig, ZTEConstants

logger = logging.getLogger(__name__)


class TelnetClient:
    """Client Telnet untuk komunikasi dengan OLT ZTE C320"""
    
    def __init__(self, config: OLTConfig):
        self.config = config
        self.tn: Optional[telnetlib.Telnet] = None
        self.connected = False
        self.logged_in = False
        
    def connect(self) -> bool:
        """
        Koneksi ke OLT dan login
        Returns: True jika berhasil, False jika gagal
        """
        try:
            logger.info(f"Connecting to OLT {self.config.host}:{self.config.port}")
            self.tn = telnetlib.Telnet(self.config.host, self.config.port, self.config.timeout)
            
            # Login process
            if not self._login():
                logger.error("Login failed")
                self.disconnect()
                return False
            
            # Enter enable mode if enable password is set
            if self.config.enable_password:
                if not self._enable():
                    logger.error("Failed to enter enable mode")
                    self.disconnect()
                    return False
            
            # Disable terminal paging (important for long outputs)
            self._disable_paging()
            
            self.connected = True
            self.logged_in = True
            logger.info(f"Connected to OLT {self.config.host}")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    def _disable_paging(self):
        """Disable terminal paging for long outputs"""
        try:
            # ZTE OLT commands to disable paging
            self.tn.write(b"terminal length 0\n")
            time.sleep(0.5)
            self.tn.read_very_eager()
            
            # Alternative command
            self.tn.write(b"screen-length 0 temporary\n")
            time.sleep(0.5)
            self.tn.read_very_eager()
            
            logger.debug("Disabled terminal paging")
        except Exception as e:
            logger.warning(f"Could not disable paging: {e}")
    
    def _login(self) -> bool:
        """
        Proses login ke OLT
        Returns: True jika berhasil login
        """
        try:
            # Wait for Username prompt
            output = self.tn.read_until(b"Username:", timeout=self.config.timeout)
            logger.debug(f"Login prompt: {output.decode('ascii', errors='ignore')}")
            
            # Send username
            self.tn.write(self.config.username.encode('ascii') + b"\n")
            time.sleep(0.5)
            
            # Wait for Password prompt
            output = self.tn.read_until(b"Password:", timeout=self.config.timeout)
            
            # Send password
            self.tn.write(self.config.password.encode('ascii') + b"\n")
            time.sleep(1)
            
            # Check if login successful (wait for prompt)
            output = self.tn.read_very_eager().decode('ascii', errors='ignore')
            
            # Detect prompt (>, #, atau config)
            if any(p in output for p in [ZTEConstants.PROMPT_USER, ZTEConstants.PROMPT_PRIV, "#"]):
                logger.info("Login successful")
                return True
            else:
                logger.error(f"Login failed - unexpected output: {output}")
                return False
                
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False
    
    def _enable(self) -> bool:
        """
        Masuk ke enable mode (privileged mode)
        Returns: True jika berhasil
        """
        try:
            # Check if already in enable mode (prompt has #)
            output = self.tn.read_very_eager().decode('ascii', errors='ignore')
            if '#' in output:
                logger.debug("Already in enable mode")
                return True
            
            # Send enable command
            self.tn.write(b"enable\n")
            time.sleep(0.5)
            
            # Check if password is required
            output = self.tn.read_very_eager().decode('ascii', errors='ignore')
            
            if 'assword' in output.lower():
                # Send enable password
                self.tn.write(self.config.enable_password.encode('ascii') + b"\n")
                time.sleep(1)
                output = self.tn.read_very_eager().decode('ascii', errors='ignore')
            
            # Check for # prompt (privileged mode)
            if '#' in output:
                logger.info("Entered enable mode")
                return True
            else:
                logger.error(f"Enable mode failed - output: {output}")
                return False
        
        except Exception as e:
            logger.error(f"Enable mode error: {e}")
            return False
    
    def disconnect(self):
        """Disconnect dari OLT"""
        if self.tn:
            try:
                self.tn.write(b"exit\n")
                time.sleep(0.5)
                self.tn.close()
                logger.info("Disconnected from OLT")
            except:
                pass
        self.connected = False
        self.logged_in = False
        self.tn = None
    
    def execute_command(self, command: str, timeout: int = None) -> Tuple[bool, str]:
        """
        Eksekusi command ke OLT
        
        Args:
            command: Command yang akan dieksekusi
            timeout: Timeout untuk command (detik)
            
        Returns:
            Tuple (success, output)
        """
        if not self.connected or not self.tn:
            logger.error("Not connected to OLT")
            return False, "Not connected"
        
        if timeout is None:
            timeout = ZTEConstants.CMD_TIMEOUT_MEDIUM
        
        try:
            # Clear buffer
            self.tn.read_very_eager()
            
            # Send command
            logger.debug(f"Executing: {command}")
            self.tn.write(command.encode('ascii') + b"\n")
            time.sleep(0.5)
            
            # Read output
            output = self._read_until_prompt(timeout)
            
            logger.debug(f"Output: {output[:200]}...")
            return True, output
            
        except Exception as e:
            err_str = str(e)
            logger.error(f"Command execution error: {e}")
            # WinError 10054 / EOF: koneksi putus — coba reconnect sekali
            if "10054" in err_str or "EOF" in err_str or "Connection" in err_str:
                self.connected = False
                self.logged_in = False
                logger.info("Attempting reconnect after connection drop...")
                try:
                    if self.connect():
                        logger.info("Reconnected — retrying command")
                        self.tn.read_very_eager()
                        self.tn.write(command.encode('ascii') + b"\n")
                        time.sleep(0.5)
                        output = self._read_until_prompt(timeout)
                        return True, output
                except Exception as re_err:
                    logger.error(f"Reconnect failed: {re_err}")
            return False, err_str
    
    def _read_until_prompt(self, timeout: int = 10) -> str:
        """
        Membaca output sampai menemukan prompt
        Handles pagination (--More--)
        
        Args:
            timeout: Timeout dalam detik
            
        Returns:
            Output dari command
        """
        output_parts = []
        start_time = time.time()
        more_count = 0
        max_more_iterations = 1000  # Safety limit for pagination
        
        while time.time() - start_time < timeout and more_count < max_more_iterations:
            try:
                # Read available data
                data = self.tn.read_very_eager()
                if data:
                    text = data.decode('ascii', errors='ignore')
                    
                    # Handle pagination --More-- (check before appending to output)
                    if '--More--' in text or '-- More --' in text or '(more)' in text.lower():
                        # Send space to continue, but don't include the --More-- prompt in output
                        # Clean the --More-- from text before appending
                        cleaned_text = text.replace('--More--', '').replace('-- More --', '')
                        output_parts.append(cleaned_text)
                        
                        self.tn.write(b" ")  # Press space to continue
                        more_count += 1
                        time.sleep(0.2)
                        continue
                    
                    output_parts.append(text)
                    
                    # Check for prompt at end of output
                    current_output = ''.join(output_parts)
                    lines = current_output.split('\n')
                    
                    if lines:
                        last_line = lines[-1].strip()
                        # Detect various prompts
                        if any(last_line.endswith(p) for p in ['>', '#', '(config)#', '(config-if)#', '(pon)#', '(config-gpon-onu)#']):
                            if more_count > 0:
                                logger.debug(f"Handled {more_count} pagination prompts")
                            return current_output
                
                time.sleep(0.1)  # Reduced sleep for faster response
                
            except EOFError:
                logger.warning("Connection closed by remote host")
                break
        
        if more_count >= max_more_iterations:
            logger.warning(f"Reached max pagination iterations ({max_more_iterations})")
        
        # Timeout atau selesai
        return ''.join(output_parts)
        return ''.join(output_parts)
    
    def enter_config_mode(self) -> bool:
        """
        Masuk ke config mode
        Returns: True jika berhasil
        """
        # Try "configure terminal" first (standard)
        success, output = self.execute_command("configure terminal")
        if success and "(config)" in output:
            logger.debug("Entered config mode")
            return True
        
        # Try "config" (alternative ZTE syntax)
        success, output = self.execute_command("config")
        if success and "(config)" in output:
            logger.debug("Entered config mode (using 'config')")
            return True
        
        # If already in config mode
        if "(config)" in output or "config" in output.lower():
            logger.debug("Already in config mode")
            return True
        
        logger.error(f"Failed to enter config mode. Output: {output[:200]}")
        return False
    
    def exit_config_mode(self) -> bool:
        """
        Keluar dari config mode
        Returns: True jika berhasil
        """
        success, _ = self.execute_command("exit")
        if success:
            logger.debug("Exited config mode")
            return True
        return False
    
    def enter_interface(self, interface: str) -> bool:
        """
        Masuk ke interface configuration mode
        Try multiple interface formats until one works
        
        Args:
            interface: Nama interface (sudah normalized: gpon-olt_1/1/1 atau gpon-onu_1/1/1:X)
            
        Returns: True jika berhasil
        """
        # Interface sudah dinormalisasi dari ZTECommand, langsung gunakan
        logger.debug(f"Entering interface: {interface}")
        success, output = self.execute_command(f"interface {interface}", timeout=3)
        
        if success and "(config-if)" in output:
            logger.debug(f"Entered interface {interface}")
            return True
        elif success and "error" not in output.lower():
            # Might be successful even without (config-if) prompt
            logger.debug(f"Entered interface {interface} (no prompt detected)")
            return True
        
        logger.error(f"Failed to enter interface {interface}: {output[:200]}")
        return False
    
    def reconnect(self) -> bool:
        """
        Reconnect ke OLT (disconnect dulu, lalu connect lagi)
        Returns: True jika berhasil reconnect
        """
        logger.info("Attempting to reconnect...")
        self.disconnect()
        time.sleep(2)
        return self.connect()
    
    def is_connected(self) -> bool:
        """Check apakah masih terkoneksi"""
        if not self.tn or not self.connected:
            return False
        
        try:
            # Try to execute simple command
            success, _ = self.execute_command("", timeout=3)
            return success
        except:
            return False
    
    def ensure_connection(self) -> bool:
        """
        Pastikan koneksi masih hidup, reconnect jika perlu
        Returns: True jika koneksi OK
        """
        if self.is_connected():
            return True
        
        logger.warning("Connection lost, attempting to reconnect...")
        return self.reconnect()
