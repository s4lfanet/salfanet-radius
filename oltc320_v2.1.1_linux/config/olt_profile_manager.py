"""
OLT Profile Manager
Manage multiple OLT configurations with profile-based storage
"""
import os
import json
import logging
from pathlib import Path
from typing import Optional, Dict, List
from dataclasses import dataclass, asdict


logger = logging.getLogger(__name__)


@dataclass
class OLTProfile:
    """OLT Profile configuration"""
    name: str
    host: str
    port: int = 23
    username: str = ""
    password: str = ""
    timeout: int = 10
    max_retries: int = 3
    enable_password: Optional[str] = None
    description: str = ""
    is_active: bool = False
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> "OLTProfile":
        """Create from dictionary"""
        return cls(**data)


class OLTProfileManager:
    """Manager for multiple OLT profiles"""
    
    def __init__(self, config_file: str = "config/olt_profiles.json"):
        # Convert to absolute path relative to this module's location
        if not os.path.isabs(config_file):
            module_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_file = os.path.join(module_dir, config_file)
        self.config_file = Path(config_file)
        self.profiles: Dict[str, OLTProfile] = {}
        self.active_profile_name: Optional[str] = None
        self._load_profiles()
    
    def _load_profiles(self):
        """Load profiles from JSON file"""
        logger.info(f"Loading profiles from: {self.config_file.absolute()}")
        
        if not self.config_file.exists():
            logger.info(f"Profile file not found, creating default: {self.config_file}")
            self._create_default_profile()
            return
        
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self.profiles = {
                name: OLTProfile.from_dict(profile_data)
                for name, profile_data in data.get('profiles', {}).items()
            }
            self.active_profile_name = data.get('active_profile')
            
            # Validate active profile exists
            if self.active_profile_name and self.active_profile_name not in self.profiles:
                logger.warning(f"Active profile '{self.active_profile_name}' not found")
                self.active_profile_name = None
            
            # Set is_active flag
            for name, profile in self.profiles.items():
                profile.is_active = (name == self.active_profile_name)
            
            logger.info(f"Loaded {len(self.profiles)} OLT profiles")
            
        except Exception as e:
            logger.error(f"Failed to load profiles: {e}")
            self._create_default_profile()
    
    def _save_profiles(self):
        """Save profiles to JSON file"""
        try:
            # Ensure directory exists
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                'active_profile': self.active_profile_name,
                'profiles': {
                    name: profile.to_dict()
                    for name, profile in self.profiles.items()
                }
            }
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved {len(self.profiles)} profiles to {self.config_file.absolute()}")
            
        except Exception as e:
            logger.error(f"Failed to save profiles to {self.config_file.absolute()}: {e}")
            raise
    
    def _create_default_profile(self):
        """Create default profile from environment variables"""
        import os
        
        default_profile = OLTProfile(
            name="default",
            host=os.getenv("OLT_HOST", ""),
            port=int(os.getenv("OLT_PORT", "23")),
            username=os.getenv("OLT_USERNAME", ""),
            password=os.getenv("OLT_PASSWORD", ""),
            timeout=int(os.getenv("OLT_TIMEOUT", "10")),
            max_retries=int(os.getenv("OLT_MAX_RETRIES", "3")),
            enable_password=os.getenv("OLT_ENABLE_PASSWORD"),
            description="Default OLT configuration",
            is_active=True
        )
        
        self.profiles["default"] = default_profile
        self.active_profile_name = "default"
        self._save_profiles()
    
    def add_profile(self, profile: OLTProfile) -> bool:
        """Add new OLT profile"""
        logger.info(f"Attempting to add profile: {profile.name}")
        
        if profile.name in self.profiles:
            logger.warning(f"Profile '{profile.name}' already exists")
            return False
        
        self.profiles[profile.name] = profile
        logger.info(f"Profile '{profile.name}' added to memory, saving to file...")
        
        # Set as active if no active profile
        if not self.active_profile_name:
            self.active_profile_name = profile.name
            profile.is_active = True
            logger.info(f"Profile '{profile.name}' set as active (first profile)")
        
        self._save_profiles()
        logger.info(f"Successfully added and saved profile: {profile.name}")
        return True
    
    def update_profile(self, name: str, profile: OLTProfile) -> bool:
        """Update existing profile"""
        logger.info(f"Attempting to update profile: {name}")
        
        if name not in self.profiles:
            logger.warning(f"Profile '{name}' not found")
            return False
        
        # Preserve is_active status
        profile.is_active = (name == self.active_profile_name)
        
        # Update profile
        self.profiles[name] = profile
        logger.info(f"Profile '{name}' updated in memory, saving to file...")
        
        # Update name if changed
        if name != profile.name:
            del self.profiles[name]
            self.profiles[profile.name] = profile
            if self.active_profile_name == name:
                self.active_profile_name = profile.name
            logger.info(f"Profile name changed from '{name}' to '{profile.name}'")
        
        self._save_profiles()
        logger.info(f"Successfully updated and saved profile: {name}")
        return True
    
    def delete_profile(self, name: str) -> bool:
        """Delete profile"""
        logger.info(f"Attempting to delete profile: {name}")
        
        if name not in self.profiles:
            logger.warning(f"Profile '{name}' not found")
            return False
        
        # Cannot delete active profile
        if name == self.active_profile_name:
            logger.warning(f"Cannot delete active profile '{name}'")
            return False
        
        del self.profiles[name]
        logger.info(f"Profile '{name}' deleted from memory, saving to file...")
        
        self._save_profiles()
        logger.info(f"Successfully deleted and saved changes for profile: {name}")
        return True
    
    def set_active_profile(self, name: str) -> bool:
        """Set active profile"""
        logger.info(f"Attempting to set active profile: {name}")
        
        if name not in self.profiles:
            logger.warning(f"Profile '{name}' not found")
            return False
        
        # Update is_active flags
        for profile_name, profile in self.profiles.items():
            profile.is_active = (profile_name == name)
        
        self.active_profile_name = name
        logger.info(f"Profile '{name}' set as active in memory, saving to file...")
        
        self._save_profiles()
        logger.info(f"Successfully set and saved active profile: {name}")
        return True
    
    def get_active_profile(self) -> Optional[OLTProfile]:
        """Get currently active profile"""
        if not self.active_profile_name:
            return None
        return self.profiles.get(self.active_profile_name)
    
    def get_profile(self, name: str) -> Optional[OLTProfile]:
        """Get profile by name"""
        return self.profiles.get(name)
    
    def list_profiles(self) -> List[OLTProfile]:
        """List all profiles"""
        return list(self.profiles.values())
    
    def get_profile_names(self) -> List[str]:
        """Get list of profile names"""
        return list(self.profiles.keys())
