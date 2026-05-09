"""
OLT Configuration
Konfigurasi koneksi dan parameter OLT ZTE C320
"""
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OLTConfig:
    """Konfigurasi OLT"""
    host: str
    port: int = 23
    username: str = ""
    password: str = ""
    timeout: int = 10
    max_retries: int = 3
    enable_password: Optional[str] = None
    
    # ONU Configuration defaults
    default_onu_type: str = "ZTE-F609"
    default_tcont_profile: str = "1G"
    default_vlan: int = 100
    
    # Discovery settings
    discovery_interval: int = 30  # seconds
    auto_register: bool = True
    
    @classmethod
    def from_env(cls) -> "OLTConfig":
        """Load konfigurasi dari environment variables"""
        return cls(
            host=os.getenv("OLT_HOST", ""),
            port=int(os.getenv("OLT_PORT", "23")),
            username=os.getenv("OLT_USERNAME", ""),
            password=os.getenv("OLT_PASSWORD", ""),
            timeout=int(os.getenv("OLT_TIMEOUT", "10")),
            max_retries=int(os.getenv("OLT_MAX_RETRIES", "3")),
            enable_password=os.getenv("OLT_ENABLE_PASSWORD"),
            default_onu_type=os.getenv("OLT_DEFAULT_ONU_TYPE", "ZTE-F609"),
            default_tcont_profile=os.getenv("OLT_DEFAULT_TCONT_PROFILE", "1G"),
            default_vlan=int(os.getenv("OLT_DEFAULT_VLAN", "100")),
            discovery_interval=int(os.getenv("OLT_DISCOVERY_INTERVAL", "30")),
            auto_register=os.getenv("OLT_AUTO_REGISTER", "true").lower() == "true"
        )
    
    @classmethod
    def from_profile(cls, profile) -> "OLTConfig":
        """Load konfigurasi dari OLT profile"""
        from config.olt_profile_manager import OLTProfile
        
        if isinstance(profile, dict):
            return cls(
                host=profile.get("host", ""),
                port=profile.get("port", 23),
                username=profile.get("username", ""),
                password=profile.get("password", ""),
                timeout=profile.get("timeout", 10),
                max_retries=profile.get("max_retries", 3),
                enable_password=profile.get("enable_password")
            )
        elif isinstance(profile, OLTProfile):
            return cls(
                host=profile.host,
                port=profile.port,
                username=profile.username,
                password=profile.password,
                timeout=profile.timeout,
                max_retries=profile.max_retries,
                enable_password=profile.enable_password
            )
        else:
            raise ValueError(f"Invalid profile type: {type(profile)}")
    
    @classmethod
    def from_active_profile(cls) -> "OLTConfig":
        """Load konfigurasi dari active profile"""
        from config.olt_profile_manager import OLTProfileManager
        
        manager = OLTProfileManager()
        active_profile = manager.get_active_profile()
        
        if not active_profile:
            # Fallback to env if no active profile
            return cls.from_env()
        
        return cls.from_profile(active_profile)
    
    def validate(self) -> tuple[bool, str]:
        """Validasi konfigurasi"""
        if not self.host:
            return False, "OLT_HOST tidak boleh kosong"
        if not self.username:
            return False, "OLT_USERNAME tidak boleh kosong"
        if not self.password:
            return False, "OLT_PASSWORD tidak boleh kosong"
        if self.port < 1 or self.port > 65535:
            return False, f"Port tidak valid: {self.port}"
        return True, "OK"


# Konstanta untuk ZTE C320
class ZTEConstants:
    """Konstanta untuk OLT ZTE C320"""
    
    # Prompts
    PROMPT_USER = ">"
    PROMPT_PRIV = "#"
    PROMPT_CONFIG = "(config)"
    
    # Command timeouts
    CMD_TIMEOUT_SHORT = 5
    CMD_TIMEOUT_MEDIUM = 10
    CMD_TIMEOUT_LONG = 30
    
    # ONU limits
    MAX_ONU_PER_PON = 128
    MIN_ONU_ID = 1
    
    # Regex patterns
    PATTERN_ONU_UNCFG = r'gpon[_-]olt[_-]?(\d+[/_]\d+[/_]\d+)\s+(\S+)\s+(\S+)\s+(\S+)'
    PATTERN_ONU_CFG = r'gpon[_-]onu[_-]?(\d+[/_]\d+[/_]\d+):(\d+)'
    
    # Error messages dari OLT
    ERROR_ALREADY_EXISTS = "already exist"
    ERROR_ONU_ID_CONFLICT = "conflict"
    ERROR_INVALID_SN = "invalid"
    ERROR_TIMEOUT = "timeout"
    ERROR_COMMAND_REJECTED = "rejected"
