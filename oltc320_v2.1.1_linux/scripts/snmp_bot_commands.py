"""
SNMP Bot Commands untuk Management Bot (telegram_bot.py)
Berisi command handlers yang bisa diregister ke Application Telegram

Commands yang disediakan:
    /snmpstatus        - Cek koneksi SNMP ke OLT aktif
    /signal <b/p/id>   - Lihat optical power ONU via SNMP/Telnet
    /olthealth         - Health check sistem OLT via SNMP
    /liveonus <b/p>    - List ONU online di PON tertentu
    /snmpinfo          - Info konfigurasi SNMP
    /alertstart        - Start alert engine monitoring
    /alertstop         - Stop alert engine monitoring
    /alertstatus       - Status alert engine

Cara integrasi ke telegram_bot.py:
    from scripts.snmp_bot_commands import register_snmp_handlers
    register_snmp_handlers(application, bot_context)

Atau manual:
    from scripts.snmp_bot_commands import (
        cmd_snmp_status, cmd_signal, cmd_olt_health, ...
    )
    application.add_handler(CommandHandler("snmpstatus", cmd_snmp_status))
"""
import logging
import asyncio
from typing import Optional, Callable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Context holder — disi dari telegram_bot.py saat startup
# ---------------------------------------------------------------------------

class SNMPBotContext:
    """
    Holder untuk resource SNMP yang dipakai oleh command handlers
    Diinisialisasi dari telegram_bot.py saat startup.
    """
    def __init__(self):
        self.snmp_client = None             # SNMPClient
        self.oid_profile = None             # OIDProfile (dari FirmwareDetector)
        self.firmware_detector = None       # FirmwareDetector
        self.onu_monitor = None             # SNMPONUMonitor
        self.pon_info_svc = None            # SNMPPONInfo
        self.system_health_svc = None       # SNMPSystemHealth
        self.optical_power_svc = None       # OpticalPowerService
        self.alert_engine = None            # AlertEngine
        self.notifier = None                # TelegramNotifier
        self.profile_manager = None         # OLTProfileManager (untuk multi-OLT)
        self.telnet_client = None           # TelnetClient (untuk optical power & PON status)
        self._initialized = False

    def initialize(self, profile: dict, telnet_client=None) -> bool:
        """
        Inisialisasi semua SNMP services dari profile OLT

        Args:
            profile: dict dari olt_profiles.json
            telnet_client: Optional TelnetClient untuk optical power fallback V2.1
        Returns:
            True jika berhasil
        """
        try:
            from core.snmp_client import create_snmp_client
            from core.firmware_detector import FirmwareDetector
            from services.snmp_onu_monitor import SNMPONUMonitor
            from services.snmp_pon_info import SNMPPONInfo
            from services.snmp_system import SNMPSystemHealth
            from services.optical_power import OpticalPowerService

            # SNMP Client
            self.snmp_client = create_snmp_client(profile)
            if not self.snmp_client:
                logger.info("SNMP tidak dikonfigurasi di profile ini")
                return False

            # Firmware detector
            self.firmware_detector = FirmwareDetector(self.snmp_client)
            self.oid_profile = self.firmware_detector.get_oid_profile()
            logger.info(f"Firmware terdeteksi: {self.oid_profile.firmware.value}")

            # Services
            self.onu_monitor       = SNMPONUMonitor(self.snmp_client, self.oid_profile)
            self.pon_info_svc      = SNMPPONInfo(self.snmp_client, self.oid_profile)
            self.system_health_svc = SNMPSystemHealth(self.snmp_client, self.oid_profile)
            self.optical_power_svc = OpticalPowerService(
                snmp_client=self.snmp_client,
                oid_profile=self.oid_profile,
                telnet_client=telnet_client
            )

            # Thresholds dari profile
            thresholds = profile.get("notification", {}).get("thresholds", {})
            if thresholds:
                self.optical_power_svc.set_thresholds(thresholds)

            self._initialized = True
            logger.info("SNMPBotContext berhasil diinisialisasi")

            # Simpan telnet_client agar dipakai oleh cmd_pon_all, dll
            if telnet_client:
                self.telnet_client = telnet_client

            return True

        except Exception as e:
            logger.error(f"SNMPBotContext.initialize error: {e}", exc_info=True)
            return False

    def is_ready(self) -> bool:
        return self._initialized and self.snmp_client is not None


