"""
SNMP Client untuk OLT ZTE C320
Mendukung firmware V2.1.x (OID base .1012) dan V2.2+ (OID base .1082)
Protocol: SNMPv2c, read-only

Dependencies:
    pip install pysnmp>=6.1.0

Note:
    pysnmp v7+ menggunakan asyncio API (get_cmd/next_cmd/walk_cmd).
    Class ini menyediakan wrapper synchronous yang transparan.
"""
import asyncio
import logging
import concurrent.futures
from typing import Optional, Any, List, Tuple, Dict
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:
    from pysnmp.hlapi.asyncio import (
        get_cmd, next_cmd, walk_cmd,
        SnmpEngine, CommunityData, UdpTransportTarget,
        ContextData, ObjectType, ObjectIdentity
    )
    from pysnmp.proto.rfc1905 import NoSuchObject, NoSuchInstance
    PYSNMP_AVAILABLE = True
except ImportError:
    PYSNMP_AVAILABLE = False
    NoSuchObject = None
    NoSuchInstance = None
    logger.warning(
        "pysnmp tidak tersedia. Install dengan: pip install pysnmp\n"
        "Fitur SNMP tidak akan berfungsi tanpa library ini."
    )


@dataclass
class SNMPConfig:
    """Konfigurasi SNMP untuk OLT"""
    host: str
    port: int = 161
    community: str = "public"
    version: str = "2c"           # "2c" atau "3"
    timeout: int = 5
    retries: int = 3
    # Firmware version: "auto", "v2.1", "v2.2"
    firmware_version: str = "auto"


@dataclass
class SNMPResult:
    """Hasil query SNMP"""
    oid: str
    value: Any
    value_type: str = ""
    raw_value: Any = None

    def as_int(self) -> Optional[int]:
        """Convert value ke integer"""
        try:
            return int(self.value)
        except (TypeError, ValueError):
            return None

    def as_str(self) -> str:
        """Convert value ke string"""
        if isinstance(self.value, bytes):
            try:
                return self.value.decode("utf-8", errors="replace").strip()
            except Exception:
                return str(self.value)
        return str(self.value) if self.value is not None else ""

    def as_hex(self) -> str:
        """Convert bytes value ke hex string (untuk Serial Number)"""
        if isinstance(self.raw_value, bytes):
            return self.raw_value.hex().upper()
        return self.as_str()


