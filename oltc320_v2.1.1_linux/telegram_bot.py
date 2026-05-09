"""
Telegram Bot untuk OLT Management
Integrasi dengan aplikasi OLTC320 untuk remote management via Telegram
"""
import os
import sys
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, List

# Tambahkan path untuk import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, 
    CommandHandler, 
    CallbackQueryHandler, 
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters
)

from config.olt_profile_manager import OLTProfileManager
from core.telnet_client import TelnetClient
from scripts.onu_config_manager import ONUConfigManager
from scripts.olt_config_manager import OLTConfigManager
from scripts.onu_register_wizard import ONURegistrationWizard

# SNMP integration (v2.2.0) — optional, graceful fallback if not installed
try:
    from scripts.snmp_bot_commands import SNMPBotContext, register_snmp_handlers
    from notification.telegram_notifier import TelegramNotifier
    _SNMP_AVAILABLE = True
except ImportError:
    _SNMP_AVAILABLE = False
    logger_tmp = logging.getLogger(__name__)
    logger_tmp.debug("SNMP/notification modules not available — SNMP commands disabled")

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# States untuk conversation - Registration Wizard
(
    # Basic wizard states
    REG_SELECT_TYPE,      # 0 - Select ONU Type
    REG_INPUT_ID,         # 1 - Input ONU ID
    REG_INPUT_NAME,       # 2 - Input ONU Name
    REG_INPUT_DESC,       # 3 - Input ONU Description
    REG_SELECT_SERVICE,   # 4 - Select Service Type (PPPOE/Bridge/Static/ZTE/Huawei/Fiberhome)
    # PPPOE states
    REG_PPPOE_USER,       # 5 - Input PPPoE username
    REG_PPPOE_PASS,       # 6 - Input PPPoE password
    # Static IP states
    REG_STATIC_IP,        # 7 - Input Static IP
    REG_STATIC_MASK,      # 8 - Input Netmask
    REG_STATIC_GW,        # 9 - Input Gateway
    # Fiberhome VEIP states
    REG_FH_TR069_VLAN,    # 10 - Fiberhome TR069/Mgmt VLAN
    REG_FH_INTERNET_VLAN, # 11 - Fiberhome Internet VLAN
    REG_FH_VOIP_VLAN,     # 12 - Fiberhome VoIP VLAN
    REG_FH_ACS_URL,       # 13 - Fiberhome ACS URL
    REG_FH_ACS_USER,      # 14 - Fiberhome ACS Username
    REG_FH_ACS_PASS,      # 15 - Fiberhome ACS Password
    # ZTE Full states
    REG_ZTE_PRIMARY_VLAN,   # 16 - ZTE Primary/Internet VLAN
    REG_ZTE_SECONDARY_VLAN, # 17 - ZTE Secondary/Voucher VLAN
    REG_ZTE_PPPOE_ENABLE,   # 18 - ZTE PPPoE enable
    REG_ZTE_PPPOE_USER,     # 19 - ZTE PPPoE username
    REG_ZTE_PPPOE_PASS,     # 20 - ZTE PPPoE password
    REG_ZTE_WIFI_ENABLE,    # 21 - ZTE WiFi/SSID config enable
    REG_ZTE_DUAL_SSID,      # 22 - ZTE Enable Dual SSID
    REG_ZTE_SSID1_NAME,     # 23 - ZTE SSID 1 Name
    REG_ZTE_SSID1_AUTH,     # 24 - ZTE SSID 1 Auth Type
    REG_ZTE_SSID1_PASS,     # 25 - ZTE SSID 1 Password
    REG_ZTE_SSID2_NAME,     # 26 - ZTE SSID 2 Name
    REG_ZTE_SSID2_AUTH,     # 27 - ZTE SSID 2 Auth Type
    REG_ZTE_SSID2_PASS,     # 28 - ZTE SSID 2 Password
    REG_ZTE_TR069_ENABLE,   # 29 - ZTE TR069 enable
    REG_ZTE_ACS_URL,        # 30 - ZTE ACS URL
    REG_ZTE_ACS_USER,       # 31 - ZTE ACS Username
    REG_ZTE_ACS_PASS,       # 32 - ZTE ACS Password
    REG_ZTE_FIREWALL_ENABLE,# 33 - ZTE Firewall enable
    REG_ZTE_FIREWALL_LEVEL, # 34 - ZTE Firewall level
    # Huawei Full states
    REG_HW_MGMT_VLAN,       # 35 - Huawei Management VLAN
    REG_HW_INTERNET_VLAN,   # 36 - Huawei Internet VLAN
    REG_HW_VOIP_VLAN,       # 37 - Huawei VoIP VLAN
    REG_HW_WAN_MODE,        # 38 - Huawei WAN Mode (DHCP/Static/PPPoE)
    REG_HW_WAN_STATIC_IP,   # 39 - Huawei WAN Static IP
    REG_HW_WAN_STATIC_MASK, # 40 - Huawei WAN Netmask
    REG_HW_WAN_STATIC_GW,   # 41 - Huawei WAN Gateway
    REG_HW_WAN_PPPOE_USER,  # 42 - Huawei WAN PPPoE Username
    REG_HW_WAN_PPPOE_PASS,  # 43 - Huawei WAN PPPoE Password
    REG_HW_ACS_URL,         # 44 - Huawei ACS URL
    # Profile selection states
    REG_SELECT_TCONT,       # 45 - Select TCONT Profile
    REG_SELECT_TRAFFIC,     # 46 - Select Traffic Profile
    REG_SELECT_VLAN,        # 47 - Select/Input VLAN
    REG_CONFIRM,            # 47 - Confirm registration
    # Old states (kept for compatibility)
    WAITING_PON_PORT,       # 48
    WAITING_ONU_ID,         # 49
    WAITING_CONFIRM,        # 50
    WAITING_ONU_NAME,       # 51
    WAITING_ONU_TYPE,       # 52
    # OMCI states
    SHOW_OMCI_VLAN_SELECT,  # 53 - Show VLAN OMCI Configuration - ONU selection
    # LAN/WLAN Binding states
    OMCI_LAN_SELECT_ONU,    # 54 - Select ONU for LAN binding
    OMCI_LAN_INPUT_PORT,    # 55 - Input LAN port (1-4)
    OMCI_LAN_INPUT_VLAN,    # 56 - Input VLAN ID
    OMCI_LAN_SELECT_MODE,   # 57 - Select mode (transparent/tag)
    OMCI_WLAN_SELECT_ONU,   # 58 - Select ONU for WLAN binding
    OMCI_WLAN_INPUT_SSID,   # 59 - Input SSID index (1-4)
    OMCI_WLAN_INPUT_VLAN,   # 60 - Input VLAN ID
    OMCI_WLAN_SELECT_MODE,  # 61 - Select mode (transparent/tag)
    # ONU Configuration states
    CFG_SELECT_ONU,         # 62 - Select ONU for configuration
    CFG_PPPOE_INPUT_USER,   # 63 - Input PPPoE username
    CFG_PPPOE_INPUT_PASS,   # 64 - Input PPPoE password
    CFG_PPPOE_INPUT_VLAN,   # 65 - Input VLAN for PPPoE
    CFG_PPPOE_SELECT_TCONT, # 66 - Select TCONT profile for PPPoE
    CFG_PPPOE_SELECT_TRAFFIC, # 67 - Select Traffic profile for PPPoE
    CFG_BRIDGE_INPUT_VLAN,  # 68 - Input VLAN for Bridge
    CFG_BRIDGE_INPUT_PORT,  # 69 - Input ETH port for Bridge
    CFG_BRIDGE_SELECT_TCONT, # 70 - Select TCONT profile for Bridge
    CFG_STATIC_INPUT_IP,    # 71 - Input Static IP
    CFG_STATIC_INPUT_MASK,  # 72 - Input Netmask
    CFG_STATIC_INPUT_GW,    # 73 - Input Gateway
    CFG_STATIC_INPUT_DNS1,  # 74 - Input DNS 1
    CFG_STATIC_INPUT_DNS2,  # 75 - Input DNS 2
    CFG_STATIC_INPUT_VLAN,  # 76 - Input VLAN for Static
    CFG_STATIC_SELECT_TCONT,# 77 - Select TCONT profile for Static
    # Edit existing config states
    CFG_PPPOE_ACTION_SELECT,# 78 - Select action: Edit/New/Keep for PPPoE
    CFG_PPPOE_EDIT_PARAM,   # 79 - Select parameter to edit for PPPoE
    CFG_BRIDGE_ACTION_SELECT,# 80 - Select action: Edit/New/Keep for Bridge
    CFG_BRIDGE_EDIT_PARAM,  # 81 - Select parameter to edit for Bridge
    CFG_STATIC_ACTION_SELECT,# 82 - Select action: Edit/New/Keep for Static
    CFG_STATIC_EDIT_PARAM,  # 83 - Select parameter to edit for Static
    # OLT Profile Management states
    OLT_MGMT_ADD_NAME,      # 84 - Add OLT: Input profile name
    OLT_MGMT_ADD_HOST,      # 85 - Add OLT: Input host/IP
    OLT_MGMT_ADD_PORT,      # 86 - Add OLT: Input port
    OLT_MGMT_ADD_USERNAME,  # 87 - Add OLT: Input username
    OLT_MGMT_ADD_PASSWORD,  # 88 - Add OLT: Input password
    OLT_MGMT_ADD_EN_PWD,    # 89 - Add OLT: Input enable password
    OLT_MGMT_ADD_DESC,      # 90 - Add OLT: Input description
    OLT_MGMT_EDIT_SELECT,   # 91 - Edit OLT: Select profile to edit
    OLT_MGMT_EDIT_FIELD,    # 92 - Edit OLT: Select field to edit
    OLT_MGMT_EDIT_VALUE,    # 93 - Edit OLT: Input new value
    OLT_MGMT_DEL_SELECT,    # 94 - Delete OLT: Select profile to delete
    OLT_MGMT_DEL_CONFIRM    # 95 - Delete OLT: Confirm deletion
) = range(97)

# Authorized users (Telegram User ID)
# Ganti dengan user ID Telegram Anda
AUTHORIZED_USERS = [
    # 123456789,  # Tambahkan User ID Anda disini
]

class OLTTelegramBot:
    """Telegram Bot untuk OLT Management"""
    
    def __init__(self, token: str, admin_users: List[int] = None):
        """
        Initialize bot
        
        Args:
            token: Telegram Bot Token dari @BotFather
            admin_users: List of authorized Telegram User IDs
        """
        self.token = token
        self.admin_users = admin_users or AUTHORIZED_USERS
        self.profile_manager = OLTProfileManager()
        self.active_connections: Dict[int, TelnetClient] = {}
    
    @staticmethod
    def escape_markdown(text: str) -> str:
        """Escape markdown special characters"""
        special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
        for char in special_chars:
            text = text.replace(char, f'\\{char}')
        return text
    
    def is_authorized(self, user_id: int) -> bool:
        """Check if user is authorized"""
        return user_id in self.admin_users
    
    async def get_client(self, user_id: int) -> Optional[TelnetClient]:
        """Get or create telnet client for user with connection health check"""
        # Check if client exists and is still connected
        if user_id in self.active_connections:
            client = self.active_connections[user_id]
            
            # Check connection health
            if client.is_connected():
                logger.debug(f"Using existing connection for user {user_id}")
                return client
            else:
                # Connection lost, try to reconnect
                logger.warning(f"Connection lost for user {user_id}, attempting reconnect...")
                try:
                    if client.ensure_connection():
                        logger.info(f"Successfully reconnected for user {user_id}")
                        return client
                    else:
                        # Reconnect failed, remove from active connections
                        logger.error(f"Reconnect failed for user {user_id}, removing stale connection")
                        del self.active_connections[user_id]
                except Exception as e:
                    logger.error(f"Error during reconnect for user {user_id}: {e}")
                    del self.active_connections[user_id]
        
        # Get active profile
        profile = self.profile_manager.get_active_profile()
        if not profile:
            logger.error("No active OLT profile configured")
            return None
        
        try:
            logger.info(f"Creating new connection to OLT: {profile.name} ({profile.host}:{profile.port})")
            
            # Create OLTConfig from profile
            from config.olt_config import OLTConfig
            config = OLTConfig(
                host=profile.host,
                port=profile.port,
                username=profile.username,
                password=profile.password,
                timeout=profile.timeout,
                enable_password=profile.enable_password
            )
            
            # Create TelnetClient with config
            client = TelnetClient(config)
            
            if client.connect():
                logger.info(f"Connected to OLT: {profile.name}")
                self.active_connections[user_id] = client
                return client
            else:
                logger.error(f"Failed to connect to OLT: {profile.name}")
        except Exception as e:
            logger.error(f"Failed to connect to OLT {profile.name}: {e}", exc_info=True)
        
        return None
    
    async def send_long_output_as_file(self, query, output: str, title: str, 
                                       keyboard: list, file_prefix: str = "output"):
        """
        Helper function to send long output as file
        
        Args:
            query: Callback query object
            output: Output text to send
            title: Title for the message
            keyboard: Keyboard markup
            file_prefix: Prefix for filename (default: "output")
        """
        import tempfile
        import os
        from datetime import datetime
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{file_prefix}_{timestamp}.txt"
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as f:
            f.write(output)
            temp_path = f.name
        
        # Send as document WITHOUT keyboard (keyboard will be on original message)
        await query.message.reply_document(
            document=open(temp_path, 'rb'),
            filename=filename,
            caption=f"📄 *{title}*\n\n"
                    f"File size: {len(output):,} characters\n"
                    f"Lines: {len(output.split(chr(10))):,}\n\n"
                    f"✅ Complete output exported",
            parse_mode='Markdown'
        )
        
        # Edit original message with keyboard buttons
        try:
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(
                f"📄 *{title}*\n\n"
                f"✅ File sent successfully!\n"
                f"File: `{filename}`",
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        except:
            pass
        
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass
    
    # ==================== COMMAND HANDLERS ====================
    
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler untuk /start command"""
        user_id = update.effective_user.id
        username = update.effective_user.username or update.effective_user.first_name
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                f"⛔ Unauthorized!\n\n"
                f"User ID: `{user_id}`\n"
                f"Username: @{username}\n\n"
                f"Contact admin to authorize your User ID.",
                parse_mode='Markdown'
            )
            return
        
        await update.message.reply_text(
            f"🤖 *OLT Management Bot*\n\n"
            f"Welcome @{username}!\n"
            f"User ID: `{user_id}`\n\n"
            f"*✨ Complete OLT Management:*\n\n"
            f"🔄 OLT Selection\n"
            f"📱 ONU Management (Register/Config/Delete)\n"
            f"📝 Profile & VLAN Management\n"
            f"🔧 System Configuration\n"
            f"💾 Save & Utility\n\n"
            f"*Same features as CLI!*\n\n"
            f"Tap /menu to get started! 🚀",
            parse_mode='Markdown'
        )
    
    async def menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show main menu with inline keyboard - sama dengan CLI structure"""
        # Handle both command message and callback query
        query = update.callback_query
        if query:
            await query.answer()
            message = query.message
        else:
            message = update.message
        
        if not self.is_authorized(update.effective_user.id):
            if query:
                await message.edit_text("⛔ Unauthorized!")
            else:
                await message.reply_text("⛔ Unauthorized!")
            return
        
        # Get active OLT profile info
        profile_info = "No active OLT"
        try:
            from config.olt_profile_manager import OLTProfileManager
            profile_mgr = OLTProfileManager()
            active = profile_mgr.get_active_profile()
            if active:
                profile_info = f"{active.name} ({active.host})"
        except:
            pass
        
        keyboard = [
            # OLT Selection
            [InlineKeyboardButton("🔄 Switch OLT", callback_data='menu_0')],
            
            # ONU MANAGEMENT
            [InlineKeyboardButton("═══ 📱 ONU MANAGEMENT ═══", callback_data='noop')],
            [InlineKeyboardButton("1️⃣ Show Unconfigured ONU", callback_data='menu_1')],
            [InlineKeyboardButton("2️⃣ Register Wizard", callback_data='menu_2')],
            [InlineKeyboardButton("3️⃣ Show ONU Status", callback_data='menu_3')],
            [
                InlineKeyboardButton("4️⃣ ONU Configuration", callback_data='menu_4'),
                InlineKeyboardButton("5️⃣ OMCI Config", callback_data='menu_5')
            ],
            [InlineKeyboardButton("6️⃣ Delete ONU", callback_data='menu_6')],
            
            # PROFILE & VLAN
            [InlineKeyboardButton("═══ 📊 PROFILE & VLAN ═══", callback_data='noop')],
            [
                InlineKeyboardButton("7️⃣ Profile Mgmt", callback_data='menu_7'),
                InlineKeyboardButton("8️⃣ VLAN Mgmt", callback_data='menu_8')
            ],
            [InlineKeyboardButton("9️⃣ Uplink Management", callback_data='menu_9')],
            
            # SYSTEM CONFIG
            [InlineKeyboardButton("═══ ⚙️ SYSTEM CONFIG ═══", callback_data='noop')],
            [
                InlineKeyboardButton("🔟 SNMP Mgmt", callback_data='menu_10'),
                InlineKeyboardButton("1️⃣1️⃣ TR-069/ACS", callback_data='menu_11')
            ],
            [
                InlineKeyboardButton("1️⃣2️⃣ NTP & Time", callback_data='menu_12'),
                InlineKeyboardButton("1️⃣3️⃣ User Mgmt", callback_data='menu_13')
            ],
            [InlineKeyboardButton("1️⃣4️⃣ System Info & Alarms", callback_data='menu_14')],
            
            # UTILITY
            [InlineKeyboardButton("═══ 🛠️ UTILITY ═══", callback_data='noop')],
            [
                InlineKeyboardButton("1️⃣5️⃣ Sync ONU Data", callback_data='menu_15'),
                InlineKeyboardButton("1️⃣6️⃣ Save Config", callback_data='menu_16')
            ],
            [InlineKeyboardButton("1️⃣7️⃣ Show Running Config", callback_data='menu_17')],
            
            # Help
            [InlineKeyboardButton("❓ Help", callback_data='help')]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "🎛️ *OLT ZTE C320 - Complete Management*\n\n"
            f"📡 Current OLT: `{profile_info}`\n\n"
            "Select menu:"
        )
        
        if query:
            await message.edit_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        else:
            await message.reply_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
    
    async def onu_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler untuk registered ONU list dengan inline buttons"""
        query = update.callback_query
        if query:
            await query.answer()
            message = query.message
            is_edit = True
        else:
            message = update.message
            is_edit = False
        
        if not self.is_authorized(update.effective_user.id):
            await message.reply_text("⛔ Unauthorized!")
            return
        
        # Show loading
        if is_edit:
            await message.edit_text("🔄 Fetching registered ONU... Please wait...")
        else:
            loading_msg = await message.reply_text("🔄 Fetching registered ONU... Please wait...")
        
        client = await self.get_client(update.effective_user.id)
        if not client:
            await message.reply_text("❌ Failed to connect to OLT")
            return
        
        try:
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                text = "📭 *No Registered ONU*\n\nNo working ONU found.\n\nTap /menu to continue"
                if is_edit:
                    await message.edit_text(text, parse_mode='Markdown')
                else:
                    await loading_msg.edit_text(text, parse_mode='Markdown')
                return
            
            # Format output dengan inline buttons
            response = f"📋 *Registered ONU List*\n\n"
            response += f"📊 Total: *{len(working_onus)}* ONU\n\n"
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):  # Limit 10
                port = onu['pon_port'].replace('gpon-olt_', '')
                onu_id = onu.get('onu_id', '?')
                name = onu.get('name', 'N/A')
                status = onu.get('status', 'N/A')
                
                # Clean status
                if 'working' in status.lower():
                    status_icon = "✅"
                elif 'offline' in status.lower() or 'los' in status.lower():
                    status_icon = "❌"
                else:
                    status_icon = "⚠️"
                
                response += f"*{i}. {name}*\n"
                response += f"   📍 PON: {port}, ID: {onu_id}\n"
                response += f"   {status_icon} Status: {status}\n\n"
                
                # Add button for this ONU
                button_text = f"⚙️ Config #{i} ({port}:{onu_id})"
                callback_data = f"cfgonu_{i-1}"
                keyboard.append([InlineKeyboardButton(button_text, callback_data=callback_data)])
            
            if len(working_onus) > 10:
                response += f"_...and {len(working_onus) - 10} more ONU_\n\n"
            
            # Store working_onus in context
            context.user_data['working_onus'] = working_onus
            
            # Add action buttons
            keyboard.append([
                InlineKeyboardButton("🔄 Refresh", callback_data='refresh_working'),
                InlineKeyboardButton("🔙 Back", callback_data='back_menu')
            ])
            
            response += "💡 *Pilih ONU untuk konfigurasi atau refresh list*"
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            if is_edit:
                await message.edit_text(response, reply_markup=reply_markup, parse_mode='Markdown')
            else:
                await loading_msg.edit_text(response, reply_markup=reply_markup, parse_mode='Markdown')
                onu_id = onu.get('onu_id', '?')
                name = onu.get('name', 'N/A')
                status = onu.get('status', 'N/A')
                
                response += f"{i}. *{name}*\n"
                response += f"   📍 PON: {port}, ID: {onu_id}\n"
                response += f"   🔘 Status: {status}\n\n"
            
            if len(working_onus) > 20:
                response += f"_...and {len(working_onus) - 20} more ONU_\n\n"
            
            response += "Tap /menu to continue"
            
            await message.reply_text(response, parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error fetching ONU list: {e}")
            await message.reply_text(f"❌ Error: {str(e)}")
    
    async def onu_uncfg(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler untuk unconfigured ONU dengan inline buttons"""
        query = update.callback_query
        if query:
            await query.answer()
            message = query.message
            is_edit = True
        else:
            message = update.message
            is_edit = False
        
        if not self.is_authorized(update.effective_user.id):
            await message.reply_text("⛔ Unauthorized!")
            return
        
        # Show loading message
        if is_edit:
            await message.edit_text("🔄 Scanning for unconfigured ONU...")
        else:
            loading_msg = await message.reply_text("🔄 Scanning for unconfigured ONU...")
        
        client = await self.get_client(update.effective_user.id)
        if not client:
            await message.reply_text("❌ Failed to connect to OLT")
            return
        
        try:
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            # fetch_unconfigured_onus() scan all ports
            uncfg_onus = wizard.fetch_unconfigured_onus()
            
            if not uncfg_onus:
                text = "✅ *No Unconfigured ONU*\n\nAll ONU are registered.\n\nTap /menu to continue"
                if is_edit:
                    await message.edit_text(text, parse_mode='Markdown')
                else:
                    await loading_msg.edit_text(text, parse_mode='Markdown')
                return
            
            # Format output dengan inline buttons untuk setiap ONU
            response = f"🔍 *Unconfigured ONU List*\n\n"
            response += f"📊 Total: *{len(uncfg_onus)}* ONU\n\n"
            
            # Show first 10 ONU dengan details
            keyboard = []
            for i, onu in enumerate(uncfg_onus[:10], 1):
                port = onu.get('pon_port', '?')
                sn = onu.get('sn', 'Unknown')
                model = onu.get('model', 'Unknown')
                
                response += f"*{i}. PON {port}*\n"
                response += f"   📟 SN: `{sn}`\n"
                if model and model != 'Unknown' and model != '-':
                    response += f"   📱 Model: {model}\n"
                response += "\n"
                
                # Add button for this ONU
                button_text = f"📝 Register #{i} ({port})"
                callback_data = f"regonu_{i-1}"  # index in list
                keyboard.append([InlineKeyboardButton(button_text, callback_data=callback_data)])
            
            if len(uncfg_onus) > 10:
                response += f"_...and {len(uncfg_onus) - 10} more ONU_\n\n"
            
            # Store uncfg_onus in context for later use
            context.user_data['uncfg_onus'] = uncfg_onus
            
            # Add action buttons
            keyboard.append([
                InlineKeyboardButton("🔄 Refresh", callback_data='refresh_uncfg'),
                InlineKeyboardButton("🔙 Back", callback_data='back_menu')
            ])
            
            response += "💡 *Pilih ONU untuk register atau refresh list*"
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            if is_edit:
                await message.edit_text(response, reply_markup=reply_markup, parse_mode='Markdown')
            else:
                await loading_msg.edit_text(response, reply_markup=reply_markup, parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error fetching unconfigured ONU: {e}")
            await message.reply_text(f"❌ Error: {str(e)}")
    
    async def olt_info(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show OLT information"""
        query = update.callback_query
        if query:
            await query.answer()
            message = query.message
        else:
            message = update.message
        
        if not self.is_authorized(update.effective_user.id):
            await message.reply_text("⛔ Unauthorized!")
            return
        
        client = await self.get_client(update.effective_user.id)
        if not client:
            await message.reply_text("❌ Failed to connect to OLT")
            return
        
        try:
            # Get OLT info
            profiles = self.profile_manager.list_profiles()
            if profiles:
                profile = profiles[0]
                
                response = f"🌐 *OLT Information*\n\n"
                response += f"📌 Name: {profile.name}\n"
                response += f"🔗 Host: {profile.host}:{profile.port}\n"
                response += f"👤 User: {profile.username}\n"
                response += f"⏱️ Timeout: {profile.timeout}s\n"
                
                # Get version info
                success, output = client.execute_command("show version")
                if success and output:
                    lines = output.split('\n')
                    for line in lines[:5]:
                        if line.strip():
                            response += f"\n{line.strip()}"
                
                response += "\n\nTap /menu to continue"
                
                await message.reply_text(response, parse_mode='Markdown')
            else:
                await message.reply_text("❌ No OLT profile configured\n\nTap /menu to continue")
                
        except Exception as e:
            logger.error(f"Error getting OLT info: {e}")
            await message.reply_text(f"❌ Error: {str(e)}")
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show help"""
        query = update.callback_query
        if query:
            await query.answer()
            message = query.message
        else:
            message = update.message
        
        help_text = """
🤖 *OLT Management Bot - Complete Features*

*📱 OLT Selection:*
🔄 Switch OLT Profile

*📋 ONU Management:*
• ONU List - Show all registered ONU
• Unconfigured - Scan unregistered ONU
• Register ONU - PPPOE/Bridge/Custom
• Configure ONU - PPPOE/Bridge/Static/WiFi
• ONU OMCI - LAN/WLAN Binding
• Delete ONU - Clear/Unregister/Complete

*📝 Profile & VLAN:*
• Profile Mgmt - TCONT/Traffic/Line/Service
• VLAN Mgmt - Add/Show/Delete
• Uplink Mgmt - Interface config

*🔧 System Config:*
• SNMP Configuration
• TR-069/ACS Configuration
• NTP & Time Settings
• User Management
• System Information

*💾 Utility:*
• Save Config - Write to OLT
• OLT Info - Show details

*⚡ Quick Commands:*
/menu - Show main menu
/help - Show this help
/cancel - Cancel operation

*💡 Tips:*
- Use inline buttons for easy navigation
- Complex configs best done via CLI
- All changes logged for audit

*🔒 Security:*
Only authorized users can access
"""
        
        await message.reply_text(help_text, parse_mode='Markdown')
    
    async def button_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle inline button callbacks"""
        query = update.callback_query
        
        # Handle expired queries gracefully
        try:
            await query.answer()
        except Exception as e:
            # Query too old or invalid - ignore
            if "query is too old" in str(e).lower() or "query id is invalid" in str(e).lower():
                logger.warning(f"Expired callback query ignored: {callback_data if 'callback_data' in locals() else query.data}")
                return
            # Re-raise other exceptions
            raise
        
        if not self.is_authorized(update.effective_user.id):
            await query.message.reply_text("⛔ Unauthorized!")
            return
        
        callback_data = query.data
        
        # No-op untuk separator headers
        if callback_data == 'noop':
            return
        
        # Numbered menu handlers (sama dengan CLI)
        if callback_data == 'menu_0':  # Switch OLT
            await self.switch_olt_menu(update, context)
        elif callback_data == 'menu_1':  # Show Unconfigured ONU
            await self.onu_uncfg(update, context)
        elif callback_data == 'menu_2':  # Register Wizard
            await self.onu_register_menu(update, context)
        elif callback_data == 'menu_3':  # Show ONU Status
            await self.show_onu_status_menu(update, context)
        elif callback_data == 'menu_4':  # ONU Configuration
            await self.onu_config_menu(update, context)
        elif callback_data == 'menu_5':  # OMCI Configuration
            await self.onu_omci_menu(update, context)
        elif callback_data == 'menu_6':  # Delete ONU
            await self.onu_delete_menu(update, context)
        elif callback_data == 'menu_7':  # Profile Management
            await self.profile_menu(update, context)
        elif callback_data == 'menu_8':  # VLAN Management
            await self.vlan_menu(update, context)
        elif callback_data == 'menu_9':  # Uplink Management
            await self.uplink_menu(update, context)
        elif callback_data == 'menu_10':  # SNMP Management
            await self.show_snmp_config(update, context)
        elif callback_data == 'menu_11':  # TR-069/ACS Configuration
            await self.show_tr069_config(update, context)
        elif callback_data == 'menu_12':  # NTP & Time Configuration
            await self.show_ntp_config(update, context)
        elif callback_data == 'menu_13':  # User Management
            await self.show_users(update, context)
        elif callback_data == 'menu_14':  # System Information & Alarms
            await self.system_info_menu(update, context)
        elif callback_data == 'sysinfo_basic':
            await self.sysinfo_basic(update, context)
        elif callback_data == 'sysinfo_overview':
            await self.sysinfo_overview(update, context)
        elif callback_data == 'sysinfo_card':
            await self.sysinfo_card(update, context)
        elif callback_data == 'sysinfo_alarms':
            await self.sysinfo_alarms(update, context)
        elif callback_data == 'sysinfo_interface':
            await self.sysinfo_interface(update, context)
        elif callback_data == 'menu_15':  # Sync ONU Data
            await self.sync_onu_data(update, context)
        elif callback_data == 'sync_uncfg':
            await self.sync_unconfigured_onu(update, context)
        elif callback_data == 'sync_working':
            await self.sync_working_onu(update, context)
        elif callback_data == 'sync_all_onu':
            await self.sync_all_onu(update, context)
        elif callback_data == 'sync_profiles':
            await self.sync_profiles(update, context)
        elif callback_data == 'sync_everything':
            await self.sync_everything(update, context)
        elif callback_data == 'menu_16':  # Save Configuration
            await self.save_config(update, context)
        elif callback_data == 'menu_17':  # Show Running Config
            await self.show_running_config(update, context)
        
        # Legacy callback handlers (backward compatibility)
        # OLT Selection
        elif callback_data == 'switch_olt':
            await self.switch_olt_menu(update, context)
        # ONU Management
        elif callback_data == 'onu_list':
            await self.onu_list(update, context)
        elif callback_data == 'menu_onu_list':
            await self.onu_list(update, context)
        elif callback_data == 'onu_uncfg':
            await self.onu_uncfg(update, context)
        elif callback_data == 'onu_register':
            await self.onu_register_menu(update, context)
        elif callback_data == 'onu_configure':
            await self.onu_config_menu(update, context)
        elif callback_data == 'onu_omci':
            await self.onu_omci_menu(update, context)
        elif callback_data == 'onu_delete':
            await self.onu_delete_menu(update, context)
        # Profile & VLAN
        elif callback_data == 'profile_menu':
            await self.profile_menu(update, context)
        elif callback_data == 'vlan_menu':
            await self.vlan_menu(update, context)
        elif callback_data == 'uplink_menu':
            await self.uplink_menu(update, context)
        # System Config
        elif callback_data == 'system_menu':
            await self.system_menu(update, context)
        # Utility
        elif callback_data == 'save_config':
            await self.save_config(update, context)
        elif callback_data == 'olt_info':
            await self.olt_info(update, context)
        elif callback_data == 'help':
            await self.help_command(update, context)
        # Back to menu
        elif callback_data == 'back_menu':
            await self.menu(update, context)
        # Main menu (sama seperti back_menu)
        elif callback_data == 'main_menu':
            await self.menu(update, context)
        # Switch OLT profile
        elif callback_data.startswith('switch_'):
            profile_name = callback_data.replace('switch_', '')
            await self.do_switch_olt(update, context, profile_name)
        
        # OLT Management handlers
        elif callback_data == 'olt_mgmt_switch':
            await self.olt_switch_select_menu(update, context)
        elif callback_data == 'olt_mgmt_add':
            return await self.olt_add_start(update, context)
        elif callback_data == 'olt_mgmt_edit':
            await self.olt_edit_select_menu(update, context)
        elif callback_data == 'olt_mgmt_delete':
            await self.olt_delete_select_menu(update, context)
        elif callback_data.startswith('olt_edit_'):
            profile_name = callback_data.replace('olt_edit_', '')
            return await self.olt_edit_field_menu(update, context, profile_name)
        elif callback_data.startswith('olt_editfield_'):
            return await self.olt_edit_field_selected(update, context)
        elif callback_data.startswith('olt_delete_'):
            profile_name = callback_data.replace('olt_delete_', '')
            return await self.olt_delete_confirm(update, context, profile_name)
        elif callback_data == 'olt_delete_yes':
            return await self.olt_delete_execute(update, context)
        elif callback_data == 'olt_delete_no':
            await self.switch_olt_menu(update, context)
        
        # Profile Management Submenus
        elif callback_data == 'prof_tcont':
            await self.tcont_profile_menu(update, context)
        elif callback_data == 'prof_tcont_show':
            await self.show_tcont_profiles(update, context)
        elif callback_data == 'prof_tcont_add':
            await query.edit_message_text(
                "➕ *Add TCONT Profile*\n\n"
                "📝 Please use CLI for adding profiles:\n"
                "Requires: name, max_bw, type_id, assured_bw\n\n"
                "Example via CLI:\n"
                "```\n"
                "Name: TCONT_100M\n"
                "Max BW: 102400 kbps\n"
                "Type: 4 (Best Effort)\n"
                "Assured BW: 51200 kbps\n"
                "```\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_tcont_del':
            await query.edit_message_text(
                "❌ *Delete TCONT Profile*\n\n"
                "📝 Please use CLI for deleting profiles:\n"
                "This requires profile name and confirmation.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_traffic':
            await self.traffic_profile_menu(update, context)
        elif callback_data == 'prof_traffic_show':
            await self.show_traffic_profiles(update, context)
        elif callback_data == 'prof_traffic_add':
            await query.edit_message_text(
                "➕ *Add Traffic Profile*\n\n"
                "📝 Please use CLI for adding profiles:\n"
                "Requires: name, CIR, PIR, CBS, PBS\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_traffic_del':
            await query.edit_message_text(
                "❌ *Delete Traffic Profile*\n\n"
                "📝 Please use CLI for deleting profiles:\n"
                "This requires profile name and confirmation.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_line':
            await self.line_profile_menu(update, context)
        elif callback_data == 'prof_line_show':
            await self.show_line_profiles(update, context)
        elif callback_data == 'prof_line_add':
            await query.edit_message_text(
                "➕ *Add Line Profile*\n\n"
                "📝 Please use CLI for adding profiles:\n"
                "Requires: name, TCONT, traffic profile, mapping mode\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_line_del':
            await query.edit_message_text(
                "❌ *Delete Line Profile*\n\n"
                "📝 Please use CLI for deleting profiles:\n"
                "This requires profile name and confirmation.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_service':
            await self.service_profile_menu(update, context)
        elif callback_data == 'prof_service_show':
            await self.show_service_profiles(update, context)
        elif callback_data == 'prof_service_add':
            await query.edit_message_text(
                "➕ *Add Service Profile*\n\n"
                "📝 Please use CLI for adding profiles:\n"
                "Requires: name, ONU type, binding configuration\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_service_del':
            await query.edit_message_text(
                "❌ *Delete Service Profile*\n\n"
                "📝 Please use CLI for deleting profiles:\n"
                "This requires profile name and confirmation.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        # ONU Type Management
        elif callback_data == 'prof_onutype':
            await self.onutype_menu(update, context)
        elif callback_data == 'prof_onutype_show':
            await self.show_onu_types(update, context)
        elif callback_data == 'prof_onutype_add':
            await query.edit_message_text(
                "➕ *Add ONU Type*\n\n"
                "📝 Please use CLI for adding ONU types:\n"
                "Requires: name, description, max T-CONT, max GEM port, etc.\n\n"
                "⚠️ Changes are immediately effective!\n"
                "Don't forget to save configuration.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'prof_onutype_del':
            await query.edit_message_text(
                "❌ *Delete ONU Type*\n\n"
                "📝 Please use CLI for deleting ONU types:\n"
                "This requires type name and confirmation.\n\n"
                "⚠️ Changes are immediately effective!\n"
                "Don't forget to save configuration.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        # VLAN Management
        elif callback_data == 'vlan_show':
            await self.show_vlans(update, context)
        elif callback_data == 'vlan_add':
            await query.edit_message_text(
                "➕ *Add VLAN*\n\n"
                "📝 Please use CLI for adding VLANs:\n"
                "This requires interactive input.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'vlan_del':
            await query.edit_message_text(
                "❌ *Delete VLAN*\n\n"
                "📝 Please use CLI for deleting VLANs:\n"
                "This requires confirmation.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        elif callback_data == 'uplink_menu':
            await self.uplink_menu(update, context)
        
        # Uplink Management Submenus
        elif callback_data == 'uplink_show':
            await self.show_uplink(update, context)
        elif callback_data == 'uplink_status':
            await self.show_uplink_status_menu(update, context)
        elif callback_data == 'uplink_vlan_cfg':
            await self.show_uplink_vlan_config_menu(update, context)
        elif callback_data == 'uplink_vlan_del':
            await self.show_uplink_vlan_delete_menu(update, context)
        elif callback_data == 'uplink_shutdown':
            await self.show_uplink_shutdown_menu(update, context)
        elif callback_data == 'uplink_enable':
            await self.show_uplink_enable_menu(update, context)
        elif callback_data == 'uplink_cfg':
            # Redirect to uplink_vlan_cfg (same wizard)
            await self.show_uplink_vlan_config_menu(update, context)
        
        # Uplink Status - Interface selection
        elif callback_data.startswith('uplink_stat_if_'):
            await self.show_interface_status_detail(update, context)
        
        # Uplink Delete VLAN - Interface selection
        elif callback_data.startswith('uplink_del_if_'):
            await self.show_uplink_delete_vlan_select(update, context)
        
        # Uplink Delete VLAN - VLAN ID selection
        elif callback_data.startswith('uplink_delvlan_'):
            await self.execute_uplink_delete_vlan(update, context)
        
        # Uplink Shutdown - Interface selection
        elif callback_data.startswith('uplink_shut_if_'):
            await self.execute_uplink_shutdown(update, context)
        
        # Uplink Enable - Interface selection
        elif callback_data.startswith('uplink_enab_if_'):
            await self.execute_uplink_enable(update, context)
        
        # System Configuration - Main Menus
        elif callback_data == 'system_menu':
            await self.system_menu(update, context)
        elif callback_data == 'sys_snmp':
            await self.show_snmp_config(update, context)
        elif callback_data == 'sys_tr069':
            await self.show_tr069_config(update, context)
        elif callback_data == 'sys_ntp':
            await self.show_ntp_config(update, context)
        elif callback_data == 'sys_user':
            await self.show_users(update, context)
        
        # SNMP Management Submenus
        elif callback_data == 'snmp_show':
            await self.snmp_show_config(update, context)
        elif callback_data == 'snmp_communities':
            await self.snmp_show_communities(update, context)
        elif callback_data == 'snmp_add_community':
            await self.snmp_add_community_menu(update, context)
        elif callback_data == 'snmp_del_community':
            await self.snmp_del_community_menu(update, context)
        elif callback_data == 'snmp_contact':
            await self.snmp_contact_menu(update, context)
        elif callback_data == 'snmp_trap':
            await self.snmp_trap_menu(update, context)
        elif callback_data == 'snmp_trap_info':
            await self.snmp_trap_menu(update, context)
        elif callback_data.startswith('snmp_addcomm_'):
            await self.execute_snmp_add_community(update, context)
        elif callback_data.startswith('snmp_delcomm_'):
            await self.execute_snmp_del_community(update, context)
        elif callback_data.startswith('snmp_setcontact_'):
            await self.execute_snmp_set_contact(update, context)
        elif callback_data.startswith('snmp_setloc_'):
            await self.execute_snmp_set_location(update, context)
        
        # TR-069/ACS Submenus (matching CLI tr069_menu)
        elif callback_data == 'tr069_show':
            await self.tr069_show_config(update, context)
        elif callback_data == 'tr069_set_global':
            await self.tr069_set_global_menu(update, context)
        # TR-069 Set Global ACS - Step by Step
        elif callback_data == 'tr069_preset_genieacs':
            await self.tr069_step1_url(update, context, 'genieacs', 7547)
        elif callback_data == 'tr069_preset_openacs':
            await self.tr069_step1_url(update, context, 'openacs', 8080)
        elif callback_data == 'tr069_preset_custom':
            await self.tr069_step1_custom_url(update, context)
        elif callback_data.startswith('tr069_step1_setip_'):
            await self.tr069_step2_username(update, context)
        elif callback_data == 'tr069_skip_user':
            await self.tr069_step3_password(update, context, skip_user=True)
        elif callback_data.startswith('tr069_step2_setuser_'):
            await self.tr069_step3_password(update, context)
        elif callback_data == 'tr069_skip_pass':
            await self.tr069_step4_interval(update, context, skip_pass=True)
        elif callback_data.startswith('tr069_step3_setpass_'):
            await self.tr069_step4_interval(update, context)
        elif callback_data.startswith('tr069_step4_setint_'):
            await self.execute_tr069_set_global(update, context)
        
        # NTP & Time Submenus
        elif callback_data == 'ntp_show':
            await self.ntp_show_config(update, context)
        elif callback_data == 'ntp_time':
            await self.ntp_show_time(update, context)
        elif callback_data == 'ntp_set_time':
            await self.execute_ntp_set_time(update, context)
        elif callback_data == 'ntp_enable':
            await self.execute_ntp_enable(update, context)
        elif callback_data == 'ntp_disable':
            await self.execute_ntp_disable(update, context)
        elif callback_data == 'ntp_add':
            await self.ntp_add_server_menu(update, context)
        elif callback_data == 'ntp_del':
            await self.ntp_del_server_menu(update, context)
        elif callback_data == 'ntp_timezone':
            await self.ntp_timezone_menu(update, context)
        elif callback_data.startswith('ntp_addsvr_'):
            await self.execute_ntp_add_server(update, context)
        elif callback_data.startswith('ntp_delsvr_'):
            await self.execute_ntp_del_server(update, context)
        elif callback_data.startswith('ntp_settz_'):
            await self.execute_ntp_set_timezone(update, context)
        
        # User Management Submenus
        elif callback_data == 'user_show':
            await self.user_show_list(update, context)
        elif callback_data == 'user_add':
            await self.user_add_menu(update, context)
        elif callback_data == 'user_del':
            await self.user_del_menu(update, context)
        elif callback_data == 'user_passwd':
            await self.user_passwd_menu(update, context)
        elif callback_data.startswith('user_addlvl_'):
            await self.user_add_level_selected(update, context)
        elif callback_data.startswith('user_delusr_'):
            await self.execute_user_delete(update, context)
        
        # ONU Registration Wizard actions (6 submenu)
        elif callback_data == 'reg_uncfg_list':
            # Redirect ke unconfigured ONU list (sudah ada)
            await self.onu_uncfg(update, context)
        
        elif callback_data == 'reg_working_list':
            # Redirect ke working ONU list (sudah ada)
            await self.onu_list(update, context)
        
        elif callback_data == 'reg_edit_name':
            await query.edit_message_text(
                "✏️ *Edit Nama/Deskripsi ONU*\n\n"
                "📝 Untuk mengubah nama/deskripsi ONU:\n\n"
                "1. Use CLI Menu: Register Wizard → Edit Nama\n"
                "2. Pilih ONU dari list\n"
                "3. Input nama/deskripsi baru\n\n"
                "ℹ️ Bot dapat menampilkan list ONU:\n"
                "• Use: 📋 ONU List untuk melihat semua ONU\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        elif callback_data == 'reg_config_service':
            await query.edit_message_text(
                "⚙️ *Konfigurasi Service ONU*\n\n"
                "📝 Wizard service configuration:\n\n"
                "• PPPOE - Setup PPPoE dengan username/password\n"
                "• Bridge - Bridge mode configuration\n"
                "• Static IP - Static IP assignment\n"
                "• Router Mode - Router with NAT\n\n"
                "💡 Recommended: Use CLI wizard\n"
                "   Menu: Register Wizard → Konfigurasi Service\n\n"
                "Wizard akan guide step-by-step untuk:\n"
                "- Pilih ONU\n"
                "- Pilih service type\n"
                "- Input parameters\n"
                "- Apply configuration\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        elif callback_data == 'reg_manage_profile':
            await query.edit_message_text(
                "🔧 *Management Profile*\n\n"
                "📝 Kelola profile untuk ONU:\n\n"
                "• TCONT Profile - Bandwidth allocation\n"
                "• Traffic Profile - Traffic shaping\n"
                "• VLAN Configuration - VLAN assignment\n"
                "• Line Profile - ONU line settings\n"
                "• Service Profile - Service binding\n\n"
                "💡 Use CLI for profile management:\n"
                "   Menu: Register Wizard → Management Profile\n\n"
                "Or use main menu:\n"
                "   📝 Profile Mgmt\n"
                "   🏷️ VLAN Mgmt\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        elif callback_data == 'reg_save':
            await self.save_config(update, context)
        
        # Keep old registration actions for backward compatibility  
        elif callback_data in ['reg_pppoe', 'reg_bridge', 'reg_custom']:
            reg_type = callback_data.replace('reg_', '').upper()
            await query.edit_message_text(
                f"➕ *Register ONU - {reg_type}*\n\n"
                f"📝 Registration wizard requires multiple steps:\n\n"
                f"1. Select unconfigured ONU (PON/SN)\n"
                f"2. Input ONU ID and description\n"
                f"3. Select ONU type\n"
                f"4. Choose Line/Service profile\n"
                f"5. Configure VLAN settings\n"
                f"6. Confirm registration\n\n"
                f"💡 *Recommended:* Use CLI for registration wizard\n"
                f"   CLI Menu: ONU Management → Register ONU\n\n"
                f"📱 Bot capabilities:\n"
                f"• View unconfigured ONU: /onu_uncfg\n"
                f"• View registered ONU: Use 📱 ONU List\n\n"
                f"Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        # ONU Configuration actions
        elif callback_data == 'cfg_pppoe':
            await self.onu_config_pppoe_menu(update, context)
        
        elif callback_data == 'cfg_bridge':
            await self.onu_config_bridge_menu(update, context)
        
        elif callback_data == 'cfg_static':
            await self.onu_config_static_menu(update, context)
        
        elif callback_data == 'cfg_service_port':
            await self.onu_config_service_port_menu(update, context)
        
        elif callback_data.startswith('show_svc_port_'):
            await self.show_onu_service_port(update, context)
        
        # Remote ONU Management - direct access from ONU Configuration menu
        elif callback_data == 'remote_restart':
            await self.remote_restart_menu(update, context)
        
        elif callback_data == 'remote_factory_reset':
            await self.remote_factory_reset_menu(update, context)
        
        elif callback_data == 'remote_details':
            await self.remote_details_select_port(update, context)
        
        elif callback_data.startswith('details_port_'):
            await self.remote_details_onu_list(update, context)
        
        elif callback_data.startswith('restart_onu_'):
            await self.execute_restart_onu(update, context)
        
        elif callback_data.startswith('factory_reset_'):
            await self.execute_factory_reset(update, context)
        
        elif callback_data.startswith('details_onu_'):
            await self.show_onu_details(update, context)
        
        elif callback_data.startswith('cfg_pppoe_onu_'):
            await self.onu_config_pppoe_start(update, context)
        
        elif callback_data.startswith('cfg_bridge_onu_'):
            await self.onu_config_bridge_start(update, context)
        
        elif callback_data.startswith('cfg_static_onu_'):
            await self.onu_config_static_start(update, context)
        
        elif callback_data == 'cfg_show_list':
            await self.show_working_onu_list(update, context)
        
        elif callback_data == 'cfg_security':
            await query.edit_message_text(
                "🔒 *Security Management (Remote Access)*\n\n"
                "Configure ONU remote management:\n\n"
                "• Enable/Disable Telnet\n"
                "• Enable/Disable SSH\n"
                "• Enable/Disable Web Management\n"
                "• Set Management Credentials\n\n"
                "📝 Best via CLI:\n"
                "Menu → ONU Config → Security Management\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_tr069':
            await query.edit_message_text(
                "📡 *Configure TR069/ACS*\n\n"
                "Setup TR069 for remote management:\n\n"
                "• ACS URL\n"
                "• ACS Username/Password\n"
                "• Periodic Inform Interval\n"
                "• Connection Request\n\n"
                "📝 Best via CLI:\n"
                "Menu → ONU Config → Configure TR069\n\n"
                "Example URL:\n"
                "`http://acs.example.com:7547/`\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_web_mgmt':
            await query.edit_message_text(
                "🌐 *Enable Remote Web Management*\n\n"
                "Enable web interface access on ONU:\n\n"
                "• Enable HTTP/HTTPS\n"
                "• Set Web Admin Password\n"
                "• Configure Access Port\n\n"
                "⚠️ Warning: Enables remote access to ONU\n\n"
                "📝 Best via CLI:\n"
                "Menu → ONU Config → Remote Web Management\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_fiberhome':
            await query.edit_message_text(
                "🔧 *Configure Fiberhome VEIP*\n\n"
                "Fiberhome HG6145D2-AC Configuration:\n\n"
                "• VEIP (Virtual Ethernet Interface)\n"
                "• Multi-VLAN Setup\n"
                "• Service Port Binding\n"
                "• WiFi Configuration\n\n"
                "📝 Specific to Fiberhome ONU models\n\n"
                "Use CLI for full configuration:\n"
                "Menu → ONU Config → Fiberhome VEIP\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_zte_full':
            await query.edit_message_text(
                "⚙️ *Configure ZTE Full*\n\n"
                "Complete ZTE ONU Configuration:\n\n"
                "• Dual SSID (2.4GHz + 5GHz)\n"
                "• Dual VLAN (Internet + IPTV)\n"
                "• Service Port Binding\n"
                "• TR069 ACS Setup\n"
                "• Remote Management\n\n"
                "📝 For ZTE ONU models (F601, F609, F660, etc)\n\n"
                "Use CLI for wizard:\n"
                "Menu → ONU Config → ZTE Full\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_huawei_full':
            await query.edit_message_text(
                "⚙️ *Configure Huawei Full*\n\n"
                "Complete Huawei ONU Configuration:\n\n"
                "• Multi-VLAN Support (Internet + IPTV + VoIP)\n"
                "• Service Port Configuration\n"
                "• WiFi Dual Band\n"
                "• TR069 Setup\n\n"
                "📝 For Huawei ONU models (HG8245, etc)\n\n"
                "Use CLI for wizard:\n"
                "Menu → ONU Config → Huawei Full\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]])
            )
        
        elif callback_data == 'cfg_restart':
            await query.edit_message_text(
                "🔄 *Restart ONU*\n\n"
                "📝 To restart ONU, use CLI:\n\n"
                "1. Menu: ONU Management → Configure ONU\n"
                "2. Select: Restart ONU\n"
                "3. Input: PON Port and ONU ID\n"
                "4. Confirm restart\n\n"
                "⚠️ ONU will disconnect briefly during restart.\n\n"
                "Tap /menu to continue.",
                parse_mode='Markdown'
            )
        
        # OMCI actions
        elif callback_data == 'omci_lan':
            # Set LAN Port Binding
            await self.omci_lan_menu(update, context)
        
        elif callback_data == 'omci_wlan':
            # Set WLAN Binding
            await self.omci_wlan_menu(update, context)
        
        elif callback_data == 'omci_auto':
            # Auto-Provision Management
            await self.omci_auto_provision_menu(update, context)
        
        elif callback_data == 'omci_vlan':
            # Show VLAN OMCI Configuration
            await self.show_omci_vlan_menu(update, context)
        
        elif callback_data.startswith('omci_vlan_onu_'):
            # Show VLAN OMCI for selected ONU
            await self.show_omci_vlan_result(update, context)
        
        elif callback_data == 'omci_show':
            # Show ONU Running Config
            await self.omci_show_running_config_menu(update, context)
        
        elif callback_data.startswith('omci_show_onu_'):
            # Show running config for selected ONU
            await self.omci_show_running_config_result(update, context)
        
        elif callback_data.startswith('omci_lan_onu_'):
            # Start LAN binding conversation
            await self.omci_lan_start_config(update, context)
        
        elif callback_data.startswith('omci_wlan_onu_'):
            # Start WLAN binding conversation
            await self.omci_wlan_start_config(update, context)
        
        # Handler untuk register ONU dari unconfigured list - DO NOT HANDLE HERE
        # This is now handled by ConversationHandler entry point
        elif callback_data.startswith('regonu_'):
            # Skip - let ConversationHandler handle this
            pass
        
        # Handler untuk refresh unconfigured list
        elif callback_data == 'refresh_uncfg':
            await self.onu_uncfg(update, context)
        
        # Handler untuk refresh working ONU list
        elif callback_data == 'refresh_working':
            await self.onu_list(update, context)
        
        # Handler untuk Auto-Provision ONU (individual)
        elif callback_data == 'omci_auto_provision_onu':
            await self.omci_auto_provision_onu_menu(update, context)
        
        # Handler untuk detail provision ONU
        elif callback_data.startswith('provision_onu_'):
            await self.omci_provision_onu_detail(update, context)
        
        # Handler untuk provision actions (view, vlan, reapply)
        elif callback_data.startswith('provision_view_'):
            await self.omci_provision_view_config(update, context)
        elif callback_data.startswith('provision_vlan_'):
            await self.omci_provision_vlan_placeholder(update, context)
        elif callback_data.startswith('provision_reapply_'):
            await self.omci_provision_reapply_placeholder(update, context)
        elif callback_data.startswith('reapply_confirm_'):
            await self.omci_provision_reapply_execute(update, context)
        
        # Handler untuk Show Auto-Learning Status
        elif callback_data == 'omci_auto_learning_status':
            await self.omci_show_auto_learning_status(update, context)
        
        # Handler untuk Show ONU Status scans
        elif callback_data == 'status_select_port':
            await self.status_select_port(update, context)
        elif callback_data.startswith('status_port_'):
            await self.status_port_menu(update, context)
        elif callback_data.startswith('status_quick_port_'):
            await self.status_quick_port_scan(update, context)
        elif callback_data.startswith('status_full_port_'):
            await self.status_full_port_scan(update, context)
        elif callback_data.startswith('status_onu_list_'):
            await self.status_show_onu_list(update, context)
        elif callback_data.startswith('status_onu_detail_'):
            await self.status_show_onu_detail(update, context)
        elif callback_data == 'onu_status_quick':
            await self.show_onu_status_quick_scan(update, context)
        elif callback_data == 'onu_status_full':
            await self.show_onu_status_full_scan(update, context)
        
        # Handler untuk configure ONU dari working list
        elif callback_data.startswith('cfgonu_'):
            try:
                onu_idx = int(callback_data.replace('cfgonu_', ''))
                working_onus = context.user_data.get('working_onus', [])
                
                if onu_idx >= len(working_onus):
                    await query.edit_message_text("❌ ONU not found. Please refresh the list.")
                    return
                
                onu = working_onus[onu_idx]
                port = onu['pon_port'].replace('gpon-olt_', '')
                onu_id = onu.get('onu_id', '?')
                name = onu.get('name', 'N/A')
                status = onu.get('status', 'N/A')
                
                # Show ONU details and configuration options
                text = (
                    f"⚙️ *Configure ONU #{onu_idx + 1}*\n\n"
                    f"📝 *Name:* {name}\n"
                    f"📍 *PON Port:* {port}\n"
                    f"🆔 *ONU ID:* {onu_id}\n"
                    f"📊 *Status:* {status}\n\n"
                    f"🔧 *Configuration Options via CLI:*\n\n"
                    f"1. Run: `python main.py` atau `./run.bat`\n"
                    f"2. Menu: [4] ONU Configuration\n"
                    f"3. Choose configuration type:\n"
                    f"   • [3] Configure PPPOE\n"
                    f"   • [4] Configure Bridge\n"
                    f"   • [5] Configure Static IP\n"
                    f"   • [7] Configure WiFi\n"
                    f"   • [6] Restart ONU\n\n"
                    f"📡 *OMCI Configuration:*\n"
                    f"Menu: [5] ONU OMCI Configuration\n"
                    f"   • Set LAN Port Binding\n"
                    f"   • Set WLAN Binding\n"
                    f"   • Show Running Config\n\n"
                    f"✏️ *Edit Name/Description:*\n"
                    f"Menu: [2] Register Wizard → [3] Edit Nama\n\n"
                    f"❌ *Delete/Unregister:*\n"
                    f"Menu: [6] Delete ONU\n\n"
                    f"💡 *Quick Actions:*\n"
                    f"• Restart: Input PON {port} and ID {onu_id}\n"
                    f"• Check detail: Show ONU running config\n"
                )
                
                keyboard = [
                    [InlineKeyboardButton("🔙 Back to List", callback_data='reg_working_list')],
                    [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
                
            except Exception as e:
                logger.error(f"Error showing ONU config details: {e}")
                await query.edit_message_text(f"❌ Error: {str(e)}")
        
        # Placeholder handlers
        elif callback_data.startswith('reg_'):
            await query.message.reply_text("⚠️ Registration wizard - Use CLI for full wizard")
        elif callback_data.startswith('cfg_'):
            await query.message.reply_text("⚠️ Configuration - Use CLI for detailed config")
        elif callback_data.startswith('omci_'):
            await query.message.reply_text("⚠️ OMCI Config - Use CLI for LAN/WLAN binding")
        elif callback_data == 'del_config':
            await self.delete_clear_config_menu(update, context)
        elif callback_data == 'del_unreg':
            await self.delete_unregister_menu(update, context)
        elif callback_data == 'del_complete':
            await self.delete_complete_menu(update, context)
        elif callback_data.startswith('delcfg_onu_'):
            await self.execute_clear_config(update, context)
        elif callback_data.startswith('delunreg_onu_'):
            await self.execute_unregister(update, context)
        elif callback_data.startswith('delcomp_onu_'):
            await self.execute_delete_complete(update, context)
        elif callback_data.startswith('uplink_cfg_if_'):
            # Handle uplink interface selection for VLAN config
            interface = callback_data.replace('uplink_cfg_if_', '')
            
            # Store interface in context for next step
            context.user_data['uplink_interface'] = interface
            
            # Get real VLAN list from OLT
            await query.edit_message_text("⏳ Fetching VLAN list from OLT...")
            
            try:
                client = await self.get_client(query.from_user.id)
                if not client:
                    keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_cfg')]]
                    await query.edit_message_text(
                        "❌ Cannot connect to OLT",
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                    return
                
                from scripts.olt_config_manager import OLTConfigManager
                config_mgr = OLTConfigManager(client)
                
                # Get VLAN summary and parse VLAN IDs
                vlan_output = config_mgr.show_vlans()
                
                # Parse VLAN IDs from output
                vlan_ids = []
                for line in vlan_output.split('\n'):
                    # Look for VLAN ID patterns (typically "VLAN <id>" or just numbers)
                    import re
                    matches = re.findall(r'\b(\d{1,4})\b', line)
                    for match in matches:
                        vid = int(match)
                        if 1 <= vid <= 4094 and vid not in vlan_ids:
                            vlan_ids.append(vid)
                
                # Sort and take first 12 VLANs
                vlan_ids.sort()
                vlan_ids = vlan_ids[:12] if len(vlan_ids) > 12 else vlan_ids
                
                # Build keyboard with real VLANs
                keyboard = []
                if vlan_ids:
                    # Create rows of 3 buttons each
                    for i in range(0, len(vlan_ids), 3):
                        row = []
                        for vid in vlan_ids[i:i+3]:
                            row.append(InlineKeyboardButton(
                                str(vid),
                                callback_data=f'uplink_vlan_{vid}'
                            ))
                        keyboard.append(row)
                    
                    vlan_info = f"Available VLANs from OLT (showing {len(vlan_ids)})"
                else:
                    # Fallback to common VLANs if parsing failed
                    keyboard = [
                        [InlineKeyboardButton("100", callback_data='uplink_vlan_100'),
                         InlineKeyboardButton("200", callback_data='uplink_vlan_200'),
                         InlineKeyboardButton("300", callback_data='uplink_vlan_300')],
                        [InlineKeyboardButton("500", callback_data='uplink_vlan_500'),
                         InlineKeyboardButton("1000", callback_data='uplink_vlan_1000'),
                         InlineKeyboardButton("2000", callback_data='uplink_vlan_2000')]
                    ]
                    vlan_info = "Common VLANs (no VLANs found in OLT)"
                
                keyboard.append([InlineKeyboardButton("🔢 Custom VLAN ID (use CLI)", callback_data='uplink_vlan_custom')])
                keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_cfg')])
                
                # Escape special characters for Telegram Markdown
                safe_interface = interface.replace('_', '\\_')
                
                await query.edit_message_text(
                    f"⚙️ *Configure VLAN: {safe_interface}*\n\n"
                    f"Select VLAN ID:\n"
                    f"{vlan_info}\n\n"
                    f"💡 For custom VLAN ID not listed, select 'Custom'.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
            except Exception as e:
                logger.error(f"Error fetching VLANs: {e}")
                # Fallback to common VLANs
                keyboard = [
                    [InlineKeyboardButton("100", callback_data='uplink_vlan_100'),
                     InlineKeyboardButton("200", callback_data='uplink_vlan_200'),
                     InlineKeyboardButton("300", callback_data='uplink_vlan_300')],
                    [InlineKeyboardButton("500", callback_data='uplink_vlan_500'),
                     InlineKeyboardButton("1000", callback_data='uplink_vlan_1000'),
                     InlineKeyboardButton("2000", callback_data='uplink_vlan_2000')],
                    [InlineKeyboardButton("🔢 Custom VLAN ID (use CLI)", callback_data='uplink_vlan_custom')],
                    [InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_cfg')]
                ]
                
                # Escape special characters for Telegram Markdown
                safe_interface = interface.replace('_', '\\_')
                
                await query.edit_message_text(
                    f"⚙️ *Configure VLAN: {safe_interface}*\n\n"
                    f"Select VLAN ID:\n"
                    f"Common VLANs (Error fetching from OLT)\n\n"
                    f"💡 For custom VLAN ID, select 'Custom'.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
        elif callback_data.startswith('uplink_vlan_'):
            # Handle VLAN ID selection
            if callback_data == 'uplink_vlan_custom':
                interface = context.user_data.get('uplink_interface', 'N/A')
                safe_interface = interface.replace('_', '\\_')
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'uplink_cfg_if_{interface}')]]
                await query.edit_message_text(
                    f"⚙️ *Custom VLAN ID*\n\n"
                    f"📝 Please use CLI to enter custom VLAN ID:\n\n"
                    f"Interface: `{safe_interface}`\n"
                    f"Enter any VLAN ID (1-4094)",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            else:
                vlan_id = callback_data.replace('uplink_vlan_', '')
                context.user_data['uplink_vlan'] = vlan_id
                interface = context.user_data.get('uplink_interface', 'N/A')
                safe_interface = interface.replace('_', '\\_')
                
                # Show mode selection (Trunk/Access)
                keyboard = [
                    [InlineKeyboardButton("🏷️ Trunk (Tagged)", callback_data='uplink_mode_trunk')],
                    [InlineKeyboardButton("🔖 Access (Untagged)", callback_data='uplink_mode_access')],
                    [InlineKeyboardButton("🔙 Back", callback_data=f'uplink_cfg_if_{interface}')]
                ]
                
                await query.edit_message_text(
                    f"⚙️ *Configure VLAN*\n\n"
                    f"Interface: `{safe_interface}`\n"
                    f"VLAN ID: `{vlan_id}`\n\n"
                    f"Select VLAN mode:\n"
                    f"• *Trunk* = Tagged VLAN (for multiple VLANs)\n"
                    f"• *Access* = Untagged VLAN (single VLAN)",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
        elif callback_data.startswith('uplink_mode_'):
            # Execute VLAN configuration
            mode = callback_data.replace('uplink_mode_', '')
            interface = context.user_data.get('uplink_interface')
            vlan_id = context.user_data.get('uplink_vlan')
            
            if not interface or not vlan_id:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_cfg')]]
                await query.edit_message_text(
                    "❌ Error: Missing interface or VLAN ID\n\n"
                    "Please start over.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            try:
                await query.edit_message_text(f"⏳ Configuring VLAN {vlan_id} on {interface}...")
                
                client = await self.get_client(query.from_user.id)
                if not client:
                    keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                    await query.edit_message_text(
                        "❌ Cannot connect to OLT",
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                    return
                
                from scripts.olt_config_manager import OLTConfigManager
                config_mgr = OLTConfigManager(client)
                
                # Execute configuration
                success, message = config_mgr.configure_uplink_vlan(
                    interface, int(vlan_id), mode
                )
                
                keyboard = [
                    [InlineKeyboardButton("✅ Configure Another", callback_data='uplink_vlan_cfg')],
                    [InlineKeyboardButton("🔙 Back to Uplink Menu", callback_data='uplink_menu')]
                ]
                
                safe_interface = interface.replace('_', '\\_')
                safe_message = message.replace('_', '\\_').replace('*', '\\*')
                status = "✅" if success else "❌"
                await query.edit_message_text(
                    f"{status} *VLAN Configuration*\n\n"
                    f"Interface: `{safe_interface}`\n"
                    f"VLAN ID: `{vlan_id}`\n"
                    f"Mode: `{mode}`\n\n"
                    f"Result: {safe_message}",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
                # Clear context
                context.user_data.pop('uplink_interface', None)
                context.user_data.pop('uplink_vlan', None)
                
            except Exception as e:
                logger.error(f"Error configuring uplink VLAN: {e}")
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    f"❌ Error: {str(e)}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
        elif callback_data.startswith('prof_'):
            await query.message.reply_text("⚠️ Profile management - Use CLI for profile config")
        elif callback_data.startswith('vlan_'):
            await query.message.reply_text("⚠️ VLAN management - Use CLI for VLAN config")
        elif callback_data.startswith('uplink_'):
            await query.message.reply_text("⚠️ Uplink management - Use CLI for uplink config")
        elif callback_data.startswith('sys_'):
            await query.message.reply_text("⚠️ System config - Use CLI for system settings")
    
    async def switch_olt_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show OLT profile management menu"""
        query = update.callback_query
        
        try:
            profiles = self.profile_manager.list_profiles()
            active = self.profile_manager.get_active_profile()
            
            text = "⚙️ *OLT Profile Management*\n\n"
            text += f"📍 Current Active: *{active.name if active else 'None'}*\n"
            if active:
                text += f"   Host: {active.host}:{active.port}\n"
                text += f"   User: {active.username}\n"
            text += "\n"
            
            if profiles:
                text += "📋 *Available Profiles:*\n\n"
                for p in profiles:
                    status = "✅" if active and p.name == active.name else "⚪"
                    text += f"{status} *{p.name}*\n"
                    text += f"   └─ {p.host}:{p.port}\n"
                text += "\n"
            else:
                text += "📋 No OLT profiles configured\n\n"
            
            # Build keyboard with management options
            keyboard = []
            
            # Switch profile section (only if there are profiles)
            if profiles:
                keyboard.append([InlineKeyboardButton("🔄 Switch Active OLT", callback_data='olt_mgmt_switch')])
            
            # Management buttons
            keyboard.append([InlineKeyboardButton("➕ Add New OLT", callback_data='olt_mgmt_add')])
            
            if profiles:
                keyboard.append([
                    InlineKeyboardButton("✏️ Edit OLT", callback_data='olt_mgmt_edit'),
                    InlineKeyboardButton("🗑️ Delete OLT", callback_data='olt_mgmt_delete')
                ])
            
            # Add back button
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='back_menu')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in switch_olt_menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def do_switch_olt(self, update: Update, context: ContextTypes.DEFAULT_TYPE, profile_name: str):
        """Switch to different OLT profile"""
        query = update.callback_query
        user_id = query.from_user.id
        
        try:
            await query.edit_message_text(f"🔄 Switching to profile: {profile_name}...")
            
            # Close existing connection
            if user_id in self.active_connections:
                try:
                    self.active_connections[user_id].disconnect()
                except:
                    pass
                del self.active_connections[user_id]
            
            # Switch profile
            if self.profile_manager.set_active_profile(profile_name):
                active = self.profile_manager.get_active_profile()
                
                # Test connection
                try:
                    from config.olt_config import OLTConfig
                    config = OLTConfig(
                        host=active.host,
                        port=active.port,
                        username=active.username,
                        password=active.password,
                        timeout=active.timeout,
                        enable_password=active.enable_password
                    )
                    
                    client = TelnetClient(config)
                    
                    if client.connect():
                        self.active_connections[user_id] = client
                        
                        await query.edit_message_text(
                            f"✅ *Switched to: {profile_name}*\n\n"
                            f"📍 Host: {active.host}:{active.port}\n"
                            f"👤 User: {active.username}\n"
                            f"✅ Status: Connected\n\n"
                            f"Use /menu to continue",
                            parse_mode='Markdown'
                        )
                    else:
                        await query.edit_message_text(
                            f"⚠️ *Profile switched to: {profile_name}*\n\n"
                            f"📍 Host: {active.host}:{active.port}\n"
                            f"❌ Status: Failed to connect\n\n"
                            f"Check OLT connectivity and credentials.\n"
                            f"Use /menu to continue",
                            parse_mode='Markdown'
                        )
                except Exception as e:
                    await query.edit_message_text(
                        f"⚠️ *Profile switched to: {profile_name}*\n\n"
                        f"❌ Connection error: {str(e)}\n\n"
                        f"Use /menu to continue",
                        parse_mode='Markdown'
                    )
            else:
                await query.edit_message_text(
                    f"❌ Failed to switch to profile: {profile_name}\n\n"
                    f"Profile may not exist. Use /menu to check available profiles."
                )
        except Exception as e:
            logger.error(f"Error switching OLT profile: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    # ==================== OLT Profile Management Methods ====================
    
    async def olt_switch_select_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show list of OLT profiles to switch"""
        query = update.callback_query
        
        try:
            profiles = self.profile_manager.list_profiles()
            active = self.profile_manager.get_active_profile()
            
            if not profiles:
                await query.edit_message_text(
                    "❌ No OLT profiles configured\n\n"
                    "Add profiles first using ➕ Add New OLT",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='menu_0')
                    ]])
                )
                return
            
            text = "🔄 *Switch Active OLT*\n\n"
            text += f"📍 Current: *{active.name if active else 'None'}*\n\n"
            text += "Select profile to switch:\n\n"
            
            keyboard = []
            for p in profiles:
                status = "✅" if active and p.name == active.name else "⚪"
                button_text = f"{status} {p.name}"
                keyboard.append([InlineKeyboardButton(button_text, callback_data=f"switch_{p.name}")])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='menu_0')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in olt_switch_select_menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def olt_add_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start conversation for adding new OLT profile"""
        query = update.callback_query
        
        await query.edit_message_text(
            "➕ *Add New OLT Profile*\n\n"
            "Let's create a new OLT profile!\n\n"
            "Please enter the *Profile Name*:\n"
            "Example: OLT_Main, OLT_Backup, etc.\n\n"
            "Use /cancel to abort",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_NAME
    
    async def olt_add_name(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT profile name"""
        name = update.message.text.strip()
        
        if self.profile_manager.get_profile(name):
            await update.message.reply_text(
                f"❌ Profile '{name}' already exists!\n\n"
                "Please enter a different name or /cancel"
            )
            return OLT_MGMT_ADD_NAME
        
        context.user_data['new_olt_name'] = name
        
        await update.message.reply_text(
            f"✅ Profile Name: *{name}*\n\n"
            f"Now enter the *OLT Host/IP*:\n"
            f"Example: 192.168.1.1 or olt.example.com",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_HOST
    
    async def olt_add_host(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT host/IP"""
        host = update.message.text.strip()
        context.user_data['new_olt_host'] = host
        
        await update.message.reply_text(
            f"✅ Host: *{host}*\n\n"
            f"Enter *Telnet Port*:\n"
            f"(Press Enter or type '23' for default)",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_PORT
    
    async def olt_add_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT port"""
        port_str = update.message.text.strip()
        
        try:
            port = int(port_str) if port_str else 23
            if port < 1 or port > 65535:
                raise ValueError()
        except ValueError:
            await update.message.reply_text(
                "❌ Invalid port number!\n\n"
                "Please enter a port between 1-65535:"
            )
            return OLT_MGMT_ADD_PORT
        
        context.user_data['new_olt_port'] = port
        
        await update.message.reply_text(
            f"✅ Port: *{port}*\n\n"
            f"Enter *Username*:",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_USERNAME
    
    async def olt_add_username(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT username"""
        username = update.message.text.strip()
        context.user_data['new_olt_username'] = username
        
        await update.message.reply_text(
            f"✅ Username: *{username}*\n\n"
            f"Enter *Password*:",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_PASSWORD
    
    async def olt_add_password(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT password"""
        password = update.message.text.strip()
        context.user_data['new_olt_password'] = password
        
        await update.message.reply_text(
            "✅ Password: ******\n\n"
            "Enter *Enable Password* (optional):\n"
            "Type 'skip' or press /skip if not needed",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_EN_PWD
    
    async def olt_add_enable_pwd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive OLT enable password"""
        en_pwd = update.message.text.strip()
        
        if en_pwd.lower() == 'skip':
            en_pwd = None
        
        context.user_data['new_olt_enable_pwd'] = en_pwd
        
        await update.message.reply_text(
            "✅ Enable Password: " + ("******" if en_pwd else "None") + "\n\n"
            "Enter *Description* (optional):\n"
            "Type 'skip' or press /skip if not needed",
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_ADD_DESC
    
    async def olt_add_description(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive description and save profile"""
        desc = update.message.text.strip()
        
        if desc.lower() == 'skip':
            desc = None
        
        # Get all data
        from config.olt_profile_manager import OLTProfile
        
        profile = OLTProfile(
            name=context.user_data['new_olt_name'],
            host=context.user_data['new_olt_host'],
            port=context.user_data['new_olt_port'],
            username=context.user_data['new_olt_username'],
            password=context.user_data['new_olt_password'],
            enable_password=context.user_data.get('new_olt_enable_pwd'),
            description=desc
        )
        
        # Save profile
        if self.profile_manager.add_profile(profile):
            await update.message.reply_text(
                f"✅ *Profile Added Successfully!*\n\n"
                f"📋 Name: *{profile.name}*\n"
                f"📍 Host: {profile.host}:{profile.port}\n"
                f"👤 User: {profile.username}\n"
                f"📝 Desc: {profile.description or 'None'}\n\n"
                f"Use /menu to continue",
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                "❌ Failed to save profile!\n\n"
                "Use /menu to try again"
            )
        
        # Clean up
        for key in ['new_olt_name', 'new_olt_host', 'new_olt_port', 
                    'new_olt_username', 'new_olt_password', 'new_olt_enable_pwd']:
            context.user_data.pop(key, None)
        
        return ConversationHandler.END
    
    async def olt_edit_select_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show list of OLT profiles to edit"""
        query = update.callback_query
        
        try:
            profiles = self.profile_manager.list_profiles()
            
            if not profiles:
                await query.edit_message_text(
                    "❌ No OLT profiles to edit\n\n"
                    "Add profiles first using ➕ Add New OLT",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='menu_0')
                    ]])
                )
                return
            
            text = "✏️ *Edit OLT Profile*\n\n"
            text += "Select profile to edit:\n\n"
            
            keyboard = []
            for p in profiles:
                keyboard.append([
                    InlineKeyboardButton(
                        f"{p.name} ({p.host})",
                        callback_data=f"olt_edit_{p.name}"
                    )
                ])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='menu_0')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in olt_edit_select_menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def olt_edit_field_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE, profile_name: str):
        """Show fields to edit for selected profile"""
        query = update.callback_query
        
        try:
            profile = self.profile_manager.get_profile(profile_name)
            
            if not profile:
                await query.edit_message_text(
                    f"❌ Profile '{profile_name}' not found!",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='olt_mgmt_edit')
                    ]])
                )
                return
            
            context.user_data['edit_profile_name'] = profile_name
            
            text = f"✏️ *Edit Profile: {profile_name}*\n\n"
            text += f"📍 Host: {profile.host}\n"
            text += f"🔌 Port: {profile.port}\n"
            text += f"👤 User: {profile.username}\n"
            text += f"🔒 Pass: ******\n"
            text += f"🔑 Enable: {'******' if profile.enable_password else 'None'}\n"
            text += f"📝 Desc: {profile.description or 'None'}\n\n"
            text += "Select field to edit:"
            
            keyboard = [
                [InlineKeyboardButton("📍 Host/IP", callback_data='olt_editfield_host')],
                [InlineKeyboardButton("🔌 Port", callback_data='olt_editfield_port')],
                [InlineKeyboardButton("👤 Username", callback_data='olt_editfield_username')],
                [InlineKeyboardButton("🔒 Password", callback_data='olt_editfield_password')],
                [InlineKeyboardButton("🔑 Enable Password", callback_data='olt_editfield_enable_pwd')],
                [InlineKeyboardButton("📝 Description", callback_data='olt_editfield_description')],
                [InlineKeyboardButton("🔙 Back", callback_data='olt_mgmt_edit')]
            ]
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in olt_edit_field_menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def olt_edit_field_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle field selection for editing"""
        query = update.callback_query
        field = query.data.replace('olt_editfield_', '')
        
        profile_name = context.user_data.get('edit_profile_name')
        
        if not profile_name:
            await query.edit_message_text(
                "❌ Session expired\n\nUse /menu to start again"
            )
            return ConversationHandler.END
        
        context.user_data['edit_field'] = field
        
        field_names = {
            'host': 'Host/IP',
            'port': 'Port',
            'username': 'Username',
            'password': 'Password',
            'enable_pwd': 'Enable Password',
            'description': 'Description'
        }
        
        # Create keyboard with Back button
        keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'olt_edit_{profile_name}')]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            f"✏️ *Edit {field_names.get(field, field)}*\n\n"
            f"Enter new value:\n\n"
            f"💡 Tip: You can also tap 🔙 Back to cancel",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        
        return OLT_MGMT_EDIT_VALUE
    
    async def olt_edit_back_to_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle back button from edit value input"""
        query = update.callback_query
        profile_name = query.data.replace('olt_edit_', '')
        
        # Clear edit field
        context.user_data.pop('edit_field', None)
        
        # Return to field selection menu
        await self.olt_edit_field_menu(update, context, profile_name)
        
        return ConversationHandler.END
    
    async def olt_edit_value(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Receive new value and update profile"""
        new_value = update.message.text.strip()
        
        if new_value.lower() == 'cancel':
            await update.message.reply_text(
                "❌ Edit cancelled\n\nUse /menu to continue"
            )
            return ConversationHandler.END
        
        profile_name = context.user_data.get('edit_profile_name')
        field = context.user_data.get('edit_field')
        
        if not profile_name or not field:
            await update.message.reply_text(
                "❌ Session expired\n\nUse /menu to start again"
            )
            return ConversationHandler.END
        
        profile = self.profile_manager.get_profile(profile_name)
        
        if not profile:
            await update.message.reply_text(
                f"❌ Profile '{profile_name}' not found!"
            )
            return ConversationHandler.END
        
        # Update field from config.olt_profile_manager import OLTProfile
        
        # Create updated profile
        updated_data = {
            'name': profile.name,
            'host': profile.host,
            'port': profile.port,
            'username': profile.username,
            'password': profile.password,
            'enable_password': profile.enable_password,
            'description': profile.description
        }
        
        if field == 'host':
            updated_data['host'] = new_value
        elif field == 'port':
            try:
                port = int(new_value)
                if port < 1 or port > 65535:
                    raise ValueError()
                updated_data['port'] = port
            except ValueError:
                await update.message.reply_text(
                    "❌ Invalid port number!\n\nUse /menu to try again"
                )
                return ConversationHandler.END
        elif field == 'username':
            updated_data['username'] = new_value
        elif field == 'password':
            updated_data['password'] = new_value
        elif field == 'enable_pwd':
            updated_data['enable_password'] = new_value if new_value.lower() != 'none' else None
        elif field == 'description':
            updated_data['description'] = new_value if new_value.lower() != 'none' else None
        
        from config.olt_profile_manager import OLTProfile
        updated_profile = OLTProfile(**updated_data)
        
        if self.profile_manager.update_profile(profile_name, updated_profile):
            await update.message.reply_text(
                f"✅ *Profile Updated!*\n\n"
                f"📋 Profile: {profile_name}\n"
                f"Field updated: {field}\n\n"
                f"Use /menu to continue",
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                "❌ Failed to update profile!\n\nUse /menu to try again"
            )
        
        # Clean up
        context.user_data.pop('edit_profile_name', None)
        context.user_data.pop('edit_field', None)
        
        return ConversationHandler.END
    
    async def olt_delete_select_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show list of OLT profiles to delete"""
        query = update.callback_query
        
        try:
            profiles = self.profile_manager.list_profiles()
            active = self.profile_manager.get_active_profile()
            
            if not profiles:
                await query.edit_message_text(
                    "❌ No OLT profiles to delete",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='menu_0')
                    ]])
                )
                return
            
            text = "🗑️ *Delete OLT Profile*\n\n"
            text += "⚠️ WARNING: This action cannot be undone!\n\n"
            
            if active:
                text += f"📍 Active Profile: *{active.name}* (cannot be deleted)\n\n"
            
            text += "Select profile to delete:\n\n"
            
            keyboard = []
            for p in profiles:
                if active and p.name == active.name:
                    continue  # Skip active profile
                
                keyboard.append([
                    InlineKeyboardButton(
                        f"🗑️ {p.name} ({p.host})",
                        callback_data=f"olt_delete_{p.name}"
                    )
                ])
            
            if not keyboard:
                text += "❌ No profiles available to delete\n"
                text += "(Active profile cannot be deleted)"
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='menu_0')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in olt_delete_select_menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def olt_delete_confirm(self, update: Update, context: ContextTypes.DEFAULT_TYPE, profile_name: str):
        """Confirm deletion of OLT profile"""
        query = update.callback_query
        
        try:
            profile = self.profile_manager.get_profile(profile_name)
            active = self.profile_manager.get_active_profile()
            
            if not profile:
                await query.edit_message_text(
                    f"❌ Profile '{profile_name}' not found!",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='olt_mgmt_delete')
                    ]])
                )
                return
            
            if active and profile.name == active.name:
                await query.edit_message_text(
                    f"❌ Cannot delete active profile!\n\n"
                    f"Switch to another profile first.",
                    reply_markup=InlineKeyboardMarkup([[
                        InlineKeyboardButton("🔙 Back", callback_data='olt_mgmt_delete')
                    ]])
                )
                return
            
            context.user_data['delete_profile_name'] = profile_name
            
            text = f"⚠️ *Confirm Deletion*\n\n"
            text += f"Are you sure you want to delete:\n\n"
            text += f"📋 Name: *{profile.name}*\n"
            text += f"📍 Host: {profile.host}:{profile.port}\n"
            text += f"📝 Desc: {profile.description or 'None'}\n\n"
            text += "⚠️ This action CANNOT be undone!"
            
            keyboard = [
                [
                    InlineKeyboardButton("✅ Yes, Delete", callback_data='olt_delete_yes'),
                    InlineKeyboardButton("❌ No, Cancel", callback_data='olt_delete_no')
                ]
            ]
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(text, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Error in olt_delete_confirm: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def olt_delete_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute deletion of OLT profile"""
        query = update.callback_query
        
        profile_name = context.user_data.get('delete_profile_name')
        
        if not profile_name:
            await query.edit_message_text(
                "❌ Session expired\n\nUse /menu to start again"
            )
            return
        
        if self.profile_manager.delete_profile(profile_name):
            await query.edit_message_text(
                f"✅ *Profile Deleted!*\n\n"
                f"Profile '{profile_name}' has been removed.\n\n"
                f"Use /menu to continue",
                parse_mode='Markdown'
            )
        else:
            await query.edit_message_text(
                f"❌ Failed to delete profile '{profile_name}'!\n\n"
                f"Use /menu to try again"
            )
        
        context.user_data.pop('delete_profile_name', None)
    
    # ==================== End of OLT Profile Management ====================
    
    async def onu_register_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU registration wizard menu - sama seperti CLI"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📡 ONU Belum Terdaftar", callback_data='reg_uncfg_list')],
            [InlineKeyboardButton("📋 ONU Sudah Terdaftar", callback_data='reg_working_list')],
            [InlineKeyboardButton("✏️ Edit Nama/Deskripsi", callback_data='reg_edit_name')],
            [InlineKeyboardButton("⚙️ Konfigurasi Service", callback_data='reg_config_service')],
            [InlineKeyboardButton("🔧 Management Profile", callback_data='reg_manage_profile')],
            [InlineKeyboardButton("💾 Simpan Konfigurasi", callback_data='reg_save')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "🎯 *ONU REGISTRATION WIZARD*\n\n"
            "Menu lengkap untuk registrasi ONU:\n\n"
            "📡 *ONU Belum Terdaftar* - Lihat & register unconfigured\n"
            "📋 *ONU Sudah Terdaftar* - Lihat ONU working\n"
            "✏️ *Edit Nama/Deskripsi* - Update info ONU\n"
            "⚙️ *Konfigurasi Service* - Setup PPPOE/Bridge/Static\n"
            "🔧 *Management Profile* - Kelola TCONT/Traffic/VLAN\n"
            "💾 *Simpan Konfigurasi* - Save ke OLT\n\n"
            "ℹ️ Wizard lengkap sama seperti CLI!\n\n"
            "📝 Complex registration dilakukan via CLI.\n"
            "Bot menampilkan data untuk monitoring."
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def onu_config_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU configuration menu - sama dengan CLI (12 options)"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("1️⃣ Show ONU List", callback_data='cfg_show_list')],
            [InlineKeyboardButton("2️⃣ Show ONU Detail", callback_data='remote_details')],
            [InlineKeyboardButton("3️⃣ Configure PPPOE", callback_data='cfg_pppoe')],
            [InlineKeyboardButton("4️⃣ Configure Bridge", callback_data='cfg_bridge')],
            [InlineKeyboardButton("5️⃣ Configure Static IP", callback_data='cfg_static')],
            [InlineKeyboardButton("6️⃣ Restart ONU", callback_data='remote_restart')],
            [InlineKeyboardButton("7️⃣ Security Management", callback_data='cfg_security')],
            [InlineKeyboardButton("8️⃣ Configure TR069", callback_data='cfg_tr069')],
            [InlineKeyboardButton("9️⃣ Remote Web Management", callback_data='cfg_web_mgmt')],
            [InlineKeyboardButton("🔟 Fiberhome VEIP Config", callback_data='cfg_fiberhome')],
            [InlineKeyboardButton("1️⃣1️⃣ ZTE Full (Dual SSID)", callback_data='cfg_zte_full')],
            [InlineKeyboardButton("1️⃣2️⃣ Huawei Full (Multi VLAN)", callback_data='cfg_huawei_full')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "⚙️ *ONU Configuration Menu*\n\n"
            "Sama dengan CLI - 12 Options:\n\n"
            "1️⃣ Show ONU List\n"
            "2️⃣ Show ONU Detail\n"
            "3️⃣ Configure ONU PPPOE\n"
            "4️⃣ Configure ONU Bridge\n"
            "5️⃣ Configure ONU Static IP\n"
            "6️⃣ Restart ONU\n"
            "7️⃣ Configure Security Management\n"
            "8️⃣ Configure TR069\n"
            "9️⃣ Enable Remote Web Management\n"
            "🔟 Configure Fiberhome VEIP\n"
            "1️⃣1️⃣ Configure ZTE Full (Dual SSID, Dual VLAN)\n"
            "1️⃣2️⃣ Configure Huawei Full (Multi VLAN)\n\n"
            "💡 Select ONU from list → configure\n\n"
            "📝 CLI: Menu → ONU Management → ONU Config"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def onu_omci_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU OMCI configuration menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔌 Set LAN Port Binding", callback_data='omci_lan')],
            [InlineKeyboardButton("📡 Set WLAN (WiFi) Binding", callback_data='omci_wlan')],
            [InlineKeyboardButton("📋 Show ONU Running Config", callback_data='omci_show')],
            [InlineKeyboardButton("🔍 Show VLAN OMCI Config", callback_data='omci_vlan')],
            [InlineKeyboardButton("🔄 Auto-Provision Management", callback_data='omci_auto')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "📡 *ONU OMCI Configuration*\n\n"
            "ZTE OMCI Features (untuk ONU ZTE yang support OMCI):\n\n"
            "1️⃣ Set LAN Port Binding (with ONU list)\n"
            "2️⃣ Set WLAN (WiFi) Binding (with ONU list)\n"
            "3️⃣ Show ONU Running Config\n"
            "4️⃣ Show VLAN OMCI Configuration\n"
            "5️⃣ Auto-Provision Management (Discovery & Register)\n\n"
            "ℹ️ Supported: ZTE ONU with OMCI\n\n"
            "📝 Best via CLI for complex configuration"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_working_onu_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show list of all working/registered ONUs - CLI Menu Option 1"""
        query = update.callback_query
        await query.answer()
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Build ONU list display (similar to CLI table format)
            result_text = f"📋 *Show ONU List*\\n\\n"
            result_text += f"```\\n"
            result_text += f"{'No':<4} {'PON Port':<15} {'ONU ID':<8} {'Description':<30}\\n"
            result_text += f"{'='*58}\\n"
            
            for idx, onu in enumerate(working_onus, 1):
                pon_port_display = onu.get('pon_port', '').replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id = onu.get('onu_id', '-')
                name = onu.get('name', 'N/A')[:28]  # Truncate long names
                result_text += f"{idx:<4} {pon_port_display:<15} {onu_id:<8} {name:<30}\\n"
            
            result_text += f"{'='*58}\\n"
            result_text += f"Total: {len(working_onus)} ONU\\n"
            result_text += f"```\\n\\n"
            result_text += f"💡 Select option 2 (Show ONU Detail) to view specific ONU info"
            
            keyboard = [[InlineKeyboardButton("🔙 Back to ONU Config Menu", callback_data='menu_4')]]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in show_working_onu_list: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_4')]]
            await query.edit_message_text(
                f"❌ Error fetching ONU list: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def onu_delete_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU delete options menu - sama dengan CLI"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("1️⃣ Clear ONU Configuration", callback_data='del_config')],
            [InlineKeyboardButton("2️⃣ Unregister ONU", callback_data='del_unreg')],
            [InlineKeyboardButton("3️⃣ Clear Config + Unregister", callback_data='del_complete')],
            [InlineKeyboardButton("4️⃣ Show Registered ONU List", callback_data='onu_list')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "❌ *Delete ONU & Unregister*\n\n"
            "⚠️ *WARNING:* Operasi ini akan menghapus konfigurasi/registrasi ONU\n\n"
            "1️⃣ Clear ONU Configuration\n"
            "   → Hapus config, ONU tetap terdaftar\n\n"
            "2️⃣ Unregister ONU\n"
            "   → Hapus dari OLT, config otomatis terhapus\n\n"
            "3️⃣ Clear Config + Unregister\n"
            "   → Auto Sync (Recommended)\n\n"
            "4️⃣ Show Registered ONU List\n\n"
            "📝 Use CLI: Menu → ONU Management → Delete ONU"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    # ==================== DELETE ONU HANDLERS ====================
    
    async def delete_clear_config_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for Clear Configuration operation"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching registered ONUs...")
        
        try:
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ Failed to connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Fetch working ONUs
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ No registered ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Store in context
            context.user_data['working_onus_delcfg'] = working_onus
            
            # Build message
            message = "🗑️ *Clear ONU Configuration*\n\n"
            message += "⚠️ *Operation:* Delete service config only\n"
            message += "📌 *ONU Status:* Remains registered\n"
            message += "💾 *Name/Description:* Preserved\n\n"
            message += f"Found {len(working_onus)} registered ONU(s):\n\n"
            
            # Build keyboard
            keyboard = []
            for i, onu in enumerate(working_onus, 1):
                pon_port = onu.get('pon_port', '?').replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = onu.get('onu_id', '?')
                onu_type = onu.get('type', 'N/A')[:20]
                name = onu.get('name', 'Unnamed')[:20]
                
                btn_text = f"{i}. {pon_port}:{onu_id} - {name}"
                keyboard.append([InlineKeyboardButton(btn_text, callback_data=f'delcfg_onu_{i-1}')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_delete')])
            
            await query.edit_message_text(
                message,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in delete_clear_config_menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_clear_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute clear configuration on selected ONU"""
        query = update.callback_query
        await query.answer()
        
        try:
            # Get selected ONU
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('working_onus_delcfg', [])
            
            if not working_onus or onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
            onu_id = str(selected_onu.get('onu_id', ''))
            name = selected_onu.get('name', 'Unnamed')
            onu_type = selected_onu.get('type', 'N/A')
            
            onu_id_full = f"{pon_port}:{onu_id}"
            
            # Show confirmation
            confirm_msg = f"🗑️ *Clear Configuration*\n\n"
            confirm_msg += f"📍 ONU: `{onu_id_full}`\n"
            confirm_msg += f"📝 Name: {name}\n"
            confirm_msg += f"🔧 Type: {onu_type}\n\n"
            confirm_msg += "⚠️ This will delete:\n"
            confirm_msg += "• WAN IP configuration (1-4)\n"
            confirm_msg += "• VLAN port binding\n"
            confirm_msg += "• Service configs\n"
            confirm_msg += "• Service-port (1-8)\n"
            confirm_msg += "• Gemport (1-8)\n"
            confirm_msg += "• TCONT (1-8)\n\n"
            confirm_msg += "✅ ONU registration will be preserved\n"
            confirm_msg += "✅ Name/Description will be kept\n\n"
            confirm_msg += "⏳ Executing..."
            
            await query.edit_message_text(confirm_msg, parse_mode='Markdown')
            
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                await query.edit_message_text("❌ Failed to connect to OLT")
                return
            
            # Execute clear config
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            success, msg = onu_mgr.delete_service_config(onu_id_full)
            
            # Show result
            if success:
                result_msg = "✅ *Configuration Cleared Successfully*\n\n"
                result_msg += f"📍 ONU: `{onu_id_full}`\n"
                result_msg += f"📝 Name: {name}\n\n"
                result_msg += "🗑️ All service configurations deleted\n"
                result_msg += "✅ ONU remains registered\n"
                result_msg += "✅ Name/Description preserved"
            else:
                result_msg = f"❌ *Clear Configuration Failed*\n\n"
                result_msg += f"📍 ONU: `{onu_id_full}`\n"
                result_msg += f"📝 Name: {name}\n\n"
                result_msg += f"Error: {msg}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to List", callback_data='del_config')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_msg,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in execute_clear_config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='del_config')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def delete_unregister_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for Unregister operation"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching registered ONUs...")
        
        try:
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ Failed to connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Fetch working ONUs
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ No registered ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Store in context
            context.user_data['working_onus_delunreg'] = working_onus
            
            # Build message
            message = "⚠️ *Unregister ONU*\n\n"
            message += "⚠️ *Operation:* Remove ONU from OLT\n"
            message += "🗑️ *Config:* Automatically deleted\n"
            message += "📉 *Status:* ONU becomes unconfigured\n\n"
            message += f"Found {len(working_onus)} registered ONU(s):\n\n"
            
            # Build keyboard
            keyboard = []
            for i, onu in enumerate(working_onus, 1):
                pon_port = onu.get('pon_port', '?').replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = onu.get('onu_id', '?')
                name = onu.get('name', 'Unnamed')[:20]
                
                btn_text = f"{i}. {pon_port}:{onu_id} - {name}"
                keyboard.append([InlineKeyboardButton(btn_text, callback_data=f'delunreg_onu_{i-1}')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_delete')])
            
            await query.edit_message_text(
                message,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in delete_unregister_menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_unregister(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute unregister on selected ONU"""
        query = update.callback_query
        await query.answer()
        
        try:
            # Get selected ONU
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('working_onus_delunreg', [])
            
            if not working_onus or onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
            onu_id = str(selected_onu.get('onu_id', ''))
            name = selected_onu.get('name', 'Unnamed')
            onu_type = selected_onu.get('type', 'N/A')
            
            onu_id_full = f"{pon_port}:{onu_id}"
            
            # Show confirmation
            confirm_msg = f"⚠️ *Unregister ONU*\n\n"
            confirm_msg += f"📍 ONU: `{onu_id_full}`\n"
            confirm_msg += f"📝 Name: {name}\n"
            confirm_msg += f"🔧 Type: {onu_type}\n\n"
            confirm_msg += "⚠️ *WARNING:*\n"
            confirm_msg += "• ONU will be removed from OLT\n"
            confirm_msg += "• All configuration will be deleted\n"
            confirm_msg += "• ONU status → unconfigured\n"
            confirm_msg += "• Service will be interrupted\n\n"
            confirm_msg += "⏳ Executing..."
            
            await query.edit_message_text(confirm_msg, parse_mode='Markdown')
            
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                await query.edit_message_text("❌ Failed to connect to OLT")
                return
            
            # Execute unregister
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            success, msg = onu_mgr.delete_onu(onu_id, pon_port)
            
            # Show result
            if success:
                result_msg = "✅ *ONU Unregistered Successfully*\n\n"
                result_msg += f"📍 ONU: `{onu_id_full}`\n"
                result_msg += f"📝 Name: {name}\n\n"
                result_msg += "🗑️ ONU removed from OLT\n"
                result_msg += "✅ All configuration deleted\n"
                result_msg += "📉 ONU status: unconfigured"
            else:
                result_msg = f"❌ *Unregister Failed*\n\n"
                result_msg += f"📍 ONU: `{onu_id_full}`\n"
                result_msg += f"📝 Name: {name}\n\n"
                result_msg += f"Error: {msg}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to List", callback_data='del_unreg')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_msg,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in execute_unregister: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='del_unreg')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def delete_complete_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for Complete Delete operation (Clear + Unregister)"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching registered ONUs...")
        
        try:
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ Failed to connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Fetch working ONUs
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
                await query.edit_message_text(
                    "❌ No registered ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Store in context
            context.user_data['working_onus_delcomp'] = working_onus
            
            # Build message
            message = "🗑️ *Delete Complete (Auto Sync)*\n\n"
            message += "⭐ *Recommended Method*\n\n"
            message += "✓ *Step 1:* Clear service configuration\n"
            message += "✓ *Step 2:* Unregister ONU from OLT\n\n"
            message += "⚠️ *Result:* Complete removal from OLT\n\n"
            message += f"Found {len(working_onus)} registered ONU(s):\n\n"
            
            # Build keyboard
            keyboard = []
            for i, onu in enumerate(working_onus, 1):
                pon_port = onu.get('pon_port', '?').replace('gpon-olt_', '').replace('gpon_olt-', '')
                onu_id = onu.get('onu_id', '?')
                name = onu.get('name', 'Unnamed')[:20]
                
                btn_text = f"{i}. {pon_port}:{onu_id} - {name}"
                keyboard.append([InlineKeyboardButton(btn_text, callback_data=f'delcomp_onu_{i-1}')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_delete')])
            
            await query.edit_message_text(
                message,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in delete_complete_menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_delete')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_delete_complete(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute complete delete (clear config + unregister) on selected ONU"""
        query = update.callback_query
        await query.answer()
        
        try:
            # Get selected ONU
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('working_onus_delcomp', [])
            
            if not working_onus or onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt-', '')
            onu_id = str(selected_onu.get('onu_id', ''))
            name = selected_onu.get('name', 'Unnamed')
            onu_type = selected_onu.get('type', 'N/A')
            
            onu_id_full = f"{pon_port}:{onu_id}"
            
            # Show initial status
            status_msg = f"🗑️ *Delete Complete (Auto Sync)*\n\n"
            status_msg += f"📍 ONU: `{onu_id_full}`\n"
            status_msg += f"📝 Name: {name}\n"
            status_msg += f"🔧 Type: {onu_type}\n\n"
            status_msg += "⏳ *Step 1/2:* Clearing service configuration..."
            
            await query.edit_message_text(status_msg, parse_mode='Markdown')
            
            # Get OLT client connection
            client = await self.get_client(update.effective_user.id)
            if not client:
                await query.edit_message_text("❌ Failed to connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            # Step 1: Clear service config
            success1, msg1 = onu_mgr.delete_service_config(onu_id_full)
            
            # Update status for step 2
            status_msg = f"🗑️ *Delete Complete (Auto Sync)*\n\n"
            status_msg += f"📍 ONU: `{onu_id_full}`\n"
            status_msg += f"📝 Name: {name}\n"
            status_msg += f"🔧 Type: {onu_type}\n\n"
            
            if success1:
                status_msg += "✅ *Step 1/2:* Config cleared\n"
            else:
                status_msg += f"⚠️ *Step 1/2:* Config clear: {msg1}\n"
            
            status_msg += "⏳ *Step 2/2:* Unregistering ONU..."
            
            await query.edit_message_text(status_msg, parse_mode='Markdown')
            
            # Step 2: Unregister
            success2, msg2 = onu_mgr.delete_onu(onu_id, pon_port)
            
            # Show final result
            result_msg = f"🗑️ *Delete Complete Result*\n\n"
            result_msg += f"📍 ONU: `{onu_id_full}`\n"
            result_msg += f"📝 Name: {name}\n"
            result_msg += f"🔧 Type: {onu_type}\n\n"
            result_msg += "=" * 30 + "\n"
            
            if success1:
                result_msg += "✅ Step 1: Config cleared\n"
            else:
                result_msg += f"⚠️ Step 1: {msg1}\n"
            
            if success2:
                result_msg += "✅ Step 2: ONU unregistered\n"
            else:
                result_msg += f"❌ Step 2: {msg2}\n"
            
            result_msg += "=" * 30 + "\n\n"
            
            if success1 and success2:
                result_msg += "✅ *DELETE COMPLETE SUCCESSFUL*\n"
                result_msg += f"ONU {onu_id_full} has been removed from OLT"
            elif success2:
                result_msg += "⚠️ *PARTIALLY SUCCESSFUL*\n"
                result_msg += "ONU unregistered but config clear had issues"
            else:
                result_msg += "❌ *DELETE FAILED*\n"
                result_msg += "Please check connection and try again"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to List", callback_data='del_complete')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_msg,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in execute_delete_complete: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='del_complete')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ==================== END DELETE ONU HANDLERS ====================
    
    async def profile_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show profile management menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📊 TCONT Profile", callback_data='prof_tcont')],
            [InlineKeyboardButton("🚦 Traffic Profile", callback_data='prof_traffic')],
            [InlineKeyboardButton("📏 Line Profile", callback_data='prof_line')],
            [InlineKeyboardButton("⚙️ Service Profile", callback_data='prof_service')],
            [InlineKeyboardButton("� ONU Types", callback_data='prof_onutype')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📝 *Profile Management*\n\n"
            "Manage OLT profiles:\n"
            "• TCONT, Traffic, Line, Service Profiles\n"
            "• ONU Type Management",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    # TCONT Profile Menu
    async def tcont_profile_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show TCONT profile submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show TCONT Profiles", callback_data='prof_tcont_show')],
            [InlineKeyboardButton("➕ Add TCONT", callback_data='prof_tcont_add')],
            [InlineKeyboardButton("❌ Delete TCONT", callback_data='prof_tcont_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='profile_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📊 *TCONT Profile Management*\n\n"
            "T-CONT (Transmission Container) profiles:",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_tcont_profiles(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all TCONT profiles"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_tcont')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("📊 Fetching TCONT profiles...")
            
            result = config_mgr.show_tcont_profiles()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='prof_tcont_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='prof_tcont')]
            ]
            
            # Format response
            response = "📊 *TCONT Profiles*\n\n"
            response += f"```\n{result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing TCONT profiles: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_tcont')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # Traffic Profile Menu
    async def traffic_profile_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Traffic profile submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show Traffic Profiles", callback_data='prof_traffic_show')],
            [InlineKeyboardButton("➕ Add Traffic", callback_data='prof_traffic_add')],
            [InlineKeyboardButton("❌ Delete Traffic", callback_data='prof_traffic_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='profile_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🚦 *Traffic Profile Management*\n\n"
            "Bandwidth control profiles:",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_traffic_profiles(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all Traffic profiles"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_traffic')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("🚦 Fetching traffic profiles...")
            
            result = config_mgr.show_traffic_profiles()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='prof_traffic_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='prof_traffic')]
            ]
            
            response = "🚦 *Traffic Profiles*\n\n"
            response += f"```\n{result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing traffic profiles: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_traffic')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # Line Profile Menu
    async def line_profile_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Line profile submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show Line Profiles", callback_data='prof_line_show')],
            [InlineKeyboardButton("➕ Add Line", callback_data='prof_line_add')],
            [InlineKeyboardButton("❌ Delete Line", callback_data='prof_line_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='profile_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📏 *Line Profile Management*\n\n"
            "ONU line configuration profiles:",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_line_profiles(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all Line profiles"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_line')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("📏 Fetching line profiles...")
            
            result = config_mgr.show_line_profiles()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='prof_line_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='prof_line')]
            ]
            
            response = "📏 *Line Profiles*\n\n"
            response += f"```\n{result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing line profiles: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_line')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # Service Profile Menu
    async def service_profile_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Service profile submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show Service Profiles", callback_data='prof_service_show')],
            [InlineKeyboardButton("➕ Add Service", callback_data='prof_service_add')],
            [InlineKeyboardButton("❌ Delete Service", callback_data='prof_service_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='profile_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "⚙️ *Service Profile Management*\n\n"
            "ONU service configuration profiles:",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_service_profiles(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all Service profiles"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_service')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⚙️ Fetching service profiles...")
            
            result = config_mgr.show_service_profiles()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='prof_service_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='prof_service')]
            ]
            
            response = "⚙️ *Service Profiles*\n\n"
            response += f"```\n{result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing service profiles: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_service')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ONU Type Menu
    async def onutype_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU Type submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show ONU Types", callback_data='prof_onutype_show')],
            [InlineKeyboardButton("➕ Add ONU Type", callback_data='prof_onutype_add')],
            [InlineKeyboardButton("❌ Delete ONU Type", callback_data='prof_onutype_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='profile_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🔧 *ONU Type Management*\n\n"
            "Configure ONU types (Live Update):\n"
            "⚠️ Changes are immediately effective in running-config.\n"
            "Don't forget to save configuration!",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_onu_types(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all ONU Types"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_onutype')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("🔧 Fetching ONU types...")
            
            result = config_mgr.show_onu_types()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='prof_onutype_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='prof_onutype')]
            ]
            
            # Telegram message limit is ~4096 characters
            # If output is long, send as file
            max_len = 3500  # Leave room for header and markdown
            
            if len(result) <= max_len:
                # Single message
                response = "🔧 *ONU Types*\n\n"
                response += f"```\n{result}\n```"
                
                await query.edit_message_text(
                    response,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            else:
                # Send as file
                await self.send_long_output_as_file(
                    query, result, "ONU Types", 
                    keyboard, "onu_types"
                )
            
        except Exception as e:
            logger.error(f"Error showing ONU types: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='prof_onutype')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def vlan_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show VLAN management menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show VLANs", callback_data='vlan_show')],
            [InlineKeyboardButton("➕ Add VLAN", callback_data='vlan_add')],
            [InlineKeyboardButton("❌ Delete VLAN", callback_data='vlan_del')],
            [InlineKeyboardButton("🔌 Uplink Interface", callback_data='uplink_menu')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🏷️ *VLAN Management*\n\n"
            "Manage VLAN configuration:\n"
            "• Show, Add, Delete VLANs\n"
            "• Configure Uplink interfaces",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def uplink_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Uplink Interface submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show Uplink Interfaces", callback_data='uplink_show')],
            [InlineKeyboardButton("📊 Show Interface Status", callback_data='uplink_status')],
            [InlineKeyboardButton("⚙️ Configure VLAN", callback_data='uplink_vlan_cfg')],
            [InlineKeyboardButton("❌ Delete VLAN", callback_data='uplink_vlan_del')],
            [InlineKeyboardButton("⏸️ Shutdown Interface", callback_data='uplink_shutdown')],
            [InlineKeyboardButton("▶️ Enable Interface", callback_data='uplink_enable')],
            [InlineKeyboardButton("🔙 Back", callback_data='menu_8')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🔌 *Uplink Interface Management*\n\n"
            "Configure uplink interfaces:\n"
            "• View and monitor interfaces\n"
            "• Configure/Delete VLAN\n"
            "• Enable/Disable interfaces",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_vlans(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show all VLANs"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_8')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("🏷️ Fetching VLANs...")
            
            result = config_mgr.show_vlans()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='vlan_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_8')]
            ]
            
            response = "🏷️ *VLAN Configuration*\n\n"
            response += f"```\n{result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing VLANs: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_8')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # OMCI VLAN Configuration handlers
    async def show_omci_vlan_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show VLAN OMCI Configuration - Display ONU list"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            await query.edit_message_text("📡 Fetching working ONU list...")
            
            # Fetch all working ONUs
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_omci')]]
                await query.edit_message_text(
                    "❌ *No Working ONUs Found*\n\n"
                    "No ONUs are currently in working state.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                return
            
            # Store ONU list in context
            context.user_data['omci_vlan_onus'] = working_onus
            
            # Build keyboard with max 10 ONUs per page
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                sn = onu.get('sn', '-')
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'omci_vlan_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='omci_vlan_more')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_omci')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            text = (
                "🔍 *Show VLAN OMCI Configuration*\n\n"
                f"📊 Total ONUs: {len(working_onus)}\n\n"
                "Select ONU to view VLAN OMCI configuration:"
            )
            
            await query.edit_message_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing OMCI VLAN menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}\n\nTap /menu to continue.")
    
    async def show_omci_vlan_result(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Display VLAN OMCI configuration for selected ONU"""
        query = update.callback_query
        callback_data = query.data
        
        try:
            # Extract ONU index from callback
            onu_idx = int(callback_data.split('_')[-1])
            working_onus = context.user_data.get('omci_vlan_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id_full = f"{pon_port_clean}:{selected_onu['onu_id']}"
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            await query.edit_message_text(f"📡 Fetching VLAN OMCI config for {onu_id_full}...")
            
            # Get VLAN OMCI configuration
            result = onu_mgr.show_onu_vlan_omci(onu_id_full)
            
            # Format response - split if too long
            header = (
                f"🔍 *VLAN OMCI Configuration*\n"
                f"📍 ONU: `{onu_id_full}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n"
                f"🔢 SN: {selected_onu.get('sn', 'N/A')}\n\n"
            )
            
            # Telegram message limit is 4096 characters
            max_len = 4000 - len(header)
            if len(result) > max_len:
                result = result[:max_len] + "\n... (truncated)"
            
            response = header + f"```\n{result}\n```"
            
            keyboard = [[InlineKeyboardButton("🔙 Back to List", callback_data='omci_vlan')]]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(
                response,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing OMCI VLAN result: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_vlan')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ==================== OMCI LAN/WLAN/AUTO WORKFLOWS ====================
    
    async def omci_lan_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Set LAN Port Binding - Show ONU list"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            await query.edit_message_text("📡 Fetching working ONU list...")
            
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_omci')]]
                await query.edit_message_text(
                    "❌ *No Working ONUs Found*\n\n"
                    "No ONUs are currently in working state.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                return
            
            context.user_data['omci_lan_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'omci_lan_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_omci')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            text = (
                "🔌 *Set LAN Port Binding*\n\n"
                f"📊 Total ONUs: {len(working_onus)}\n\n"
                "Select ONU to configure LAN port binding:"
            )
            
            await query.edit_message_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing OMCI LAN menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}\n\nTap /menu to continue.")
    
    async def omci_wlan_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Set WLAN Binding - Show ONU list"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            await query.edit_message_text("📡 Fetching working ONU list...")
            
            working_onus = wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_omci')]]
                await query.edit_message_text(
                    "❌ *No Working ONUs Found*\n\n"
                    "No ONUs are currently in working state.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                return
            
            context.user_data['omci_wlan_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'omci_wlan_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_omci')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            text = (
                "📡 *Set WLAN (WiFi) Binding*\n\n"
                f"📊 Total ONUs: {len(working_onus)}\n\n"
                "Select ONU to configure WLAN binding:"
            )
            
            await query.edit_message_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing OMCI WLAN menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}\n\nTap /menu to continue.")
    
    async def omci_show_running_config_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU Running Config - Show ONU list"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            await query.edit_message_text("📡 Fetching working ONU list...")
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_omci')]]
                await query.edit_message_text(
                    "❌ *No Working ONUs Found*\n\n"
                    "No ONUs with working status.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                return
            
            context.user_data['omci_show_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'omci_show_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_omci')])
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            text = (
                "📋 *Show ONU Running Config*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                "Select ONU to view running configuration:"
            )
            
            await query.edit_message_text(
                text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing OMCI running config menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}\n\nTap /menu to continue.")
    
    async def omci_show_running_config_result(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Display running config for selected ONU"""
        query = update.callback_query
        callback_data = query.data
        
        try:
            onu_idx = int(callback_data.split('_')[-1])
            working_onus = context.user_data.get('omci_show_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id_full = f"{pon_port_clean}:{selected_onu['onu_id']}"
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            await query.edit_message_text(f"📡 Fetching running config for {onu_id_full}...")
            
            result = onu_mgr.show_onu_running_config(onu_id_full)
            
            header = (
                f"📋 *ONU Running Configuration*\n"
                f"📍 ONU: `{onu_id_full}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n"
                f"🔢 SN: {selected_onu.get('sn', 'N/A')}\n\n"
            )
            
            max_len = 4000 - len(header)
            if len(result) > max_len:
                result = result[:max_len] + "\n... (truncated)"
            
            response = header + f"```\n{result}\n```"
            
            keyboard = [[InlineKeyboardButton("🔙 Back to List", callback_data='omci_show')]]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(
                response,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing running config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_show')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ==================== LAN PORT BINDING HANDLERS ====================
    
    async def omci_lan_start_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start LAN binding configuration - parse selected ONU"""
        query = update.callback_query
        callback_data = query.data
        
        try:
            onu_idx = int(callback_data.split('_')[-1])
            working_onus = context.user_data.get('omci_lan_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return OMCI_LAN_INPUT_PORT
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            # Store selected ONU in context
            context.user_data['omci_lan_onu'] = {
                'pon_port': pon_port_clean,
                'onu_id': selected_onu['onu_id'],
                'name': selected_onu.get('name', 'N/A'),
                'sn': selected_onu.get('sn', 'N/A')
            }
            
            keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_omci_lan')]]
            
            await query.edit_message_text(
                f"🔌 *Set LAN Port Binding*\n\n"
                f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                f"Enter LAN Port number (1-4):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return OMCI_LAN_INPUT_PORT
            
        except Exception as e:
            logger.error(f"Error starting LAN config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def omci_lan_input_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle LAN port input"""
        message = update.message
        
        try:
            lan_port = int(message.text.strip())
            
            if lan_port < 1 or lan_port > 4:
                await message.reply_text(
                    "❌ Invalid LAN port! Must be 1-4.\n\n"
                    "Enter LAN Port number (1-4):"
                )
                return OMCI_LAN_INPUT_PORT
            
            context.user_data['omci_lan_onu']['lan_port'] = lan_port
            
            onu_data = context.user_data['omci_lan_onu']
            
            await message.reply_text(
                f"🔌 *Set LAN Port Binding*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"🔌 LAN Port: {lan_port}\n\n"
                f"Enter VLAN ID (e.g., 100):",
                parse_mode='Markdown'
            )
            
            return OMCI_LAN_INPUT_VLAN
            
        except ValueError:
            await message.reply_text(
                "❌ Invalid input! Must be a number (1-4).\n\n"
                "Enter LAN Port number:"
            )
            return OMCI_LAN_INPUT_PORT
    
    async def omci_lan_input_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle VLAN ID input"""
        message = update.message
        
        try:
            vlan_id = int(message.text.strip())
            
            if vlan_id < 1 or vlan_id > 4094:
                await message.reply_text(
                    "❌ Invalid VLAN ID! Must be 1-4094.\n\n"
                    "Enter VLAN ID:"
                )
                return OMCI_LAN_INPUT_VLAN
            
            context.user_data['omci_lan_onu']['vlan_id'] = vlan_id
            
            keyboard = [
                [InlineKeyboardButton("🌐 Transparent", callback_data='lan_mode_transparent')],
                [InlineKeyboardButton("🏷️ Tag", callback_data='lan_mode_tag')],
                [InlineKeyboardButton("❌ Cancel", callback_data='cancel_omci_lan')]
            ]
            
            onu_data = context.user_data['omci_lan_onu']
            
            await message.reply_text(
                f"🔌 *Set LAN Port Binding*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"🔌 LAN Port: {onu_data['lan_port']}\n"
                f"🏷️ VLAN ID: {vlan_id}\n\n"
                f"Select Mode:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return OMCI_LAN_SELECT_MODE
            
        except ValueError:
            await message.reply_text(
                "❌ Invalid input! Must be a number (1-4094).\n\n"
                "Enter VLAN ID:"
            )
            return OMCI_LAN_INPUT_VLAN
    
    async def omci_lan_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute LAN binding configuration"""
        query = update.callback_query
        callback_data = query.data
        
        mode = 'transparent' if 'transparent' in callback_data else 'tag'
        context.user_data['omci_lan_onu']['mode'] = mode
        
        onu_data = context.user_data['omci_lan_onu']
        
        try:
            await query.edit_message_text(
                f"⏳ Configuring LAN port binding...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"🔌 LAN Port: {onu_data['lan_port']}\n"
                f"🏷️ VLAN: {onu_data['vlan_id']}\n"
                f"⚙️ Mode: {mode}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            # Parse PON port (format: 1/1/1)
            parts = onu_data['pon_port'].split('/')
            slot, pon_type, port = int(parts[0]), int(parts[1]), int(parts[2])
            
            success, msg = onu_mgr.set_lan_binding(
                slot, port, onu_data['onu_id'],
                onu_data['lan_port'], onu_data['vlan_id'], mode
            )
            
            if success:
                result_text = (
                    f"✅ *LAN Port Binding Configured*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"🔌 LAN Port: {onu_data['lan_port']}\n"
                    f"🏷️ VLAN ID: {onu_data['vlan_id']}\n"
                    f"⚙️ Mode: {mode}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 OMCI Config Menu", callback_data='onu_omci')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error executing LAN binding: {e}")
            keyboard = [[InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return ConversationHandler.END
    
    # ==================== WLAN BINDING HANDLERS ====================
    
    async def omci_wlan_start_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start WLAN binding configuration - parse selected ONU"""
        query = update.callback_query
        callback_data = query.data
        
        try:
            onu_idx = int(callback_data.split('_')[-1])
            working_onus = context.user_data.get('omci_wlan_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return OMCI_WLAN_INPUT_SSID
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            # Store selected ONU in context
            context.user_data['omci_wlan_onu'] = {
                'pon_port': pon_port_clean,
                'onu_id': selected_onu['onu_id'],
                'name': selected_onu.get('name', 'N/A'),
                'sn': selected_onu.get('sn', 'N/A')
            }
            
            keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_omci_wlan')]]
            
            await query.edit_message_text(
                f"📡 *Set WLAN (WiFi) Binding*\n\n"
                f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                f"Enter SSID Index (1-4):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return OMCI_WLAN_INPUT_SSID
            
        except Exception as e:
            logger.error(f"Error starting WLAN config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def omci_wlan_input_ssid(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle SSID index input"""
        message = update.message
        
        try:
            ssid_index = int(message.text.strip())
            
            if ssid_index < 1 or ssid_index > 4:
                await message.reply_text(
                    "❌ Invalid SSID index! Must be 1-4.\n\n"
                    "Enter SSID Index (1-4):"
                )
                return OMCI_WLAN_INPUT_SSID
            
            context.user_data['omci_wlan_onu']['ssid_index'] = ssid_index
            
            onu_data = context.user_data['omci_wlan_onu']
            
            await message.reply_text(
                f"📡 *Set WLAN Binding*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"📡 SSID Index: {ssid_index}\n\n"
                f"Enter VLAN ID (e.g., 100):",
                parse_mode='Markdown'
            )
            
            return OMCI_WLAN_INPUT_VLAN
            
        except ValueError:
            await message.reply_text(
                "❌ Invalid input! Must be a number (1-4).\n\n"
                "Enter SSID Index:"
            )
            return OMCI_WLAN_INPUT_SSID
    
    async def omci_wlan_input_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle VLAN ID input for WLAN"""
        message = update.message
        
        try:
            vlan_id = int(message.text.strip())
            
            if vlan_id < 1 or vlan_id > 4094:
                await message.reply_text(
                    "❌ Invalid VLAN ID! Must be 1-4094.\n\n"
                    "Enter VLAN ID:"
                )
                return OMCI_WLAN_INPUT_VLAN
            
            context.user_data['omci_wlan_onu']['vlan_id'] = vlan_id
            
            keyboard = [
                [InlineKeyboardButton("🌐 Transparent", callback_data='wlan_mode_transparent')],
                [InlineKeyboardButton("🏷️ Tag", callback_data='wlan_mode_tag')],
                [InlineKeyboardButton("❌ Cancel", callback_data='cancel_omci_wlan')]
            ]
            
            onu_data = context.user_data['omci_wlan_onu']
            
            await message.reply_text(
                f"📡 *Set WLAN Binding*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"📡 SSID Index: {onu_data['ssid_index']}\n"
                f"🏷️ VLAN ID: {vlan_id}\n\n"
                f"Select Mode:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return OMCI_WLAN_SELECT_MODE
            
        except ValueError:
            await message.reply_text(
                "❌ Invalid input! Must be a number (1-4094).\n\n"
                "Enter VLAN ID:"
            )
            return OMCI_WLAN_INPUT_VLAN
    
    async def omci_wlan_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute WLAN binding configuration"""
        query = update.callback_query
        callback_data = query.data
        
        mode = 'transparent' if 'transparent' in callback_data else 'tag'
        context.user_data['omci_wlan_onu']['mode'] = mode
        
        onu_data = context.user_data['omci_wlan_onu']
        
        try:
            await query.edit_message_text(
                f"⏳ Configuring WLAN binding...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"📡 SSID Index: {onu_data['ssid_index']}\n"
                f"🏷️ VLAN: {onu_data['vlan_id']}\n"
                f"⚙️ Mode: {mode}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            # Parse PON port (format: 1/1/1)
            parts = onu_data['pon_port'].split('/')
            slot, pon_type, port = int(parts[0]), int(parts[1]), int(parts[2])
            
            success, msg = onu_mgr.set_wlan_binding(
                slot, port, onu_data['onu_id'],
                onu_data['ssid_index'], onu_data['vlan_id'], mode
            )
            
            if success:
                result_text = (
                    f"✅ *WLAN Binding Configured*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"📡 SSID Index: {onu_data['ssid_index']}\n"
                    f"🏷️ VLAN ID: {onu_data['vlan_id']}\n"
                    f"⚙️ Mode: {mode}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 OMCI Config Menu", callback_data='onu_omci')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error executing WLAN binding: {e}")
            keyboard = [[InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return ConversationHandler.END
    
    async def cancel_omci_lan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Cancel LAN binding conversation"""
        query = update.callback_query
        context.user_data.clear()
        await self.onu_omci_menu(update, context)
        return ConversationHandler.END
    
    async def cancel_omci_wlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Cancel WLAN binding conversation"""
        query = update.callback_query
        context.user_data.clear()
        await self.onu_omci_menu(update, context)
        return ConversationHandler.END
    
    # ==================== ONU CONFIGURATION HANDLERS ====================
    
    async def onu_config_pppoe_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show working ONU list for PPPoE configuration"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['cfg_pppoe_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'cfg_pppoe_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"🌐 *PPPoE Configuration*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to configure PPPoE:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in pppoe menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def onu_config_pppoe_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start PPPoE configuration with existing config check"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('cfg_pppoe_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return ConversationHandler.END
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            # Fetch existing configuration
            await query.edit_message_text("⏳ Checking existing configuration...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = pon_port_clean.split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{selected_onu['onu_id']}"
            
            # GET EXISTING CONFIG
            existing = onu_mgr.get_onu_existing_config(onu_id_full)
            
            context.user_data['cfg_onu'] = {
                'type': 'pppoe',
                'pon_port': pon_port_clean,
                'onu_id': selected_onu['onu_id'],
                'name': selected_onu.get('name', 'N/A'),
                'sn': selected_onu.get('sn', 'N/A'),
                'existing': existing
            }
            
            # Check if ONU has existing PPPoE config
            if existing['mode'] == 'pppoe':
                # SHOW EXISTING CONFIG + OPTIONS
                pppoe_cfg = existing['omci_config'].get('pppoe', {})
                iface_cfg = existing['interface_config']
                
                config_text = (
                    f"🔍 *Existing PPPoE Configuration Found*\n\n"
                    f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                    f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                    f"*Current Settings:*\n"
                    f"👤 Username: `{pppoe_cfg.get('username', 'N/A')}`\n"
                    f"🔒 Password: `{pppoe_cfg.get('password', '********')}`\n"
                    f"🏷️ VLAN: `{existing['omci_config'].get('vlan', 'N/A')}`\n"
                    f"📤 TCONT: `{iface_cfg.get('tcont_profile', 'N/A')}`\n"
                    f"📥 Traffic: `{iface_cfg.get('traffic_profile', 'N/A')}`\n\n"
                    f"What would you like to do?"
                )
                
                keyboard = [
                    [InlineKeyboardButton("✏️ Edit Configuration", callback_data='cfg_edit_pppoe')],
                    [InlineKeyboardButton("🔄 New Configuration (Overwrite)", callback_data='cfg_new_pppoe')],
                    [InlineKeyboardButton("✅ Keep Current (No Changes)", callback_data='onu_configure')],
                    [InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]
                ]
                
                await query.edit_message_text(
                    config_text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
                return CFG_PPPOE_ACTION_SELECT
            
            else:
                # NO EXISTING PPPOE CONFIG - Direct to new config
                keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]]
                
                await query.edit_message_text(
                    f"🔐 *PPPoE Configuration*\n\n"
                    f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                    f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                    f"ℹ️ No existing PPPoE config found\n\n"
                    f"Enter PPPoE Username:",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
                return CFG_PPPOE_INPUT_USER
            
        except Exception as e:
            logger.error(f"Error starting PPPoE config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_pppoe_action_edit(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Edit action - show parameters to edit"""
        query = update.callback_query
        
        onu_data = context.user_data['cfg_onu']
        existing = onu_data['existing']
        pppoe_cfg = existing['omci_config'].get('pppoe', {})
        iface_cfg = existing['interface_config']
        
        # Initialize edit_values with existing config
        context.user_data['edit_values'] = {
            'username': pppoe_cfg.get('username', ''),
            'password': '***keep-current***',  # Special marker to keep existing
            'vlan': existing['omci_config'].get('vlan', 100),
            'tcont_profile': iface_cfg.get('tcont_profile', 'default'),
            'traffic_profile': iface_cfg.get('traffic_profile', 'default')
        }
        
        config_text = (
            f"✏️ *Edit PPPoE Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n\n"
            f"Select parameter to edit:"
        )
        
        keyboard = [
            [InlineKeyboardButton(
                f"👤 Username: {pppoe_cfg.get('username', 'N/A')}", 
                callback_data='cfg_edit_pppoe_user'
            )],
            [InlineKeyboardButton(
                f"🔒 Password: ********", 
                callback_data='cfg_edit_pppoe_pass'
            )],
            [InlineKeyboardButton(
                f"🏷️ VLAN: {existing['omci_config'].get('vlan', 'N/A')}", 
                callback_data='cfg_edit_pppoe_vlan'
            )],
            [InlineKeyboardButton(
                f"📤 TCONT Profile: {iface_cfg.get('tcont_profile', 'N/A')}", 
                callback_data='cfg_edit_pppoe_tcont'
            )],
            [InlineKeyboardButton(
                f"📥 Traffic Profile: {iface_cfg.get('traffic_profile', 'N/A')}", 
                callback_data='cfg_edit_pppoe_traffic'
            )],
            [InlineKeyboardButton("💾 Save Changes", callback_data='cfg_save_pppoe_edit')],
            [InlineKeyboardButton("🔙 Back", callback_data='cfg_back_to_action')],
            [InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]
        ]
        
        await query.edit_message_text(
            config_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return CFG_PPPOE_EDIT_PARAM
    
    async def onu_config_pppoe_action_new(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle New Config action - start fresh configuration"""
        query = update.callback_query
        
        onu_data = context.user_data['cfg_onu']
        
        # Clear existing config from context to start fresh
        onu_data.pop('existing', None)
        
        keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]]
        
        await query.edit_message_text(
            f"🔄 *New PPPoE Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"📝 Name: {onu_data.get('name', 'N/A')}\n\n"
            f"⚠️ This will overwrite existing config\n\n"
            f"Enter PPPoE Username:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return CFG_PPPOE_INPUT_USER
    
    async def onu_config_pppoe_edit_username(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Edit username parameter"""
        query = update.callback_query
        
        await query.edit_message_text(
            f"👤 *Edit PPPoE Username*\n\n"
            f"Current: `{context.user_data['edit_values']['username']}`\n\n"
            f"Enter new username:",
            parse_mode='Markdown'
        )
        
        context.user_data['editing_param'] = 'username'
        return CFG_PPPOE_INPUT_USER
    
    async def onu_config_pppoe_edit_password(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Edit password parameter"""
        query = update.callback_query
        
        await query.edit_message_text(
            f"🔒 *Edit PPPoE Password*\n\n"
            f"Current: ********\n\n"
            f"Enter new password:",
            parse_mode='Markdown'
        )
        
        context.user_data['editing_param'] = 'password'
        return CFG_PPPOE_INPUT_PASS
    
    async def onu_config_pppoe_edit_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Edit VLAN parameter"""
        query = update.callback_query
        
        await query.edit_message_text(
            f"🏷️ *Edit VLAN*\n\n"
            f"Current: `{context.user_data['edit_values']['vlan']}`\n\n"
            f"Enter new VLAN (1-4094):",
            parse_mode='Markdown'
        )
        
        context.user_data['editing_param'] = 'vlan'
        return CFG_PPPOE_INPUT_VLAN
    
    async def onu_config_pppoe_edit_tcont(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Edit TCONT profile parameter"""
        query = update.callback_query
        
        await query.edit_message_text("⏳ Fetching TCONT profiles...")
        
        client = await self.get_client(query.from_user.id)
        if not client:
            await query.edit_message_text("❌ Cannot connect to OLT")
            return ConversationHandler.END
        
        from scripts.onu_register_wizard import ONURegistrationWizard
        wizard = ONURegistrationWizard(client)
        
        tcont_profiles = wizard.fetch_tcont_profiles()
        
        if not tcont_profiles:
            await query.edit_message_text("❌ No TCONT profiles found")
            return CFG_PPPOE_EDIT_PARAM
        
        context.user_data['cfg_tcont_profiles'] = tcont_profiles
        
        keyboard = []
        for i, profile in enumerate(tcont_profiles[:15], 1):
            keyboard.append([InlineKeyboardButton(
                f"{i}. {profile}",
                callback_data=f'cfg_edit_tcont_{i-1}'
            )])
        
        if len(tcont_profiles) > 15:
            keyboard.append([InlineKeyboardButton(f"... and {len(tcont_profiles)-15} more", callback_data='noop')])
        
        keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='cfg_edit_pppoe')])
        
        await query.edit_message_text(
            f"📤 *Edit TCONT Profile*\n\n"
            f"Current: `{context.user_data['edit_values']['tcont_profile']}`\n\n"
            f"Select new TCONT profile:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        context.user_data['editing_param'] = 'tcont'
        return CFG_PPPOE_SELECT_TCONT
    
    async def onu_config_pppoe_edit_traffic(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Edit Traffic profile parameter"""
        query = update.callback_query
        
        await query.edit_message_text("⏳ Fetching Traffic profiles...")
        
        client = await self.get_client(query.from_user.id)
        if not client:
            await query.edit_message_text("❌ Cannot connect to OLT")
            return ConversationHandler.END
        
        from scripts.onu_register_wizard import ONURegistrationWizard
        wizard = ONURegistrationWizard(client)
        
        traffic_profiles = wizard.fetch_traffic_profiles()
        
        if not traffic_profiles:
            await query.edit_message_text("❌ No Traffic profiles found")
            return CFG_PPPOE_EDIT_PARAM
        
        context.user_data['cfg_traffic_profiles'] = traffic_profiles
        
        keyboard = []
        for i, profile in enumerate(traffic_profiles[:15], 1):
            keyboard.append([InlineKeyboardButton(
                f"{i}. {profile}",
                callback_data=f'cfg_edit_traffic_{i-1}'
            )])
        
        if len(traffic_profiles) > 15:
            keyboard.append([InlineKeyboardButton(f"... and {len(traffic_profiles)-15} more", callback_data='noop')])
        
        keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='cfg_edit_pppoe')])
        
        await query.edit_message_text(
            f"📥 *Edit Traffic Profile*\n\n"
            f"Current: `{context.user_data['edit_values']['traffic_profile']}`\n\n"
            f"Select new Traffic profile:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        context.user_data['editing_param'] = 'traffic'
        return CFG_PPPOE_SELECT_TRAFFIC
    
    async def onu_config_pppoe_save_edit(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Save edited configuration"""
        query = update.callback_query
        
        try:
            onu_data = context.user_data['cfg_onu']
            edit_values = context.user_data['edit_values']
            
            # Apply edited values
            username = edit_values['username']
            password = edit_values['password']
            vlan = edit_values['vlan']
            tcont_profile = edit_values['tcont_profile']
            traffic_profile = edit_values['traffic_profile']
            
            await query.edit_message_text(
                f"⏳ Applying configuration...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"👤 Username: {username}\n"
                f"🏷️ VLAN: {vlan}\n"
                f"📤 TCONT: {tcont_profile}\n"
                f"📥 Traffic: {traffic_profile}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = onu_data['pon_port'].split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{onu_data['onu_id']}"
            
            # If password is special marker, need to get actual password from existing config
            # For security, we can't retrieve the actual password, so user must re-enter
            if password == '***keep-current***':
                # Can't keep existing password in ZTE - must reconfigure with new password
                await query.edit_message_text(
                    "⚠️ *Security Notice*\n\n"
                    "For security reasons, password must be re-entered.\n"
                    "Please enter the PPPoE password:",
                    parse_mode='Markdown'
                )
                context.user_data['save_pending'] = True
                return CFG_PPPOE_INPUT_PASS
            
            success, msg = onu_mgr.configure_pppoe(
                onu_id_full,
                username,
                password,
                vlan,
                tcont_profile,
                traffic_profile
            )
            
            if success:
                result_text = (
                    f"✅ *PPPoE Configuration Updated*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"👤 Username: {username}\n"
                    f"🏷️ VLAN: {vlan}\n"
                    f"📤 TCONT: {tcont_profile}\n"
                    f"📥 Traffic: {traffic_profile}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error saving PPPoE config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_pppoe_username(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle PPPoE username input"""
        message = update.message
        username = message.text.strip()
        
        # Check if in edit mode
        if context.user_data.get('editing_param') == 'username':
            context.user_data['edit_values']['username'] = username
            context.user_data.pop('editing_param', None)
            # Return to edit menu
            return await self.onu_config_pppoe_action_edit(
                type('obj', (object,), {'callback_query': type('q', (object,), {
                    'edit_message_text': message.reply_text,
                    'from_user': message.from_user
                })()})(),
                context
            )
        
        context.user_data['cfg_onu']['pppoe_username'] = username
        onu_data = context.user_data['cfg_onu']
        
        await message.reply_text(
            f"🌐 *PPPoE Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"👤 Username: {username}\n\n"
            f"Enter PPPoE Password:",
            parse_mode='Markdown'
        )
        
        return CFG_PPPOE_INPUT_PASS
    
    async def onu_config_pppoe_password(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle PPPoE password input"""
        message = update.message
        password = message.text.strip()
        
        # Check if in edit mode
        if context.user_data.get('editing_param') == 'password':
            context.user_data['edit_values']['password'] = password
            context.user_data.pop('editing_param', None)
            # Return to edit menu
            await message.reply_text("✅ Password updated")
            return await self.onu_config_pppoe_action_edit(
                type('obj', (object,), {'callback_query': type('q', (object,), {
                    'edit_message_text': message.reply_text,
                    'from_user': message.from_user
                })()})(),
                context
            )
        
        # Check if saving edit with password requirement
        if context.user_data.get('save_pending'):
            context.user_data['edit_values']['password'] = password
            context.user_data.pop('save_pending', None)
            # Trigger save
            return await self.onu_config_pppoe_save_edit(
                type('obj', (object,), {'callback_query': type('q', (object,), {
                    'edit_message_text': message.reply_text,
                    'from_user': message.from_user
                })()})(),
                context
            )
        
        context.user_data['cfg_onu']['pppoe_password'] = password
        onu_data = context.user_data['cfg_onu']
        
        await message.reply_text(
            f"🌐 *PPPoE Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"👤 Username: {onu_data['pppoe_username']}\n"
            f"🔐 Password: {'*' * len(password)}\n\n"
            f"Enter VLAN ID (e.g., 100):",
            parse_mode='Markdown'
        )
        
        return CFG_PPPOE_INPUT_VLAN
    
    async def onu_config_pppoe_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle PPPoE VLAN input and show TCONT profile selection"""
        message = update.message
        
        try:
            vlan = int(message.text.strip())
            
            if vlan < 1 or vlan > 4094:
                await message.reply_text("❌ Invalid VLAN! Must be 1-4094.\n\nEnter VLAN ID:")
                return CFG_PPPOE_INPUT_VLAN
            
            context.user_data['cfg_onu']['vlan'] = vlan
            
            # Fetch TCONT profiles from OLT
            client = await self.get_client(message.from_user.id)
            if not client:
                await message.reply_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            wizard.fetch_tcont_profiles()
            tcont_profiles = wizard.tcont_profiles
            
            if not tcont_profiles:
                await message.reply_text(
                    "❌ Failed to fetch TCONT profiles from OLT.\n"
                    "Please try again or use CLI."
                )
                return ConversationHandler.END
            
            # Store profiles in context
            context.user_data['tcont_profiles'] = tcont_profiles
            
            # Create buttons for TCONT selection
            keyboard = []
            for i, profile in enumerate(tcont_profiles[:10], 1):
                keyboard.append([InlineKeyboardButton(f"{i}. {profile}", callback_data=f'cfg_tcont_{i-1}')])
            
            if len(tcont_profiles) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(tcont_profiles)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')])
            
            onu_data = context.user_data['cfg_onu']
            
            await message.reply_text(
                f"🌐 *PPPoE Configuration*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"👤 Username: {onu_data['pppoe_username']}\n"
                f"🏷️ VLAN: {vlan}\n\n"
                f"📊 Select TCONT Profile (Upstream):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_PPPOE_SELECT_TCONT
            
        except ValueError:
            await message.reply_text("❌ Invalid input! Must be a number.\n\nEnter VLAN ID:")
            return CFG_PPPOE_INPUT_VLAN
    
    async def onu_config_pppoe_select_tcont(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle TCONT profile selection and show Traffic profile selection"""
        query = update.callback_query
        
        try:
            tcont_idx = int(query.data.split('_')[-1])
            tcont_profiles = context.user_data.get('tcont_profiles', [])
            
            if tcont_idx >= len(tcont_profiles):
                await query.edit_message_text("❌ Invalid selection")
                return ConversationHandler.END
            
            selected_tcont = tcont_profiles[tcont_idx]
            context.user_data['cfg_onu']['tcont_profile'] = selected_tcont
            
            # Fetch Traffic profiles from OLT
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            wizard.fetch_traffic_profiles()
            traffic_profiles = wizard.traffic_profiles
            
            if not traffic_profiles:
                await query.edit_message_text(
                    "❌ Failed to fetch Traffic profiles from OLT.\n"
                    "Please try again or use CLI."
                )
                return ConversationHandler.END
            
            # Store profiles in context
            context.user_data['traffic_profiles'] = traffic_profiles
            
            # Create buttons for Traffic selection
            keyboard = []
            for i, profile in enumerate(traffic_profiles[:10], 1):
                keyboard.append([InlineKeyboardButton(f"{i}. {profile}", callback_data=f'cfg_traffic_{i-1}')])
            
            if len(traffic_profiles) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(traffic_profiles)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')])
            
            onu_data = context.user_data['cfg_onu']
            
            await query.edit_message_text(
                f"🌐 *PPPoE Configuration*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"👤 Username: {onu_data['pppoe_username']}\n"
                f"🏷️ VLAN: {onu_data['vlan']}\n"
                f"📤 TCONT: {selected_tcont}\n\n"
                f"📊 Select Traffic Profile (Downstream):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_PPPOE_SELECT_TRAFFIC
            
        except Exception as e:
            logger.error(f"Error selecting TCONT: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_pppoe_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Traffic profile selection and execute PPPoE configuration"""
        query = update.callback_query
        
        try:
            traffic_idx = int(query.data.split('_')[-1])
            traffic_profiles = context.user_data.get('traffic_profiles', [])
            
            if traffic_idx >= len(traffic_profiles):
                await query.edit_message_text("❌ Invalid selection")
                return ConversationHandler.END
            
            selected_traffic = traffic_profiles[traffic_idx]
            context.user_data['cfg_onu']['traffic_profile'] = selected_traffic
            
            onu_data = context.user_data['cfg_onu']
            
            await query.edit_message_text(
                f"⏳ Configuring PPPoE...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"👤 User: {onu_data['pppoe_username']}\n"
                f"🏷️ VLAN: {onu_data['vlan']}\n"
                f"📤 TCONT: {onu_data['tcont_profile']}\n"
                f"📥 Traffic: {selected_traffic}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = onu_data['pon_port'].split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{onu_data['onu_id']}"
            
            success, msg = onu_mgr.configure_pppoe(
                onu_id_full,
                onu_data['pppoe_username'],
                onu_data['pppoe_password'],
                onu_data['vlan'],
                onu_data['tcont_profile'],
                onu_data['traffic_profile']
            )
            
            if success:
                result_text = (
                    f"✅ *PPPoE Configured Successfully*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"👤 Username: {onu_data['pppoe_username']}\n"
                    f"🏷️ VLAN: {onu_data['vlan']}\n"
                    f"📤 TCONT: {onu_data['tcont_profile']}\n"
                    f"📥 Traffic: {onu_data['traffic_profile']}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error configuring PPPoE: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_pppoe_select_tcont_edit(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle TCONT profile selection in edit mode"""
        query = update.callback_query
        
        try:
            tcont_idx = int(query.data.split('_')[-1])
            tcont_profiles = context.user_data.get('cfg_tcont_profiles', [])
            
            if tcont_idx >= len(tcont_profiles):
                await query.edit_message_text("❌ Invalid selection")
                return CFG_PPPOE_EDIT_PARAM
            
            selected_tcont = tcont_profiles[tcont_idx]
            context.user_data['edit_values']['tcont_profile'] = selected_tcont
            
            await query.answer(f"✅ TCONT updated to {selected_tcont}")
            
            # Return to edit menu
            return await self.onu_config_pppoe_action_edit(update, context)
            
        except Exception as e:
            logger.error(f"Error in TCONT edit: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return CFG_PPPOE_EDIT_PARAM
    
    async def onu_config_pppoe_select_traffic_edit(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Traffic profile selection in edit mode"""
        query = update.callback_query
        
        try:
            traffic_idx = int(query.data.split('_')[-1])
            traffic_profiles = context.user_data.get('cfg_traffic_profiles', [])
            
            if traffic_idx >= len(traffic_profiles):
                await query.edit_message_text("❌ Invalid selection")
                return CFG_PPPOE_EDIT_PARAM
            
            selected_traffic = traffic_profiles[traffic_idx]
            context.user_data['edit_values']['traffic_profile'] = selected_traffic
            
            await query.answer(f"✅ Traffic updated to {selected_traffic}")
            
            # Return to edit menu
            return await self.onu_config_pppoe_action_edit(update, context)
            
        except Exception as e:
            logger.error(f"Error in Traffic edit: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return CFG_PPPOE_EDIT_PARAM
    
    async def onu_config_bridge_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show working ONU list for Bridge configuration"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['cfg_bridge_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'cfg_bridge_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"🌉 *Bridge Configuration*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to configure Bridge mode:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in bridge menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def onu_config_bridge_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start Bridge configuration"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('cfg_bridge_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return CFG_BRIDGE_INPUT_VLAN
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            context.user_data['cfg_onu'] = {
                'type': 'bridge',
                'pon_port': pon_port_clean,
                'onu_id': selected_onu['onu_id'],
                'name': selected_onu.get('name', 'N/A'),
                'sn': selected_onu.get('sn', 'N/A')
            }
            
            keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]]
            
            await query.edit_message_text(
                f"🌉 *Bridge Configuration*\n\n"
                f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                f"Enter VLAN ID (e.g., 100):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_BRIDGE_INPUT_VLAN
            
        except Exception as e:
            logger.error(f"Error starting Bridge config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_bridge_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Bridge VLAN input"""
        message = update.message
        
        try:
            vlan = int(message.text.strip())
            
            if vlan < 1 or vlan > 4094:
                await message.reply_text("❌ Invalid VLAN! Must be 1-4094.\n\nEnter VLAN ID:")
                return CFG_BRIDGE_INPUT_VLAN
            
            context.user_data['cfg_onu']['vlan'] = vlan
            onu_data = context.user_data['cfg_onu']
            
            await message.reply_text(
                f"🌉 *Bridge Configuration*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"🏷️ VLAN: {vlan}\n\n"
                f"Enter ETH Port to bind (1-4):",
                parse_mode='Markdown'
            )
            
            return CFG_BRIDGE_INPUT_PORT
            
        except ValueError:
            await message.reply_text("❌ Invalid input! Must be a number.\n\nEnter VLAN ID:")
            return CFG_BRIDGE_INPUT_VLAN
    
    async def onu_config_bridge_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Bridge ETH Port input and show TCONT profile selection"""
        message = update.message
        
        try:
            eth_port = int(message.text.strip())
            
            if eth_port < 1 or eth_port > 4:
                await message.reply_text("❌ Invalid ETH port! Must be 1-4.\n\nEnter ETH Port:")
                return CFG_BRIDGE_INPUT_PORT
            
            context.user_data['cfg_onu']['eth_port'] = eth_port
            
            # Fetch TCONT profiles from OLT
            client = await self.get_client(message.from_user.id)
            if not client:
                await message.reply_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            wizard.fetch_tcont_profiles()
            tcont_profiles = wizard.tcont_profiles
            
            if not tcont_profiles:
                await message.reply_text(
                    "❌ Failed to fetch TCONT profiles from OLT.\n"
                    "Please try again or use CLI."
                )
                return ConversationHandler.END
            
            # Store profiles in context
            context.user_data['tcont_profiles'] = tcont_profiles
            
            # Create buttons for TCONT selection
            keyboard = []
            for i, profile in enumerate(tcont_profiles[:10], 1):
                keyboard.append([InlineKeyboardButton(f"{i}. {profile}", callback_data=f'cfg_bridge_tcont_{i-1}')])
            
            if len(tcont_profiles) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(tcont_profiles)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')])
            
            onu_data = context.user_data['cfg_onu']
            
            await message.reply_text(
                f"🌉 *Bridge Configuration*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"🏷️ VLAN: {onu_data['vlan']}\n"
                f"🔌 ETH Port: {eth_port}\n\n"
                f"📊 Select TCONT Profile (Upstream):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_BRIDGE_SELECT_TCONT
            
        except ValueError:
            await message.reply_text("❌ Invalid input! Must be a number (1-4).\n\nEnter ETH Port:")
            return CFG_BRIDGE_INPUT_PORT
    
    async def onu_config_bridge_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute Bridge configuration"""
        query = update.callback_query
        
        try:
            tcont_idx = int(query.data.split('_')[-1])
            tcont_profiles = context.user_data.get('tcont_profiles', [])
            
            if tcont_idx >= len(tcont_profiles):
                await query.edit_message_text("❌ Invalid selection")
                return ConversationHandler.END
            
            selected_tcont = tcont_profiles[tcont_idx]
            context.user_data['cfg_onu']['tcont_profile'] = selected_tcont
            
            onu_data = context.user_data['cfg_onu']
            
            await query.edit_message_text(
                f"⏳ Configuring Bridge mode...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"🏷️ VLAN: {onu_data['vlan']}\n"
                f"🔌 ETH Port: {onu_data['eth_port']}\n"
                f"📤 TCONT: {selected_tcont}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = onu_data['pon_port'].split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{onu_data['onu_id']}"
            
            success, msg = onu_mgr.configure_bridge(
                onu_id_full,
                onu_data['vlan'],
                selected_tcont,
                onu_data['eth_port']
            )
            
            if success:
                result_text = (
                    f"✅ *Bridge Configured Successfully*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"🏷️ VLAN: {onu_data['vlan']}\n"
                    f"🔌 ETH Port: {onu_data['eth_port']}\n"
                    f"📤 TCONT: {selected_tcont}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error configuring Bridge: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_static_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show working ONU list for Static IP configuration"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['cfg_static_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'cfg_static_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"🌐 *Static IP Configuration*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to configure Static IP:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in static IP menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def onu_config_static_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start Static IP configuration"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('cfg_static_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return CFG_STATIC_INPUT_IP
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            context.user_data['cfg_onu'] = {
                'type': 'static',
                'pon_port': pon_port_clean,
                'onu_id': selected_onu['onu_id'],
                'name': selected_onu.get('name', 'N/A'),
                'sn': selected_onu.get('sn', 'N/A')
            }
            
            keyboard = [[InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')]]
            
            await query.edit_message_text(
                f"🌐 *Static IP Configuration*\n\n"
                f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                f"Enter Static IP Address (e.g., 192.168.1.100):",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_STATIC_INPUT_IP
            
        except Exception as e:
            logger.error(f"Error starting Static IP config: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_static_ip(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Static IP input"""
        message = update.message
        ip_address = message.text.strip()
        
        context.user_data['cfg_onu']['ip_address'] = ip_address
        onu_data = context.user_data['cfg_onu']
        
        await message.reply_text(
            f"🌐 *Static IP Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"🌐 IP: {ip_address}\n\n"
            f"Enter Netmask (e.g., 255.255.255.0):",
            parse_mode='Markdown'
        )
        
        return CFG_STATIC_INPUT_MASK
    
    async def onu_config_static_mask(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Netmask input"""
        message = update.message
        netmask = message.text.strip()
        
        context.user_data['cfg_onu']['netmask'] = netmask
        onu_data = context.user_data['cfg_onu']
        
        await message.reply_text(
            f"🌐 *Static IP Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"🌐 IP: {onu_data['ip_address']}\n"
            f"📏 Mask: {netmask}\n\n"
            f"Enter Gateway (e.g., 192.168.1.1):",
            parse_mode='Markdown'
        )
        
        return CFG_STATIC_INPUT_GW
    
    async def onu_config_static_gw(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Gateway input"""
        message = update.message
        gateway = message.text.strip()
        
        context.user_data['cfg_onu']['gateway'] = gateway
        onu_data = context.user_data['cfg_onu']
        
        # Set default DNS
        context.user_data['cfg_onu']['dns1'] = '8.8.8.8'
        context.user_data['cfg_onu']['dns2'] = '8.8.4.4'
        
        await message.reply_text(
            f"🌐 *Static IP Configuration*\n\n"
            f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
            f"🌐 IP: {onu_data['ip_address']}\n"
            f"📏 Mask: {onu_data['netmask']}\n"
            f"🌉 Gateway: {gateway}\n"
            f"🔍 DNS: 8.8.8.8, 8.8.4.4 (default)\n\n"
            f"Enter VLAN ID (e.g., 100):",
            parse_mode='Markdown'
        )
        
        return CFG_STATIC_INPUT_VLAN
    
    async def onu_config_static_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle VLAN input and fetch TCONT profiles"""
        message = update.message
        
        try:
            vlan = int(message.text.strip())
            
            if vlan < 1 or vlan > 4094:
                await message.reply_text("❌ Invalid VLAN! Must be 1-4094.\n\nEnter VLAN ID:")
                return CFG_STATIC_INPUT_VLAN
            
            context.user_data['cfg_onu']['vlan'] = vlan
            onu_data = context.user_data['cfg_onu']
            
            await message.reply_text("⏳ Fetching TCONT profiles from OLT...")
            
            client = await self.get_client(message.from_user.id)
            if not client:
                await message.reply_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            tcont_profiles = wizard.fetch_tcont_profiles()
            
            if not tcont_profiles:
                await message.reply_text("❌ No TCONT profiles found")
                return ConversationHandler.END
            
            context.user_data['cfg_tcont_profiles'] = tcont_profiles
            
            # Create buttons for TCONT profile selection
            keyboard = []
            for i, profile in enumerate(tcont_profiles[:15], 1):
                keyboard.append([InlineKeyboardButton(
                    f"{i}. {profile}",
                    callback_data=f'cfg_static_tcont_{i-1}'
                )])
            
            if len(tcont_profiles) > 15:
                keyboard.append([InlineKeyboardButton(f"... and {len(tcont_profiles)-15} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data='cancel_cfg')])
            
            await message.reply_text(
                f"🌐 *Static IP Configuration*\n\n"
                f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                f"🌐 IP: {onu_data['ip_address']}\n"
                f"📏 Mask: {onu_data['netmask']}\n"
                f"🌉 Gateway: {onu_data['gateway']}\n"
                f"🏷️ VLAN: {vlan}\n\n"
                f"📤 *Select TCONT Profile (Upstream):*\n"
                f"Found {len(tcont_profiles)} profiles",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return CFG_STATIC_SELECT_TCONT
            
        except ValueError:
            await message.reply_text("❌ Invalid VLAN! Must be a number.\n\nEnter VLAN ID:")
            return CFG_STATIC_INPUT_VLAN
        except Exception as e:
            logger.error(f"Error in static VLAN: {e}")
            await message.reply_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_static_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute Static IP configuration with selected TCONT profile"""
        query = update.callback_query
        
        try:
            tcont_idx = int(query.data.split('_')[-1])
            tcont_profiles = context.user_data.get('cfg_tcont_profiles', [])
            
            if tcont_idx >= len(tcont_profiles):
                await query.edit_message_text("❌ Invalid TCONT profile selection")
                return ConversationHandler.END
            
            selected_tcont = tcont_profiles[tcont_idx]
            onu_data = context.user_data['cfg_onu']
            
            await query.edit_message_text(
                f"⏳ Configuring Static IP...\n\n"
                f"📍 ONU: {onu_data['pon_port']}:{onu_data['onu_id']}\n"
                f"🌐 IP: {onu_data['ip_address']}/{onu_data['netmask']}\n"
                f"🌉 Gateway: {onu_data['gateway']}\n"
                f"🏷️ VLAN: {onu_data['vlan']}\n"
                f"📤 TCONT: {selected_tcont}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return ConversationHandler.END
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = onu_data['pon_port'].split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{onu_data['onu_id']}"
            
            success, msg = onu_mgr.configure_static_ip(
                onu_id_full,
                onu_data['ip_address'],
                onu_data['netmask'],
                onu_data['gateway'],
                onu_data['dns1'],
                onu_data['dns2'],
                onu_data['vlan'],
                selected_tcont
            )
            
            if success:
                result_text = (
                    f"✅ *Static IP Configured Successfully*\n\n"
                    f"📍 ONU: `{onu_data['pon_port']}:{onu_data['onu_id']}`\n"
                    f"📝 Name: {onu_data['name']}\n"
                    f"🌐 IP: {onu_data['ip_address']}\n"
                    f"📏 Mask: {onu_data['netmask']}\n"
                    f"🌉 Gateway: {onu_data['gateway']}\n"
                    f"🏷️ VLAN: {onu_data['vlan']}\n"
                    f"📤 TCONT: {selected_tcont}\n\n"
                    f"✅ {self.escape_markdown(msg)}"
                )
            else:
                result_text = f"❌ *Configuration Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except Exception as e:
            logger.error(f"Error configuring Static IP: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
            
            await message.reply_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            context.user_data.clear()
            return ConversationHandler.END
            
        except ValueError:
            await message.reply_text("❌ Invalid input! Must be a number.\n\nEnter VLAN ID:")
            return CFG_STATIC_INPUT_VLAN
        except Exception as e:
            logger.error(f"Error configuring Static IP: {e}")
            await message.reply_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def onu_config_service_port_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Service Port - select working ONU"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['service_port_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'show_svc_port_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"📋 *Show Service Port*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to view service port config:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in service port menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def show_onu_service_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Display service port configuration for selected ONU"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('service_port_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            await query.edit_message_text("⏳ Fetching service port configuration...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = pon_port_clean.split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{selected_onu['onu_id']}"
            
            success, result = onu_mgr.show_service_port(onu_id_full)
            
            if success:
                output = result.get('output', '')
                services = result.get('services', [])
                
                # Format output untuk Telegram
                service_info = []
                for line in output.split('\n'):
                    line = line.strip()
                    if any(keyword in line.lower() for keyword in ['tcont', 'gemport', 'service-port', 'vlan', 'traffic']):
                        service_info.append(line)
                
                if service_info:
                    config_text = '\n'.join(service_info[:20])  # Limit to 20 lines
                    result_text = (
                        f"📋 *Service Port Configuration*\n\n"
                        f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                        f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                        f"```\n{config_text}\n```\n\n"
                        f"Found {len(services)} service entries"
                    )
                else:
                    result_text = (
                        f"📋 *Service Port Configuration*\n\n"
                        f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n\n"
                        f"ℹ️ No service port configuration found"
                    )
            else:
                result_text = f"❌ Failed to fetch service port:\n\n{result.get('output', 'Unknown error')}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to List", callback_data='cfg_service_port')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing service port: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def onu_config_remote_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Remote ONU Management menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔄 Restart ONU", callback_data='remote_restart')],
            [InlineKeyboardButton("🏭 Factory Reset ONU", callback_data='remote_factory_reset')],
            [InlineKeyboardButton("📊 ONU Details", callback_data='remote_details')],
            [InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]
        ]
        
        await query.edit_message_text(
            "🔧 *Remote ONU Management*\n\n"
            "Available operations:\n\n"
            "1️⃣ Restart ONU - Reboot selected ONU\n"
            "2️⃣ Factory Reset - Reset ONU to default\n"
            "3️⃣ ONU Details - View detailed info\n\n"
            "💡 Use with caution - operations affect active ONU",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def remote_restart_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for restart"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['remote_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'restart_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"🔄 *Restart ONU*\n\n"
                f"⚠️ *Warning: This will reboot the ONU*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to restart:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in restart menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def remote_factory_reset_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for factory reset"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['remote_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'factory_reset_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"🏭 *Factory Reset ONU*\n\n"
                f"⚠️ *DANGER: This will erase all ONU settings!*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to factory reset:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in factory reset menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def remote_details_select_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Select PON port for ONU details"""
        query = update.callback_query
        
        try:
            # Show PON port selection (1-16)
            keyboard = []
            row = []
            for port in range(1, 17):
                row.append(InlineKeyboardButton(f"PON {port}", callback_data=f'details_port_{port}'))
                if len(row) == 4:  # 4 buttons per row
                    keyboard.append(row)
                    row = []
            if row:  # Add remaining buttons
                keyboard.append(row)
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                "📊 *ONU Details*\n\n"
                "Select PON port to view ONUs:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in details port selection: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def remote_details_onu_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for selected PON port"""
        query = update.callback_query
        
        try:
            port = int(query.data.split('_')[-1])
            await query.edit_message_text(f"⏳ Fetching ONUs on PON port {port}...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            # Fetch only ONUs on selected port
            all_onus = wizard.fetch_all_working_onus()
            port_onus = [onu for onu in all_onus if onu.get('port') == str(port) and onu.get('status', '').lower() == 'working']
            
            if not port_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='remote_details')]]
                await query.edit_message_text(
                    f"❌ No working ONUs found on PON port {port}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['details_port'] = port
            context.user_data['port_onus'] = port_onus
            
            keyboard = []
            for i, onu in enumerate(port_onus[:15], 1):  # Show max 15 ONUs
                name = onu.get('name', '-')[:25]
                label = f"{i}. ID {onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'details_onu_{i-1}')])
            
            if len(port_onus) > 15:
                keyboard.append([InlineKeyboardButton(f"... and {len(port_onus)-15} more ONUs", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back to PON Selection", callback_data='remote_details')])
            
            await query.edit_message_text(
                f"📊 *ONU Details - PON Port {port}*\n\n"
                f"📊 Total Working ONUs: {len(port_onus)}\n\n"
                f"Select ONU to view details:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in details ONU list: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def remote_details_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU list for details - DEPRECATED, replaced by port selection"""
        query = update.callback_query
        
        try:
            await query.edit_message_text("⏳ Fetching working ONU list...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            working_onus = [onu for onu in working_onus if onu.get('status', '').lower() == 'working']
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='onu_configure')]]
                await query.edit_message_text(
                    "❌ No working ONUs found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            context.user_data['remote_onus'] = working_onus
            
            keyboard = []
            for i, onu in enumerate(working_onus[:10], 1):
                name = onu.get('name', '-')[:20]
                pon_port_display = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                label = f"{i}. {pon_port_display}:{onu['onu_id']} - {name}"
                keyboard.append([InlineKeyboardButton(label, callback_data=f'details_onu_{i-1}')])
            
            if len(working_onus) > 10:
                keyboard.append([InlineKeyboardButton(f"... and {len(working_onus)-10} more", callback_data='noop')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='onu_configure')])
            
            await query.edit_message_text(
                f"📊 *ONU Details*\n\n"
                f"📊 Total Working ONUs: {len(working_onus)}\n\n"
                f"Select ONU to view details:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error in details menu: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def execute_restart_onu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute ONU restart"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('remote_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            await query.edit_message_text(
                f"⏳ Restarting ONU...\n\n"
                f"📍 {pon_port_clean}:{selected_onu['onu_id']}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = pon_port_clean.split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{selected_onu['onu_id']}"
            
            success, msg = onu_mgr.reboot_onu(onu_id_full)
            
            if success:
                result_text = (
                    f"✅ *ONU Restart Command Sent*\n\n"
                    f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                    f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                    f"The ONU is rebooting...\n"
                    f"Please wait ~30-60 seconds for it to come back online."
                )
            else:
                result_text = f"❌ *Restart Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error restarting ONU: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def execute_factory_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute ONU factory reset"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            working_onus = context.user_data.get('remote_onus', [])
            
            if onu_idx >= len(working_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = working_onus[onu_idx]
            pon_port_clean = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            
            await query.edit_message_text(
                f"⏳ Factory resetting ONU...\n\n"
                f"📍 {pon_port_clean}:{selected_onu['onu_id']}"
            )
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.onu_config_manager import ONUConfigManager
            onu_mgr = ONUConfigManager(client)
            
            parts = pon_port_clean.split('/')
            onu_id_full = f"{parts[0]}/1/{parts[2]}:{selected_onu['onu_id']}"
            
            success, msg = onu_mgr.factory_reset_onu(onu_id_full)
            
            if success:
                result_text = (
                    f"✅ *Factory Reset Command Sent*\n\n"
                    f"📍 ONU: `{pon_port_clean}:{selected_onu['onu_id']}`\n"
                    f"📝 Name: {selected_onu.get('name', 'N/A')}\n\n"
                    f"⚠️ ONU has been reset to factory defaults\n"
                    f"All configuration has been erased."
                )
            else:
                result_text = f"❌ *Factory Reset Failed*\n\n{self.escape_markdown(msg)}"
            
            keyboard = [
                [InlineKeyboardButton("🔙 ONU Config Menu", callback_data='onu_configure')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error factory resetting ONU: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def show_onu_details(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show detailed ONU information with all available data"""
        query = update.callback_query
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            port_onus = context.user_data.get('port_onus', [])
            port = context.user_data.get('details_port', 1)
            
            if onu_idx >= len(port_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = port_onus[onu_idx]
            onu_id = selected_onu['onu_id']
            
            await query.edit_message_text("⏳ Fetching complete ONU details...")
            
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            import re
            
            # Initialize all variables
            rx_power = tx_power = attenuation = distance = '-'
            onu_type = vendor = equipment_id = firmware = mac_address = '-'
            admin_state = config_state = omcc_state = match_state = '-'
            uptime = online_duration = last_register = last_down_cause = dereg_reason = '-'
            last_up_time = last_down_time = '-'
            temperature = voltage = '-'
            service_ports = vlan_config = security_state = wifi_state = '-'
            rx_bytes = tx_bytes = rx_packets = tx_packets = '-'
            rx_errors = tx_errors = rx_drops = tx_drops = '-'
            
            # Get basic ONU info from selected_onu
            sn = selected_onu.get('sn', 'N/A')
            status = selected_onu.get('status', 'N/A')
            name = selected_onu.get('name', 'N/A')
            phase = selected_onu.get('phase_state', 'N/A')
            
            try:
                # 1. Get optical power and distance
                power_cmd = f"show pon power attenuation gpon-onu_1/1/{port}:{onu_id}"
                success, power_output = client.execute_command(power_cmd)
                
                if success:
                    rx_match = re.search(r'up\s+Rx\s*:\s*([-\d.]+)\s*\(dbm\)', power_output, re.IGNORECASE)
                    if rx_match:
                        rx_power = rx_match.group(1)
                    
                    tx_match = re.search(r'up\s+Tx\s*:\s*([-\d.]+)\s*\(dbm\)', power_output, re.IGNORECASE)
                    if tx_match:
                        tx_power = tx_match.group(1)
                    
                    if rx_power != '-' and tx_power != '-':
                        try:
                            atten_val = float(tx_power) - float(rx_power)
                            attenuation = f"{atten_val:.2f}"
                        except:
                            pass
                    
                    dist_match = re.search(r'Distance\s*:\s*([-\d.]+)\s*\(m\)', power_output, re.IGNORECASE)
                    if dist_match:
                        distance = dist_match.group(1)
                
                # 2. Get detailed ONU info
                detail_cmd = f"show gpon onu detail-info gpon-onu_1/1/{port}:{onu_id}"
                success, detail_output = client.execute_command(detail_cmd)
                
                if success:
                    # Parse device information
                    type_match = re.search(r'ONU\s+Type\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if type_match:
                        onu_type = type_match.group(1).strip()
                    
                    vendor_match = re.search(r'Vendor\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if vendor_match:
                        vendor = vendor_match.group(1).strip()
                    
                    equip_match = re.search(r'Equipment\s*[Ii][Dd]\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if equip_match:
                        equipment_id = equip_match.group(1).strip()
                    
                    fw_match = re.search(r'(?:Firmware|Software)\s*[Vv]ersion\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if fw_match:
                        firmware = fw_match.group(1).strip()
                    
                    # Parse connection states
                    admin_match = re.search(r'Admin\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if admin_match:
                        admin_state = admin_match.group(1).strip()
                    
                    cfg_match = re.search(r'Config\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if cfg_match:
                        config_state = cfg_match.group(1).strip()
                    
                    omcc_match = re.search(r'OMCC\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if omcc_match:
                        omcc_state = omcc_match.group(1).strip()
                    
                    match_match = re.search(r'Match\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if match_match:
                        match_state = match_match.group(1).strip()
                    
                    # Parse uptime and online duration
                    uptime_match = re.search(r'(?:Online|Up)\s*[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if uptime_match:
                        uptime = uptime_match.group(1).strip()
                    
                    online_duration_match = re.search(r'(?:Online|System)\s+[Dd]uration\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if online_duration_match:
                        online_duration = online_duration_match.group(1).strip()
                    elif uptime != '-':
                        online_duration = uptime  # Use uptime as online duration if not found separately
                    
                    # Parse last up time
                    last_up_match = re.search(r'Last\s+[Uu]p\s+[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if last_up_match:
                        last_up_time = last_up_match.group(1).strip()
                    
                    # Parse last down time
                    last_down_time_match = re.search(r'Last\s+[Dd]own\s+[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if last_down_time_match:
                        last_down_time = last_down_time_match.group(1).strip()
                    
                    reg_match = re.search(r'Last\s+(?:Register|Registration)\s*[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if reg_match:
                        last_register = reg_match.group(1).strip()
                    
                    # Parse last down cause
                    down_match = re.search(r'Last\s+(?:Down|Dereg)\s+Cause\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if down_match:
                        last_down_cause = down_match.group(1).strip()
                    
                    dereg_match = re.search(r'Deregister\s+Reason\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if dereg_match:
                        dereg_reason = dereg_match.group(1).strip()
                    
                    # Parse temperature and voltage
                    temp_match = re.search(r'Temperature\s*:\s*([-\d.]+)', detail_output, re.IGNORECASE)
                    if temp_match:
                        temperature = f"{temp_match.group(1)}°C"
                    
                    volt_match = re.search(r'Voltage\s*:\s*([-\d.]+)', detail_output, re.IGNORECASE)
                    if volt_match:
                        voltage = f"{volt_match.group(1)}V"
                
                # 3. Get service port info
                try:
                    sp_cmd = f"show gpon remote-onu interface gpon-onu_1/1/{port}:{onu_id} service-port"
                    success, sp_output = client.execute_command(sp_cmd)
                    if success:
                        sp_count = len(re.findall(r'service-port\s+\d+', sp_output, re.IGNORECASE))
                        if sp_count > 0:
                            service_ports = f"{sp_count} configured"
                            # Parse VLAN from service port
                            vlan_matches = re.findall(r'vlan\s+(\d+)', sp_output, re.IGNORECASE)
                            if vlan_matches:
                                vlan_config = ', '.join(set(vlan_matches))
                except:
                    pass
                
                # 4. Get traffic statistics (if available)
                try:
                    stats_cmd = f"show gpon onu statistics gpon-onu_1/1/{port}:{onu_id}"
                    success, stats_output = client.execute_command(stats_cmd)
                    
                    if success:
                        rx_bytes_match = re.search(r'(?:Rx|Receive)\s+Bytes\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if rx_bytes_match:
                            rx_bytes = rx_bytes_match.group(1).replace(',', '')
                        
                        tx_bytes_match = re.search(r'(?:Tx|Transmit)\s+Bytes\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if tx_bytes_match:
                            tx_bytes = tx_bytes_match.group(1).replace(',', '')
                        
                        rx_pkts_match = re.search(r'(?:Rx|Receive)\s+Packets\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if rx_pkts_match:
                            rx_packets = rx_pkts_match.group(1).replace(',', '')
                        
                        tx_pkts_match = re.search(r'(?:Tx|Transmit)\s+Packets\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if tx_pkts_match:
                            tx_packets = tx_pkts_match.group(1).replace(',', '')
                        
                        rx_err_match = re.search(r'(?:Rx|Receive)\s+Errors\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if rx_err_match:
                            rx_errors = rx_err_match.group(1).replace(',', '')
                        
                        tx_err_match = re.search(r'(?:Tx|Transmit)\s+Errors\s*:\s*([\d,]+)', stats_output, re.IGNORECASE)
                        if tx_err_match:
                            tx_errors = tx_err_match.group(1).replace(',', '')
                except:
                    pass
                
            except Exception as e:
                logger.error(f"Error fetching ONU details: {e}")
            
            # Build comprehensive detailed info
            result_text = f"📊 *Complete ONU Details*\n\n"
            
            # Basic Info
            result_text += f"*📍 Location & Identity:*\n"
            result_text += f"PON: `1/1/{port}:{onu_id}`\n"
            result_text += f"📝 Name: {name}\n"
            result_text += f"🆔 SN: {sn}\n"
            result_text += f"📶 Status: {status}\n"
            result_text += f"⚙️ Phase: {phase}\n\n"
            
            # Device Information
            result_text += f"*🔧 Device Information:*\n"
            result_text += f"Model: {onu_type}\n"
            result_text += f"Vendor: {vendor}\n"
            if equipment_id != '-':
                result_text += f"Equip ID: {equipment_id}\n"
            if firmware != '-':
                result_text += f"Firmware: {firmware}\n"
            result_text += "\n"
            
            # Connection State
            result_text += f"*🔌 Connection State:*\n"
            if admin_state != '-':
                result_text += f"Admin: {admin_state}\n"
            if config_state != '-':
                result_text += f"Config: {config_state}\n"
            if omcc_state != '-':
                result_text += f"OMCC: {omcc_state}\n"
            if match_state != '-':
                result_text += f"Match: {match_state}\n"
            result_text += f"⏱️ Online Duration: {online_duration}\n"
            result_text += f"🟢 Last Up Time: {last_up_time}\n"
            result_text += f"🔴 Last Down Time: {last_down_time}\n"
            if last_down_cause != '-':
                result_text += f"📉 Last Down: {last_down_cause}\n"
            result_text += "\n"
            
            # Optical Power
            result_text += f"*📡 Optical Power:*\n"
            result_text += f"Rx: {rx_power} dBm\n"
            result_text += f"Tx: {tx_power} dBm\n"
            result_text += f"Loss: {attenuation} dB\n"
            result_text += f"📏 Distance: {distance} m\n"
            
            # Signal quality
            if attenuation != '-':
                try:
                    atten_val = float(attenuation)
                    if atten_val < 20:
                        result_text += "✅ Quality: Excellent\n"
                    elif atten_val < 25:
                        result_text += "⚠️ Quality: Good\n"
                    elif atten_val < 28:
                        result_text += "⚠️ Quality: Fair\n"
                    else:
                        result_text += "❌ Quality: Poor\n"
                except:
                    pass
            result_text += "\n"
            
            # Performance
            if temperature != '-' or voltage != '-' or last_down_cause != '-':
                result_text += f"*⚡ Performance:*\n"
                if temperature != '-':
                    result_text += f"🌡️ Temp: {temperature}\n"
                if voltage != '-':
                    result_text += f"⚡ Voltage: {voltage}\n"
                if last_down_cause != '-':
                    result_text += f"📉 Last Down: {last_down_cause}\n"
                result_text += "\n"
            
            # Service Info
            if service_ports != '-' or vlan_config != '-':
                result_text += f"*🌐 Service Info:*\n"
                if service_ports != '-':
                    result_text += f"📊 Service Ports: {service_ports}\n"
                if vlan_config != '-':
                    result_text += f"🔖 VLANs: {vlan_config}\n"
                result_text += "\n"
            
            # Traffic Stats (if available)
            if rx_bytes != '-' or tx_bytes != '-':
                result_text += f"*📈 Traffic Stats:*\n"
                if rx_bytes != '-':
                    try:
                        rx_mb = float(rx_bytes) / (1024*1024)
                        result_text += f"⬇️ RX: {rx_mb:.2f} MB"
                        if rx_packets != '-':
                            result_text += f" ({rx_packets} pkts)"
                        result_text += "\n"
                    except:
                        result_text += f"⬇️ RX: {rx_bytes} bytes\n"
                
                if tx_bytes != '-':
                    try:
                        tx_mb = float(tx_bytes) / (1024*1024)
                        result_text += f"⬆️ TX: {tx_mb:.2f} MB"
                        if tx_packets != '-':
                            result_text += f" ({tx_packets} pkts)"
                        result_text += "\n"
                    except:
                        result_text += f"⬆️ TX: {tx_bytes} bytes\n"
                
                if rx_errors != '-' and int(rx_errors) > 0:
                    result_text += f"❌ Errors: RX {rx_errors}"
                    if tx_errors != '-':
                        result_text += f", TX {tx_errors}"
                    result_text += "\n"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to ONU List", callback_data=f'details_port_{port}')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing ONU details: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
    
    async def cancel_cfg(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Cancel ONU configuration conversation"""
        query = update.callback_query
        context.user_data.clear()
        await self.onu_config_menu(update, context)
        return ConversationHandler.END
    
    async def omci_auto_provision_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Auto-Provision Management menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔍 Show Unconfigured ONU", callback_data='menu_1')],
            [InlineKeyboardButton("➕ Register from Uncfg List", callback_data='menu_2')],
            [InlineKeyboardButton("📋 Show Working ONU", callback_data='onu_list')],
            [InlineKeyboardButton("⚙️ Auto-Provision ONU", callback_data='omci_auto_provision_onu')],
            [InlineKeyboardButton("📋 Show Auto-Learning Status", callback_data='omci_auto_learning_status')],
            [InlineKeyboardButton("🔙 Back", callback_data='onu_omci')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "🔄 *Auto-Provision Management*\n\n"
            "📋 *Concept:*\n"
            "✔ Discovery: ONU detected in unconfigured list\n"
            "✔ Register: Manual - select from uncfg list\n"
            "✔ Provision: Configure profiles for working ONUs\n\n"
            "⚠️ *Auto-Learning ZTE C320:*\n"
            "If enabled, ALL uncfg ONUs auto-register.\n"
            "Recommended: Keep DISABLED for manual control.\n\n"
            "*Available Options:*\n"
            "1️⃣ Show ONU Unconfigured\n"
            "2️⃣ Register ONU → Register Wizard\n"
            "3️⃣ Show ONU Working\n"
            "4️⃣ Auto-Provision ONU (individual)\n"
            "5️⃣ Show Auto-Learning Status\n\n"
            "💡 For bulk operations, use CLI"
        )
        
        await query.edit_message_text(
            text,
            parse_mode='Markdown',
            reply_markup=reply_markup
        )
    
    async def omci_auto_provision_onu_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show working ONU list for individual provisioning"""
        query = update.callback_query
        
        try:
            await query.edit_message_text(
                "⏳ Fetching working ONU list...",
                parse_mode='Markdown'
            )
            
            # Get working ONU list
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            register_wizard = ONURegistrationWizard(client)
            working_onus = register_wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
                await query.edit_message_text(
                    "❌ No working ONU found for provisioning.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Store in context
            context.user_data['provision_onus'] = working_onus
            
            # Build message with ONU list (max 10)
            text = "⚙️ *Auto-Provision ONU*\n\n"
            text += "📋 *Select ONU to provision:*\n"
            text += f"Found {len(working_onus)} working ONU(s)\n\n"
            
            display_onus = working_onus[:10]
            for i, onu in enumerate(display_onus):
                port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id = onu.get('onu_id', '?')
                onu_type = onu.get('type', 'N/A')[:16]
                sn = onu.get('sn', 'N/A')
                name = onu.get('name', 'N/A')[:12]
                
                # Mark ONU that might need config (universalOnuType)
                marker = "⚠️" if 'universal' in onu_type.lower() else "✅"
                
                text += f"{marker} `{port}:{onu_id}` | {onu_type}\n"
                text += f"   SN: {sn} | Name: {name}\n\n"
            
            if len(working_onus) > 10:
                text += f"... and {len(working_onus)-10} more ONU(s)\n\n"
            
            text += "⚠️ = May need configuration\n"
            text += "✅ = Already configured\n\n"
            text += "💡 Tap ONU to provision"
            
            # Build keyboard
            keyboard = []
            for i, onu in enumerate(display_onus):
                port = onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
                onu_id = onu.get('onu_id', '?')
                marker = "⚠️" if 'universal' in onu.get('type', '').lower() else "✅"
                
                button_text = f"{marker} {port}:{onu_id}"
                keyboard.append([InlineKeyboardButton(button_text, callback_data=f'provision_onu_{i}')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='omci_auto')])
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error fetching ONU list for provision: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def omci_provision_onu_detail(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show provision options for selected ONU"""
        query = update.callback_query
        
        try:
            await query.answer()
            
            # Get selected ONU
            callback_data = query.data
            idx = int(callback_data.split('_')[-1])
            
            provision_onus = context.user_data.get('provision_onus', [])
            if idx >= len(provision_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = provision_onus[idx]
            port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = selected_onu.get('onu_id', '?')
            onu_type = selected_onu.get('type', 'N/A')
            sn = selected_onu.get('sn', 'N/A')
            name = selected_onu.get('name', 'N/A')
            
            text = f"⚙️ *PROVISION ONU - {port}:{onu_id}*\n\n"
            text += "═" * 35 + "\n"
            text += f"*Details:*\n"
            text += f"• Type: `{onu_type}`\n"
            text += f"• SN: `{sn}`\n"
            text += f"• Name: `{name}`\n"
            text += "═" * 35 + "\n\n"
            
            text += "*Provision Options:*\n\n"
            text += "1️⃣ *Configure VLAN*\n"
            text += "   Set VLAN for ONU port\n\n"
            text += "2️⃣ *Re-Apply Config*\n"
            text += "   Re-apply saved OLT config\n\n"
            text += "3️⃣ *View Current Config*\n"
            text += "   Show ONU running config\n\n"
            text += "💡 *Note:* Complex configuration\n"
            text += "recommended via CLI for full control.\n\n"
            text += "Use CLI Menu:\n"
            text += "`OMCI Config → Auto-Provision ONU`"
            
            keyboard = [
                [InlineKeyboardButton("1️⃣ Configure VLAN", callback_data=f'provision_vlan_{idx}')],
                [InlineKeyboardButton("2️⃣ Re-Apply Config", callback_data=f'provision_reapply_{idx}')],
                [InlineKeyboardButton("3️⃣ View Config", callback_data=f'provision_view_{idx}')],
                [InlineKeyboardButton("🔙 Back to List", callback_data='omci_auto_provision_onu')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='main_menu')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error showing provision detail: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto_provision_onu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def omci_show_auto_learning_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show auto-learning status per PON port"""
        query = update.callback_query
        
        try:
            await query.answer()
            await query.edit_message_text(
                "⏳ Checking auto-learning status...",
                parse_mode='Markdown'
            )
            
            # Get working ONU list to know which ports have ONUs
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            register_wizard = ONURegistrationWizard(client)
            working_onus = register_wizard.fetch_all_working_onus()
            
            if not working_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
                await query.edit_message_text(
                    "❌ No registered ONU found to check auto-learning status.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Get unique PON ports
            pon_ports = {}
            for onu in working_onus:
                port = onu['pon_port']
                if port not in pon_ports:
                    pon_ports[port] = []
                pon_ports[port].append(onu)
            
            # Build status message
            text = "📋 *Auto-Learning Status*\n\n"
            text += "Checking auto-learning per PON port...\n\n"
            text += "```\n"
            text += f"{'PON Port':<12} {'Status':<18} {'ONUs'}\n"
            text += "─" * 40 + "\n"
            
            # client already obtained above
            
            for port in sorted(pon_ports.keys()):
                port_clean = port.replace('gpon-olt_', '').replace('gpon_olt_', '')
                
                # Check auto-learning status
                cmd = f"show running-config interface gpon-olt_{port_clean}"
                success, config_output = client.execute_command(cmd, timeout=10)
                
                if success and config_output:
                    if 'auto-learning enable' in config_output.lower():
                        status = "⚠ ENABLED"
                    else:
                        status = "✓ DISABLED"
                else:
                    status = "? UNKNOWN"
                
                onu_count = len(pon_ports[port])
                text += f"{port_clean:<12} {status:<18} {onu_count}\n"
            
            text += "```\n\n"
            text += "*Legend:*\n"
            text += "✅ *DISABLED* (manual): Safe mode\n"
            text += "   ONUs must be registered manually\n\n"
            text += "⚠️ *ENABLED*: Auto-register mode\n"
            text += "   ALL uncfg ONUs register automatically\n\n"
            text += "*Recommendation:*\n"
            text += "Keep auto-learning DISABLED for:\n"
            text += "• Manual control over registration\n"
            text += "• Prevent unauthorized ONU access\n"
            text += "• Better network security\n\n"
            text += "💡 To register ONU manually:\n"
            text += "`Main Menu → Register ONU Wizard`"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='omci_auto_learning_status')],
                [InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]
            ]
            
            # Truncate if too long
            if len(text) > 4000:
                text = text[:3900] + "\n\n... (truncated)\n\n"
                text += "💡 Use CLI for full details"
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error showing auto-learning status: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def omci_provision_view_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """View current config for selected ONU"""
        query = update.callback_query
        
        try:
            await query.answer()
            
            # Get selected ONU
            callback_data = query.data
            idx = int(callback_data.split('_')[-1])
            
            provision_onus = context.user_data.get('provision_onus', [])
            if idx >= len(provision_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = provision_onus[idx]
            port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = selected_onu.get('onu_id', '?')
            
            await query.edit_message_text(
                f"⏳ Fetching config for ONU {port}:{onu_id}...",
                parse_mode='Markdown'
            )
            
            # Get ONU running config
            onu_id_full = f"1/1/{port.split('/')[0]}:{onu_id}"
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            success, output = client.execute_command(
                f"show running-config interface gpon-onu_{onu_id_full}", 
                timeout=10
            )
            
            if not success or not output:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    f"❌ Failed to fetch config for ONU {port}:{onu_id}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Format output
            text = f"⚙️ *ONU Config - {port}:{onu_id}*\n\n"
            text += f"```\n{output}\n```"
            
            # Truncate if too long
            if len(text) > 4000:
                text = text[:3900] + "\n```\n\n... (truncated)\n\n"
                text += "💡 Use CLI for full config"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='main_menu')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error viewing ONU config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto_provision_onu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def omci_provision_vlan_placeholder(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Placeholder for VLAN configuration (needs conversation handler)"""
        query = update.callback_query
        
        try:
            await query.answer()
            
            callback_data = query.data
            idx = int(callback_data.split('_')[-1])
            
            provision_onus = context.user_data.get('provision_onus', [])
            if idx >= len(provision_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = provision_onus[idx]
            port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = selected_onu.get('onu_id', '?')
            
            text = f"⚙️ *Configure VLAN - {port}:{onu_id}*\n\n"
            text += "⚠️ *Complex Configuration Required*\n\n"
            text += "VLAN configuration requires:\n"
            text += "• VLAN ID (e.g., 100)\n"
            text += "• Port (eth_0/1 - eth_0/4)\n"
            text += "• Mode (tag/transparent)\n\n"
            text += "💡 *Recommendation:* Use CLI for VLAN config\n\n"
            text += "CLI Menu:\n"
            text += "`OMCI Config → Set LAN Port Binding`\n\n"
            text += "Or use ONU Config Manager:\n"
            text += "`ONU Management → Configure Existing ONU`"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='main_menu')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in VLAN placeholder: {e}")
    
    async def omci_provision_reapply_placeholder(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Re-apply saved config from OLT to ONU"""
        query = update.callback_query
        
        try:
            await query.answer()
            
            callback_data = query.data
            idx = int(callback_data.split('_')[-1])
            
            provision_onus = context.user_data.get('provision_onus', [])
            if idx >= len(provision_onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            selected_onu = provision_onus[idx]
            port = selected_onu['pon_port'].replace('gpon-olt_', '').replace('gpon_olt_', '')
            onu_id = selected_onu.get('onu_id', '?')
            
            # Show progress
            await query.edit_message_text(
                f"⏳ Reading config from OLT for {port}:{onu_id}...",
                parse_mode='Markdown'
            )
            
            # Get client
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            onu_id_full = f"1/1/{port.split('/')[0]}:{onu_id}"
            
            # 1. Read config from OLT
            success1, onu_config = client.execute_command(
                f"show running-config interface gpon-onu_{onu_id_full}", 
                timeout=10
            )
            
            success2, mng_config = client.execute_command(
                f"show pon-onu-mng gpon-onu_{onu_id_full}", 
                timeout=10
            )
            
            if not success1 and not success2:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    f"❌ Failed to read config from OLT for {port}:{onu_id}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Parse interface gpon-onu config
            onu_commands = []
            if success1 and onu_config:
                in_interface = False
                for line in onu_config.split('\n'):
                    line = line.strip()
                    if line.startswith('interface gpon-onu'):
                        in_interface = True
                        continue
                    elif line.startswith('!') or line.startswith('end'):
                        in_interface = False
                        continue
                    
                    if in_interface and line and not line.startswith('#'):
                        # Skip sn and type-xxx (already set during register)
                        if not line.startswith('sn') and not line.startswith('type-'):
                            onu_commands.append(line)
            
            # Parse pon-onu-mng config
            mng_commands = []
            if success2 and mng_config:
                in_mng = False
                for line in mng_config.split('\n'):
                    line = line.strip()
                    if 'pon-onu-mng' in line:
                        in_mng = True
                        continue
                    elif line.startswith('!') or line.startswith('end') or not line:
                        continue
                    
                    if in_mng and line and not line.startswith('#'):
                        mng_commands.append(line)
            
            total_commands = len(onu_commands) + len(mng_commands)
            
            if total_commands == 0:
                text = f"⚠️ *No Additional Config Found*\n\n"
                text += f"ONU: `{port}:{onu_id}`\n\n"
                text += "No additional config stored in OLT.\n"
                text += "This ONU may not have been configured yet.\n\n"
                text += "💡 Use VLAN/Profile configuration first."
                
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    text,
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Show config preview and confirm
            text = f"🔄 *Re-Apply Config - {port}:{onu_id}*\n\n"
            text += f"✅ Found {total_commands} config commands:\n\n"
            
            if onu_commands:
                text += f"*Interface gpon-onu* ({len(onu_commands)} cmd):\n"
                for cmd in onu_commands[:3]:
                    text += f"• `{cmd[:40]}`\n"
                if len(onu_commands) > 3:
                    text += f"... and {len(onu_commands)-3} more\n"
                text += "\n"
            
            if mng_commands:
                text += f"*PON-ONU-MNG* ({len(mng_commands)} cmd):\n"
                for cmd in mng_commands[:3]:
                    text += f"• `{cmd[:40]}`\n"
                if len(mng_commands) > 3:
                    text += f"... and {len(mng_commands)-3} more\n"
                text += "\n"
            
            text += "⚠️ This will re-apply all config to ONU.\n"
            text += "Useful for ONU that was reset.\n\n"
            text += "📋 Confirm to proceed?"
            
            # Store data for confirmation
            context.user_data['reapply_data'] = {
                'idx': idx,
                'port': port,
                'onu_id': onu_id,
                'onu_id_full': onu_id_full,
                'onu_commands': onu_commands,
                'mng_commands': mng_commands
            }
            
            keyboard = [
                [InlineKeyboardButton("✅ Confirm Re-Apply", callback_data=f'reapply_confirm_{idx}')],
                [InlineKeyboardButton("🔙 Cancel", callback_data=f'provision_onu_{idx}')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in reapply config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto_provision_onu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def omci_provision_reapply_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute re-apply config to ONU"""
        query = update.callback_query
        
        try:
            await query.answer()
            
            # Get stored data
            reapply_data = context.user_data.get('reapply_data')
            if not reapply_data:
                await query.edit_message_text("❌ Session expired. Please try again.")
                return
            
            idx = reapply_data['idx']
            port = reapply_data['port']
            onu_id = reapply_data['onu_id']
            onu_id_full = reapply_data['onu_id_full']
            onu_commands = reapply_data['onu_commands']
            mng_commands = reapply_data['mng_commands']
            
            # Show progress
            await query.edit_message_text(
                f"⏳ Re-applying config to ONU {port}:{onu_id}...\n\n"
                f"Please wait, this may take a moment.",
                parse_mode='Markdown'
            )
            
            # Get client
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'provision_onu_{idx}')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            success_count = 0
            failed_count = 0
            failed_commands = []
            
            # Apply interface gpon-onu commands
            if onu_commands:
                client.execute_command("configure terminal", timeout=3)
                client.execute_command(f"interface gpon-onu_{onu_id_full}", timeout=3)
                
                for cmd in onu_commands:
                    success, output = client.execute_command(cmd, timeout=5)
                    if success and '%error' not in output.lower():
                        success_count += 1
                    else:
                        failed_count += 1
                        failed_commands.append(cmd[:40])
                
                client.execute_command("exit", timeout=2)
                client.execute_command("exit", timeout=2)
            
            # Apply pon-onu-mng commands
            if mng_commands:
                client.execute_command("configure terminal", timeout=3)
                client.execute_command(f"pon-onu-mng gpon-onu_{onu_id_full}", timeout=3)
                
                for cmd in mng_commands:
                    success, output = client.execute_command(cmd, timeout=5)
                    if success and '%error' not in output.lower():
                        success_count += 1
                    else:
                        failed_count += 1
                        failed_commands.append(cmd[:40])
                
                client.execute_command("exit", timeout=2)
                client.execute_command("exit", timeout=2)
            
            # Save config
            client.execute_command("write", timeout=10)
            
            # Build result message
            text = f"✅ *Re-Apply Config Complete*\n\n"
            text += f"ONU: `{port}:{onu_id}`\n\n"
            text += f"*Results:*\n"
            text += f"✅ Success: {success_count} commands\n"
            text += f"❌ Failed: {failed_count} commands\n\n"
            
            if success_count > 0:
                text += "✅ Config has been re-applied to ONU.\n"
                text += "ONU will receive config from OLT.\n\n"
            
            if failed_count > 0:
                text += f"⚠️ Some commands failed:\n"
                for cmd in failed_commands[:3]:
                    text += f"• `{cmd}`\n"
                if len(failed_commands) > 3:
                    text += f"... and {len(failed_commands)-3} more\n"
                text += "\n"
            
            if success_count == 0:
                text += "⚠️ Re-apply failed. Check ONU connection."
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to ONU", callback_data=f'provision_onu_{idx}')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='main_menu')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
            # Clear stored data
            if 'reapply_data' in context.user_data:
                del context.user_data['reapply_data']
            
        except Exception as e:
            logger.error(f"Error executing reapply: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='omci_auto_provision_onu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # End of OMCI workflows
    
    async def show_uplink(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show uplink interfaces"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("🔗 Fetching uplink interfaces...")
            
            result = config_mgr.show_uplink_interfaces()
            
            # Escape special characters for Markdown
            safe_result = result.replace('_', '\\_').replace('*', '\\*').replace('`', '\\`')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='uplink_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]
            ]
            
            response = "🔗 *Uplink Interfaces*\n\n"
            response += f"```\n{safe_result}\n```"
            
            await query.edit_message_text(
                response,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing uplink: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_vlan_config_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show uplink VLAN configuration wizard - display interface list"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⏳ Fetching uplink interfaces...")
            
            # Get uplink interfaces list
            interfaces = config_mgr.get_uplink_interfaces_list()
            
            if not interfaces:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ No uplink interfaces found",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Build interface list with buttons
            keyboard = []
            for iface in interfaces:
                # Show interface config status
                config = config_mgr.show_uplink_config(iface)
                status = "✅" if "switchport" in config else "⚠️"
                # Button text does NOT need escape (no Markdown in buttons)
                keyboard.append([InlineKeyboardButton(
                    f"{status} {iface}",
                    callback_data=f'uplink_cfg_if_{iface}'
                )])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')])
            
            await query.edit_message_text(
                "⚙️ *Configure VLAN on Uplink*\n\n"
                "Step 1: Select uplink interface:\n"
                "✅ = Has VLAN config\n"
                "⚠️ = No VLAN config\n\n"
                "After selecting:\n"
                "→ Step 2: Select VLAN ID\n"
                "→ Step 3: Select Mode (Trunk/Access)",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing uplink VLAN config menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_status_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show interface status selection menu"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⏳ Fetching interfaces...")
            
            interfaces = config_mgr.get_uplink_interfaces_list()
            
            keyboard = [
                [InlineKeyboardButton("📊 All Interfaces (Brief)", callback_data='uplink_stat_if_all')]
            ]
            
            for iface in interfaces[:10]:
                keyboard.append([InlineKeyboardButton(
                    f"📊 {iface}",
                    callback_data=f'uplink_stat_if_{iface}'
                )])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')])
            
            await query.edit_message_text(
                "📊 *Interface Status*\n\n"
                "Select interface to view status:\n"
                "• Speed, Duplex\n"
                "• Up/Down status\n"
                "• Packet counters",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing status menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_interface_status_detail(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show detailed interface status"""
        query = update.callback_query
        callback_data = query.data
        interface = callback_data.replace('uplink_stat_if_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_status')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text(f"⏳ Fetching status for {interface}...")
            
            if interface == 'all':
                result = config_mgr.show_interface_status(None)
                title = "All Interfaces"
            else:
                result = config_mgr.show_interface_status(interface)
                title = interface
            
            # Escape special characters
            safe_result = result.replace('_', '\\_').replace('*', '\\*').replace('`', '\\`')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data=f'uplink_stat_if_{interface}')],
                [InlineKeyboardButton("🔙 Back", callback_data='uplink_status')]
            ]
            
            await query.edit_message_text(
                f"📊 *Interface Status: {title}*\n\n"
                f"```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing interface status: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_status')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_vlan_delete_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show interface selection for VLAN deletion"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⏳ Fetching interfaces...")
            
            interfaces = config_mgr.get_uplink_interfaces_list()
            
            keyboard = []
            for iface in interfaces[:12]:
                keyboard.append([InlineKeyboardButton(
                    f"❌ {iface}",
                    callback_data=f'uplink_del_if_{iface}'
                )])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')])
            
            await query.edit_message_text(
                "❌ *Delete VLAN from Uplink*\n\n"
                "Step 1: Select interface to delete VLAN from:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing delete menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_delete_vlan_select(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show VLAN selection for deletion from interface"""
        query = update.callback_query
        callback_data = query.data
        interface = callback_data.replace('uplink_del_if_', '')
        
        context.user_data['uplink_del_interface'] = interface
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_del')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text(f"⏳ Fetching VLANs on {interface}...")
            
            # Get interface config to find configured VLANs
            config = config_mgr.show_uplink_config(interface)
            
            # Parse VLAN IDs from config
            import re
            vlan_ids = []
            for line in config.split('\n'):
                # Match switchport vlan xxx tag or switchport default vlan xxx
                matches = re.findall(r'switchport.*vlan\s+(\d+)', line)
                for match in matches:
                    vid = int(match)
                    if vid not in vlan_ids:
                        vlan_ids.append(vid)
            
            keyboard = []
            if vlan_ids:
                for vid in vlan_ids[:12]:
                    keyboard.append([InlineKeyboardButton(
                        f"❌ VLAN {vid}",
                        callback_data=f'uplink_delvlan_{vid}'
                    )])
                info = f"Found {len(vlan_ids)} VLAN(s) on interface"
            else:
                # Fallback to common VLANs
                for vid in [100, 200, 300, 500, 1000]:
                    keyboard.append([InlineKeyboardButton(
                        f"❌ VLAN {vid}",
                        callback_data=f'uplink_delvlan_{vid}'
                    )])
                info = "No VLANs found - showing common VLANs"
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_del')])
            
            safe_interface = interface.replace('_', '\\_')
            await query.edit_message_text(
                f"❌ *Delete VLAN from {safe_interface}*\n\n"
                f"Step 2: Select VLAN to delete:\n"
                f"{info}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing VLAN delete select: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_del')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_uplink_delete_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute VLAN deletion from interface"""
        query = update.callback_query
        callback_data = query.data
        vlan_id = callback_data.replace('uplink_delvlan_', '')
        interface = context.user_data.get('uplink_del_interface')
        
        if not interface:
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_vlan_del')]]
            await query.edit_message_text(
                "❌ Error: Interface not selected. Please start over.",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text(f"⏳ Deleting VLAN {vlan_id} from {interface}...")
            
            success, message = config_mgr.remove_uplink_vlan(interface, int(vlan_id))
            
            keyboard = [
                [InlineKeyboardButton("❌ Delete Another", callback_data='uplink_vlan_del')],
                [InlineKeyboardButton("🔙 Back to Uplink Menu", callback_data='uplink_menu')]
            ]
            
            safe_interface = interface.replace('_', '\\_')
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Delete VLAN Result*\n\n"
                f"Interface: `{safe_interface}`\n"
                f"VLAN ID: `{vlan_id}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error deleting VLAN: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_shutdown_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show interface selection for shutdown"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⏳ Fetching interfaces...")
            
            interfaces = config_mgr.get_uplink_interfaces_list()
            
            keyboard = []
            for iface in interfaces[:12]:
                keyboard.append([InlineKeyboardButton(
                    f"⏸️ {iface}",
                    callback_data=f'uplink_shut_if_{iface}'
                )])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')])
            
            await query.edit_message_text(
                "⏸️ *Shutdown Interface*\n\n"
                "⚠️ *WARNING:* This will disable the interface!\n\n"
                "Select interface to shutdown:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing shutdown menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_uplink_shutdown(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute interface shutdown"""
        query = update.callback_query
        callback_data = query.data
        interface = callback_data.replace('uplink_shut_if_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text(f"⏳ Shutting down {interface}...")
            
            success, message = config_mgr.shutdown_interface(interface)
            
            keyboard = [
                [InlineKeyboardButton("▶️ Re-Enable Interface", callback_data=f'uplink_enab_if_{interface}')],
                [InlineKeyboardButton("🔙 Back to Uplink Menu", callback_data='uplink_menu')]
            ]
            
            safe_interface = interface.replace('_', '\\_')
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Shutdown Interface*\n\n"
                f"Interface: `{safe_interface}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error shutting down interface: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_uplink_enable_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show interface selection for enabling"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text("⏳ Fetching interfaces...")
            
            interfaces = config_mgr.get_uplink_interfaces_list()
            
            keyboard = []
            for iface in interfaces[:12]:
                keyboard.append([InlineKeyboardButton(
                    f"▶️ {iface}",
                    callback_data=f'uplink_enab_if_{iface}'
                )])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')])
            
            await query.edit_message_text(
                "▶️ *Enable Interface*\n\n"
                "This will activate the interface (no shutdown)\n\n"
                "Select interface to enable:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing enable menu: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def execute_uplink_enable(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute interface enable"""
        query = update.callback_query
        callback_data = query.data
        interface = callback_data.replace('uplink_enab_if_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_config_manager import OLTConfigManager
            config_mgr = OLTConfigManager(client)
            
            await query.edit_message_text(f"⏳ Enabling {interface}...")
            
            success, message = config_mgr.enable_interface(interface)
            
            keyboard = [
                [InlineKeyboardButton("📊 Check Status", callback_data=f'uplink_stat_if_{interface}')],
                [InlineKeyboardButton("🔙 Back to Uplink Menu", callback_data='uplink_menu')]
            ]
            
            safe_interface = interface.replace('_', '\\_')
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Enable Interface*\n\n"
                f"Interface: `{safe_interface}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error enabling interface: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='uplink_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ==================== SYSTEM CONFIGURATION ====================
    
    async def system_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show system configuration menu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📡 SNMP Management", callback_data='sys_snmp')],
            [InlineKeyboardButton("☁️ TR-069/ACS", callback_data='sys_tr069')],
            [InlineKeyboardButton("🕐 NTP & Time", callback_data='sys_ntp')],
            [InlineKeyboardButton("👤 User Management", callback_data='sys_user')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🔧 *System Configuration*\n\n"
            "Manage system settings:\n"
            "• SNMP monitoring\n"
            "• TR-069 auto-provisioning\n"
            "• Time synchronization\n"
            "• User accounts",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    # ==================== SNMP MANAGEMENT ====================
    
    async def show_snmp_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show SNMP management submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show SNMP Config", callback_data='snmp_show')],
            [InlineKeyboardButton("📜 Show Communities", callback_data='snmp_communities')],
            [InlineKeyboardButton("➕ Add Community", callback_data='snmp_add_community')],
            [InlineKeyboardButton("❌ Delete Community", callback_data='snmp_del_community')],
            [InlineKeyboardButton("📍 Set Contact/Location", callback_data='snmp_contact')],
            [InlineKeyboardButton("📨 Add Trap Host", callback_data='snmp_trap')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📡 *SNMP Management*\n\n"
            "Configure SNMP settings:\n"
            "• View current config\n"
            "• Manage community strings\n"
            "• Configure trap hosts",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def snmp_show_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show current SNMP configuration"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("📡 Fetching SNMP config...")
            
            result = sys_mgr.show_snmp()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='snmp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            await query.edit_message_text(
                f"📡 *SNMP Configuration*\n\n```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing SNMP config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def snmp_show_communities(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show SNMP communities"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("📜 Fetching communities...")
            
            result = sys_mgr.show_snmp_community()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            keyboard = [
                [InlineKeyboardButton("➕ Add Community", callback_data='snmp_add_community')],
                [InlineKeyboardButton("🔄 Refresh", callback_data='snmp_communities')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            await query.edit_message_text(
                f"📜 *SNMP Communities*\n\n```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing communities: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def snmp_add_community_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show add community options"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔒 Read-Only (public)", callback_data='snmp_addcomm_public_ro')],
            [InlineKeyboardButton("🔓 Read-Write (private)", callback_data='snmp_addcomm_private_rw')],
            [InlineKeyboardButton("🔒 Custom RO", callback_data='snmp_addcomm_custom_ro')],
            [InlineKeyboardButton("🔓 Custom RW", callback_data='snmp_addcomm_custom_rw')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
        ]
        
        await query.edit_message_text(
            "➕ *Add SNMP Community*\n\n"
            "Select community type:\n\n"
            "• *Read-Only (RO)* - Can only read data\n"
            "• *Read-Write (RW)* - Can read and modify\n\n"
            "Common presets:\n"
            "• `public` - Standard RO community\n"
            "• `private` - Standard RW community",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def snmp_del_community_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show delete community options"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            result = sys_mgr.show_snmp_community()
            
            # Parse community names from result
            communities = []
            for line in result.split('\n'):
                if 'community' in line.lower():
                    import re
                    match = re.search(r'community\s+(\S+)', line)
                    if match:
                        comm = match.group(1)
                        if comm not in communities:
                            communities.append(comm)
            
            keyboard = []
            for comm in communities[:10]:
                keyboard.append([InlineKeyboardButton(f"❌ {comm}", callback_data=f'snmp_delcomm_{comm}')])
            
            if not keyboard:
                keyboard.append([InlineKeyboardButton("❌ public", callback_data='snmp_delcomm_public')])
                keyboard.append([InlineKeyboardButton("❌ private", callback_data='snmp_delcomm_private')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')])
            
            await query.edit_message_text(
                "❌ *Delete SNMP Community*\n\n"
                "Select community to delete:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing del community: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def snmp_contact_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show contact/location options"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📍 Set Contact (Admin)", callback_data='snmp_setcontact_Admin')],
            [InlineKeyboardButton("📍 Set Contact (NOC)", callback_data='snmp_setcontact_NOC')],
            [InlineKeyboardButton("🏢 Set Location (DC)", callback_data='snmp_setloc_DataCenter')],
            [InlineKeyboardButton("🏢 Set Location (POP)", callback_data='snmp_setloc_POP')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
        ]
        
        await query.edit_message_text(
            "📍 *Set SNMP Contact/Location*\n\n"
            "Configure system identification:\n\n"
            "Select preset or use CLI for custom values.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def snmp_trap_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show trap host configuration"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📨 Add Trap (use CLI)", callback_data='snmp_trap_info')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
        ]
        
        await query.edit_message_text(
            "📨 *SNMP Trap Configuration*\n\n"
            "To add trap host, use CLI:\n\n"
            "`snmp-server host <IP> <community>`\n\n"
            "Example:\n"
            "`snmp-server host 192.168.1.100 public`",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    # ==================== TR-069/ACS MANAGEMENT ====================
    
    async def show_tr069_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show TR-069/ACS submenu - matching CLI tr069_menu()"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show TR-069 Global Config", callback_data='tr069_show')],
            [InlineKeyboardButton("⚙️ Set Global ACS Server", callback_data='tr069_set_global')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "☁️ *TR-069/ACS Configuration*\n\n"
            "Configure TR-069 auto-provisioning:\n\n"
            "• *Show Config* - View current settings\n"
            "• *Set Global ACS* - Configure URL, credentials, interval",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def tr069_show_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show current TR-069 configuration"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("☁️ Fetching TR-069 config...")
            
            result = sys_mgr.show_tr069_global()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='tr069_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]
            ]
            
            await query.edit_message_text(
                f"☁️ *TR-069 Configuration*\n\n```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing TR-069 config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def tr069_set_global_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Set Global ACS Server menu - matching CLI"""
        query = update.callback_query
        
        # Common ACS presets
        keyboard = [
            [InlineKeyboardButton("🌐 GenieACS (port 7547)", callback_data='tr069_preset_genieacs')],
            [InlineKeyboardButton("🌐 OpenACS (port 8080)", callback_data='tr069_preset_openacs')],
            [InlineKeyboardButton("✏️ Custom ACS URL", callback_data='tr069_preset_custom')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]
        ]
        
        await query.edit_message_text(
            "⚙️ *Set Global ACS Server*\n\n"
            "This will configure:\n"
            "• ACS URL\n"
            "• Username (optional)\n"
            "• Password (optional)\n"
            "• Inform interval\n\n"
            "Select ACS type:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    # ==================== TR-069 SET GLOBAL ACS (CLI FLOW) ====================
    # Flow: Select ACS type → Enter IP → Enter Username → Enter Password → Select Interval → Execute
    
    async def tr069_step1_url(self, update: Update, context: ContextTypes.DEFAULT_TYPE, acs_type: str, port: int):
        """Step 1: Select ACS server IP"""
        query = update.callback_query
        
        # Store in context for later use
        context.user_data['tr069_acs_type'] = acs_type
        context.user_data['tr069_acs_port'] = port
        
        keyboard = [
            [InlineKeyboardButton("192.168.1.100", callback_data='tr069_step1_setip_192.168.1.100')],
            [InlineKeyboardButton("192.168.1.200", callback_data='tr069_step1_setip_192.168.1.200')],
            [InlineKeyboardButton("10.0.0.100", callback_data='tr069_step1_setip_10.0.0.100')],
            [InlineKeyboardButton("172.16.0.100", callback_data='tr069_step1_setip_172.16.0.100')],
            [InlineKeyboardButton("🔙 Back", callback_data='tr069_set_global')]
        ]
        
        await query.edit_message_text(
            f"📍 *Step 1/4: ACS Server IP*\n\n"
            f"ACS Type: `{acs_type.upper()}`\n"
            f"Port: `{port}`\n\n"
            f"Select server IP:\n\n"
            f"_Or use CLI for custom: `tr069 acs-url http://IP:{port}/`_",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def tr069_step1_custom_url(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Step 1 Custom: Enter full URL manually"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔙 Back", callback_data='tr069_set_global')]
        ]
        
        await query.edit_message_text(
            "✏️ *Custom ACS URL*\n\n"
            "Enter via CLI:\n\n"
            "```\nconfigure terminal\n"
            "gpon\n"
            "tr069 acs-url http://IP:PORT/\n"
            "tr069 acs-username USERNAME\n"
            "tr069 acs-password PASSWORD\n"
            "tr069 periodic-inform enable\n"
            "tr069 periodic-inform-interval 3600\n"
            "end\n```\n\n"
            "Examples:\n"
            "• `http://192.168.1.100:7547/`\n"
            "• `http://acs.example.com:8080/cwmp`",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def tr069_step2_username(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Step 2: Enter ACS username"""
        query = update.callback_query
        
        # Extract IP from callback
        ip = query.data.replace('tr069_step1_setip_', '')
        context.user_data['tr069_acs_ip'] = ip
        
        keyboard = [
            [InlineKeyboardButton("admin", callback_data='tr069_step2_setuser_admin')],
            [InlineKeyboardButton("acs", callback_data='tr069_step2_setuser_acs')],
            [InlineKeyboardButton("tr069", callback_data='tr069_step2_setuser_tr069')],
            [InlineKeyboardButton("⏭️ Skip (no username)", callback_data='tr069_skip_user')],
            [InlineKeyboardButton("🔙 Back", callback_data='tr069_set_global')]
        ]
        
        port = context.user_data.get('tr069_acs_port', 7547)
        url = f"http://{ip}:{port}/"
        
        await query.edit_message_text(
            f"👤 *Step 2/4: ACS Username*\n\n"
            f"URL: `{url}`\n\n"
            f"Select username (optional):\n\n"
            f"_Skip if not required_",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def tr069_step3_password(self, update: Update, context: ContextTypes.DEFAULT_TYPE, skip_user: bool = False):
        """Step 3: Enter ACS password"""
        query = update.callback_query
        
        # Extract username from callback (if not skipped)
        if not skip_user:
            username = query.data.replace('tr069_step2_setuser_', '')
            context.user_data['tr069_acs_username'] = username
        else:
            context.user_data['tr069_acs_username'] = ''
        
        keyboard = [
            [InlineKeyboardButton("admin", callback_data='tr069_step3_setpass_admin')],
            [InlineKeyboardButton("password", callback_data='tr069_step3_setpass_password')],
            [InlineKeyboardButton("admin123", callback_data='tr069_step3_setpass_admin123')],
            [InlineKeyboardButton("⏭️ Skip (no password)", callback_data='tr069_skip_pass')],
            [InlineKeyboardButton("🔙 Back", callback_data='tr069_set_global')]
        ]
        
        ip = context.user_data.get('tr069_acs_ip', '')
        port = context.user_data.get('tr069_acs_port', 7547)
        username = context.user_data.get('tr069_acs_username', '')
        
        await query.edit_message_text(
            f"🔑 *Step 3/4: ACS Password*\n\n"
            f"URL: `http://{ip}:{port}/`\n"
            f"Username: `{username if username else '(none)'}`\n\n"
            f"Select password (optional):\n\n"
            f"_Skip if not required_",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def tr069_step4_interval(self, update: Update, context: ContextTypes.DEFAULT_TYPE, skip_pass: bool = False):
        """Step 4: Select inform interval"""
        query = update.callback_query
        
        # Extract password from callback (if not skipped)
        if not skip_pass:
            password = query.data.replace('tr069_step3_setpass_', '')
            context.user_data['tr069_acs_password'] = password
        else:
            context.user_data['tr069_acs_password'] = ''
        
        keyboard = [
            [InlineKeyboardButton("⏱️ 1 Hour (3600s)", callback_data='tr069_step4_setint_3600')],
            [InlineKeyboardButton("⏱️ 6 Hours (21600s)", callback_data='tr069_step4_setint_21600')],
            [InlineKeyboardButton("⏱️ 12 Hours (43200s)", callback_data='tr069_step4_setint_43200')],
            [InlineKeyboardButton("⏱️ 24 Hours (86400s)", callback_data='tr069_step4_setint_86400')],
            [InlineKeyboardButton("🔙 Back", callback_data='tr069_set_global')]
        ]
        
        ip = context.user_data.get('tr069_acs_ip', '')
        port = context.user_data.get('tr069_acs_port', 7547)
        username = context.user_data.get('tr069_acs_username', '')
        password = context.user_data.get('tr069_acs_password', '')
        
        await query.edit_message_text(
            f"⏱️ *Step 4/4: Inform Interval*\n\n"
            f"URL: `http://{ip}:{port}/`\n"
            f"Username: `{username if username else '(none)'}`\n"
            f"Password: `{'*' * len(password) if password else '(none)'}`\n\n"
            f"Select periodic inform interval:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def execute_tr069_set_global(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute set global TR-069 ACS using OLTSystemManager.set_tr069_acs_global()"""
        query = update.callback_query
        
        # Extract interval from callback
        interval = int(query.data.replace('tr069_step4_setint_', ''))
        
        # Get all values from context
        ip = context.user_data.get('tr069_acs_ip', '')
        port = context.user_data.get('tr069_acs_port', 7547)
        username = context.user_data.get('tr069_acs_username', '')
        password = context.user_data.get('tr069_acs_password', '')
        acs_type = context.user_data.get('tr069_acs_type', 'custom')
        
        url = f"http://{ip}:{port}/"
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(
                f"⏳ *Configuring Global ACS...*\n\n"
                f"URL: `{url}`\n"
                f"Username: `{username if username else '(none)'}`\n"
                f"Interval: `{interval}s`",
                parse_mode='Markdown'
            )
            
            # Use the proper method from OLTSystemManager
            success, message = sys_mgr.set_tr069_acs_global(
                acs_url=url,
                acs_username=username,
                acs_password=password,
                periodic=True,
                interval=interval
            )
            
            keyboard = [
                [InlineKeyboardButton("📋 View Config", callback_data='tr069_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]
            ]
            
            hours = interval // 3600
            status = "✅" if success else "❌"
            
            await query.edit_message_text(
                f"{status} *Global ACS Configuration*\n\n"
                f"Type: `{acs_type.upper()}`\n"
                f"URL: `{url}`\n"
                f"Username: `{username if username else '(none)'}`\n"
                f"Password: `{'*' * len(password) if password else '(none)'}`\n"
                f"Interval: `{interval}s` ({hours}h)\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            # Clear context
            context.user_data.pop('tr069_acs_ip', None)
            context.user_data.pop('tr069_acs_port', None)
            context.user_data.pop('tr069_acs_username', None)
            context.user_data.pop('tr069_acs_password', None)
            context.user_data.pop('tr069_acs_type', None)
            
        except Exception as e:
            logger.error(f"Error setting global ACS: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_tr069')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    # ==================== NTP & TIME MANAGEMENT ====================
    
    async def show_ntp_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show NTP submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show NTP Config", callback_data='ntp_show')],
            [InlineKeyboardButton("🕐 Show Current Time", callback_data='ntp_time')],
            [InlineKeyboardButton("⏰ Set Time to Now", callback_data='ntp_set_time')],
            [InlineKeyboardButton("✅ Enable NTP", callback_data='ntp_enable'), 
             InlineKeyboardButton("❌ Disable NTP", callback_data='ntp_disable')],
            [InlineKeyboardButton("➕ Add NTP Server", callback_data='ntp_add')],
            [InlineKeyboardButton("🗑️ Delete NTP Server", callback_data='ntp_del')],
            [InlineKeyboardButton("🌍 Set Timezone", callback_data='ntp_timezone')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🕐 *NTP & Time Configuration*\n\n"
            "Configure time synchronization:\n"
            "• Show/Set system time\n"
            "• Enable/Disable NTP\n"
            "• Add/Remove NTP servers\n"
            "• Timezone settings",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def ntp_show_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show current NTP configuration"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("🕐 Fetching NTP config...")
            
            result = sys_mgr.show_ntp()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='ntp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            await query.edit_message_text(
                f"🕐 *NTP Configuration*\n\n```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing NTP config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def ntp_show_time(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show current system time - with validation"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            from datetime import datetime
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("🕐 Fetching current time...")
            
            # Use the proper show_clock method from OLTSystemManager
            result = sys_mgr.show_clock()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            # Check if time is correct (year should be current)
            current_year = datetime.now().year
            time_warning = ""
            if str(current_year) not in result and result.strip() and "Error" not in result:
                # Time appears to be incorrect
                time_warning = "\n\n⚠️ *Warning:* OLT time appears incorrect!\nPlease set correct time using CLI:\n\n"
                time_warning += "```\nclock set HH:MM:SS DD MM YYYY\n```\n"
                time_warning += f"Example for now:\n`clock set {datetime.now().strftime('%H:%M:%S %d %m %Y')}`"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='ntp_time')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            await query.edit_message_text(
                f"🕐 *Current System Time*\n\n```\n{safe_result}\n```{time_warning}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing time: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def ntp_add_server_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show add NTP server options"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🌐 pool.ntp.org", callback_data='ntp_addsvr_pool.ntp.org')],
            [InlineKeyboardButton("🌐 time.google.com", callback_data='ntp_addsvr_time.google.com')],
            [InlineKeyboardButton("🌐 time.cloudflare.com", callback_data='ntp_addsvr_time.cloudflare.com')],
            [InlineKeyboardButton("🇮🇩 id.pool.ntp.org", callback_data='ntp_addsvr_id.pool.ntp.org')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
        ]
        
        await query.edit_message_text(
            "➕ *Add NTP Server*\n\n"
            "⚠️ Note: NTP config may require specific firmware/model.\n\n"
            "Select NTP server to try auto-config:\n\n"
            "Or configure manually via CLI:\n"
            "• Try: `sntp-server <server>`\n"
            "• Or: `ntp-server <server>`\n"
            "• Or: `clock ntp-server <server>`",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def ntp_del_server_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show delete NTP server options"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            result = sys_mgr.show_ntp()
            
            # Parse NTP servers from result
            servers = []
            for line in result.split('\n'):
                if 'unicast-server' in line.lower() or 'server' in line.lower():
                    import re
                    match = re.search(r'(?:unicast-server|server)\s+(\S+)', line)
                    if match:
                        srv = match.group(1)
                        if srv not in servers and not srv.startswith('ntp'):
                            servers.append(srv)
            
            keyboard = []
            for srv in servers[:8]:
                keyboard.append([InlineKeyboardButton(f"❌ {srv}", callback_data=f'ntp_delsvr_{srv}')])
            
            if not keyboard:
                keyboard.append([InlineKeyboardButton("(No servers found)", callback_data='sys_ntp')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')])
            
            await query.edit_message_text(
                "❌ *Delete NTP Server*\n\n"
                "Select server to remove:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing del NTP: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def ntp_timezone_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show timezone options"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🇮🇩 WIB (UTC+7)", callback_data='ntp_settz_WIB_7')],
            [InlineKeyboardButton("🇮🇩 WITA (UTC+8)", callback_data='ntp_settz_WITA_8')],
            [InlineKeyboardButton("🇮🇩 WIT (UTC+9)", callback_data='ntp_settz_WIT_9')],
            [InlineKeyboardButton("🌍 UTC (UTC+0)", callback_data='ntp_settz_UTC_0')],
            [InlineKeyboardButton("🇸🇬 SGT (UTC+8)", callback_data='ntp_settz_SGT_8')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
        ]
        
        await query.edit_message_text(
            "🌍 *Set Timezone*\n\n"
            "Select timezone:\n\n"
            "Indonesia:\n"
            "• WIB - Jakarta, Pontianak\n"
            "• WITA - Makassar, Bali\n"
            "• WIT - Jayapura, Papua",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    # ==================== USER MANAGEMENT ====================
    
    async def show_users(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show user management submenu"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show Users", callback_data='user_show')],
            [InlineKeyboardButton("➕ Add User", callback_data='user_add')],
            [InlineKeyboardButton("❌ Delete User", callback_data='user_del')],
            [InlineKeyboardButton("🔑 Change Password", callback_data='user_passwd')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "👤 *User Management*\n\n"
            "Manage OLT user accounts:\n"
            "• View configured users\n"
            "• Add/Delete users\n"
            "• Change passwords",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def user_show_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show current users"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("👤 Fetching users...")
            
            result = sys_mgr.show_users()
            safe_result = result.replace('_', '\\_').replace('*', '\\*')
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='user_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_user')]
            ]
            
            await query.edit_message_text(
                f"👤 *Configured Users*\n\n```\n{safe_result[:3500]}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing users: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def user_add_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show add user options"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("👑 Admin (privilege 15)", callback_data='user_addlvl_15')],
            [InlineKeyboardButton("👤 Operator (privilege 10)", callback_data='user_addlvl_10')],
            [InlineKeyboardButton("👁️ Monitor (privilege 1)", callback_data='user_addlvl_1')],
            [InlineKeyboardButton("🔙 Back", callback_data='sys_user')]
        ]
        
        await query.edit_message_text(
            "➕ *Add User*\n\n"
            "Select privilege level:\n\n"
            "• *Admin (15)* - Full access\n"
            "• *Operator (10)* - Config access\n"
            "• *Monitor (1)* - Read only\n\n"
            "For custom, use CLI:\n"
            "`username <name> password <pass> privilege <0-15>`",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def user_del_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show delete user options"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            result = sys_mgr.show_users()
            
            # Parse usernames from result - only valid user entries
            # Format: username <name> password <pass> privilege <level>
            users = []
            import re
            for line in result.split('\n'):
                line = line.strip()
                # Must start with 'username ' and contain 'password'
                if line.startswith('username ') and 'password' in line:
                    # Extract username (second word after 'username')
                    match = re.match(r'^username\s+(\S+)\s+password', line)
                    if match:
                        usr = match.group(1)
                        if usr not in users:
                            users.append(usr)
            
            keyboard = []
            for usr in users[:8]:
                keyboard.append([InlineKeyboardButton(f"❌ {usr}", callback_data=f'user_delusr_{usr}')])
            
            if not keyboard:
                keyboard.append([InlineKeyboardButton("(No users found)", callback_data='sys_user')])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='sys_user')])
            
            await query.edit_message_text(
                "❌ *Delete User*\n\n"
                "⚠️ Be careful! Don't delete your own account.\n\n"
                "Select user to delete:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing del user: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def user_passwd_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show change password info"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🔙 Back", callback_data='sys_user')]
        ]
        
        await query.edit_message_text(
            "🔑 *Change Password*\n\n"
            "To change password, use CLI:\n\n"
            "```\nconfigure terminal\n"
            "username <name> password <newpass>\n"
            "end\n```\n\n"
            "⚠️ Password will be shown in running-config!",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    # ==================== EXECUTE ACTIONS ====================
    
    async def execute_snmp_add_community(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute add SNMP community"""
        query = update.callback_query
        callback_data = query.data
        # Format: snmp_addcomm_<community>_<permission>
        parts = callback_data.replace('snmp_addcomm_', '').split('_')
        community = parts[0]
        permission = parts[1] if len(parts) > 1 else 'ro'
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"➕ Adding community '{community}'...")
            
            success, message = sys_mgr.add_snmp_community(community, permission)
            
            keyboard = [
                [InlineKeyboardButton("📜 View Communities", callback_data='snmp_communities')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Add SNMP Community*\n\n"
                f"Community: `{community}`\n"
                f"Permission: `{permission}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error adding community: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_snmp_del_community(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute delete SNMP community"""
        query = update.callback_query
        community = query.data.replace('snmp_delcomm_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"❌ Deleting community '{community}'...")
            
            success, message = sys_mgr.delete_snmp_community(community)
            
            keyboard = [
                [InlineKeyboardButton("📜 View Communities", callback_data='snmp_communities')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Delete SNMP Community*\n\n"
                f"Community: `{community}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error deleting community: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_snmp_set_contact(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute set SNMP contact"""
        query = update.callback_query
        contact = query.data.replace('snmp_setcontact_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"📍 Setting contact to '{contact}'...")
            
            success, message = sys_mgr.set_snmp_contact(contact)
            
            keyboard = [
                [InlineKeyboardButton("📋 View Config", callback_data='snmp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Set SNMP Contact*\n\n"
                f"Contact: `{contact}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error setting contact: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_snmp_set_location(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute set SNMP location"""
        query = update.callback_query
        location = query.data.replace('snmp_setloc_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"🏢 Setting location to '{location}'...")
            
            success, message = sys_mgr.set_snmp_location(location)
            
            keyboard = [
                [InlineKeyboardButton("📋 View Config", callback_data='snmp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Set SNMP Location*\n\n"
                f"Location: `{location}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error setting location: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_snmp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_set_time(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute set OLT time to current system time"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            from datetime import datetime
            sys_mgr = OLTSystemManager(client)
            
            current_time = datetime.now()
            await query.edit_message_text(
                f"⏰ Setting OLT time to current time:\n"
                f"`{current_time.strftime('%Y-%m-%d %H:%M:%S')}`..."
            )
            
            success, message = sys_mgr.set_clock()
            
            keyboard = [
                [InlineKeyboardButton("🕐 Show Time", callback_data='ntp_time')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Set OLT Time*\n\n{message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error setting time: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_enable(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Enable NTP on OLT"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("⏳ Enabling NTP...")
            
            success, message = sys_mgr.enable_ntp()
            
            keyboard = [
                [InlineKeyboardButton("📋 Show Config", callback_data='ntp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Enable NTP*\n\n{message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error enabling NTP: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"⚠️ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_disable(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Disable NTP on OLT"""
        query = update.callback_query
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text("⏳ Disabling NTP...")
            
            success, message = sys_mgr.disable_ntp()
            
            keyboard = [
                [InlineKeyboardButton("📋 Show Config", callback_data='ntp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Disable NTP*\n\n{message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error disabling NTP: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"⚠️ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_add_server(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute add NTP server"""
        query = update.callback_query
        server = query.data.replace('ntp_addsvr_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"🌐 Adding NTP server '{server}'...")
            
            success, message = sys_mgr.set_ntp_server(server)
            
            keyboard = [
                [InlineKeyboardButton("📋 View Config", callback_data='ntp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Add NTP Server*\n\n"
                f"Server: `{server}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error adding NTP server: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_del_server(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute delete NTP server"""
        query = update.callback_query
        server = query.data.replace('ntp_delsvr_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"❌ Removing NTP server '{server}'...")
            
            success, message = sys_mgr.delete_ntp_server(server)
            
            keyboard = [
                [InlineKeyboardButton("📋 View Config", callback_data='ntp_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Delete NTP Server*\n\n"
                f"Server: `{server}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error deleting NTP server: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def execute_ntp_set_timezone(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute set timezone"""
        query = update.callback_query
        # Format: ntp_settz_<name>_<offset>
        parts = query.data.replace('ntp_settz_', '').split('_')
        tz_name = parts[0]
        tz_offset = int(parts[1]) if len(parts) > 1 else 0
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"🌍 Setting timezone to {tz_name}...")
            
            success, message = sys_mgr.set_timezone(tz_name, tz_offset)
            
            keyboard = [
                [InlineKeyboardButton("🕐 View Time", callback_data='ntp_time')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Set Timezone*\n\n"
                f"Timezone: `{tz_name}` (UTC+{tz_offset})\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error setting timezone: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_ntp')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def user_add_level_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show info about adding user with selected privilege level"""
        query = update.callback_query
        privilege = query.data.replace('user_addlvl_', '')
        
        level_name = "Admin" if privilege == "15" else "Operator" if privilege == "10" else "Monitor"
        
        keyboard = [
            [InlineKeyboardButton("🔙 Back", callback_data='user_add')]
        ]
        
        await query.edit_message_text(
            f"➕ *Add {level_name} User*\n\n"
            f"Privilege level: `{privilege}`\n\n"
            "To add user, use CLI:\n\n"
            f"```\nconfigure terminal\n"
            f"username <name> password <pass> privilege {privilege}\n"
            f"end\n```\n\n"
            "Example:\n"
            f"`username operator password Op3r@tor privilege {privilege}`",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def execute_user_delete(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute delete user"""
        query = update.callback_query
        username = query.data.replace('user_delusr_', '')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
                await query.edit_message_text("❌ Cannot connect to OLT", reply_markup=InlineKeyboardMarkup(keyboard))
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            await query.edit_message_text(f"❌ Deleting user '{username}'...")
            
            success, message = sys_mgr.delete_user(username)
            
            keyboard = [
                [InlineKeyboardButton("📋 View Users", callback_data='user_show')],
                [InlineKeyboardButton("🔙 Back", callback_data='sys_user')]
            ]
            
            status = "✅" if success else "❌"
            await query.edit_message_text(
                f"{status} *Delete User*\n\n"
                f"Username: `{username}`\n\n"
                f"Result: {message}",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error deleting user: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='sys_user')]]
            await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=InlineKeyboardMarkup(keyboard))
    
    async def save_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Save OLT configuration - Menu 16"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("💾 Saving configuration...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            success, msg = system_mgr.save_config()
            
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='back_menu')]]
            
            if success:
                await query.edit_message_text(
                    "✅ *Configuration Saved*\n\n"
                    "All changes have been saved to OLT startup-config.",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            else:
                await query.edit_message_text(
                    f"❌ *Save Failed*\n\n{msg}",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='back_menu')]]
            await query.edit_message_text(
                f"❌ Error saving config: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    # ==================== NEW MENU FUNCTIONS (CLI Alignment) ====================
    
    async def show_onu_status_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show ONU Status from all ports - Menu 3"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("� Select PON Port", callback_data='status_select_port')],
            [InlineKeyboardButton("📊 Quick Scan All Ports", callback_data='onu_status_quick')],
            [InlineKeyboardButton("📈 Full Scan All Ports", callback_data='onu_status_full')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📊 *Show ONU Status*\n\n"
            "Select scanning mode:\n\n"
            "• *Select PON Port* - Choose specific port to scan\n"
            "  Fast and focused on one port\n\n"
            "• *Quick Scan All* - Fast scan all 16 ports\n"
            "  (PON Port, ONU ID, Admin, OMCC, Phase, Status)\n\n"
            "• *Full Scan All* - Detailed scan with optical power\n"
            "  (PON Port, ONU ID, Admin, Phase, Rx Power, Attenuation)\n"
            "  ⚠️ Slower, may take 30-60 seconds\n\n"
            "💡 For large OLT, selecting specific port is faster",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def show_onu_status_quick_scan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Quick scan all PON ports - Mode Ringkas like CLI"""
        query = update.callback_query
        await query.answer()
        
        try:
            await query.edit_message_text(
                "⏳ Scanning all PON ports (Quick Mode)...\n\nPlease wait...",
                parse_mode='Markdown'
            )
            
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            total_onu = 0
            working = 0
            offline = 0
            all_onus = []
            
            # Scan ports 1/1/1 to 1/1/16
            for port in range(1, 17):
                pon_port = f"1/1/{port}"
                cmd = f"show gpon onu state gpon-olt_{pon_port}"
                success, output = client.execute_command(cmd, timeout=5)
                
                if not success or 'Invalid' in output or 'error' in output.lower():
                    continue
                
                # Parse ONU info - ZTE format with multiple columns
                for line in output.split('\n'):
                    line = line.strip()
                    # Skip header and separator lines
                    if 'OnuIndex' in line or line.startswith('---') or line.startswith('gpon-olt'):
                        continue
                    
                    # Look for lines with gpon-onu format
                    if 'gpon-onu_' in line or ':' in line:
                        parts = line.split()
                        if len(parts) >= 4:
                            # Parse ONU interface to get ID
                            onu_if = parts[0]
                            onu_id = onu_if.split(':')[-1] if ':' in onu_if else parts[0]
                            
                            admin_state = parts[1] if len(parts) > 1 else '?'
                            omcc_state = parts[2] if len(parts) > 2 else '?'
                            phase_state = parts[3] if len(parts) > 3 else '?'
                            auth_state = parts[4] if len(parts) > 4 else '-'
                            
                            # Try to get ONU name (usually last column)
                            onu_name = parts[-1] if len(parts) > 5 and not parts[-1].isdigit() else '-'
                            if onu_name in ['enable', 'disable', 'up', 'down', 'working', 'offline', 'normal', 'loid', 'sn', 'password']:
                                onu_name = '-'
                            
                            is_working = 'working' in phase_state.lower()
                            if is_working:
                                working += 1
                                status_icon = "✅"
                            else:
                                offline += 1
                                status_icon = "❌"
                            
                            all_onus.append({
                                'port': pon_port,
                                'id': onu_id,
                                'name': onu_name,
                                'admin': admin_state,
                                'omcc': omcc_state,
                                'phase': phase_state,
                                'auth': auth_state,
                                'status': status_icon
                            })
                            total_onu += 1
            
            if not all_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ No ONU found on any port.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Build message with table format
            text = "📊 *Quick Scan Results*\n\n"
            
            # Group by port for better readability
            ports_with_onus = {}
            for onu in all_onus:
                port = onu['port']
                if port not in ports_with_onus:
                    ports_with_onus[port] = []
                ports_with_onus[port].append(onu)
            
            # Show summary by port first
            text += "*Per Port Summary:*\n"
            for port in sorted(ports_with_onus.keys()):
                port_onus = ports_with_onus[port]
                port_working = sum(1 for o in port_onus if '✅' in o['status'])
                port_offline = len(port_onus) - port_working
                text += f"Port {port}: {len(port_onus)} ONUs ({port_working}✅/{port_offline}❌)\n"
            
            text += "\n*Detailed List:*\n```\n"
            text += f"{'Port':<8} {'ID':<4} {'Name':<12} {'Admin':<6} {'OMCC':<5} {'Phase':<8} St\n"
            text += "─" * 52 + "\n"
            
            # Show ONUs with proper formatting
            max_chars = 3000
            current_length = 0
            displayed_count = 0
            
            for port in sorted(ports_with_onus.keys()):
                for onu in ports_with_onus[port]:
                    name_display = onu['name'][:11] if onu['name'] != '-' else '-'
                    admin_display = onu['admin'][:5]
                    omcc_display = onu['omcc'][:4]
                    phase_display = onu['phase'][:7]
                    
                    line = f"{onu['port']:<8} {onu['id']:<4} {name_display:<12} {admin_display:<6} {omcc_display:<5} {phase_display:<8} {onu['status']}\n"
                    
                    if current_length + len(line) < max_chars:
                        text += line
                        current_length += len(line)
                        displayed_count += 1
                    else:
                        break
                if current_length >= max_chars:
                    break
            
            if displayed_count < len(all_onus):
                text += f"\n... showing {displayed_count} of {len(all_onus)} ONUs\n"
            
            text += "```\n\n"
            text += f"*Overall Summary:*\n"
            text += f"✅ Working: {working}\n"
            text += f"❌ Offline: {offline}\n"
            text += f"📊 Total: {total_onu}\n\n"
            text += "💡 For complete table view, use CLI"
            
            keyboard = [
                [InlineKeyboardButton("📈 Full Scan", callback_data='onu_status_full')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_3')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in quick scan: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            text += f"❌ Offline: {offline}\n"
            text += f"📊 Total: {total_onu}\n\n"
            
            if port_summary:
                text += "*Per Port (W=Working, O=Offline):*\n```\n"
                # Group in columns for better display
                for i in range(0, len(port_summary), 2):
                    row = port_summary[i]
                    if i + 1 < len(port_summary):
                        row += f"  {port_summary[i+1]}"
                    text += row + "\n"
                text += "```\n\n"
            
            text += "💡 For detailed info, use Full Scan\n"
            text += "or view ONU List"
            
            keyboard = [
                [InlineKeyboardButton("📈 Full Scan", callback_data='onu_status_full')],
                [InlineKeyboardButton("📋 ONU List", callback_data='onu_list')],
                [InlineKeyboardButton("🔄 Refresh", callback_data='onu_status_quick')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_3')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in quick scan: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def show_onu_status_full_scan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Full scan with optical power - Mode Lengkap like CLI"""
        query = update.callback_query
        await query.answer()
        
        try:
            await query.edit_message_text(
                "⏳ Full scanning with optical power (Mode Lengkap)...\n\n"
                "This may take 30-60 seconds...",
                parse_mode='Markdown'
            )
            
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            total_onu = 0
            working = 0
            offline = 0
            all_onus = []
            
            # Scan all ports 1/1/1 to 1/1/16
            for port in range(1, 17):
                pon_port = f"1/1/{port}"
                cmd = f"show gpon onu state gpon-olt_{pon_port}"
                success, output = client.execute_command(cmd, timeout=5)
                
                if not success or 'Invalid' in output or 'error' in output.lower():
                    continue
                
                # Get OLT Tx power for this port
                tx_power = None
                tx_cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
                tx_success, tx_output = client.execute_command(tx_cmd, timeout=5)
                if tx_success and tx_output:
                    for line in tx_output.split('\n'):
                        if '(gpon)' in line.lower() and 'dbm' in line.lower():
                            parts = line.split()
                            if len(parts) >= 2:
                                try:
                                    tx_power = float(parts[1].replace('(dbm)', '').replace('dbm', '').strip())
                                except:
                                    pass
                                break
                
                # Get Rx power for all ONUs on this port
                power_cmd = f"show pon power onu-rx gpon-olt_{pon_port}"
                power_success, power_output = client.execute_command(power_cmd, timeout=5)
                power_data = {}
                if power_success and power_output:
                    for line in power_output.split('\n'):
                        if 'gpon-onu_' in line and 'dbm' in line.lower():
                            parts = line.split()
                            if len(parts) >= 2:
                                onu_if = parts[0].replace('gpon-onu_', '')
                                # Extract just the ONU ID
                                if ':' in onu_if:
                                    onu_idx = onu_if.split(':')[-1]
                                    power_data[onu_idx] = parts[1]
                                else:
                                    power_data[onu_if] = parts[1]
                
                # Parse ONU state info
                for line in output.split('\n'):
                    line = line.strip()
                    # Skip headers and separators
                    if 'OnuIndex' in line or line.startswith('---') or line.startswith('gpon-olt'):
                        continue
                    
                    # Look for ONU lines
                    if 'gpon-onu_' in line or ':' in line:
                        parts = line.split()
                        if len(parts) >= 4:
                            # Parse ONU interface to get ID
                            onu_if = parts[0]
                            onu_id = onu_if.split(':')[-1] if ':' in onu_if else parts[0]
                            
                            admin_state = parts[1] if len(parts) > 1 else '?'
                            omcc_state = parts[2] if len(parts) > 2 else '?'
                            phase_state = parts[3] if len(parts) > 3 else '?'
                            auth_state = parts[4] if len(parts) > 4 else '-'
                            
                            # Try to get ONU name
                            onu_name = parts[-1] if len(parts) > 5 and not parts[-1].isdigit() else '-'
                            if onu_name in ['enable', 'disable', 'up', 'down', 'working', 'offline', 'normal', 'loid', 'sn', 'password']:
                                onu_name = '-'
                            
                            is_working = 'working' in phase_state.lower()
                            if is_working:
                                working += 1
                                status_icon = "✅"
                            else:
                                offline += 1
                                status_icon = "❌"
                            
                            # Get Rx power
                            rx_power = power_data.get(onu_id, '-')
                            
                            # Calculate attenuation
                            atten = '-'
                            atten_ind = ''
                            if tx_power is not None and rx_power != '-':
                                try:
                                    rx_val = float(rx_power.replace('(dbm)', '').replace('dbm', '').strip())
                                    atten_val = tx_power - rx_val
                                    atten = f"{atten_val:.1f}"
                                    
                                    # Indicator
                                    if atten_val < 20:
                                        atten_ind = '✓'
                                    elif atten_val < 25:
                                        atten_ind = '○'
                                    elif atten_val < 28:
                                        atten_ind = '△'
                                    else:
                                        atten_ind = '✗'
                                except:
                                    pass
                            
                            all_onus.append({
                                'port': pon_port,
                                'id': onu_id,
                                'name': onu_name,
                                'admin': admin_state,
                                'omcc': omcc_state,
                                'phase': phase_state,
                                'rx': rx_power if rx_power != '-' else '-',
                                'atten': atten,
                                'atten_ind': atten_ind,
                                'status': status_icon
                            })
                            total_onu += 1
            
            if not all_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ No ONU found on any port.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Build message with table format
            text = "📈 *Full Scan Results (with Optical Power)*\n\n"
            
            # Group by port
            ports_with_onus = {}
            for onu in all_onus:
                port = onu['port']
                if port not in ports_with_onus:
                    ports_with_onus[port] = []
                ports_with_onus[port].append(onu)
            
            # Show summary by port first
            text += "*Per Port Summary:*\n"
            for port in sorted(ports_with_onus.keys()):
                port_onus = ports_with_onus[port]
                port_working = sum(1 for o in port_onus if '✅' in o['status'])
                port_offline = len(port_onus) - port_working
                # Calculate average attenuation for working ONUs
                attens = [float(o['atten']) for o in port_onus if o['atten'] != '-' and '✅' in o['status']]
                avg_atten = sum(attens) / len(attens) if attens else 0
                text += f"Port {port}: {len(port_onus)} ONUs ({port_working}✅/{port_offline}❌) Avg:{avg_atten:.1f}dB\n"
            
            text += "\n*Detailed List:*\n```\n"
            text += f"{'Port':<8} {'ID':<4} {'Name':<10} {'Phase':<8} {'RxPwr':<7} {'Att':<6} St\n"
            text += "─" * 52 + "\n"
            
            # Show ONUs with proper formatting
            max_chars = 2800
            current_chars = 0
            displayed_count = 0
            
            for port in sorted(ports_with_onus.keys()):
                for onu in ports_with_onus[port]:
                    name_display = onu['name'][:9] if onu['name'] != '-' else '-'
                    phase_display = onu['phase'][:7]
                    rx_display = onu['rx'][:6] if onu['rx'] != '-' else '-'
                    atten_display = f"{onu['atten']}{onu['atten_ind']}" if onu['atten'] != '-' else '-'
                    
                    row = f"{onu['port']:<8} {onu['id']:<4} {name_display:<10} {phase_display:<8} {rx_display:<7} {atten_display:<6} {onu['status']}\n"
                    
                    if current_chars + len(row) < max_chars:
                        text += row
                        current_chars += len(row)
                        displayed_count += 1
                    else:
                        break
                if current_chars >= max_chars:
                    break
            
            if displayed_count < len(all_onus):
                text += f"\n... {displayed_count}/{len(all_onus)} ONUs shown\n"
            
            text += "```\n\n"
            text += f"*Summary:*\n"
            text += f"✅ Working: {working}\n"
            text += f"❌ Offline: {offline}\n"
            text += f"📊 Total: {total_onu}\n\n"
            text += "*Attenuation Legend:*\n"
            text += "✓ Good (<20dB) | ○ Fair (20-25) | △ Poor (25-28) | ✗ Critical (>28)\n\n"
            text += "💡 For complete table, use CLI"
            
            keyboard = [
                [InlineKeyboardButton("📊 Quick Scan", callback_data='onu_status_quick')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_3')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in full scan: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def status_select_port(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show PON port selection for status scan"""
        query = update.callback_query
        await query.answer()
        
        # Create 4x4 grid of port buttons (1-16)
        keyboard = []
        for row in range(4):
            row_buttons = []
            for col in range(4):
                port_num = row * 4 + col + 1
                row_buttons.append(
                    InlineKeyboardButton(f"Port {port_num}", callback_data=f'status_port_{port_num}')
                )
            keyboard.append(row_buttons)
        
        keyboard.append([InlineKeyboardButton("🔙 Back", callback_data='menu_3')])
        
        await query.edit_message_text(
            "🔍 *Select PON Port to Scan*\n\n"
            "Choose which PON port (1-16) you want to scan:\n\n"
            "After selecting, you can choose Quick or Full scan mode.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def status_port_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show scan mode menu for selected port"""
        query = update.callback_query
        await query.answer()
        
        port = int(query.data.split('_')[-1])
        context.user_data['status_port'] = port
        
        keyboard = [
            [InlineKeyboardButton("📊 Quick Scan", callback_data=f'status_quick_port_{port}')],
            [InlineKeyboardButton("📈 Full Scan (with Power)", callback_data=f'status_full_port_{port}')],
            [InlineKeyboardButton("🔙 Back to Port Selection", callback_data='status_select_port')]
        ]
        
        await query.edit_message_text(
            f"📡 *PON Port 1/1/{port}*\n\n"
            f"Select scan mode:\n\n"
            f"• *Quick Scan* - Fast, basic info\n"
            f"  (ONU ID, Admin, OMCC, Phase, Status)\n\n"
            f"• *Full Scan* - With optical power\n"
            f"  (ONU ID, Admin, Phase, Rx Power, Attenuation)\n"
            f"  ⚠️ Takes a bit longer",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def status_quick_port_scan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Quick scan for specific PON port"""
        query = update.callback_query
        await query.answer()
        
        port = int(query.data.split('_')[-1])
        
        try:
            await query.edit_message_text(
                f"⏳ Scanning PON Port 1/1/{port} (Quick Mode)...\n\nPlease wait...",
                parse_mode='Markdown'
            )
            
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            pon_port = f"1/1/{port}"
            cmd = f"show gpon onu state gpon-olt_{pon_port}"
            success, output = client.execute_command(cmd, timeout=5)
            
            if not success or 'Invalid' in output or 'error' in output.lower():
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
                await query.edit_message_text(
                    f"❌ Error scanning port {pon_port}\n\n"
                    f"Port may not exist or connection issue.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            working = 0
            offline = 0
            all_onus = []
            
            # Parse ONU info with better parsing
            for line in output.split('\n'):
                line = line.strip()
                # Skip headers and separators
                if 'OnuIndex' in line or line.startswith('---') or line.startswith('gpon-olt'):
                    continue
                
                # Look for ONU lines
                if 'gpon-onu_' in line or ':' in line:
                    parts = line.split()
                    if len(parts) >= 4:
                        # Parse ONU interface to get ID
                        onu_if = parts[0]
                        onu_id = onu_if.split(':')[-1] if ':' in onu_if else parts[0]
                        
                        admin_state = parts[1] if len(parts) > 1 else '?'
                        omcc_state = parts[2] if len(parts) > 2 else '?'
                        phase_state = parts[3] if len(parts) > 3 else '?'
                        auth_state = parts[4] if len(parts) > 4 else '-'
                        
                        # Get ONU name from running-config (quick, only if needed for display)
                        onu_name = '-'
                        # Skip name fetch for quick scan to keep it fast
                        # Name will show in full scan mode
                        
                        is_working = 'working' in phase_state.lower()
                        if is_working:
                            working += 1
                            status = "✅"
                        else:
                            offline += 1
                            status = "❌"
                        
                        all_onus.append({
                            'port': f"1/1/{port}",
                            'id': onu_id,
                            'name': onu_name,
                            'admin': admin_state,
                            'omcc': omcc_state,
                            'phase': phase_state,
                            'auth': auth_state,
                            'status': status
                        })
            
            if not all_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
                await query.edit_message_text(
                    f"ℹ️ No ONU found on Port 1/1/{port}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Build message
            text = f"📊 *Quick Scan - Port 1/1/{port}*\n\n"
            text += "```\n"
            text += f"{'ID':<6} {'Name':<12} {'Admin':<8} {'OMCC':<6} {'Phase':<10} St\n"
            text += "─" * 48 + "\n"
            
            for onu in all_onus:
                name_display = onu['name'][:11] if onu['name'] != '-' else '-'
                admin_display = onu['admin'][:7]
                omcc_display = onu['omcc'][:5]
                phase_display = onu['phase'][:9]
                text += f"{onu['id']:<6} {name_display:<12} {admin_display:<8} {omcc_display:<6} {phase_display:<10} {onu['status']}\n"
            
            text += "```\n\n"
            text += f"*Summary:*\n"
            text += f"✅ Working: {working}\n"
            text += f"❌ Offline: {offline}\n"
            text += f"📊 Total: {len(all_onus)}\n"
            
            keyboard = [
                [InlineKeyboardButton("📈 Full Scan This Port", callback_data=f'status_full_port_{port}')],
                [InlineKeyboardButton("🔄 Refresh", callback_data=f'status_quick_port_{port}')],
                [InlineKeyboardButton("🔙 Back to Port Selection", callback_data='status_select_port')]
            ]
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in quick port scan: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def status_full_port_scan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Full scan with optical power for specific PON port"""
        query = update.callback_query
        await query.answer()
        
        port = int(query.data.split('_')[-1])
        
        try:
            await query.edit_message_text(
                f"⏳ Full scanning Port 1/1/{port} with optical power...\n\nPlease wait...",
                parse_mode='Markdown'
            )
            
            user_id = update.effective_user.id
            client = await self.get_client(user_id)
            
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_3')]]
                await query.edit_message_text(
                    "❌ Not connected to OLT. Please connect first.",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            pon_port = f"1/1/{port}"
            
            # Get ONU state
            cmd = f"show gpon onu state gpon-olt_{pon_port}"
            success, output = client.execute_command(cmd, timeout=5)
            
            if not success or 'Invalid' in output or 'error' in output.lower():
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
                await query.edit_message_text(
                    f"❌ Error scanning port {pon_port}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Get OLT Tx power for this port
            tx_power = None
            tx_cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
            tx_success, tx_output = client.execute_command(tx_cmd, timeout=5)
            if tx_success and tx_output:
                for line in tx_output.split('\n'):
                    if '(gpon)' in line.lower() and 'dbm' in line.lower():
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                tx_power = float(parts[1].replace('(dbm)', '').replace('dbm', '').strip())
                            except:
                                pass
                            break
            
            # Get Rx power for all ONUs on this port
            power_cmd = f"show pon power onu-rx gpon-olt_{pon_port}"
            power_success, power_output = client.execute_command(power_cmd, timeout=5)
            power_data = {}
            if power_success and power_output:
                for line in power_output.split('\n'):
                    if 'gpon-onu_' in line and 'dbm' in line.lower():
                        parts = line.split()
                        if len(parts) >= 2:
                            onu_if = parts[0].replace('gpon-onu_', '')
                            # Extract just the ONU ID
                            if ':' in onu_if:
                                onu_idx = onu_if.split(':')[-1]
                                power_data[onu_idx] = parts[1]
                            else:
                                power_data[onu_if] = parts[1]
            
            working = 0
            offline = 0
            all_onus = []
            
            # Parse ONU state info with better parsing and get names
            for line in output.split('\n'):
                line = line.strip()
                # Skip headers and separators
                if 'OnuIndex' in line or line.startswith('---') or line.startswith('gpon-olt'):
                    continue
                
                # Look for ONU lines
                if 'gpon-onu_' in line or ':' in line:
                    parts = line.split()
                    if len(parts) >= 4:
                        # Parse ONU interface to get ID
                        onu_if = parts[0]
                        onu_id = onu_if.split(':')[-1] if ':' in onu_if else parts[0]
                        
                        admin_state = parts[1] if len(parts) > 1 else '?'
                        omcc_state = parts[2] if len(parts) > 2 else '?'
                        phase_state = parts[3] if len(parts) > 3 else '?'
                        
                        # Get ONU name from running-config
                        onu_name = '-'
                        try:
                            name_cmd = f"show running-config interface gpon-onu_1/1/{port}:{onu_id}"
                            name_success, name_output = client.execute_command(name_cmd, timeout=3)
                            if name_success and name_output:
                                for nline in name_output.split('\n'):
                                    if 'name' in nline.lower() and 'interface' not in nline.lower():
                                        nparts = nline.split()
                                        if len(nparts) >= 2:
                                            onu_name = nparts[-1].strip('"\'')
                                            break
                        except:
                            pass
                        
                        is_working = 'working' in phase_state.lower()
                        if is_working:
                            working += 1
                            status = "✅"
                        else:
                            offline += 1
                            status = "❌"
                        
                        # Get Rx power
                        rx_power = power_data.get(onu_id, '-')
                        
                        # Calculate attenuation
                        atten = '-'
                        atten_ind = ''
                        if tx_power is not None and rx_power != '-':
                            try:
                                rx_val = float(rx_power.replace('(dbm)', '').replace('dbm', '').strip())
                                atten_val = tx_power - rx_val
                                atten = f"{atten_val:.1f}"
                                
                                # Indicator
                                if atten_val < 20:
                                    atten_ind = '✓'
                                elif atten_val < 25:
                                    atten_ind = '○'
                                elif atten_val < 28:
                                    atten_ind = '△'
                                else:
                                    atten_ind = '✗'
                            except:
                                pass
                        
                        all_onus.append({
                            'port': f"1/1/{port}",
                            'id': onu_id,
                            'name': onu_name,
                            'admin': admin_state,
                            'phase': phase_state,
                            'rx': rx_power if rx_power != '-' else '-',
                            'atten': atten,
                            'atten_ind': atten_ind,
                            'status': status
                        })
            
            if not all_onus:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
                await query.edit_message_text(
                    f"ℹ️ No ONU found on Port 1/1/{port}",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            # Store ONU data in context for detailed view
            context.user_data['status_port_onus'] = all_onus
            context.user_data['status_current_port'] = port
            
            # Build message
            text = f"📈 *Full Scan - Port 1/1/{port}*\n\n"
            text += "```\n"
            text += f"{'ID':<6} {'Name':<10} {'Phase':<9} {'RxPwr':<7} {'Att':<6} St\n"
            text += "─" * 48 + "\n"
            
            for onu in all_onus:
                name_display = onu['name'][:9] if onu['name'] != '-' else '-'
                phase_display = onu['phase'][:8]
                atten_display = f"{onu['atten']}{onu['atten_ind']}" if onu['atten'] != '-' else '-'
                rx_display = onu['rx'][:6] if onu['rx'] != '-' else '-'
                text += f"{onu['id']:<6} {name_display:<10} {phase_display:<9} {rx_display:<7} {atten_display:<6} {onu['status']}\n"
            
            text += "```\n\n"
            text += f"*Summary:*\n"
            text += f"✅ Working: {working}\n"
            text += f"❌ Offline: {offline}\n"
            text += f"📊 Total: {len(all_onus)}\n\n"
            text += "*Attenuation:*\n"
            text += "✓ Good (<20dB) | ○ Fair (20-25) | △ Poor (25-28) | ✗ Critical (>28)\n\n"
            text += "💡 Tap 'View ONU List' to see detailed info for each ONU"
            
            keyboard = []
            # Add button to view ONU list with details
            if len(all_onus) <= 10:
                keyboard.append([InlineKeyboardButton("📋 View ONU List (Detailed)", callback_data=f'status_onu_list_{port}')])
            keyboard.extend([
                [InlineKeyboardButton("📊 Quick Scan This Port", callback_data=f'status_quick_port_{port}')],
                [InlineKeyboardButton("🔄 Refresh", callback_data=f'status_full_port_{port}')],
                [InlineKeyboardButton("🔙 Back to Port Selection", callback_data='status_select_port')]
            ])
            
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
        except Exception as e:
            logger.error(f"Error in full port scan: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def status_show_onu_list(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show list of ONUs from status scan for detailed view"""
        query = update.callback_query
        await query.answer()
        
        port = int(query.data.split('_')[-1])
        onus = context.user_data.get('status_port_onus', [])
        
        if not onus:
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data=f'status_full_port_{port}')]]
            await query.edit_message_text(
                "❌ No ONU data found. Please scan again.",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return
        
        text = f"📋 *Select ONU for Detailed Info*\n\n"
        text += f"Port 1/1/{port} - {len(onus)} ONU(s)\n\n"
        
        keyboard = []
        for idx, onu in enumerate(onus):
            onu_name = onu['name'] if onu['name'] != '-' else f"ONU {onu['id']}"
            status_icon = onu['status']
            button_text = f"{status_icon} {onu['id']}: {onu_name}"
            keyboard.append([InlineKeyboardButton(button_text, callback_data=f'status_onu_detail_{idx}')])
        
        keyboard.append([InlineKeyboardButton("🔙 Back to Scan Results", callback_data=f'status_full_port_{port}')])
        
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def status_show_onu_detail(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show complete ONU details from status scan - sama seperti CLI"""
        query = update.callback_query
        await query.answer()
        
        try:
            onu_idx = int(query.data.split('_')[-1])
            onus = context.user_data.get('status_port_onus', [])
            port = context.user_data.get('status_current_port', 1)
            
            if onu_idx >= len(onus):
                await query.edit_message_text("❌ Invalid ONU selection")
                return
            
            onu = onus[onu_idx]
            onu_id = onu['id']
            
            await query.edit_message_text("⏳ Fetching complete ONU details...\n\n📡 Getting optical power...\n🔧 Getting equipment info...\n📊 Getting traffic stats...")
            
            # Reuse the show_onu_details logic but with our context
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            import re
            
            # Initialize variables
            rx_power = tx_power_onu = tx_power_olt = attenuation = distance = '-'
            onu_type = vendor = equipment_id = hw_version = sw_version = model = '-'
            admin_state = config_state = omcc_state = match_state = '-'
            uptime = online_duration = last_register = last_down_cause = dereg_reason = '-'
            last_up_time = last_down_time = '-'
            temperature = voltage = memory_usage = cpu_usage = '-'
            service_ports = vlan_config = '-'
            rx_bytes = tx_bytes = rx_packets = tx_packets = '-'
            rx_errors = tx_errors = '-'
            eth_ports = []
            mac_address = '-'
            
            # Get basic info from stored data
            sn = '-'
            status = onu.get('status', 'N/A')
            name = onu.get('name', 'N/A')
            phase = onu.get('phase', 'N/A')
            rx_power = onu.get('rx', '-')
            attenuation = onu.get('atten', '-')
            
            try:
                # 1. Get OLT Tx power
                pon_port = f"1/1/{port}"
                tx_cmd = f"show pon power olt-tx gpon-olt_{pon_port}"
                success, tx_output = client.execute_command(tx_cmd, timeout=10)
                if success and tx_output:
                    for line in tx_output.replace('\r\n', '\n').split('\n'):
                        line = line.strip()
                        if '(gpon)' in line.lower() and 'dbm' in line.lower():
                            parts = line.split()
                            if len(parts) >= 2:
                                power_str = parts[1].replace('(dbm)', '').replace('dbm', '').strip()
                                try:
                                    tx_power_olt = f"{float(power_str):.2f} dBm"
                                except:
                                    pass
                
                # 2. Get optical power and distance
                power_cmd = f"show pon power attenuation gpon-onu_1/1/{port}:{onu_id}"
                success, power_output = client.execute_command(power_cmd)
                
                if success:
                    dist_match = re.search(r'Distance\s*:\s*([-\d.]+)\s*\(m\)', power_output, re.IGNORECASE)
                    if dist_match:
                        distance = dist_match.group(1)
                
                # 3. Get detailed ONU info
                detail_cmd = f"show gpon onu detail-info gpon-onu_1/1/{port}:{onu_id}"
                success, detail_output = client.execute_command(detail_cmd)
                
                if success:
                    # Parse SN
                    sn_match = re.search(r'(?:SN|Serial\s*Number)\s*:\s*([A-Z0-9]+)', detail_output, re.IGNORECASE)
                    if sn_match:
                        sn = sn_match.group(1)
                    
                    # Parse device information
                    type_match = re.search(r'ONU\s+Type\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if type_match:
                        onu_type = type_match.group(1).strip()
                    
                    # Parse connection states
                    admin_match = re.search(r'Admin\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if admin_match:
                        admin_state = admin_match.group(1).strip()
                    
                    cfg_match = re.search(r'Config\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if cfg_match:
                        config_state = cfg_match.group(1).strip()
                    
                    omcc_match = re.search(r'OMCC\s+State\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if omcc_match:
                        omcc_state = omcc_match.group(1).strip()
                    
                    # Parse uptime and online duration
                    uptime_match = re.search(r'(?:Online|Up)\s*[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if uptime_match:
                        uptime = uptime_match.group(1).strip()
                    
                    online_duration_match = re.search(r'(?:Online|System)\s+[Dd]uration\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if online_duration_match:
                        online_duration = online_duration_match.group(1).strip()
                    elif uptime != '-':
                        online_duration = uptime  # Use uptime as online duration if not found separately
                    
                    # Parse last up time
                    last_up_match = re.search(r'Last\s+[Uu]p\s+[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if last_up_match:
                        last_up_time = last_up_match.group(1).strip()
                    
                    # Parse last down time
                    last_down_time_match = re.search(r'Last\s+[Dd]own\s+[Tt]ime\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if last_down_time_match:
                        last_down_time = last_down_time_match.group(1).strip()
                    
                    # Parse last down cause
                    down_match = re.search(r'Last\s+(?:Down|Dereg)\s+Cause\s*:\s*(.+)', detail_output, re.IGNORECASE)
                    if down_match:
                        last_down_cause = down_match.group(1).strip()
                    
                    # Parse distance from detail if not yet found
                    if distance == '-':
                        dist_match = re.search(r'Distance\s*:\s*([-\d.]+)', detail_output, re.IGNORECASE)
                        if dist_match:
                            distance = f"{dist_match.group(1)} m"
                
                # 4. Get equipment info (like CLI)
                equip_cmd = f"show gpon remote-onu equip gpon-onu_1/1/{port}:{onu_id}"
                success, equip_output = client.execute_command(equip_cmd, timeout=15)
                
                if success and equip_output:
                    for line in equip_output.replace('\r\n', '\n').split('\n'):
                        line = line.strip()
                        if ':' in line:
                            if 'Vendor' in line and 'ID' in line:
                                vendor = line.split(':', 1)[1].strip()
                            elif line.startswith('Model:'):
                                model = line.split(':', 1)[1].strip()
                            elif 'Equipment ID' in line:
                                equipment_id = line.split(':', 1)[1].strip()
                            elif 'Hardware Version' in line or 'H/W Version' in line:
                                hw_version = line.split(':', 1)[1].strip()
                            elif 'Software Version' in line or 'S/W Version' in line:
                                sw_version = line.split(':', 1)[1].strip()
                            elif 'System uptime' in line or line.startswith('Uptime'):
                                uptime_raw = line.split(':', 1)[1].strip()
                                # Convert seconds to readable format
                                try:
                                    seconds_match = re.search(r'([\d.]+)', uptime_raw)
                                    if seconds_match:
                                        seconds = int(float(seconds_match.group(1)))
                                        days = seconds // 86400
                                        hours = (seconds % 86400) // 3600
                                        minutes = (seconds % 3600) // 60
                                        parts = []
                                        if days > 0:
                                            parts.append(f"{days}d")
                                        if hours > 0:
                                            parts.append(f"{hours}h")
                                        if minutes > 0:
                                            parts.append(f"{minutes}m")
                                        if parts:
                                            uptime = ' '.join(parts)
                                except:
                                    pass
                            elif 'Memory' in line and '%' in line:
                                memory_usage = line.split(':', 1)[1].strip()
                            elif 'CPU' in line and '%' in line:
                                cpu_usage = line.split(':', 1)[1].strip()
                            elif 'Temperature' in line:
                                temp_match = re.search(r'([-\d.]+)', line.split(':', 1)[1])
                                if temp_match:
                                    temperature = f"{temp_match.group(1)}°C"
                            elif 'Voltage' in line:
                                volt_match = re.search(r'([-\d.]+)', line.split(':', 1)[1])
                                if volt_match:
                                    voltage = f"{volt_match.group(1)}V"
                
                # 5. Get ETH port status
                try:
                    eth_cmd = f"show gpon remote-onu interface gpon-onu_1/1/{port}:{onu_id} eth all state brief"
                    success, eth_output = client.execute_command(eth_cmd, timeout=10)
                    if success and eth_output:
                        for line in eth_output.replace('\r\n', '\n').split('\n'):
                            line = line.strip()
                            if 'eth_' in line.lower():
                                parts = line.split()
                                if len(parts) >= 3:
                                    eth_ports.append({
                                        'port': parts[0],
                                        'admin': parts[1] if len(parts) > 1 else '-',
                                        'link': parts[2] if len(parts) > 2 else '-',
                                        'speed': parts[3] if len(parts) > 3 else '-'
                                    })
                except:
                    pass
                
                # 6. Get traffic statistics
                try:
                    stat_cmd = f"show gpon remote-onu interface gpon-onu_1/1/{port}:{onu_id} statistic"
                    success, stat_output = client.execute_command(stat_cmd, timeout=10)
                    if success and stat_output:
                        # Parse RX/TX bytes and packets
                        rx_bytes_match = re.search(r'(?:RX|Receive)[^\n]*bytes[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if rx_bytes_match:
                            rx_bytes = rx_bytes_match.group(1).replace(',', '')
                        
                        tx_bytes_match = re.search(r'(?:TX|Transmit)[^\n]*bytes[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if tx_bytes_match:
                            tx_bytes = tx_bytes_match.group(1).replace(',', '')
                        
                        rx_packets_match = re.search(r'(?:RX|Receive)[^\n]*packets[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if rx_packets_match:
                            rx_packets = rx_packets_match.group(1).replace(',', '')
                        
                        tx_packets_match = re.search(r'(?:TX|Transmit)[^\n]*packets[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if tx_packets_match:
                            tx_packets = tx_packets_match.group(1).replace(',', '')
                        
                        rx_errors_match = re.search(r'(?:RX|Receive)[^\n]*errors[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if rx_errors_match:
                            rx_errors = rx_errors_match.group(1).replace(',', '')
                        
                        tx_errors_match = re.search(r'(?:TX|Transmit)[^\n]*errors[^\n]*:\s*([\d,]+)', stat_output, re.IGNORECASE)
                        if tx_errors_match:
                            tx_errors = tx_errors_match.group(1).replace(',', '')
                except:
                    pass
                
                # 7. Get service port info
                try:
                    sp_cmd = f"show gpon remote-onu interface gpon-onu_1/1/{port}:{onu_id} service-port"
                    success, sp_output = client.execute_command(sp_cmd)
                    if success:
                        sp_count = len(re.findall(r'service-port\s+\d+', sp_output, re.IGNORECASE))
                        if sp_count > 0:
                            service_ports = f"{sp_count} configured"
                            vlan_matches = re.findall(r'vlan\s+(\d+)', sp_output, re.IGNORECASE)
                            if vlan_matches:
                                vlan_config = ', '.join(sorted(set(vlan_matches), key=lambda x: int(x)))
                except:
                    pass
                
            except Exception as e:
                logger.error(f"Error fetching ONU details: {e}")
            
            # Helper function to format bytes
            def format_bytes(byte_str):
                try:
                    b = int(byte_str)
                    if b < 1024:
                        return f"{b} B"
                    elif b < 1024**2:
                        return f"{b/1024:.1f} KB"
                    elif b < 1024**3:
                        return f"{b/1024**2:.1f} MB"
                    else:
                        return f"{b/1024**3:.2f} GB"
                except:
                    return byte_str
            
            # Build comprehensive detailed info (same as CLI)
            result_text = f"📊 *Complete ONU Details*\n\n"
            
            # Basic Info
            result_text += f"*📍 INFORMASI ONU:*\n"
            result_text += f"PON: `1/1/{port}:{onu_id}`\n"
            result_text += f"📝 Name: {name}\n"
            result_text += f"🆔 SN: {sn}\n"
            result_text += f"📶 Status: {status}\n"
            result_text += f"⚙️ Phase: {phase}\n"
            if onu_type != '-':
                result_text += f"🔧 Type: {onu_type}\n"
            if admin_state != '-':
                result_text += f"Admin: {admin_state}\n"
            if config_state != '-':
                result_text += f"Config: {config_state}\n"
            result_text += f"⏱️ Online Duration: {online_duration}\n"
            result_text += f"🟢 Last Up Time: {last_up_time}\n"
            result_text += f"🔴 Last Down Time: {last_down_time}\n"
            if last_down_cause != '-':
                result_text += f"📉 Last Down: {last_down_cause}\n"
            result_text += "\n"
            
            # Optical Power & Attenuation
            result_text += f"*📡 OPTICAL POWER & REDAMAN:*\n"
            if tx_power_olt != '-':
                result_text += f"Tx (OLT): {tx_power_olt}\n"
            if rx_power != '-':
                result_text += f"Rx (ONU): {rx_power}"
                if '(' in rx_power:
                    result_text += "\n"
                else:
                    result_text += "(dbm)\n"
            if temperature != '-':
                result_text += f"🌡️ Temperature: {temperature}\n"
            if voltage != '-':
                result_text += f"⚡ Voltage: {voltage}\n"
            if distance != '-':
                result_text += f"📏 Distance: {distance}"
                if 'm' not in str(distance):
                    result_text += " m"
                result_text += "\n"
            
            # Redaman with quality indicator
            if attenuation != '-':
                result_text += f"📉 Redaman: {attenuation}"
                if 'dB' not in str(attenuation):
                    result_text += " dB"
                
                # Signal quality indicator
                try:
                    atten_str = str(attenuation).replace('✓', '').replace('○', '').replace('△', '').replace('✗', '').replace('dB', '').strip()
                    atten_val = float(atten_str)
                    if atten_val < 15:
                        result_text += " ✅ Excellent"
                    elif atten_val < 20:
                        result_text += " ✅ Good"
                    elif atten_val < 25:
                        result_text += " ⚠️ Fair"
                    elif atten_val < 28:
                        result_text += " ⚠️ Poor"
                    else:
                        result_text += " ❌ Critical"
                except:
                    pass
                result_text += "\n"
            
            if last_down_cause != '-':
                result_text += f"📉 Last Down: {last_down_cause}\n"
            result_text += "\n"
            
            # ETH Port Status
            if eth_ports:
                result_text += f"*🔌 ETH PORT STATUS:*\n"
                for eth_port in eth_ports:
                    link_icon = "🟢" if 'up' in eth_port['link'].lower() else "🔴"
                    result_text += f"{link_icon} {eth_port['port']}: {eth_port['link']}"
                    if eth_port['speed'] != '-':
                        result_text += f" ({eth_port['speed']})"
                    result_text += "\n"
                result_text += "\n"
            
            # Traffic Statistics
            has_traffic = any(v != '-' for v in [rx_bytes, tx_bytes, rx_packets, tx_packets])
            if has_traffic:
                result_text += f"*📊 TRAFFIC STATISTICS:*\n"
                if rx_bytes != '-':
                    result_text += f"📥 RX: {format_bytes(rx_bytes)}"
                    if rx_packets != '-':
                        result_text += f" ({rx_packets} pkt"
                        if rx_errors != '-' and rx_errors != '0':
                            result_text += f", {rx_errors} err"
                        result_text += ")"
                    result_text += "\n"
                if tx_bytes != '-':
                    result_text += f"📤 TX: {format_bytes(tx_bytes)}"
                    if tx_packets != '-':
                        result_text += f" ({tx_packets} pkt"
                        if tx_errors != '-' and tx_errors != '0':
                            result_text += f", {tx_errors} err"
                        result_text += ")"
                    result_text += "\n"
                result_text += "\n"
            
            # Equipment Info - Always show section if vendor or model found
            has_equipment = (vendor != '-' or model != '-' or equipment_id != '-' or 
                           hw_version != '-' or sw_version != '-' or 
                           memory_usage != '-' or cpu_usage != '-')
            
            if has_equipment:
                result_text += f"*🏭 EQUIPMENT INFO:*\n"
                if vendor != '-':
                    result_text += f"Vendor: {vendor}\n"
                if model != '-':
                    result_text += f"Model: {model}\n"
                if equipment_id != '-':
                    result_text += f"Equip ID: {equipment_id}\n"
                if hw_version != '-':
                    result_text += f"H/W Ver: {hw_version}\n"
                if sw_version != '-':
                    result_text += f"S/W Ver: {sw_version}\n"
                if memory_usage != '-':
                    result_text += f"💾 Memory: {memory_usage}\n"
                if cpu_usage != '-':
                    result_text += f"⚙️ CPU: {cpu_usage}\n"
                result_text += "\n"
            
            # Service Info
            if service_ports != '-' or vlan_config != '-':
                result_text += f"*🌐 SERVICE INFO:*\n"
                if service_ports != '-':
                    result_text += f"📊 Service Ports: {service_ports}\n"
                if vlan_config != '-':
                    result_text += f"🔖 VLANs: {vlan_config}\n"
                result_text += "\n"
            
            # Footer
            result_text += "💡 _Sama lengkap dengan CLI_"
            
            keyboard = [
                [InlineKeyboardButton("🔙 Back to ONU List", callback_data=f'status_onu_list_{port}')],
                [InlineKeyboardButton("🏠 Main Menu", callback_data='back_menu')]
            ]
            
            await query.edit_message_text(
                result_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error showing ONU details: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='status_select_port')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def snmp_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """SNMP Management - Menu 10"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show SNMP Config", callback_data='snmp_show')],
            [InlineKeyboardButton("⚙️ Configure SNMP", callback_data='snmp_config')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "📡 *SNMP Management*\n\n"
            "Manage SNMP settings:\n\n"
            "• Show SNMP Configuration\n"
            "• Configure SNMP Community\n"
            "• Configure SNMP Trap\n\n"
            "💡 Use CLI: Menu → System Config → SNMP",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def tr069_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """TR-069/ACS Configuration - Menu 11"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("📋 Show TR-069 Config", callback_data='tr069_show')],
            [InlineKeyboardButton("⚙️ Configure ACS", callback_data='tr069_config')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "☁️ *TR-069/ACS Configuration*\n\n"
            "Manage TR-069 ACS settings:\n\n"
            "• Show TR-069 Configuration\n"
            "• Configure ACS Server\n"
            "• Set ACS Credentials\n\n"
            "💡 Use CLI: Menu → System Config → TR-069",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def ntp_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """NTP & Time Configuration - Menu 12"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("🕐 Show Time Config", callback_data='ntp_show')],
            [InlineKeyboardButton("⚙️ Configure NTP", callback_data='ntp_config')],
            [InlineKeyboardButton("⏰ Set Time Zone", callback_data='ntp_timezone')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "🕐 *NTP & Time Configuration*\n\n"
            "Manage NTP and time settings:\n\n"
            "• Show Current Time & NTP\n"
            "• Configure NTP Server\n"
            "• Set Time Zone\n\n"
            "💡 Use CLI: Menu → System Config → NTP",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def user_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """User Management - Menu 13"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("👥 Show Users", callback_data='user_show')],
            [InlineKeyboardButton("➕ Add User", callback_data='user_add')],
            [InlineKeyboardButton("🔑 Change Password", callback_data='user_passwd')],
            [InlineKeyboardButton("❌ Delete User", callback_data='user_del')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            "👤 *User Management*\n\n"
            "Manage OLT user accounts:\n\n"
            "• Show User List\n"
            "• Add New User\n"
            "• Change Password\n"
            "• Delete User\n\n"
            "💡 Use CLI: Menu → System Config → User Management",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def system_info_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """System Information & Alarms - Menu 14 (sama dengan CLI)"""
        query = update.callback_query
        await query.answer()
        
        keyboard = [
            [InlineKeyboardButton("1️⃣ System Info", callback_data='sysinfo_basic')],
            [InlineKeyboardButton("2️⃣ System Overview", callback_data='sysinfo_overview')],
            [InlineKeyboardButton("3️⃣ Card Status", callback_data='sysinfo_card')],
            [InlineKeyboardButton("4️⃣ Active Alarms", callback_data='sysinfo_alarms')],
            [InlineKeyboardButton("5️⃣ Interface Status", callback_data='sysinfo_interface')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "ℹ️ *System Information & Alarms*\n\n"
            "1️⃣ *System Info*\n"
            "   → Version & Hostname\n\n"
            "2️⃣ *System Overview*\n"
            "   → Card, Version, Config\n\n"
            "3️⃣ *Card Status*\n"
            "   → Hardware card info\n\n"
            "4️⃣ *Active Alarms*\n"
            "   → Current system alarms\n\n"
            "5️⃣ *Interface Status*\n"
            "   → Network interfaces\n\n"
            "💡 Note: ZTE C320 tidak support\n"
            "   CPU/Memory/Temperature monitoring"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def sysinfo_basic(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show System Info (Version & Hostname)"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching system information...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            output = system_mgr.show_system_info()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sysinfo_basic')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_14')]
            ]
            
            await query.edit_message_text(
                f"ℹ️ *System Information*\n\n```\n{output}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sysinfo_overview(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show System Overview (Card, Version, Config)"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching system overview...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            output = system_mgr.show_system_status()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sysinfo_overview')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_14')]
            ]
            
            # Check if output is too long
            if len(output) > 3500:
                await self.send_long_output_as_file(
                    query, output, "System Overview", 
                    keyboard, "system_status"
                )
            else:
                await query.edit_message_text(
                    f"📊 *System Overview*\n\n```\n{output}\n```",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            
        except Exception as e:
            logger.error(f"Error getting system overview: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sysinfo_card(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Card Status"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching card status...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            output = system_mgr.show_card_status()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sysinfo_card')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_14')]
            ]
            
            await query.edit_message_text(
                f"💳 *Card Status*\n\n```\n{output}\n```",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error getting card status: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sysinfo_alarms(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Active Alarms"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching active alarms...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            output = system_mgr.show_alarm()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sysinfo_alarms')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_14')]
            ]
            
            # Check if output is too long
            if len(output) > 3500:
                await self.send_long_output_as_file(
                    query, output, "Active Alarms", 
                    keyboard, "alarms"
                )
            else:
                await query.edit_message_text(
                    f"⚠️ *Active Alarms*\n\n```\n{output}\n```",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            
        except Exception as e:
            logger.error(f"Error getting alarms: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sysinfo_interface(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Interface Status"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("⏳ Fetching interface status...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            system_mgr = OLTSystemManager(client)
            
            # Show all interfaces
            output = system_mgr.show_interface_status()
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sysinfo_interface')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_14')]
            ]
            
            # Check if output is too long
            if len(output) > 3500:
                await self.send_long_output_as_file(
                    query, output, "Interface Status", 
                    keyboard, "interface_status"
                )
            else:
                await query.edit_message_text(
                    f"🔌 *Interface Status*\n\n```\n{output}\n```",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            
        except Exception as e:
            logger.error(f"Error getting interface status: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_14')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sync_onu_data(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync ONU Data Menu - Menu 15 (sama dengan CLI)"""
        query = update.callback_query
        await query.answer()
        
        keyboard = [
            [InlineKeyboardButton("1️⃣ Sync Unconfigured ONU", callback_data='sync_uncfg')],
            [InlineKeyboardButton("2️⃣ Sync Working ONU", callback_data='sync_working')],
            [InlineKeyboardButton("3️⃣ Sync All ONU", callback_data='sync_all_onu')],
            [InlineKeyboardButton("4️⃣ Sync Profiles", callback_data='sync_profiles')],
            [InlineKeyboardButton("5️⃣ Sync Everything", callback_data='sync_everything')],
            [InlineKeyboardButton("🔙 Back", callback_data='back_menu')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        text = (
            "🔄 *Sync ONU Data*\n\n"
            "Pilih data yang akan di-sync:\n\n"
            "1️⃣ *Sync Unconfigured ONU*\n"
            "   → ONU belum terdaftar\n\n"
            "2️⃣ *Sync Working ONU*\n"
            "   → ONU yang sudah terdaftar\n\n"
            "3️⃣ *Sync All ONU*\n"
            "   → Unconfigured + Working\n\n"
            "4️⃣ *Sync Profiles*\n"
            "   → TCONT, Traffic, Line, Service\n\n"
            "5️⃣ *Sync Everything*\n"
            "   → ONU + Profiles (Complete)"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def sync_unconfigured_onu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync Unconfigured ONU only"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("🔄 *Syncing Unconfigured ONU...*", parse_mode='Markdown')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            uncfg_onus = wizard.fetch_unconfigured_onus()
            
            # Build result message
            msg = "✅ *Sync Unconfigured ONU Complete*\n\n"
            msg += f"📊 Found: *{len(uncfg_onus)}* unconfigured ONU\n\n"
            
            if uncfg_onus:
                msg += "📋 *List (max 10):*\n"
                msg += "```\n"
                for idx, onu in enumerate(uncfg_onus[:10], 1):
                    pon = onu.get('pon_port', 'N/A')
                    sn = onu.get('sn', 'N/A')
                    model = onu.get('model', 'N/A')[:15]
                    msg += f"{idx}. PON {pon} - {sn}\n"
                msg += "```"
                if len(uncfg_onus) > 10:
                    msg += f"\n... dan {len(uncfg_onus) - 10} lainnya"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sync_uncfg')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_15')]
            ]
            
            await query.edit_message_text(
                msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error syncing unconfigured ONU: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sync_working_onu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync Working ONU only"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("🔄 *Syncing Working ONU...*", parse_mode='Markdown')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            working_onus = wizard.fetch_all_working_onus()
            
            # Build result message
            msg = "✅ *Sync Working ONU Complete*\n\n"
            msg += f"📊 Found: *{len(working_onus)}* working ONU\n\n"
            
            if working_onus:
                msg += "📋 *List (max 10):*\n"
                msg += "```\n"
                for idx, onu in enumerate(working_onus[:10], 1):
                    pon = onu.get('pon_port', 'N/A').replace('gpon-olt_', '').replace('gpon_olt-', '')
                    onu_id = onu.get('onu_id', 'N/A')
                    name = onu.get('name', 'N/A')[:15]
                    status = onu.get('status', 'N/A')[:8]
                    msg += f"{idx}. {pon}:{onu_id} {name}\n"
                msg += "```"
                if len(working_onus) > 10:
                    msg += f"\n... dan {len(working_onus) - 10} lainnya"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sync_working')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_15')]
            ]
            
            await query.edit_message_text(
                msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error syncing working ONU: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sync_all_onu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync All ONU (Unconfigured + Working)"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("🔄 *Syncing All ONU Data...*", parse_mode='Markdown')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            # Sync both
            await query.edit_message_text("🔄 *[1/2] Syncing Unconfigured ONU...*", parse_mode='Markdown')
            uncfg_onus = wizard.fetch_unconfigured_onus()
            
            await query.edit_message_text("🔄 *[2/2] Syncing Working ONU...*", parse_mode='Markdown')
            working_onus = wizard.fetch_all_working_onus()
            
            # Build result message
            msg = "✅ *Sync All ONU Complete*\n\n"
            msg += "=" * 30 + "\n"
            msg += f"📊 Unconfigured: *{len(uncfg_onus)}* ONU\n"
            msg += f"📊 Working: *{len(working_onus)}* ONU\n"
            msg += f"📊 Total: *{len(uncfg_onus) + len(working_onus)}* ONU\n"
            msg += "=" * 30 + "\n\n"
            
            if uncfg_onus:
                msg += "🔍 *Unconfigured (max 5):*\n"
                for idx, onu in enumerate(uncfg_onus[:5], 1):
                    pon = onu.get('pon_port', 'N/A')
                    sn = onu.get('sn', 'N/A')
                    msg += f"  {idx}. PON {pon} - {sn}\n"
                if len(uncfg_onus) > 5:
                    msg += f"  ... +{len(uncfg_onus) - 5} more\n"
                msg += "\n"
            
            if working_onus:
                msg += "✅ *Working (max 5):*\n"
                for idx, onu in enumerate(working_onus[:5], 1):
                    pon = onu.get('pon_port', 'N/A').replace('gpon-olt_', '').replace('gpon_olt-', '')
                    onu_id = onu.get('onu_id', 'N/A')
                    name = onu.get('name', 'N/A')[:12]
                    msg += f"  {idx}. {pon}:{onu_id} {name}\n"
                if len(working_onus) > 5:
                    msg += f"  ... +{len(working_onus) - 5} more\n"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sync_all_onu')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_15')]
            ]
            
            await query.edit_message_text(
                msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error syncing all ONU: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sync_profiles(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync Profiles (TCONT, Traffic, Line, Service)"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("🔄 *Syncing Profiles...*", parse_mode='Markdown')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            # Sync profiles
            await query.edit_message_text("🔄 *[1/2] Syncing TCONT Profiles...*", parse_mode='Markdown')
            tcont_profiles = wizard.fetch_tcont_profiles()
            
            await query.edit_message_text("🔄 *[2/2] Syncing Traffic Profiles...*", parse_mode='Markdown')
            traffic_profiles = wizard.fetch_traffic_profiles()
            
            # Build result message
            msg = "✅ *Sync Profiles Complete*\n\n"
            msg += "=" * 30 + "\n"
            msg += f"📊 TCONT Profiles: *{len(tcont_profiles)}*\n"
            msg += f"📊 Traffic Profiles: *{len(traffic_profiles)}*\n"
            msg += "=" * 30 + "\n\n"
            
            if tcont_profiles:
                tcont_str = ", ".join(tcont_profiles[:8])
                msg += f"📤 *TCONT:*\n`{tcont_str}`"
                if len(tcont_profiles) > 8:
                    msg += f" +{len(tcont_profiles) - 8} more"
                msg += "\n\n"
            
            if traffic_profiles:
                traffic_str = ", ".join(traffic_profiles[:8])
                msg += f"📥 *Traffic:*\n`{traffic_str}`"
                if len(traffic_profiles) > 8:
                    msg += f" +{len(traffic_profiles) - 8} more"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh", callback_data='sync_profiles')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_15')]
            ]
            
            await query.edit_message_text(
                msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error syncing profiles: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def sync_everything(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Sync Everything (ONU + Profiles) - Complete sync"""
        query = update.callback_query
        await query.answer()
        
        await query.edit_message_text("🔄 *Syncing Everything...*", parse_mode='Markdown')
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
                await query.edit_message_text(
                    "❌ Cannot connect to OLT",
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return
            
            from scripts.onu_register_wizard import ONURegistrationWizard
            wizard = ONURegistrationWizard(client)
            
            # Sync all data
            await query.edit_message_text("🔄 *[1/4] Syncing Unconfigured ONU...*", parse_mode='Markdown')
            uncfg_onus = wizard.fetch_unconfigured_onus()
            
            await query.edit_message_text("🔄 *[2/4] Syncing Working ONU...*", parse_mode='Markdown')
            working_onus = wizard.fetch_all_working_onus()
            
            await query.edit_message_text("🔄 *[3/4] Syncing TCONT Profiles...*", parse_mode='Markdown')
            tcont_profiles = wizard.fetch_tcont_profiles()
            
            await query.edit_message_text("🔄 *[4/4] Syncing Traffic Profiles...*", parse_mode='Markdown')
            traffic_profiles = wizard.fetch_traffic_profiles()
            
            # Build result message
            msg = "✅ *SYNC COMPLETE!*\n\n"
            msg += "=" * 30 + "\n"
            msg += "📊 *ONU Data:*\n"
            msg += f"   • Unconfigured: *{len(uncfg_onus)}*\n"
            msg += f"   • Working: *{len(working_onus)}*\n"
            msg += f"   • Total: *{len(uncfg_onus) + len(working_onus)}*\n\n"
            msg += "📊 *Profiles:*\n"
            msg += f"   • TCONT: *{len(tcont_profiles)}*\n"
            msg += f"   • Traffic: *{len(traffic_profiles)}*\n"
            msg += "=" * 30 + "\n\n"
            
            # Summary
            if uncfg_onus:
                msg += f"🔍 *Unconfigured:* {len(uncfg_onus)} ONU ready to register\n"
            if working_onus:
                msg += f"✅ *Working:* {len(working_onus)} ONU online\n"
            if tcont_profiles:
                msg += f"📤 *TCONT:* {', '.join(tcont_profiles[:5])}"
                if len(tcont_profiles) > 5:
                    msg += f" +{len(tcont_profiles) - 5}"
                msg += "\n"
            if traffic_profiles:
                msg += f"📥 *Traffic:* {', '.join(traffic_profiles[:5])}"
                if len(traffic_profiles) > 5:
                    msg += f" +{len(traffic_profiles) - 5}"
            
            keyboard = [
                [InlineKeyboardButton("🔄 Refresh All", callback_data='sync_everything')],
                [InlineKeyboardButton("🔙 Back", callback_data='menu_15')]
            ]
            
            await query.edit_message_text(
                msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error syncing everything: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='menu_15')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

    async def show_running_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show Running Config - Menu 17"""
        query = update.callback_query
        
        await query.edit_message_text("📄 Fetching running configuration...")
        
        try:
            client = await self.get_client(query.from_user.id)
            if not client:
                await query.edit_message_text("❌ Cannot connect to OLT")
                return
            
            from scripts.olt_system_manager import OLTSystemManager
            sys_mgr = OLTSystemManager(client)
            
            # Get running config with increased timeout
            output = sys_mgr.show_running_config()
            
            if not output or "Error:" in output:
                await query.edit_message_text("❌ Failed to get running config")
                return
            
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='back_menu')]]
            
            # Telegram message limit is 4096 characters
            # If output is longer than 3500 chars, send as file
            if len(output) > 3500:
                await self.send_long_output_as_file(
                    query, output, "Running Configuration", 
                    keyboard, "running_config"
                )
            else:
                # Send as message if short enough
                reply_markup = InlineKeyboardMarkup(keyboard)
                await query.edit_message_text(
                    f"📄 *Running Configuration*\n\n```\n{output}\n```",
                    reply_markup=reply_markup,
                    parse_mode='Markdown'
                )
            
        except Exception as e:
            logger.error(f"Error showing running config: {e}")
            keyboard = [[InlineKeyboardButton("🔙 Back", callback_data='back_menu')]]
            await query.edit_message_text(
                f"❌ Error: {str(e)}",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
    
    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Cancel current operation"""
        # Handle both message and callback query
        if update.callback_query:
            await update.callback_query.edit_message_text(
                "❌ Registration cancelled.\n\nUse /menu to start over."
            )
        else:
            await update.message.reply_text(
                "❌ Operation cancelled.\n\nUse /menu to start over."
            )
        # Clear wizard data
        context.user_data.clear()
        return ConversationHandler.END
    
    # ==================== REGISTRATION WIZARD ====================
    
    async def reg_wizard_entry(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Entry point for registration wizard when user clicks regonu_ button"""
        query = update.callback_query
        await query.answer()
        
        try:
            onu_idx = int(query.data.replace('regonu_', ''))
            uncfg_onus = context.user_data.get('uncfg_onus', [])
            
            if onu_idx >= len(uncfg_onus):
                await query.edit_message_text("❌ ONU not found. Please refresh the list.")
                return ConversationHandler.END
            
            onu = uncfg_onus[onu_idx]
            
            # Start registration wizard
            return await self.start_registration_wizard(update, context, onu)
            
        except Exception as e:
            logger.error(f"Error starting registration wizard: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END
    
    async def start_registration_wizard(self, update: Update, context: ContextTypes.DEFAULT_TYPE, onu: dict):
        """Start ONU registration wizard - Step 1: Select ONU Type"""
        query = update.callback_query
        await query.answer()
        
        # Store ONU data in context
        context.user_data['reg_onu'] = onu
        context.user_data['reg_data'] = {}
        
        port = onu.get('pon_port', '?')
        sn = onu.get('sn', 'Unknown')
        model = onu.get('model', 'Unknown')
        
        # Show ONU info
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 1 of 6: Select ONU Type*\n\n"
            f"📍 PON Port: `{port}`\n"
            f"📟 Serial Number: `{sn}`\n"
        )
        if model and model != 'Unknown' and model != '-':
            text += f"📱 Detected Model: {model}\n"
        
        text += f"\n🔍 Fetching ONU types from OLT..."
        
        await query.edit_message_text(text, parse_mode='Markdown')
        
        # Fetch ONU types
        client = await self.get_client(query.from_user.id)
        if not client:
            await query.edit_message_text("❌ Cannot connect to OLT")
            return ConversationHandler.END
        
        wizard = ONURegistrationWizard(client)
        wizard.fetch_onu_types()
        onu_types = wizard.onu_types
        
        if not onu_types:
            onu_types = ['F601', 'F609', 'F670L', 'F672', 'HG6145D', 'EG8145', 'Manual']
        
        # Store types in context
        context.user_data['onu_types'] = onu_types
        
        # Build keyboard (show first 12 types)
        keyboard = []
        for idx, onu_type in enumerate(onu_types[:12]):
            keyboard.append([InlineKeyboardButton(
                f"📱 {onu_type}", 
                callback_data=f"regtype_{idx}"
            )])
        
        # Add Manual option
        keyboard.append([InlineKeyboardButton("✏️ Manual Input", callback_data="regtype_manual")])
        keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")])
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 1 of 6: Select ONU Type*\n\n"
            f"📍 PON Port: `{port}`\n"
            f"📟 Serial Number: `{sn}`\n\n"
            f"Select ONU Type from list:\n"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_SELECT_TYPE
    
    async def reg_type_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler for ONU type selection - Move to Step 2: Input ONU ID"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "regtype_manual":
            # Ask for manual input
            await query.edit_message_text(
                "✏️ *Manual ONU Type Input*\n\n"
                "Please type the ONU Type name:\n"
                "(e.g., F609, F670L, HG6145D)\n\n"
                "Or /cancel to abort",
                parse_mode='Markdown'
            )
            return REG_INPUT_NAME  # Will be handled by text handler
        
        # Get selected type
        type_idx = int(query.data.replace('regtype_', ''))
        onu_types = context.user_data.get('onu_types', [])
        
        if type_idx >= len(onu_types):
            await query.edit_message_text("❌ Invalid selection")
            return ConversationHandler.END
        
        selected_type = onu_types[type_idx]
        context.user_data['reg_data']['onu_type'] = selected_type
        
        # Move to Step 2: Input ONU ID
        onu = context.user_data.get('reg_onu', {})
        port = onu.get('pon_port', '?')
        
        # Get next available ONU ID
        client = await self.get_client(query.from_user.id)
        wizard = ONURegistrationWizard(client)
        next_id = wizard.get_next_onu_id(port)
        
        context.user_data['reg_data']['suggested_id'] = next_id
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 2 of 6: Input ONU ID*\n\n"
            f"📍 PON Port: `{port}`\n"
            f"📱 Type: `{selected_type}`\n\n"
            f"💡 Next available ID: *{next_id}*\n\n"
            f"Please type ONU ID (1-128):\n"
            f"Or tap button to use suggested ID"
        )
        
        keyboard = [
            [InlineKeyboardButton(f"✅ Use ID {next_id}", callback_data=f"regid_{next_id}")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_INPUT_ID
    
    async def reg_id_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler for ONU ID - Move to Step 3: Input Name"""
        # Handle callback (button click) or text message
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            # Extract ID from callback
            onu_id = int(query.data.replace('regid_', ''))
            message = query.message
            is_edit = True
        else:
            # Text input
            try:
                onu_id = int(update.message.text.strip())
                if onu_id < 1 or onu_id > 128:
                    await update.message.reply_text(
                        "❌ Invalid ID. Please enter number between 1-128:"
                    )
                    return REG_INPUT_ID
            except ValueError:
                await update.message.reply_text(
                    "❌ Please enter a valid number (1-128):"
                )
                return REG_INPUT_ID
            
            message = update.message
            is_edit = False
        
        context.user_data['reg_data']['onu_id'] = onu_id
        
        # Move to Step 3: Input Name
        onu = context.user_data.get('reg_onu', {})
        port = onu.get('pon_port', '?')
        onu_type = context.user_data['reg_data']['onu_type']
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 3 of 6: Input Name & Description*\n\n"
            f"📍 PON Port: `{port}`\n"
            f"📱 Type: `{onu_type}`\n"
            f"🆔 ID: `{onu_id}`\n\n"
            f"Please type ONU Name:\n"
            f"(no spaces, e.g., ONU-Customer-001)\n\n"
            f"Or /cancel to abort"
        )
        
        if is_edit:
            await message.edit_text(text, parse_mode='Markdown')
        else:
            await message.reply_text(text, parse_mode='Markdown')
        
        return REG_INPUT_NAME
    
    async def reg_name_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler for name input - Move to Step 4: Description"""
        name = update.message.text.strip()
        
        # Validate: no spaces
        if ' ' in name:
            await update.message.reply_text(
                "❌ Name cannot contain spaces.\n"
                "Please enter again (e.g., ONU-Customer-001):"
            )
            return REG_INPUT_NAME
        
        context.user_data['reg_data']['onu_name'] = name
        
        # Ask for description
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 3b: Description (Optional)*\n\n"
            f"✅ Name: `{name}`\n\n"
            f"Please type Description:\n"
            f"(optional, or type 'skip')\n\n"
            f"Or /cancel to abort"
        )
        
        await update.message.reply_text(text, parse_mode='Markdown')
        
        return REG_INPUT_DESC
    
    async def reg_desc_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler for description - Move to Step 4: Select Service"""
        desc = update.message.text.strip()
        
        if desc.lower() != 'skip':
            context.user_data['reg_data']['description'] = desc
        else:
            context.user_data['reg_data']['description'] = ''
        
        # Show service type selection
        onu = context.user_data.get('reg_onu', {})
        reg_data = context.user_data['reg_data']
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 4 of 6: Select Service Type*\n\n"
            f"📍 PON: `{onu.get('pon_port')}`\n"
            f"📱 Type: `{reg_data['onu_type']}`\n"
            f"🆔 ID: `{reg_data['onu_id']}`\n"
            f"✏️ Name: `{reg_data['onu_name']}`\n\n"
            f"Select service configuration:"
        )
        
        keyboard = [
            [InlineKeyboardButton("🌐 PPPOE (Internet Dial-up)", callback_data="regsvc_pppoe")],
            [InlineKeyboardButton("🌉 Bridge (Transparent)", callback_data="regsvc_bridge")],
            [InlineKeyboardButton("📡 Static IP", callback_data="regsvc_static")],
            [InlineKeyboardButton("🏷️ VLAN Only (Basic)", callback_data="regsvc_vlan")],
            [InlineKeyboardButton("🔥 Fiberhome VEIP (TR069+Multi VLAN)", callback_data="regsvc_fiberhome_veip")],
            [InlineKeyboardButton("⚡ ZTE Full (Dual SSID+VLAN+TR069)", callback_data="regsvc_zte_full")],
            [InlineKeyboardButton("🌟 Huawei Full (Multi VLAN+WAN)", callback_data="regsvc_huawei_full")],
            [InlineKeyboardButton("⏭️ Skip Service Config", callback_data="regsvc_skip")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_SELECT_SERVICE
    
    async def reg_service_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handler for service type - Branch to specific service config"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        service_type = query.data.replace('regsvc_', '')
        context.user_data['reg_data']['service_type'] = service_type
        
        # Branch based on service type
        if service_type == 'pppoe':
            text = (
                f"🌐 *PPPOE Configuration*\n\n"
                f"Please type PPPoE Username:\n"
                f"(e.g., user@isp.com)\n\n"
                f"Or /cancel to abort"
            )
            await query.edit_message_text(text, parse_mode='Markdown')
            return REG_PPPOE_USER
        
        elif service_type == 'static':
            text = (
                f"📡 *Static IP Configuration*\n\n"
                f"Please type IP Address:\n"
                f"(e.g., 192.168.1.100)\n\n"
                f"Or /cancel to abort"
            )
            await query.edit_message_text(text, parse_mode='Markdown')
            return REG_STATIC_IP
        
        elif service_type == 'fiberhome_veip':
            # Start Fiberhome VEIP wizard
            return await self.reg_fiberhome_start(update, context)
        
        elif service_type == 'zte_full':
            # Start ZTE Full wizard
            return await self.reg_zte_start(update, context)
        
        elif service_type == 'huawei_full':
            # Start Huawei Full wizard
            return await self.reg_huawei_start(update, context)
        
        else:
            # Bridge or VLAN or Skip - go to TCONT selection
            return await self.reg_select_tcont(update, context)
    
    async def reg_pppoe_user_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get PPPoE username, ask for password"""
        username = update.message.text.strip()
        context.user_data['reg_data']['pppoe_user'] = username
        
        await update.message.reply_text(
            f"✅ Username: `{username}`\n\n"
            f"Now type PPPoE Password:",
            parse_mode='Markdown'
        )
        
        return REG_PPPOE_PASS
    
    async def reg_pppoe_pass_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get PPPoE password, move to TCONT"""
        password = update.message.text.strip()
        context.user_data['reg_data']['pppoe_pass'] = password
        
        await update.message.reply_text(
            f"✅ Password saved\n\n"
            f"Proceeding to profile selection..."
        )
        
        # Move to TCONT selection
        return await self.reg_select_tcont(update, context)
    
    async def reg_static_ip_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get Static IP, ask for netmask"""
        ip = update.message.text.strip()
        
        # Basic IP validation
        import re
        if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
            await update.message.reply_text(
                "❌ Invalid IP format. Please enter again:"
            )
            return REG_STATIC_IP
        
        context.user_data['reg_data']['static_ip'] = ip
        
        keyboard = [
            [InlineKeyboardButton("255.255.255.0 (default)", callback_data="netmask_default")],
            [InlineKeyboardButton("Manual Input", callback_data="netmask_manual")]
        ]
        
        await update.message.reply_text(
            f"✅ IP: `{ip}`\n\n"
            f"Select Netmask:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_STATIC_MASK
    
    async def reg_static_mask_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get netmask, ask for gateway"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "netmask_default":
                netmask = "255.255.255.0"
                context.user_data['reg_data']['static_mask'] = netmask
                
                await query.edit_message_text(
                    f"✅ Netmask: `{netmask}`\n\n"
                    f"Now type Gateway IP:\n"
                    f"(or type 'skip')",
                    parse_mode='Markdown'
                )
                return REG_STATIC_GW
            else:
                await query.edit_message_text(
                    "Please type Netmask:\n(e.g., 255.255.255.0)"
                )
                return REG_STATIC_MASK
        else:
            netmask = update.message.text.strip()
            context.user_data['reg_data']['static_mask'] = netmask
            
            await update.message.reply_text(
                f"✅ Netmask: `{netmask}`\n\n"
                f"Now type Gateway IP:\n"
                f"(or type 'skip')",
                parse_mode='Markdown'
            )
            return REG_STATIC_GW
    
    async def reg_static_gw_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get gateway, move to TCONT"""
        gw = update.message.text.strip()
        
        if gw.lower() != 'skip':
            context.user_data['reg_data']['static_gw'] = gw
        else:
            context.user_data['reg_data']['static_gw'] = ''
        
        await update.message.reply_text(
            "✅ Static IP config saved\n\n"
            "Proceeding to profile selection..."
        )
        
        return await self.reg_select_tcont(update, context)
    
    # ==================== FIBERHOME VEIP WIZARD ====================
    
    async def reg_fiberhome_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start Fiberhome VEIP configuration wizard"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("VLAN 100 (common)", callback_data="fhtr069_100")],
            [InlineKeyboardButton("VLAN 1010 (management)", callback_data="fhtr069_1010")],
            [InlineKeyboardButton("Manual Input", callback_data="fhtr069_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await query.edit_message_text(
            "🔥 *Fiberhome VEIP Configuration*\n\n"
            "*Step 1: TR069/Management VLAN*\n\n"
            "Select TR069/ACS Management VLAN:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_FH_TR069_VLAN
    
    async def reg_fh_tr069_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome TR069 VLAN selection"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "fhtr069_manual":
                await query.edit_message_text("Please type TR069 VLAN ID (1-4094):")
                return REG_FH_TR069_VLAN
            else:
                vlan = int(query.data.replace('fhtr069_', ''))
                context.user_data['reg_data']['fh_tr069_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN. Enter 1-4094:")
                    return REG_FH_TR069_VLAN
                context.user_data['reg_data']['fh_tr069_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Please enter a valid number:")
                return REG_FH_TR069_VLAN
        
        # Ask for Internet VLAN
        keyboard = [
            [InlineKeyboardButton("VLAN 30 (internet)", callback_data="fhinet_30")],
            [InlineKeyboardButton("VLAN 100", callback_data="fhinet_100")],
            [InlineKeyboardButton("Manual Input", callback_data="fhinet_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ TR069 VLAN: {vlan}\n\n"
            f"*Step 2: Internet/IPTV VLAN*\n\n"
            f"Select Internet/IPTV VLAN:"
        )
        
        if is_query:
            await query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        
        return REG_FH_INTERNET_VLAN
    
    async def reg_fh_internet_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome Internet VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "fhinet_manual":
                await query.edit_message_text("Please type Internet VLAN ID (1-4094):")
                return REG_FH_INTERNET_VLAN
            else:
                vlan = int(query.data.replace('fhinet_', ''))
                context.user_data['reg_data']['fh_internet_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN. Enter 1-4094:")
                    return REG_FH_INTERNET_VLAN
                context.user_data['reg_data']['fh_internet_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_FH_INTERNET_VLAN
        
        # Ask for VoIP VLAN
        keyboard = [
            [InlineKeyboardButton("VLAN 151 (voip)", callback_data="fhvoip_151")],
            [InlineKeyboardButton("VLAN 200", callback_data="fhvoip_200")],
            [InlineKeyboardButton("Manual Input", callback_data="fhvoip_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ Internet VLAN: {vlan}\n\n"
            f"*Step 3: VoIP VLAN*\n\n"
            f"Select VoIP VLAN:"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_FH_VOIP_VLAN
    
    async def reg_fh_voip_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome VoIP VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "fhvoip_manual":
                await query.edit_message_text("Please type VoIP VLAN ID (1-4094):")
                return REG_FH_VOIP_VLAN
            else:
                vlan = int(query.data.replace('fhvoip_', ''))
                context.user_data['reg_data']['fh_voip_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_FH_VOIP_VLAN
                context.user_data['reg_data']['fh_voip_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_FH_VOIP_VLAN
        
        # Ask for ACS URL
        text = (
            f"✅ VoIP VLAN: {vlan}\n\n"
            f"*Step 4: ACS/TR069 Configuration*\n\n"
            f"Please type ACS URL:\n"
            f"(e.g., http://192.168.54.254:7547)\n\n"
            f"Or type 'default' for default URL"
        )
        
        if is_query:
            await query.edit_message_text(text, parse_mode='Markdown')
        else:
            await update.message.reply_text(text, parse_mode='Markdown')
        
        return REG_FH_ACS_URL
    
    async def reg_fh_acs_url(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome ACS URL"""
        url = update.message.text.strip()
        
        if url.lower() == 'default':
            url = 'http://192.168.54.254:7547'
        
        context.user_data['reg_data']['fh_acs_url'] = url
        
        await update.message.reply_text(
            f"✅ ACS URL: `{url}`\n\n"
            f"Please type ACS Username:\n"
            f"(or type 'default' for 'acs')",
            parse_mode='Markdown'
        )
        
        return REG_FH_ACS_USER
    
    async def reg_fh_acs_user(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome ACS Username"""
        user = update.message.text.strip()
        
        if user.lower() == 'default':
            user = 'acs'
        
        context.user_data['reg_data']['fh_acs_user'] = user
        
        await update.message.reply_text(
            f"✅ ACS Username: `{user}`\n\n"
            f"Please type ACS Password:\n"
            f"(or type 'default' for 'acs')",
            parse_mode='Markdown'
        )
        
        return REG_FH_ACS_PASS
    
    async def reg_fh_acs_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Fiberhome ACS Password - Complete, go to TCONT"""
        password = update.message.text.strip()
        
        if password.lower() == 'default':
            password = 'acs'
        
        context.user_data['reg_data']['fh_acs_pass'] = password
        
        await update.message.reply_text(
            "✅ Fiberhome VEIP configuration saved\n\n"
            "Proceeding to profile selection..."
        )
        
        return await self.reg_select_tcont(update, context)
    
    # ==================== ZTE FULL WIZARD ====================
    
    async def reg_zte_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start ZTE Full configuration wizard"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("VLAN 30 (internet)", callback_data="ztepri_30")],
            [InlineKeyboardButton("VLAN 100", callback_data="ztepri_100")],
            [InlineKeyboardButton("Manual Input", callback_data="ztepri_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await query.edit_message_text(
            "⚡ *ZTE Full Configuration*\n\n"
            "*Step 1/8: Primary/Internet VLAN*\n\n"
            "Select Primary/Internet VLAN:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_PRIMARY_VLAN
    
    async def reg_zte_primary_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE Primary VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "ztepri_manual":
                await query.edit_message_text("Please type Primary VLAN ID (1-4094):")
                return REG_ZTE_PRIMARY_VLAN
            else:
                vlan = int(query.data.replace('ztepri_', ''))
                context.user_data['reg_data']['zte_primary_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_ZTE_PRIMARY_VLAN
                context.user_data['reg_data']['zte_primary_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_ZTE_PRIMARY_VLAN
        
        # Ask for Secondary VLAN
        keyboard = [
            [InlineKeyboardButton("VLAN 151 (voucher)", callback_data="ztesec_151")],
            [InlineKeyboardButton("VLAN 200", callback_data="ztesec_200")],
            [InlineKeyboardButton("Manual Input", callback_data="ztesec_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ Primary VLAN: {vlan}\n\n"
            f"*Step 2/8: Secondary/Voucher VLAN*\n\n"
            f"Select Secondary/Voucher VLAN:"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_ZTE_SECONDARY_VLAN
    
    async def reg_zte_secondary_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE Secondary VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "ztesec_manual":
                await query.edit_message_text("Please type Secondary VLAN ID (1-4094):")
                return REG_ZTE_SECONDARY_VLAN
            else:
                vlan = int(query.data.replace('ztesec_', ''))
                context.user_data['reg_data']['zte_secondary_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_ZTE_SECONDARY_VLAN
                context.user_data['reg_data']['zte_secondary_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_ZTE_SECONDARY_VLAN
        
        # Use defaults for ETH port assignment - semua ke primary VLAN sesuai template
        primary_vlan = context.user_data['reg_data']['zte_primary_vlan']
        context.user_data['reg_data']['zte_eth1_vlan'] = primary_vlan
        context.user_data['reg_data']['zte_eth2_vlan'] = primary_vlan
        context.user_data['reg_data']['zte_eth3_vlan'] = primary_vlan
        context.user_data['reg_data']['zte_eth4_vlan'] = primary_vlan
        
        # Ask for PPPoE
        keyboard = [
            [InlineKeyboardButton("✅ Yes, enable PPPoE", callback_data="ztepppoe_yes")],
            [InlineKeyboardButton("❌ No, skip PPPoE", callback_data="ztepppoe_no")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ Secondary VLAN: {vlan}\n"
            f"✅ ETH Ports: All={primary_vlan}\n\n"
            f"*Step 3/8: PPPoE Configuration*\n\n"
            f"Enable PPPoE?"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_ZTE_PPPOE_ENABLE
    
    async def reg_zte_pppoe(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE PPPoE enable"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "ztepppoe_yes":
            context.user_data['reg_data']['zte_enable_pppoe'] = True
            
            await query.edit_message_text(
                "✅ PPPoE enabled\n\n"
                "Please type PPPoE Username:"
            )
            return REG_ZTE_PPPOE_USER
        else:
            context.user_data['reg_data']['zte_enable_pppoe'] = False
            context.user_data['reg_data']['zte_pppoe_user'] = ''
            context.user_data['reg_data']['zte_pppoe_pass'] = ''
            
            # Ask for Dual SSID
            keyboard = [
                [InlineKeyboardButton("✅ Yes, Dual SSID", callback_data="ztedualssid_yes")],
                [InlineKeyboardButton("❌ No, Single SSID only", callback_data="ztedualssid_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "✅ PPPoE skipped\n\n"
                "*Step 4/8: WiFi Configuration*\n\n"
                "Enable Dual SSID (Internet + Voucher)?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            return REG_ZTE_DUAL_SSID
    
    async def reg_zte_pppoe_user(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE PPPoE username"""
        user = update.message.text.strip()
        context.user_data['reg_data']['zte_pppoe_user'] = user
        
        await update.message.reply_text(
            f"✅ PPPoE Username: `{user}`\n\n"
            f"Please type PPPoE Password:",
            parse_mode='Markdown'
        )
        
        return REG_ZTE_PPPOE_PASS
    
    async def reg_zte_pppoe_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE PPPoE password"""
        password = update.message.text.strip()
        context.user_data['reg_data']['zte_pppoe_pass'] = password
        
        keyboard = [
            [InlineKeyboardButton("✅ Yes, Configure WiFi", callback_data="ztewifi_yes")],
            [InlineKeyboardButton("⏭️ Skip WiFi Config", callback_data="ztewifi_skip")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            "✅ PPPoE configured\n\n"
            "*Step 4/8: WiFi/SSID Configuration*\n\n"
            "Configure WiFi SSID names?\n"
            "(You can skip and configure later via ONU web interface)",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_WIFI_ENABLE
    
    async def reg_zte_wifi_enable(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE WiFi/SSID configuration enable/skip"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "ztewifi_yes":
            # User wants to configure WiFi - go to Dual SSID question
            context.user_data['reg_data']['zte_wifi_enabled'] = True
            
            keyboard = [
                [InlineKeyboardButton("✅ Yes, Dual SSID", callback_data="ztedualssid_yes")],
                [InlineKeyboardButton("❌ No, Single SSID only", callback_data="ztedualssid_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "✅ WiFi Config: Enabled\n\n"
                "Enable Dual SSID (Internet + Voucher)?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return REG_ZTE_DUAL_SSID
        else:
            # User skipped WiFi config - set empty SSIDs and go to TR069
            context.user_data['reg_data']['zte_wifi_enabled'] = False
            context.user_data['reg_data']['zte_enable_dual_ssid'] = False
            context.user_data['reg_data']['zte_ssid1_name'] = ''
            context.user_data['reg_data']['zte_ssid1_auth'] = 'wpa2'
            context.user_data['reg_data']['zte_ssid1_password'] = ''
            context.user_data['reg_data']['zte_ssid2_name'] = ''
            context.user_data['reg_data']['zte_ssid2_auth'] = 'open'
            context.user_data['reg_data']['zte_ssid2_password'] = ''
            
            keyboard = [
                [InlineKeyboardButton("✅ Yes", callback_data="ztetr069_yes")],
                [InlineKeyboardButton("❌ No", callback_data="ztetr069_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "⏭️ WiFi Config: Skipped\n\n"
                "*Step 5/8: TR069/ACS Configuration*\n\n"
                "Enable TR069/ACS Remote Management?\n"
                "(Recommended for GenieACS)",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            return REG_ZTE_TR069_ENABLE
    
    async def reg_zte_dual_ssid(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE Dual SSID enable/disable"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "ztedualssid_yes":
            context.user_data['reg_data']['zte_enable_dual_ssid'] = True
        else:
            context.user_data['reg_data']['zte_enable_dual_ssid'] = False
        
        await query.edit_message_text(
            f"✅ Dual SSID: {'Enabled' if query.data == 'ztedualssid_yes' else 'Single SSID only'}\n\n"
            f"Please type SSID 1 Name (Internet):\n"
            f"(e.g., MyWiFi-Internet)"
        )
        
        return REG_ZTE_SSID1_NAME
    
    async def reg_zte_ssid1_name(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 1 name"""
        name = update.message.text.strip()
        context.user_data['reg_data']['zte_ssid1_name'] = name
        
        keyboard = [
            [InlineKeyboardButton("WPA2-PSK (recommended)", callback_data="ztessid1_wpa2")],
            [InlineKeyboardButton("WPA/WPA2 Mixed", callback_data="ztessid1_mixed")],
            [InlineKeyboardButton("Open (no password)", callback_data="ztessid1_open")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            f"✅ SSID 1: `{name}`\n\n"
            f"Select SSID 1 Auth Type:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_SSID1_AUTH
    
    async def reg_zte_ssid1_auth(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 1 auth type"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        auth = query.data.replace('ztessid1_', '')
        context.user_data['reg_data']['zte_ssid1_auth'] = auth
        
        if auth == 'open':
            context.user_data['reg_data']['zte_ssid1_pass'] = ''
            
            # Check if dual SSID enabled
            enable_dual_ssid = context.user_data['reg_data'].get('zte_enable_dual_ssid', True)
            
            if enable_dual_ssid:
                # Go to SSID 2
                await query.edit_message_text(
                    "✅ SSID 1 Auth: Open\n\n"
                    "*Step 5/8: SSID 2 (Voucher/Guest)*\n\n"
                    "Please type SSID 2 Name:\n"
                    "(e.g., MyWiFi-Voucher)"
                )
                return REG_ZTE_SSID2_NAME
            else:
                # Single SSID - skip to TR069
                context.user_data['reg_data']['zte_ssid2_name'] = ''
                context.user_data['reg_data']['zte_ssid2_auth'] = 'open'
                context.user_data['reg_data']['zte_ssid2_pass'] = ''
                
                keyboard = [
                    [InlineKeyboardButton("✅ Yes, enable TR069", callback_data="ztetr069_yes")],
                    [InlineKeyboardButton("❌ No, skip TR069", callback_data="ztetr069_no")],
                    [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
                ]
                
                await query.edit_message_text(
                    "✅ SSID 1 Auth: Open\n\n"
                    "*Step 6/8: TR069/ACS Configuration*\n\n"
                    "Enable TR069?",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                return REG_ZTE_TR069_ENABLE
        else:
            await query.edit_message_text(
                f"✅ SSID 1 Auth: {auth.upper()}\n\n"
                f"Please type SSID 1 Password:\n"
                f"(min 8 characters)"
            )
            return REG_ZTE_SSID1_PASS
    
    async def reg_zte_ssid1_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 1 password"""
        password = update.message.text.strip()
        
        if len(password) < 8:
            await update.message.reply_text(
                "❌ Password must be at least 8 characters.\n"
                "Please enter again:"
            )
            return REG_ZTE_SSID1_PASS
        
        context.user_data['reg_data']['zte_ssid1_pass'] = password
        
        # Check if dual SSID enabled
        enable_dual_ssid = context.user_data['reg_data'].get('zte_enable_dual_ssid', True)
        
        if enable_dual_ssid:
            await update.message.reply_text(
                "✅ SSID 1 configured\n\n"
                "*Step 5/8: SSID 2 (Voucher/Guest)*\n\n"
                "Please type SSID 2 Name:\n"
                "(e.g., MyWiFi-Voucher)"
            )
            return REG_ZTE_SSID2_NAME
        else:
            # Single SSID - skip to TR069
            context.user_data['reg_data']['zte_ssid2_name'] = ''
            context.user_data['reg_data']['zte_ssid2_auth'] = 'open'
            context.user_data['reg_data']['zte_ssid2_pass'] = ''
            
            keyboard = [
                [InlineKeyboardButton("✅ Yes, enable TR069", callback_data="ztetr069_yes")],
                [InlineKeyboardButton("❌ No, skip TR069", callback_data="ztetr069_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await update.message.reply_text(
                "✅ Single SSID configured\n\n"
                "*Step 6/8: TR069/ACS Configuration*\n\n"
                "Enable TR069?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            return REG_ZTE_TR069_ENABLE
    
    async def reg_zte_ssid2_name(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 2 name"""
        name = update.message.text.strip()
        context.user_data['reg_data']['zte_ssid2_name'] = name
        
        keyboard = [
            [InlineKeyboardButton("WPA2-PSK", callback_data="ztessid2_wpa2")],
            [InlineKeyboardButton("Open (recommended for voucher)", callback_data="ztessid2_open")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            f"✅ SSID 2: `{name}`\n\n"
            f"Select SSID 2 Auth Type:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_SSID2_AUTH
    
    async def reg_zte_ssid2_auth(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 2 auth"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        auth = query.data.replace('ztessid2_', '')
        context.user_data['reg_data']['zte_ssid2_auth'] = auth
        
        if auth == 'open':
            context.user_data['reg_data']['zte_ssid2_pass'] = ''
            
            # Go to TR069
            keyboard = [
                [InlineKeyboardButton("✅ Yes, enable TR069", callback_data="ztetr069_yes")],
                [InlineKeyboardButton("❌ No, skip TR069", callback_data="ztetr069_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "✅ SSID 2 Auth: Open\n\n"
                "*Step 6/8: TR069/ACS Configuration*\n\n"
                "Enable TR069?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            return REG_ZTE_TR069_ENABLE
        else:
            await query.edit_message_text(
                "Please type SSID 2 Password:\n(min 8 characters)"
            )
            return REG_ZTE_SSID2_PASS
    
    async def reg_zte_ssid2_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE SSID 2 password"""
        password = update.message.text.strip()
        
        if len(password) < 8:
            await update.message.reply_text("❌ Min 8 characters. Try again:")
            return REG_ZTE_SSID2_PASS
        
        context.user_data['reg_data']['zte_ssid2_pass'] = password
        
        keyboard = [
            [InlineKeyboardButton("✅ Yes, enable TR069", callback_data="ztetr069_yes")],
            [InlineKeyboardButton("❌ No, skip TR069", callback_data="ztetr069_no")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            "✅ SSID 2 configured\n\n"
            "*Step 6/8: TR069/ACS Configuration*\n\n"
            "Enable TR069?",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_TR069_ENABLE
    
    async def reg_zte_tr069(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE TR069 enable"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "ztetr069_yes":
            context.user_data['reg_data']['zte_enable_tr069'] = True
            
            await query.edit_message_text(
                "✅ TR069 enabled\n\n"
                "Please type ACS URL:\n"
                "(e.g., http://192.168.54.254:7547)\n\n"
                "Or type 'default'"
            )
            return REG_ZTE_ACS_URL
        else:
            context.user_data['reg_data']['zte_enable_tr069'] = False
            context.user_data['reg_data']['zte_acs_url'] = ''
            context.user_data['reg_data']['zte_acs_user'] = ''
            context.user_data['reg_data']['zte_acs_pass'] = ''
            
            # Go to Firewall
            keyboard = [
                [InlineKeyboardButton("✅ Yes, enable Firewall", callback_data="ztefirewall_yes")],
                [InlineKeyboardButton("❌ No, skip Firewall", callback_data="ztefirewall_no")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "✅ TR069 skipped\n\n"
                "*Step 7/8: Firewall Configuration*\n\n"
                "Enable Firewall?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            return REG_ZTE_FIREWALL_ENABLE
    
    async def reg_zte_acs_url(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE ACS URL"""
        url = update.message.text.strip()
        
        if url.lower() == 'default':
            url = 'http://192.168.54.254:7547'
        
        context.user_data['reg_data']['zte_acs_url'] = url
        
        await update.message.reply_text(
            f"✅ ACS URL: `{url}`\n\n"
            f"Please type ACS Username:\n"
            f"(or 'default' for 'admin')",
            parse_mode='Markdown'
        )
        
        return REG_ZTE_ACS_USER
    
    async def reg_zte_acs_user(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE ACS username"""
        user = update.message.text.strip()
        
        if user.lower() == 'default':
            user = 'admin'
        
        context.user_data['reg_data']['zte_acs_user'] = user
        
        await update.message.reply_text(
            f"✅ ACS Username: `{user}`\n\n"
            f"Please type ACS Password:\n"
            f"(or 'default' for 'admin')",
            parse_mode='Markdown'
        )
        
        return REG_ZTE_ACS_PASS
    
    async def reg_zte_acs_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE ACS password"""
        password = update.message.text.strip()
        
        if password.lower() == 'default':
            password = 'acs'
        
        context.user_data['reg_data']['zte_acs_pass'] = password
        
        # Set default TR069 VLAN to 100
        context.user_data['reg_data']['zte_tr069_vlan'] = 100
        
        # Ask for Firewall
        keyboard = [
            [InlineKeyboardButton("✅ Yes, enable Firewall", callback_data="ztefirewall_yes")],
            [InlineKeyboardButton("❌ No, skip Firewall", callback_data="ztefirewall_no")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await update.message.reply_text(
            f"✅ ACS configured\n"
            f"✅ TR069 VLAN: 100 (default)\n\n"
            f"*Step 7/8: Firewall Configuration*\n\n"
            f"Enable Firewall?",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_ZTE_FIREWALL_ENABLE
    
    async def reg_zte_firewall_enable(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE Firewall enable"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        if query.data == "ztefirewall_yes":
            context.user_data['reg_data']['zte_enable_firewall'] = True
            
            keyboard = [
                [InlineKeyboardButton("Low (recommended)", callback_data="ztefwlevel_low")],
                [InlineKeyboardButton("Medium", callback_data="ztefwlevel_medium")],
                [InlineKeyboardButton("High", callback_data="ztefwlevel_high")],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
            ]
            
            await query.edit_message_text(
                "✅ Firewall enabled\n\n"
                "Select Firewall Level:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            return REG_ZTE_FIREWALL_LEVEL
        else:
            context.user_data['reg_data']['zte_enable_firewall'] = False
            context.user_data['reg_data']['zte_firewall_level'] = 'low'
            context.user_data['reg_data']['zte_enable_security_mgmt'] = True
            
            await query.edit_message_text(
                "✅ Firewall disabled\n\n"
                "*Step 8/8: Profile Selection*\n\n"
                "Proceeding to TCONT profile selection..."
            )
            
            return await self.reg_select_tcont(update, context)
    
    async def reg_zte_firewall_level(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle ZTE Firewall level"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        level = query.data.replace('ztefwlevel_', '')
        context.user_data['reg_data']['zte_firewall_level'] = level
        context.user_data['reg_data']['zte_enable_security_mgmt'] = True
        
        await query.edit_message_text(
            f"✅ Firewall: {level.capitalize()}\n\n"
            f"*Step 8/8: Profile Selection*\n\n"
            f"Proceeding to TCONT profile selection..."
        )
        
        return await self.reg_select_tcont(update, context)
    
    # ==================== HUAWEI FULL WIZARD ====================
    
    async def reg_huawei_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start Huawei Full configuration wizard"""
        query = update.callback_query
        
        keyboard = [
            [InlineKeyboardButton("VLAN 1010 (management)", callback_data="hwmgmt_1010")],
            [InlineKeyboardButton("VLAN 100", callback_data="hwmgmt_100")],
            [InlineKeyboardButton("Manual Input", callback_data="hwmgmt_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        await query.edit_message_text(
            "🌟 *Huawei Full Configuration*\n\n"
            "*Step 1: Management VLAN*\n\n"
            "Select Management/TR069 VLAN:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_HW_MGMT_VLAN
    
    async def reg_hw_mgmt_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei Management VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "hwmgmt_manual":
                await query.edit_message_text("Please type Management VLAN ID (1-4094):")
                return REG_HW_MGMT_VLAN
            else:
                vlan = int(query.data.replace('hwmgmt_', ''))
                context.user_data['reg_data']['hw_mgmt_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_HW_MGMT_VLAN
                context.user_data['reg_data']['hw_mgmt_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_HW_MGMT_VLAN
        
        # Ask for Internet VLAN
        keyboard = [
            [InlineKeyboardButton("VLAN 30 (internet)", callback_data="hwinet_30")],
            [InlineKeyboardButton("VLAN 100", callback_data="hwinet_100")],
            [InlineKeyboardButton("Manual Input", callback_data="hwinet_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ Management VLAN: {vlan}\n\n"
            f"*Step 2: Internet VLAN*\n\n"
            f"Select Internet VLAN:"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_HW_INTERNET_VLAN
    
    async def reg_hw_internet_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei Internet VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "hwinet_manual":
                await query.edit_message_text("Please type Internet VLAN ID (1-4094):")
                return REG_HW_INTERNET_VLAN
            else:
                vlan = int(query.data.replace('hwinet_', ''))
                context.user_data['reg_data']['hw_internet_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_HW_INTERNET_VLAN
                context.user_data['reg_data']['hw_internet_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_HW_INTERNET_VLAN
        
        # Ask for VoIP VLAN
        keyboard = [
            [InlineKeyboardButton("VLAN 151 (voip)", callback_data="hwvoip_151")],
            [InlineKeyboardButton("VLAN 200", callback_data="hwvoip_200")],
            [InlineKeyboardButton("Manual Input", callback_data="hwvoip_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ Internet VLAN: {vlan}\n\n"
            f"*Step 3: VoIP VLAN*\n\n"
            f"Select VoIP VLAN:"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_HW_VOIP_VLAN
    
    async def reg_hw_voip_vlan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei VoIP VLAN"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "hwvoip_manual":
                await query.edit_message_text("Please type VoIP VLAN ID (1-4094):")
                return REG_HW_VOIP_VLAN
            else:
                vlan = int(query.data.replace('hwvoip_', ''))
                context.user_data['reg_data']['hw_voip_vlan'] = vlan
                is_query = True
        else:
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text("❌ Invalid VLAN:")
                    return REG_HW_VOIP_VLAN
                context.user_data['reg_data']['hw_voip_vlan'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text("❌ Invalid number:")
                return REG_HW_VOIP_VLAN
        
        # Ask for WAN Mode
        keyboard = [
            [InlineKeyboardButton("DHCP (recommended)", callback_data="hwwan_dhcp")],
            [InlineKeyboardButton("Static IP", callback_data="hwwan_static")],
            [InlineKeyboardButton("PPPoE", callback_data="hwwan_pppoe")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"✅ VoIP VLAN: {vlan}\n\n"
            f"*Step 4: WAN Mode*\n\n"
            f"Select WAN Connection Mode:"
        )
        
        if is_query:
            await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        
        return REG_HW_WAN_MODE
    
    async def reg_hw_wan_mode(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN Mode selection"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        mode = query.data.replace('hwwan_', '')
        context.user_data['reg_data']['hw_wan_mode'] = mode
        
        if mode == 'dhcp':
            # DHCP - no additional config, set defaults
            context.user_data['reg_data']['hw_acs_url'] = 'http://genieacs.example.com:7547'
            
            await query.edit_message_text(
                "✅ WAN Mode: DHCP\n"
                "✅ ACS URL: http://genieacs.example.com:7547\n\n"
                "Huawei Full configuration complete\n\n"
                "Proceeding to profile selection..."
            )
            
            return await self.reg_select_tcont(update, context)
        
        elif mode == 'static':
            await query.edit_message_text(
                "✅ WAN Mode: Static IP\n\n"
                "Please type WAN IP Address:"
            )
            return REG_HW_WAN_IP
        
        else:  # pppoe
            await query.edit_message_text(
                "✅ WAN Mode: PPPoE\n\n"
                "Please type PPPoE Username:"
            )
            return REG_HW_WAN_PPPOE_USER
    
    async def reg_hw_wan_ip(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN Static IP"""
        ip = update.message.text.strip()
        
        import re
        if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
            await update.message.reply_text("❌ Invalid IP format. Try again:")
            return REG_HW_WAN_IP
        
        context.user_data['reg_data']['hw_wan_ip'] = ip
        
        keyboard = [
            [InlineKeyboardButton("255.255.255.0", callback_data="hwmask_default")],
            [InlineKeyboardButton("Manual Input", callback_data="hwmask_manual")]
        ]
        
        await update.message.reply_text(
            f"✅ WAN IP: `{ip}`\n\n"
            f"Select Netmask:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_HW_WAN_MASK
    
    async def reg_hw_wan_mask(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN Netmask"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "hwmask_default":
                mask = "255.255.255.0"
                context.user_data['reg_data']['hw_wan_mask'] = mask
                
                await query.edit_message_text(
                    f"✅ Netmask: `{mask}`\n\n"
                    f"Please type Gateway IP:",
                    parse_mode='Markdown'
                )
                return REG_HW_WAN_GW
            else:
                await query.edit_message_text("Please type Netmask:")
                return REG_HW_WAN_MASK
        else:
            mask = update.message.text.strip()
            context.user_data['reg_data']['hw_wan_mask'] = mask
            
            await update.message.reply_text(
                f"✅ Netmask: `{mask}`\n\n"
                f"Please type Gateway IP:",
                parse_mode='Markdown'
            )
            return REG_HW_WAN_GW
    
    async def reg_hw_wan_gw(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN Gateway - Complete"""
        gw = update.message.text.strip()
        context.user_data['reg_data']['hw_wan_gw'] = gw
        context.user_data['reg_data']['hw_acs_url'] = 'http://genieacs.example.com:7547'
        
        await update.message.reply_text(
            f"✅ Gateway: `{gw}`\n"
            f"✅ ACS URL: http://genieacs.example.com:7547\n\n"
            f"Huawei Full configuration complete\n\n"
            f"Proceeding to profile selection...",
            parse_mode='Markdown'
        )
        
        return await self.reg_select_tcont(update, context)
    
    async def reg_hw_wan_pppoe_user(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN PPPoE username"""
        user = update.message.text.strip()
        context.user_data['reg_data']['hw_wan_pppoe_user'] = user
        
        await update.message.reply_text(
            f"✅ PPPoE Username: `{user}`\n\n"
            f"Please type PPPoE Password:",
            parse_mode='Markdown'
        )
        
        return REG_HW_WAN_PPPOE_PASS
    
    async def reg_hw_wan_pppoe_pass(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle Huawei WAN PPPoE password - Complete"""
        password = update.message.text.strip()
        context.user_data['reg_data']['hw_wan_pppoe_pass'] = password
        context.user_data['reg_data']['hw_acs_url'] = 'http://genieacs.example.com:7547'
        
        await update.message.reply_text(
            "✅ PPPoE configured\n"
            "✅ ACS URL: http://genieacs.example.com:7547\n\n"
            "Huawei Full configuration complete\n\n"
            "Proceeding to profile selection..."
        )
        
        return await self.reg_select_tcont(update, context)
    
    async def reg_select_tcont(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Step 5: Select TCONT Profile"""
        # Get client and fetch TCONT profiles
        user_id = update.effective_user.id
        client = await self.get_client(user_id)
        
        if not client:
            if update.callback_query:
                await update.callback_query.edit_message_text("❌ Cannot connect to OLT")
            else:
                await update.message.reply_text("❌ Cannot connect to OLT")
            return ConversationHandler.END
        
        wizard = ONURegistrationWizard(client)
        wizard.fetch_tcont_profiles()
        tcont_profiles = wizard.tcont_profiles
        
        if not tcont_profiles:
            error_text = (
                "❌ *Failed to fetch TCONT profiles*\n\n"
                "Could not retrieve TCONT profiles from OLT.\n"
                "Please check:\n"
                "• OLT connection\n"
                "• OLT command support\n\n"
                "Registration cancelled."
            )
            if update.callback_query:
                await update.callback_query.edit_message_text(error_text, parse_mode='Markdown')
            else:
                await update.message.reply_text(error_text, parse_mode='Markdown')
            return ConversationHandler.END
        
        context.user_data['tcont_profiles'] = tcont_profiles
        
        # Build keyboard
        keyboard = []
        for idx, profile in enumerate(tcont_profiles[:10]):
            keyboard.append([InlineKeyboardButton(
                f"📊 {profile}",
                callback_data=f"regtcont_{idx}"
            )])
        
        keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")])
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 5 of 6: Select TCONT Profile*\n\n"
            f"Select upstream bandwidth profile:"
        )
        
        if update.callback_query:
            await update.callback_query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        
        return REG_SELECT_TCONT
    
    async def reg_tcont_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """TCONT selected, move to Traffic profile"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        try:
            # Extract index from callback data
            tcont_str = query.data.replace('regtcont_', '')
            tcont_idx = int(tcont_str)
        except ValueError:
            await query.edit_message_text(f"❌ Invalid selection: {query.data}")
            return ConversationHandler.END
        
        tcont_profiles = context.user_data.get('tcont_profiles', [])
        
        if tcont_idx >= len(tcont_profiles):
            await query.edit_message_text("❌ Invalid selection")
            return ConversationHandler.END
        
        selected_tcont = tcont_profiles[tcont_idx]
        context.user_data['reg_data']['tcont_profile'] = selected_tcont
        
        # Fetch Traffic profiles
        user_id = query.from_user.id
        client = await self.get_client(user_id)
        wizard = ONURegistrationWizard(client)
        wizard.fetch_traffic_profiles()
        traffic_profiles = wizard.traffic_profiles
        
        if not traffic_profiles:
            error_text = (
                f"❌ *Failed to fetch Traffic profiles*\n\n"
                f"✅ TCONT: `{selected_tcont}`\n\n"
                f"Could not retrieve Traffic profiles from OLT.\n"
                f"Please check:\n"
                f"• OLT connection\n"
                f"• OLT command support\n\n"
                f"Registration cancelled."
            )
            await query.edit_message_text(error_text, parse_mode='Markdown')
            return ConversationHandler.END
        
        context.user_data['traffic_profiles'] = traffic_profiles
        
        # Build keyboard
        keyboard = []
        for idx, profile in enumerate(traffic_profiles[:10]):
            keyboard.append([InlineKeyboardButton(
                f"📉 {profile}",
                callback_data=f"regtraffic_{idx}"
            )])
        
        keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")])
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 5b: Select Traffic Profile*\n\n"
            f"✅ TCONT: `{selected_tcont}`\n\n"
            f"Select downstream bandwidth profile:"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_SELECT_TRAFFIC
    
    async def reg_traffic_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Traffic selected, ask for VLAN"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        try:
            traffic_str = query.data.replace('regtraffic_', '')
            traffic_idx = int(traffic_str)
        except ValueError:
            await query.edit_message_text(f"❌ Invalid selection: {query.data}")
            return ConversationHandler.END
        
        traffic_profiles = context.user_data.get('traffic_profiles', [])
        
        if traffic_idx >= len(traffic_profiles):
            await query.edit_message_text("❌ Invalid selection")
            return ConversationHandler.END
        
        selected_traffic = traffic_profiles[traffic_idx]
        context.user_data['reg_data']['traffic_profile'] = selected_traffic
        
        # Ask for VLAN
        tcont = context.user_data['reg_data']['tcont_profile']
        
        keyboard = [
            [InlineKeyboardButton("VLAN 100 (common)", callback_data="regvlan_100")],
            [InlineKeyboardButton("VLAN 30 (internet)", callback_data="regvlan_30")],
            [InlineKeyboardButton("VLAN 151 (voip)", callback_data="regvlan_151")],
            [InlineKeyboardButton("Manual Input", callback_data="regvlan_manual")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        text = (
            f"📝 *ONU Registration Wizard*\n\n"
            f"*Step 6 of 6: Select VLAN*\n\n"
            f"✅ TCONT: `{tcont}`\n"
            f"✅ Traffic: `{selected_traffic}`\n\n"
            f"Select VLAN ID:"
        )
        
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        return REG_SELECT_VLAN
    
    async def reg_vlan_selected(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """VLAN selected or manual input, show confirmation"""
        if update.callback_query:
            query = update.callback_query
            await query.answer()
            
            if query.data == "cancel_reg":
                return await self.cancel(update, context)
            
            if query.data == "regvlan_manual":
                await query.edit_message_text(
                    "Please type VLAN ID (1-4094):"
                )
                return REG_SELECT_VLAN
            else:
                vlan = int(query.data.replace('regvlan_', ''))
                context.user_data['reg_data']['vlan_id'] = vlan
                is_query = True
        else:
            # Text input
            try:
                vlan = int(update.message.text.strip())
                if vlan < 1 or vlan > 4094:
                    await update.message.reply_text(
                        "❌ Invalid VLAN. Please enter 1-4094:"
                    )
                    return REG_SELECT_VLAN
                context.user_data['reg_data']['vlan_id'] = vlan
                is_query = False
            except ValueError:
                await update.message.reply_text(
                    "❌ Please enter a valid number (1-4094):"
                )
                return REG_SELECT_VLAN
        
        # Show confirmation
        onu = context.user_data.get('reg_onu', {})
        reg_data = context.user_data['reg_data']
        
        text = (
            f"📝 *ONU Registration - CONFIRMATION*\n\n"
            f"═══════════════════════════\n"
            f"📍 PON Port: `{onu.get('pon_port')}`\n"
            f"📟 Serial Number: `{onu.get('sn')}`\n"
            f"📱 Type: `{reg_data['onu_type']}`\n"
            f"🆔 ONU ID: `{reg_data['onu_id']}`\n"
            f"✏️ Name: `{reg_data['onu_name']}`\n"
        )
        
        if reg_data.get('description'):
            text += f"📝 Description: `{reg_data['description']}`\n"
        
        text += f"\n*Service Configuration:*\n"
        
        service = reg_data.get('service_type', 'skip')
        if service == 'pppoe':
            text += (
                f"🌐 Service: PPPOE\n"
                f"👤 Username: `{reg_data.get('pppoe_user')}`\n"
                f"🔑 Password: `{'*' * len(reg_data.get('pppoe_pass', ''))}`\n"
            )
        elif service == 'static':
            text += (
                f"📡 Service: Static IP\n"
                f"🌐 IP: `{reg_data.get('static_ip')}`\n"
                f"🔢 Netmask: `{reg_data.get('static_mask')}`\n"
            )
            if reg_data.get('static_gw'):
                text += f"🚪 Gateway: `{reg_data.get('static_gw')}`\n"
        elif service == 'bridge':
            text += f"🌉 Service: Bridge Mode\n"
        elif service == 'vlan':
            text += f"🏷️ Service: VLAN Only\n"
        elif service == 'fiberhome_veip':
            text += (
                f"🔥 Service: Fiberhome VEIP\n"
                f"🏷️ TR069 VLAN: `{reg_data.get('fh_tr069_vlan')}`\n"
                f"🏷️ Internet VLAN: `{reg_data.get('fh_internet_vlan')}`\n"
                f"🏷️ VoIP VLAN: `{reg_data.get('fh_voip_vlan')}`\n"
                f"🌐 ACS URL: `{reg_data.get('fh_acs_url')}`\n"
                f"👤 ACS User: `{reg_data.get('fh_acs_user')}`\n"
            )
        elif service == 'zte_full':
            text += (
                f"⚡ Service: ZTE Full\n"
                f"🏷️ Primary VLAN: `{reg_data.get('zte_primary_vlan')}`\n"
                f"🏷️ Secondary VLAN: `{reg_data.get('zte_secondary_vlan')}`\n"
            )
            if reg_data.get('zte_enable_pppoe'):
                text += f"👤 PPPoE: `{reg_data.get('zte_pppoe_user')}`\n"
        elif service == 'huawei_full':
            text += (
                f"🌟 Service: Huawei Full\n"
                f"🏷️ Management VLAN: `{reg_data.get('hw_mgmt_vlan')}`\n"
                f"🏷️ Internet VLAN: `{reg_data.get('hw_internet_vlan')}`\n"
                f"🏷️ VoIP VLAN: `{reg_data.get('hw_voip_vlan')}`\n"
                f"🌐 WAN Mode: `{reg_data.get('hw_wan_mode')}`\n"
            )
        else:
            text += f"⏭️ Service: Not configured\n"
        
        text += (
            f"\n*Profiles:*\n"
            f"📊 TCONT: `{reg_data.get('tcont_profile')}`\n"
            f"📉 Traffic: `{reg_data.get('traffic_profile')}`\n"
            f"🏷️ VLAN: `{reg_data.get('vlan_id')}`\n"
            f"═══════════════════════════\n\n"
            f"Proceed with registration?"
        )
        
        keyboard = [
            [InlineKeyboardButton("✅ Confirm & Register", callback_data="regconfirm_yes")],
            [InlineKeyboardButton("❌ Cancel", callback_data="cancel_reg")]
        ]
        
        if is_query:
            await query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        
        return REG_CONFIRM
    
    async def reg_execute(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Execute registration"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel_reg":
            return await self.cancel(update, context)
        
        await query.edit_message_text(
            "⏳ *Registering ONU...*\n\n"
            "Please wait...",
            parse_mode='Markdown'
        )
        
        # Get client
        client = await self.get_client(query.from_user.id)
        if not client:
            await query.edit_message_text("❌ Cannot connect to OLT")
            return ConversationHandler.END
        
        # Get data
        onu = context.user_data.get('reg_onu', {})
        reg_data = context.user_data['reg_data']
        
        wizard = ONURegistrationWizard(client)
        config_manager = ONUConfigManager(client)
        
        # Step 1: Register ONU
        success, msg = wizard.register_onu(
            onu['pon_port'],
            onu['sn'],
            reg_data['onu_id'],
            reg_data['onu_type'],
            reg_data['onu_name'],
            reg_data.get('description', '')
        )
        
        result_text = f"📝 *Registration Result*\n\n"
        
        if not success:
            result_text += f"❌ *Registration Failed*\n\n{self.escape_markdown(msg)}"
            await query.edit_message_text(result_text, parse_mode='Markdown')
            context.user_data.clear()
            return ConversationHandler.END
        
        result_text += f"✅ ONU Registered\n\n"
        
        # Step 2: Configure Service
        import re
        match = re.search(r'(\d+/\d+/\d+)', onu['pon_port'])
        port_num = match.group(1) if match else onu['pon_port']
        onu_full_id = f"{port_num}:{reg_data['onu_id']}"
        
        service = reg_data.get('service_type', 'skip')
        
        if service == 'pppoe':
            svc_success, svc_msg = config_manager.configure_pppoe(
                onu_full_id,
                reg_data['pppoe_user'],
                reg_data['pppoe_pass'],
                reg_data['vlan_id'],
                reg_data['tcont_profile'],
                reg_data['traffic_profile']
            )
            result_text += f"{'✅' if svc_success else '❌'} PPPOE Config: {self.escape_markdown(svc_msg)}\n"
        
        elif service == 'bridge':
            svc_success, svc_msg = config_manager.configure_bridge(
                onu_full_id,
                reg_data['vlan_id'],
                reg_data['tcont_profile'],
                eth_port=1
            )
            result_text += f"{'✅' if svc_success else '❌'} Bridge Config: {self.escape_markdown(svc_msg)}\n"
        
        elif service == 'static':
            svc_success, svc_msg = config_manager.configure_static_ip(
                onu_full_id,
                reg_data['static_ip'],
                reg_data['static_mask'],
                reg_data.get('static_gw', ''),
                '8.8.8.8',
                '8.8.4.4',
                reg_data['vlan_id'],
                reg_data['tcont_profile']
            )
            result_text += f"{'✅' if svc_success else '❌'} Static IP Config: {self.escape_markdown(svc_msg)}\n"
        
        elif service == 'vlan':
            # Just TCONT/Traffic/VLAN
            result_text += f"✅ VLAN configuration applied\n"
        
        elif service == 'fiberhome_veip':
            svc_success, svc_msg = config_manager.configure_fiberhome_veip(
                onu_full_id,
                reg_data['fh_acs_url'],
                reg_data['fh_acs_user'],
                reg_data['fh_acs_pass'],
                reg_data['fh_tr069_vlan'],
                reg_data['fh_internet_vlan'],
                reg_data['fh_voip_vlan'],
                reg_data['tcont_profile']
            )
            result_text += f"{'✅' if svc_success else '❌'} Fiberhome VEIP Config: {self.escape_markdown(svc_msg)}\n"
        
        elif service == 'zte_full':
            zte_config = {
                'primary_vlan': reg_data['zte_primary_vlan'],
                'secondary_vlan': reg_data['zte_secondary_vlan'],
                'traffic_profile': reg_data.get('zte_traffic_profile', 'DOWN-PPPOE'),
                'eth1_vlan': reg_data.get('zte_eth1_vlan', reg_data['zte_primary_vlan']),
                'eth2_vlan': reg_data.get('zte_eth2_vlan', reg_data['zte_primary_vlan']),
                'eth3_vlan': reg_data.get('zte_eth3_vlan', reg_data['zte_primary_vlan']),
                'eth4_vlan': reg_data.get('zte_eth4_vlan', reg_data['zte_primary_vlan']),
                'pppoe_enable': reg_data.get('zte_enable_pppoe', False),
                'pppoe_user': reg_data.get('zte_pppoe_user', ''),
                'pppoe_pass': reg_data.get('zte_pppoe_pass', ''),
                'enable_dual_ssid': reg_data.get('zte_enable_dual_ssid', True),
                'ssid1_name': reg_data.get('zte_ssid1_name', ''),
                'ssid1_auth': reg_data.get('zte_ssid1_auth', 'wpa2'),
                'ssid1_pass': reg_data.get('zte_ssid1_pass', '12345678'),
                'ssid2_name': reg_data.get('zte_ssid2_name', ''),
                'ssid2_auth': reg_data.get('zte_ssid2_auth', 'wpa2'),
                'ssid2_pass': reg_data.get('zte_ssid2_pass', ''),
                'enable_tr069': reg_data.get('zte_enable_tr069', False),
                'tr069_vlan': reg_data.get('zte_tr069_vlan', 100),
                'acs_url': reg_data.get('zte_acs_url', ''),
                'acs_user': reg_data.get('zte_acs_user', 'acs'),
                'acs_pass': reg_data.get('zte_acs_pass', 'acs'),
                'enable_firewall': reg_data.get('zte_enable_firewall', True),
                'firewall_level': reg_data.get('zte_firewall_level', 'low'),
                'enable_security_mgmt': reg_data.get('zte_enable_security_mgmt', True)
            }
            svc_success, svc_msg = config_manager.configure_zte_full(
                onu_full_id,
                reg_data['tcont_profile'],
                zte_config
            )
            result_text += f"{'✅' if svc_success else '❌'} ZTE Full Config: {self.escape_markdown(svc_msg)}\n"
        
        elif service == 'huawei_full':
            hw_config = {
                'mgmt_vlan': reg_data['hw_mgmt_vlan'],
                'internet_vlan': reg_data['hw_internet_vlan'],
                'voip_vlan': reg_data['hw_voip_vlan'],
                'wan_mode': reg_data['hw_wan_mode'],
                'wan_static_ip': reg_data.get('hw_wan_static_ip', ''),
                'wan_static_mask': reg_data.get('hw_wan_static_mask', ''),
                'wan_static_gw': reg_data.get('hw_wan_static_gw', ''),
                'wan_pppoe_user': reg_data.get('hw_wan_pppoe_user', ''),
                'wan_pppoe_pass': reg_data.get('hw_wan_pppoe_pass', ''),
                'acs_url': reg_data['hw_acs_url']
            }
            svc_success, svc_msg = config_manager.configure_huawei_full(
                onu_full_id,
                reg_data['tcont_profile'],
                hw_config
            )
            result_text += f"{'✅' if svc_success else '❌'} Huawei Full Config: {self.escape_markdown(svc_msg)}\n"
        
        result_text += (
            f"\n*Registration Complete!*\n\n"
            f"📍 PON: `{onu['pon_port']}`\n"
            f"🆔 ID: `{reg_data['onu_id']}`\n"
            f"✏️ Name: `{reg_data['onu_name']}`\n\n"
            f"Use 📋 ONU List to view status"
        )
        
        keyboard = [
            [InlineKeyboardButton("📋 View ONU List", callback_data="menu_onu_list")],
            [InlineKeyboardButton("🏠 Main Menu", callback_data="back_menu")]
        ]
        
        await query.edit_message_text(
            result_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        
        # Clear wizard data
        context.user_data.clear()
        
        return ConversationHandler.END
    
    async def error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle errors"""
        logger.error(f"Update {update} caused error {context.error}")
        
        if update and update.effective_message:
            await update.effective_message.reply_text(
                f"❌ An error occurred:\n{str(context.error)}"
            )
    
    def run(self):
        """Run the bot"""
        # Create application
        application = Application.builder().token(self.token).build()
        
        # Registration Wizard Conversation Handler
        reg_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.reg_wizard_entry, pattern=r'^regonu_\d+$')
            ],
            states={
                REG_SELECT_TYPE: [
                    CallbackQueryHandler(self.reg_type_selected)
                ],
                REG_INPUT_ID: [
                    CallbackQueryHandler(self.reg_id_selected),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_id_selected)
                ],
                REG_INPUT_NAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_name_input)
                ],
                REG_INPUT_DESC: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_desc_input)
                ],
                REG_SELECT_SERVICE: [
                    CallbackQueryHandler(self.reg_service_selected)
                ],
                REG_PPPOE_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_pppoe_user_input)
                ],
                REG_PPPOE_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_pppoe_pass_input)
                ],
                REG_STATIC_IP: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_static_ip_input)
                ],
                REG_STATIC_MASK: [
                    CallbackQueryHandler(self.reg_static_mask_selected),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_static_mask_selected)
                ],
                REG_STATIC_GW: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_static_gw_input)
                ],
                # Fiberhome VEIP wizard states
                REG_FH_TR069_VLAN: [
                    CallbackQueryHandler(self.reg_fh_tr069_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_tr069_vlan)
                ],
                REG_FH_INTERNET_VLAN: [
                    CallbackQueryHandler(self.reg_fh_internet_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_internet_vlan)
                ],
                REG_FH_VOIP_VLAN: [
                    CallbackQueryHandler(self.reg_fh_voip_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_voip_vlan)
                ],
                REG_FH_ACS_URL: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_acs_url)
                ],
                REG_FH_ACS_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_acs_user)
                ],
                REG_FH_ACS_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_fh_acs_pass)
                ],
                # ZTE Full wizard states
                REG_ZTE_PRIMARY_VLAN: [
                    CallbackQueryHandler(self.reg_zte_primary_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_primary_vlan)
                ],
                REG_ZTE_SECONDARY_VLAN: [
                    CallbackQueryHandler(self.reg_zte_secondary_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_secondary_vlan)
                ],
                REG_ZTE_PPPOE_ENABLE: [
                    CallbackQueryHandler(self.reg_zte_pppoe)
                ],
                REG_ZTE_PPPOE_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_pppoe_user)
                ],
                REG_ZTE_PPPOE_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_pppoe_pass)
                ],
                REG_ZTE_WIFI_ENABLE: [
                    CallbackQueryHandler(self.reg_zte_wifi_enable)
                ],
                REG_ZTE_DUAL_SSID: [
                    CallbackQueryHandler(self.reg_zte_dual_ssid)
                ],
                REG_ZTE_SSID1_NAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_ssid1_name)
                ],
                REG_ZTE_SSID1_AUTH: [
                    CallbackQueryHandler(self.reg_zte_ssid1_auth)
                ],
                REG_ZTE_SSID1_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_ssid1_pass)
                ],
                REG_ZTE_SSID2_NAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_ssid2_name)
                ],
                REG_ZTE_SSID2_AUTH: [
                    CallbackQueryHandler(self.reg_zte_ssid2_auth)
                ],
                REG_ZTE_SSID2_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_ssid2_pass)
                ],
                REG_ZTE_TR069_ENABLE: [
                    CallbackQueryHandler(self.reg_zte_tr069)
                ],
                REG_ZTE_ACS_URL: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_acs_url)
                ],
                REG_ZTE_ACS_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_acs_user)
                ],
                REG_ZTE_ACS_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_zte_acs_pass)
                ],
                REG_ZTE_FIREWALL_ENABLE: [
                    CallbackQueryHandler(self.reg_zte_firewall_enable)
                ],
                REG_ZTE_FIREWALL_LEVEL: [
                    CallbackQueryHandler(self.reg_zte_firewall_level)
                ],
                # Huawei Full wizard states
                REG_HW_MGMT_VLAN: [
                    CallbackQueryHandler(self.reg_hw_mgmt_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_mgmt_vlan)
                ],
                REG_HW_INTERNET_VLAN: [
                    CallbackQueryHandler(self.reg_hw_internet_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_internet_vlan)
                ],
                REG_HW_VOIP_VLAN: [
                    CallbackQueryHandler(self.reg_hw_voip_vlan),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_voip_vlan)
                ],
                REG_HW_WAN_MODE: [
                    CallbackQueryHandler(self.reg_hw_wan_mode)
                ],
                REG_HW_WAN_STATIC_IP: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_wan_ip)
                ],
                REG_HW_WAN_STATIC_MASK: [
                    CallbackQueryHandler(self.reg_hw_wan_mask),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_wan_mask)
                ],
                REG_HW_WAN_STATIC_GW: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_wan_gw)
                ],
                REG_HW_WAN_PPPOE_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_wan_pppoe_user)
                ],
                REG_HW_WAN_PPPOE_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_hw_wan_pppoe_pass)
                ],
                # Common states
                REG_SELECT_TCONT: [
                    CallbackQueryHandler(self.reg_tcont_selected)
                ],
                REG_SELECT_TRAFFIC: [
                    CallbackQueryHandler(self.reg_traffic_selected)
                ],
                REG_SELECT_VLAN: [
                    CallbackQueryHandler(self.reg_vlan_selected),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.reg_vlan_selected)
                ],
                REG_CONFIRM: [
                    CallbackQueryHandler(self.reg_execute)
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel, pattern="^cancel_reg$")
            ],
            allow_reentry=True,
            per_message=False
        )
        
        # Add handlers
        application.add_handler(CommandHandler("start", self.start))
        application.add_handler(CommandHandler("menu", self.menu))
        application.add_handler(CommandHandler("onu_list", self.onu_list))
        application.add_handler(CommandHandler("onu_uncfg", self.onu_uncfg))
        application.add_handler(CommandHandler("olt_info", self.olt_info))
        application.add_handler(CommandHandler("help", self.help_command))
        application.add_handler(CommandHandler("cancel", self.cancel))
        
        # Registration wizard handler
        application.add_handler(reg_conv_handler)
        
        # LAN Binding Conversation Handler
        lan_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.omci_lan_start_config, pattern=r'^omci_lan_onu_\d+$')
            ],
            states={
                OMCI_LAN_INPUT_PORT: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.omci_lan_input_port)
                ],
                OMCI_LAN_INPUT_VLAN: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.omci_lan_input_vlan)
                ],
                OMCI_LAN_SELECT_MODE: [
                    CallbackQueryHandler(self.omci_lan_execute, pattern=r'^lan_mode_')
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel_omci_lan, pattern=r'^cancel_omci_lan$')
            ],
            allow_reentry=True,
            per_message=False
        )
        
        # WLAN Binding Conversation Handler
        wlan_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.omci_wlan_start_config, pattern=r'^omci_wlan_onu_\d+$')
            ],
            states={
                OMCI_WLAN_INPUT_SSID: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.omci_wlan_input_ssid)
                ],
                OMCI_WLAN_INPUT_VLAN: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.omci_wlan_input_vlan)
                ],
                OMCI_WLAN_SELECT_MODE: [
                    CallbackQueryHandler(self.omci_wlan_execute, pattern=r'^wlan_mode_')
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel_omci_wlan, pattern=r'^cancel_omci_wlan$')
            ],
            allow_reentry=True,
            per_message=False
        )
        
        application.add_handler(lan_conv_handler)
        application.add_handler(wlan_conv_handler)
        
        # OLT Profile Management Conversation Handlers
        olt_add_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.olt_add_start, pattern=r'^olt_mgmt_add$')
            ],
            states={
                OLT_MGMT_ADD_NAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_name)
                ],
                OLT_MGMT_ADD_HOST: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_host)
                ],
                OLT_MGMT_ADD_PORT: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_port)
                ],
                OLT_MGMT_ADD_USERNAME: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_username)
                ],
                OLT_MGMT_ADD_PASSWORD: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_password)
                ],
                OLT_MGMT_ADD_EN_PWD: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_enable_pwd),
                    CommandHandler("skip", self.olt_add_enable_pwd)
                ],
                OLT_MGMT_ADD_DESC: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_add_description),
                    CommandHandler("skip", self.olt_add_description)
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel)
            ],
            allow_reentry=True,
            per_message=False
        )
        
        olt_edit_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.olt_edit_field_selected, pattern=r'^olt_editfield_')
            ],
            states={
                OLT_MGMT_EDIT_VALUE: [
                    CallbackQueryHandler(self.olt_edit_back_to_menu, pattern=r'^olt_edit_'),
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.olt_edit_value)
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel)
            ],
            allow_reentry=True,
            per_message=False
        )
        
        application.add_handler(olt_add_conv_handler)
        application.add_handler(olt_edit_conv_handler)
        
        # ONU Configuration Conversation Handlers
        pppoe_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.onu_config_pppoe_start, pattern=r'^cfg_pppoe_onu_\d+$')
            ],
            states={
                CFG_PPPOE_ACTION_SELECT: [
                    CallbackQueryHandler(self.onu_config_pppoe_action_edit, pattern=r'^cfg_edit_pppoe$'),
                    CallbackQueryHandler(self.onu_config_pppoe_action_new, pattern=r'^cfg_new_pppoe$')
                ],
                CFG_PPPOE_EDIT_PARAM: [
                    CallbackQueryHandler(self.onu_config_pppoe_edit_username, pattern=r'^cfg_edit_pppoe_user$'),
                    CallbackQueryHandler(self.onu_config_pppoe_edit_password, pattern=r'^cfg_edit_pppoe_pass$'),
                    CallbackQueryHandler(self.onu_config_pppoe_edit_vlan, pattern=r'^cfg_edit_pppoe_vlan$'),
                    CallbackQueryHandler(self.onu_config_pppoe_edit_tcont, pattern=r'^cfg_edit_pppoe_tcont$'),
                    CallbackQueryHandler(self.onu_config_pppoe_edit_traffic, pattern=r'^cfg_edit_pppoe_traffic$'),
                    CallbackQueryHandler(self.onu_config_pppoe_save_edit, pattern=r'^cfg_save_pppoe_edit$'),
                    CallbackQueryHandler(self.onu_config_pppoe_action_edit, pattern=r'^cfg_edit_pppoe$')  # Back button
                ],
                CFG_PPPOE_INPUT_USER: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_pppoe_username)
                ],
                CFG_PPPOE_INPUT_PASS: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_pppoe_password)
                ],
                CFG_PPPOE_INPUT_VLAN: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_pppoe_vlan)
                ],
                CFG_PPPOE_SELECT_TCONT: [
                    CallbackQueryHandler(self.onu_config_pppoe_select_tcont, pattern=r'^cfg_tcont_\d+$'),
                    CallbackQueryHandler(self.onu_config_pppoe_select_tcont_edit, pattern=r'^cfg_edit_tcont_\d+$')
                ],
                CFG_PPPOE_SELECT_TRAFFIC: [
                    CallbackQueryHandler(self.onu_config_pppoe_execute, pattern=r'^cfg_traffic_\d+$'),
                    CallbackQueryHandler(self.onu_config_pppoe_select_traffic_edit, pattern=r'^cfg_edit_traffic_\d+$')
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel_cfg, pattern=r'^cancel_cfg$')
            ],
            allow_reentry=True,
            per_message=False
        )
        
        bridge_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.onu_config_bridge_start, pattern=r'^cfg_bridge_onu_\d+$')
            ],
            states={
                CFG_BRIDGE_INPUT_VLAN: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_bridge_vlan)
                ],
                CFG_BRIDGE_INPUT_PORT: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_bridge_port)
                ],
                CFG_BRIDGE_SELECT_TCONT: [
                    CallbackQueryHandler(self.onu_config_bridge_execute, pattern=r'^cfg_bridge_tcont_\d+$')
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel_cfg, pattern=r'^cancel_cfg$')
            ],
            allow_reentry=True,
            per_message=False
        )
        
        static_conv_handler = ConversationHandler(
            entry_points=[
                CallbackQueryHandler(self.onu_config_static_start, pattern=r'^cfg_static_onu_\d+$')
            ],
            states={
                CFG_STATIC_INPUT_IP: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_static_ip)
                ],
                CFG_STATIC_INPUT_MASK: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_static_mask)
                ],
                CFG_STATIC_INPUT_GW: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_static_gw)
                ],
                CFG_STATIC_INPUT_VLAN: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.onu_config_static_vlan)
                ],
                CFG_STATIC_SELECT_TCONT: [
                    CallbackQueryHandler(self.onu_config_static_execute, pattern=r'^cfg_static_tcont_\d+$')
                ],
            },
            fallbacks=[
                CommandHandler("cancel", self.cancel),
                CallbackQueryHandler(self.cancel_cfg, pattern=r'^cancel_cfg$')
            ],
            allow_reentry=True,
            per_message=False
        )
        
        application.add_handler(pppoe_conv_handler)
        application.add_handler(bridge_conv_handler)
        application.add_handler(static_conv_handler)
        
        # Button handler (must be after conversation handlers)
        application.add_handler(CallbackQueryHandler(self.button_handler))
        
        # Error handler
        application.add_error_handler(self.error_handler)
        
        # ── SNMP Integration (v2.2.0) ──────────────────────────────────
        self._notification_bot: Optional["TelegramNotifier"] = None
        if _SNMP_AVAILABLE:
            try:
                profile = self.profile_manager.get_active_profile()
                if profile and profile.has_snmp():
                    # Buat TelnetClient dari profile untuk optical power & PON scan
                    _telnet_client = None
                    try:
                        from config.olt_config import OLTConfig
                        from core.telnet_client import TelnetClient
                        _olt_cfg = OLTConfig.from_profile(profile)
                        _tc = TelnetClient(_olt_cfg)
                        if _tc.connect():
                            _telnet_client = _tc
                            logger.info("Telnet client connected for SNMP/optical services")
                        else:
                            logger.warning("Telnet connect failed — optical power via Telnet disabled")
                    except Exception as _te:
                        logger.warning(f"Telnet init failed: {_te}")

                    snmp_ctx = SNMPBotContext()
                    snmp_ctx.initialize(profile.to_dict(), telnet_client=_telnet_client)
                    register_snmp_handlers(application, snmp_ctx)
                    logger.info("SNMP command handlers registered (/signal, /olthealth, etc.)")

                    # Start notification bot if configured
                    notif_cfg = profile.to_dict().get("notification", {})
                    if notif_cfg.get("bot_token"):
                        self._notification_bot = TelegramNotifier.from_config(
                            notif_cfg, olt_name=profile.name, olt_host=profile.host
                        )
                        self._notification_bot.start()
                        snmp_ctx.notifier = self._notification_bot
                        logger.info("Notification bot started")

                        # Auto-start AlertEngine: scan PON aktif via Telnet
                        try:
                            from services.alert_engine import AlertEngine
                            _engine = AlertEngine(
                                onu_monitor=snmp_ctx.onu_monitor,
                                optical_service=snmp_ctx.optical_power_svc,
                                poll_interval=60,
                                optical_poll_interval=300
                            )
                            _active_pons = []
                            if _telnet_client and snmp_ctx.pon_info_svc:
                                try:
                                    _ports = snmp_ctx.pon_info_svc.scan_via_telnet(
                                        _telnet_client, board=1, max_pon=16
                                    )
                                    _active_pons = [(p.board, p.pon) for p in _ports if p.oper_status == 1]
                                except Exception:
                                    pass
                            if not _active_pons:
                                _active_pons = [(1, p) for p in range(1, 17)]
                            for _b, _p in _active_pons:
                                _engine.add_pon(board=_b, pon=_p)
                            _engine.on_alert(self._notification_bot.send_alert)
                            _engine.start()
                            snmp_ctx.alert_engine = _engine
                            _pon_list = ", ".join(f"1/1/{p}" for _, p in _active_pons)
                            logger.info(f"Alert engine auto-started: {len(_active_pons)} PON ({_pon_list})")
                        except Exception as _ae:
                            logger.warning(f"Alert engine auto-start failed: {_ae}")
                    else:
                        logger.info("Notification bot not configured (no bot_token in notification config)")
                else:
                    logger.info("SNMP not configured in active profile — SNMP commands disabled")
            except Exception as _e:
                logger.warning(f"SNMP integration failed to initialize: {_e}")
        # ───────────────────────────────────────────────────────────────
        
        # Start bot
        logger.info("Starting bot...")
        application.run_polling(allowed_updates=Update.ALL_TYPES)


def main():
    """Main function"""
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Get bot token from environment
    token = os.getenv('TELEGRAM_BOT_TOKEN')
    
    if not token:
        print("❌ Error: TELEGRAM_BOT_TOKEN not found in environment")
        print("\nPlease add to .env file:")
        print("TELEGRAM_BOT_TOKEN=your_bot_token_here")
        return
    
    # Validate token format (should be like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz)
    if ':' not in token or len(token) < 20:
        print("❌ Error: Invalid TELEGRAM_BOT_TOKEN format!")
        print("\n⚠️ Token masih menggunakan contoh/placeholder!")
        print("\n📝 Cara mendapatkan token yang valid:")
        print("1. Buka Telegram, cari @BotFather")
        print("2. Send command: /newbot")
        print("3. Ikuti instruksi untuk buat bot")
        print("4. Copy token yang diberikan")
        print("5. Paste ke file .env")
        print("\nFormat token yang benar:")
        print("TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz")
        print("\n⚠️ Jangan gunakan token contoh dari dokumentasi!")
        return
    
    # Get authorized users
    admin_users_str = os.getenv('TELEGRAM_ADMIN_USERS', '')
    admin_users = [int(uid.strip()) for uid in admin_users_str.split(',') if uid.strip()]
    
    if not admin_users:
        print("⚠️ Warning: No admin users configured")
        print("\nPlease add to .env file:")
        print("TELEGRAM_ADMIN_USERS=123456789,987654321")
        print("\nTo get your User ID, message @userinfobot on Telegram")
        return
    
    print(f"✅ Bot configured with {len(admin_users)} admin user(s)")
    print(f"📱 Starting Telegram Bot...")
    
    try:
        # Create and run bot
        bot = OLTTelegramBot(token, admin_users)
        bot.run()
    except Exception as e:
        error_msg = str(e)
        if 'TimedOut' in error_msg or 'timeout' in error_msg.lower():
            print("\n" + "="*60)
            print("❌ CONNECTION ERROR: Timeout connecting to Telegram")
            print("="*60)
            print("\n⚠️ Kemungkinan penyebab:")
            print("\n1. ❌ Token tidak valid (masih contoh/placeholder)")
            print("   Solusi: Dapatkan token asli dari @BotFather")
            print("\n2. 🚫 Internet connection blocked/firewall")
            print("   Solusi: Check koneksi internet & firewall settings")
            print("\n3. 🌐 Cannot reach api.telegram.org")
            print("   Solusi: Test koneksi: ping api.telegram.org")
            print("\n4. 🔒 Proxy/VPN required")
            print("   Solusi: Setup proxy jika Telegram diblokir")
            print("\n📝 Cara mendapatkan token yang valid:")
            print("   1. Chat @BotFather di Telegram")
            print("   2. Send: /newbot")
            print("   3. Copy token yang diberikan")
            print("   4. Edit .env → ganti TELEGRAM_BOT_TOKEN")
            print("\n" + "="*60)
        elif 'Unauthorized' in error_msg or '401' in error_msg:
            print("\n" + "="*60)
            print("❌ AUTHENTICATION ERROR: Invalid Token")
            print("="*60)
            print("\n⚠️ Token yang Anda gunakan tidak valid!")
            print("\nSolusi:")
            print("1. Chat @BotFather di Telegram")
            print("2. Send: /token")
            print("3. Pilih bot Anda")
            print("4. Copy token baru")
            print("5. Update di .env file")
            print("="*60)
        else:
            print(f"\n❌ Error: {error_msg}")
        return


if __name__ == '__main__':
    main()
