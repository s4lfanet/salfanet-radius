"""
ONU Parser
Parsing output dari command show pon onu uncfg
"""
import re
import logging
from typing import List
from models.onu import ONUUnconfigured
from config.olt_config import ZTEConstants

logger = logging.getLogger(__name__)


class ONUParser:
    """Parser untuk output ONU dari ZTE C320"""
    
    @staticmethod
    def parse_unconfigured_onus(output: str) -> List[ONUUnconfigured]:
        """
        Parse output dari 'show pon onu uncfg'
        
        Format output ZTE C320 firmware 2.1+:
        ----------------------------------------------------------------------
        OnuIndex                       OnuType     OnuSn           State
        ----------------------------------------------------------------------
        gpon_olt-1/1/1                 N/A         ZTEGABCD1234    unknown
        gpon_olt-1/1/2                 N/A         ZTEG12345678    unknown
        
        Args:
            output: Raw output dari command
            
        Returns:
            List of ONUUnconfigured objects
        """
        onus = []
        lines = output.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines dan header
            if not line or '---' in line or 'OnuIndex' in line or 'OnuType' in line:
                continue
            
            # Parse dengan regex
            # Pattern: gpon_olt-1/1/1    Vendor    ZTEGXXXXXXXX    unknown
            match = re.search(ZTEConstants.PATTERN_ONU_UNCFG, line)
            
            if match:
                pon_port = f"gpon_olt-{match.group(1)}"
                vendor = match.group(2)
                sn = match.group(3)
                state = match.group(4)
                
                # Validasi serial number format
                if ONUParser._is_valid_serial_number(sn):
                    onu = ONUUnconfigured(
                        pon_port=pon_port,
                        sn=sn,
                        vendor=vendor,
                        state=state
                    )
                    onus.append(onu)
                    logger.debug(f"Parsed ONU: {onu}")
                else:
                    logger.warning(f"Invalid serial number format: {sn}")
            else:
                # Try alternative parsing (whitespace separated)
                parts = line.split()
                if len(parts) >= 4:
                    pon_port = parts[0]
                    vendor = parts[1]
                    sn = parts[2]
                    state = parts[3]
                    
                    # Validate pon_port format and SN (skip jika SN terlalu pendek)
                    if 'gpon' in pon_port.lower() and len(sn) >= 8 and ONUParser._is_valid_serial_number(sn):
                        onu = ONUUnconfigured(
                            pon_port=pon_port,
                            sn=sn,
                            vendor=vendor,
                            state=state
                        )
                        onus.append(onu)
                        logger.debug(f"Parsed ONU (alternative): {onu}")
        
        logger.info(f"Parsed {len(onus)} unconfigured ONUs")
        return onus
    
    @staticmethod
    def _is_valid_serial_number(sn: str) -> bool:
        """
        Validasi format serial number ONU
        
        Format umum:
        - ZTEG + 8 karakter (ZTE)
        - HWTC + 8 karakter (Huawei)
        - Minimal 4 karakter
        
        Args:
            sn: Serial number
            
        Returns:
            True jika valid
        """
        if not sn or len(sn) < 4:
            return False
        
        # Check if alphanumeric
        if not sn.replace('-', '').replace('_', '').isalnum():
            return False
        
        # Skip jika N/A atau placeholder
        if sn.upper() in ['N/A', 'NA', 'NONE', 'NULL']:
            return False
        
        return True
    
    @staticmethod
    def extract_pon_port_info(pon_port: str) -> dict:
        """
        Extract informasi dari pon_port string
        
        Args:
            pon_port: String PON port (contoh: gpon_olt-1/1/1)
            
        Returns:
            Dict dengan keys: slot, pon, port
        """
        # Pattern: gpon_olt-{slot}/{pon}/{port}
        match = re.search(r'gpon[_-]olt[_-](\d+)/(\d+)/(\d+)', pon_port)
        
        if match:
            return {
                'slot': int(match.group(1)),
                'pon': int(match.group(2)),
                'port': int(match.group(3)),
                'full': pon_port
            }
        
        return {}
    
    @staticmethod
    def parse_onu_state(output: str) -> dict:
        """
        Parse status ONU dari output show command
        
        Args:
            output: Output dari show command
            
        Returns:
            Dict dengan informasi state ONU
        """
        state_info = {
            'online': False,
            'los': False,
            'rx_power': None,
            'tx_power': None,
            'distance': None
        }
        
        output_lower = output.lower()
        
        # Check online status
        if 'online' in output_lower or 'working' in output_lower:
            state_info['online'] = True
        
        # Check LOS (Loss of Signal)
        if 'los' in output_lower or 'offline' in output_lower:
            state_info['los'] = True
            state_info['online'] = False
        
        # Parse RX power (contoh: RX: -23.5 dBm)
        rx_match = re.search(r'rx[:\s]+([+-]?\d+\.?\d*)\s*dbm', output_lower)
        if rx_match:
            state_info['rx_power'] = float(rx_match.group(1))
        
        # Parse TX power
        tx_match = re.search(r'tx[:\s]+([+-]?\d+\.?\d*)\s*dbm', output_lower)
        if tx_match:
            state_info['tx_power'] = float(tx_match.group(1))
        
        # Parse distance (contoh: Distance: 1234m)
        dist_match = re.search(r'distance[:\s]+(\d+)\s*m', output_lower)
        if dist_match:
            state_info['distance'] = int(dist_match.group(1))
        
        return state_info