class SNMPClient:
    """
    SNMP Client untuk ZTE C320 OLT
    Wrapper synchronous di atas pysnmp v7 async API.

    Usage:
        config = SNMPConfig(host="192.168.1.1", community="public")
        client = SNMPClient(config)
        if client.is_available():
            result = client.get("1.3.6.1.2.1.1.1.0")
            print(result.as_str())
    """

    def __init__(self, config: SNMPConfig):
        if not PYSNMP_AVAILABLE:
            raise ImportError(
                "pysnmp diperlukan untuk SNMP. Install: pip install pysnmp"
            )
        self.config = config
        # Note: SnmpEngine dibuat fresh di setiap async call (tidak disimpan di sini)
        # karena SnmpEngine tidak thread-safe antar event loop yang berbeda.

    def is_available(self) -> bool:
        """Cek apakah SNMP library tersedia"""
        return PYSNMP_AVAILABLE

    def _make_community(self) -> "CommunityData":
        mp_model = 1 if self.config.version == "2c" else 0
        return CommunityData(self.config.community, mpModel=mp_model)

    # ------------------------------------------------------------------
    # Internal async methods
    # ------------------------------------------------------------------

    async def _async_get(self, oid: str) -> Optional["SNMPResult"]:
        """Async SNMP GET"""
        try:
            transport = await UdpTransportTarget.create(
                (self.config.host, self.config.port),
                timeout=self.config.timeout,
                retries=self.config.retries
            )
            error_indication, error_status, error_index, var_binds = await get_cmd(
                SnmpEngine(),
                self._make_community(),
                transport,
                ContextData(),
                ObjectType(ObjectIdentity(oid))
            )

            if error_indication or error_status:
                logger.debug(f"SNMP GET [{oid}]: {error_indication or error_status}")
                return None

            for var_bind in var_binds:
                oid_str, value = var_bind
                # Filter NoSuchInstance / NoSuchObject (OID tidak ada)
                if NoSuchInstance and isinstance(value, NoSuchInstance):
                    return None
                if NoSuchObject and isinstance(value, NoSuchObject):
                    return None
                raw = bytes(value) if isinstance(value, (bytes, bytearray)) else None
                return SNMPResult(
                    oid=str(oid_str),
                    value=self._extract_value(value),
                    value_type=type(value).__name__,
                    raw_value=raw
                )
        except Exception as e:
            logger.debug(f"SNMP GET exception [{oid}]: {e}")
            return None

    async def _async_walk(self, oid: str) -> List["SNMPResult"]:
        """Async SNMP WALK"""
        results = []
        try:
            transport = await UdpTransportTarget.create(
                (self.config.host, self.config.port),
                timeout=self.config.timeout,
                retries=self.config.retries
            )
            async for error_indication, error_status, error_index, var_binds in walk_cmd(
                SnmpEngine(),
                self._make_community(),
                transport,
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
                lexicographicMode=False
            ):
                if error_indication or error_status:
                    break
                for var_bind in var_binds:
                    oid_str, value = var_bind
                    # Filter NoSuchInstance / NoSuchObject
                    if NoSuchInstance and isinstance(value, NoSuchInstance):
                        continue
                    if NoSuchObject and isinstance(value, NoSuchObject):
                        continue
                    raw = bytes(value) if isinstance(value, (bytes, bytearray)) else None
                    results.append(SNMPResult(
                        oid=str(oid_str),
                        value=self._extract_value(value),
                        value_type=type(value).__name__,
                        raw_value=raw
                    ))
        except Exception as e:
            logger.debug(f"SNMP WALK exception [{oid}]: {e}")
        return results

    # ------------------------------------------------------------------
    # Synchronous public API
    # ------------------------------------------------------------------

    def _run_async(self, coro):
        """Jalankan coroutine secara synchronous (aman dari dalam/luar event loop)"""
        try:
            loop = asyncio.get_running_loop()
            # Sudah di dalam event loop (misal Telegram bot) — pakai thread baru
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result(timeout=self.config.timeout + 10)
        except RuntimeError:
            # Tidak ada running loop
            return asyncio.run(coro)

    def get(self, oid: str) -> Optional["SNMPResult"]:
        """
        SNMP GET untuk satu OID

        Args:
            oid: OID string, contoh "1.3.6.1.2.1.1.1.0"
        Returns:
            SNMPResult atau None jika gagal
        """
        if not self.is_available():
            return None
        try:
            return self._run_async(self._async_get(oid))
        except Exception as e:
            logger.debug(f"SNMP GET sync wrapper [{oid}]: {e}")
            return None

    def walk(self, oid: str) -> List["SNMPResult"]:
        """
        SNMP WALK untuk subtree OID

        Args:
            oid: Base OID untuk walk
        Returns:
            List SNMPResult
        """
        if not self.is_available():
            return []
        try:
            return self._run_async(self._async_walk(oid)) or []
        except Exception as e:
            logger.debug(f"SNMP WALK sync wrapper [{oid}]: {e}")
            return []

    def bulk_get(self, oids: List[str]) -> Dict[str, Optional["SNMPResult"]]:
        """
        SNMP GET untuk banyak OID sekaligus

        Args:
            oids: List OID string
        Returns:
            Dict {oid: SNMPResult}
        """
        return {oid: self.get(oid) for oid in oids}

    def test_connection(self) -> Tuple[bool, str]:
        """
        Test koneksi SNMP ke OLT
        
        Returns:
            (success, message)
        """
        try:
            result = self.get("1.3.6.1.2.1.1.1.0")  # sysDescr
            if result:
                sysinfo = result.as_str()[:80]
                return True, f"SNMP OK - {sysinfo}"
            else:
                return False, "SNMP tidak merespons (timeout atau community string salah)"
        except Exception as e:
            return False, f"SNMP error: {e}"

    def get_system_description(self) -> str:
        """Ambil system description dari OLT"""
        result = self.get("1.3.6.1.2.1.1.1.0")
        return result.as_str() if result else ""

    def get_system_uptime(self) -> Optional[int]:
        """Ambil system uptime (ticks)"""
        result = self.get("1.3.6.1.2.1.1.3.0")
        return result.as_int() if result else None

    @staticmethod
    def _extract_value(value) -> Any:
        """Ekstrak nilai dari pysnmp object"""
        try:
            # Integer types
            if hasattr(value, 'prettyPrint'):
                pretty = value.prettyPrint()
                # Coba konversi ke int
                try:
                    return int(pretty)
                except (ValueError, TypeError):
                    pass
                return pretty

            # Bytes/OctetString
            if isinstance(value, bytes):
                try:
                    return value.decode("utf-8", errors="replace").strip()
                except Exception:
                    return value

            return value
        except Exception:
            return str(value)


def create_snmp_client(profile: dict) -> Optional[SNMPClient]:
    """
    Factory function: buat SNMPClient dari OLT profile dict
    
    Args:
        profile: dict dari olt_profiles.json, butuh key 'snmp_community', dst
    Returns:
        SNMPClient atau None jika SNMP tidak dikonfigurasi / library tidak ada
    """
    if not PYSNMP_AVAILABLE:
        logger.warning("pysnmp tidak tersedia, SNMP dinonaktifkan")
        return None

    snmp_community = profile.get("snmp_community", "")
    if not snmp_community:
        logger.info("SNMP community string tidak dikonfigurasi, SNMP dinonaktifkan")
        return None

    host = profile.get("host", "")
    if not host:
        logger.warning("OLT host tidak dikonfigurasi")
        return None

    config = SNMPConfig(
        host=host,
        port=profile.get("snmp_port", 161),
        community=snmp_community,
        version=profile.get("snmp_version", "2c"),
        timeout=profile.get("snmp_timeout", 5),
        retries=profile.get("snmp_retries", 3),
        firmware_version=profile.get("firmware_version", "auto")
    )

    try:
        return SNMPClient(config)
    except Exception as e:
        logger.error(f"Gagal membuat SNMP client: {e}")
        return None
