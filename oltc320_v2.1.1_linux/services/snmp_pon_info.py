"""
SNMP PON Port Info Service
Mengambil informasi PON port (status, ONU count, jarak) via SNMP dari OLT ZTE C320
"""
import logging
from typing import List, Optional, Dict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PONPortStatus:
    """Informasi satu PON port"""
    board: int
    pon: int
    pon_index: int
    admin_status: int = 0    # 1=up, 2=down
    oper_status: int = 0     # 1=up, 2=down
    onu_count: int = 0
    max_distance_m: int = 0
    description: str = ""    # Deskripsi port dari Telnet

    @property
    def port_string(self) -> str:
        return f"gpon-olt_1/{self.board}/{self.pon}"

    @property
    def is_up(self) -> bool:
        return self.oper_status == 1

    @property
    def admin_label(self) -> str:
        return "UP" if self.admin_status == 1 else "DOWN"

    @property
    def oper_label(self) -> str:
        return "UP" if self.oper_status == 1 else "DOWN"

    def to_dict(self) -> dict:
        return {
            "board": self.board,
            "pon": self.pon,
            "pon_index": self.pon_index,
            "port": self.port_string,
            "admin_status": self.admin_label,
            "oper_status": self.oper_label,
            "onu_count": self.onu_count,
            "max_distance_m": self.max_distance_m,
            "is_up": self.is_up,
        }


