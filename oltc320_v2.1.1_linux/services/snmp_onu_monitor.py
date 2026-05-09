"""
SNMP ONU Monitor Service
Mengambil data ONU (status, nama, serial, model) via SNMP dari OLT ZTE C320

Mendukung firmware V2.1.x dan V2.2+
ONU yang offline tetap bisa dibaca via SNMP (last-known state).
"""
import logging
from typing import List, Optional, Dict, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


def _format_gpon_serial(raw_value) -> str:
    """
    Format GPON serial number 8-byte biner ke string yang readable.

    Format standar GPON SN: 4 byte vendor ASCII + 4 byte nomor seri hex
    Contoh: b'\\x5A\\x54\\x45\\x47\\xD8\\x24\\xCD\\xF3' -> 'ZTEG-D824CDF3'

    Args:
        raw_value: bytes/bytearray, atau string hex (e.g. "5A544547D824CDF3")
    Returns:
        String "VENDOR-HEXSERIAL" jika 8-byte, else hex fallback
    """
    try:
        if isinstance(raw_value, str):
            # Sudah string hex (dari as_hex())
            s = raw_value.replace("0x", "").replace(":", "").replace("-", "").upper()
            if len(s) == 16:  # 8 bytes
                vendor = bytes.fromhex(s[:8]).decode("ascii", errors="replace")
                sn_hex = s[8:]
                return f"{vendor}-{sn_hex}"
            return s
        if isinstance(raw_value, (bytes, bytearray)):
            if len(raw_value) == 8:
                vendor = raw_value[:4].decode("ascii", errors="replace")
                sn_hex = raw_value[4:].hex().upper()
                return f"{vendor}-{sn_hex}"
            return raw_value.hex().upper()
    except Exception:
        pass
    return str(raw_value)


@dataclass
class ONUBasicInfo:
    """Informasi dasar ONU dari SNMP"""
    pon_index: int
    onu_id: int
    board: int
    pon: int
    name: str = ""
    serial: str = ""
    model: str = ""
    description: str = ""
    firmware: str = ""
    online: bool = False
    status_raw: int = 0
    distance_m: int = 0
    last_online: str = ""
    last_offline: str = ""
    offline_reason: str = ""

    @property
    def port_string(self) -> str:
        """Format: gpon-olt_1/{board}/{pon}"""
        return f"gpon-olt_1/{self.board}/{self.pon}"

    @property
    def onu_port_string(self) -> str:
        """Format: gpon-onu_1/{board}/{pon}:{onu_id}"""
        return f"gpon-onu_1/{self.board}/{self.pon}:{self.onu_id}"

    @property
    def status_label(self) -> str:
        if self.online:
            return "ONLINE"
        return "OFFLINE"

    def to_dict(self) -> dict:
        return {
            "pon_index": self.pon_index,
            "onu_id": self.onu_id,
            "board": self.board,
            "pon": self.pon,
            "name": self.name,
            "serial": self.serial,
            "model": self.model,
            "description": self.description,
            "firmware": self.firmware,
            "online": self.online,
            "status_raw": self.status_raw,
            "distance_m": self.distance_m,
            "last_online": self.last_online,
            "last_offline": self.last_offline,
            "offline_reason": self.offline_reason,
            "port": self.port_string,
        }