# Global context instance (diset dari telegram_bot.py)
_ctx = SNMPBotContext()


def get_context() -> SNMPBotContext:
    """Ambil global SNMP context"""
    return _ctx


def set_context(ctx: SNMPBotContext) -> None:
    """Set global SNMP context (dari telegram_bot.py)"""
    global _ctx
    _ctx = ctx


# ---------------------------------------------------------------------------
# Helper untuk command handlers
# ---------------------------------------------------------------------------

def _parse_pon_args(args) -> Optional[tuple]:
    """
    Parse argumen command format "board/pon" atau "board pon"
    Returns:
        (board, pon) atau None jika invalid
    """
    if not args:
        return None
    joined = " ".join(args)
    if "/" in joined:
        parts = joined.split("/")
    else:
        parts = joined.split()

    if len(parts) >= 2:
        try:
            return int(parts[0]), int(parts[1])
        except ValueError:
            return None
    return None


def _parse_onu_args(args) -> Optional[tuple]:
    """
    Parse argumen command format "board/pon/onu_id" atau "board pon onu_id"
    Returns:
        (board, pon, onu_id) atau None jika invalid
    """
    if not args:
        return None
    joined = " ".join(args)
    if "/" in joined:
        parts = joined.split("/")
    else:
        parts = joined.split()

    if len(parts) >= 3:
        try:
            return int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            return None
    return None


def _snmp_not_ready_msg() -> str:
    return (
        "SNMP tidak dikonfigurasi atau belum diinisialisasi.\n\n"
        "Pastikan <code>snmp_community</code> sudah diset di konfigurasi OLT profile."
    )


# ---------------------------------------------------------------------------
# Command Handlers
# ---------------------------------------------------------------------------

async def cmd_snmp_status(update, context):
    """
    /snmpstatus — Cek koneksi SNMP ke OLT aktif
    """
    ctx = get_context()
    if not ctx.is_ready():
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    await update.message.reply_text("Menguji koneksi SNMP...")

    try:
        success, msg = ctx.snmp_client.test_connection()
        fw = ctx.oid_profile.firmware.value if ctx.oid_profile else "unknown"

        if success:
            text = (
                f"<b>Status SNMP</b>\n"
                f"<code>================</code>\n"
                f"Koneksi   : BERHASIL\n"
                f"Host      : {ctx.snmp_client.config.host}:{ctx.snmp_client.config.port}\n"
                f"Community : {ctx.snmp_client.config.community}\n"
                f"Firmware  : {fw}\n\n"
                f"<i>{msg}</i>"
            )
        else:
            text = (
                f"<b>Status SNMP</b>\n"
                f"<code>================</code>\n"
                f"Koneksi   : GAGAL\n"
                f"Host      : {ctx.snmp_client.config.host}\n\n"
                f"<i>{msg}</i>"
            )

        await update.message.reply_text(text, parse_mode="HTML")

    except Exception as e:
        await update.message.reply_text(f"Error cek SNMP: {e}")


async def cmd_signal(update, context):
    """
    /signal <board/pon/onu_id> — Lihat optical power ONU
    Contoh: /signal 1/1/3
    """
    ctx = get_context()
    if not ctx.is_ready() or not ctx.optical_power_svc:
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    parsed = _parse_onu_args(context.args)
    if not parsed:
        await update.message.reply_text(
            "Penggunaan: /signal <board/pon/onu_id>\n"
            "Contoh: /signal 1/1/3"
        )
        return

    board, pon, onu_id = parsed
    msg = await update.message.reply_text(
        f"Mengambil optical power ONU {board}/{pon}/{onu_id}..."
    )

    try:
        reading = ctx.optical_power_svc.get_optical_power(board, pon, onu_id)

        # Status emoji
        rx_emoji = {"normal": "OK", "low": "LEMAH", "high": "TINGGI",
                    "critical": "KRITIS", "unknown": "N/A"}.get(reading.rx_status, "?")
        tx_emoji = {"normal": "OK", "low": "LEMAH", "high": "TINGGI",
                    "unknown": "N/A"}.get(reading.tx_status, "?")

        lines = [
            f"<b>Optical Power ONU {board}/{pon}:{onu_id}</b>",
            f"{'=' * 24}",
        ]
        if reading.onu_name:
            lines.append(f"Nama  : {reading.onu_name}")
        lines += [
            f"RX    : <b>{reading.rx_str}</b> [{rx_emoji}]",
            f"TX    : <b>{reading.tx_str}</b> [{tx_emoji}]",
            f"Source: {reading.source or 'N/A'}",
        ]

        if reading.rx_status == "critical":
            lines.append("\n<b>PERINGATAN: Sinyal kritis! ONU mungkin akan offline.</b>")
        elif reading.rx_status == "low":
            lines.append("\n<i>Catatan: Sinyal lemah, periksa kabel/konektor.</i>")

        await msg.edit_text("\n".join(lines), parse_mode="HTML")

    except Exception as e:
        await msg.edit_text(f"Error ambil optical power: {e}")


