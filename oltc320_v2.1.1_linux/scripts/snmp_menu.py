"""
SNMP CLI Menu untuk oltc320
Menu interaktif untuk akses data OLT via SNMP

Dapat dijalankan standalone:
    python scripts/snmp_menu.py

Atau diintegrasikan ke scripts/olt_complete_menu.py:
    from scripts.snmp_menu import show_snmp_menu
    show_snmp_menu(profile, telnet_client)
"""
import sys
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Tambah root ke path
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)


def _clear():
    os.system("cls" if os.name == "nt" else "clear")


def _header(title: str) -> None:
    """Print header menu"""
    print("=" * 50)
    print(f"  {title}")
    print("=" * 50)


def _wait():
    input("\nTekan Enter untuk kembali...")


def _get_snmp_services(profile: dict):
    """
    Buat semua SNMP service dari profile dict
    Returns:
        (snmp_client, oid_profile, onu_monitor, pon_svc, system_svc, optical_svc)
        atau tuple of None jika gagal
    """
    try:
        from core.snmp_client import create_snmp_client
        from core.firmware_detector import FirmwareDetector
        from services.snmp_onu_monitor import SNMPONUMonitor
        from services.snmp_pon_info import SNMPPONInfo
        from services.snmp_system import SNMPSystemHealth
        from services.optical_power import OpticalPowerService

        snmp = create_snmp_client(profile)
        if not snmp:
            print("\n[!] SNMP tidak dikonfigurasi. Isi snmp_community di profile OLT.")
            return None, None, None, None, None, None

        print("Mendeteksi firmware OLT...")
        detector = FirmwareDetector(snmp)
        oid_profile = detector.get_oid_profile()
        print(f"Firmware: {oid_profile.firmware.value} | OID Base: {oid_profile.base_oid}")

        onu_svc    = SNMPONUMonitor(snmp, oid_profile)
        pon_svc    = SNMPPONInfo(snmp, oid_profile)
        sys_svc    = SNMPSystemHealth(snmp, oid_profile)
        optical_svc = OpticalPowerService(snmp_client=snmp, oid_profile=oid_profile)

        return snmp, oid_profile, onu_svc, pon_svc, sys_svc, optical_svc

    except Exception as e:
        print(f"\n[!] Error inisialisasi SNMP: {e}")
        return None, None, None, None, None, None


# ---------------------------------------------------------------------------
# Submenu handlers
# ---------------------------------------------------------------------------

def _menu_snmp_test(snmp, oid_profile):
    _clear()
    _header("Test Koneksi SNMP")
    print(f"Host      : {snmp.config.host}")
    print(f"Community : {snmp.config.community}")
    print(f"Port      : {snmp.config.port}")
    print(f"Firmware  : {oid_profile.firmware.value}")
    print()

    print("Menguji koneksi SNMP...")
    ok, msg = snmp.test_connection()
    if ok:
        print(f"[OK] {msg}")
    else:
        print(f"[GAGAL] {msg}")

    if ok:
        # Extra info
        uptime_ticks, uptime_fmt = None, "N/A"
        try:
            ticks = snmp.get_system_uptime()
            if ticks:
                from services.snmp_system import OLTSystemInfo
                uptime_fmt = OLTSystemInfo(sys_uptime_ticks=ticks).uptime_formatted
        except Exception:
            pass
        print(f"Uptime    : {uptime_fmt}")

    _wait()


def _menu_system_health(sys_svc):
    _clear()
    _header("Health Check OLT")
    print("Mengambil informasi sistem...")

    info = sys_svc.get_system_info()
    print(f"\nNama     : {info.sys_name or 'N/A'}")
    print(f"Uptime   : {info.uptime_formatted}")
    print(f"Lokasi   : {info.sys_location or 'N/A'}")
    print(f"Kontak   : {info.sys_contact or 'N/A'}")
    if info.sys_description:
        desc = info.sys_description[:70] + ("..." if len(info.sys_description) > 70 else "")
        print(f"SysDescr : {desc}")

    if info.cards:
        print(f"\nCards ({len(info.cards)} total):")
        for card in info.cards:
            status = "OK" if card.is_normal else "ABNORMAL"
            print(f"  Slot {card.slot_string}: {card.card_type or 'N/A'} [{status}]")
            if card.sw_version:
                print(f"           SW: {card.sw_version}")

        if info.abnormal_cards:
            print(f"\n[!] Card bermasalah: {len(info.abnormal_cards)}")

    _wait()


