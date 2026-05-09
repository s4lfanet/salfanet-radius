"""
Auto Register ONU - OLT ZTE ZXA10 C320
Main Application Entry Point

Aplikasi untuk auto-detect dan auto-register ONU pada OLT ZTE C320 firmware 2.1+
menggunakan Telnet connection.

Requirements:
- Python 3.10+ supported (includes vendored telnetlib for 3.13+)
- Recommended: Python 3.10, 3.11, or 3.12
"""
import os
import sys
import logging
import argparse
from datetime import datetime
from pathlib import Path


def check_python_version():
    """Check if Python version is compatible (3.10+)"""
    version_info = sys.version_info
    major, minor = version_info.major, version_info.minor
    
    if major != 3:
        print(f"ERROR: Python 3.x required, but found Python {major}.{minor}")
        print("Please install Python 3.10 or newer")
        sys.exit(1)
    
    if minor < 10:
        print(f"ERROR: Python 3.10+ required, but found Python {major}.{minor}")
        print("Please upgrade to Python 3.10 or newer")
        sys.exit(1)
    
    # Show warning for Python 3.13+ (using vendored telnetlib)
    if minor >= 13:
        print(f"⚠ Python {major}.{minor} detected")
        print("  Using vendored telnetlib (Python 3.13+ removed it from stdlib)")
        print("  Recommended: Python 3.10-3.12 for best compatibility\n")
    else:
        print(f"✓ Python {major}.{minor} detected (recommended version)")


# Check Python version before importing anything else
check_python_version()

from config.olt_config import OLTConfig
from core.telnet_client import TelnetClient
from services.onu_discovery import ONUDiscoveryService
from services.onu_register import ONURegisterService
from models.onu import ONUProfile


def setup_logging(log_level: str = "INFO"):
    """Setup logging configuration"""
    # Create logs directory jika belum ada
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Log filename dengan timestamp
    log_filename = log_dir / f"onu_register_{datetime.now().strftime('%Y%m%d')}.log"
    
    # Configure logging
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    # File handler
    file_handler = logging.FileHandler(log_filename, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(log_format))
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    logger = logging.getLogger(__name__)
    logger.info(f"Logging initialized - Log file: {log_filename}")


def load_env_file(env_file: str = ".env"):
    """Load environment variables from .env file"""
    env_path = Path(env_file)
    
    if not env_path.exists():
        return
    
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()


def print_banner():
    """Print application banner"""
    banner = """
+-----------------------------------------------------------+
|     AUTO REGISTER ONU - OLT ZTE ZXA10 C320 (FW 2.1+)     |
|                    Telnet Version                         |
+-----------------------------------------------------------+
    """
    print(banner)


def run_discovery_mode(config: OLTConfig, dry_run: bool = False):
    """
    Mode discovery - hanya menampilkan ONU yang ditemukan
    
    Args:
        config: OLT configuration
        dry_run: Jika True, tidak melakukan registrasi
    """
    logger = logging.getLogger(__name__)
    logger.info("Starting in DISCOVERY mode")
    
    # Create Telnet client
    client = TelnetClient(config)
    
    try:
        # Connect to OLT
        if not client.connect():
            logger.error("Failed to connect to OLT")
            return
        
        # Create discovery service
        discovery = ONUDiscoveryService(config, client)
        
        # Discover ONUs
        onus = discovery.discover_unconfigured_onus()
        
        # Display results
        print(f"\n{'='*60}")
        print(f"UNCONFIGURED ONUs FOUND: {len(onus)}")
        print(f"{'='*60}")
        
        if onus:
            for i, onu in enumerate(onus, 1):
                print(f"{i}. Port: {onu.pon_port}")
                print(f"   SN: {onu.sn}")
                print(f"   Vendor: {onu.vendor}")
                print(f"   State: {onu.state}")
                print()
        else:
            print("No unconfigured ONUs found.")
        
        print(f"{'='*60}\n")
        
    finally:
        client.disconnect()