async def cmd_olt_health(update, context):
    """
    /olthealth — Health check sistem OLT via SNMP
    """
    ctx = get_context()
    if not ctx.is_ready() or not ctx.system_health_svc:
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    msg = await update.message.reply_text("Mengambil informasi sistem OLT...")

    try:
        info = ctx.system_health_svc.get_system_info()

        lines = [
            f"<b>Health Check OLT</b>",
            f"{'=' * 24}",
            f"Nama    : {info.sys_name or 'N/A'}",
            f"Uptime  : <b>{info.uptime_formatted}</b>",
            f"Lokasi  : {info.sys_location or 'N/A'}",
            f"Kontak  : {info.sys_contact or 'N/A'}",
        ]

        if info.cards:
            lines.append(f"\n<b>Cards ({len(info.cards)} total):</b>")
            for card in info.cards[:8]:   # Tampilkan max 8 card
                status_label = "OK" if card.is_normal else "ABNORMAL"
                lines.append(
                    f"  Slot {card.slot_string}: {card.card_type} [{status_label}]"
                )

            if info.abnormal_cards:
                lines.append(f"\n<b>Card Bermasalah: {len(info.abnormal_cards)}</b>")

        if info.sys_description:
            # Potong di 60 karakter
            desc = info.sys_description[:60] + ("..." if len(info.sys_description) > 60 else "")
            lines.append(f"\n<i>{desc}</i>")

        await msg.edit_text("\n".join(lines), parse_mode="HTML")

    except Exception as e:
        await msg.edit_text(f"Error ambil health OLT: {e}")


async def cmd_live_onus(update, context):
    """
    /liveonus <board/pon> — List ONU yang online di PON tertentu
    Contoh: /liveonus 1/1
    """
    ctx = get_context()
    if not ctx.is_ready() or not ctx.onu_monitor:
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    parsed = _parse_pon_args(context.args)
    if not parsed:
        await update.message.reply_text(
            "Penggunaan: /liveonus <board/pon>\n"
            "Contoh: /liveonus 1/1"
        )
        return

    board, pon = parsed
    msg = await update.message.reply_text(
        f"Mengambil daftar ONU di gpon-olt_1/{board}/{pon}..."
    )

    try:
        onus = ctx.onu_monitor.get_all_onus_on_pon(board, pon)
        online = [o for o in onus if o.online]
        offline = [o for o in onus if not o.online]

        lines = [
            f"<b>ONU di gpon-olt_1/{board}/{pon}</b>",
            f"Total: {len(onus)} | Online: {len(online)} | Offline: {len(offline)}",
            f"{'=' * 26}",
        ]

        if online:
            lines.append(f"<b>ONLINE ({len(online)}):</b>")
            for o in online[:20]:
                name_str = o.name or f"ONU-{o.onu_id}"
                sn_str   = f" [{o.serial[:8]}]" if o.serial else ""
                lines.append(f"  {o.onu_id}. {name_str}{sn_str}")

        if offline:
            lines.append(f"\n<b>OFFLINE ({len(offline)}):</b>")
            for o in offline[:10]:
                name_str = o.name or f"ONU-{o.onu_id}"
                lines.append(f"  {o.onu_id}. {name_str}")

        if not onus:
            lines.append("Tidak ada ONU terdaftar di PON ini\n(atau SNMP walk gagal)")

        await msg.edit_text("\n".join(lines), parse_mode="HTML")

    except Exception as e:
        await msg.edit_text(f"Error ambil ONU list: {e}")