# ---------------------------------------------------------------------------
# Helper: Pilih PON port dari hasil scan SNMP
# ---------------------------------------------------------------------------

def _select_pon_port(onu_svc, title="Pilih PON Port", telnet_client=None, pon_svc=None):
    """
    Scan PON 1-16 pada board 1.
    Jika ada telnet_client: gunakan Telnet (status akurat + ONU count aktual).
    Fallback: SNMP walk ONU table.
    Returns (board, pon) atau None jika batal.
    """
    board = 1
    found = []  # (pon, onu_count, is_active)

    if telnet_client and pon_svc:
        # Gunakan Telnet untuk status akurat
        print("\nMemindai PON port via Telnet...")
        ports = pon_svc.scan_via_telnet(telnet_client, board=board, max_pon=16)
        for p in ports:
            found.append((p.pon, p.onu_count, p.is_up, p.description))
    else:
        # Fallback: cek keberadaan ONU via SNMP
        print("\nMemindai PON port via SNMP...")
        for pon in range(1, 17):
            try:
                onus = onu_svc.get_all_onus_on_pon(board, pon)
                found.append((pon, len(onus), len(onus) > 0, ""))
            except Exception:
                found.append((pon, 0, False, ""))

    if not found:
        found = [(pon, 0, False, "") for pon in range(1, 17)]

    print(f"\n  {title}")
    print("  " + "-" * 48)
    for i, item in enumerate(found, 1):
        pon, cnt, active, desc = item
        status = "AKTIF" if active else "nonaktif"
        desc_str = f" | {desc}" if desc else ""
        mark = " *" if cnt > 0 else ""
        print(f"  {i:2}. gpon-olt_1/{board}/{pon:<3}  [{status}]  {cnt} ONU{mark}{desc_str}")
    print("   0. Batal")

    try:
        choice = int(input("\n  Pilih: ").strip())
    except ValueError:
        return None

    if choice == 0:
        return None
    if 1 <= choice <= len(found):
        return (board, found[choice - 1][0])
    print("[!] Pilihan tidak valid")
    return None


def _select_onu(onus, title="Pilih ONU"):
    """
    Tampilkan daftar ONU bernomor, kembalikan ONUBasicInfo yang dipilih atau None.
    """
    if not onus:
        return None

    print(f"\n  {title}")
    print(f"  {'No':<4} {'ID':<5} {'Nama':<22} {'Serial':<18} {'Model':<12} Status")
    print("  " + "-" * 68)
    for i, o in enumerate(onus, 1):
        status = "ONLINE" if o.online else "OFFLINE"
        print(
            f"  {i:<4} {o.onu_id:<5} {(o.name or '-')[:20]:<22} "
            f"{(o.serial or '-')[:16]:<18} {(o.model or '-')[:10]:<12} {status}"
        )
    print("  0. Batal")

    try:
        choice = int(input("\n  Pilih: ").strip())
    except ValueError:
        return None

    if choice == 0:
        return None
    if 1 <= choice <= len(onus):
        return onus[choice - 1]
    print("[!] Pilihan tidak valid")
    return None


# ---------------------------------------------------------------------------
# Menu handlers
# ---------------------------------------------------------------------------

