#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Customer APK Builder Module
# ============================================================================
# Step 8 (Optional): Build Android APK untuk customer self-service app
#
# Requires:
#   - Application sudah ter-install (install-app.sh selesai)
#   - Minimum 4GB disk space bebas
#   - Minimum 2GB RAM (atau swap)
#
# Output:
#   - /var/www/salfanet-radius/public/downloads/salfanet-radius.apk
#   - Dapat diakses di: http://<VPS_IP>/downloads/salfanet-radius.apk
# ============================================================================

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# KONFIGURASI
# ============================================================================

ANDROID_SDK_DIR="/opt/android-sdk"
JAVA_VERSION="17"
ANDROID_COMPILE_SDK="35"
ANDROID_BUILD_TOOLS="35.0.0"
ANDROID_PLATFORM="android-35"
MOBILE_APP_DIR="${APP_DIR}/mobile-app"
APK_OUTPUT_DIR="${APP_DIR}/public/downloads"
APK_NAME="salfanet-radius.apk"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
JAVA_HOME_PATH=""

# ============================================================================
# JAVA 17 INSTALLATION
# ============================================================================

install_java() {
    print_step "Install Java Development Kit 17"

    # Check if already installed
    if java -version 2>&1 | grep -q "version \"17"; then
        print_success "Java 17 already installed"
        JAVA_HOME_PATH=$(dirname $(dirname $(readlink -f $(which java))))
        return 0
    fi

    print_info "Installing OpenJDK 17..."
    apt-get update -qq
    apt-get install -y openjdk-17-jdk

    # Verify
    local jver
    jver=$(java -version 2>&1 | head -1)
    print_success "Java installed: $jver"

    # Set JAVA_HOME
    JAVA_HOME_PATH=$(dirname $(dirname $(readlink -f $(which java))))
    export JAVA_HOME="$JAVA_HOME_PATH"
    print_success "JAVA_HOME: $JAVA_HOME"
}

# ============================================================================
# ANDROID SDK INSTALLATION
# ============================================================================

install_android_sdk() {
    print_step "Install Android SDK Command-line Tools"

    # Create SDK directory
    mkdir -p "$ANDROID_SDK_DIR/cmdline-tools"

    # Export vars
    export ANDROID_HOME="$ANDROID_SDK_DIR"
    export ANDROID_SDK_ROOT="$ANDROID_SDK_DIR"
    export PATH="$ANDROID_SDK_DIR/cmdline-tools/latest/bin:$ANDROID_SDK_DIR/platform-tools:$PATH"

    # Check if sdkmanager already available
    if command -v sdkmanager &>/dev/null && sdkmanager --version &>/dev/null 2>&1; then
        print_success "Android SDK Manager already installed"
    else
        print_info "Downloading Android SDK command-line tools..."
        print_info "URL: $CMDLINE_TOOLS_URL"

        local tmp_zip="/tmp/cmdline-tools.zip"
        wget -q --show-progress -O "$tmp_zip" "$CMDLINE_TOOLS_URL" || {
            print_error "Gagal download Android SDK tools!"
            print_info "Coba manual: wget -O /tmp/cmdline-tools.zip '$CMDLINE_TOOLS_URL'"
            return 1
        }

        print_info "Extracting command-line tools..."
        local tmp_extract="/tmp/cmdline-tools-extract"
        rm -rf "$tmp_extract"
        unzip -q "$tmp_zip" -d "$tmp_extract"
        rm -f "$tmp_zip"

        # Move ke lokasi yang benar
        mkdir -p "$ANDROID_SDK_DIR/cmdline-tools/latest"
        cp -r "$tmp_extract/cmdline-tools/." "$ANDROID_SDK_DIR/cmdline-tools/latest/"
        rm -rf "$tmp_extract"

        print_success "Android command-line tools extracted"
    fi

    # Accept licenses
    print_info "Accepting Android SDK licenses..."
    yes | sdkmanager --licenses 2>/dev/null || true

    # Install required SDK packages
    print_info "Installing Android SDK packages (ini butuh 5-10 menit, ~800MB)..."
    print_info "  - platforms;$ANDROID_PLATFORM"
    print_info "  - build-tools;$ANDROID_BUILD_TOOLS"
    print_info "  - platform-tools"

    sdkmanager \
        "platforms;$ANDROID_PLATFORM" \
        "build-tools;$ANDROID_BUILD_TOOLS" \
        "platform-tools" \
        --verbose 2>&1 | grep -E "Install|Fetch|Unzip|Done|Error" || true

    # Verify
    if [ -d "$ANDROID_SDK_DIR/platforms/$ANDROID_PLATFORM" ]; then
        print_success "Android SDK installed: $ANDROID_PLATFORM + build-tools $ANDROID_BUILD_TOOLS"
    else
        print_error "Android SDK installation verification failed!"
        return 1
    fi
}

