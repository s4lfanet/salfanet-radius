#!/bin/bash
# ============================================================================
# SALFANET RADIUS — Node.js + pnpm Installation
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_nodejs() {
    print_step "Node.js $NODE_VERSION + pnpm"

    if command_exists node; then
        local current
        current=$(node -v | sed 's/v//')
        if [[ "$current" == "$NODE_VERSION"* ]]; then
            print_info "Node $current already installed — skipping"
        else
            print_info "Node $current found, upgrading to $NODE_VERSION..."
        fi
    fi

    # Install via NodeSource
    if ! command_exists node || [[ "$(node -v)" != *"$NODE_VERSION"* ]]; then
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
        apt-get install -yqq nodejs
    fi

    # Verify
    node -v
    npm -v

    # pnpm (via corepack — stable, no floating latest)
    if ! command_exists pnpm; then
        npm install -g pnpm@9
    fi
    pnpm -v

    print_success "Node.js $(node -v) + pnpm $(pnpm -v) ready"
}