def _menu_pon_status(pon_svc, telnet_client=None):
    _clear()
    _header("Status PON Port")

    if telnet_client:
        print("Memindai semua PON port via Telnet (status akurat)...")
        ports = pon_svc.scan_via_telnet(telnet_client, board=1, max_pon=16)
        source = "Telnet"
    else:
        print("Memindai PON port via SNMP (board 1, PON 1-16)...")
        ports = pon_svc.get_all_pon_ports(boards=[1], pons=list(range(1, 17)))
        source = "SNMP"

    if not ports:
        print(f"Tidak ada data PON ({source} tidak merespons)")
        _wait()
        return

    print(f"\n  Sumber data: {source}")
    print(f"\n{'Port':<22} {'Status':<12} {'ONU':<6} {'Deskripsi'}")
    print("-" * 65)
    for p in ports:
        status_str = "AKTIF" if p.is_up else "nonaktif"
        desc = getattr(p, 'description', '') or "-"
        print(
            f"{p.port_string:<22} {status_str:<12} {p.onu_count:<6} {desc}"
        )

    active = sum(1 for p in ports if p.is_up)
    total_onus = sum(p.onu_count for p in ports)
    print(f"\nRingkasan: {active}/{len(ports)} port AKTIF | Total ONU terdaftar: {total_onus}")
    _wait()


def _get_onu_telnet_detail(telnet_client, board: int, pon: int, onu_seq: int) -> dict:
    """
    Ambil detail ONU via Telnet: `show gpon onu detail-info gpon-onu_1/{board}/{pon}:{seq}`
    Returns dict of fields.
    """
    import re
    detail = {}
    if not telnet_client:
        return detail
    try:
        cmd = f"show gpon onu detail-info gpon-onu_1/{board}/{pon}:{onu_seq}"
        result = telnet_client.execute_command(cmd, timeout=8)
        ok, out = result if isinstance(result, tuple) else (True, str(result))
        if not ok or "%Error" in out:
            return detail

        field_map = {
            r'Name:\s+(.+)':            'name',
            r'Serial number:\s+(\S+)':  'serial',
            r'Description:\s+(.+)':     'description',
            r'Admin state:\s+(\S+)':    'admin_state',
            r'Phase state:\s+(\S+)':    'phase_state',
            r'Config state:\s+(\S+)':   'config_state',
            r'ONU Distance:\s+(\S+)':   'distance',
            r'Online Duration:\s+(.+)': 'online_duration',
            r'Line Profile:\s+(\S+)':   'line_profile',
            r'Service Profile:\s+(\S+)':'service_profile',
            r'DBA Mode:\s+(\S+)':       'dba_mode',
            r'State:\s+(\S+)':          'state',
        }

        for line in out.replace('\r\n', '\n').split('\n'):
            line_s = line.strip()
            for pat, key in field_map.items():
                m = re.match(pat, line_s, re.I)
                if m and key not in detail:
                    detail[key] = m.group(1).strip()

        # Auth/offline history table
        history = []
        in_table = False
        for line in out.replace('\r\n', '\n').split('\n'):
            if 'AuthpassTime' in line or 'Authpass Time' in line:
                in_table = True
                continue
            if in_table:
                m = re.match(r'\s*(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)(?:\s+(.+))?', line)
                if m:
                    auth_t = m.group(2)
                    off_t  = m.group(3)
                    cause  = (m.group(4) or '').strip()
                    if auth_t != '0000-00-00 00:00:00' or off_t != '0000-00-00 00:00:00':
                        history.append({'auth': auth_t, 'offline': off_t, 'cause': cause})
        detail['history'] = history

    except Exception as e:
        pass
    return detail


def _get_onu_seq_map(telnet_client, board: int, pon: int) -> dict:
    """
    Ambil mapping seq_id → serial dari Telnet `show gpon onu state`.
    Returns dict {seq_id: {'serial': ..., 'state': ..., 'channel': ...}}
    """
    import re
    result_map = {}
    if not telnet_client:
        return result_map
    try:
        cmd = f"show gpon onu state gpon-olt_1/{board}/{pon}"
        result = telnet_client.execute_command(cmd, timeout=8)
        ok, out = result if isinstance(result, tuple) else (True, str(result))
        if not ok:
            return result_map
        for line in out.replace('\r\n', '\n').split('\n'):
            # Format: "1/1/1:1     enable  enable  working  1(GPON)"
            m = re.match(r'\s*\d+/\d+/\d+:(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)', line.strip())
            if m:
                seq = int(m.group(1))
                result_map[seq] = {'admin': m.group(2), 'omcc': m.group(3), 'phase': m.group(4), 'channel': m.group(5)}
    except Exception:
        pass
    return result_map