# ============================================================================
# CONFIGURE ANDROID ENV VARS PERMANENTLY
# ============================================================================

configure_android_env() {
    print_info "Mengatur environment variables Android SDK..."

    # Tulis ke /etc/profile.d/ agar persist
    cat > /etc/profile.d/android-sdk.sh <<EOF
# Android SDK Environment Variables (SALFANET RADIUS)
export JAVA_HOME="${JAVA_HOME_PATH}"
export ANDROID_HOME="${ANDROID_SDK_DIR}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_DIR}"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH"
EOF

    chmod +x /etc/profile.d/android-sdk.sh
    source /etc/profile.d/android-sdk.sh

    print_success "Android SDK environment configured"
}

# ============================================================================
# SETUP MOBILE APP
# ============================================================================

setup_mobile_app() {
    print_step "Setup Mobile App Dependencies"

    if [ ! -d "$MOBILE_APP_DIR" ]; then
        print_error "mobile-app/ directory tidak ditemukan di: $MOBILE_APP_DIR"
        print_info "Pastikan source code sudah di-copy dengan benar"
        return 1
    fi

    cd "$MOBILE_APP_DIR"

    # Install npm dependencies
    print_info "Installing mobile-app npm dependencies..."
    npm install 2>&1 | tail -5
    print_success "Mobile app dependencies installed"

    # Set JAVA_HOME untuk Gradle
    export JAVA_HOME="$JAVA_HOME_PATH"
    export ANDROID_HOME="$ANDROID_SDK_DIR"

    # Make gradlew executable
    chmod +x "$MOBILE_APP_DIR/android/gradlew"
    print_success "gradlew permissions fixed"
}

# ============================================================================
# UPDATE API URL IN MOBILE APP
# ============================================================================

configure_mobile_app_api() {
    print_step "Konfigurasi API URL Mobile App"

    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    local APK_BASE_URL
    if [ -n "${VPS_DOMAIN:-}" ]; then
        APK_BASE_URL="https://${VPS_DOMAIN}"
    else
        APK_BASE_URL="http://${VPS_IP}"
    fi

    local env_file="$MOBILE_APP_DIR/.env"

    print_info "Mengatur API_URL ke ${APK_BASE_URL}"

    cat > "$env_file" <<EOF
# Mobile App Environment - Auto-generated oleh SALFANET Installer
# Generated: $(date)

API_URL=${APK_BASE_URL}
API_TIMEOUT=30000

APP_NAME=SALFANET RADIUS
EOF

    print_success ".env mobile app dibuat: $env_file"
    print_info "API URL: ${APK_BASE_URL}"
}

# ============================================================================
# BUILD APK
# ============================================================================