class SNMPONUMonitor:
    """
    Service untuk monitoring ONU via SNMP

    Usage:
        from core.snmp_client import SNMPClient, SNMPConfig
        from core.firmware_detector import FirmwareDetector

        client = SNMPClient(SNMPConfig(host="192.168.1.1", community="public"))
        detector = FirmwareDetector(client)
        profile = detector.get_oid_profile()

        monitor = SNMPONUMonitor(client, profile)
        onus = monitor.get_all_onus_on_pon(board=1, pon=1)
        for onu in onus:
            print(onu.name, onu.serial, onu.status_label)
    """

    def __init__(self, snmp_client, oid_profile, firmware_detector=None):
        """
        Args:
            snmp_client: Instance SNMPClient
            oid_profile: Instance OIDProfile (dari FirmwareDetector)
            firmware_detector: Optional FirmwareDetector instance
        """
        self.client = snmp_client
        self.profile = oid_profile
        self.firmware_detector = firmware_detector

    def _pon_index(self, board: int, pon: int) -> int:
        """Hitung PON index dari board/pon"""
        from core.firmware_detector import FirmwareDetector
        return FirmwareDetector.calculate_pon_index(board, pon)

    def _full_oid(self, rel_oid: str, pon_index: int, onu_id: int) -> str:
        """Build full OID: base + rel_oid + .{pon_index}.{onu_id}"""
        return f"{self.profile.base_oid}{rel_oid}.{pon_index}.{onu_id}"

    def _full_oid_walk(self, rel_oid: str, pon_index: int) -> str:
        """Build OID untuk walk: base + rel_oid + .{pon_index}"""
        return f"{self.profile.base_oid}{rel_oid}.{pon_index}"

    def get_onu_name(self, board: int, pon: int, onu_id: int) -> str:
        """Ambil nama ONU"""
        if not self.profile.onu_name:
            return ""
        oid = self._full_oid(self.profile.onu_name, self._pon_index(board, pon), onu_id)
        result = self.client.get(oid)
        return result.as_str() if result else ""

    def get_onu_status(self, board: int, pon: int, onu_id: int) -> Tuple[bool, int]:
        """
        Ambil status ONU
        Returns:
            (is_online, raw_status)
        """
        pon_idx = self._pon_index(board, pon)

        # Coba online_status OID dulu (lebih akurat)
        if self.profile.onu_online_status:
            oid = self._full_oid(self.profile.onu_online_status, pon_idx, onu_id)
            result = self.client.get(oid)
            if result:
                val = result.as_int()
                return (val == 1, val or 0)

        # Fallback ke onu_status OID
        if self.profile.onu_status:
            oid = self._full_oid(self.profile.onu_status, pon_idx, onu_id)
            result = self.client.get(oid)
            if result:
                val = result.as_int()
                # V2.1: 1=online, 2=logging  |  V2.2: 1=online, 2=uncfg, 3=?
                return (val == 1, val or 0)

        return (False, 0)

    def get_onu_serial(self, board: int, pon: int, onu_id: int) -> str:
        """Ambil serial number ONU, format sebagai VENDOR-HEXSERIAL jika GPON 8-byte"""
        if not self.profile.onu_serial:
            return ""
        oid = self._full_oid(self.profile.onu_serial, self._pon_index(board, pon), onu_id)
        result = self.client.get(oid)
        if not result:
            return ""
        # Serial GPON: 8 byte biner → format 'VENDOR-HEXSERIAL' (e.g. ZTEG-D824CDF3)
        if result.raw_value and isinstance(result.raw_value, (bytes, bytearray)):
            return _format_gpon_serial(result.raw_value)
        return result.as_str()

    def get_all_onus_on_pon(self, board: int, pon: int) -> List[ONUBasicInfo]:
        """
        Ambil semua ONU pada satu PON port via SNMP WALK

        Args:
            board: Board/card number (1-based)
            pon:   PON port number (1-based)
        Returns:
            List ONUBasicInfo
        """
        pon_idx = self._pon_index(board, pon)
        onus: Dict[int, ONUBasicInfo] = {}

        try:
            # Walk onu_name untuk temukan semua ONU ID yang terdaftar
            if self.profile.onu_name:
                walk_oid = self._full_oid_walk(self.profile.onu_name, pon_idx)
                results = self.client.walk(walk_oid)

                for r in results:
                    # OID terakhir adalah onu_id
                    parts = r.oid.split(".")
                    try:
                        onu_id = int(parts[-1])
                    except (ValueError, IndexError):
                        continue

                    if onu_id not in onus:
                        onus[onu_id] = ONUBasicInfo(
                            pon_index=pon_idx,
                            onu_id=onu_id,
                            board=board,
                            pon=pon
                        )
                    onus[onu_id].name = r.as_str()

            if not onus:
                logger.debug(f"Tidak ada ONU ditemukan di PON {board}/{pon}")
                return []

            # Ambil data tambahan untuk setiap ONU
            self._enrich_onu_data(onus, board, pon, pon_idx)

        except Exception as e:
            logger.error(f"Error get_all_onus_on_pon({board}/{pon}): {e}")

        return sorted(onus.values(), key=lambda x: x.onu_id)

    def _enrich_onu_data(self, onus: Dict[int, ONUBasicInfo],
                         board: int, pon: int, pon_idx: int) -> None:
        """Lengkapi data ONU (serial, status, model, dll) via individual GETs"""
        for onu_id, onu in onus.items():
            try:
                # Serial
                if self.profile.onu_serial:
                    oid = self._full_oid(self.profile.onu_serial, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        # Format GPON serial 8-byte: VENDOR-HEXSTRING (e.g. ZTEG-D824CDF3)
                        if r.raw_value and isinstance(r.raw_value, (bytes, bytearray)):
                            onu.serial = _format_gpon_serial(r.raw_value)
                        else:
                            raw_str = r.as_str()
                            onu.serial = _format_gpon_serial(raw_str) if raw_str else ""

                # Model
                if self.profile.onu_model:
                    oid = self._full_oid(self.profile.onu_model, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        onu.model = r.as_str()

                # Online status
                if self.profile.onu_online_status:
                    oid = self._full_oid(self.profile.onu_online_status, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        val = r.as_int()
                        if val is not None:
                            onu.online = (val == 1)
                            onu.status_raw = val
                        else:
                            # Jika tidak ada integer status, anggap ONLINE (ONU merespons SNMP)
                            onu.online = True
                            onu.status_raw = 1
                    else:
                        # ONU tidak merespons OID ini, anggap ONLINE (ditemukan di walk)
                        onu.online = True
                        onu.status_raw = 1
                elif self.profile.onu_status:
                    oid = self._full_oid(self.profile.onu_status, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        val = r.as_int()
                        if val is not None:
                            onu.online = (val == 1)
                            onu.status_raw = val
                        else:
                            onu.online = True
                            onu.status_raw = 1
                    else:
                        onu.online = True
                        onu.status_raw = 1
                else:
                    # Tidak ada status OID — ONU muncul di SNMP walk = ONLINE
                    onu.online = True
                    onu.status_raw = 1

                # Distance
                if self.profile.onu_distance:
                    oid = self._full_oid(self.profile.onu_distance, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        onu.distance_m = r.as_int() or 0

                # Firmware
                if self.profile.onu_firmware:
                    oid = self._full_oid(self.profile.onu_firmware, pon_idx, onu_id)
                    r = self.client.get(oid)
                    if r:
                        onu.firmware = r.as_str()

            except Exception as e:
                logger.debug(f"Error enriching ONU {board}/{pon}/{onu_id}: {e}")

    def get_onu_count_on_pon(self, board: int, pon: int) -> Tuple[int, int]:
        """
        Ambil jumlah ONU pada PON port

        Returns:
            (total_registered, total_online) — dari SNMP walk singkat
        """
        onus = self.get_all_onus_on_pon(board, pon)
        total = len(onus)
        online = sum(1 for o in onus if o.online)
        return total, online

    def get_onu_by_serial(self, serial: str,
                           boards: List[int] = None,
                           pons: List[int] = None) -> Optional[ONUBasicInfo]:
        """
        Cari ONU berdasarkan serial number
        
        Args:
            serial: Serial number (hex atau ZTEG hex string)
            boards: List board yang dicari (default [1])
            pons:   List pon yang dicari (default 1-8)
        Returns:
            ONUBasicInfo atau None
        """
        if boards is None:
            boards = [1]
        if pons is None:
            pons = list(range(1, 9))

        serial_upper = serial.upper().replace(":", "").replace(" ", "")

        for board in boards:
            for pon in pons:
                onus = self.get_all_onus_on_pon(board, pon)
                for onu in onus:
                    if onu.serial.upper() == serial_upper:
                        return onu

        return None

    def get_online_onus(self, board: int, pon: int) -> List[ONUBasicInfo]:
        """Ambil hanya ONU yang sedang online"""
        return [o for o in self.get_all_onus_on_pon(board, pon) if o.online]

    def get_offline_onus(self, board: int, pon: int) -> List[ONUBasicInfo]:
        """Ambil hanya ONU yang sedang offline"""
        return [o for o in self.get_all_onus_on_pon(board, pon) if not o.online]
