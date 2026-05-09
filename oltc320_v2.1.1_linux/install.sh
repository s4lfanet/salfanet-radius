#!/bin/bash
################################################################################
#  ZTE C320 OLT Management System - Linux Auto Installer
#  Copyright (c) 2026 Network Automation Team
################################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Function to print colored output
print_header() {
    echo -e "${CYAN}=========================================================================${RESET}"
    echo -e "${BOLD}${CYAN}$1${RESET}"
    echo -e "${CYAN}=========================================================================${RESET}"
}

print_step() {
    echo -e "\n${BLUE}[$1]${RESET} $2"
}

print_success() {
    echo -e "${GREEN}[OK]${RESET} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${RESET} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${RESET} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

# Function to check command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Function to compare versions
version_ge() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# Main installation
echo ""
print_header "        ZTE C320 OLT Management System - Auto Installer"
echo ""

# Check if running in correct directory
print_step "1/8" "Checking installation directory..."
if [ ! -d "config" ] || [ ! -d "scripts" ]; then
    print_error "Required directories not found!"
    echo "Please run this installer from the project root directory."
    exit 1
fi
print_success "Installation directory verified"

# Check Python installation
print_step "2/8" "Checking Python installation..."

PYTHON_CMD=""
if command_exists python3; then
    PYTHON_CMD="python3"
elif command_exists python; then
    PYTHON_CMD="python"
else
    print_warning "Python is not installed!"
    echo ""
    
    # Detect Linux distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        print_error "Cannot detect Linux distribution"
        exit 1
    fi
    
    print_info "Auto-installing Python 3..."
    echo ""
    
    case "$OS" in
        ubuntu|debian|linuxmint)
            print_info "Detected Debian/Ubuntu-based system"
            echo "Installing Python 3.10+ via apt..."
            
            sudo apt update
            sudo apt install -y python3 python3-venv python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install Python!"
                exit 1
            fi
            ;;
            
        centos|rhel|rocky|alma)
            print_info "Detected RHEL/CentOS-based system"
            echo "Installing Python 3 via yum..."
            
            sudo yum install -y python3 python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install Python!"
                exit 1
            fi
            ;;
            
        fedora)
            print_info "Detected Fedora system"
            echo "Installing Python 3 via dnf..."
            
            sudo dnf install -y python3 python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install Python!"
                exit 1
            fi
            ;;
            
        arch|manjaro)
            print_info "Detected Arch-based system"
            echo "Installing Python 3 via pacman..."
            
            sudo pacman -S --noconfirm python python-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install Python!"
                exit 1
            fi
            ;;
            
        *)
            print_error "Unsupported Linux distribution: $OS"
            echo ""
            echo "Please manually install Python 3.10 or higher:"
            echo "  - python3"
            echo "  - python3-venv"
            echo "  - python3-pip"
            exit 1
            ;;
    esac
    
    # Set Python command after installation
    if command_exists python3; then
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_CMD="python"
    else
        print_error "Python installation completed but python command not found!"
        echo "Please rerun this installer or add Python to your PATH."
        exit 1
    fi
    
    print_success "Python installed successfully"
fi

# Get Python version
PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
print_success "Python $PYTHON_VERSION found"

# Check Python version (must be 3.10+)
REQUIRED_VERSION="3.10"
if ! version_ge "$PYTHON_VERSION" "$REQUIRED_VERSION"; then
    print_error "Python version must be $REQUIRED_VERSION or higher"
    echo "Current version: $PYTHON_VERSION"
    echo ""
    echo "To install Python 3.10+:"
    echo ""
    echo "Ubuntu 22.04+:"
    echo "  sudo apt install python3.12"
    echo ""
    echo "Using deadsnakes PPA (Ubuntu 20.04):"
    echo "  sudo add-apt-repository ppa:deadsnakes/ppa"
    echo "  sudo apt update"
    echo "  sudo apt install python3.12 python3.12-venv"
    echo ""
    exit 1
fi

# Check and install venv module
print_step "3/8" "Checking Python venv module..."

