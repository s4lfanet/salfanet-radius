#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Redis Module
# ============================================================================
# Step 4b: Install & Configure Redis for caching and rate limiting
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# REDIS INSTALLATION
# ============================================================================

install_redis() {
    print_step "Installing Redis (cache + rate limiting)"

    # Check if Redis is already installed and running
    if command -v redis-server &>/dev/null && systemctl is-active --quiet redis-server 2>/dev/null; then
        print_success "Redis is already installed and running"
        redis-cli ping 2>/dev/null | grep -q PONG && print_success "Redis responding to PING"
        export REDIS_INSTALLED="true"
        enable_redis_url_in_env
        return 0
    fi

    print_info "Installing Redis server via apt..."
    apt-get update -qq || true
    apt-get install -y redis-server || {
        print_error "Failed to install Redis"
        return 1
    }

    # Configure Redis for production
    print_info "Configuring Redis..."

    local REDIS_CONF="/etc/redis/redis.conf"

    # Backup original config
    if [ -f "$REDIS_CONF" ] && [ ! -f "${REDIS_CONF}.bak" ]; then
        cp "$REDIS_CONF" "${REDIS_CONF}.bak"
    fi

    # Optimize Redis config for the application
    # - Bind to localhost only (security)
    # - Set maxmemory with LRU eviction policy
    # - Enable persistence for rate limiting data
    if [ -f "$REDIS_CONF" ]; then
        # Ensure bind to localhost
        sed -i 's/^bind .*/bind 127.0.0.1 ::1/' "$REDIS_CONF" 2>/dev/null || true

        # Set protected mode
        sed -i 's/^protected-mode .*/protected-mode yes/' "$REDIS_CONF" 2>/dev/null || true

        # Set maxmemory to 128MB (sufficient for cache + rate limiting)
        if ! grep -q "^maxmemory " "$REDIS_CONF"; then
            echo "maxmemory 128mb" >> "$REDIS_CONF"
        else
            sed -i 's/^maxmemory .*/maxmemory 128mb/' "$REDIS_CONF"
        fi

        # Set eviction policy: LRU for cache keys
        if ! grep -q "^maxmemory-policy " "$REDIS_CONF"; then
            echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"
        else
            sed -i 's/^maxmemory-policy .*/maxmemory-policy allkeys-lru/' "$REDIS_CONF"
        fi

        print_success "Redis configured (localhost only, 128MB max, LRU eviction)"
    fi

    # Enable and start Redis
    print_info "Starting Redis service..."
    systemctl enable redis-server 2>/dev/null || true
    systemctl restart redis-server || {
        print_error "Failed to start Redis service"
        return 1
    }

    # Wait for Redis to be ready
    local i
    for ((i=1; i<=10; i++)); do
        if redis-cli ping 2>/dev/null | grep -q PONG; then
            print_success "Redis is running and responding"
            break
        fi
        sleep 1
    done

    if ! redis-cli ping 2>/dev/null | grep -q PONG; then
        print_error "Redis did not start properly"
        systemctl status redis-server --no-pager -l 2>/dev/null | tail -20 || true
        return 1
    fi

    # Enable REDIS_URL in .env
    enable_redis_url_in_env

    export REDIS_INSTALLED="true"
    print_success "Redis installation completed"
    print_info "Redis URL: redis://127.0.0.1:6379"
    print_info "Used for: API caching (profiles, areas, routers) + rate limiting"

    return 0
}

# ============================================================================
# Enable REDIS_URL in .env file
# ============================================================================

enable_redis_url_in_env() {
    local ENV_FILE="${APP_DIR}/.env"

    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env file not found — skipping REDIS_URL activation"
        return 0
    fi

    # Check if REDIS_URL is already set (uncommented)
    if grep -q "^REDIS_URL=" "$ENV_FILE"; then
        print_info "REDIS_URL already active in .env"
        return 0
    fi

    # Uncomment or add REDIS_URL
    if grep -q "^# REDIS_URL=" "$ENV_FILE"; then
        sed -i 's/^# REDIS_URL=.*/REDIS_URL=redis:\/\/127.0.0.1:6379/' "$ENV_FILE"
        print_success "REDIS_URL enabled in .env"
    else
        echo "" >> "$ENV_FILE"
        echo "# Redis Cache (auto-enabled during installation)" >> "$ENV_FILE"
        echo "REDIS_URL=redis://127.0.0.1:6379" >> "$ENV_FILE"
        print_success "REDIS_URL added to .env"
    fi

    chmod 600 "$ENV_FILE"
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory

    install_redis
fi