def run_register_mode(config: OLTConfig, dry_run: bool = False, continuous: bool = False):
    """
    Mode register - auto-register ONU yang ditemukan
    
    Args:
        config: OLT configuration
        dry_run: Jika True, tidak melakukan registrasi
        continuous: Jika True, run continuous discovery
    """
    logger = logging.getLogger(__name__)
    logger.info("Starting in REGISTER mode")
    
    # Create Telnet client
    client = TelnetClient(config)
    
    try:
        # Connect to OLT
        if not client.connect():
            logger.error("Failed to connect to OLT")
            return
        
        # Create services
        discovery = ONUDiscoveryService(config, client)
        register_service = ONURegisterService(config, client)
        
        def register_callback(onus):
            """Callback untuk register ONU yang ditemukan"""
            if not onus:
                return
            
            print(f"\n{'='*60}")
            print(f"FOUND {len(onus)} NEW ONU(s) - Processing registration...")
            print(f"{'='*60}\n")
            
            for onu in onus:
                print(f"Processing: {onu.sn} on {onu.pon_port}")
                
                if dry_run:
                    print(f"  [DRY-RUN] Would register ONU: {onu.sn}")
                    continue
                
                # Register ONU
                result = register_service.register_onu(onu, auto_configure=True)
                
                # Display result
                if result.success:
                    print(f"  ✓ SUCCESS - ONU ID: {result.onu_id}")
                    print(f"    {result.message}")
                else:
                    print(f"  ✗ FAILED - {result.message}")
                    if result.error:
                        print(f"    Error: {result.error}")
                
                print()
        
        if continuous:
            # Continuous mode
            logger.info("Running in CONTINUOUS mode")
            print(f"Monitoring for new ONUs (interval: {config.discovery_interval}s)")
            print("Press Ctrl+C to stop...\n")
            
            discovery.discover_continuously(callback=register_callback)
        else:
            # Single scan
            onus = discovery.discover_unconfigured_onus()
            register_callback(onus)
    
    except KeyboardInterrupt:
        logger.info("Stopped by user")
        print("\nStopped by user.")
    
    finally:
        client.disconnect()


def run_interactive_menu(config: OLTConfig):
    """
    Mode menu - interactive menu untuk semua operasi OLT
    
    Args:
        config: OLT configuration
    """
    logger = logging.getLogger(__name__)
    logger.info("Starting in INTERACTIVE MENU mode")
    
    # Import menu
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
    from olt_complete_menu import OLTCompleteMenu
    
    # Create Telnet client
    client = TelnetClient(config)
    
    try:
        # Connect to OLT
        print(f"\nConnecting to OLT {config.host}:{config.port}...")
        if not client.connect():
            logger.error("Failed to connect to OLT")
            print("❌ GAGAL terhubung ke OLT!")
            print("   Periksa koneksi dan kredensial Anda.")
            return
        
        print("✅ BERHASIL terhubung ke OLT!")
        
        # Create and run menu
        menu = OLTCompleteMenu(client)
        menu.main_menu()
        
    finally:
        client.disconnect()
        print("\n✅ Disconnected dari OLT. Sampai jumpa!")


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Auto Register ONU for ZTE C320 OLT (Firmware 2.1+)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive menu mode (RECOMMENDED)
  python main.py --mode menu
  
  # Discovery mode (list ONUs)
  python main.py --mode discovery
  
  # Register mode (auto-register once)
  python main.py --mode register
  
  # Continuous mode (monitor and auto-register)
  python main.py --mode register --continuous
  
  # Dry-run (test without actual registration)
  python main.py --mode register --dry-run
  
  # Use custom .env file
  python main.py --env-file custom.env
        """
    )
    
    parser.add_argument(
        '--mode',
        choices=['menu', 'discovery', 'register'],
        default='menu',
        help='Operation mode: menu (interactive), discovery (list ONUs), register (auto-register)'
    )
    
    parser.add_argument(
        '--continuous',
        action='store_true',
        help='Run in continuous mode (monitor and auto-register)'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Dry-run mode (no actual registration)'
    )
    
    parser.add_argument(
        '--env-file',
        default='.env',
        help='Path to .env file (default: .env)'
    )
    
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level (default: INFO)'
    )
    
    args = parser.parse_args()
    
    # Print banner
    print_banner()
    
    # Setup logging
    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)
    
    # Load environment variables
    load_env_file(args.env_file)
    
    # Load configuration from active profile or .env
    config = OLTConfig.from_active_profile()
    
    # Validate configuration
    valid, message = config.validate()
    if not valid:
        logger.error(f"Configuration error: {message}")
        print(f"\n❌ Configuration error: {message}")
        print("\nPlease check your OLT profile or .env file.")
        print("See .env.example for reference.\n")
        sys.exit(1)
    
    logger.info(f"Configuration loaded - OLT: {config.host}:{config.port}")
    
    if args.dry_run:
        print("⚠️  DRY-RUN MODE - No actual registration will be performed\n")
    
    # Run based on mode
    try:
        if args.mode == 'menu':
            run_interactive_menu(config)
        elif args.mode == 'discovery':
            run_discovery_mode(config, dry_run=args.dry_run)
        elif args.mode == 'register':
            run_register_mode(config, dry_run=args.dry_run, continuous=args.continuous)
    
    except Exception as e:
        logger.exception(f"Application error: {e}")
        print(f"\n❌ Error: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