# Detect Linux distribution first
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    print_error "Cannot detect Linux distribution"
    exit 1
fi

# Get Python version for package name
PYTHON_MAJOR_MINOR=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

# Check if venv package is installed (for Debian/Ubuntu)
VENV_INSTALLED=false
case "$OS" in
    ubuntu|debian|linuxmint)
        # Check if python3.x-venv package is installed
        if dpkg -l | grep -q "python${PYTHON_MAJOR_MINOR}-venv"; then
            VENV_INSTALLED=true
        fi
        ;;
    *)
        # For other distros, just check if venv module works
        if $PYTHON_CMD -m venv --help &> /dev/null; then
            VENV_INSTALLED=true
        fi
        ;;
esac

# Install venv if not found
if [ "$VENV_INSTALLED" = "false" ]; then
    print_warning "Python venv package not installed!"
    echo ""
    print_info "Auto-installing Python venv package..."
    echo ""
    
    case "$OS" in
        ubuntu|debian|linuxmint)
            print_info "Installing python${PYTHON_MAJOR_MINOR}-venv and dependencies..."
            sudo apt update
            sudo apt install -y python${PYTHON_MAJOR_MINOR}-venv python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install python venv package!"
                echo "Please run manually: sudo apt install python${PYTHON_MAJOR_MINOR}-venv python3-pip"
                exit 1
            fi
            ;;
            
        centos|rhel|rocky|alma)
            print_info "Installing python3-venv..."
            sudo yum install -y python3-venv python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install python venv module!"
                echo "Please run manually: sudo yum install python3-venv"
                exit 1
            fi
            ;;
            
        fedora)
            print_info "Installing python3-venv..."
            sudo dnf install -y python3-venv python3-pip
            
            if [ $? -ne 0 ]; then
                print_error "Failed to install python venv module!"
                echo "Please run manually: sudo dnf install python3-venv"
                exit 1
            fi
            ;;
            
        arch|manjaro)
            print_info "Python venv is included in Arch Linux python package"
            if ! $PYTHON_CMD -m venv --help &> /dev/null; then
                print_error "venv module should be available but check failed"
                echo "Please check your Python installation"
                exit 1
            fi
            ;;
            
        *)
            print_error "Unsupported Linux distribution: $OS"
            echo ""
            echo "Please manually install Python venv package:"
            echo "  Ubuntu/Debian: sudo apt install python${PYTHON_MAJOR_MINOR}-venv python3-pip"
            echo "  CentOS/RHEL:   sudo yum install python3-venv"
            exit 1
            ;;
    esac
    
    print_success "Python venv package installed successfully"
fi

# Final verification
if ! $PYTHON_CMD -m venv --help &> /dev/null; then
    print_error "Python venv module still not available after installation!"
    echo "Please check your Python installation and try again."
    exit 1
fi

print_success "Python venv module ready"

# Check for existing virtual environment
print_step "4/8" "Checking for existing virtual environment..."
if [ -d ".venv" ]; then
    print_warning "Virtual environment already exists"
    read -p "Do you want to recreate it? (y/N): " RECREATE
    if [[ $RECREATE =~ ^[Yy]$ ]]; then
        print_info "Removing old virtual environment..."
        rm -rf .venv
        print_success "Old virtual environment removed"
    else
        print_info "Using existing virtual environment"
        SKIP_VENV_CREATION=true
    fi
fi

# Create virtual environment
if [ "$SKIP_VENV_CREATION" != "true" ]; then
    print_info "Creating virtual environment..."
    $PYTHON_CMD -m venv .venv
    if [ $? -ne 0 ]; then
        print_error "Failed to create virtual environment!"
        exit 1
    fi
    print_success "Virtual environment created"
fi

# Activate virtual environment
print_step "5/8" "Activating virtual environment..."
source .venv/bin/activate
if [ $? -ne 0 ]; then
    print_error "Failed to activate virtual environment!"
    exit 1
fi
print_success "Virtual environment activated"

# Check pip
print_step "6/8" "Checking pip installation..."
if ! python -m pip --version &> /dev/null; then
    print_error "pip not found!"
    exit 1