def _menu_onu_list(onu_svc, telnet_client=None, pon_svc=None):
    _clear()
    _header("Daftar ONU di PON")

    sel = _select_pon_port(onu_svc, "Pilih PON Port", telnet_client=telnet_client, pon_svc=pon_svc)
    if not sel:
        return
    board, pon = sel

    print(f"\nMengambil ONU di gpon-olt_1/{board}/{pon}...")
    onus = onu_svc.get_all_onus_on_pon(board, pon)

    if not onus:
        print("Tidak ada ONU ditemukan")
        _wait()
        return

    online  = [o for o in onus if o.online]
    offline = [o for o in onus if not o.online]

    print(f"\nTotal: {len(onus)} | Online: {len(online)} | Offline: {len(offline)}")
    print(f"\n{'ID':<5} {'Nama':<22} {'Serial':<18} {'Model':<14} {'Status'}")
    print("-" * 70)
    for o in onus:
        status = "ONLINE" if o.online else "OFFLINE"
        serial = (o.serial or "-")[:16]
        model  = (o.model or "-")[:12]
        name   = (o.name or "-")[:20]
        print(f"{o.onu_id:<5} {name:<22} {serial:<18} {model:<14} {status}")

    # Pilih ONU untuk detail lengkap
    print("\n[Tekan Enter untuk kembali, atau pilih nomor ONU untuk detail]")
    try:
        choice_raw = input("  Pilih (nomor/Enter): ").strip()
        if not choice_raw:
            return
        choice = int(choice_raw)
    except ValueError:
        _wait()
        return

    if 1 <= choice <= len(onus):
        o = onus[choice - 1]
        print()
        print("=" * 52)
        print(f"  Detail ONU \u2014 {o.name or f'ONU-{o.onu_id}'}")
        print("=" * 52)
        print(f"  ONU ID         : {o.onu_id}")
        print(f"  Nama           : {o.name or '-'}")
        print(f"  Serial         : {o.serial or '-'}")
        print(f"  Model          : {o.model or '-'}")
        print(f"  Status         : {'ONLINE' if o.online else 'OFFLINE'}")
        # SNMP fields jika ada
        for attr, label in [
            ('description',  'Deskripsi SNMP'),
            ('firmware',     'Firmware'),
            ('distance_m',   'Jarak (m)'),
            ('last_online',  'Last Online'),
            ('last_offline', 'Last Offline'),
            ('onu_port_string', 'Interface'),
        ]:
            val = getattr(o, attr, None)
            if val:
                print(f"  {label:<15}: {val}")

        # Detail tambahan via Telnet (jauh lebih lengkap)
        if telnet_client:
            print()
            print("  [Memuat detail via Telnet...]")
            seq_map = _get_onu_seq_map(telnet_client, board, pon)
            onu_seq = o.onu_id  # fallback
            if len(seq_map) == 1:
                onu_seq = list(seq_map.keys())[0]
            elif len(seq_map) > 1:
                sorted_snmp = sorted([oo.onu_id for oo in onus])
                sorted_seqs = sorted(seq_map.keys())
                idx = sorted_snmp.index(o.onu_id) if o.onu_id in sorted_snmp else 0
                if idx < len(sorted_seqs):
                    onu_seq = sorted_seqs[idx]

            detail = _get_onu_telnet_detail(telnet_client, board, pon, onu_seq)
            if detail:
                print()
                for field, label in [
                    ('description',    'Deskripsi'),
                    ('admin_state',    'Admin State'),
                    ('phase_state',    'Phase State'),
                    ('config_state',   'Config State'),
                    ('state',          'State'),
                    ('distance',       'Jarak ONU'),
                    ('online_duration','Online Selama'),
                    ('line_profile',   'Line Profile'),
                    ('service_profile','Service Profile'),
                    ('dba_mode',       'DBA Mode'),
                ]:
                    v = detail.get(field)
                    if v and v not in ('N/A', 'none', '-'):
                        print(f"  {label:<15}: {v}")

                hist = detail.get('history', [])
                if hist:
                    print("\n  Riwayat Auth/Offline:")
                    print(f"  {'No':<4} {'Auth Pass Time':<22} {'Offline Time':<22} Cause")
                    print("  " + "-" * 62)
                    for i, h in enumerate(hist[:5], 1):
                        print(f"  {i:<4} {h['auth']:<22} {h['offline']:<22} {h['cause']}")
            else:
                print("  (Tidak ada detail Telnet)")

    _wait()