build_apk() {
    print_step "Build Android APK (ini butuh 10-20 menit)"

    cd "$MOBILE_APP_DIR/android"

    # Export semua vars yang diperlukan
    export JAVA_HOME="$JAVA_HOME_PATH"
    export ANDROID_HOME="$ANDROID_SDK_DIR"
    export ANDROID_SDK_ROOT="$ANDROID_SDK_DIR"
    export PATH="$JAVA_HOME/bin:$ANDROID_SDK_DIR/cmdline-tools/latest/bin:$ANDROID_SDK_DIR/platform-tools:$PATH"

    # Bersihkan build sebelumnya
    print_info "Membersihkan build cache sebelumnya..."
    ./gradlew clean 2>&1 | tail -5 || true

    # Check available disk space
    local FREE_DISK=$(df -m / | awk 'NR==2{print $4}')
    if [ "$FREE_DISK" -lt "2000" ]; then
        print_warning "Disk space tersisa hanya ${FREE_DISK}MB! Build mungkin gagal."
        print_info "Direkomendasikan minimal 4GB disk space bebas."
    fi

    # Build APK release
    print_info "Building APK release..."
    print_info "(progres Gradle akan ditampilkan, normal butuh 10-20 menit)"
    echo ""

    if ./gradlew assembleRelease \
        --no-daemon \
        --max-workers=2 \
        -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m" \
        2>&1 | tee /tmp/gradle-build.log; then
        print_success "APK build berhasil!"
    else
        print_error "APK build gagal!"
        echo ""
        print_info "Error terakhir dari Gradle:"
        grep -i "error\|exception\|failed" /tmp/gradle-build.log | tail -20 || tail -30 /tmp/gradle-build.log
        echo ""
        print_info "Full log: cat /tmp/gradle-build.log"
        return 1
    fi

    # Cari file APK yang dihasilkan
    local APK_SOURCE
    APK_SOURCE=$(find "$MOBILE_APP_DIR/android/app/build/outputs/apk" -name "*.apk" | head -1)

    if [ -z "$APK_SOURCE" ]; then
        print_error "File APK tidak ditemukan!"
        print_info "Cek folder: $MOBILE_APP_DIR/android/app/build/outputs/apk/"
        return 1
    fi

    print_success "APK ditemukan: $APK_SOURCE"
    print_info "Ukuran: $(du -h "$APK_SOURCE" | cut -f1)"
}

# ============================================================================
# DEPLOY APK KE PUBLIC FOLDER
# ============================================================================

