"""
ONU Data Models
Mendefinisikan struktur data untuk ONU
"""
from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class ONUUnconfigured:
    """Model untuk ONU yang belum terdaftar (unconfigured)"""
    pon_port: str  # Contoh: gpon_olt-1/1/1
    sn: str        # Serial Number, contoh: ZTEGXXXXXXXX
    vendor: str    # Vendor ONU
    state: str     # State ONU (biasanya "unknown" untuk uncfg)
    
    def __str__(self) -> str:
        return f"ONU(sn={self.sn}, port={self.pon_port}, vendor={self.vendor})"


@dataclass
class ONURegistered:
    """Model untuk ONU yang sudah terdaftar"""
    pon_port: str       # Contoh: gpon_olt-1/1/1
    onu_id: int         # ONU ID (1-128)
    sn: str             # Serial Number
    onu_type: str       # Tipe ONU, contoh: ZTE-F609
    state: str          # State ONU (online/offline)
    description: Optional[str] = None
    registered_at: Optional[datetime] = None
    
    def __str__(self) -> str:
        return f"ONU(id={self.onu_id}, sn={self.sn}, port={self.pon_port}, type={self.onu_type})"


@dataclass
class ONUProfile:
    """Model untuk profile ONU"""
    tcont_profile: str = "1G"       # TCONT profile
    gemport_id: int = 1              # GEM port ID
    tcont_id: int = 1                # TCONT ID
    user_vlan: int = 100             # User VLAN
    service_vlan: int = 100          # Service VLAN
    service_port: int = 1            # Service port number
    vport: int = 1                   # Virtual port
    
    def __str__(self) -> str:
        return f"Profile(tcont={self.tcont_profile}, vlan={self.user_vlan})"


@dataclass
class ONURegistrationResult:
    """Model untuk hasil registrasi ONU"""
    success: bool
    onu: ONUUnconfigured
    onu_id: Optional[int] = None
    message: str = ""
    error: Optional[str] = None
    retry_count: int = 0
    
    def __str__(self) -> str:
        status = "SUCCESS" if self.success else "FAILED"
        return f"[{status}] {self.onu.sn}: {self.message}"