fi
print_success "pip is available"

# Upgrade pip
print_info "Upgrading pip..."
python -m pip install --upgrade pip --quiet
print_success "pip upgraded"

# Install dependencies
print_step "7/8" "Installing dependencies..."
if [ -f "requirements.txt" ]; then
    LINE_COUNT=$(wc -l < requirements.txt)
    if [ $LINE_COUNT -gt 0 ]; then
        print_info "Installing packages from requirements.txt..."
        python -m pip install -r requirements.txt --quiet
        if [ $? -ne 0 ]; then
            print_warning "Some packages failed to install"
        else
            print_success "All packages installed successfully"
        fi
    else
        print_info "No dependencies to install (using stdlib only)"
    fi
else
    print_info "No requirements.txt found (using stdlib only)"
fi

# No API dependencies needed for pure CLI version

# Verify installation
print_step "8/8" "Verifying installation..."

# Test core imports
python -c "import telnetlib; import json; import logging" &> /dev/null
if [ $? -ne 0 ]; then
    print_error "Core modules import failed!"
    exit 1
fi
print_success "Core modules verified"

# Test custom imports
python -c "from core.telnet_client import TelnetClient; from core.zte_command import ZTECommand; from core.onu_parser import ONUParser" &> /dev/null
if [ $? -ne 0 ]; then
    print_error "Custom modules import failed!"
    exit 1
fi
print_success "Custom modules verified"

# Create logs directory
if [ ! -d "logs" ]; then
    mkdir -p logs
    print_success "Logs directory created"
fi

# Create .env from .env.example if not exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success ".env file created from template"
        print_warning "Please configure .env file with your OLT settings"
    fi
fi

# Make scripts executable
chmod +x scripts/*.py 2>/dev/null
chmod +x run.ps1 2>/dev/null
print_success "Scripts made executable"

# Installation complete
echo ""
print_header "                    Installation Successful!"
echo ""
echo -e "${CYAN}Next Steps:${RESET}"
echo ""
echo -e "${YELLOW}1.${RESET} Configure OLT connection:"
echo -e "   Edit file: ${BOLD}config/olt_profiles.json${RESET}"
echo -e "   Update: host, username, password for your OLT"
echo ""
echo -e "${YELLOW}2.${RESET} Run the CLI application:"
echo -e "   ${BOLD}./run.sh${RESET}  (interactive CLI menu)"
echo ""
echo -e "${YELLOW}3.${RESET} Run the Telegram Bot (optional):"
echo -e "   ${BOLD}./start_telegram_bot.sh${RESET}"
echo -e "   Note: Configure your Telegram bot token first"
echo -e "   See: GET_TELEGRAM_TOKEN.md for instructions"
echo ""
echo -e "${YELLOW}4.${RESET} For manual activation (when needed):"
echo -e "   ${BOLD}source .venv/bin/activate${RESET}"
echo ""
echo -e "${CYAN}Documentation:${RESET}"
echo "   README.md ............... Complete documentation"
echo "   GET_TELEGRAM_TOKEN.md ... Telegram bot setup"
echo ""
echo -e "${GREEN}=========================================================================${RESET}"
echo ""

# Ask if user wants to edit config
read -p "Do you want to edit OLT configuration now? (Y/n): " OPEN_CONFIG
if [[ ! $OPEN_CONFIG =~ ^[Nn]$ ]]; then
    echo ""
    print_info "Opening configuration file..."
    
    # Detect available editor
    if command_exists nano; then
        nano config/olt_config.py
    elif command_exists vim; then
        vim config/olt_config.py
    elif command_exists vi; then
        vi config/olt_config.py
    elif command_exists gedit; then
        gedit config/olt_config.py &
    else
        print_warning "No text editor found. Please manually edit: config/olt_config.py"
    fi
fi

echo ""
echo -e "${CYAN}Installation complete! You can now run the application.${RESET}"
echo ""

# Deactivate venv (optional, user can keep it active)
# deactivate