async def cmd_alert_start(update, context):
    """
    /alertstart [board pon_start pon_end] — Start monitoring alert engine
    Tanpa argumen: auto-scan semua PON aktif via Telnet.
    Dengan argumen: /alertstart 1 1 8
    """
    ctx = get_context()
    if not ctx.is_ready():
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    if ctx.alert_engine and ctx.alert_engine.is_running():
        await update.message.reply_text("Alert engine sudah berjalan!")
        return

    msg = await update.message.reply_text("⏳ Menyiapkan alert engine...")

    try:
        from services.alert_engine import AlertEngine

        args = context.args or []
        engine = AlertEngine(
            onu_monitor=ctx.onu_monitor,
            optical_service=ctx.optical_power_svc,
            poll_interval=60,
            optical_poll_interval=300
        )

        if not args and ctx.telnet_client and ctx.pon_info_svc:
            # Auto-scan: temukan semua PON yang aktif (activate) via Telnet
            await msg.edit_text("⏳ Scan PON aktif via Telnet...")
            active_ports = ctx.pon_info_svc.scan_via_telnet(ctx.telnet_client, board=1, max_pon=16)
            active_pons = [(p.board, p.pon) for p in active_ports if p.oper_status == 1]
            if not active_pons:
                # Fallback: monitor semua 1-16 jika Telnet tidak mengembalikan apa-apa
                active_pons = [(1, pon) for pon in range(1, 17)]

            for b, p in active_pons:
                engine.add_pon(board=b, pon=p)

            pon_list = ", ".join(f"1/1/{p}" for _, p in active_pons)
            info_text = (
                f"✅ Alert engine dimulai!\n"
                f"Mode: <b>Auto-scan</b> ({len(active_pons)} PON aktif)\n"
                f"Port: <code>{pon_list}</code>\n"
                f"Interval: 60s status, 300s optical power"
            )
        else:
            # Manual: gunakan argumen atau default 1 1 16
            board     = int(args[0]) if len(args) > 0 else 1
            pon_start = int(args[1]) if len(args) > 1 else 1
            pon_end   = int(args[2]) if len(args) > 2 else 16
            engine.add_pons_from_range(board=board, pon_start=pon_start, pon_end=pon_end)
            info_text = (
                f"✅ Alert engine dimulai!\n"
                f"Mode: <b>Manual</b> board {board}, PON {pon_start}-{pon_end}\n"
                f"Interval: 60s status, 300s optical power"
            )

        if ctx.notifier:
            engine.on_alert(ctx.notifier.send_alert)

        ctx.alert_engine = engine
        engine.start()

        await msg.edit_text(info_text, parse_mode="HTML")

    except Exception as e:
        await msg.edit_text(f"Error start alert engine: {e}")


async def cmd_alert_stop(update, context):
    """
    /alertstop — Stop alert engine
    """
    ctx = get_context()
    if not ctx.alert_engine:
        await update.message.reply_text("Alert engine belum diinisialisasi")
        return

    if not ctx.alert_engine.is_running():
        await update.message.reply_text("Alert engine sudah berhenti")
        return

    ctx.alert_engine.stop()
    await update.message.reply_text("Alert engine dihentikan.")


async def cmd_alert_status(update, context):
    """
    /alertstatus — Lihat status alert engine
    """
    ctx = get_context()

    if not ctx.alert_engine:
        await update.message.reply_text("Alert engine belum diinisialisasi.\nGunakan /alertstart")
        return

    engine = ctx.alert_engine
    total, online = engine.get_online_count()
    offline_list = engine.get_all_offline()

    status = "BERJALAN" if engine.is_running() else "BERHENTI"
    lines = [
        f"<b>Status Alert Engine</b>",
        f"{'=' * 24}",
        f"Status  : <b>{status}</b>",
        f"PON     : {len(engine._pons)} port dipantau",
        f"ONU     : {total} diketahui | {online} online | {len(offline_list)} offline",
    ]

    if offline_list[:5]:
        lines.append("\n<b>ONU Offline:</b>")
        for s in offline_list[:5]:
            lines.append(f"  {s.board}/{s.pon}:{s.onu_id}")

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


