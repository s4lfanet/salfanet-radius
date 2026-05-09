"""
Firmware Version Detector untuk ZTE C320 OLT
Auto-detect apakah firmware V2.1.x atau V2.2+ berdasarkan SNMP OID response

Key difference:
  V2.1.x  → Base OID: 1.3.6.1.4.1.3902.1012
  V2.2+   → Base OID: 1.3.6.1.4.1.3902.1082

OID Index (V2.1.x):
  PON Index = 268500992 + (board * 8192) + (pon * 256)
"""
import logging
from enum import Enum
from typing import Optional, Dict, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class FirmwareVersion(Enum):
    """Enum versi firmware ZTE C320"""
    V21 = "v2.1"   # Firmware V2.1.x - OID base .1012
    V22 = "v2.2"   # Firmware V2.2+  - OID base .1082
    UNKNOWN = "unknown"


@dataclass
class OIDProfile:
    """Konfigurasi OID lengkap per firmware version"""
    firmware: FirmwareVersion
    name: str
    base_oid: str

    # --- ONU Table OIDs (relative dari base, tanpa leading dot) ---
    # Format: "{prefix}.{pon_index}.{onu_id}"
    onu_name:            str = ""
    onu_status:          str = ""   # 1=online, 2=logging/uncfg, 3=online (V2.2)
    onu_serial:          str = ""
    onu_model:           str = ""
    onu_description:     str = ""
    onu_firmware:        str = ""
    onu_ip_address:      str = ""
    onu_last_online:     str = ""
    onu_last_offline:    str = ""
    onu_offline_reason:  str = ""
    onu_distance:        str = ""
    onu_rx_power:        str = ""   # dBm (tidak tersedia di V2.1 via SNMP)
    onu_tx_power:        str = ""   # dBm (tidak tersedia di V2.1 via SNMP)

    # --- PON Port OIDs ---
    pon_admin_status:    str = ""
    pon_oper_status:     str = ""
    pon_distance:        str = ""
    pon_onu_count:       str = ""

    # --- Traffic / Statistics OIDs ---
    onu_rx_packets:      str = ""
    onu_rx_bytes:        str = ""
    onu_online_status:   str = ""   # 1=online (untuk polling status)

    # --- System OIDs ---
    card_type:           str = ""
    card_serial:         str = ""
    card_hw_version:     str = ""
    card_sw_version:     str = ""
    card_status:         str = ""

    # --- PON Index formula ---
    # V2.1: 268500992 + (board * 8192) + (pon * 256)
    pon_index_base:      int = 0
    pon_index_board_mult: int = 8192
    pon_index_pon_mult:  int = 256

    # --- Flags ---
    snmp_optical_power: bool = False   # True jika RX/TX power tersedia via SNMP


# ========================================================================
# OID PROFILES
# ========================================================================