def _menu_optical_power(optical_svc, onu_svc, telnet_client=None, pon_svc=None):
    _clear()
    _header("Optical Power ONU")

    sel = _select_pon_port(onu_svc, "Pilih PON Port", telnet_client=telnet_client, pon_svc=pon_svc)
    if not sel:
        return
    board, pon = sel

    print(f"\nMengambil ONU di gpon-olt_1/{board}/{pon}...")
    onus = onu_svc.get_all_onus_on_pon(board, pon)

    if not onus:
        print("Tidak ada ONU ditemukan di PON ini")
        _wait()
        return

    onu = _select_onu(onus, "Pilih ONU")
    if not onu:
        return

    print(f"\nMengambil optical power ONU {board}/{pon}:{onu.onu_id}...")
    reading = optical_svc.get_optical_power(board, pon, onu.onu_id, onu.name)

    print()
    print("=" * 50)
    print(f"  Optical Power — {onu.name or f'ONU-{onu.onu_id}'}")
    print("=" * 50)
    print(f"  ONU ID   : {onu.onu_id}")
    print(f"  Nama     : {onu.name or '-'}")
    print(f"  Serial   : {onu.serial or '-'}")
    print(f"  Port     : gpon-olt_1/{board}/{pon}")
    print(f"  Source   : {reading.source or 'N/A'}")
    print()
    print(f"  RX Power : {reading.rx_str:<14} [{reading.rx_status.upper()}]")
    print(f"  TX Power : {reading.tx_str:<14} [{reading.tx_status.upper()}]")
    print()

    if reading.rx_status == "critical":
        print("  [!!] PERINGATAN KRITIS: Sinyal hampir hilang! Kemungkinan dying gasp.")
    elif reading.rx_status == "low":
        print("  [!]  Sinyal lemah. Periksa kabel/konektor/splitter.")
    elif reading.rx_status == "high":
        print("  [!]  Sinyal terlalu kuat. ONU mungkin terlalu dekat ke OLT.")
    elif reading.rx_status == "normal":
        print("  [OK] Sinyal normal.")
    else:
        print("  [?]  Sinyal tidak tersedia (N/A).")

    _wait()


