"""
ONU Registration Service
Auto-register ONU dengan profile dan service binding
"""
import logging
import time
from typing import List, Optional
from core.telnet_client import TelnetClient
from core.zte_command import ZTECommand
from models.onu import ONUUnconfigured, ONUProfile, ONURegistrationResult
from config.olt_config import OLTConfig

logger = logging.getLogger(__name__)


class ONURegisterService:
    """Service untuk registrasi ONU"""
    
    def __init__(self, config: OLTConfig, client: TelnetClient):
        self.config = config
        self.client = client
        self.zte_cmd = ZTECommand(client)
        # Track ONU IDs yang sudah digunakan dalam session ini
        self._used_onu_ids = {}  # {pon_port: set(onu_ids)}
    
    def register_onu(
        self, 
        onu: ONUUnconfigured,
        onu_type: Optional[str] = None,
        profile: Optional[ONUProfile] = None,
        auto_configure: bool = True
    ) -> ONURegistrationResult:
        """
        Register ONU dengan retry mechanism
        
        Args:
            onu: ONU yang akan diregister
            onu_type: Tipe ONU (default dari config)
            profile: Profile ONU (default profile jika None)
            auto_configure: Auto configure profile setelah register
            
        Returns:
            ONURegistrationResult
        """
        if onu_type is None:
            onu_type = self.config.default_onu_type
        
        if profile is None:
            profile = ONUProfile(
                tcont_profile=self.config.default_tcont_profile,
                user_vlan=self.config.default_vlan,
                service_vlan=self.config.default_vlan
            )
        
        logger.info(f"Registering ONU: {onu}")
        
        # Ensure connection
        if not self.client.ensure_connection():
            return ONURegistrationResult(
                success=False,
                onu=onu,
                message="Failed to connect to OLT",
                error="Connection error"
            )
        
        # Get next available ONU ID
        onu_id = self.zte_cmd.get_next_available_onu_id(onu.pon_port)
        
        if onu_id is None:
            return ONURegistrationResult(
                success=False,
                onu=onu,
                message="No available ONU ID on this port",
                error="Port full"
            )
        
        # Check session-local tracking dan skip jika sudah digunakan
        if onu.pon_port not in self._used_onu_ids:
            self._used_onu_ids[onu.pon_port] = set()
        
        # Find next ID yang belum digunakan dalam session ini
        while onu_id in self._used_onu_ids[onu.pon_port]:
            onu_id += 1
            if onu_id > 128:  # Max ONU ID
                return ONURegistrationResult(
                    success=False,
                    onu=onu,
                    message="No available ONU ID (session tracking)",
                    error="Port full"
                )
        
        # Mark ID as used for this session
        self._used_onu_ids[onu.pon_port].add(onu_id)
        logger.debug(f"Reserved ONU ID {onu_id} for {onu.pon_port} (session tracking)")
        
        # Retry mechanism
        max_retries = self.config.max_retries
        retry_count = 0
        
        while retry_count < max_retries:
            retry_count += 1
            
            logger.info(f"Registration attempt {retry_count}/{max_retries} for {onu.sn}")
            
            # Parse PON port to get frame, slot, port
            frame, slot, port = self.zte_cmd.parse_pon_port(onu.pon_port)
            
            # Step-by-step registration
            success, message = self.zte_cmd.register_onu_stepbystep(
                frame=frame,
                slot=slot,
                port=port,
                onu_id=onu_id,
                serial_number=onu.sn,
                tcont_profile=profile.tcont_profile if profile else self.config.default_tcont_profile,
                user_vlan=profile.user_vlan if profile else self.config.default_vlan
            )
            
            if success:
                logger.info(f"ONU {onu.sn} registered and configured as ID {onu_id}")
                
                return ONURegistrationResult(
                    success=True,
                    onu=onu,
                    onu_id=onu_id,
                    message=message,
                    retry_count=retry_count
                )
            
            # Registration failed
            logger.warning(f"Registration attempt {retry_count} failed: {message}")
            
            # Check if error is retryable
            if "already exist" in message.lower():
                # ONU already exists, not retryable
                return ONURegistrationResult(
                    success=False,
                    onu=onu,
                    onu_id=onu_id,
                    message="ONU already exists",
                    error=message,
                    retry_count=retry_count
                )
            
            if "id conflict" in message.lower():
                # Try with next ID
                logger.warning(f"ONU ID {onu_id} conflict, trying next ID...")
                onu_id = self.zte_cmd.get_next_available_onu_id(onu.pon_port)
                if onu_id is None:
                    return ONURegistrationResult(
                        success=False,
                        onu=onu,
                        message="No available ONU ID",
                        error="Port full after conflict",
                        retry_count=retry_count
                    )
            
            # Wait before retry
            if retry_count < max_retries:
                time.sleep(2)
        
        # Max retries reached
        return ONURegistrationResult(
            success=False,
            onu=onu,
            onu_id=onu_id,
            message=f"Registration failed after {max_retries} attempts",
            error=message,
            retry_count=retry_count
        )
    
    def _configure_profile(self, pon_port: str, onu_id: int, profile: ONUProfile) -> bool:
        """
        Configure profile untuk ONU
        
        Args:
            pon_port: PON port
            onu_id: ONU ID
            profile: ONUProfile object
            
        Returns:
            True jika berhasil
        """
        logger.info(f"Configuring profile for ONU ID {onu_id} on {pon_port}")
        
        success, message = self.zte_cmd.configure_onu_profile(
            pon_port=pon_port,
            onu_id=onu_id,
            tcont_profile=profile.tcont_profile,
            tcont_id=profile.tcont_id,
            gemport_id=profile.gemport_id,
            user_vlan=profile.user_vlan,
            service_vlan=profile.service_vlan,
            service_port=profile.service_port,
            vport=profile.vport
        )
        
        if success:
            logger.info(f"Profile configured: {message}")
        else:
            logger.error(f"Profile configuration failed: {message}")
        
        return success
    
    def register_multiple(
        self, 
        onus: List[ONUUnconfigured],
        onu_type: Optional[str] = None,
        profile: Optional[ONUProfile] = None,
        auto_configure: bool = True
    ) -> List[ONURegistrationResult]:
        """
        Register multiple ONUs
        
        Args:
            onus: List of ONUs to register
            onu_type: Tipe ONU (default dari config)
            profile: Profile ONU
            auto_configure: Auto configure profile
            
        Returns:
            List of ONURegistrationResult
        """
        results = []
        
        logger.info(f"Registering {len(onus)} ONU(s)...")
        
        for i, onu in enumerate(onus, 1):
            logger.info(f"Processing ONU {i}/{len(onus)}: {onu.sn}")
            
            result = self.register_onu(
                onu=onu,
                onu_type=onu_type,
                profile=profile,
                auto_configure=auto_configure
            )
            
            results.append(result)
            
            # Small delay between registrations
            if i < len(onus):
                time.sleep(1)
        
        # Summary
        success_count = sum(1 for r in results if r.success)
        logger.info(f"Registration complete: {success_count}/{len(onus)} successful")
        
        return results
    
    def register_with_custom_profile(
        self,
        onu: ONUUnconfigured,
        onu_type: str,
        tcont_profile: str,
        user_vlan: int,
        service_vlan: int
    ) -> ONURegistrationResult:
        """
        Register ONU dengan custom profile
        
        Args:
            onu: ONU to register
            onu_type: ONU type
            tcont_profile: TCONT profile name
            user_vlan: User VLAN
            service_vlan: Service VLAN
            
        Returns:
            ONURegistrationResult
        """
        profile = ONUProfile(
            tcont_profile=tcont_profile,
            user_vlan=user_vlan,
            service_vlan=service_vlan
        )
        
        return self.register_onu(
            onu=onu,
            onu_type=onu_type,
            profile=profile,
            auto_configure=True
        )
    
    def delete_onu(self, pon_port: str, onu_id: int) -> bool:
        """
        Delete ONU (wrapper untuk ZTECommand.delete_onu)
        
        Args:
            pon_port: PON port
            onu_id: ONU ID
            
        Returns:
            True jika berhasil
        """
        success, message = self.zte_cmd.delete_onu(pon_port, onu_id)
        
        if success:
            logger.info(f"ONU deleted: {pon_port} ID {onu_id}")
        else:
            logger.error(f"Failed to delete ONU: {message}")
        
        return success