deploy_apk() {
    print_step "Deploy APK ke Public Download Folder"

    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    local APK_BASE_URL
    if [ -n "${VPS_DOMAIN:-}" ]; then
        APK_BASE_URL="https://${VPS_DOMAIN}"
    else
        APK_BASE_URL="http://${VPS_IP}"
    fi

    # Buat folder download
    mkdir -p "$APK_OUTPUT_DIR"
    chown -R ${APP_USER}:${APP_GROUP} "$APK_OUTPUT_DIR" 2>/dev/null || true

    # Cari APK
    local APK_SOURCE
    APK_SOURCE=$(find "$MOBILE_APP_DIR/android/app/build/outputs/apk" -name "*.apk" 2>/dev/null | head -1)

    if [ -z "$APK_SOURCE" ]; then
        print_error "APK tidak ditemukan! Jalankan build_apk() terlebih dahulu."
        return 1
    fi

    # Copy APK dengan timestamp untuk versioning
    local APK_DATED="salfanet-radius-$(date +%Y%m%d).apk"
    cp "$APK_SOURCE" "$APK_OUTPUT_DIR/$APK_DATED"
    cp "$APK_SOURCE" "$APK_OUTPUT_DIR/$APK_NAME"  # Selalu update symlink/latest

    # Fix permissions
    chmod 644 "$APK_OUTPUT_DIR"/*.apk
    chown ${APP_USER}:${APP_GROUP} "$APK_OUTPUT_DIR"/*.apk 2>/dev/null || true

    # Buat info file
    cat > "$APK_OUTPUT_DIR/apk-info.json" <<EOF
{
  "appName": "SALFANET RADIUS",
  "version": "$(cat "$MOBILE_APP_DIR/package.json" | grep '"version"' | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')",
  "buildDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "apiUrl": "${APK_BASE_URL}",
  "downloadUrl": "${APK_BASE_URL}/downloads/${APK_NAME}",
  "filename": "${APK_NAME}",
  "size": "$(du -h "$APK_OUTPUT_DIR/$APK_NAME" | cut -f1)"
}
EOF

    print_success "APK di-deploy ke: $APK_OUTPUT_DIR/$APK_NAME"
    print_success "Info file: $APK_OUTPUT_DIR/apk-info.json"
}

# ============================================================================
# CONFIGURE NGINX FOR APK DOWNLOAD
# ============================================================================

configure_nginx_download() {
    print_step "Konfigurasi Nginx untuk APK Download"

    # Cari nginx config yang active
    local NGINX_CONF=""
    for conf in /etc/nginx/sites-enabled/salfanet-radius \
                /etc/nginx/sites-enabled/default \
                /etc/nginx/conf.d/salfanet-radius.conf; do
        if [ -f "$conf" ]; then
            NGINX_CONF="$conf"
            break
        fi
    done

    if [ -z "$NGINX_CONF" ]; then
        print_warning "Nginx config tidak ditemukan, skip konfigurasi download URL"
        local _APKURL
        _APKURL=$([ -n "${VPS_DOMAIN:-}" ] && echo "https://${VPS_DOMAIN}" || echo "http://${VPS_IP}")
        print_info "APK tersedia di: ${APP_DIR}/public/downloads/${APK_NAME}"
        print_info "Akses via app: ${_APKURL}/downloads/${APK_NAME}"
        return 0
    fi

    # Cek apakah location /downloads sudah ada
    if grep -q "location /downloads" "$NGINX_CONF"; then
        print_success "Nginx location /downloads sudah ada"
        return 0
    fi

    print_info "Menambahkan location /downloads ke Nginx..."

    # Inject sebelum closing }
    sed -i 's|^\s*}\s*$|    # APK Download endpoint (SALFANET Installer)\n    location /downloads/ {\n        alias '"${APK_OUTPUT_DIR}/"';\n        autoindex off;\n        add_header Content-Disposition '"'"'attachment'"'"';\n    }\n\n}|' "$NGINX_CONF"

    # Test dan reload nginx
    if nginx -t 2>&1; then
        systemctl reload nginx
        print_success "Nginx dikonfigurasi untuk melayani APK downloads"
    else
        print_warning "Nginx config test gagal, skip reload"
        print_info "Test manual: nginx -t"
    fi
}

# ============================================================================
# SHOW APK STATUS
# ============================================================================

show_apk_status() {
    print_step "Status APK Customer"

    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    local APK_BASE_URL
    if [ -n "${VPS_DOMAIN:-}" ]; then
        APK_BASE_URL="https://${VPS_DOMAIN}"
    else
        APK_BASE_URL="http://${VPS_IP}"
    fi

    echo ""
    if [ -f "$APK_OUTPUT_DIR/$APK_NAME" ]; then
        local APK_SIZE=$(du -h "$APK_OUTPUT_DIR/$APK_NAME" | cut -f1)
        local APK_DATE=$(date -r "$APK_OUTPUT_DIR/$APK_NAME" "+%Y-%m-%d %H:%M")

        echo -e "${GREEN}✅ APK Customer Ready!${NC}"
        echo ""
        echo "  File     : $APK_OUTPUT_DIR/$APK_NAME"
        echo "  Ukuran   : $APK_SIZE"
        echo "  Dibuat   : $APK_DATE"
        echo ""
        echo -e "${CYAN}📱 Download URL:${NC}"
        echo "  ${APK_BASE_URL}/downloads/${APK_NAME}"
        echo ""
        echo -e "${CYAN}📋 Info File:${NC}"
        if [ -f "$APK_OUTPUT_DIR/apk-info.json" ]; then
            cat "$APK_OUTPUT_DIR/apk-info.json"
        fi
        echo ""
        echo -e "${YELLOW}💡 Cara install di HP Android:${NC}"
        echo "  1. Buka ${APK_BASE_URL}/downloads/${APK_NAME} di browser HP"
        echo "  2. Download APK"
        echo "  3. Aktifkan 'Install dari sumber tidak dikenal' di Settings"
        echo "  4. Install APK"
        echo ""
        echo -e "${YELLOW}📲 Share link ke customer:${NC}"
        echo "  ${APK_BASE_URL}/downloads/${APK_NAME}"
    else
        echo -e "${RED}❌ APK belum dibangun${NC}"
        echo "  Jalankan: bash vps-install/install-apk.sh"
    fi
    echo ""
}

# ============================================================================
# REBUILD ONLY (untuk update APK)
# ============================================================================

rebuild_apk() {
    print_step "Rebuild APK (Update)"

    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    # Load env vars
    source /etc/profile.d/android-sdk.sh 2>/dev/null || {
        export JAVA_HOME="$JAVA_HOME_PATH"
        export ANDROID_HOME="$ANDROID_SDK_DIR"
        export PATH="$JAVA_HOME/bin:$ANDROID_SDK_DIR/cmdline-tools/latest/bin:$ANDROID_SDK_DIR/platform-tools:$PATH"
    }

    configure_mobile_app_api
    build_apk
    deploy_apk
    show_apk_status

    print_success "APK berhasil diupdate!"
}

# ============================================================================
# MAIN INSTALL FUNCTION
# ============================================================================

install_apk_builder() {
    print_step "Step 8 (Optional): Android APK Builder untuk Customer App"

    print_info "Modul ini akan:"
    print_info "  1. Install Java 17 JDK"
    print_info "  2. Install Android SDK (build-tools, platforms)"
    print_info "  3. Build APK customer self-service"
    print_info "  4. Deploy APK ke public/downloads/"
    print_info ""
    print_warning "Estimasi waktu: 20-40 menit"
    print_warning "Disk space yang diperlukan: ~2GB"
    echo ""

    # Tanya konfirmasi jika mode interaktif
    if [ -t 0 ]; then
        read -p "Build APK customer sekarang? [y/N]: " BUILD_CONFIRM
        if [[ ! "$BUILD_CONFIRM" =~ ^[Yy]$ ]]; then
            print_info "APK build dilewati."
            print_info "Untuk build nanti: bash ${APP_DIR}/vps-install/install-apk.sh"
            return 0
        fi
    fi

    # Check VPS_IP
    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    # Check disk space
    local FREE_DISK=$(df -m / | awk 'NR==2{print $4}')
    if [ "$FREE_DISK" -lt "3000" ]; then
        print_warning "Disk space tersisa hanya ${FREE_DISK}MB"
        print_warning "APK build memerlukan minimal 3GB. Lanjutkan? [y/N]"
        if [ -t 0 ]; then
            read -p "" DISK_CONFIRM
            if [[ ! "$DISK_CONFIRM" =~ ^[Yy]$ ]]; then
                print_info "APK build dibatalkan karena kurang disk space"
                return 0
            fi
        fi
    fi

    # Jalankan semua langkah
    install_java
    install_android_sdk
    configure_android_env
    setup_mobile_app
    configure_mobile_app_api
    build_apk
    deploy_apk
    configure_nginx_download
    show_apk_status

    print_success "APK Builder selesai!"
    print_success "APK customer tersedia di: http://${VPS_IP}/downloads/${APK_NAME}"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    check_root

    # Source common.sh untuk APP_DIR, APP_USER, dll
    if [ -z "$APP_DIR" ]; then
        export APP_DIR="/var/www/salfanet-radius"
    fi
    if [ -z "$APP_USER" ]; then
        export APP_USER="salfanet"
        export APP_GROUP="salfanet"
    fi

    # Deteksi VPS_IP
    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    # Handle args
    case "${1:-}" in
        --status)
            show_apk_status
            ;;
        --rebuild)
            rebuild_apk
            ;;
        --java-only)
            install_java
            ;;
        --sdk-only)
            install_java
            install_android_sdk
            configure_android_env
            ;;
        --build-only)
            source /etc/profile.d/android-sdk.sh 2>/dev/null || true
            configure_mobile_app_api
            build_apk
            deploy_apk
            show_apk_status
            ;;
        *)
            install_apk_builder
            ;;
    esac
}

# Run jika dijalankan langsung (bukan di-source)
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    main "$@"
fi