OID_PROFILES: Dict[FirmwareVersion, OIDProfile] = {

    FirmwareVersion.V21: OIDProfile(
        firmware=FirmwareVersion.V21,
        name="ZTE C320 V2.1.x",
        base_oid="1.3.6.1.4.1.3902.1012",

        # ONU Table: .3.13.3.1.{col}.{pon_index}.{onu_id}
        # Verified via live SNMP GET on OLT 136.1.1.100 (ZTE C320 V2.1.0)
        # col2 = 8-byte binary GPON serial (e.g. ZTEG + D824CDF3)
        # col3 = ONU configured name string (e.g. "123456789", "fiberhome")
        # col11 = ONU model string (e.g. "V9.1.10P4N2", "RP4313")
        onu_name=           ".3.13.3.1.3",    # ONU admin name (col3)
        onu_status=         "",               # tidak ada integer status col yg valid di V2.1
        onu_serial=         ".3.13.3.1.2",    # 8-byte binary GPON SN (col2, vendor+hex)
        onu_model=          ".3.13.3.1.11",   # ONU model string (col11)
        onu_description=    ".3.13.3.1.9",    # deskripsi/alias singkat
        onu_firmware=       ".3.13.3.1.10",   # hardware/firmware ID string
        onu_ip_address=     "",               # tidak tersedia V2.1
        onu_last_online=    ".3.13.3.1.20",
        onu_last_offline=   ".3.13.3.1.21",
        onu_offline_reason= ".3.13.3.1.22",
        onu_distance=       ".3.13.3.1.18",

        # Optical power TIDAK tersedia via SNMP di V2.1.x
        # Harus pakai Telnet: show gpon onu optical-info gpon-olt_1/{b}/{p} {id}
        onu_rx_power=       "",
        onu_tx_power=       "",
        snmp_optical_power= False,

        # PON port: .3.13.1.1.{col}.{pon_index}
        # Catatan: col3 = Integer 2 untuk semua PON (mungkin PON type=GPON, bukan oper status)
        # Semantik tidak pasti; set kosong untuk menghindari display salah.
        # TODO: Verifikasi OID PON admin/oper status yang benar untuk V2.1
        pon_admin_status=   "",
        pon_oper_status=    "",
        pon_distance=       "",              # tidak tersedia V2.1
        pon_onu_count=      "",              # tidak tersedia V2.1

        # ONU statistics: belum diverifikasi di V2.1 — set kosong
        onu_rx_packets=     "",
        onu_rx_bytes=       "",
        # Tidak ada integer-status OID yang valid di V2.1.
        # Online status ditentukan dari SNMP walk availability.
        onu_online_status=  "",

        # Card/slot: .1015.2.1.1.3.1.{col}.{rack}.{shelf}.{slot}
        card_type=          "",
        card_serial=        "",
        card_hw_version=    "",
        card_sw_version=    "",
        card_status=        "",

        # PON Index formula: 268500992 + (board * 8192) + (pon * 256)
        pon_index_base=      268500992,
        pon_index_board_mult=8192,
        pon_index_pon_mult=  256,
    ),

    FirmwareVersion.V22: OIDProfile(
        firmware=FirmwareVersion.V22,
        name="ZTE C320 V2.2+",
        base_oid="1.3.6.1.4.1.3902.1082",

        # ONU Table: .500.10.2.3.3.1.{col}
        onu_name=           ".500.10.2.3.3.1.2",
        onu_status=         ".500.10.2.1.1.7",
        onu_serial=         ".500.10.2.3.3.1.4",
        onu_model=          ".500.10.2.3.3.1.5",
        onu_description=    ".500.10.2.3.3.1.9",
        onu_firmware=       ".500.10.2.3.3.1.17",
        onu_ip_address=     ".500.10.2.3.3.1.16",
        onu_last_online=    ".500.10.2.1.1.18",
        onu_last_offline=   ".500.10.2.1.1.19",
        onu_offline_reason= ".500.10.2.1.1.20",
        onu_distance=       ".500.10.2.1.1.9",

        # Optical power tersedia di V2.2+
        onu_rx_power=       ".500.10.2.1.1.4",
        onu_tx_power=       ".500.20.2.2.2.1.11",
        snmp_optical_power= True,

        # PON port
        pon_admin_status=   ".500.10.1.1.3",
        pon_oper_status=    ".500.10.1.1.4",
        pon_distance=       ".500.10.1.1.6",
        pon_onu_count=      ".500.10.1.1.8",

        # Statistics
        onu_rx_packets=     ".3.50.12.1.1.5",
        onu_rx_bytes=       ".3.50.12.1.1.6",
        onu_online_status=  ".500.10.2.1.1.7",  # 1=online

        # Card/slot
        card_type=          ".1015.2.1.1.3.1.2",
        card_serial=        ".1015.2.1.1.3.1.4",
        card_hw_version=    ".1015.2.1.1.3.1.5",
        card_sw_version=    ".1015.2.1.1.3.1.6",
        card_status=        ".1015.2.1.1.3.1.7",

        # PON Index formula V2.2 masih sama
        pon_index_base=      268500992,
        pon_index_board_mult=8192,
        pon_index_pon_mult=  256,
    ),
}