def _menu_batch_signal(optical_svc, onu_svc, telnet_client=None, pon_svc=None):
    _clear()
    _header("Batch Optical Power \u2014 Semua ONU di PON")

    sel = _select_pon_port(onu_svc, "Pilih PON Port", telnet_client=telnet_client, pon_svc=pon_svc)
    if not sel:
        return
    board, pon = sel

    print(f"\nMengambil ONU di gpon-olt_1/{board}/{pon}...")
    onus = onu_svc.get_all_onus_on_pon(board, pon)

    if not onus:
        print("Tidak ada ONU ditemukan")
        _wait()
        return

    online_onus = [o for o in onus if o.online]
    offline_onus = [o for o in onus if not o.online]
    print(f"Ditemukan {len(onus)} ONU ({len(online_onus)} online, {len(offline_onus)} offline).")
    print("Mengambil optical power semua ONU...\n")

    print(f"{'ID':<5} {'Nama':<20} {'Serial':<18} {'RX Power':<14} {'RX Status':<11} {'TX Power':<14} TX Status")
    print("-" * 90)

    readings = {}
    for onu in onus:
        reading = optical_svc.get_optical_power(board, pon, onu.onu_id, onu.name)
        readings[onu.onu_id] = reading
        name   = (onu.name or f"ONU-{onu.onu_id}")[:18]
        serial = (onu.serial or "-")[:16]
        status_marker = "" if onu.online else " [OFF]"
        print(
            f"{onu.onu_id:<5} {name:<20} {serial:<18}"
            f" {reading.rx_str:<14} {reading.rx_status.upper():<11}"
            f" {reading.tx_str:<14} {reading.tx_status.upper()}{status_marker}"
        )

    # Ringkasan
    ok_count   = sum(1 for r in readings.values() if r.rx_status == "normal")
    crit_count = sum(1 for r in readings.values() if r.rx_status == "critical")
    low_count  = sum(1 for r in readings.values() if r.rx_status == "low")
    print(f"\nRingkasan: {ok_count} normal | {low_count} lemah | {crit_count} kritis")

    _wait()


