"""
Terminal Menu Wrapper for Web UI
Menu interaktif yang tidak membuat koneksi OLT sendiri
Digunakan oleh web terminal untuk menampilkan menu tanpa mengganggu koneksi API
"""
import sys
import os

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def print_flush(text):
    """Print and flush immediately"""
    print(text, flush=True)

def print_header():
    """Print header"""
    print_flush("\n" + "=" * 60)
    print_flush("  OLT ZTE C320 - WEB TERMINAL")
    print_flush("=" * 60)

def print_menu():
    """Print main menu"""
    menu = """
  Gunakan Web UI untuk mengakses fitur-fitur berikut:

    ===================== ONU MANAGEMENT =====================
    1. Show Unconfigured ONU       -> Halaman ONUs
    2. ONU Register Wizard         -> Halaman ONUs (Add ONU)
    3. Show ONU Status             -> Halaman ONUs
    4. ONU Configuration           -> Halaman ONUs (Edit)
    5. ONU OMCI Configuration      -> Halaman ONUs (Config)

    =================== PROFILE & VLAN ====================
    6. Profile Management          -> Halaman Profiles
    7. VLAN Management             -> Halaman VLANs
    8. Uplink Interface            -> Halaman Uplinks

    =================== SYSTEM CONFIG =====================
    9. SNMP Management             -> Halaman System
    10. TR-069/ACS Configuration   -> Halaman System
    11. NTP & Time Configuration   -> Halaman System
    12. User Management            -> Halaman System
    13. System Information         -> Halaman Dashboard

    ====================== UTILITY ========================
    14. Sync ONU Data              -> API: /api/onus/unconfigured
    15. Save Configuration         -> API: /api/system/save-config
    16. Show Running Config        -> API: /api/system/running-config

    0. Help / Bantuan
    99. Exit
"""
    print_flush(menu)

def print_help():
    """Print help"""
    help_text = """
============================================================
  BANTUAN WEB TERMINAL
============================================================

  Terminal ini terhubung ke API backend dan berfungsi sebagai
  referensi untuk fitur-fitur yang tersedia.

  CARA MENGGUNAKAN:
  - Ketik nomor menu untuk melihat info lebih lanjut
  - Gunakan halaman Web UI untuk akses fitur lengkap
  - Ketik 'help' atau '0' untuk bantuan
  - Ketik 'exit' atau '99' untuk keluar

  WEB UI PAGES:
  - Dashboard  : http://localhost:3000/
  - ONUs       : http://localhost:3000/onus
  - Profiles   : http://localhost:3000/profiles
  - VLANs      : http://localhost:3000/vlans
  - System     : http://localhost:3000/system
  - Uplinks    : http://localhost:3000/uplinks

============================================================
"""
    print_flush(help_text)

def show_feature_info(choice):
    """Show info about a feature"""
    features = {
        "1": ("Show Unconfigured ONU", "Menampilkan ONU yang belum terdaftar", "/onus -> Unconfigured tab"),
        "2": ("ONU Register Wizard", "Mendaftarkan ONU baru ke OLT", "/onus -> Add ONU button"),
        "3": ("Show ONU Status", "Melihat status semua ONU", "/onus -> Status column"),
        "4": ("ONU Configuration", "Konfigurasi PPPOE/Bridge/Static IP", "/onus -> Edit button"),
        "5": ("ONU OMCI Configuration", "Konfigurasi LAN/WLAN binding", "/onus -> Config button"),
        "6": ("Profile Management", "Kelola TCONT, Traffic, Line, Service profile", "/profiles"),
        "7": ("VLAN Management", "Kelola VLAN dan service port", "/vlans"),
        "8": ("Uplink Interface", "Kelola uplink interface", "/uplinks"),
        "9": ("SNMP Management", "Konfigurasi SNMP", "/system -> SNMP tab"),
        "10": ("TR-069/ACS Configuration", "Konfigurasi TR-069", "/system -> TR-069 tab"),
        "11": ("NTP & Time Configuration", "Konfigurasi waktu", "/system -> NTP tab"),
        "12": ("User Management", "Kelola user OLT", "/system -> Users tab"),
        "13": ("System Information", "Info sistem dan alarm", "/ (Dashboard)"),
        "14": ("Sync ONU Data", "Refresh data ONU dari OLT", "API: GET /api/onus/unconfigured"),
        "15": ("Save Configuration", "Simpan konfigurasi OLT", "API: POST /api/system/save-config"),
        "16": ("Show Running Config", "Lihat running config", "API: GET /api/system/running-config"),
    }
    
    if choice in features:
        name, desc, location = features[choice]
        print_flush(f"\n  [{choice}] {name}")
        print_flush(f"  {'-' * 50}")
        print_flush(f"  Deskripsi: {desc}")
        print_flush(f"  Lokasi   : {location}")
        print_flush("")
    else:
        print_flush(f"\n  Menu '{choice}' tidak ditemukan. Ketik 'help' untuk bantuan.\n")

def main():
    """Main function"""
    print_header()
    print_menu()
    
    try:
        while True:
            try:
                sys.stdout.write("Pilih menu [0-16, 99]: ")
                sys.stdout.flush()
                user_input = sys.stdin.readline().strip().lower()
            except EOFError:
                continue
            
            if user_input in ['exit', 'quit', 'q', '99']:
                print_flush("\n✓ Keluar dari terminal. Sampai jumpa!")
                sys.exit(0)
            elif user_input in ['help', 'h', '?', '0']:
                print_help()
            elif user_input == 'menu':
                print_menu()
            elif user_input in [str(i) for i in range(1, 17)]:
                show_feature_info(user_input)
            elif user_input == 'clear':
                os.system('cls' if os.name == 'nt' else 'clear')
                print_header()
                print_menu()
            elif user_input:
                print_flush(f"\n  ⚠ Input '{user_input}' tidak valid.")
                print_flush("  Ketik angka 1-16, 'help', atau '99' untuk keluar.\n")
                
    except KeyboardInterrupt:
        print_flush("\n\n✓ Terminal ditutup.")
        sys.exit(0)

if __name__ == "__main__":
    main()
