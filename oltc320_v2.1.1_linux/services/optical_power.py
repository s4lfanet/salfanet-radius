"""
Optical Power Service
Mengambil data optical power (RX/TX dBm) ONU dari OLT ZTE C320

Strategy:
  V2.1.x firmware: Optical power TIDAK tersedia via SNMP.
                   Fallback ke Telnet: "show gpon onu optical-info gpon-olt_1/{b}/{p} {id}"
  V2.2+  firmware: Optical power tersedia via SNMP OID langsung.

Threshold default:
  RX power: -8 dBm (terlalu tinggi / ONU terlalu dekat)
           -27 dBm (batas normal minimum)
           -30 dBm (dying gasp zone)
  TX power: +5 dBm (max normal)
             0 dBm (min normal)
"""
import re
import logging
from typing import Optional, Tuple, Dict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class OpticalPowerReading:
    """Pembacaan optical power satu ONU"""
    board: int
    pon: int
    onu_id: int
    onu_name: str = ""

    # dBm values (None = tidak tersedia atau error baca)
    rx_power_dbm: Optional[float] = None
    tx_power_dbm: Optional[float] = None

    # Source: "snmp" atau "telnet"
    source: str = ""

    # Status setelah evaluate
    rx_status: str = ""   # "normal", "low", "high", "critical", "unknown"
    tx_status: str = ""

    # Threshold yang dipakai
    rx_low_warn: float = -27.0
    rx_low_crit: float = -30.0
    rx_high_warn: float = -8.0
    tx_low_warn: float = 0.0
    tx_high_warn: float = 5.0

    def evaluate(self) -> None:
        """Evaluasi level rx/tx dan set status"""
        if self.rx_power_dbm is not None:
            rx = self.rx_power_dbm
            if rx >= self.rx_high_warn:
                self.rx_status = "high"
            elif rx >= self.rx_low_warn:
                self.rx_status = "normal"
            elif rx >= self.rx_low_crit:
                self.rx_status = "low"
            else:
                self.rx_status = "critical"
        else:
            self.rx_status = "unknown"

        if self.tx_power_dbm is not None:
            tx = self.tx_power_dbm
            if tx > self.tx_high_warn:
                self.tx_status = "high"
            elif tx >= self.tx_low_warn:
                self.tx_status = "normal"
            else:
                self.tx_status = "low"
        else:
            self.tx_status = "unknown"

    @property
    def is_signal_ok(self) -> bool:
        """True jika rx power dalam batas normal"""
        return self.rx_status == "normal"

    @property
    def is_critical(self) -> bool:
        """True jika rx power di zona dying gasp"""
        return self.rx_status == "critical"

    @property
    def rx_str(self) -> str:
        if self.rx_power_dbm is not None:
            return f"{self.rx_power_dbm:.2f} dBm"
        return "N/A"

    @property
    def tx_str(self) -> str:
        if self.tx_power_dbm is not None:
            return f"{self.tx_power_dbm:.2f} dBm"
        return "N/A"

    def to_dict(self) -> dict:
        return {
            "board": self.board,
            "pon": self.pon,
            "onu_id": self.onu_id,
            "onu_name": self.onu_name,
            "rx_power_dbm": self.rx_power_dbm,
            "tx_power_dbm": self.tx_power_dbm,
            "rx_status": self.rx_status,
            "tx_status": self.tx_status,
            "source": self.source,
        }