def _menu_save_onu_data(onu_svc, optical_svc):
    """Scan semua PON dengan ONU, simpan data lengkap ke file .txt"""
    _clear()
    _header("Simpan Data ONU ke File")

    print("Memindai semua PON 1-16 (board 1)...")
    board = 1
    all_data = []  # list of (pon, onu, reading)

    for pon in range(1, 17):
        try:
            onus = onu_svc.get_all_onus_on_pon(board, pon)
            if not onus:
                continue
            print(f"  PON {board}/{pon}: {len(onus)} ONU ditemukan")
            for onu in onus:
                reading = optical_svc.get_optical_power(board, pon, onu.onu_id, onu.name)
                all_data.append((pon, onu, reading))
        except Exception as e:
            print(f"  PON {board}/{pon}: error ({e})")

    if not all_data:
        print("\nTidak ada ONU ditemukan di PON manapun.")
        _wait()
        return

    # Buat file
    import datetime
    from pathlib import Path
    try:
        host = onu_svc.client.config.host if hasattr(onu_svc, 'client') else "olt"
    except Exception:
        host = "olt"

    ts  = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"onu_export_{host}_{ts}.txt"
    # Simpan ke folder logs/ di root
    logs_dir = Path(__file__).resolve().parent.parent / "logs"
    logs_dir.mkdir(exist_ok=True)
    fpath = logs_dir / fname

    lines = []
    lines.append("=" * 80)
    lines.append(f"  LAPORAN DATA ONU — {host}")
    lines.append(f"  Tanggal       : {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"  Total ONU     : {len(all_data)}")
    lines.append("=" * 80)
    lines.append("")

    current_pon = None
    for pon, onu, reading in all_data:
        if pon != current_pon:
            current_pon = pon
            lines.append(f"--- gpon-olt_1/{board}/{pon} ---")
            lines.append("")

        lines.append(f"  ONU ID       : {onu.onu_id}")
        lines.append(f"  Nama         : {onu.name or '-'}")
        lines.append(f"  Serial       : {onu.serial or '-'}")
        lines.append(f"  Model        : {onu.model or '-'}")
        lines.append(f"  Status       : {'ONLINE' if onu.online else 'OFFLINE'}")
        if hasattr(onu, 'description') and onu.description:
            lines.append(f"  Deskripsi    : {onu.description}")
        if hasattr(onu, 'firmware') and onu.firmware:
            lines.append(f"  Firmware     : {onu.firmware}")
        if hasattr(onu, 'distance_m') and onu.distance_m is not None:
            lines.append(f"  Jarak        : {onu.distance_m} m")
        if hasattr(onu, 'last_online') and onu.last_online:
            lines.append(f"  Last Online  : {onu.last_online}")
        if hasattr(onu, 'last_offline') and onu.last_offline:
            lines.append(f"  Last Offline : {onu.last_offline}")
        lines.append(f"  RX Power     : {reading.rx_str}  [{reading.rx_status.upper()}]")
        lines.append(f"  TX Power     : {reading.tx_str}  [{reading.tx_status.upper()}]")
        lines.append(f"  Source       : {reading.source or 'N/A'}")
        lines.append("")

    try:
        fpath.write_text("\n".join(lines), encoding="utf-8")
        print(f"\n[OK] Data disimpan ke: {fpath}")
    except Exception as e:
        print(f"\n[!] Gagal menyimpan file: {e}")

    _wait()


def _menu_alert_monitor(profile: dict, oid_profile, snmp, onu_svc, optical_svc,
                        telnet_client=None, pon_svc=None):
    """Submenu untuk mengkonfigurasi dan start alert engine"""
    _clear()
    _header("Alert Monitoring")

    from services.alert_engine import AlertEngine

    # Auto-scan PON aktif via Telnet jika tersedia
    active_pons = []  # list of (board, pon)
    if telnet_client and pon_svc:
        print("Memindai PON aktif via Telnet...")
        try:
            ports = pon_svc.scan_via_telnet(telnet_client, board=1, max_pon=16)
            active_pons = [(p.board, p.pon) for p in ports if p.oper_status == 1]
            if active_pons:
                print(f"Ditemukan {len(active_pons)} PON aktif: " +
                      ", ".join(f"1/1/{p}" for _, p in active_pons))
        except Exception as e:
            print(f"[!] Gagal scan Telnet: {e}")
            active_pons = []

    if active_pons:
        print("\nMonitoring akan dijalankan pada semua PON aktif di atas.")
        use_auto = input("Lanjut otomatis? [Y/n]: ").strip().lower()
        if use_auto == 'n':
            active_pons = []  # user mau manual

    if not active_pons:
        print("Konfigurasi monitoring manual:")
        try:
            board     = int(input("Board (default 1): ").strip() or "1")
            pon_start = int(input("PON mulai (default 1): ").strip() or "1")
            pon_end   = int(input("PON akhir (default 16): ").strip() or "16")
        except ValueError:
            print("[!] Input tidak valid")
            _wait()
            return
        active_pons = [(board, pon) for pon in range(pon_start, pon_end + 1)]

    try:
        interval = int(input("Interval polling detik (default 60): ").strip() or "60")
    except ValueError:
        interval = 60

    pon_desc = ", ".join(f"1/1/{p}" for _, p in active_pons)
    print(f"\nMemulai monitoring {len(active_pons)} PON: {pon_desc}")
    print("Tekan Ctrl+C untuk berhenti.\n")

    engine = AlertEngine(
        onu_monitor=onu_svc,
        optical_service=optical_svc,
        poll_interval=interval,
        optical_poll_interval=interval * 5
    )
    for b, p in active_pons:
        engine.add_pon(board=b, pon=p)

    # Print alerts ke konsol
    def print_alert(event):
        ts = event.timestamp.strftime("%H:%M:%S")
        print(f"[{ts}] [{event.severity.value.upper()}] {event.message}")

    engine.on_alert(print_alert)

    # Cek notifier dari profile
    notif_config = profile.get("notification", {})
    if notif_config.get("bot_token") and notif_config.get("chat_id"):
        from notification.telegram_notifier import TelegramNotifier
        notifier = TelegramNotifier.from_config(
            notif_config,
            olt_name=profile.get("name", ""),
            olt_host=profile.get("host", "")
        )
        if notifier:
            notifier.start()
            engine.on_alert(notifier.send_alert)
            print("[OK] Notifikasi Telegram aktif")

    engine.start()
    print(f"[OK] Monitoring dimulai...")
    print("------------------------------")

    try:
        import time
        while engine.is_running():
            time.sleep(5)
    except KeyboardInterrupt:
        print("\nMonitoring dihentikan.")
    finally:
        engine.stop()

    _wait()


# ---------------------------------------------------------------------------
# Main Menu
# ---------------------------------------------------------------------------

def show_snmp_menu(profile: dict, telnet_client=None) -> None:
    """
    Tampilkan SNMP menu interaktif

    Args:
        profile: dict dari olt_profiles.json (profile aktif)
        telnet_client: Optional TelnetClient untuk optical power fallback
    """
    print("\nMenginisialisasi SNMP services...")
    snmp, oid_profile, onu_svc, pon_svc, sys_svc, optical_svc = _get_snmp_services(profile)

    if not snmp:
        _wait()
        return

    if telnet_client and optical_svc:
        optical_svc.set_telnet_client(telnet_client)

    while True:
        _clear()
        fw_str = oid_profile.firmware.value if oid_profile else "unknown"
        opt_power = "SNMP" if (oid_profile and oid_profile.snmp_optical_power) else "Telnet"

        _header(f"Menu SNMP  |  {profile.get('name','OLT')}  |  FW:{fw_str}")
        print(f"  Host     : {snmp.config.host} | Optical: {opt_power}")
        print()
        print("  1. Test Koneksi SNMP")
        print("  2. Health Check OLT")
        print("  3. Status PON Port")
        print("  4. Daftar ONU di PON")
        print("  5. Optical Power ONU (pilih ONU)")
        print("  6. Batch Optical Power (semua ONU di PON)")
        print("  7. Start Alert Monitoring")
        print("  8. Simpan Data ONU ke File")
        print()
        print("  0. Kembali")
        print()

        choice = input("  Pilih (0-8): ").strip()

        if choice == "1":
            _menu_snmp_test(snmp, oid_profile)
        elif choice == "2":
            _menu_system_health(sys_svc)
        elif choice == "3":
            _menu_pon_status(pon_svc, telnet_client=telnet_client)
        elif choice == "4":
            _menu_onu_list(onu_svc, telnet_client=telnet_client, pon_svc=pon_svc)
        elif choice == "5":
            _menu_optical_power(optical_svc, onu_svc, telnet_client=telnet_client, pon_svc=pon_svc)
        elif choice == "6":
            _menu_batch_signal(optical_svc, onu_svc, telnet_client=telnet_client, pon_svc=pon_svc)
        elif choice == "7":
            _menu_alert_monitor(profile, oid_profile, snmp, onu_svc, optical_svc,
                                telnet_client=telnet_client, pon_svc=pon_svc)
        elif choice == "8":
            _menu_save_onu_data(onu_svc, optical_svc)
        elif choice == "0":
            break
        else:
            print("[!] Pilihan tidak valid")


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.WARNING)

    print("oltc320 SNMP Menu — Standalone Mode")
    print("=====================================")

    # Baca konfigurasi
    try:
        from config.olt_profile_manager import OLTProfileManager
        mgr = OLTProfileManager()
        profiles = mgr.get_profile_names()

        if not profiles:
            print("[!] Tidak ada OLT profile. Jalankan install atau konfigurasi dulu.")
            sys.exit(1)

        print("\nPilih OLT profile:")
        for i, name in enumerate(profiles, 1):
            print(f"  {i}. {name}")
        print()

        try:
            idx = int(input("Pilih (1): ").strip() or "1") - 1
            profile_name = profiles[idx]
        except (ValueError, IndexError):
            profile_name = profiles[0]

        profile = mgr.get_profile(profile_name)
        profile_dict = profile.to_snmp_config() if hasattr(profile, 'to_snmp_config') else {}

        # Gabungkan semua field profile ke dict
        import dataclasses
        if dataclasses.is_dataclass(profile):
            profile_dict = dataclasses.asdict(profile)
        else:
            profile_dict = profile_dict or {}

        print(f"\nProfile: {profile_name}")
        show_snmp_menu(profile_dict)

    except ImportError as e:
        print(f"[!] Import error: {e}")
        print("Jalankan dari root directory: python scripts/snmp_menu.py")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nKeluar.")
        sys.exit(0)
