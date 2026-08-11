#!/usr/bin/env pwsh
# ============================================================================
# SALFANET RADIUS - Production Export Script (Windows PowerShell)
# ============================================================================
# Copy project ke folder terpisah untuk production deployment ke VPS
# ============================================================================

param(
    [switch]$NoBuild,
    [switch]$NoZip,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Continue"

# ============================================================================
# KONFIGURASI
# ============================================================================
$SourceDir  = $PSScriptRoot | Split-Path -Parent
$PkgJson    = Get-Content "$SourceDir\package.json" -Raw | ConvertFrom-Json
$Version    = $PkgJson.version
$Timestamp  = Get-Date -Format "yyyyMMdd-HHmmss"

# Guard: jika OutputDir diisi dengan string yang mirip flag (--xxx), abaikan dan pakai default
# Hal ini terjadi jika user mengetik: .\export-production.ps1 --nobuild (double dash, bukan -NoBuild)
if ($OutputDir -match '^--') {
    Write-Host "  [!]  OutputDir '$OutputDir' terlihat seperti flag, diabaikan." -ForegroundColor DarkYellow
    Write-Host "       Gunakan: .\export-production.ps1 -NoBuild  (bukan --nobuild)" -ForegroundColor DarkYellow
    $OutputDir = ""
    $NoBuild   = $true   # anggap sebagai -NoBuild
}

$DestDir    = if ($OutputDir) { $OutputDir } else { "$SourceDir\..\salfanet-radius-production" }

# Guard: pastikan DestDir tidak berada di dalam SourceDir (mencegah Turbopack path error)
$DestDirAbs = [System.IO.Path]::GetFullPath($DestDir)
$SourceDirAbs = [System.IO.Path]::GetFullPath($SourceDir)
if ($DestDirAbs.StartsWith($SourceDirAbs + "\") -or $DestDirAbs -eq $SourceDirAbs) {
    Write-Host "  [XX] ERROR: OutputDir '$DestDirAbs' berada di dalam project root!" -ForegroundColor Red
    Write-Host "       Ini akan menyebabkan error Turbopack saat build." -ForegroundColor Red
    Write-Host "       Gunakan path di luar project, contoh: -OutputDir 'C:\output\salfanet'" -ForegroundColor Yellow
    exit 1
}

$AppDir     = Join-Path $DestDir "salfanet-radius"   # subfolder di dalam ZIP
$ZipPath    = "$SourceDir\..\salfanet-radius-v${Version}-${Timestamp}.zip"

function Write-Step { param([string]$msg) Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor Yellow }
function Write-Warn { param([string]$msg) Write-Host "  [!]  $msg" -ForegroundColor DarkYellow }
function Write-Fail { param([string]$msg) Write-Host "  [XX] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "SALFANET RADIUS - Production Export v$Version" -ForegroundColor Magenta
Write-Host "Source : $SourceDir"  -ForegroundColor Gray
Write-Host "Output : $DestDir"    -ForegroundColor Gray
Write-Host ""

# ============================================================================
# STEP 1: BUILD
# ============================================================================
if (-not $NoBuild) {
    Write-Step "Step 1: Build Next.js"

    Push-Location $SourceDir
    Write-Info "Generating Prisma client..."
    $prismaOut = npx prisma generate --no-engine 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Prisma generate warning (lanjut): $($prismaOut | Select-Object -Last 3 | Out-String)"
    } else {
        Write-OK "Prisma client generated"
    }

    Write-Info "Running next build (5-10 menit, VPS-optimized)..."
    # Stop PM2 services jika berjalan, untuk bebaskan RAM sebelum build
    try { pm2 stop all 2>$null } catch {}
    # Gunakan build:vps - memory limit 1.5GB, aman untuk VPS 2GB RAM
    npm run build:vps
    $buildExit = $LASTEXITCODE
    Pop-Location
    if ($buildExit -ne 0) {
        Write-Fail "Build gagal! (exit code $buildExit)"
        exit 1
    }
    Write-OK "Build selesai"
} else {
    Write-Warn "Build dilewati (--NoBuild)"
    if (-not (Test-Path "$SourceDir\.next")) {
        Write-Fail "Folder .next tidak ada! Jalankan tanpa --NoBuild."
        exit 1
    }
}

# ============================================================================
# STEP 2: BUAT FOLDER TUJUAN
# ============================================================================
Write-Step "Step 2: Buat folder production"

if (Test-Path $DestDir) {
    Write-Info "Menghapus folder lama: $DestDir"
    Remove-Item -Recurse -Force $DestDir
}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
Write-OK "Folder dibuat: $AppDir"

# ============================================================================
# STEP 3: COPY FILES & FOLDERS SECARA MANUAL
# ============================================================================
Write-Step "Step 3: Copy files ke production"

# Helper: copy folder rekursif, skip sub-folder tertentu
# Menggunakan -LiteralPath agar nama folder seperti [id] tidak dianggap wildcard
function Copy-Folder {
    param(
        [string]$Src,
        [string]$Dst,
        [string[]]$SkipFolders = @()
    )
    if (-not (Test-Path -LiteralPath $Src)) {
        return  # silent skip - folder tidak ada (misal .next sebelum build)
    }
    New-Item -ItemType Directory -Force -Path $Dst | Out-Null

    # Copy files di level ini
    Get-ChildItem -LiteralPath $Src -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Dst -Force
    }

    # Copy sub-folder rekursif kecuali yang di-skip
    Get-ChildItem -LiteralPath $Src -Directory | ForEach-Object {
        if ($SkipFolders -notcontains $_.Name) {
            Copy-Folder -Src $_.FullName -Dst (Join-Path $Dst $_.Name) -SkipFolders $SkipFolders
        }
    }
}

# --- src/ ---
Write-Info "Copying src/..."
Copy-Folder -Src "$SourceDir\src" -Dst "$AppDir\src"
Write-OK "src/ selesai"

# --- .next/ (tanpa cache) ---
Write-Info "Copying .next/ (tanpa cache)..."
Copy-Folder -Src "$SourceDir\.next" -Dst "$AppDir\.next" -SkipFolders @("cache")
Write-OK ".next/ selesai"

# --- prisma/ ---
Write-Info "Copying prisma/..."
Copy-Folder -Src "$SourceDir\prisma" -Dst "$AppDir\prisma"
Write-OK "prisma/ selesai"

# --- public/ ---
Write-Info "Copying public/..."
Copy-Folder -Src "$SourceDir\public" -Dst "$AppDir\public"
Write-OK "public/ selesai"

# --- vps-install/ ---
Write-Info "Copying vps-install/..."
Copy-Folder -Src "$SourceDir\vps-install" -Dst "$AppDir\vps-install"
Write-OK "vps-install/ selesai"

# --- production/ ---
Write-Info "Copying production/..."
Copy-Folder -Src "$SourceDir\production" -Dst "$AppDir\production"
Write-OK "production/ selesai"

# --- freeradius-config/ ---
Write-Info "Copying freeradius-config/..."
Copy-Folder -Src "$SourceDir\freeradius-config" -Dst "$AppDir\freeradius-config"
Write-OK "freeradius-config/ selesai"

# --- scripts/ ---
Write-Info "Copying scripts/..."
Copy-Folder -Src "$SourceDir\scripts" -Dst "$AppDir\scripts"
Write-OK "scripts/ selesai"

# --- docs/ ---
Write-Info "Copying docs/..."
Copy-Folder -Src "$SourceDir\docs" -Dst "$AppDir\docs"
Write-OK "docs/ selesai"

# --- mobile-app/ (tanpa node_modules, android build output, .expo) ---
Write-Info "Copying mobile-app/ (tanpa build artifacts)..."
Copy-Folder -Src "$SourceDir\mobile-app" `
            -Dst "$AppDir\mobile-app" `
            -SkipFolders @("node_modules", ".expo", ".gradle")

# Hapus android build output jika ter-copy
@(
    "$AppDir\mobile-app\android\build",
    "$AppDir\mobile-app\android\app\build",
    "$AppDir\mobile-app\android\.gradle"
) | ForEach-Object {
    if (Test-Path $_) { Remove-Item -Recurse -Force $_ }
}
Write-OK "mobile-app/ selesai"

# --- Root config files ---
Write-Info "Copying root config files..."
$rootFiles = @(
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "components.json",
    "next-env.d.ts",
    "vitest.config.ts",
    "cron-service.js",
    ".env.example",
    "README.md"
)
# ecosystem.config.js — always copy from production/ so rsync --delete
# on VPS update never removes it from the app root
$ecoSrc = "$SourceDir\production\ecosystem.config.js"
if (Test-Path -LiteralPath $ecoSrc) {
    Copy-Item -LiteralPath $ecoSrc -Destination "$AppDir\ecosystem.config.js" -Force
    Write-OK "ecosystem.config.js copied from production/ to root"
}
foreach ($f in $rootFiles) {
    $fp = Join-Path $SourceDir $f
    if (Test-Path -LiteralPath $fp) {
        Copy-Item -LiteralPath $fp -Destination (Join-Path $AppDir $f) -Force
    }
}
Write-OK "Root files selesai"

# ============================================================================
# SECURITY CHECK: Jangan eksport private keys
# ============================================================================
Write-Step "Security: Verifikasi tidak ada private key"
$sensitiveFiles = @(
    "$AppDir\salfanet-radius-firebase-adminsdk*.json",
    "$AppDir\*firebase-service-account*.json",
    "$AppDir\google-services.json",
    "$AppDir\src\lib\firebase-service-account.json"
)
$found = $false
foreach ($pattern in $sensitiveFiles) {
    if (Get-ChildItem $pattern -ErrorAction SilentlyContinue) {
        Write-Warn "WARNING: File sensitif ditemukan di export: $pattern"
        Write-Warn "File ini TIDAK akan diupload — hapus manual jika ada di ZIP"
        $found = $true
    }
}
# Hapus firebase service account dari src/lib/ agar tidak masuk ZIP
$fbPath = "$AppDir\src\lib\firebase-service-account.json"
if (Test-Path $fbPath) {
    Remove-Item -Force $fbPath
    Write-Warn "DIHAPUS dari export: src/lib/firebase-service-account.json (private key — harus dikopi manual di VPS)"
    $found = $true
} else {
    Write-OK "Tidak ada private key Firebase di export"
}

if ($found) {
    Write-Warn "PERHATIAN: Upload firebase-service-account.json ke VPS secara manual (tidak ada di ZIP)"
}

# ============================================================================
# STEP 4: BUAT DEPLOY INFO
# ============================================================================
Write-Step "Step 4: Buat DEPLOY_INFO.txt"

$nodeVer = (node --version 2>$null)
$npmVer  = (npm --version  2>$null)

@"
============================================
SALFANET RADIUS - Production Build Info
============================================
Version       : $Version
Build Date    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Build Machine : $env:COMPUTERNAME
Node Version  : $nodeVer
npm Version   : $npmVer

DEPLOYMENT INSTRUCTIONS
-----------------------
1. Upload ZIP ke VPS:
   scp salfanet-radius-*.zip root@VPS_IP:/root/

2. Upload Firebase service account SECARA TERPISAH (tidak masuk ZIP):
   scp src/lib/firebase-service-account.json root@VPS_IP:/var/www/salfanet-radius/src/lib/

3. Di VPS, extract dan install:
   cd /root
   unzip salfanet-radius-*.zip
   bash /root/salfanet-radius/vps-install/vps-installer.sh

4. Build APK customer (opsional, setelah install selesai):
   bash /var/www/salfanet-radius/vps-install/install-apk.sh

5. APK customer tersedia di:
   http://VPS_IP/downloads/salfanet-radius.apk

CATATAN PENTING
---------------
- firebase-service-account.json TIDAK ada di ZIP (security)
  Upload manual: scp src/lib/firebase-service-account.json root@VPS:/var/www/salfanet-radius/src/lib/
- Gunakan: npm run build:vps  (bukan npm run build) di VPS 2GB RAM

============================================
"@ | Set-Content "$AppDir\DEPLOY_INFO.txt" -Encoding UTF8

Write-OK "DEPLOY_INFO.txt dibuat"

# ============================================================================
# STEP 5: MOBILE APP ENV TEMPLATE
# ============================================================================
Write-Step "Step 5: Mobile app .env template"

@"
# Mobile App Environment - Update API_URL dengan IP VPS Anda
API_URL=http://YOUR_VPS_IP:3000
API_TIMEOUT=30000
APP_NAME=SALFANET RADIUS
APP_VERSION=$Version
"@ | Set-Content "$AppDir\mobile-app\.env.production.template" -Encoding UTF8

Write-OK "mobile-app/.env.production.template dibuat"

# ============================================================================
# SUMMARY
# ============================================================================
$destMB = [math]::Round(
    (Get-ChildItem $DestDir -Recurse -ErrorAction SilentlyContinue |
     Measure-Object -Property Length -Sum).Sum / 1MB, 1)

# ============================================================================
# STEP 6: ZIP
# ============================================================================
if (-not $NoZip) {
    Write-Step "Step 6: Buat ZIP archive"

    # Hapus zip lama jika ada
    if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }

    Write-Info "Compressing $destMB MB ke ZIP..."
    Write-Info "  Output : $ZipPath"
    Write-Info "  (proses bisa 3-10 menit, harap tunggu...)"
    Write-Host ""

    # Pakai .NET ZipFile langsung — lebih cepat dari Compress-Archive
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    try {
        [System.IO.Compression.ZipFile]::CreateFromDirectory(
            $DestDir,
            $ZipPath,
            [System.IO.Compression.CompressionLevel]::Fastest,
            $false  # includeBaseDirectory = false (isi $DestDir = folder salfanet-radius/)
        )
        $zipMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
        Write-OK "ZIP selesai: $ZipPath ($zipMB MB)"
    } catch {
        Write-Warn "ZipFile gagal, fallback ke Compress-Archive..."
        Compress-Archive -Path "$DestDir\*" -DestinationPath $ZipPath -Force -CompressionLevel Fastest
        # Catatan: fallback ini juga akan menyertakan folder salfanet-radius/ di root ZIP
        $zipMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
        Write-OK "ZIP selesai: $ZipPath ($zipMB MB)"
    }
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host ""
Write-Host "===== EXPORT SELESAI =====" -ForegroundColor Green
Write-Host ""
Write-Host "  Production folder : $DestDir ($destMB MB)" -ForegroundColor White
if (-not $NoZip -and (Test-Path $ZipPath)) {
    $zipMB2 = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
    Write-Host "  ZIP archive       : $ZipPath ($zipMB2 MB)" -ForegroundColor White
}
Write-Host ""
Write-Host "LANGKAH SELANJUTNYA:" -ForegroundColor Cyan
if (-not $NoZip) {
    Write-Host "  1. Upload ZIP ke VPS:"
    Write-Host "       scp `"$ZipPath`" root@VPS_IP:/root/"
}
Write-Host "  2. Di VPS extract + install:"
    Write-Host "       unzip salfanet-radius-*.zip"
    Write-Host "       bash /root/salfanet-radius/vps-install/vps-installer.sh"
Write-Host "  3. Build APK customer (opsional, di VPS):"
Write-Host "       bash /var/www/salfanet-radius/vps-install/install-apk.sh"
Write-Host ""