async def cmd_snmp_info(update, context):
    """
    /snmpinfo — Tampilkan info konfigurasi SNMP
    """
    ctx = get_context()
    if not ctx.is_ready():
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    cfg = ctx.snmp_client.config
    fw  = ctx.oid_profile.firmware.value if ctx.oid_profile else "unknown"
    opt = "Ya (SNMP)" if (ctx.oid_profile and ctx.oid_profile.snmp_optical_power) else "Tidak (Telnet fallback)"

    text = (
        f"<b>Konfigurasi SNMP</b>\n"
        f"{'=' * 22}\n"
        f"Host     : {cfg.host}:{cfg.port}\n"
        f"Community: {cfg.community}\n"
        f"Version  : SNMPv{cfg.version}\n"
        f"Timeout  : {cfg.timeout}s\n"
        f"Firmware : {fw}\n"
        f"Opt Power: {opt}"
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def cmd_gpon_loss(update, context):
    """
    /gponloss — Scan semua PON dari OLT aktif, tampilkan ONU yang LOSS/OFFLINE.

    Format output (sesuai contoh user):
        🔴 GPON LOSS Alert
        OLT: OLT POP HANDIWUNG
        Total ONU Loss: 1
        List ONU GPON Loss:
        1. "rosmayati.asari ASR03"
        Tanggal: 27/02/2026 06:08 (WIB)
        Tipe: GPON Loss Alert
    """
    ctx = get_context()
    if not ctx.is_ready() or not ctx.onu_monitor:
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    wait_msg = await update.message.reply_text(
        "\U0001F534 Scanning semua PON (1\u201316)...\n\nHarap tunggu..."
    )

    try:
        from datetime import datetime
        import pytz

        cfg  = ctx.snmp_client.config
        olt_name = (
            getattr(cfg, 'name', None)
            or getattr(cfg, 'olt_name', None)
            or cfg.host
        )

        offline_list = []   # List of (board, pon, onu) tuples

        for board in [1]:
            for pon in range(1, 17):
                try:
                    onus = ctx.onu_monitor.get_all_onus_on_pon(board, pon)
                    for onu in onus:
                        if not onu.online:
                            offline_list.append((board, pon, onu))
                except Exception:
                    pass  # PON kosong atau tidak eksis

        now_wib = datetime.now(pytz.timezone("Asia/Jakarta")) if _has_pytz() else datetime.now()
        ts_str  = now_wib.strftime("%d/%m/%Y %H:%M") + " (WIB)"

        if not offline_list:
            await wait_msg.edit_text(
                f"\u2705 <b>Semua ONU ONLINE!</b>\n"
                f"\n"
                f"\U0001F5C4 OLT: {olt_name}\n"
                f"\u23F0 {ts_str}\n"
                f"\nTidak ada ONU LOSS ditemukan di PON 1\u201316.",
                parse_mode="HTML"
            )
            return

        lines = [
            "\U0001F534 <b>GPON LOSS Alert</b>",
            "",
            f"OLT: <b>{olt_name}</b>",
            f"Total ONU Loss: <b>{len(offline_list)}</b>",
            "",
            "<b>List ONU GPON Loss:</b>",
        ]

        for i, (board, pon, onu) in enumerate(offline_list, 1):
            name_str = onu.name or f"ONU-{onu.onu_id}"
            serial_str = f" [{onu.serial}]" if onu.serial else ""
            port_str   = f"gpon-olt_1/{board}/{pon}:{onu.onu_id}"
            lines.append(f'{i}. "{name_str}"{serial_str}  \u2014  {port_str}')

        lines += [
            "",
            f"Tanggal: {ts_str}",
            "Tipe: GPON Loss Alert",
        ]

        # Kirim dalam batch jika terlalu banyak (Telegram max 4096 chars)
        full_text = "\n".join(lines)
        if len(full_text) > 4000:
            # Split menjadi beberapa pesan
            await wait_msg.edit_text(
                "\n".join(lines[:6 + min(50, len(offline_list))]),
                parse_mode="HTML"
            )
            # Kirim sisa
            remaining_names = lines[6 + 50:]
            if remaining_names:
                await update.message.reply_text(
                    "\n".join(remaining_names), parse_mode="HTML"
                )
        else:
            await wait_msg.edit_text(full_text, parse_mode="HTML")

    except Exception as e:
        await wait_msg.edit_text(f"\u274C Error scan GPON loss: {e}")


def _has_pytz() -> bool:
    try:
        import pytz
        return True
    except ImportError:
        return False


async def cmd_pon_all(update, context):
    """
    /ponall — Tampilkan status semua PON port (1-16) dari OLT aktif.
    """
    ctx = get_context()
    if not ctx.is_ready() or not ctx.pon_info_svc:
        await update.message.reply_text(_snmp_not_ready_msg(), parse_mode="HTML")
        return

    wait_msg = await update.message.reply_text("Mengambil status semua PON...")

    try:
        cfg = ctx.snmp_client.config
        olt_name = getattr(cfg, 'name', None) or cfg.host

        # Coba Telnet dulu untuk status akurat, fallback SNMP
        telnet = getattr(ctx, 'telnet_client', None)
        if telnet:
            ports = ctx.pon_info_svc.scan_via_telnet(telnet, board=1, max_pon=16)
        else:
            ports = ctx.pon_info_svc.get_all_pon_ports(boards=[1], pons=list(range(1, 17)))

        if not ports:
            await wait_msg.edit_text("Tidak ada data PON ditemukan.")
            return

        active  = [p for p in ports if p.is_up]
        down    = [p for p in ports if not p.is_up]
        total_onu = sum(p.onu_count for p in ports)

        lines = [
            f"\U0001F4BE <b>Status PON Port</b>",
            f"OLT: <b>{olt_name}</b>",
            f"{'=' * 24}",
            f"Total port : {len(ports)} | Aktif: {len(active)} | Nonaktif: {len(down)}",
            f"Total ONU  : {total_onu}",
            "",
            "<b>Port Aktif:</b>",
        ]

        for p in active:
            desc = getattr(p, 'description', '') or ''
            desc_str = f" — {desc}" if desc else ''
            lines.append(f"  \u2705 {p.port_string}  ({p.onu_count} ONU){desc_str}")

        if down:
            lines.append("")
            lines.append("<b>Port Nonaktif:</b>")
            for p in down:
                lines.append(f"  \u274C {p.port_string}")

        await wait_msg.edit_text("\n".join(lines), parse_mode="HTML")

    except Exception as e:
        await wait_msg.edit_text(f"Error ambil status PON: {e}")


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------

def register_snmp_handlers(application, snmp_ctx: SNMPBotContext = None) -> None:
    """
    Register semua SNMP command handlers ke Application Telegram

    Args:
        application: python-telegram-bot Application instance
        snmp_ctx:    SNMPBotContext instance (optional, update global _ctx)
    """
    try:
        from telegram.ext import CommandHandler
    except ImportError:
        logger.error("python-telegram-bot tidak tersedia, SNMP handlers tidak bisa diregister")
        return

    if snmp_ctx:
        set_context(snmp_ctx)

    handlers = [
        ("snmpstatus",    cmd_snmp_status,  "Cek koneksi SNMP"),
        ("signal",        cmd_signal,       "Optical power ONU"),
        ("olthealth",     cmd_olt_health,   "Health check OLT"),
        ("liveonus",      cmd_live_onus,    "List ONU online di PON"),
        ("alertstart",    cmd_alert_start,  "Start monitoring alert"),
        ("alertstop",     cmd_alert_stop,   "Stop monitoring alert"),
        ("alertstatus",   cmd_alert_status, "Status alert engine"),
        ("snmpinfo",      cmd_snmp_info,    "Info konfigurasi SNMP"),
        ("gponloss",      cmd_gpon_loss,    "Scan GPON loss semua PON"),
        ("ponall",        cmd_pon_all,      "Status semua PON port"),
    ]

    for cmd, handler, desc in handlers:
        application.add_handler(CommandHandler(cmd, handler))
        logger.info(f"Registered SNMP command: /{cmd} — {desc}")

    logger.info(f"Total {len(handlers)} SNMP handlers terdaftar")


def get_snmp_commands_help() -> str:
    """
    Kembalikan daftar SNMP commands untuk /help message

    Returns:
        String formatted untuk Telegram HTML
    """
    return (
        "\n<b>Perintah SNMP:</b>\n"
        "/snmpstatus — Cek koneksi SNMP ke OLT\n"
        "/signal 1/1/3 — Optical power ONU 1/1:3\n"
        "/olthealth — Health check sistem OLT\n"
        "/liveonus 1/1 — List ONU online di PON 1/1\n"
        "/gponloss — Scan semua PON, tampilkan ONU Loss\n"
        "/ponall — Status semua PON port (1-16)\n"
        "/alertstart — Start monitoring (auto-scan PON aktif)\n"
        "/alertstart 1 1 8 — Start monitoring manual range\n"
        "/alertstop — Stop monitoring\n"
        "/alertstatus — Status alert engine\n"
        "/snmpinfo — Info konfigurasi SNMP"
    )