class FirmwareDetector:
    """
    Auto-detect firmware version ZTE C320 via SNMP
    
    Usage:
        detector = FirmwareDetector(snmp_client)
        version = detector.detect()
        profile = detector.get_oid_profile()
    """

    # OID yang hanya ada di V2.1.x (base .1012)
    _PROBE_V21 = "1.3.6.1.4.1.3902.1012.3.13.3.1.1"

    # OID yang hanya ada di V2.2+ (base .1082)
    _PROBE_V22 = "1.3.6.1.4.1.3902.1082.500.10.1.1.1"

    def __init__(self, snmp_client):
        """
        Args:
            snmp_client: Instance dari SNMPClient
        """
        self.snmp = snmp_client
        self._detected_version: Optional[FirmwareVersion] = None

    def detect(self, force: bool = False) -> FirmwareVersion:
        """
        Detect firmware version via SNMP probe
        
        Args:
            force: Paksa re-detect meskipun sudah ada cache
        Returns:
            FirmwareVersion enum
        """
        if self._detected_version is not None and not force:
            return self._detected_version

        if not self.snmp or not self.snmp.is_available():
            logger.warning("SNMP client tidak tersedia untuk firmware detection")
            self._detected_version = FirmwareVersion.UNKNOWN
            return self._detected_version

        logger.info("Mendeteksi firmware version ZTE C320...")

        # Probe V2.1.x
        result_v21 = self.snmp.walk(self._PROBE_V21)
        if result_v21:
            logger.info("Firmware terdeteksi: V2.1.x (OID base .1012)")
            self._detected_version = FirmwareVersion.V21
            return self._detected_version

        # Probe V2.2+
        result_v22 = self.snmp.walk(self._PROBE_V22)
        if result_v22:
            logger.info("Firmware terdeteksi: V2.2+ (OID base .1082)")
            self._detected_version = FirmwareVersion.V22
            return self._detected_version

        # Fallback: cek system description
        sysinfo = self.snmp.get_system_description()
        if sysinfo:
            sysinfo_lower = sysinfo.lower()
            if "v2.1" in sysinfo_lower or "2.1." in sysinfo_lower:
                logger.info(f"Firmware V2.1 dari sysDescr: {sysinfo[:50]}")
                self._detected_version = FirmwareVersion.V21
                return self._detected_version
            elif "v2.2" in sysinfo_lower or "v2.3" in sysinfo_lower:
                logger.info(f"Firmware V2.2+ dari sysDescr: {sysinfo[:50]}")
                self._detected_version = FirmwareVersion.V22
                return self._detected_version

        logger.warning("Tidak dapat mendeteksi firmware. Menggunakan V2.1 sebagai default.")
        self._detected_version = FirmwareVersion.V21  # Conservative fallback
        return self._detected_version

    def get_oid_profile(self, override: Optional[str] = None) -> OIDProfile:
        """
        Dapatkan OIDProfile yang sesuai firmware
        
        Args:
            override: Optional string "v2.1" atau "v2.2" untuk override auto-detect
        Returns:
            OIDProfile
        """
        if override and override.lower() in ("v2.1", "v2.1.0", "v21"):
            return OID_PROFILES[FirmwareVersion.V21]
        if override and override.lower() in ("v2.2", "v2.2+", "v22"):
            return OID_PROFILES[FirmwareVersion.V22]

        version = self.detect()
        if version in OID_PROFILES:
            return OID_PROFILES[version]
        return OID_PROFILES[FirmwareVersion.V21]

    @staticmethod
    def calculate_pon_index(board: int, pon: int,
                             base: int = 268500992,
                             board_mult: int = 8192,
                             pon_mult: int = 256) -> int:
        """
        Hitung PON Index untuk SNMP OID

        Formula:
            268500992 + ((board-1) * 8192) + (pon * 256)
            Board adalah 1-based, pon adalah 1-based.

        Examples:
            Board 1, PON 1 -> 268501248
            Board 1, PON 2 -> 268501504
            Board 2, PON 1 -> 268509440

        Args:
            board: Board/card number (1-based, slot fisik OLT)
            pon:   PON port number (1-based)
        Returns:
            PON index integer untuk SNMP OID
        """
        return base + ((board - 1) * board_mult) + (pon * pon_mult)

    @staticmethod
    def parse_pon_port(pon_port: str) -> Tuple[int, int, int]:
        """
        Parse string PON port ke tuple (rack, board, pon)
        
        Args:
            pon_port: String "1/1/1" atau "gpon-olt_1/1/1"
        Returns:
            (rack, board, pon) tuple
        """
        clean = pon_port.replace("gpon-olt_", "").replace("gpon_olt-", "")
        parts = clean.split("/")
        if len(parts) == 3:
            return int(parts[0]), int(parts[1]), int(parts[2])
        elif len(parts) == 2:
            return 1, int(parts[0]), int(parts[1])
        raise ValueError(f"Format PON port tidak valid: {pon_port}")

    def get_firmware_info(self) -> dict:
        """Dapatkan info lengkap firmware"""
        version = self.detect()
        profile = self.get_oid_profile()
        return {
            "version": version.value,
            "name": profile.name,
            "base_oid": profile.base_oid,
            "snmp_optical_power": profile.snmp_optical_power,
            "optical_method": "SNMP" if profile.snmp_optical_power else "Telnet fallback",
        }
