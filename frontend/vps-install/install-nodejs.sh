#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Node.js Module
# ============================================================================
# Step 2: Install Node.js 20 LTS
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# NODE.JS INSTALLATION
# ============================================================================

install_nodejs() {
    print_step "Step 2: Installing Node.js ${NODE_VERSION}"
    
    print_info "Adding NodeSource repository..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - || {
        print_error "Failed to add NodeSource repository"
        return 1
    }
    
    print_info "Installing Node.js..."
    apt-get install -y nodejs || {
        print_error "Failed to install Node.js"
        return 1
    }
    
    # Verify installation
    print_info "Verifying Node.js installation..."
    local NODE_VERSION_INSTALLED=$(node --version 2>/dev/null)
    local NPM_VERSION_INSTALLED=$(npm --version 2>/dev/null)
    
    if [ -z "$NODE_VERSION_INSTALLED" ]; then
        print_error "Node.js installation verification failed"
        return 1
    fi
    
    print_success "Node.js installed: $NODE_VERSION_INSTALLED"
    print_success "npm installed: $NPM_VERSION_INSTALLED"
    
    # Configure npm
    print_info "Configuring npm..."
    npm config set fetch-timeout 600000
    npm config set fetch-retries 5
    npm config set fetch-retry-mintimeout 10000
    npm config set fetch-retry-maxtimeout 60000
    
    print_success "Node.js installation completed"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_nodejs
fi