class SNMPPONInfo:
    """
    Service untuk membaca informasi PON port via SNMP

    Usage:
        pon_svc = SNMPPONInfo(snmp_client, oid_profile)
        ports = pon_svc.get_all_pon_ports(boards=[1], pons=range(1,9))
        for port in ports:
            print(port.port_string, port.oper_label, port.onu_count)
    """

    def __init__(self, snmp_client, oid_profile):
        self.client = snmp_client
        self.profile = oid_profile

    def _pon_index(self, board: int, pon: int) -> int:
        from core.firmware_detector import FirmwareDetector
        return FirmwareDetector.calculate_pon_index(board, pon)

    def _full_oid(self, rel_oid: str, pon_index: int) -> str:
        return f"{self.profile.base_oid}{rel_oid}.{pon_index}"

    def get_pon_status(self, board: int, pon: int) -> Optional[PONPortStatus]:
        """
        Ambil status satu PON port

        Returns:
            PONPortStatus atau None jika gagal
        """
        pon_idx = self._pon_index(board, pon)
        port = PONPortStatus(board=board, pon=pon, pon_index=pon_idx)

        try:
            # Admin status
            if self.profile.pon_admin_status:
                r = self.client.get(self._full_oid(self.profile.pon_admin_status, pon_idx))
                if r:
                    port.admin_status = r.as_int() or 0

            # Oper status
            if self.profile.pon_oper_status:
                r = self.client.get(self._full_oid(self.profile.pon_oper_status, pon_idx))
                if r:
                    port.oper_status = r.as_int() or 0

            # ONU count
            if self.profile.pon_onu_count:
                r = self.client.get(self._full_oid(self.profile.pon_onu_count, pon_idx))
                if r:
                    port.onu_count = r.as_int() or 0

            # Max distance
            if self.profile.pon_distance:
                r = self.client.get(self._full_oid(self.profile.pon_distance, pon_idx))
                if r:
                    port.max_distance_m = r.as_int() or 0

            return port

        except Exception as e:
            logger.error(f"Error get_pon_status({board}/{pon}): {e}")
            return None

    def scan_via_telnet(self,
                        telnet_client,
                        board: int = 1,
                        max_pon: int = 16) -> List[PONPortStatus]:
        """
        Scan status PON port via Telnet (lebih akurat untuk V2.1).

        Menggunakan `show interface gpon-olt_1/{board}/{pon}` per port.
        Menghasilkan status yang sebenarnya (activate/deactivate) — tidak depends
        pada SNMP OID yang nilainya tidak membedakan keduanya di V2.1.

        Output Telnet yang diparsing:
          "gpon-olt_1/1/1 is activate,line protocol is up."
          "Description is BBBBBB."
          "The port has 128 onus, the number of registered onus is 1."

        Args:
            telnet_client: Instance TelnetClient
            board:         Board number (default 1)
            max_pon:       Max PON port yang dicoba (default 16)
        Returns:
            List[PONPortStatus] — hanya port yang ada (error stop scan)
        """
        import re
        results = []

        for pon in range(1, max_pon + 1):
            try:
                cmd = f"show interface gpon-olt_1/{board}/{pon}"
                result = telnet_client.execute_command(cmd, timeout=5)
                ok, out = result if isinstance(result, tuple) else (True, str(result))

                if not ok or "%Error" in out:
                    break  # Tidak ada port ini, hentikan scan

                port = PONPortStatus(
                    board=board,
                    pon=pon,
                    pon_index=self._pon_index(board, pon),
                )

                lines = out.replace('\r\n', '\n').split('\n')
                for line in lines:
                    line_s = line.strip()

                    # Status: "gpon-olt_1/1/1 is activate,line protocol is up"
                    if "is activate" in line_s and "line protocol is up" in line_s:
                        port.admin_status = 1
                        port.oper_status  = 1
                    elif "is activate" in line_s and "line protocol is" in line_s:
                        port.admin_status = 1
                        port.oper_status  = 2
                    elif "is deactivate" in line_s:
                        port.admin_status = 2
                        port.oper_status  = 2

                    # ONU count dari "registered onus is N" (hanya working, simpan sebagai fallback)
                    m = re.search(r'registered onus is\s+(\d+)', line_s, re.I)
                    if m:
                        port.onu_count = int(m.group(1))

                    # Max distance dari konfigurasi atau default
                    m2 = re.search(r'max[-\s]?distance.*?(\d+)', line_s, re.I)
                    if m2:
                        port.max_distance_m = int(m2.group(1))

                    # Description — simpan untuk display
                    m3 = re.match(r'Description is (.+)\.?$', line_s, re.I)
                    if m3:
                        port.description = m3.group(1).rstrip('.')

                # Hitung TOTAL ONU (working + unconfig) via show gpon onu state
                # agar ONU unconfig juga ikut terhitung
                try:
                    cmd2 = f"show gpon onu state gpon-olt_1/{board}/{pon}"
                    res2 = telnet_client.execute_command(cmd2, timeout=5)
                    ok2, out2 = res2 if isinstance(res2, tuple) else (True, str(res2))
                    if ok2 and "%Error" not in out2:
                        import re as _re
                        total = sum(
                            1 for ln in out2.replace('\r\n', '\n').split('\n')
                            if _re.match(r'\s*\d+/\d+/\d+:\d+', ln.strip())
                        )
                        if total > 0:
                            port.onu_count = total  # overwrite dengan count lengkap
                except Exception:
                    pass  # gunakan onu_count dari show interface

                results.append(port)

            except Exception as e:
                logger.debug(f"Telnet scan PON {board}/{pon}: {e}")
                break

        return results

    def get_all_pon_ports(self,
                           boards: List[int] = None,
                           pons: List[int] = None) -> List[PONPortStatus]:
        """
        Ambil status semua PON port

        Args:
            boards: List board (default [1])
            pons:   List pon port (default 1-16)
        Returns:
            List PONPortStatus
        """
        if boards is None:
            boards = [1]
        if pons is None:
            pons = list(range(1, 17))

        results = []
        for board in boards:
            for pon in pons:
                try:
                    status = self.get_pon_status(board, pon)
                    if status:
                        results.append(status)
                except Exception as e:
                    logger.debug(f"Skip PON {board}/{pon}: {e}")

        return results

    def get_active_pon_ports(self,
                              boards: List[int] = None,
                              pons: List[int] = None) -> List[PONPortStatus]:
        """Ambil hanya PON port yang oper_status UP"""
        return [p for p in self.get_all_pon_ports(boards, pons) if p.is_up]

    def get_pon_summary(self,
                         boards: List[int] = None,
                         pons: List[int] = None) -> Dict:
        """
        Ringkasan statistik semua PON port

        Returns:
            dict dengan keys: total_ports, active_ports, total_onus, ports
        """
        ports = self.get_all_pon_ports(boards, pons)
        active = [p for p in ports if p.is_up]
        total_onus = sum(p.onu_count for p in ports)

        return {
            "total_ports": len(ports),
            "active_ports": len(active),
            "down_ports": len(ports) - len(active),
            "total_onus": total_onus,
            "ports": [p.to_dict() for p in ports],
        }
