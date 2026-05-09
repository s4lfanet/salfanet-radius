"""
ONU Discovery Service
Auto-detect ONU yang belum terdaftar (unconfigured)
"""
import logging
import time
from typing import List, Optional
from core.telnet_client import TelnetClient
from core.zte_command import ZTECommand
from core.onu_parser import ONUParser
from models.onu import ONUUnconfigured
from config.olt_config import OLTConfig

logger = logging.getLogger(__name__)


class ONUDiscoveryService:
    """Service untuk discovery ONU unconfigured"""
    
    def __init__(self, config: OLTConfig, client: TelnetClient):
        self.config = config
        self.client = client
        self.zte_cmd = ZTECommand(client)
        self.parser = ONUParser()
    
    def discover_unconfigured_onus(self, pon_port: Optional[str] = None) -> List[ONUUnconfigured]:
        """
        Discover semua ONU yang belum terdaftar
        
        Args:
            pon_port: PON port spesifik (opsional). Jika None, scan semua port.
            
        Returns:
            List of ONUUnconfigured
        """
        logger.info("Starting ONU discovery...")
        
        # Ensure connection
        if not self.client.ensure_connection():
            logger.error("Failed to ensure connection to OLT")
            return []
        
        # Get unconfigured ONUs
        success, output = self.zte_cmd.show_onu_uncfg(pon_port)
        
        if not success:
            logger.error(f"Failed to get unconfigured ONUs: {output}")
            return []
        
        # Parse output
        onus = self.parser.parse_unconfigured_onus(output)
        
        logger.info(f"Discovered {len(onus)} unconfigured ONU(s)")
        
        # Log details
        for onu in onus:
            logger.info(f"  - {onu}")
        
        return onus
    
    def discover_continuously(self, interval: int = None, callback=None):
        """
        Continuously discover ONUs dengan interval tertentu
        
        Args:
            interval: Interval dalam detik (default dari config)
            callback: Function yang dipanggil ketika ONU baru ditemukan
                     callback(onus: List[ONUUnconfigured])
        """
        if interval is None:
            interval = self.config.discovery_interval
        
        logger.info(f"Starting continuous discovery (interval: {interval}s)")
        
        known_onus = set()  # Track ONU yang sudah ditemukan
        
        try:
            while True:
                # Discover ONUs
                onus = self.discover_unconfigured_onus()
                
                # Filter ONU baru (yang belum pernah ditemukan)
                new_onus = []
                for onu in onus:
                    if onu.sn not in known_onus:
                        new_onus.append(onu)
                        known_onus.add(onu.sn)
                
                # Call callback jika ada ONU baru
                if new_onus and callback:
                    logger.info(f"Found {len(new_onus)} new ONU(s)")
                    callback(new_onus)
                
                # Wait for next scan
                logger.debug(f"Waiting {interval}s for next scan...")
                time.sleep(interval)
                
        except KeyboardInterrupt:
            logger.info("Discovery stopped by user")
        except Exception as e:
            logger.error(f"Discovery error: {e}")
    
    def discover_by_port(self, pon_port: str) -> List[ONUUnconfigured]:
        """
        Discover ONUs pada PON port tertentu
        
        Args:
            pon_port: PON port (contoh: gpon_olt-1/1/1)
            
        Returns:
            List of ONUUnconfigured pada port tersebut
        """
        logger.info(f"Discovering ONUs on {pon_port}")
        return self.discover_unconfigured_onus(pon_port)
    
    def get_onu_by_serial(self, serial_number: str) -> Optional[ONUUnconfigured]:
        """
        Cari ONU berdasarkan serial number
        
        Args:
            serial_number: Serial number ONU
            
        Returns:
            ONUUnconfigured jika ditemukan, None jika tidak
        """
        onus = self.discover_unconfigured_onus()
        
        for onu in onus:
            if onu.sn.upper() == serial_number.upper():
                return onu
        
        return None