class OpticalPowerService:
    """
    Service untuk mengambil optical power ONU

    Otomatis memilih antara SNMP (V2.2+) atau Telnet (V2.1).

    Usage:
        svc = OpticalPowerService(snmp_client, oid_profile)
        # Set telnet_client untuk V2.1 fallback
        svc.set_telnet_client(telnet_client)

        reading = svc.get_optical_power(board=1, pon=1, onu_id=1)
        print(reading.rx_str, reading.tx_str, reading.rx_status)
    """

    def __init__(self, snmp_client=None, oid_profile=None,
                 telnet_client=None):
        """
        Args:
            snmp_client:   Instance SNMPClient (None jika tidak pakai SNMP)
            oid_profile:   Instance OIDProfile
            telnet_client: Instance TelnetClient (untuk fallback V2.1)
        """
        self.snmp = snmp_client
        self.profile = oid_profile
        self.telnet = telnet_client

        # Default thresholds
        self.rx_low_warn  = -27.0
        self.rx_low_crit  = -30.0
        self.rx_high_warn = -8.0
        self.tx_low_warn  = 0.0
        self.tx_high_warn = 5.0

    def set_telnet_client(self, telnet_client) -> None:
        """Set telnet client untuk fallback V2.1"""
        self.telnet = telnet_client

    def set_thresholds(self, thresholds: dict) -> None:
        """
        Update threshold dari config

        Args:
            thresholds: dict dengan keys rx_signal_low, rx_signal_critical,
                        rx_signal_high, tx_signal_low, tx_signal_high
        """
        self.rx_low_warn  = thresholds.get("rx_signal_low", self.rx_low_warn)
        self.rx_low_crit  = thresholds.get("rx_signal_critical", self.rx_low_crit)
        self.rx_high_warn = thresholds.get("rx_signal_high", self.rx_high_warn)
        self.tx_low_warn  = thresholds.get("tx_signal_low", self.tx_low_warn)
        self.tx_high_warn = thresholds.get("tx_signal_high", self.tx_high_warn)

    def _pon_index(self, board: int, pon: int) -> int:
        from core.firmware_detector import FirmwareDetector
        return FirmwareDetector.calculate_pon_index(board, pon)

    # ------------------------------------------------------------------
    # SNMP Method (V2.2+)
    # ------------------------------------------------------------------

    def _get_via_snmp(self, board: int, pon: int, onu_id: int) -> OpticalPowerReading:
        """Ambil optical power via SNMP (V2.2+)"""
        reading = OpticalPowerReading(board=board, pon=pon, onu_id=onu_id, source="snmp")
        pon_idx = self._pon_index(board, pon)

        try:
            # RX power
            if self.profile.onu_rx_power:
                oid = f"{self.profile.base_oid}{self.profile.onu_rx_power}.{pon_idx}.{onu_id}"
                r = self.snmp.get(oid)
                if r:
                    val = r.as_int()
                    if val is not None:
                        # ZTE menyimpan dalam 0.01 dBm (multiply=0.01)
                        reading.rx_power_dbm = val / 100.0

            # TX power
            if self.profile.onu_tx_power:
                oid = f"{self.profile.base_oid}{self.profile.onu_tx_power}.{pon_idx}.{onu_id}"
                r = self.snmp.get(oid)
                if r:
                    val = r.as_int()
                    if val is not None:
                        reading.tx_power_dbm = val / 100.0

        except Exception as e:
            logger.debug(f"SNMP optical power error ({board}/{pon}/{onu_id}): {e}")

        return reading

    # ------------------------------------------------------------------
    # Telnet Fallback Method (V2.1)
    # ------------------------------------------------------------------

    def _telnet_cmd(self, cmd: str, timeout: int = 10) -> str:
        """
        Eksekusi command Telnet dan return output string.
        execute_command() returns (bool, str) — unwrap safely.
        """
        result = self.telnet.execute_command(cmd, timeout)
        if isinstance(result, tuple):
            ok, output = result
            return output if ok else ""
        return str(result) if result else ""

    def _get_via_telnet(self, board: int, pon: int, onu_id: int) -> OpticalPowerReading:
        """
        Ambil optical power via Telnet (V2.1 fallback).

        ZTE C320 V2.1 commands:
          show pon power onu-rx gpon-olt_1/{board}/{pon}  → ONU RX power (ONU side)
          show pon power olt-rx gpon-olt_1/{board}/{pon}  → OLT RX power (≈ ONU TX uplink)

        Output format:
          Onu                 Rx power
          ------------------------------------
          gpon-onu_1/1/1:1    -10.916(dbm)
        """
        reading = OpticalPowerReading(board=board, pon=pon, onu_id=onu_id, source="telnet")

        if not self.telnet:
            logger.debug("Telnet client tidak tersedia untuk optical power")
            return reading

        try:
            pon_iface = f"gpon-olt_1/{board}/{pon}"

            # ONU RX power (power yang diterima ONU dari OLT)
            rx_out = self._telnet_cmd(f"show pon power onu-rx {pon_iface}")
            reading.rx_power_dbm = self._parse_pon_power_by_onu(rx_out, onu_id)

            # OLT RX power (power yang diterima OLT dari ONU = ONU TX uplink)
            tx_out = self._telnet_cmd(f"show pon power olt-rx {pon_iface}")
            reading.tx_power_dbm = self._parse_pon_power_by_onu(tx_out, onu_id)

        except Exception as e:
            logger.debug(f"Telnet optical power error ({board}/{pon}/{onu_id}): {e}")

        return reading

    @staticmethod
    def _parse_pon_power_by_onu(output: str, onu_id: int) -> Optional[float]:
        """
        Parse output dari 'show pon power onu-rx/olt-rx'.

        Format output ZTE C320:
          gpon-onu_1/1/1:2    -22.34(dbm)
          gpon-onu_1/1/1:3    -19.10(dbm)

        Args:
            output:  raw output string dari Telnet
            onu_id:  ONU ID yang dicari (nomor setelah ':' di interface name)
        Returns:
            float dBm atau None jika tidak ditemukan
        """
        if not output:
            return None

        # Pola: gpon-onu_{path}:{onu_id}    {value}(dbm)
        exact = re.compile(
            rf'gpon-onu_[\d/]+:{onu_id}\s+([-\d.]+)\(dbm\)', re.IGNORECASE
        )
        for line in output.replace('\r\n', '\n').split('\n'):
            m = exact.search(line)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    pass

        # Fallback: ambil semua entry, urutkan, pilih berdasarkan posisi urutan
        # (biasanya ONU ID mulai dari 1 di Telnet, tapi mulai dari 2 di SNMP)
        all_entries = re.compile(
            r'gpon-onu_[\d/]+:(\d+)\s+([-\d.]+)\(dbm\)', re.IGNORECASE
        )
        entries = []
        for line in output.replace('\r\n', '\n').split('\n'):
            m = all_entries.search(line)
            if m:
                entries.append((int(m.group(1)), float(m.group(2))))

        if not entries:
            return None

        # Pilih berdasarkan posisi relatif:
        # jika onu_id > max_telnet_seq, ambil entry terakhir
        # jika onu_id <= max_telnet_seq, ambil entry ke-(onu_id-1)
        entries.sort(key=lambda x: x[0])
        idx = onu_id - 1  # onu_id=1 → idx=0, onu_id=2 → idx=1
        if 0 <= idx < len(entries):
            return entries[idx][1]
        # Last resort: return first entry
        return entries[0][1]

    def get_all_optical_power_on_pon(self, board: int, pon: int) -> Dict[int, "OpticalPowerReading"]:
        """
        Ambil optical power semua ONU pada satu PON sekaligus via Telnet.

        Returns:
            Dict {telnet_seq_id: OpticalPowerReading} — key adalah nomor urut ONU di Telnet
        """
        results: Dict[int, "OpticalPowerReading"] = {}

        if not self.telnet:
            return results

        try:
            pon_iface = f"gpon-olt_1/{board}/{pon}"

            rx_out = self._telnet_cmd(f"show pon power onu-rx {pon_iface}")
            tx_out = self._telnet_cmd(f"show pon power olt-rx {pon_iface}")

            # Parse semua entry
            entry_pat = re.compile(
                r'gpon-onu_[\d/]+:(\d+)\s+([-\d.]+)\(dbm\)', re.IGNORECASE
            )

            rx_map: Dict[int, float] = {}
            for line in rx_out.replace('\r\n', '\n').split('\n'):
                m = entry_pat.search(line)
                if m:
                    rx_map[int(m.group(1))] = float(m.group(2))

            tx_map: Dict[int, float] = {}
            for line in tx_out.replace('\r\n', '\n').split('\n'):
                m = entry_pat.search(line)
                if m:
                    tx_map[int(m.group(1))] = float(m.group(2))

            for seq_id in sorted(set(list(rx_map.keys()) + list(tx_map.keys()))):
                rd = OpticalPowerReading(
                    board=board, pon=pon, onu_id=seq_id, source="telnet",
                    rx_power_dbm=rx_map.get(seq_id),
                    tx_power_dbm=tx_map.get(seq_id),
                    rx_low_warn=self.rx_low_warn,
                    rx_low_crit=self.rx_low_crit,
                    rx_high_warn=self.rx_high_warn,
                    tx_low_warn=self.tx_low_warn,
                    tx_high_warn=self.tx_high_warn,
                )
                rd.evaluate()
                results[seq_id] = rd

        except Exception as e:
            logger.debug(f"Telnet batch optical error ({board}/{pon}): {e}")

        return results

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_optical_power(self, board: int, pon: int, onu_id: int,
                           onu_name: str = "") -> OpticalPowerReading:
        """
        Ambil optical power ONU (auto-pilih SNMP atau Telnet)

        Args:
            board:    Board number (1-based)
            pon:      PON port (1-based)
            onu_id:   ONU ID
            onu_name: Nama ONU (opsional, untuk display)
        Returns:
            OpticalPowerReading dengan nilai rx/tx dan evaluasi status
        """
        # Pilih method berdasarkan profil firmware
        if self.profile and self.profile.snmp_optical_power and self.snmp:
            reading = self._get_via_snmp(board, pon, onu_id)
        else:
            # V2.1 atau SNMP tidak tersedia: pakai Telnet
            reading = self._get_via_telnet(board, pon, onu_id)

        reading.onu_name = onu_name
        reading.rx_low_warn  = self.rx_low_warn
        reading.rx_low_crit  = self.rx_low_crit
        reading.rx_high_warn = self.rx_high_warn
        reading.tx_low_warn  = self.tx_low_warn
        reading.tx_high_warn = self.tx_high_warn
        reading.evaluate()

        return reading

    def batch_get_optical_power(
            self,
            onus: list,   # List [{"board":1,"pon":1,"onu_id":1,"name":"..."}]
    ) -> Dict[str, OpticalPowerReading]:
        """
        Ambil optical power banyak ONU sekaligus

        Args:
            onus: List dict dengan keys board, pon, onu_id, name
        Returns:
            Dict {"1/1/1": OpticalPowerReading}
        """
        results = {}
        for onu in onus:
            board  = onu.get("board", 1)
            pon    = onu.get("pon", 1)
            onu_id = onu.get("onu_id", 1)
            name   = onu.get("name", "")
            key = f"{board}/{pon}/{onu_id}"
            results[key] = self.get_optical_power(board, pon, onu_id, name)
        return results

    def get_signal_summary(self, reading: OpticalPowerReading) -> str:
        """
        Format ringkasan signal untuk Telegram/display

        Returns:
            String seperti "RX: -22.34 dBm (normal) | TX: 2.50 dBm (normal)"
        """
        rx_part = f"RX: {reading.rx_str} [{reading.rx_status.upper()}]"
        tx_part = f"TX: {reading.tx_str} [{reading.tx_status.upper()}]"
        return f"{rx_part} | {tx_part}"
