import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  LayoutDashboard,
  Users,
  Wifi,
  History,
  Settings,
  Plus,
  Activity,
  UserCheck,
  Package,
  Trash2,
  UserX,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  LogIn,
  LogOut,
  User,
  Database,
  TrendingUp,
  CreditCard,
  FileText,
  MessageSquare,
  BadgeCent,
  CalendarDays,
  Smartphone,
  Eye,
  EyeOff,
  Info,
  MapPin,
  Calendar,
  Globe,
  Monitor,
  Copy,
  CircleDollarSign,
  Bell,
  ArrowRight,
  Download,
  Sun,
  Moon,
  Printer,
  Inbox,
  FileOutput,
  Wand2,
  Lock,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Zap,
  Wallet,
  Menu,
  KeyRound,
  CalendarCheck,
  CalendarX,
  ClipboardList,
  WifiOff,
  Tag,
  Unplug,
  UserPlus,
  ArrowLeftRight,
  RefreshCw,
  Building2,
  BookOpen
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import * as XLSX from 'xlsx';
import { lazy, Suspense } from 'react'

// ─── Lazy-loaded page components (dimuat hanya saat dibutuhkan) ───────────────
const LogPage              = lazy(() => import('./pages/admin/LogPage'))
const NotificationsPage    = lazy(() => import('./pages/admin/NotificationsPage'))
const CollectorIsolirPage  = lazy(() => import('./pages/collector/CollectorIsolirPage'))
const CollectorOntPage     = lazy(() => import('./pages/collector/CollectorOntPage'))
const CollectorProofsPage  = lazy(() => import('./pages/collector/CollectorProofsPage'))
const CollectorSettlementsPage = lazy(() => import('./pages/collector/CollectorSettlementsPage'))
const SettingsMikrotikPage = lazy(() => import('./pages/admin/SettingsMikrotikPage'))
const TerritoriesPage      = lazy(() => import('./pages/admin/TerritoriesPage'))
const AddonTypesPage       = lazy(() => import('./pages/admin/AddonTypesPage'))
const PaketPage            = lazy(() => import('./pages/admin/PaketPage'))
const SettingsBillingPage  = lazy(() => import('./pages/admin/SettingsBillingPage'))
const SystemUsersPage      = lazy(() => import('./pages/admin/SystemUsersPage'))
const WaitingListPage      = lazy(() => import('./pages/admin/WaitingListPage'))
const AdminOntTasksPage    = lazy(() => import('./pages/admin/AdminOntTasksPage'))
const LaporanPsbPage       = lazy(() => import('./pages/admin/LaporanPsbPage'))
const IPPoolPage           = lazy(() => import('./pages/admin/IPPoolPage'))
const PelangganPage        = lazy(() => import('./pages/admin/PelangganPage'))
const DashboardPage        = lazy(() => import('./pages/admin/DashboardPage'))
const FinancesPage         = lazy(() => import('./pages/admin/FinancesPage'))
const TenantManagementPage = lazy(() => import('./pages/admin/TenantManagementPage'))
const SuperAdminDashboard  = lazy(() => import('./pages/superadmin/SuperAdminDashboard'))
const SuperAdminPlatformPage = lazy(() => import('./pages/superadmin/SuperAdminPlatformPage'))
const PSBPage              = lazy(() => import('./pages/admin/PSBPage'))
import MapPicker from './components/MapPicker';
import SearchableSelect from './components/SearchableSelect';
import { AuthContext } from './context/AuthContext';
import { UIContext } from './context/UIContext';
import { NavigationContext } from './context/NavigationContext';
import { useAuth } from './hooks/useAuth';
import { useUI } from './hooks/useUI';
import { useNotifications } from './hooks/useNotifications';
import { useFinances } from './hooks/useFinances';
import { useInstallLog } from './hooks/useInstallLog';
import { usePromises } from './hooks/usePromises';
import { useOntTasks } from './hooks/useOntTasks';
import { useWaitingList } from './hooks/useWaitingList';
import { useCollector } from './hooks/useCollector';
import { useStaff } from './hooks/useStaff';
import { useTerritories } from './hooks/useTerritories';
import { useBilling } from './hooks/useBilling';
import { useMikrotik } from './hooks/useMikrotik';
import { useUsers } from './hooks/useUsers';
import { compressImage, composeAddress } from './utils/appUtils';
import { monthLabel } from './utils/format';

// ─── WhatsApp SVG icon (tidak tersedia di lucide-react) ───────────────────────
const WhatsAppIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.128.558 4.122 1.532 5.849L.054 23.05a.75.75 0 0 0 .918.928l5.32-1.474A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.91 0-3.694-.528-5.218-1.443l-.374-.22-3.878 1.075 1.1-3.774-.243-.389A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
  </svg>
)


// Normalisasi nomor HP → format internasional 62xxx (tanpa +)
const normalizePhone = (phone) => {
  if (!phone) return ''
  let num = String(phone).replace(/[^0-9]/g, '') // strip semua non-digit
  if (num.startsWith('62')) return num            // sudah ada kode negara
  if (num.startsWith('0')) return '62' + num.slice(1) // 08xxx → 628xxx
  if (num.startsWith('8')) return '62' + num      // 8xxx → 628xxx
  return num
}

const tabLabels = {
  dashboard: 'Ringkasan Sistem',
  pelanggan: 'Daftar Pelanggan',
  paket: 'Profil Kecepatan',
  billing: 'Manajemen Penagihan',
  ippool: 'Alokasi IP Address',
  settings_mikrotik: 'Konfigurasi Router',
  settings_billing: 'Pengaturan Billing',
  log: 'Riwayat Aktivitas',
  system_users: 'Manajemen Staff',
  finances: 'Laporan Keuangan',
  laporan_psb: 'Laporan PSB',
  territories: 'Manajemen Wilayah',
  addon_types: 'Layanan Tambahan',
  waiting_list: 'Waiting List Pemasangan',
  mapping: 'Peta Sebaran Pelanggan',
  collector_isolir: 'Pelanggan Terisolir',
  collector_ont: 'Riwayat Cabut ONT',
  collector_proofs: 'Verifikasi Bukti Transfer',
  notifications: 'Riwayat Notifikasi',
  collector_settlements: 'Rekap Setoran Kolektor',
  tenants: 'Manajemen Mitra',
  admin_ont_tasks: 'Manajemen Task Cabut ONT',
  sa_dashboard: 'Dashboard',
  sa_mitra: 'Manajemen Mitra',
}

// ─── Portal role info ──────────────────────────────────────────────────────────
const PORTAL_INFO = {
  technician: { title: 'PORTAL PSB', subtitle: 'Manajemen Pemasangan Baru', sidebarTitle: 'PORTAL PSB' },
  collector: { title: 'PORTAL KOLEKTOR', subtitle: 'Penagihan & Manajemen Wilayah', sidebarTitle: 'PORTAL KOLEKTOR' },
}

// Komponen search input dengan tombol ✕ untuk hapus teks
// =============================================
// RECEIPT IMAGE GENERATOR (Canvas → JPG)
// =============================================

function generateReceiptJpg(receiptData) {
  return new Promise((resolve) => {
    const W = 420
    const lineH = 22
    const padX = 24

    // Pre-calculate lines
    const methodLabel = receiptData.paymentMethod === 'transfer' ? 'Transfer' : receiptData.paymentMethod === 'online' ? 'Online' : 'Cash'
    const paidDate = receiptData.paidAt
      ? new Date(receiptData.paidAt).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
      : new Date().toLocaleDateString('id-ID')
    const paidTime = receiptData.paidAt
      ? new Date(receiptData.paidAt).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
      : new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })

    const rows1 = [
      ['No Invoice', `#INV-${String(receiptData.id).padStart(5,'0')}`],
      ['Tanggal', paidDate],
      ['Jam', paidTime],
    ]
    const rows2 = [
      ['CPID', receiptData.customerId || '-'],
      ['Nama', receiptData.fullname || '-'],
      ['No. HP', receiptData.phone || '-'],
      ['Alamat', receiptData.address || '-'],
      ['Paket', receiptData.groupname || '-'],
      ['Periode', monthLabel(receiptData.period) || '-'],
    ]
    const rows3 = [
      ['Metode', methodLabel],
      ...(receiptData.collectedBy ? [['Diterima oleh', receiptData.collectedBy]] : []),
    ]

    const hasLogo = !!receiptData.companyLogo
    const footerLines = [receiptData.companyAddress, receiptData.companyPhone].filter(Boolean)

    // Calculate total height
    const discountRows = receiptData.discount > 0 ? 2 : 0 // Harga Normal + Diskon rows
    const sections = [
      hasLogo ? 3 : 0, // logo + company header
      1,               // title
      1,               // divider gap
      rows1.length,    // date rows
      1,               // divider
      rows2.length,    // customer rows
      1,               // divider
      discountRows,    // discount rows (0 or 2)
      1,               // TOTAL row
      rows3.length,    // method rows
      1,               // divider
      1 + footerLines.length, // footer: terima kasih + address lines
    ]
    const H = (sections.reduce((a,b)=>a+b,0)) * lineH + 80

    const doRender = (logoImg) => {
      const canvas = document.createElement('canvas')
      const scale = 2 // retina
      canvas.width = W * scale
      canvas.height = H * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)

      // Background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      let y = 28

      const drawCenter = (text, font, color = '#111') => {
        ctx.font = font
        ctx.fillStyle = color
        ctx.textAlign = 'center'
        ctx.fillText(text, W / 2, y)
        y += lineH
      }
      const drawRow = (left, right, fontL = '13px monospace', fontR = '13px monospace', colorR = '#111') => {
        ctx.textAlign = 'left'
        ctx.font = fontL
        ctx.fillStyle = '#555'
        ctx.fillText(left, padX, y)
        ctx.textAlign = 'right'
        ctx.font = fontR
        ctx.fillStyle = colorR
        // Wrap long right text
        const maxW = W - padX * 2 - 100
        const words = right.split(' ')
        let line = ''
        const lines = []
        for (const w of words) {
          const test = line ? line + ' ' + w : w
          ctx.font = fontR
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w }
          else line = test
        }
        lines.push(line)
        lines.forEach((l, i) => {
          ctx.fillText(l, W - padX, y + i * 16)
        })
        y += Math.max(lineH, lines.length * 16)
      }
      const drawDivider = () => {
        ctx.strokeStyle = '#ccc'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(padX, y - 4)
        ctx.lineTo(W - padX, y - 4)
        ctx.stroke()
        ctx.setLineDash([])
        y += 6
      }

      // Logo
      if (logoImg) {
        // Logo di kiri atas
        const logoH = 44
        const logoW = Math.min(110, logoImg.width * logoH / logoImg.height)
        ctx.drawImage(logoImg, padX, y, logoW, logoH)
        y += logoH + 6
      }
      // Nama perusahaan selalu di tengah
      drawCenter(receiptData.companyName || 'PMYNET ISP', 'bold 15px monospace')

      drawCenter('BUKTI PEMBAYARAN', '12px monospace', '#555')
      y += 4
      drawDivider()

      rows1.forEach(([k, v]) => drawRow(k, v))
      y += 2; drawDivider()

      rows2.forEach(([k, v]) => drawRow(k, v))
      y += 2; drawDivider()

      // Discount rows (when applicable)
      if (receiptData.discount > 0) {
        drawRow('Harga Normal', `Rp ${(Number(receiptData.amount) + Number(receiptData.discount)).toLocaleString('id-ID')}`)
        drawRow('Diskon', `- Rp ${Number(receiptData.discount).toLocaleString('id-ID')}`, '13px monospace', '13px monospace', '#b45309')
      }

      // TOTAL bold
      drawRow('TOTAL', `Rp ${Number(receiptData.amount).toLocaleString('id-ID')}`, 'bold 14px monospace', 'bold 14px monospace', '#111')
      rows3.forEach(([k, v]) => drawRow(k, v))
      y += 2; drawDivider()

      // Footer: terima kasih + alamat/telepon
      drawCenter('Terima kasih atas pembayaran Anda', '11px monospace', '#888')
      footerLines.forEach(l => l.split('\n').forEach(line => drawCenter(line, '10px monospace', '#999')))

    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92)
    } // end doRender

    if (receiptData.companyLogo) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => doRender(img)
      img.onerror = () => doRender(null)
      img.src = receiptData.companyLogo
    } else {
      doRender(null)
    }
  })
}

// =============================================
// ESC/POS + BLUETOOTH THERMAL PRINTER
// =============================================

// Common BLE UUIDs for Chinese thermal printers (GOOJPRT, Xprinter, etc.)
const BT_PRINTER_CONFIGS = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '000018f1-0000-1000-8000-00805f9b34fb' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', characteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
]

const ESC = 0x1B
const GS  = 0x1D

function buildEscPosReceipt(receipt, paperWidth = 32) {
  const enc = new TextEncoder()
  const bytes = []

  const push = (...b) => bytes.push(...b)
  const text = (s) => bytes.push(...enc.encode(s))
  const line = (s = '') => { text(s); push(0x0A) }
  const center = (s) => {
    const pad = Math.max(0, Math.floor((paperWidth - s.length) / 2))
    text(' '.repeat(pad) + s)
    push(0x0A)
  }
  const divider = () => line('-'.repeat(paperWidth))
  const row = (left, right) => {
    const space = Math.max(1, paperWidth - left.length - right.length)
    line(left + ' '.repeat(space) + right)
  }

  // Init
  push(ESC, 0x40)
  // Bold on
  push(ESC, 0x45, 0x01)
  center(receipt.companyName || 'PMYNET ISP')
  // Bold off
  push(ESC, 0x45, 0x00)
  center('BUKTI PEMBAYARAN')
  divider()

  row('No Invoice', `#INV-${String(receipt.id).padStart(5,'0')}`)
  row('Tanggal', receipt.paidAt ? new Date(receipt.paidAt).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : new Date().toLocaleDateString('id-ID'))
  row('Jam', receipt.paidAt ? new Date(receipt.paidAt).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }))
  divider()

  row('CPID', (receipt.customerId || '-').slice(0, 18))
  row('Nama', (receipt.fullname || '').slice(0, 18))
  row('No. HP', (receipt.phone || '-').slice(0, 18))
  row('Alamat', (receipt.address || '-').slice(0, 18))
  row('Paket', (receipt.groupname || '-').slice(0, 18))
  row('Periode', monthLabel(receipt.period) || '-')
  divider()

  if (receipt.discount > 0) {
    row('Harga Normal', `Rp ${(Number(receipt.amount) + Number(receipt.discount)).toLocaleString('id-ID')}`)
    row('Diskon', `- Rp ${Number(receipt.discount).toLocaleString('id-ID')}`)
  }

  // Bold + double height for amount
  push(ESC, 0x45, 0x01, GS, 0x21, 0x01)
  row('TOTAL', `Rp ${Number(receipt.amount).toLocaleString('id-ID')}`)
  push(GS, 0x21, 0x00, ESC, 0x45, 0x00)

  const methodLabel = receipt.paymentMethod === 'transfer' ? 'Transfer' : receipt.paymentMethod === 'online' ? 'Online' : 'Cash'
  row('Metode', methodLabel)
  if (receipt.collectedBy) row('Diterima oleh', receipt.collectedBy.slice(0, 15))
  divider()

  center('Terima kasih atas pembayaran Anda')
  center(receipt.companyName || 'PMYNET ISP')
  push(0x0A, 0x0A, 0x0A)
  // Full cut
  push(GS, 0x56, 0x00)

  return new Uint8Array(bytes)
}

let _btDevice = null
let _btCharacteristic = null

async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth tidak didukung di browser ini. Gunakan Chrome.')

  // Try to reconnect to previously paired device
  if (_btDevice && _btDevice.gatt.connected) return _btCharacteristic

  const allServiceUuids = BT_PRINTER_CONFIGS.map(c => c.service)
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [allServiceUuids[0]] }, { services: [allServiceUuids[1]] }, { services: [allServiceUuids[2]] }, { services: [allServiceUuids[3]] }],
    optionalServices: allServiceUuids,
    acceptAllDevices: false,
  }).catch(() => {
    // fallback: accept all + optional services
    return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: allServiceUuids })
  })

  _btDevice = device
  const server = await device.gatt.connect()

  for (const cfg of BT_PRINTER_CONFIGS) {
    try {
      const svc = await server.getPrimaryService(cfg.service)
      const char = await svc.getCharacteristic(cfg.characteristic)
      _btCharacteristic = char
      return char
    } catch { /* try next */ }
  }
  throw new Error('Printer tidak dikenali. Pastikan printer sudah di-pair dan dalam jangkauan.')
}

async function sendToBluetooth(data, onStatus) {
  try {
    onStatus?.('Mencari printer...')
    const char = await connectBluetoothPrinter()
    onStatus?.('Mengirim data...')
    const chunkSize = 512
    for (let i = 0; i < data.length; i += chunkSize) {
      await char.writeValueWithoutResponse(data.slice(i, i + chunkSize))
      await new Promise(r => setTimeout(r, 30))
    }
    onStatus?.('Selesai!')
  } catch (err) {
    _btDevice = null
    _btCharacteristic = null
    throw err
  }
}

function ReceiptModal({ invoice, companyName, companyLogo, companyAddress, companyPhone, currentUser, onClose }) {
  const [btStatus, setBtStatus] = React.useState('')
  const [btLoading, setBtLoading] = React.useState(false)
  const [shareLoading, setShareLoading] = React.useState(false)

  // Hilangkan prefix role jika ada (misal "Admin PMY NET" → "PMY NET")
  const cleanCompanyName = (companyName || 'PMYNET ISP').replace(/^(Admin|Kolektor|Teknisi|NOC)\s+/i, '').trim()

  const receiptData = {
    id: invoice.id,
    customerId: invoice.customer_id || '-',
    fullname: invoice.fullname || invoice.username,
    phone: invoice.phone || '-',
    address: invoice.address || '-',
    groupname: invoice.current_package || invoice.groupname,
    period: invoice.period,
    amount: invoice.amount,
    discount: invoice.discount || 0,
    paymentMethod: invoice.payment_method,
    paidAt: invoice.paid_at,
    collectedBy: currentUser?.fullname || currentUser?.username,
    companyName: cleanCompanyName,
    companyLogo: companyLogo || '',
    companyAddress: companyAddress || '',
    companyPhone: companyPhone || '',
  }

  const handleBrowserPrint = () => {
    const w = window.open('', '_blank', 'width=400,height=600')
    const methodLabel = receiptData.paymentMethod === 'transfer' ? '🏦 Transfer' : receiptData.paymentMethod === 'online' ? '🌐 Online' : '💵 Cash'
    const paidDate = receiptData.paidAt ? new Date(receiptData.paidAt).toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : new Date().toLocaleString('id-ID')
    w.document.write(`<!DOCTYPE html><html><head><title>Struk Pembayaran</title><style>
      body{font-family:monospace;font-size:13px;width:280px;margin:0 auto;padding:16px}
      .center{text-align:center}.bold{font-weight:bold}.divider{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      .big{font-size:16px;font-weight:bold}
      .muted{color:#666;font-size:11px}
      @media print{@page{margin:0;size:58mm auto}}
    </style></head><body>
      ${receiptData.companyLogo ? `<img src="${receiptData.companyLogo}" style="display:block;max-height:44px;max-width:110px;object-fit:contain;margin-bottom:4px">` : ''}
      <div class="center bold" style="font-size:14px">${receiptData.companyName}</div>
      <div class="center">BUKTI PEMBAYARAN</div>
      <div class="divider"></div>
      <div class="row"><span>No Invoice</span><span>#INV-${String(receiptData.id).padStart(5,'0')}</span></div>
      <div class="row"><span>Tanggal</span><span>${paidDate}</span></div>
      <div class="divider"></div>
      <div class="row"><span>CPID</span><span>${receiptData.customerId}</span></div>
      <div class="row"><span>Nama</span><span>${receiptData.fullname}</span></div>
      <div class="row"><span>No. HP</span><span>${receiptData.phone}</span></div>
      <div class="row"><span>Alamat</span><span style="max-width:55%;text-align:right">${receiptData.address}</span></div>
      <div class="row"><span>Paket</span><span>${receiptData.groupname || '-'}</span></div>
      <div class="row"><span>Periode</span><span>${monthLabel(receiptData.period)}</span></div>
      <div class="divider"></div>
      ${receiptData.discount > 0 ? `
      <div class="row"><span>Harga Normal</span><span>Rp ${(Number(receiptData.amount) + Number(receiptData.discount)).toLocaleString('id-ID')}</span></div>
      <div class="row"><span>Diskon</span><span>- Rp ${Number(receiptData.discount).toLocaleString('id-ID')}</span></div>
      <div class="divider"></div>` : ''}
      <div class="row big"><span>TOTAL</span><span>Rp ${Number(receiptData.amount).toLocaleString('id-ID')}</span></div>
      <div class="row"><span>Metode</span><span>${methodLabel}</span></div>
      ${receiptData.collectedBy ? `<div class="row"><span>Diterima oleh</span><span>${receiptData.collectedBy}</span></div>` : ''}
      <div class="divider"></div>
      <div class="center">Terima kasih atas pembayaran Anda</div>
      ${[receiptData.companyAddress, receiptData.companyPhone].filter(Boolean).map(l => `<div class="center muted">${l.replace(/\n/g,'<br>')}</div>`).join('')}
      <script>window.onload=()=>{window.print();}</script>
    </body></html>`)
    w.document.close()
  }

  const handleBluetoothPrint = async () => {
    setBtLoading(true)
    setBtStatus('')
    try {
      const bytes = buildEscPosReceipt(receiptData)
      await sendToBluetooth(bytes, setBtStatus)
      setBtStatus('✅ Berhasil dicetak!')
    } catch (err) {
      setBtStatus(`❌ ${err.message}`)
    } finally {
      setBtLoading(false)
    }
  }

  const handleShare = async () => {
    setShareLoading(true)
    try {
      const blob = await generateReceiptJpg(receiptData)
      const fileName = `struk-INV${String(receiptData.id).padStart(5,'0')}.jpg`
      const file = new File([blob], fileName, { type: 'image/jpeg' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Struk Pembayaran #INV-${String(receiptData.id).padStart(5,'0')}`,
          text: `Bukti pembayaran ${receiptData.fullname} — ${receiptData.companyName}`,
        })
      } else {
        // Fallback: download file
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if (err.name !== 'AbortError') setBtStatus(`❌ ${err.message}`)
    } finally {
      setShareLoading(false)
    }
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: '400px', borderRadius: '16px', overflow: 'hidden', padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: '700', fontSize: '1rem' }}>🧾 Struk Pembayaran</span>
          <button className="icon-btn" onClick={onClose} style={{ padding: '4px' }}>✕</button>
        </div>

        {/* Receipt Preview */}
        <div style={{ padding: '1.25rem', fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--bg-secondary)', margin: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
          {/* Header: logo kiri atas, nama perusahaan tengah */}
          {companyLogo && (
            <img src={companyLogo} alt="Logo" style={{ display: 'block', maxHeight: '44px', maxWidth: '110px', objectFit: 'contain', marginBottom: '4px' }} />
          )}
          <div style={{ textAlign: 'center', fontWeight: '700', fontSize: '0.88rem', marginBottom: '2px' }}>{receiptData.companyName}</div>
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>BUKTI PEMBAYARAN</div>
          <div style={{ borderTop: '1px dashed var(--text-muted)', margin: '4px 0' }}></div>
          {[
            ['No Invoice', `#INV-${String(receiptData.id).padStart(5,'0')}`],
            ['Tanggal', receiptData.paidAt ? new Date(receiptData.paidAt).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : new Date().toLocaleDateString('id-ID')],
            ['Jam', receiptData.paidAt ? new Date(receiptData.paidAt).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })],
          ].map(([k,v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}><span>{k}</span><span>{v}</span></div>
          ))}
          <div style={{ borderTop: '1px dashed var(--text-muted)', margin: '4px 0' }}></div>
          {[
            ['CPID', receiptData.customerId],
            ['Nama', receiptData.fullname],
            ['No. HP', receiptData.phone],
            ['Alamat', receiptData.address],
            ['Paket', receiptData.groupname || '-'],
            ['Periode', monthLabel(receiptData.period)],
          ].map(([k,v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', margin: '2px 0' }}><span style={{ flexShrink: 0 }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
          ))}
          <div style={{ borderTop: '1px dashed var(--text-muted)', margin: '4px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '0.92rem', margin: '4px 0' }}>
            <span>TOTAL</span><span>Rp {Number(receiptData.amount).toLocaleString('id-ID')}</span>
          </div>
          {[
            ['Metode', receiptData.paymentMethod === 'transfer' ? 'Transfer' : receiptData.paymentMethod === 'online' ? 'Online' : 'Cash'],
            ...(receiptData.collectedBy ? [['Diterima oleh', receiptData.collectedBy]] : []),
          ].map(([k,v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}><span>{k}</span><span>{v}</span></div>
          ))}
          <div style={{ borderTop: '1px dashed var(--text-muted)', margin: '4px 0' }}></div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Terima kasih atas pembayaran Anda</div>
          {(companyAddress || companyPhone) && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'pre-line', marginTop: '2px' }}>
              {[companyAddress, companyPhone].filter(Boolean).join('\n')}
            </div>
          )}
        </div>

        {/* Print Buttons */}
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '0.65rem', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: '100%' }}
            onClick={handleBrowserPrint}>
            🖨️ Cetak (Browser)
          </button>
          <button style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.65rem', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: '100%', opacity: shareLoading ? 0.7 : 1 }}
            onClick={handleShare} disabled={shareLoading}>
            📤 {shareLoading ? 'Membuat gambar...' : 'Bagikan (WA / Bluetooth / dll)'}
          </button>
          <button className="btn btn-outline" style={{ borderRadius: '10px', padding: '0.65rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={handleBluetoothPrint} disabled={btLoading}>
            📱 {btLoading ? 'Menghubungkan...' : 'Cetak via Bluetooth'}
          </button>
          {btStatus && (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: btStatus.startsWith('✅') ? '#16a34a' : btStatus.startsWith('❌') ? '#ef4444' : 'var(--text-muted)', padding: '4px 0' }}>
              {btStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================
// MAPPING VIEW — Peta Sebaran Pelanggan
// =============================================
function MappingView({ users, onlineUsers, onViewUser }) {
  const mapRef = React.useRef(null)
  const mapInstanceRef = React.useRef(null)
  const markersRef = React.useRef([])
  const markerMapRef = React.useRef({}) // username → marker
  const searchRef = React.useRef(null)
  const [search, setSearch] = React.useState('')
  const [showDropdown, setShowDropdown] = React.useState(false)
  const [filterStatus, setFilterStatus] = React.useState('all')
  const [stats, setStats] = React.useState({ total: 0, online: 0, isolir: 0, offline: 0, noCoord: 0 })

  const onlineSet = React.useMemo(() => new Set((onlineUsers || []).map(u => u.username)), [onlineUsers])

  const getStatus = (u) => {
    if (u.is_isolated || u.is_suspended) return 'isolir'
    if (onlineSet.has(u.username)) return 'online'
    return 'offline'
  }

  const getColor = (status) => {
    if (status === 'online') return '#16a34a'
    if (status === 'isolir') return '#ef4444'
    return '#6b7280'
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return (users || []).filter(u => {
      if (!u.latitude || !u.longitude) return false
      if (filterStatus !== 'all' && getStatus(u) !== filterStatus) return false
      if (q && !((u.fullname || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.customer_id || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [users, onlineSet, filterStatus, search])

  // Dropdown: cari dari SEMUA pelanggan (bukan hanya yang punya koordinat)
  const dropdownResults = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return (users || [])
      .filter(u => (u.fullname || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.customer_id || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [users, search])

  // Bridge global: Leaflet popup (HTML biasa) → React modal detail
  React.useEffect(() => {
    window._mapOpenUserDetail = (username) => {
      const u = (users || []).find(x => x.username === username)
      if (u && onViewUser) onViewUser(u)
    }
    return () => { delete window._mapOpenUserDetail }
  }, [users, onViewUser])

  const flyToUser = (u) => {
    setShowDropdown(false)
    setSearch(u.fullname || u.username)
    if (!u.latitude || !u.longitude) return
    const map = mapInstanceRef.current
    if (!map) return
    map.flyTo([parseFloat(u.latitude), parseFloat(u.longitude)], 17, { duration: 1 })
    setTimeout(() => {
      const marker = markerMapRef.current[u.username]
      if (marker) marker.openPopup()
    }, 1100)
  }

  // Init map + auto GPS
  React.useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = window.L.map(mapRef.current, { zoomControl: true }).setView([-7.0, 107.5], 13)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map)
    mapInstanceRef.current = map

    // Auto-center ke posisi GPS user
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords
          map.setView([latitude, longitude], 14)
          // Marker posisi saya (biru)
          const meIcon = window.L.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.3)"></div>`,
            iconSize: [16, 16], iconAnchor: [8, 8],
          })
          window.L.marker([latitude, longitude], { icon: meIcon })
            .bindPopup('<b>📍 Posisi Anda</b>')
            .addTo(map)
        },
        () => {} // silent fail jika ditolak
      )
    }

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  // Update markers when data changes
  React.useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !window.L) return

    // Remove old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    markerMapRef.current = {}

    // Stats
    const all = (users || [])
    const withCoord = all.filter(u => u.latitude && u.longitude)
    const st = { total: withCoord.length, online: 0, isolir: 0, offline: 0, noCoord: all.length - withCoord.length }
    all.forEach(u => { const s = getStatus(u); if (s === 'online') st.online++; else if (s === 'isolir') st.isolir++; else st.offline++ })
    setStats(st)

    filtered.forEach(u => {
      const status = getStatus(u)
      const color = getColor(status)
      const statusLabel = status === 'online' ? '🟢 Online' : status === 'isolir' ? '🔴 Isolir' : '⚫ Offline'

      const icon = window.L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })

      const marker = window.L.marker([parseFloat(u.latitude), parseFloat(u.longitude)], { icon })
      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:13px;min-width:200px;color:var(--text-primary)">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:var(--text-primary)">${u.fullname || u.username}</div>
          <div style="color:var(--text-secondary);margin-bottom:4px">${statusLabel}</div>
          <hr style="margin:6px 0;border:none;border-top:1px solid var(--border-color)">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:var(--text-muted);padding:2px 4px 2px 0">CPID</td><td style="padding:2px 0;color:var(--text-primary)"><b>${u.customer_id || '-'}</b></td></tr>
            <tr><td style="color:var(--text-muted);padding:2px 4px 2px 0">Username</td><td style="padding:2px 0;color:var(--text-primary)">${u.username}</td></tr>
            <tr><td style="color:var(--text-muted);padding:2px 4px 2px 0">Paket</td><td style="padding:2px 0;color:var(--text-primary)">${u.groupname || '-'}</td></tr>
            <tr><td style="color:var(--text-muted);padding:2px 4px 2px 0">No. HP</td><td style="padding:2px 0;color:var(--text-primary)">${u.phone || '-'}</td></tr>
            <tr><td style="color:var(--text-muted);padding:2px 4px 2px 0">Alamat</td><td style="padding:2px 0;color:var(--text-primary)">${u.address || '-'}</td></tr>
          </table>
          <button onclick="window._mapOpenUserDetail('${u.username}')"
            style="margin-top:10px;width:100%;padding:6px 0;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);cursor:pointer;font-size:12px;font-weight:600;color:var(--map-popup-btn-color, #1e40af);display:flex;align-items:center;justify-content:center;gap:6px">
            <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>
            Detail Pelanggan
          </button>
        </div>
      `, { maxWidth: 280 })
      marker.addTo(map)
      markersRef.current.push(marker)
      markerMapRef.current[u.username] = marker
    })
  }, [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '0.75rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search dengan dropdown */}
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }} ref={searchRef}>
          <input type="text" className="search-input" placeholder="Cari nama / username / CPID..." value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
            onFocus={() => { if (search.length >= 2) setShowDropdown(true) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            style={{ width: '100%', paddingRight: search ? '2rem' : undefined }} />
          {search && (
            <button onClick={() => { setSearch(''); setShowDropdown(false) }}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
          )}
          {showDropdown && dropdownResults.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 9999, overflow: 'hidden' }}>
              {dropdownResults.map(u => {
                const status = getStatus(u)
                const statusDot = status === 'online' ? '🟢' : status === 'isolir' ? '🔴' : '⚫'
                const hasCoord = !!(u.latitude && u.longitude)
                return (
                  <div key={u.username} onMouseDown={() => flyToUser(u)}
                    style={{ padding: '0.6rem 0.9rem', cursor: hasCoord ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', opacity: hasCoord ? 1 : 0.5 }}
                    className="dropdown-item-hover">
                    <span style={{ fontSize: '0.8rem' }}>{statusDot}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullname || u.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.customer_id || u.username} · {u.groupname || '-'}</div>
                    </div>
                    {!hasCoord && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>Tanpa koordinat</span>}
                    {hasCoord && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📍</span>}
                  </div>
                )
              })}
            </div>
          )}
          {showDropdown && search.trim().length >= 2 && dropdownResults.length === 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', zIndex: 9999 }}>
              Tidak ada pelanggan ditemukan
            </div>
          )}
        </div>
        {['all','online','isolir','offline'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: filterStatus === s ? '700' : '400',
              background: filterStatus === s ? (s === 'online' ? '#dcfce7' : s === 'isolir' ? '#fee2e2' : s === 'offline' ? '#f3f4f6' : '#1e40af') : 'var(--bg-secondary)',
              color: filterStatus === s ? (s === 'online' ? '#16a34a' : s === 'isolir' ? '#ef4444' : s === 'offline' ? '#374151' : '#ffffff') : 'var(--text-muted)' }}>
            {s === 'all' ? `Semua (${stats.total})` : s === 'online' ? `🟢 Online (${stats.online})` : s === 'isolir' ? `🔴 Isolir (${stats.isolir})` : `⚫ Offline (${stats.offline})`}
          </button>
        ))}
        {stats.noCoord > 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>⚠️ {stats.noCoord} pelanggan tanpa koordinat</span>}
      </div>
      {/* Map */}
      <div ref={mapRef} style={{ flex: 1, borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }} />
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem', color: 'var(--text-muted)', paddingBottom: '4px' }}>
        {[['#16a34a','Online'],['#ef4444','Isolir'],['#6b7280','Offline']].map(([c,l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}></span>{l}
          </span>
        ))}
        <span>· Klik marker untuk detail pelanggan</span>
      </div>
    </div>
  )
}

function ClearableSearch({ value, onChange, placeholder = 'Cari...', style = {}, className = 'search-input' }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{ paddingRight: value ? '2rem' : '0.75rem', ...style }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '4px',
          }}
          title="Hapus pencarian"
        >✕</button>
      )}
    </div>
  )
}

// =============================================
// PSB ADDON SELECTOR (step 2 PSB form)
// =============================================
function PsbAddonSelector({ addons, setAddons, authHeader }) {
  const [addonTypes, setAddonTypes] = useState([])

  useEffect(() => {
    fetch('/api/addon-types', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAddonTypes(data.filter(a => a.is_active)))
      .catch(() => {})
  }, [authHeader])

  if (addonTypes.length === 0) return null

  const toggle = (typeId) => {
    setAddons(prev => {
      if (prev.find(a => a.addon_type_id === typeId)) return prev.filter(a => a.addon_type_id !== typeId)
      return [...prev, { addon_type_id: typeId, price_override: null }]
    })
  }

  const setOverride = (typeId, val) => {
    setAddons(prev => prev.map(a => a.addon_type_id === typeId ? { ...a, price_override: val === '' ? null : parseFloat(val) } : a))
  }

  const addonTotal = addons.reduce((sum, a) => {
    const t = addonTypes.find(x => x.id === a.addon_type_id)
    return sum + (a.price_override ?? t?.price ?? 0)
  }, 0)

  return (
    <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Package size={13} /> Layanan Tambahan <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opsional)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {addonTypes.map(t => {
          const checked = !!addons.find(a => a.addon_type_id === t.id)
          const entry = addons.find(a => a.addon_type_id === t.id)
          return (
            <div key={t.id}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '0.6rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(99,102,241,0.07)' : 'transparent', border: `1px solid ${checked ? 'rgba(99,102,241,0.3)' : 'transparent'}`, transition: 'all 0.15s' }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: checked ? 600 : 400 }}>{t.name}</span>
                  {t.description && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '6px' }}>— {t.description}</span>}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: checked ? 'var(--primary-color)' : 'var(--text-muted)' }}>
                  Rp {Number(entry?.price_override ?? t.price).toLocaleString('id-ID')}{t.is_recurring ? '/bln' : ''}
                </span>
              </label>
              {checked && (
                <div style={{ marginLeft: '2rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Override harga:</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem' }}>Rp</span>
                    <input
                      type="number" min="0"
                      style={{ paddingLeft: '1.75rem', paddingRight: '0.5rem', paddingTop: '4px', paddingBottom: '4px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: '0.78rem', width: '120px' }}
                      placeholder={String(t.price)}
                      value={entry?.price_override ?? ''}
                      onChange={e => setOverride(t.id, e.target.value)}
                    />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>kosongkan = harga default</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {addonTotal > 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total layanan tambahan</span>
          <strong style={{ color: 'var(--primary-color)' }}>+ Rp {addonTotal.toLocaleString('id-ID')}/bln</strong>
        </div>
      )}
    </div>
  )
}

// =============================================
// CUSTOMER ADDONS PANEL (dalam tab detail)
// =============================================
function CustomerAddonsPanel({ username, authHeader, showToast, requestConfirm, customerAddons, setCustomerAddons, addonsLoading }) {
  const [addonTypes, setAddonTypes] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ addon_type_id: '', price_override: '', start_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/addon-types', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAddonTypes(data.filter(a => a.is_active)))
      .catch(() => {})
  }, [authHeader])

  const selectedType = addonTypes.find(t => t.id === parseInt(assignForm.addon_type_id))

  const handleAssign = async () => {
    if (!assignForm.addon_type_id) return showToast('Pilih jenis addon', 'error')
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${username}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          addon_type_id: parseInt(assignForm.addon_type_id),
          price_override: assignForm.price_override ? parseFloat(assignForm.price_override) : null,
          start_date: assignForm.start_date,
          notes: assignForm.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      showToast('Addon berhasil ditambahkan', 'success')
      setShowAssignModal(false)
      // Refresh list
      const r2 = await fetch(`/api/customers/${username}/addons`, { headers: authHeader() })
      if (r2.ok) setCustomerAddons(await r2.json())
    } catch (err) { showToast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const handleRemove = (addon) => {
    requestConfirm(
      'Hentikan Addon',
      `Hentikan layanan "${addon.addon_name}" untuk pelanggan ini? End date akan diset ke hari ini.`,
      async () => {
        try {
          await fetch(`/api/customer-addons/${addon.id}`, { method: 'DELETE', headers: authHeader() })
          showToast('Addon dihentikan', 'success')
          const r2 = await fetch(`/api/customers/${username}/addons`, { headers: authHeader() })
          if (r2.ok) setCustomerAddons(await r2.json())
        } catch (err) { showToast(err.message, 'error') }
      }
    )
  }

  const active = customerAddons.filter(a => !a.end_date || new Date(a.end_date) >= new Date())
  const past = customerAddons.filter(a => a.end_date && new Date(a.end_date) < new Date())

  if (addonsLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat addon...</div>

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0 }}>
          Layanan Tambahan Aktif
        </h3>
        <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }} onClick={() => setShowAssignModal(true)}>
          <Plus size={14} /> Tambah
        </button>
      </div>

      {active.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '10px', fontSize: '0.85rem' }}>
          Belum ada layanan tambahan aktif
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {active.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.addon_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {a.is_recurring ? 'Bulanan' : 'Sekali'} · Mulai {new Date(a.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {a.notes ? ` · ${a.notes}` : ''}
                </div>
                {a.price_override != null && (
                  <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '2px' }}>⚠️ Harga override</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>Rp {Number(a.effective_price).toLocaleString('id-ID')}</span>
                <button onClick={() => handleRemove(a)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem' }}>
                  Hentikan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '0.5rem' }}>Riwayat addon ({past.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {past.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.875rem', background: 'var(--bg-secondary)', borderRadius: '8px', opacity: 0.6, fontSize: '0.82rem' }}>
                <span>{a.addon_name}</span>
                <span style={{ color: 'var(--text-muted)' }}>Berakhir {new Date(a.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Modal Assign Addon */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="stat-icon-wrapper stat-icon-primary" style={{ width: '36px', height: '36px', borderRadius: '10px' }}>
                  <Package size={18} />
                </div>
                <h2 className="modal-title">Tambah Layanan Tambahan</h2>
              </div>
              <button className="icon-btn" onClick={() => setShowAssignModal(false)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div className="form-group">
                <label className="form-label">Jenis Layanan <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '0.875rem', background: 'var(--bg-surface)' }}
                  value={assignForm.addon_type_id}
                  onChange={e => setAssignForm(f => ({ ...f, addon_type_id: e.target.value }))}
                >
                  <option value="">-- Pilih layanan --</option>
                  {addonTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name} — Rp {Number(t.price).toLocaleString('id-ID')}{t.is_recurring ? '/bln' : ' (sekali)'}</option>
                  ))}
                </select>
                {selectedType && (
                  <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {selectedType.description && <span>{selectedType.description} · </span>}
                    Harga default: <strong style={{ color: 'var(--primary-color)' }}>Rp {Number(selectedType.price).toLocaleString('id-ID')}{selectedType.is_recurring ? '/bln' : ''}</strong>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Override Harga <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional — kosongkan = harga default)</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>Rp</span>
                  <input
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '2.5rem' }}
                    type="number" min="0"
                    placeholder={selectedType ? String(selectedType.price) : '0'}
                    value={assignForm.price_override}
                    onChange={e => setAssignForm(f => ({ ...f, price_override: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tanggal Mulai</label>
                <input
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  type="date"
                  value={assignForm.start_date}
                  onChange={e => setAssignForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                <input
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Misal: unit STB no. 003"
                  value={assignForm.notes}
                  onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAssignModal(false)}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAssign} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App({ portalRole = null }) {
  // ── Ref wrappers untuk fungsi yang didefinisikan setelah hook calls (hindari TDZ) ──
  const _silentRefreshUsersRef = useRef(null)
  const _fetchTechnicianListRef = useRef(null)
  const _fetchDataRef = useRef(null)
  const _navigateToRef = useRef(null)
  const themeTransitionTimerRef = useRef(null)
  const _silentRefreshUsersWrap = (...a) => _silentRefreshUsersRef.current?.(...a)
  const _fetchTechnicianListWrap = (...a) => _fetchTechnicianListRef.current?.(...a)
  const _fetchDataWrap = (...a) => _fetchDataRef.current?.(...a)
  const _navigateToWrap = (...a) => _navigateToRef.current?.(...a)
  const fetchAbortRef = useRef(null) // shared across fetchData + silentRefreshUsers

  // ── Custom Hooks (Tahap 3) ──────────────────────────────────────────
  const {
    isLoggedIn, setIsLoggedIn,
    currentUser, setCurrentUser,
    loginForm, setLoginForm,
    backendInfo, setBackendInfo,
    authHeader,
  } = useAuth(portalRole)

  const {
    isDarkMode, setIsDarkMode,
    hideAmounts, setHideAmounts, toggleHideAmounts,
    pwaPrompt, showPwaBanner, setPwaPrompt, setShowPwaBanner, pwaInstalled, setPwaInstalled, handlePwaInstall,
    loading, setLoading, isSilentRefetching, setIsSilentRefetching,
    submitError, setSubmitError,
    toast, setToast, showToast,
    confirmModal, setConfirmModal, requestConfirm,
    criticalModal, setCriticalModal, requestCritical, submitCritical,
    mobileSidebarOpen, setMobileSidebarOpen, sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
    showUserMenu, setShowUserMenu, showUserDropdown, setShowUserDropdown,
  } = useUI({ portalRole })
  const [sidebarHovered, setSidebarHovered] = useState(false)

  const {
    notifications, setNotifications,
    unreadCount, setUnreadCount,
    showNotifPanel, setShowNotifPanel,
    notifPageFilter, setNotifPageFilter,
    notifPageSearch, setNotifPageSearch,
    notifVisibleCount, setNotifVisibleCount,
    pendingProofsCount, setPendingProofsCount,
    fetchNotifications,
    markNotifRead,
    markAllNotifRead,
  } = useNotifications({ authHeader, currentUser })

  const {
    financeInvoices, setFinanceInvoices,
    financePeriod, setFinancePeriod,
    financeRincianPage, setFinanceRincianPage,
    financeTrend, setFinanceTrend,
    financeByDusun, setFinanceByDusun,
    financeDiscounts, setFinanceDiscounts,
    dusunPage, setDusunPage,
    fetchFinances,
  } = useFinances({ authHeader })

  const {
    installLogMode, setInstallLogMode,
    installLogDate, setInstallLogDate,
    installLogMonth, setInstallLogMonth,
    installLogData, setInstallLogData,
    installLogLoading, setInstallLogLoading,
    installLogPage, setInstallLogPage,
    fetchInstallLog,
  } = useInstallLog({ authHeader })

  const {
    showPromiseModal, setShowPromiseModal,
    promiseTarget, setPromiseTarget,
    promiseDate, setPromiseDate,
    promiseNotes, setPromiseNotes,
    promiseLoading, setPromiseLoading,
    activePromises, setActivePromises,
    openPromise,
    handleCreatePromise,
    handleCancelPromise,
  } = usePromises({ authHeader, showToast, requestConfirm, silentRefreshUsers: _silentRefreshUsersWrap })

  const {
    ontTasks, setOntTasks,
    showOntTaskModal, setShowOntTaskModal,
    adminOntTasks, setAdminOntTasks,
    adminOntTasksLoading, setAdminOntTasksLoading,
    adminOntTasksFilter, setAdminOntTasksFilter,
    ontTaskTarget, setOntTaskTarget,
    ontTaskTechUsername, setOntTaskTechUsername,
    ontTaskNotes, setOntTaskNotes,
    ontTaskLoading, setOntTaskLoading,
    showOntCompleteModal, setShowOntCompleteModal,
    ontCompleteTarget, setOntCompleteTarget,
    ontCompleteNotes, setOntCompleteNotes,
    ontCompleteLoading, setOntCompleteLoading,
    rekapMonth, setRekapMonth,
    rekapExpandedTech, setRekapExpandedTech,
    fetchOntTasks,
    fetchAdminOntTasks,
    openOntTaskModal,
    submitOntTask,
    submitOntComplete,
    cancelOntTask,
  } = useOntTasks({ authHeader, showToast, requestConfirm, fetchTechnicianList: _fetchTechnicianListWrap })

  const {
    waitingList, setWaitingList,
    wlLoading, setWlLoading,
    wlStatusFilter, setWlStatusFilter,
    wlSearch, setWlSearch,
    showWlModal, setShowWlModal,
    wlEditEntry, setWlEditEntry,
    wlForm, setWlForm,
    wlFormLoading, setWlFormLoading,
    showWlKtpModal, setShowWlKtpModal,
    wlKtpPreview, setWlKtpPreview,
    showWlPickerModal, setShowWlPickerModal,
    wlPickerList, setWlPickerList,
    selectedWlEntry, setSelectedWlEntry,
    wlSelWilayah, setWlSelWilayah,
    wlWilayahData, setWlWilayahData,
    wlDusunPicker, setWlDusunPicker,
    wlDusunOptions, setWlDusunOptions,
    fetchWaitingList,
    handleWlSelWilayah,
    handleWlPhotoChange,
    submitWlForm,
    cancelWlEntry,
    restoreWlEntry,
    viewWlKtp,
    openWlPicker,
  } = useWaitingList({ authHeader, showToast, requestConfirm })

  const {
    collectorHistory, setCollectorHistory,
    historyLoaded, setHistoryLoaded,
    collectorList, setCollectorList,
    showCollectorProofModal, setShowCollectorProofModal,
    collectorProofData, setCollectorProofData,
    collectorProofLoading, setCollectorProofLoading,
    collectorSetoran, setCollectorSetoran,
    setoranDate, setSetoranDate,
    setoranSearch, setSetoranSearch,
    expandedCollector, setExpandedCollector,
    expandedCollectors, setExpandedCollectors,
    showCabutModal, setShowCabutModal,
    cabutTarget, setCabutTarget,
    cabutNotes, setCabutNotes,
    cabutLoading, setCabutLoading,
    ontRemovals, setOntRemovals,
    ontRemovalsMeta, setOntRemovalsMeta,
    fetchSetoran,
    fetchCollectorHistory,
    handleViewCollectorProof,
    fetchOntRemovals,
    fetchCollectorList,
    openCabutModal,
    submitCabut,
  } = useCollector({ authHeader, showToast, requestConfirm })

  const {
    systemStaff, setSystemStaff,
    isStaffModalOpen, setIsStaffModalOpen,
    currentStaff, setCurrentStaff,
    staffForm, setStaffForm,
    tenantKode,
    fetchTenantKode,
  } = useStaff({ authHeader })

  const {
    territories, setTerritories,
    showAddTerritoryModal, setShowAddTerritoryModal,
    newTerritory, setNewTerritory,
    editingTerritory, setEditingTerritory,
    managingAreasTerritoryId, setManagingAreasTerritoryId,
    areaSearchWilayah, setAreaSearchWilayah,
    areaWilayahData, setAreaWilayahData,
    areaDusunInput, setAreaDusunInput,
    areaDusunSuggestions, setAreaDusunSuggestions,
    collectorAreas, setCollectorAreas,
    assignDusunCollectorId, setAssignDusunCollectorId,
    assignDusunWilayah, setAssignDusunWilayah,
    assignDusunWilayahData, setAssignDusunWilayahData,
    assignDusunName, setAssignDusunName,
    assignDusunLoading, setAssignDusunLoading,
    showAssignDusunModal, setShowAssignDusunModal,
    handleCreateTerritory,
    handleDeleteTerritory,
    handleAreaSelWilayah,
    handleAddArea,
    handleRemoveArea,
    refreshCollectorAreas,
    handleAssignDusun,
    handleRemoveCollectorArea,
    openAssignDusunModal,
  } = useTerritories({ authHeader, showToast, requestConfirm, fetchData: _fetchDataWrap })

  const {
    invoices, setInvoices,
    invoiceFilter, setInvoiceFilter,
    invoicePagination, setInvoicePagination,
    selectedInvoiceIds, setSelectedInvoiceIds,
    showGenerateInvoiceModal, setShowGenerateInvoiceModal,
    generating, setGenerating,
    showSyncAddonModal, setShowSyncAddonModal,
    syncingAddon,
    handleSyncAddons,
    fetchInvoices,
    silentRefreshInvoices,
    handleGenerateInvoices,
    handleDeleteInvoice,
    showPaymentModal, setShowPaymentModal,
    paymentTarget, setPaymentTarget,
    paymentMethod, setPaymentMethod,
    transferProofFile, setTransferProofFile,
    transferProofPreview, setTransferProofPreview,
    receiptModal, setReceiptModal,
    handlePayInvoice,
    handleTransferProofSelect,
    submitPayment,
    showBulkPayModal, setShowBulkPayModal,
    bulkPayMethod, setBulkPayMethod,
    bulkPayProof, setBulkPayProof,
    bulkPayLoading, setBulkPayLoading,
    submitBulkPay,
    handleQuickPayCash,
    showDiscountModal, setShowDiscountModal,
    discountTarget, setDiscountTarget,
    discountReason, setDiscountReason,
    openDiscountModal,
    submitDiscount,
    editPayMethodModal, setEditPayMethodModal,
    editPayMethodValue, setEditPayMethodValue,
    editPayMethodLoading, setEditPayMethodLoading,
    handleEditPaymentMethod,
    cancelInvoiceTarget, setCancelInvoiceTarget,
    cancelInvoiceReason, setCancelInvoiceReason,
    cancelInvoiceLoading, setCancelInvoiceLoading,
    submitCancelInvoice,
    settlementDate, setSettlementDate,
    settlementData, setSettlementData,
    settlementLoading, setSettlementLoading,
    settlementSearch, setSettlementSearch,
    settlementMode, setSettlementMode,
    settlementDateFrom, setSettlementDateFrom,
    settlementDateTo, setSettlementDateTo,
    settlementFilterCollector, setSettlementFilterCollector,
    settlementRangeData, setSettlementRangeData,
    settlementRangeLoading, setSettlementRangeLoading,
    settlementDetail, setSettlementDetail,
    showSettlementDetail, setShowSettlementDetail,
    settlementConfirmLoading, setSettlementConfirmLoading,
    fetchSettlements,
    fetchSettlementRange,
    fetchSettlementDetail,
    confirmSettlement,
    unconfirmSettlement,
    ipPools, setIpPools,
    showAddPoolModal, setShowAddPoolModal,
    showEditPoolModal, setShowEditPoolModal,
    newPool, setNewPool,
    editingPool, setEditingPool,
    editPoolName, setEditPoolName,
    handleCreatePool,
    prepareEditPool,
    handleEditPoolSubmit,
    handleDeletePool,
    paymentProofs, setPaymentProofs,
    proofsFilter, setProofsFilter,
    proofsSearch, setProofsSearch,
    proofsVisibleCount, setProofsVisibleCount,
    showProofImageModal, setShowProofImageModal,
    proofImageData, setProofImageData,
    proofImageLoading, setProofImageLoading,
    proofVerifyLoading, setProofVerifyLoading,
    showRejectModal, setShowRejectModal,
    fetchPaymentProofs,
    handleViewProofImage,
    handleVerifyProof,
    showPGModal, setShowPGModal,
    pgInvoice, setPgInvoice,
    paymentGatewayConfig, setPaymentGatewayConfig,
    paymentLoading, setPaymentLoading,
    paymentResult, setPaymentResult,
    showPGSettingsModal, setShowPGSettingsModal,
    pgSettings, setPgSettings,
    fetchPGConfig,
    handleOpenPGModal,
    handleCreatePayment,
    handleSavePGSettings,
    exportExcel,
    exportPDF,
  } = useBilling({ authHeader, showToast, requestConfirm, requestCritical, setIsSilentRefetching, setPendingProofsCount, fetchData: _fetchDataWrap, currentUser })

  const {
    mtConfigs, setMtConfigs,
    mtLoading, setMtLoading,
    mtProfiles, setMtProfiles,
    routerStatus, setRouterStatus,
    showAddMtModal, setShowAddMtModal,
    showMtScriptModal, setShowMtScriptModal,
    scriptNas, setScriptNas,
    scriptConfig, setScriptConfig,
    scriptGenerated, setScriptGenerated,
    serverIpLoading, setServerIpLoading,
    editingMt, setEditingMt,
    newMtConfig, setNewMtConfig,
    showRouterPass, setShowRouterPass,
    selectedRouterIds, setSelectedRouterIds,
    setMikrotikActiveTenant,
    checkRouterStatusSilent,
    checkRouterStatus,
    openScriptModal,
    handleAddMtConfig,
    prepareEditMt,
    handleSyncRadius,
    handleDeleteRouter,
  } = useMikrotik({ authHeader, showToast, requestConfirm, fetchData: _fetchDataWrap, ipPools })

  const {
    stats, setStats,
    users, setUsers,
    groups, setGroups,
    logs, setLogs,
    onlineUsers, setOnlineUsers,
    offlineSessions, setOfflineSessions,
    profiles, setProfiles,
    billingSettings, setBillingSettings,
    applyToAll, setApplyToAll,
    applyToAllLoading, setApplyToAllLoading,
    settingsForm, setSettingsForm,
    showSettingsModal, setShowSettingsModal,
    showAddUserModal, setShowAddUserModal,
    wizardStep, setWizardStep,
    psbAddons, setPsbAddons,
    psbSubmitting, setPsbSubmitting,
    formWarnings, setFormWarnings,
    newUser, setNewUser,
    wilayahData, setWilayahData,
    selWilayah, setSelWilayah,
    editingUser, setEditingUser,
    showEditUserModal, setShowEditUserModal,
    editDusunSearch, setEditDusunSearch,
    ktpPhoto, setKtpPhoto,
    ktpPhotoView, setKtpPhotoView,
    packageChangeWarning, setPackageChangeWarning,
    packageChangeReason, setPackageChangeReason,
    showEditPassword, setShowEditPassword,
    psbDusunOptions, setPsbDusunOptions,
    psbDusunPicker, setPsbDusunPicker,
    psbSelectedAreaId, setPsbSelectedAreaId,
    showAddGroupModal, setShowAddGroupModal,
    newGroup, setNewGroup,
    editingGroup, setEditingGroup,
    showAddProfileModal, setShowAddProfileModal,
    newProfile, setNewProfile,
    editingProfile, setEditingProfile,
    profileSyncResults, setProfileSyncResults,
    profilePage, setProfilePage,
    profileSearch, setProfileSearch,
    profileSort, setProfileSort,
    profileSaving, setProfileSaving,
    pelangganSort, setPelangganSort,
    pelangganSubTab, setPelangganSubTab,
    userFilters, setUserFilters,
    userPagination, setUserPagination,
    staffSearch, setStaffSearch,
    staffPage, setStaffPage,
    openActionMenu, setOpenActionMenu,
    actionMenuOpenUp, setActionMenuOpenUp,
    actionMenuPos, setActionMenuPos,
    selectedUsers, setSelectedUsers,
    showImportModal, setShowImportModal,
    importFile, setImportFile,
    importPreview, setImportPreview,
    importing, setImporting,
    showUserDetailModal, setShowUserDetailModal,
    viewingUser, setViewingUser,
    detailTab, setDetailTab,
    customerDetailData, setCustomerDetailData,
    loadingDetail, setLoadingDetail,
    showDetailPassword, setShowDetailPassword,
    showUserStatsModal, setShowUserStatsModal,
    historyLimit, setHistoryLimit,
    customerAddons, setCustomerAddons,
    addonsLoading,
    loadCustomerAddons,
    showSetPinModal, setShowSetPinModal,
    pinTargetUser, setPinTargetUser,
    pinValue, setPinValue,
    pinLoading, setPinLoading,
    showDuplicateNikModal, setShowDuplicateNikModal,
    duplicateNiks, setDuplicateNiks,
    duplicateNikLoading, setDuplicateNikLoading,
    silentRefreshUsers,
    fetchCustomerDetail,
    fetchDuplicateNiks,
    handleCreateProfile,
    handleEditProfile,
    handleDeleteProfile,
    handleSaveSettings,
    validateStep1,
    handleCreateUser,
    prepareEditUser,
    handleUpdateUser,
    openSetPin,
    handleSetPin,
    handleSuspendUser,
    handleDeleteUser,
    handleStopUser,
    handleReactivateUser,
    handleActivateUser,
    handleSyncSecret,
    handleCreateGroup,
    prepareEditGroup,
    handleDeleteGroup,
    handleSendMessage,
    handleKtpSelect,
    downloadImportTemplate,
    handleImportFileChange,
    executeBulkImport,
    handleExportUsers,
    handleBulkSuspend,
    handleBulkActivate,
    handleBulkDelete,
    csvCell,
    fetchWilayah,
    handleSelWilayah,
    formatSpeed,
    formatBytes,
    formatDuration,
  } = useUsers({ authHeader, showToast, requestConfirm, requestCritical, setIsSilentRefetching, fetchAbortRef, setActivePromises, fetchData: _fetchDataWrap, navigateTo: _navigateToWrap, currentUser, selectedWlEntry, setSelectedWlEntry, territories, mtConfigs })
  _silentRefreshUsersRef.current = silentRefreshUsers

  // Bulk pay
  // Notifications
  const notifPanelRef = useRef(null)
  // Tenant Switcher (super admin only)
  const [activeTenantId, setActiveTenantId] = useState(() => {
    try { const s = localStorage.getItem('superAdminTenantId'); return s ? parseInt(s) : null } catch { return null }
  })
  const [tenantSwitcherList, setTenantSwitcherList] = useState([])
  const [showTenantSwitcher, setShowTenantSwitcher] = useState(false)
  const tenantSwitcherRef = useRef(null)
  const activeTenantIdRef = useRef((() => {
    try { const s = localStorage.getItem('superAdminTenantId'); return s ? parseInt(s) : null } catch { return null }
  })())
  // Cabut ONT
  // Admin — rekap Cabut ONT
  const [adminOntRemovals, setAdminOntRemovals] = useState([])
  const [adminOntMonthly, setAdminOntMonthly] = useState([])
  const [adminOntByCollector, setAdminOntByCollector] = useState([])
  const [adminOntFilter, setAdminOntFilter] = useState({ period: '', collector_id: '' })
  const [adminOntLoading, setAdminOntLoading] = useState(false)
  // Waiting List
  const [expandedHistoryCollector, setExpandedHistoryCollector] = useState(null)
  // WL Assign
  const [showWlAssignModal, setShowWlAssignModal] = useState(false)
  const [wlAssignTarget, setWlAssignTarget] = useState(null) // waiting_list entry object (single) atau null (bulk)
  const [wlAssignTechUsernames, setWlAssignTechUsernames] = useState([]) // array of selected technician usernames
  const [wlAssignLoading, setWlAssignLoading] = useState(false)
  const [technicianList, setTechnicianList] = useState([])
  const [wlSelectedIds, setWlSelectedIds] = useState([]) // bulk assign checkbox
  const [collectorVisibleCount, setCollectorVisibleCount] = useState(10) // load more pelanggan di dashboard kolektor
  const [isolirSearch, setIsolirSearch] = useState('')
  const [isolirVisibleCount, setIsolirVisibleCount] = useState(10)
  // Rekap Setoran Kolektor
  // Admin — halaman Task Cabut ONT


  useEffect(() => {
    return () => {
      if (themeTransitionTimerRef.current) window.clearTimeout(themeTransitionTimerRef.current)
      document.documentElement.classList.remove('theme-switching')
      document.body.classList.remove('theme-switching')
    }
  }, [])

  // Init: sync activeTenantRef di useMikrotik dengan nilai awal dari localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('superAdminTenantId')
      if (saved) setMikrotikActiveTenant(parseInt(saved))
    } catch (_) {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saat modal PSB dibuka, set due_date_day dari setting global
  useEffect(() => {
    if (showAddUserModal && settingsForm?.default_due_date) {
      setNewUser(u => ({ ...u, due_date_day: settingsForm.default_due_date }))
    }
  }, [showAddUserModal]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- URL ROUTING ---
  const pelangganRouteBySubTab = {
    all: '/pppoe/users',
    online: '/pppoe/online',
    offline: '/pppoe/offline'
  }

  const routeContextMap = {
    '/': { tab: 'dashboard' },
    '/dashboard': { tab: 'dashboard' },
    '/pelanggan': { tab: 'pelanggan', subTab: 'all' }, // legacy
    '/pelanggan_online': { tab: 'pelanggan', subTab: 'online' }, // legacy
    '/pelanggan_offline': { tab: 'pelanggan', subTab: 'offline' }, // legacy
    '/pppoe/users': { tab: 'pelanggan', subTab: 'all' },
    '/pppoe/online': { tab: 'pelanggan', subTab: 'online' },
    '/pppoe/offline': { tab: 'pelanggan', subTab: 'offline' },
    '/paket': { tab: 'paket' }, // legacy
    '/pppoe/profiles': { tab: 'paket' },
    '/billing': { tab: 'billing' },
    '/billing/finances': { tab: 'finances' },
    '/ippool': { tab: 'ippool' },
    '/settings': { tab: 'settings_mikrotik' },
    '/settings/mikrotik': { tab: 'settings_mikrotik' },
    '/pengaturan': { tab: 'settings_billing' },
    '/log': { tab: 'log' },
    '/system/users': { tab: 'system_users' },
    '/territories': { tab: 'territories' },
    '/addon-types': { tab: 'addon_types' },
    '/psb': { tab: 'psb' },
    '/waiting-list': { tab: 'waiting_list' },
    '/laporan/psb': { tab: 'laporan_psb' },
    '/mapping': { tab: 'mapping' },
    '/collector/isolir': { tab: 'collector_isolir' },
    '/collector/ont': { tab: 'collector_ont' },
    '/collector/proofs': { tab: 'collector_proofs' },
    '/notifications': { tab: 'notifications' },
    '/collector-settlements': { tab: 'collector_settlements' },
    '/admin/ont-tasks': { tab: 'admin_ont_tasks' },
    '/tenants': { tab: 'tenants' },
    '/sa': { tab: 'sa_dashboard' },
    '/sa/dashboard': { tab: 'sa_dashboard' },
    '/sa/mitra': { tab: 'sa_mitra', samitraFilter: 'semua' },
    '/sa/mitra/aktif': { tab: 'sa_mitra', samitraFilter: 'aktif' },
    '/sa/mitra/nonaktif': { tab: 'sa_mitra', samitraFilter: 'nonaktif' },
    '/sa/mitra/berhenti': { tab: 'sa_mitra', samitraFilter: 'berhenti' },
    '/sa/platform': { tab: 'sa_platform' },
    '/panduan': { tab: 'panduan' },
  }

  const tabToRoute = {
    'dashboard': '/dashboard',
    'psb': '/psb',
    'pelanggan': '/pppoe/users',
    'paket': '/pppoe/profiles',
    'billing': '/billing',
    'ippool': '/ippool',
    'settings_mikrotik': '/mikrotik',
    'settings_billing': '/pengaturan',
    'log': '/log',
    'waiting_list': '/waiting-list',
    'system_users': '/system/users',
    'territories': '/territories',
    'addon_types': '/addon-types',
    'laporan_psb': '/laporan/psb',
    'mapping': '/mapping',
    'collector_isolir': '/collector/isolir',
    'collector_ont': '/collector/ont',
    'collector_proofs': '/collector/proofs',
    'notifications': '/notifications',
    'collector_settlements': '/collector-settlements',
    'admin_ont_tasks': '/admin/ont-tasks',
    'tenants': '/tenants',
    'sa_dashboard': '/sa/dashboard',
    'sa_mitra': '/sa/mitra',
    'sa_platform': '/sa/platform',
    'panduan': '/panduan',
  }

  const getRouteContextFromPath = () => {
    const path = window.location.pathname.toLowerCase()
    return routeContextMap[path] || null
  }

  const getTabFromPath = () => {
    const fromPath = getRouteContextFromPath()
    if (fromPath) return fromPath.tab
    // Fallback ke localStorage jika URL tidak dikenali (misal server hanya serve /)
    const saved = localStorage.getItem('activeTab')
    return saved || 'dashboard'
  }

  const [activeTab, setActiveTab] = useState(getTabFromPath)
  const [panduanTab, setPanduanTab] = useState('setup')
  const [samitraFilter, setSamitraFilter] = useState(() => {
    const ctx = getRouteContextFromPath()
    return ctx?.samitraFilter || 'semua'
  })

  const navigateTo = (tab, e = null, subTab = 'all') => {
    if (e) e.preventDefault()
    setActiveTab(tab)
    localStorage.setItem('activeTab', tab)

    let state = { tab }
    let route = tabToRoute[tab] || '/dashboard'

    if (tab === 'pelanggan') {
      const normalizedSubTab = ['all', 'online', 'offline'].includes(subTab) ? subTab : 'all'
      setPelangganSubTab(normalizedSubTab)
      route = pelangganRouteBySubTab[normalizedSubTab]
      state = { tab, subTab: normalizedSubTab }
      localStorage.setItem('activeSubTab', normalizedSubTab)
    }

    if (tab === 'sa_mitra') {
      const filter = ['semua', 'aktif', 'nonaktif', 'berhenti'].includes(subTab) ? subTab : 'semua'
      setSamitraFilter(filter)
      const filterRoutes = { semua: '/sa/mitra', aktif: '/sa/mitra/aktif', nonaktif: '/sa/mitra/nonaktif', berhenti: '/sa/mitra/berhenti' }
      route = filterRoutes[filter]
      state = { tab, samitraFilter: filter }
    }

    window.history.pushState(state, '', route)
    setMobileSidebarOpen(false)
  }
  _navigateToRef.current = navigateTo

  useEffect(() => {
    const applyRouteContext = (context) => {
      setActiveTab(context.tab)
      localStorage.setItem('activeTab', context.tab)
      setPelangganSubTab(context.tab === 'pelanggan' ? (context.subTab || 'all') : 'all')
      if (context.tab === 'sa_mitra') setSamitraFilter(context.samitraFilter || 'semua')
    }

    const handlePopState = (event) => {
      if (event.state?.tab) {
        applyRouteContext({
          tab: event.state.tab,
          subTab: event.state.subTab
        })
      } else {
        const fromPath = getRouteContextFromPath()
        applyRouteContext(fromPath || { tab: localStorage.getItem('activeTab') || 'dashboard' })
      }
    }

    window.addEventListener('popstate', handlePopState)

    // Set initial state dari URL; jika URL tidak dikenali, fallback ke localStorage
    const fromPath = getRouteContextFromPath()
    const initialContext = fromPath || {
      tab: localStorage.getItem('activeTab') || 'dashboard',
      subTab: localStorage.getItem('activeSubTab') || 'all'
    }
    applyRouteContext(initialContext)
    const targetRoute = tabToRoute[initialContext.tab] || '/dashboard'
    window.history.replaceState(
      { tab: initialContext.tab, subTab: initialContext.subTab },
      '',
      fromPath ? (window.location.pathname === '/' ? '/dashboard' : window.location.pathname) : targetRoute
    )

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Pastikan NOC tidak bisa akses dashboard — redirect ke pelanggan
  // Berlaku saat auto-login dari localStorage maupun setelah login manual
  useEffect(() => {
    if (currentUser?.role === 'noc' && activeTab === 'dashboard') {
      setActiveTab('pelanggan')
      localStorage.setItem('activeTab', 'pelanggan')
      window.history.replaceState({ tab: 'pelanggan', subTab: 'all' }, '', '/pppoe/users')
    }
  }, [currentUser, activeTab])


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-profile-dropdown')) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])


  // Admin Payment Proof Verification State
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingProofId, setRejectingProofId] = useState(null)

  // Dashboard UI state
  const [dashWidgetExpanded, setDashWidgetExpanded] = useState(null) // null | 'unpaid' | 'install'
  const DUSUN_PER_PAGE = 6
  const INSTALL_LOG_PER_PAGE = 5

  // Load wilayah & reset form ketika teknisi navigasi ke halaman PSB
  // Gunakan ref untuk skip reset kalau datang dari Waiting List
  const psbFromWlRef = React.useRef(false)
  useEffect(() => {
    if (activeTab === 'psb') {
      setWizardStep(1)
      setFormWarnings({ phone: '', nik: '' })
      if (!psbFromWlRef.current) {
        // Reset form hanya kalau bukan dari WL
        setNewUser({ username: '', password: '', groupname: '', staticIp: '', macAddress: '', fullname: '', phone: '', address: '', identity_number: '', due_date_day: '5', auto_suspend: 1, nas_id: '', pop: '', odp: '', territory_id: '', territory_area_id: '', reseller: '', latitude: null, longitude: null, install_date: new Date().toISOString().split('T')[0] })
        setSelWilayah({ prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' })
        setSelectedWlEntry(null)
      }
      psbFromWlRef.current = false // reset flag
      fetchWilayah('provinsi').then(data => setWilayahData(d => ({ ...d, provinsi: data, kabupaten: [], kecamatan: [], kelurahan: [] })))
    }
  }, [activeTab])

  // ─── Push Notification & Bell ────────────────────────────────────────────────

  const handleNotifClick = (n) => {
    markNotifRead(n.id)
    setShowNotifPanel(false)
    // Navigasi ke halaman relevan berdasarkan tipe notifikasi
    const data = (() => { try { return typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}) } catch { return {} } })()
    switch (n.type) {
      case 'payment_received':
      case 'bulk_payment_received':
      case 'payment_confirmed':
        navigateTo('billing')
        break
      case 'new_waiting_list':
      case 'waiting_list_installed':
      case 'wl_assigned':
        navigateTo('waiting_list')
        break
      case 'ont_task_assigned':
        navigateTo('dashboard')
        break
      case 'ont_removed':
        // Admin → dashboard (rekap ONT ada di sana)
        navigateTo('dashboard')
        break
      case 'new_customer_assigned':
      case 'isolated':
        navigateTo('pelanggan')
        break
      case 'due_soon':
        navigateTo('billing')
        break
      default:
        navigateTo('notifications')
        break
    }
  }

  // Load ONT removals saat collector login
  useEffect(() => {
    if (currentUser?.role === 'collector') fetchOntRemovals()
  }, [currentUser?.username])

  // Load admin ONT rekap saat admin buka tab finances
  useEffect(() => {
    if (currentUser?.role === 'admin' && activeTab === 'finances') fetchAdminOntRemovals()
  }, [currentUser?.username, activeTab])

  // Load admin ONT tasks saat tab admin_ont_tasks aktif
  useEffect(() => {
    if (['admin', 'noc'].includes(currentUser?.role) && activeTab === 'admin_ont_tasks') fetchAdminOntTasks(adminOntTasksFilter)
  }, [currentUser?.username, activeTab])

  // Load waiting list saat tab aktif, atau saat dashboard teknisi load
  useEffect(() => {
    if (activeTab === 'waiting_list') fetchWaitingList(wlStatusFilter)
    if (activeTab === 'dashboard' && currentUser?.role === 'technician') fetchWaitingList('waiting')
  }, [activeTab, wlStatusFilter])

  // Load data saat tab kolektor khusus aktif
  useEffect(() => {
    if (activeTab === 'collector_ont') fetchOntRemovals()
    if (activeTab === 'collector_proofs') fetchPaymentProofs(proofsFilter)
    if (activeTab === 'collector_isolir') { setIsolirSearch(''); setIsolirVisibleCount(10) }
    if (activeTab === 'collector_proofs') { setProofsSearch(''); setProofsVisibleCount(10) }
    if (activeTab === 'dashboard' && currentUser?.role === 'technician') fetchOntTasks()
    if (activeTab === 'notifications') { fetchNotifications(); setNotifPageFilter('all'); setNotifPageSearch(''); setNotifVisibleCount(20) }
    if (activeTab === 'collector_settlements') { fetchSettlements(settlementDate); fetchCollectorList() }
  }, [activeTab])


  // Tutup panel notifikasi saat klik di luar
  useEffect(() => {
    if (!showNotifPanel) return
    const handler = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setShowNotifPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifPanel])

  // Tutup tenant switcher saat klik di luar
  useEffect(() => {
    if (!showTenantSwitcher) return
    const handler = (e) => {
      if (tenantSwitcherRef.current && !tenantSwitcherRef.current.contains(e.target)) {
        setShowTenantSwitcher(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTenantSwitcher])

  // Load daftar tenant untuk switcher (super admin only)
  useEffect(() => {
    if (!currentUser?.is_super_admin) return
    fetch('/api/tenants', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(list => setTenantSwitcherList(list))
      .catch(() => {})
  }, [currentUser?.is_super_admin])

  // Super admin native mode: redirect ke sa_dashboard jika bukan impersonation
  useEffect(() => {
    if (!currentUser?.is_super_admin || activeTenantId) return
    if (!['sa_dashboard', 'sa_mitra'].includes(activeTab)) {
      setActiveTab('sa_dashboard')
      window.history.replaceState({ tab: 'sa_dashboard' }, '', '/sa/dashboard')
    }
  }, [currentUser?.is_super_admin, activeTenantId])

  // Lightweight polling: hanya ambil data yang sering berubah (stats, online/offline, users)
  const fetchRealtimeData = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return // Stop polling jika tidak ada token

      const statsRes = await fetch('/api/stats', { headers: authHeader() })
      if (statsRes.status === 401 || statsRes.status === 403) {
        console.warn('Token expired, stopping polling')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setLoading(false) // Reset loading agar login button tidak stuck
        setIsLoggedIn(false)
        return // Stop polling, jangan show toast berulang
      }
      if (statsRes.ok) setStats(await statsRes.json())

      const onlineRes = await fetch('/api/stats/online-users', { headers: authHeader() })
      if (onlineRes.ok) setOnlineUsers(await onlineRes.json())

      const offlineRes = await fetch('/api/stats/offline-sessions', { headers: authHeader() })
      if (offlineRes.ok) setOfflineSessions(await offlineRes.json())

      const usersRes = await fetch(`/api/users${''}`, { headers: authHeader() })
      if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users); }

      const logsRes = await fetch('/api/logs', { headers: authHeader() })
      if (logsRes.ok) setLogs(await logsRes.json())

      const territoryRes = await fetch('/api/territories', { headers: authHeader() })
      if (territoryRes.ok) setTerritories(await territoryRes.json())
    } catch (err) {
      console.error('Realtime poll error:', err)
    }
  }

  const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
    const tId = activeTenantIdRef.current
    if (tId) url = url.includes('?') ? `${url}&tenant_id=${tId}` : `${url}?tenant_id=${tId}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer))
  }
  const tqs = () => { const id = activeTenantIdRef.current; return id ? `?tenant_id=${id}` : '' }

  // Helper untuk mem-parse JSON secara aman
  const safeJson = async (response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }
    // Jika bukan JSON, ambil teks mentahnya untuk debug atau lempar error ramah
    const text = await response.text();
    console.warn("Response bukan JSON:", text.substring(0, 100));
    throw new Error("Server memberikan respons tidak valid (Bukan JSON). Silakan coba lagi nanti.");
  }


  // Full fetch: ambil semua data secara PARALEL (bukan satu per satu)
  // silent=true → tidak tampilkan loading overlay, untuk background polling
  const fetchData = async (silent = false) => {
    // Cancel fetch sebelumnya (cegah race condition data lama menimpa data baru)
    if (fetchAbortRef.current) fetchAbortRef.current.abort()
    const ctrl = new AbortController()
    fetchAbortRef.current = ctrl

    if (!silent) setLoading(true)
    else setIsSilentRefetching(true)

    try {
      const headers = authHeader()

      // Cek token dulu sebelum memuat semua data
      const statsRes = await fetchWithTimeout('/api/stats', { headers })
      if (statsRes.status === 401 || statsRes.status === 403) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setIsLoggedIn(false)
        setLoading(false)
        showToast("Sesi login berakhir. Silakan login kembali.", "warning")
        return
      }
      if (ctrl.signal.aborted) return
      if (statsRes.ok) setStats(await statsRes.json())

      // Jalankan semua request SEKALIGUS secara paralel
      const [
        onlineRes, offlineRes, usersRes, groupsRes,
        logsRes, poolRes, profileRes, settingsRes, infoRes,
        territoryRes, collectorAreasRes
      ] = await Promise.all([
        fetchWithTimeout('/api/stats/online-users', { headers }).catch(() => null),
        fetchWithTimeout('/api/stats/offline-sessions', { headers }).catch(() => null),
        fetchWithTimeout(`/api/users${''}`, { headers }, 25000).catch(() => null),
        fetchWithTimeout('/api/groups', { headers }).catch(() => null),
        fetchWithTimeout('/api/logs', { headers }).catch(() => null),
        fetchWithTimeout('/api/ippools', { headers }).catch(() => null),
        fetchWithTimeout('/api/profiles', { headers }).catch(() => null),
        fetchWithTimeout('/api/billing/settings', { headers }).catch(() => null),
        fetchWithTimeout('/api/info').catch(() => null),
        fetchWithTimeout('/api/territories', { headers }).catch(() => null),
        fetchWithTimeout('/api/collector-areas', { headers }).catch(() => null),
      ])

      if (ctrl.signal.aborted) return

      if (onlineRes?.ok) setOnlineUsers(await onlineRes.json())
      if (offlineRes?.ok) setOfflineSessions(await offlineRes.json())
      if (usersRes?.ok) {
        const usersData = await usersRes.json()
        setUsers(usersData.users)
        // Load active promises — 1 request bulk, bukan per-user
        fetch(`/api/users/promises/active${tqs()}`, { headers })
          .then(r => r.ok ? r.json() : {})
          .then(map => { if (!ctrl.signal.aborted) setActivePromises(map) })
          .catch(() => {})
      }
      if (groupsRes?.ok) setGroups(await groupsRes.json())
      if (logsRes?.ok) setLogs(await logsRes.json())
      if (poolRes?.ok) setIpPools(await poolRes.json())
      if (profileRes?.ok) setProfiles(await profileRes.json())
      if (settingsRes?.ok) {
        const s = await settingsRes.json()
        setBillingSettings(s)
        setSettingsForm(s)
      }
      if (infoRes?.ok) setBackendInfo(await infoRes.json())
      if (territoryRes?.ok) setTerritories(await territoryRes.json())
      if (collectorAreasRes?.ok) setCollectorAreas(await collectorAreasRes.json())

      // Mikrotik data (dijalankan terpisah karena bisa timeout lebih lama)
      try {
        setMtLoading(true)
        // Gunakan localStorage (selalu fresh) bukan currentUser state (bisa stale saat login baru)
        const freshUser = JSON.parse(localStorage.getItem('user') || 'null')
        const routerEndpoint = (freshUser?.role ?? currentUser?.role) === 'admin' ? '/api/mikrotik/config' : '/api/mikrotik/routers'
        const [mtRes, configRes] = await Promise.all([
          fetchWithTimeout('/api/mikrotik/profiles', { headers }, 5000).catch(() => null),
          fetchWithTimeout(routerEndpoint + tqs(), { headers }, 5000).catch(() => null),
        ])
        if (ctrl.signal.aborted) return
        if (mtRes?.ok) setMtProfiles(await mtRes.json())
        if (configRes?.ok) {
          const configs = await configRes.json()
          setMtConfigs(configs)
          configs.forEach(cfg => checkRouterStatusSilent(cfg.id))
        }
      } catch (err) { console.error('MikroTik fetch error:', err) }
      finally { setMtLoading(false) }

      await fetchInvoices()

      // Load System Staff (Admin + NOC)
      if (currentUser?.role === 'admin' || currentUser?.role === 'noc') {
        try {
          const sysRes = await fetchWithTimeout('/api/system/users', { headers })
          if (sysRes.ok) setSystemStaff(await sysRes.json())
        } catch (e) { console.error('Gagal fetch system staff:', e) }
      }

    } catch (error) {
      if (error.name === 'AbortError') return // diabaikan — ada fetch lebih baru
      console.error('Error fetching data:', error)
      if (!silent) showToast("Gagal memuat data dari server. Pastikan koneksi database aktif.", "error")
    } finally {
      if (!silent) setLoading(false)
      else setIsSilentRefetching(false)
    }
  }
  _fetchDataRef.current = fetchData


  // Initial full fetch + smart 30-second polling
  useEffect(() => {
    if (!isLoggedIn) return // Jangan polling jika belum login

    fetchData()

    const POLL_INTERVAL = 30000 // 30 detik
    let pollTimer = null

    const startPolling = () => {
      if (!pollTimer && isLoggedIn) {
        pollTimer = setInterval(fetchRealtimeData, POLL_INTERVAL)
      }
    }

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    // Pause polling saat tab disembunyikan (hemat baterai & bandwidth)
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        if (isLoggedIn) {
          fetchRealtimeData() // langsung refresh saat kembali ke tab
          startPolling()
        }
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isLoggedIn])

  // Safety net: reset loading ke false saat user logout/token expired
  // Mencegah tombol MASUK stuck di "Masuk..." tanpa mengganggu animasi loading saat klik
  useEffect(() => {
    if (!isLoggedIn) setLoading(false)
  }, [isLoggedIn])

  // Auto-logout saat idle (khusus role admin)
  // Idle 30 menit → tampilkan warning countdown 60 detik → logout otomatis
  const [idleWarning, setIdleWarning] = useState(false)
  const [idleCountdown, setIdleCountdown] = useState(60)
  // State untuk dropdown PPP profiles yang di-fetch dari MikroTik per router (modal paket)
  const [profilePppOptions, setProfilePppOptions] = useState({}) // { [nasId]: { loading, profiles: [{name, rateLimit}] } }

  const fetchRouterPppProfiles = async (nasId) => {
    setProfilePppOptions(prev => ({ ...prev, [nasId]: { loading: true, profiles: prev[nasId]?.profiles || [] } }))
    try {
      const res = await fetch(`/api/mikrotik/${nasId}/ppp-profiles`, { headers: authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProfilePppOptions(prev => ({ ...prev, [nasId]: { loading: false, profiles: data } }))
    } catch (err) {
      setProfilePppOptions(prev => ({ ...prev, [nasId]: { loading: false, profiles: prev[nasId]?.profiles || [] } }))
      showToast(`Gagal fetch profil dari router: ${err.message}`, 'error')
    }
  }
  useEffect(() => {
    if (!isLoggedIn || currentUser?.role !== 'admin') return

    const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 menit
    const WARNING_DURATION = 60 // detik
    let idleTimer = null
    let countdownTimer = null

    const resetIdle = () => {
      if (idleWarning) return // Jangan reset kalau warning sudah muncul
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        setIdleWarning(true)
        setIdleCountdown(WARNING_DURATION)
      }, IDLE_TIMEOUT)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle() // mulai timer pertama kali

    return () => {
      clearTimeout(idleTimer)
      clearInterval(countdownTimer)
      events.forEach(e => window.removeEventListener(e, resetIdle))
    }
  }, [isLoggedIn, currentUser, idleWarning])

  // Countdown timer saat warning muncul
  useEffect(() => {
    if (!idleWarning) return
    if (idleCountdown <= 0) {
      setIdleWarning(false)
      handleLogout()
      showToast('Anda otomatis keluar karena tidak aktif selama 30 menit.', 'info')
      return
    }
    const t = setTimeout(() => setIdleCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [idleWarning, idleCountdown])









  useEffect(() => {
    if (activeTab === 'billing') { fetchInvoices(); fetchPaymentProofs() }
    if (activeTab === 'finances') {
      fetchFinances()
      if (currentUser?.role === 'admin') { fetchSetoran(financePeriod); if (!historyLoaded) fetchCollectorHistory() }
    }
  }, [invoiceFilter, financePeriod, setoranDate, activeTab])

  // Reset halaman invoice ke 1 setiap filter berubah
  useEffect(() => {
    setInvoicePagination(p => ({ ...p, currentPage: 1 }))
  }, [invoiceFilter])

  // Router status check is now done once inside fetchData after configs are loaded.
  // Removed useEffect on [mtConfigs] which caused re-render cascades that closed modals.


  // --- Auth Actions ---
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `Server error (${res.status}). Silakan cek koneksi backend.` }));
        throw new Error(errorData.error || `Terjadi kesalahan pada server (${res.status})`);
      }

      const data = await res.json()

      // Validasi role sesuai portal yang dibuka
      if (portalRole && data.user.role !== portalRole) {
        const roleNames = { technician: 'Teknisi', collector: 'Kolektor', admin: 'Admin', noc: 'NOC' }
        throw new Error(`Akun ini adalah akun ${roleNames[data.user.role] || data.user.role}. Portal ini hanya untuk ${roleNames[portalRole]}.`)
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      setCurrentUser(data.user)
      setIsLoggedIn(true)
      showToast(`Selamat datang kembali, ${data.user.fullname}!`, "success")
      // NOC tidak punya dashboard — langsung ke PPPoE Users
      if (data.user.role === 'noc') {
        setActiveTab('pelanggan')
        localStorage.setItem('activeTab', 'pelanggan')
        window.history.replaceState({ tab: 'pelanggan', subTab: 'all' }, '', '/pppoe/users')
      }
      fetchData()
    } catch (err) {
      showToast(err.message, "error")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('superAdminTenantId')
    activeTenantIdRef.current = null
    setActiveTenantId(null)
    setIsLoggedIn(false)
    setCurrentUser(null)
    showToast("Anda telah keluar dari sistem", "info")
  }

  const handleTenantSwitch = (tenantId) => {
    activeTenantIdRef.current = tenantId
    setActiveTenantId(tenantId)
    if (!tenantId) localStorage.removeItem('superAdminTenantId')
    else localStorage.setItem('superAdminTenantId', String(tenantId))
    setShowTenantSwitcher(false)
    fetchTenantKode(tenantId)
    setMikrotikActiveTenant(tenantId)
    fetchData(false)
  }

  const handleTerminateSession = (username) => {
    requestConfirm('Putuskan Sesi', `Apakah Anda yakin ingin memutuskan sesi (kick) pelanggan ${username} secara paksa?`, async () => {
      try {
        const res = await fetch(`/api/sessions/terminate/${username}`, {
          method: 'POST',
          headers: authHeader()
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)

        showToast(data.message, "success")
        fetchData() // Refresh dashboard stats and lists
      } catch (err) {
        showToast(err.message, "error")
      }
    }, 'danger')
  }


  const exportInstallLogExcel = () => {
    if (!installLogData.length) return
    const periodLabel = installLogMode === 'day'
      ? new Date(installLogDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : new Date(installLogMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

    const wb = XLSX.utils.book_new()
    const rows = [
      [`Laporan Instalasi Pelanggan Baru — ${periodLabel}`],
      [`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`],
      [],
      ['No', 'Customer ID', 'Nama Pelanggan', 'Username', 'NIK', 'Paket', 'Wilayah', 'Teknisi', 'Tanggal Pasang'],
      ...installLogData.map((r, i) => [
        i + 1,
        r.customer_id || '-',
        r.fullname || r.username,
        r.username,
        r.identity_number || '-',
        r.groupname || '-',
        r.territory_name || '-',
        r.installed_by_name || '-',
        r.install_date ? new Date(r.install_date).toLocaleDateString('id-ID') : '-'
      ]),
      [],
      [`Total: ${installLogData.length} instalasi`]
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Log Instalasi')
    XLSX.writeFile(wb, `laporan-instalasi-${installLogMode === 'day' ? installLogDate : installLogMonth}.xlsx`)
  }

  // ── Export Rekap Kinerja Teknisi ke Excel ──
  const exportRekapTeknisiExcel = (techStats, rekapMonth, prevMonth, prev2Month, monthLabel) => {
    const wb = XLSX.utils.book_new()
    const periodLabel = monthLabel(rekapMonth)

    // Sheet 1: Ringkasan per teknisi
    const summaryRows = [
      [`Rekap Kinerja Teknisi — ${periodLabel}`],
      [`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`],
      [],
      ['Teknisi', monthLabel(prev2Month), monthLabel(prevMonth), monthLabel(rekapMonth), 'Total Sepanjang Masa'],
      ...techStats.map(t => [t.fullname || t.username, t.prev2Month, t.prevMonth, t.thisMonth, t.total])
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
    ws1['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan')

    // Sheet 2: Detail per teknisi bulan ini
    techStats.forEach(tech => {
      const thisMonthInstalls = tech.installs
        .filter(u => u.install_date?.slice(0, 7) === rekapMonth)
        .sort((a, b) => new Date(a.install_date) - new Date(b.install_date))
      if (!thisMonthInstalls.length) return
      const rows = [
        [`Detail Instalasi: ${tech.fullname || tech.username} — ${periodLabel}`],
        [],
        ['No', 'Customer ID', 'Nama Pelanggan', 'Username', 'Paket', 'Wilayah', 'Tanggal Pasang'],
        ...thisMonthInstalls.map((u, i) => [
          i + 1,
          u.customer_id || '-',
          u.fullname || u.username,
          u.username,
          u.groupname || '-',
          u.territory_name || '-',
          u.install_date ? new Date(u.install_date).toLocaleDateString('id-ID') : '-'
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 15 }]
      const sheetName = (tech.fullname || tech.username).slice(0, 28)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })

    XLSX.writeFile(wb, `rekap-teknisi-${rekapMonth}.xlsx`)
  }


  const fetchAdminOntRemovals = async (filter = adminOntFilter) => {
    setAdminOntLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.period) params.append('period', filter.period)
      if (filter.collector_id) params.append('collector_id', filter.collector_id)
      const res = await fetch(`/api/ont-removals?${params}`, { headers: authHeader() })
      if (!res.ok) return
      const data = await res.json()
      setAdminOntRemovals(data.removals || [])
      setAdminOntMonthly(data.monthly || [])
      setAdminOntByCollector(data.byCollector || [])
    } catch (_) {}
    finally { setAdminOntLoading(false) }
  }

  // ─── Waiting List ──────────────────────────────────────────────────────────

  const fetchTechnicianList = async () => {
    if (technicianList.length > 0) return // sudah di-cache
    try {
      const res = await fetch('/api/system/users', { headers: authHeader() })
      if (res.ok) {
        const all = await res.json()
        setTechnicianList(all.filter(u => u.role === 'technician'))
      }
    } catch (_) {}
  }
  _fetchTechnicianListRef.current = fetchTechnicianList

  // Buka modal assign untuk SATU entry (dari tombol "Tugaskan" per baris)
  const openWlAssignModal = async (entry) => {
    setWlAssignTarget(entry)
    setWlAssignTechUsernames(entry.assigned_technicians || [])
    setShowWlAssignModal(true)
    await fetchTechnicianList()
  }

  // Buka modal assign untuk BANYAK entry (dari floating bar)
  const openWlBulkAssignModal = async () => {
    setWlAssignTarget(null)
    setWlAssignTechUsernames([])
    setShowWlAssignModal(true)
    await fetchTechnicianList()
  }

  const toggleWlTech = (username) => {
    setWlAssignTechUsernames(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    )
  }

  const submitWlAssign = async () => {
    setWlAssignLoading(true)
    try {
      const isBulk = wlAssignTarget === null
      if (isBulk) {
        if (wlAssignTechUsernames.length === 0) { showToast('Pilih minimal 1 teknisi', 'warning'); return }
        const res = await fetch('/api/waiting-list/bulk-assign', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ technician_usernames: wlAssignTechUsernames, ids: wlSelectedIds })
        })
        if (!res.ok) throw new Error((await res.json()).error)
        showToast((await res.json()).message, 'success')
        setWlSelectedIds([])
      } else {
        if (wlAssignTechUsernames.length === 0) {
          // Hapus semua assignment
          const res = await fetch(`/api/waiting-list/${wlAssignTarget.id}/assign`, { method: 'DELETE', headers: authHeader() })
          if (!res.ok) throw new Error((await res.json()).error)
          showToast('Penugasan dihapus', 'success')
        } else {
          const res = await fetch(`/api/waiting-list/${wlAssignTarget.id}/assign`, {
            method: 'POST',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ technician_usernames: wlAssignTechUsernames })
          })
          if (!res.ok) throw new Error((await res.json()).error)
          showToast((await res.json()).message, 'success')
        }
      }
      setShowWlAssignModal(false)
      fetchWaitingList(wlStatusFilter)
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan penugasan', 'error')
    } finally {
      setWlAssignLoading(false)
    }
  }

  const openWlModal = (entry = null) => {
    const emptyWilayah = { prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' }
    if (entry) {
      setWlEditEntry(entry)
      setWlForm({ fullname: entry.fullname, phone: entry.phone || '', identity_number: entry.identity_number || '', ktp_photo: null, notes: entry.notes || '', territory_id: entry.territory_id || '', territory_area_id: entry.territory_area_id || '', groupname: entry.groupname || '', sales: entry.sales || '', latitude: entry.latitude || '', longitude: entry.longitude || '' })
    } else {
      setWlEditEntry(null)
      setWlForm({ fullname: '', phone: '', identity_number: '', ktp_photo: null, notes: '', territory_id: '', groupname: '', sales: '', latitude: '', longitude: '' })
    }
    setWlSelWilayah(emptyWilayah)
    setWlWilayahData({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
    setWlDusunPicker(false)
    setWlDusunOptions([])
    // Load provinsi
    fetchWilayah('provinsi').then(data => setWlWilayahData(d => ({ ...d, provinsi: data })))
    setShowWlModal(true)
  }



  const selectWlForPsb = async (entry) => {
    setSelectedWlEntry(entry)
    setNewUser(u => ({
      ...u,
      fullname: entry.fullname || '',
      phone: entry.phone || '',
      address: entry.address || '',
      identity_number: entry.identity_number || '',
      territory_id: entry.territory_id || '',
      territory_area_id: entry.territory_area_id || '',
      groupname: entry.groupname || u.groupname,
      latitude: entry.latitude || u.latitude,
      longitude: entry.longitude || u.longitude,
    }))
    setShowWlPickerModal(false)

    // Cascade wilayah dari kelurahan_kode
    if (entry.kelurahan_kode) {
      try {
        const kelKode = entry.kelurahan_kode
        const provKode = kelKode.substring(0, 2)
        const kabKode  = kelKode.substring(0, 4)
        const kecKode  = kelKode.substring(0, 6)

        // Parse dusun, RT, RW dari address string
        const addr = entry.address || ''
        const dusunMatch = addr.match(/Dusun ([^,]+)/)
        const rtMatch    = addr.match(/RT (\d+)/)
        const rwMatch    = addr.match(/RW (\d+)/)

        const provData = await fetchWilayah('provinsi')
        setWilayahData(d => ({ ...d, provinsi: provData, kabupaten: [], kecamatan: [], kelurahan: [] }))
        const prov = provData.find(p => p.kode === provKode)
        if (prov) {
          const kabData = await fetchWilayah('kabupaten', provKode)
          setWilayahData(d => ({ ...d, kabupaten: kabData }))
          const kab = kabData.find(k => k.kode === kabKode)
          if (kab) {
            const kecData = await fetchWilayah('kecamatan', kabKode)
            setWilayahData(d => ({ ...d, kecamatan: kecData }))
            const kec = kecData.find(k => k.kode === kecKode)
            if (kec) {
              const kelData = await fetchWilayah('kelurahan', kecKode)
              setWilayahData(d => ({ ...d, kelurahan: kelData }))
              setSelWilayah({
                prov: provKode, provNama: prov.nama,
                kab: kabKode,  kabNama: kab.nama,
                kec: kecKode,  kecNama: kec.nama,
                kel: kelKode,  kelNama: entry.kelurahan_nama || '',
                dusun: dusunMatch ? dusunMatch[1].trim() : '',
                rt:    rtMatch    ? rtMatch[1]             : '',
                rw:    rwMatch    ? rwMatch[1]             : '',
                detail: ''
              })
            }
          }
        }
      } catch (_) {
        // Fallback ke address string di detail
        if (entry.address) setSelWilayah(s => ({ ...s, detail: entry.address }))
      }
    } else if (entry.address) {
      setSelWilayah(s => ({ ...s, detail: entry.address }))
    }

    // Fetch foto KTP dari waiting list
    try {
      const res = await fetch(`/api/waiting-list/${entry.id}/ktp`, { headers: authHeader() })
      if (res.ok) {
        const data = await res.json()
        if (data.ktp_photo) setKtpPhoto(data.ktp_photo)
      }
    } catch (_) {}

    showToast(`Data ${entry.fullname} sudah diisi otomatis`, 'success')
  }


  const renderDashboard = () => (
    <DashboardPage
      stats={stats}
      users={users}
      profiles={profiles}
      collectorVisibleCount={collectorVisibleCount}
      setCollectorVisibleCount={setCollectorVisibleCount}
      invoiceFilter={invoiceFilter}
      setInvoiceFilter={setInvoiceFilter}
      dashWidgetExpanded={dashWidgetExpanded}
      setDashWidgetExpanded={setDashWidgetExpanded}
      setViewingUser={setViewingUser}
      setShowUserDetailModal={setShowUserDetailModal}
      handleSendMessage={handleSendMessage}
      handleCancelPromise={handleCancelPromise}
      openPromise={openPromise}
      openCabutModal={openCabutModal}
      activePromises={activePromises}
      ontTasks={ontTasks}
      setShowAddUserModal={setShowAddUserModal}
      setOntCompleteTarget={setOntCompleteTarget}
      setOntCompleteNotes={setOntCompleteNotes}
      setShowOntCompleteModal={setShowOntCompleteModal}
      wlAssignedCount={waitingList.filter(w => w.status === 'waiting').length}
    />
  )

  const renderTerritories = () => (
    <TerritoriesPage
      systemStaff={systemStaff}
      collectorAreas={collectorAreas}
      expandedCollectors={expandedCollectors}
      setExpandedCollectors={setExpandedCollectors}
      openAssignDusunModal={openAssignDusunModal}
      handleRemoveCollectorArea={handleRemoveCollectorArea}
    />
  )

    const renderPelanggan = () => (
    <PelangganPage
      users={users}
      pelangganSubTab={pelangganSubTab}
      userFilters={userFilters}
      setUserFilters={setUserFilters}
      pelangganSort={pelangganSort}
      setPelangganSort={setPelangganSort}
      userPagination={userPagination}
      setUserPagination={setUserPagination}
      onlineUsers={onlineUsers}
      offlineSessions={offlineSessions}
      selectedUsers={selectedUsers}
      setSelectedUsers={setSelectedUsers}
      mtConfigs={mtConfigs}
      profiles={profiles}
      territories={territories}
      collectorAreas={collectorAreas}
      billingSettings={billingSettings}
      setViewingUser={setViewingUser}
      setShowUserDetailModal={setShowUserDetailModal}
      setShowAddUserModal={setShowAddUserModal}
      setShowUserStatsModal={setShowUserStatsModal}
      setShowImportModal={setShowImportModal}
      handleExportUsers={handleExportUsers}
      prepareEditUser={prepareEditUser}
      openSetPin={openSetPin}
      openOntTaskModal={openOntTaskModal}
      openActionMenu={openActionMenu}
      setOpenActionMenu={setOpenActionMenu}
      actionMenuOpenUp={actionMenuOpenUp}
      setActionMenuOpenUp={setActionMenuOpenUp}
      actionMenuPos={actionMenuPos}
      setActionMenuPos={setActionMenuPos}
      fetchData={fetchData}
      setLoading={setLoading}
    />
  )

  const renderPaket = () => (
    <PaketPage
      profiles={profiles}
      profileSearch={profileSearch}
      setProfileSearch={setProfileSearch}
      profilePage={profilePage}
      setProfilePage={setProfilePage}
      profileSort={profileSort}
      setProfileSort={setProfileSort}
      mtConfigs={mtConfigs}
      setEditingProfile={setEditingProfile}
      setNewProfile={setNewProfile}
      setProfileSyncResults={setProfileSyncResults}
      setShowAddProfileModal={setShowAddProfileModal}
      handleDeleteProfile={handleDeleteProfile}
      handleEditProfile={handleEditProfile}
    />
  )

  const renderFinances = () => (
    <FinancesPage
      financeInvoices={financeInvoices}
      financePeriod={financePeriod}
      setFinancePeriod={setFinancePeriod}
      financeRincianPage={financeRincianPage}
      setFinanceRincianPage={setFinanceRincianPage}
      financeTrend={financeTrend}
      financeByDusun={financeByDusun}
      financeDiscounts={financeDiscounts}
      dusunPage={dusunPage}
      setDusunPage={setDusunPage}
      collectorSetoran={collectorSetoran}
      setoranDate={setoranDate}
      setSetoranDate={setSetoranDate}
      setoranSearch={setoranSearch}
      setSetoranSearch={setSetoranSearch}
      fetchSetoran={fetchSetoran}
      expandedCollector={expandedCollector}
      setExpandedCollector={setExpandedCollector}
      collectorHistory={collectorHistory}
      historyLoaded={historyLoaded}
      expandedHistoryCollector={expandedHistoryCollector}
      setExpandedHistoryCollector={setExpandedHistoryCollector}
      setHistoryLoaded={setHistoryLoaded}
      fetchCollectorHistory={fetchCollectorHistory}
      handleViewCollectorProof={handleViewCollectorProof}
      exportExcel={exportExcel}
      exportPDF={exportPDF}
      territories={territories}
      profiles={profiles}
      authHeader={authHeader}
      showToast={showToast}
      settingsForm={settingsForm}
    />
  )

  const renderBilling = () => {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title billing-page-title">{currentUser?.role === 'collector' ? 'Penagihan' : 'Riwayat Penagihan & Invoice'}</h1>
            <p className="page-description billing-page-desc">Monitor pembayaran bulanan dan kelola tagihan pelanggan.</p>
          </div>
          {currentUser?.role === 'admin' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={() => setShowSyncAddonModal(true)}>
                🔄 Sinkronisasi Addon
              </button>
              <button className="btn btn-primary" onClick={() => setShowGenerateInvoiceModal(true)}>
                <Plus size={18} />
                <span>Generate Tagihan Bulan Ini</span>
              </button>
            </div>
          )}
        </div>

        {currentUser?.role === 'collector' && (() => {
          // hitung dari daftar lengkap jika sedang di tab "all"
          const cntAll = invoices.length
          const cntUnpaid = invoiceFilter.status === 'all'
            ? invoices.filter(i => i.status === 'unpaid').length
            : invoiceFilter.status === 'unpaid' ? invoices.length : null
          const cntPaid = invoiceFilter.status === 'all'
            ? invoices.filter(i => i.status === 'paid').length
            : invoiceFilter.status === 'paid' ? invoices.length : null
          return (
            <div className="collector-billing-tabs">
              <button
                className={`collector-tab ${invoiceFilter.status === 'all' ? 'active' : ''}`}
                onClick={() => setInvoiceFilter({ ...invoiceFilter, status: 'all' })}
              >
                Semua
                {invoiceFilter.status === 'all' && <span className="tab-count">{cntAll}</span>}
              </button>
              <button
                className={`collector-tab unpaid ${invoiceFilter.status === 'unpaid' ? 'active' : ''}`}
                onClick={() => setInvoiceFilter({ ...invoiceFilter, status: 'unpaid' })}
              >
                <span className="tab-dot" style={{ background: '#ef4444' }}></span>
                Belum Lunas
                {cntUnpaid !== null && <span className="tab-count" style={cntUnpaid > 0 ? { background: '#ef4444', color: '#fff' } : {}}>{cntUnpaid}</span>}
              </button>
              <button
                className={`collector-tab paid ${invoiceFilter.status === 'paid' ? 'active' : ''}`}
                onClick={() => setInvoiceFilter({ ...invoiceFilter, status: 'paid' })}
              >
                <span className="tab-dot" style={{ background: '#10b981' }}></span>
                Sudah Lunas
                {cntPaid !== null && <span className="tab-count">{cntPaid}</span>}
              </button>
            </div>
          )
        })()}

        <div className={`filters-bar billing-filters${currentUser?.role === 'collector' ? ' billing-filters-collector' : ''}`} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            <div className="form-group billing-filter-period" style={{ marginBottom: 0, minWidth: '140px', flex: '1 1 140px' }}>
              <label className="billing-filter-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Periode Bulan</label>
              <input
                type="month"
                className="search-input"
                style={{ width: '100%' }}
                value={invoiceFilter.period}
                onChange={e => setInvoiceFilter({ ...invoiceFilter, period: e.target.value })}
              />
            </div>
            <div className="form-group billing-filter-status" style={{ marginBottom: 0, minWidth: '140px', flex: '1 1 140px' }}>
              <label className="billing-filter-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Status Bayar</label>
              <select
                className="search-input"
                style={{ width: '100%' }}
                value={invoiceFilter.status}
                onChange={e => setInvoiceFilter({ ...invoiceFilter, status: e.target.value })}
              >
                <option value="all">Semua Status</option>
                <option value="unpaid">Belum Bayar</option>
                <option value="paid">Sudah Lunas</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
            <div className="form-group billing-filter-search" style={{ marginBottom: 0, minWidth: '160px', flex: '2 1 160px' }}>
              <label className="billing-filter-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Cari Pelanggan</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
                <ClearableSearch
                  value={invoiceFilter.search}
                  onChange={e => setInvoiceFilter({ ...invoiceFilter, search: e.target.value })}
                  placeholder="Cari username..."
                  style={{ width: '100%', paddingLeft: '2.25rem' }}
                />
              </div>
            </div>
          </div>
          <button className="btn btn-outline billing-refresh-btn" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', whiteSpace: 'nowrap', alignSelf: 'flex-end' }} onClick={fetchInvoices}>
            <Activity size={16} /><span className="billing-refresh-label"> Segarkan</span>
          </button>
        </div>

        {/* Bulk Pay Action Bar */}
        {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && selectedInvoiceIds.length > 0 && (() => {
          const selectedInvs = invoices.filter(i => selectedInvoiceIds.includes(i.id))
          const totalSelected = selectedInvs.reduce((sum, i) => sum + Number(i.amount), 0)
          return (
            <div className="bulk-pay-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', flexWrap: 'wrap' }}>
              <div className="bulk-pay-info" style={{ flex: 1, minWidth: '200px' }}>
                <span style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{selectedInvoiceIds.length} invoice dipilih</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>Total: <strong style={{ color: 'var(--text-primary)' }}>Rp {totalSelected.toLocaleString('id-ID')}</strong></span>
              </div>
              <div className="bulk-pay-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }} onClick={() => setSelectedInvoiceIds([])}>
                  Batal
                </button>
                <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem', gap: '6px' }} onClick={() => { setBulkPayMethod('cash'); setBulkPayProof(null); setShowBulkPayModal(true) }}>
                  <CheckCircle size={15} /> Bayar Massal
                </button>
              </div>
            </div>
          )
        })()}

        <section className={`card${currentUser?.role === 'collector' ? ' billing-table-collector' : ''}`}>
          <div style={{ padding: '0', overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
                    <th style={{ width: '40px', paddingLeft: '1rem' }}>
                      <input
                        type="checkbox"
                        title="Pilih semua yang belum bayar"
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        checked={(() => {
                          const unpaidOnPage = (() => {
                            const totalInvPages = Math.max(1, Math.ceil(invoices.length / invoicePagination.entriesPerPage))
                            const safePage = Math.min(invoicePagination.currentPage, totalInvPages)
                            return invoices.slice((safePage - 1) * invoicePagination.entriesPerPage, safePage * invoicePagination.entriesPerPage).filter(i => i.status === 'unpaid')
                          })()
                          return unpaidOnPage.length > 0 && unpaidOnPage.every(i => selectedInvoiceIds.includes(i.id))
                        })()}
                        onChange={(e) => {
                          const totalInvPages = Math.max(1, Math.ceil(invoices.length / invoicePagination.entriesPerPage))
                          const safePage = Math.min(invoicePagination.currentPage, totalInvPages)
                          const unpaidOnPage = invoices.slice((safePage - 1) * invoicePagination.entriesPerPage, safePage * invoicePagination.entriesPerPage).filter(i => i.status === 'unpaid').map(i => i.id)
                          if (e.target.checked) {
                            setSelectedInvoiceIds(prev => [...new Set([...prev, ...unpaidOnPage])])
                          } else {
                            setSelectedInvoiceIds(prev => prev.filter(id => !unpaidOnPage.includes(id)))
                          }
                        }}
                      />
                    </th>
                  )}
                  <th>No. Invoice</th>
                  <th>Pelanggan</th>
                  <th>Paket & Periode</th>
                  <th>Total Tagihan</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length > 0 ? (() => {
                  const totalInvPages = Math.max(1, Math.ceil(invoices.length / invoicePagination.entriesPerPage))
                  const safePage = Math.min(invoicePagination.currentPage, totalInvPages)
                  if (safePage !== invoicePagination.currentPage) setInvoicePagination(p => ({ ...p, currentPage: safePage }))
                  const pageInvoices = invoices.slice((safePage - 1) * invoicePagination.entriesPerPage, safePage * invoicePagination.entriesPerPage)
                  return pageInvoices
                })().map(inv => (
                  <tr key={inv.id} style={selectedInvoiceIds.includes(inv.id) ? { background: 'rgba(99,102,241,0.06)' } : {}}>
                    {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
                      <td style={{ paddingLeft: '1rem' }}>
                        {inv.status === 'unpaid' && (
                          <input
                            type="checkbox"
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            checked={selectedInvoiceIds.includes(inv.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedInvoiceIds(prev => [...prev, inv.id])
                              else setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id))
                            }}
                          />
                        )}
                      </td>
                    )}
                    <td data-label="No. Invoice" style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#INV-{inv.id.toString().padStart(5, '0')}</td>
                    <td data-label="Pelanggan">
                      <div style={{ fontWeight: '600' }}>{inv.fullname || inv.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>User: {inv.username}</div>
                    </td>
                    <td data-label="Paket & Periode">
                      <div className="badge badge-purple" style={{ marginBottom: '4px' }}>{inv.current_package}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Periode {monthLabel(inv.period)}</div>
                    </td>
                    <td data-label="Total Tagihan" style={{ fontWeight: '700' }}>
                      Rp {Number(inv.amount).toLocaleString('id-ID')}
                      {parseFloat(inv.addon_amount) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
                          Termasuk addon Rp {Number(inv.addon_amount).toLocaleString('id-ID')}
                        </div>
                      )}
                    </td>
                    <td data-label="Status">
                      {inv.status === 'paid' && inv.payment_method === 'discount' ? (
                        <span className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>DISKON</span>
                      ) : inv.status === 'paid' ? (
                        <span className="badge badge-online">LUNAS</span>
                      ) : (
                        <span className="badge badge-isolir">BELUM BAYAR</span>
                      )}
                    </td>
                    <td data-label="Aksi">
                      <div className="invoice-action-btns">
                        {/* WA */}
                        <button className="inv-act-btn inv-act-wa" onClick={() => handleSendMessage({ phone: inv.phone, fullname: inv.fullname, username: inv.username, groupname: inv.current_package, due_date_day: inv.due_date_day, addon_amount: inv.addon_amount })} title="Kirim Pengingat WhatsApp">
                          <WhatsAppIcon size={16} color="currentColor" />
                        </button>
                        {inv.status !== 'paid' ? (
                          <>
                            {/* Quick Pay Cash — admin & collector */}
                            {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
                              <button className="inv-act-btn" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => handleQuickPayCash(inv)} title="Lunas Cash (1 klik)">
                                ⚡
                              </button>
                            )}
                            {/* Konfirmasi Bayar (modal lengkap) */}
                            <button className="inv-act-btn inv-act-pay" onClick={() => handlePayInvoice(inv.id, inv.username, inv.amount, inv.period)} title="Konfirmasi Bayar (pilih metode)">
                              <CheckCircle size={16} />
                            </button>
                            {/* Bayar Online */}
                            <button className="inv-act-btn inv-act-online" onClick={() => handleOpenPGModal(inv)} title="Bayar via Payment Gateway">
                              <CreditCard size={16} />
                            </button>
                            {/* Diskon — admin only */}
                            {currentUser?.role !== 'collector' && (
                              <button className="inv-act-btn inv-act-diskon" onClick={() => openDiscountModal(inv)} title="Beri Diskon (tidak masuk omzet)">
                                <Tag size={16} />
                              </button>
                            )}
                          </>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="inv-status-chip">
                              {inv.payment_method === 'discount' ? '🏷 Diskon' : inv.payment_method === 'transfer' ? '🏦 Transfer' : inv.payment_method === 'online' ? '🌐 Online' : '💵 Cash'}
                            </span>
                            {inv.payment_method !== 'discount' && (
                              <button
                                title="Cetak struk"
                                onClick={() => setReceiptModal(inv)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', borderRadius: '4px', fontSize: '0.85rem', lineHeight: 1 }}
                              >🧾</button>
                            )}
                            {currentUser?.role === 'admin' && inv.payment_method !== 'discount' && (
                              <button
                                title="Edit metode pembayaran"
                                onClick={() => { setEditPayMethodModal({ id: inv.id, username: inv.username, period: inv.period, current: inv.payment_method }); setEditPayMethodValue(inv.payment_method || 'cash') }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', borderRadius: '4px', fontSize: '0.75rem', lineHeight: 1 }}
                              >✏️</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={currentUser?.role === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                      <CreditCard size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} /><br />
                      Belum ada data invoice untuk periode {monthLabel(invoiceFilter.period)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination invoice */}
          {invoices.length > invoicePagination.entriesPerPage && (() => {
            const totalInvPages = Math.ceil(invoices.length / invoicePagination.entriesPerPage)
            const cur = Math.min(invoicePagination.currentPage, totalInvPages)
            const from = (cur - 1) * invoicePagination.entriesPerPage + 1
            const to = Math.min(cur * invoicePagination.entriesPerPage, invoices.length)
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tampilkan</span>
                  <select className="search-input" style={{ width: '70px', padding: '4px 8px', fontSize: '0.8rem' }}
                    value={invoicePagination.entriesPerPage}
                    onChange={e => setInvoicePagination({ currentPage: 1, entriesPerPage: Number(e.target.value) })}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {from}–{to} of {invoices.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={cur === 1} onClick={() => setInvoicePagination(p => ({ ...p, currentPage: 1 }))}>«</button>
                  <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={cur === 1} onClick={() => setInvoicePagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}>‹</button>
                  <button className="btn btn-primary" style={{ padding: '4px 10px', minWidth: '36px' }}>{cur}</button>
                  <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={cur >= totalInvPages} onClick={() => setInvoicePagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}>›</button>
                  <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={cur >= totalInvPages} onClick={() => setInvoicePagination(p => ({ ...p, currentPage: totalInvPages }))}>»</button>
                </div>
              </div>
            )
          })()}
        </section>

        {/* Admin: Verifikasi Bukti Transfer */}
        {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
          <section className="card proof-table" style={{ marginTop: '2rem' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Inbox size={18} className="text-primary" /> Verifikasi Bukti Transfer
                {proofsFilter === 'pending' && paymentProofs.length > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', marginLeft: '4px' }}>
                    {paymentProofs.length} pending
                  </span>
                )}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['pending', 'approved', 'rejected'].map(s => (
                  <button key={s} onClick={() => { setProofsFilter(s); fetchPaymentProofs(s) }}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: '700', borderRadius: '8px', border: '1px solid', cursor: 'pointer', background: proofsFilter === s ? 'var(--primary-color)' : 'transparent', color: proofsFilter === s ? '#fff' : 'var(--text-muted)', borderColor: proofsFilter === s ? 'var(--primary-color)' : 'var(--border-color)' }}>
                    {s === 'pending' ? 'Menunggu' : s === 'approved' ? 'Disetujui' : 'Ditolak'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th>Invoice</th>
                    <th>Bank</th>
                    <th>Jumlah</th>
                    <th>Tgl Kirim</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentProofs.length > 0 ? paymentProofs.map(proof => (
                    <tr key={proof.id}>
                      <td data-label="Pelanggan">
                        <div style={{ fontWeight: '600' }}>{proof.fullname || proof.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{proof.phone}</div>
                      </td>
                      <td data-label="Invoice">
                        <div style={{ fontWeight: '600' }}>#INV-{proof.invoice_id.toString().padStart(5, '0')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Periode {monthLabel(proof.period)}</div>
                      </td>
                      <td data-label="Bank"><span className="badge badge-purple">{proof.bank_name}</span></td>
                      <td data-label="Jumlah" style={{ fontWeight: '700' }}>Rp {Number(proof.amount || proof.invoice_amount).toLocaleString()}</td>
                      <td data-label="Tgl Kirim" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {new Date(proof.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td data-label="Aksi" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline" style={{ padding: '0.3rem 0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleViewProofImage(proof.id)}>
                            <Eye size={13} /> Lihat
                          </button>
                          {proof.status === 'pending' && (
                            <>
                              <button className="btn btn-primary" style={{ padding: '0.3rem 0.625rem', fontSize: '0.75rem' }}
                                onClick={() => handleVerifyProof(proof.id, 'approve')}>
                                ✓ Setujui
                              </button>
                              <button style={{ padding: '0.3rem 0.625rem', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                onClick={() => { setRejectingProofId(proof.id); setRejectReason(''); setShowRejectModal(true) }}>
                                ✕ Tolak
                              </button>
                            </>
                          )}
                          {proof.status === 'rejected' && proof.reject_reason && (
                            <span style={{ fontSize: '0.72rem', color: '#ef4444', fontStyle: 'italic', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proof.reject_reason}>{proof.reject_reason}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <Inbox size={36} style={{ opacity: 0.15, marginBottom: '0.75rem', display: 'block', margin: '0 auto 0.75rem' }} />
                        {proofsFilter === 'pending' ? 'Tidak ada bukti transfer yang menunggu verifikasi.' : 'Tidak ada data.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderSettingsBilling = () => (
    <SettingsBillingPage
      settingsForm={settingsForm}
      setSettingsForm={setSettingsForm}
      applyToAll={applyToAll}
      setApplyToAll={setApplyToAll}
      applyToAllLoading={applyToAllLoading}
      handleSaveSettings={handleSaveSettings}
      fetchPGConfig={fetchPGConfig}
      setShowPGSettingsModal={setShowPGSettingsModal}
      authHeader={authHeader}
      showToast={showToast}
    />
  )

  const renderLog = () => <LogPage logs={logs} />

    const renderIPPool = () => (
    <IPPoolPage
      ipPools={ipPools}
      setNewPool={setNewPool}
      setEditingPool={setEditingPool}
      setShowAddPoolModal={setShowAddPoolModal}
      prepareEditPool={prepareEditPool}
      handleDeletePool={handleDeletePool}
    />
  )


  // ─── MikroTik Script Generator ───────────────────────────────────────────────
  const generateMikroTikScript = (nas, cfg) => {
    if (!nas) return ''
    const secret = nas.radius_secret || nas.radiusSecret || 'Mynet@2026'
    const serverIp = cfg.server_ip || '<IP_SERVER_RADIUS>'
    const routerIp = nas.host || '<IP_ROUTER>'
    const isV6 = cfg.ros_version === 'v6'
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const timeout = isV6 ? '3s' : '00:00:03'

    const filledPools = (cfg.pools || []).filter(p => p.pool_name && p.ip_range)
    const firstPoolName = filledPools.length > 0 ? filledPools[0].pool_name : 'pppoe-pool'

    const lines = [
      `# ============================================================`,
      `#  Script Konfigurasi RADIUS — MikroTik`,
      `#  Router  : ${nas.name || nas.host} (${nas.host})`,
      `#  Versi OS: RouterOS ${isV6 ? 'v6.x' : 'v7.x'}`,
      `#  Dibuat  : ${date}`,
      `#  ⚠ Jalankan di Terminal MikroTik (New Terminal)`,
      `#  ℹ Script aman dijalankan ulang — konfigurasi yang sudah`,
      `#    ada akan di-skip otomatis`,
      `# ============================================================`,
      ``,
      `# 1. RADIUS Server — tambah jika belum ada, update secret jika sudah ada`,
      `/radius`,
      `:if ([:len [find where comment="PMYNET-RADIUS"]] = 0) do={ add address=${serverIp} secret="${secret}" service=ppp,login authentication-port=11812 accounting-port=11813 timeout=${timeout} comment="PMYNET-RADIUS"; :log info "RADIUS Mynet: ditambahkan" } else={ set [find where comment="PMYNET-RADIUS"] address=${serverIp} secret="${secret}" service=ppp,login authentication-port=11812 accounting-port=11813 timeout=${timeout}; :log info "RADIUS Mynet: diperbarui" }`,
      ``,
      `# 2. Aktifkan autentikasi PPP via RADIUS`,
      `/ppp aaa set use-radius=yes accounting=yes interim-update=5m`,
      ``,
      `# 3. Izinkan RADIUS Disconnect Request (PoD / CoA)`,
      `/radius incoming set accept=yes port=3799`,
      ``,
    ]

    // IP Pools
    if (filledPools.length > 0) {
      lines.push(`# 4. Buat IP Pool (${filledPools.length} pool) — skip jika sudah ada`)
      for (const pool of filledPools) {
        lines.push(`/ip pool`)
        lines.push(`:if ([:len [find name=${pool.pool_name}]] = 0) do={ add name=${pool.pool_name} ranges=${pool.ip_range}; :log info "Pool ${pool.pool_name}: ditambahkan" } else={ :log info "Pool ${pool.pool_name}: sudah ada, skip" }`)
      }
      lines.push(``)
    }

    // PPP Profiles — deduplicate by mikrotik profile name
    const uniqueProfiles = profiles.reduce((acc, p) => {
      const pName = p.mikrotik_profile || p.name
      if (!acc.find(x => (x.mikrotik_profile || x.name) === pName)) acc.push(p)
      return acc
    }, [])
    if (uniqueProfiles.length > 0) {
      lines.push(`# 5. Profil Paket Bandwidth (${uniqueProfiles.length} paket) — skip jika sudah ada`)
      lines.push(`# Catatan: remote-address & local-address tidak diset di sini,`)
      lines.push(`#          sesuaikan manual di Winbox sesuai pool tiap router`)
      lines.push(`/ppp profile`)
      for (const p of uniqueProfiles) {
        const pName = p.mikrotik_profile || p.name
        const gwPart = cfg.gateway ? ` local-address=${cfg.gateway}` : ''
        const extra = isV6 ? '' : ` use-mpls=no use-compression=no use-encryption=no`
        lines.push(`:if ([:len [find name="${pName}"]] = 0) do={ add name="${pName}" rate-limit=${p.rate_limit}${gwPart}${extra}; :log info "Profile ${pName}: ditambahkan" } else={ :log info "Profile ${pName}: sudah ada, skip" }`)
      }
      lines.push(``)
    }

    lines.push(
      `# 6. Firewall — skip jika rule sudah ada`,
      `/ip firewall filter`,
      `:if ([:len [find where comment="PMYNET-RADIUS CoA"]] = 0) do={ add chain=input protocol=udp src-address=${serverIp} dst-port=3799 action=accept comment="PMYNET-RADIUS CoA"; :log info "Firewall CoA: ditambahkan" } else={ :log info "Firewall CoA: sudah ada, skip" }`,
      `:if ([:len [find where comment="PMYNET-RADIUS Auth"]] = 0) do={ add chain=input protocol=udp src-address=${serverIp} dst-port=11812,11813 action=accept comment="PMYNET-RADIUS Auth"; :log info "Firewall Auth: ditambahkan" } else={ :log info "Firewall Auth: sudah ada, skip" }`,
      ``,
      `# 7. Netwatch — skip jika sudah ada`,
      `/tool netwatch`,
      `:if ([:len [find where comment="PMYNET-RADIUS"]] = 0) do={ add host=${serverIp} interval=30s timeout=5s comment="PMYNET-RADIUS" down-script="/log warning message=\\"RADIUS ${serverIp} tidak reachable\\"" up-script="/log info message=\\"RADIUS ${serverIp} kembali online\\""; :log info "Netwatch: ditambahkan" } else={ :log info "Netwatch: sudah ada, skip" }`,
      ``,
      `# ============================================================`,
      `#  ✅ Selesai! Verifikasi dengan:`,
      `#  /radius print`,
      `#  /ppp aaa print`,
      `#  /radius incoming print`,
      `#  /tool netwatch print`,
      `#  /log print  ← lihat hasil skip/ditambahkan`,
      `# ============================================================`,
    )

    return lines.join('\n')
  }

  const renderSettingsMikrotik = () => (
    <SettingsMikrotikPage
      mtLoading={mtLoading}
      mtConfigs={mtConfigs}
      routerStatus={routerStatus}
      showRouterPass={showRouterPass}
      setShowRouterPass={setShowRouterPass}
      handleSyncRadius={handleSyncRadius}
      setEditingMt={setEditingMt}
      setNewMtConfig={setNewMtConfig}
      setShowAddMtModal={setShowAddMtModal}
      openScriptModal={openScriptModal}
      checkRouterStatus={checkRouterStatus}
      prepareEditMt={prepareEditMt}
      handleDeleteRouter={handleDeleteRouter}
    />
  )

    const renderWaitingList = () => (
    <WaitingListPage
      waitingList={waitingList}
      wlSearch={wlSearch}
      setWlSearch={setWlSearch}
      wlStatusFilter={wlStatusFilter}
      setWlStatusFilter={setWlStatusFilter}
      wlSelectedIds={wlSelectedIds}
      setWlSelectedIds={setWlSelectedIds}
      wlLoading={wlLoading}
      fetchWaitingList={fetchWaitingList}
      openWlModal={openWlModal}
      openWlBulkAssignModal={openWlBulkAssignModal}
      openWlAssignModal={openWlAssignModal}
      viewWlKtp={viewWlKtp}
      cancelWlEntry={cancelWlEntry}
      restoreWlEntry={restoreWlEntry}
      selectWlForPsb={selectWlForPsb}
      psbFromWlRef={psbFromWlRef}
    />
  )

  // ─── Tab: Daftar Isolir (Kolektor) ──────────────────────────────────────────
  const renderCollectorIsolir = () => (
    <CollectorIsolirPage
      users={users}
      isolirSearch={isolirSearch}
      setIsolirSearch={setIsolirSearch}
      isolirVisibleCount={isolirVisibleCount}
      setIsolirVisibleCount={setIsolirVisibleCount}
      setViewingUser={setViewingUser}
      setShowUserDetailModal={setShowUserDetailModal}
      handleSendMessage={handleSendMessage}
      invoiceFilter={invoiceFilter}
      setInvoiceFilter={setInvoiceFilter}
      openCabutModal={openCabutModal}
    />
  )

  // ─── Tab: Riwayat Cabut ONT (Kolektor) ──────────────────────────────────────
  const renderCollectorOnt = () => (
    <CollectorOntPage
      ontRemovals={ontRemovals}
      ontRemovalsMeta={ontRemovalsMeta}
      fetchOntRemovals={fetchOntRemovals}
    />
  )

  // ─── Tab: Verifikasi Bukti Transfer (Kolektor) ───────────────────────────────
  const renderCollectorProofs = () => (
    <CollectorProofsPage
      paymentProofs={paymentProofs}
      proofsSearch={proofsSearch}
      setProofsSearch={setProofsSearch}
      proofsVisibleCount={proofsVisibleCount}
      setProofsVisibleCount={setProofsVisibleCount}
      proofsFilter={proofsFilter}
      setProofsFilter={setProofsFilter}
      fetchPaymentProofs={fetchPaymentProofs}
      handleViewProofImage={handleViewProofImage}
      handleVerifyProof={handleVerifyProof}
    />
  )

  // ─── Tab: Rekap Setoran Kolektor ────────────────────────────────────────────
  const renderCollectorSettlements = () => (
    <CollectorSettlementsPage
      settlementMode={settlementMode}
      setSettlementMode={setSettlementMode}
      settlementDate={settlementDate}
      setSettlementDate={setSettlementDate}
      settlementSearch={settlementSearch}
      setSettlementSearch={setSettlementSearch}
      settlementDateFrom={settlementDateFrom}
      setSettlementDateFrom={setSettlementDateFrom}
      settlementDateTo={settlementDateTo}
      setSettlementDateTo={setSettlementDateTo}
      settlementFilterCollector={settlementFilterCollector}
      setSettlementFilterCollector={setSettlementFilterCollector}
      collectorList={collectorList}
      settlementData={settlementData}
      settlementLoading={settlementLoading}
      settlementRangeData={settlementRangeData}
      settlementRangeLoading={settlementRangeLoading}
      settlementConfirmLoading={settlementConfirmLoading}
      fetchSettlements={fetchSettlements}
      fetchSettlementRange={fetchSettlementRange}
      fetchSettlementDetail={fetchSettlementDetail}
      confirmSettlement={confirmSettlement}
      unconfirmSettlement={unconfirmSettlement}
    />
  )

  // ─── Tab: Riwayat Notifikasi ─────────────────────────────────────────────────
  const renderNotifications = () => (
    <NotificationsPage
      notifications={notifications}
      notifPageFilter={notifPageFilter}
      setNotifPageFilter={setNotifPageFilter}
      notifPageSearch={notifPageSearch}
      setNotifPageSearch={setNotifPageSearch}
      notifVisibleCount={notifVisibleCount}
      setNotifVisibleCount={setNotifVisibleCount}
      unreadCount={unreadCount}
      markAllNotifRead={markAllNotifRead}
      fetchNotifications={fetchNotifications}
      handleNotifClick={handleNotifClick}
    />
  )

    const renderAdminOntTasks = () => (
    <AdminOntTasksPage
      adminOntTasks={adminOntTasks}
      adminOntTasksFilter={adminOntTasksFilter}
      adminOntTasksLoading={adminOntTasksLoading}
      setAdminOntTasksFilter={setAdminOntTasksFilter}
      fetchAdminOntTasks={fetchAdminOntTasks}
      adminOntMonthly={adminOntMonthly}
      adminOntByCollector={adminOntByCollector}
      adminOntRemovals={adminOntRemovals}
      adminOntLoading={adminOntLoading}
      adminOntFilter={adminOntFilter}
      setAdminOntFilter={setAdminOntFilter}
      fetchAdminOntRemovals={fetchAdminOntRemovals}
      users={users}
      setViewingUser={setViewingUser}
      setShowUserDetailModal={setShowUserDetailModal}
      cancelOntTask={cancelOntTask}
    />
  )

    const renderLaporanPsb = () => (
    <LaporanPsbPage
      systemStaff={systemStaff}
      users={users}
      rekapMonth={rekapMonth}
      setRekapMonth={setRekapMonth}
      rekapExpandedTech={rekapExpandedTech}
      setRekapExpandedTech={setRekapExpandedTech}
      installLogMode={installLogMode}
      setInstallLogMode={setInstallLogMode}
      installLogDate={installLogDate}
      setInstallLogDate={setInstallLogDate}
      installLogMonth={installLogMonth}
      setInstallLogMonth={setInstallLogMonth}
      installLogData={installLogData}
      installLogLoading={installLogLoading}
      installLogPage={installLogPage}
      setInstallLogPage={setInstallLogPage}
      fetchInstallLog={fetchInstallLog}
      exportInstallLogExcel={exportInstallLogExcel}
      exportRekapTeknisiExcel={exportRekapTeknisiExcel}
    />
  )

  const renderSystemUsers = () => (
    <SystemUsersPage
      systemStaff={systemStaff}
      staffSearch={staffSearch}
      setStaffSearch={setStaffSearch}
      staffPage={staffPage}
      setStaffPage={setStaffPage}
      rekapMonth={rekapMonth}
      users={users}
      setStaffForm={setStaffForm}
      setCurrentStaff={setCurrentStaff}
      setIsStaffModalOpen={setIsStaffModalOpen}
      fetchData={fetchData}
      setSelectedUsers={setSelectedUsers}
      tenantKode={tenantKode}
    />
  )

  const renderPanduan = () => {
    const sections = [
      { id: 'setup', label: 'Setup Awal', icon: <Wifi size={16} /> },
      { id: 'profile', label: 'Tambah Profile', icon: <Package size={16} /> },
      { id: 'pelanggan', label: 'Tambah Pelanggan', icon: <Users size={16} /> },
      { id: 'paket', label: 'Paket & Tagihan', icon: <CreditCard size={16} /> },
      { id: 'monitoring', label: 'Monitoring', icon: <Activity size={16} /> },
    ]
    const Step = ({ num, title, children }) => (
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', marginTop: 2 }}>{num}</div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{children}</div>
        </div>
      </div>
    )
    const Note = ({ children }) => (
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '1rem 0' }}>
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>💡 Tips: </span>{children}
      </div>
    )
    const Warn = ({ children }) => (
      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '1rem 0' }}>
        <span style={{ fontWeight: 600, color: '#f59e0b' }}>⚠️ Perhatian: </span>{children}
      </div>
    )
    return (
      <div style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📖 Panduan Penggunaan</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.9rem' }}>Langkah-langkah memulai dan menggunakan sistem billing PMYNET</p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={{ flexShrink: 0, width: 200, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
            {sections.map(s => (
              <button key={s.id} onClick={() => setPanduanTab(s.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', border: 'none', borderLeft: panduanTab === s.id ? '3px solid var(--primary-color)' : '3px solid transparent', background: panduanTab === s.id ? 'rgba(59,130,246,0.08)' : 'transparent', color: panduanTab === s.id ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: panduanTab === s.id ? 600 : 400, fontSize: '0.88rem', cursor: 'pointer', textAlign: 'left' }}>
                {s.icon}{s.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1.5rem' }}>
            {panduanTab === 'setup' && (
              <>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>⚙️ Setup Awal — Hubungkan Router MikroTik</h3>
                <Step num={1} title="Login sebagai Admin">
                  Masuk ke sistem menggunakan akun admin mitra kamu. Kalau belum punya akun, hubungi PMYNET untuk pembuatan akun.
                </Step>
                <Step num={2} title="Buka menu NAS / Router">
                  Klik <strong>NAS / Router</strong> di sidebar kiri (bagian JARINGAN). Ini adalah tempat mendaftarkan semua router MikroTik yang akan dikelola.
                </Step>
                <Step num={3} title="Tambah Router Baru">
                  Klik tombol <strong>+ Tambah Router</strong>. Isi:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                    <li><strong>Nama Router</strong> — nama bebas, misal: "Kantor Pusat"</li>
                    <li><strong>Host / IP</strong> — IP publik MikroTik kamu</li>
                    <li><strong>Port API</strong> — default 8728 (atau 8729 jika pakai SSL)</li>
                    <li><strong>Username & Password</strong> — kredensial login MikroTik (buat user khusus di Winbox → System → Users)</li>
                    <li><strong>Mode Autentikasi</strong> — pilih <em>PPP Secret (Local)</em> jika router mengelola autentikasi sendiri (mode paling umum), atau <em>FreeRADIUS</em> jika mitra sudah memakai RADIUS terpusat</li>
                  </ul>
                </Step>
                <Step num={4} title="Verifikasi Koneksi API">
                  Simpan router. Kolom <strong>Status</strong> harus menampilkan <span style={{ color: '#10b981', fontWeight: 600 }}>● ONLINE</span>. Jika masih offline, pastikan port 8728 di MikroTik terbuka dan user API memiliki permission <em>read + write + api</em>.
                </Step>
                <Note>Tidak perlu memasang script apapun di MikroTik. Semua otomasi (isolir, reaktivasi, deteksi online) dikendalikan langsung oleh sistem via RouterOS API.</Note>
                <Warn>Mode Autentikasi wajib diisi saat tambah router baru. Untuk router yang sudah terdaftar, bisa diubah via tombol Edit di daftar router. Pilihan mode menentukan cara kerja isolir dan reaktivasi pelanggan di router tersebut.</Warn>
              </>
            )}
            {panduanTab === 'profile' && (
              <>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>📦 Tambah Paket Bandwidth</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Paket adalah batasan bandwidth yang diassign ke pelanggan (misal: 10 Mbps, 20 Mbps). Paket harus dibuat lebih dulu sebelum mendaftarkan pelanggan.
                </p>
                <Step num={1} title="Buka Daftar Paket">
                  Klik <strong>Daftar Paket</strong> di sidebar kiri. Halaman ini menampilkan semua paket bandwidth yang tersedia.
                </Step>
                <Step num={2} title="Klik + Buat Profil Baru">
                  Klik tombol <strong>+ Buat Profil Baru</strong>. Isi:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                    <li><strong>Nama Paket</strong> — nama yang ditampilkan ke pelanggan, misal: <code style={{ background: 'var(--input-bg)', padding: '1px 5px', borderRadius: 4 }}>Silver 30 Mbps</code></li>
                    <li><strong>Rate Limit</strong> — Upload dan Download dalam Mbps</li>
                    <li><strong>Harga Bulanan</strong> — harga langganan per bulan dalam Rupiah</li>
                    <li><strong>Profil Default MikroTik</strong> (opsional) — nama PPP Profile di MikroTik yang berlaku untuk semua router. Jika dikosongkan, otomatis pakai Nama Paket.</li>
                    <li><strong>Deskripsi</strong> — opsional</li>
                  </ul>
                </Step>
                <Step num={3} title="Override Profil per Router (jika nama profil beda-beda tiap router)">
                  Di bagian <strong>Override Profil per Router</strong>, setiap router yang terdaftar tampil dalam satu baris. Jika nama PPP Profile di router tertentu berbeda dari default:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                    <li>Klik tombol <strong>↓ Ambil</strong> di baris router tersebut — sistem akan mengambil daftar profil langsung dari MikroTik</li>
                    <li>Pilih profil yang sesuai dari dropdown yang muncul</li>
                    <li>Router yang sudah dipilih override-nya akan otomatis disync saat kamu simpan profil</li>
                    <li>Router yang tidak diisi override tetap menggunakan <em>Profil Default MikroTik</em> (atau nama paket)</li>
                  </ul>
                </Step>
                <Step num={4} title="Simpan Profil">
                  Klik <strong>Simpan Profil</strong>. Paket langsung tersedia untuk dipilih saat mendaftarkan pelanggan baru.
                </Step>
                <Note>Nama profil di MikroTik harus identik (termasuk huruf besar/kecil) dengan yang diisi di sistem. Jika tidak cocok, pelanggan bisa konek tapi bandwidth tidak diterapkan.</Note>
                <Warn>Jika mitra punya banyak router dengan nama profil berbeda-beda, gunakan fitur Override per Router agar setiap router mendapat profil yang tepat. Tidak perlu membuat paket terpisah hanya karena nama profil berbeda.</Warn>
              </>
            )}
            {panduanTab === 'pelanggan' && (
              <>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>👥 Tambah & Impor Pelanggan</h3>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>A. Pasang Baru (PSB) — satu per satu</div>
                <Step num={1} title="Buka Daftar Pelanggan">
                  Klik <strong>Daftar Pelanggan</strong> di sidebar. Ini daftar semua pelanggan aktif.
                </Step>
                <Step num={2} title="Klik + Tambah Pelanggan">
                  Isi form: Username PPPoE, Password, Nama Lengkap, Paket, dan Router. Klik <strong>Simpan</strong>.
                </Step>
                <Step num={3} title="Verifikasi">
                  Pelanggan langsung muncul di daftar dan PPP Secret otomatis dibuat di MikroTik. Minta pelanggan konek PPPoE — dalam 2 menit statusnya akan berubah <span style={{ color: '#10b981', fontWeight: 600 }}>AKTIF</span>.
                </Step>
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }}></div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>B. Impor via CSV (banyak sekaligus)</div>
                <Step num={1} title="Download Template CSV">
                  Di halaman Daftar Pelanggan, klik tombol <strong>Import</strong>. Lalu klik <strong>Download Template</strong> untuk mendapatkan format yang benar.
                </Step>
                <Step num={2} title="Isi Data di Excel">
                  Kolom wajib: <code style={{ background: 'var(--input-bg)', padding: '1px 5px', borderRadius: 4 }}>username</code>, <code style={{ background: 'var(--input-bg)', padding: '1px 5px', borderRadius: 4 }}>password</code>, <code style={{ background: 'var(--input-bg)', padding: '1px 5px', borderRadius: 4 }}>groupname</code> (nama paket). Kolom opsional: fullname, address, dll.
                </Step>
                <Step num={3} title="Upload dan Review">
                  Upload file CSV, review preview data yang muncul. Pastikan tidak ada error di kolom.
                </Step>
                <Step num={4} title="Klik Impor">
                  Klik <strong>Impor N Pelanggan</strong>. Sistem mendaftarkan semua pelanggan sekaligus dan membuat PPP Secret di MikroTik secara otomatis.
                </Step>
                <Note>Status online diperbarui setiap 2 menit secara otomatis. Tidak perlu refresh manual untuk melihat pelanggan yang baru konek.</Note>
                <Warn>Pastikan kolom <strong>groupname</strong> diisi dengan nama paket yang sudah ada di sistem. Pelanggan tanpa groupname tetap diimpor tapi tidak punya paket — harus diassign manual setelah impor.</Warn>
              </>
            )}
            {panduanTab === 'paket' && (
              <>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>💳 Manajemen Tagihan & Isolir</h3>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Isolir & Reaktivasi Manual</div>
                <Step num={1} title="Isolir Pelanggan">
                  Di <strong>Daftar Pelanggan</strong>, klik baris pelanggan lalu pilih <strong>Isolir</strong> dari menu aksi. Koneksi langsung diputus — PPP Secret di MikroTik dinonaktifkan secara otomatis.
                </Step>
                <Step num={2} title="Reaktivasi Setelah Bayar">
                  Tandai invoice sebagai lunas (lihat bagian Tagihan di bawah). Sistem otomatis mengaktifkan kembali koneksi pelanggan — tidak perlu klik reaktivasi manual.
                </Step>
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }}></div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Isolir Otomatis</div>
                <Step num={1} title="Aktifkan di Pengaturan Billing">
                  Masuk ke <strong>Pengaturan → Billing</strong>. Aktifkan <strong>Isolir Otomatis</strong> dan atur jam isolir (misal: jam 12 siang). Sistem akan mengecek setiap 15 menit dan mengisolir pelanggan yang melewati jatuh tempo dan belum bayar.
                </Step>
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }}></div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Tagihan</div>
                <Step num={1} title="Generate Invoice">
                  Masuk ke menu <strong>Penagihan</strong>. Klik <strong>Generate Tagihan Bulan Ini</strong> untuk membuat invoice semua pelanggan aktif sekaligus.
                </Step>
                <Step num={2} title="Catat Pembayaran">
                  Setelah pelanggan bayar, klik ikon centang pada invoice tersebut. Pilih metode pembayaran (Cash / Transfer), lalu konfirmasi. Status tagihan berubah <strong>Lunas</strong> dan koneksi pelanggan yang sedang isolir otomatis aktif kembali.
                </Step>
                <Step num={3} title="Ganti Paket">
                  Klik baris pelanggan di <strong>Daftar Pelanggan</strong> untuk membuka detail, lalu pilih <strong>Ganti Paket</strong>. Pelanggan perlu reconnect untuk mendapatkan bandwidth baru.
                </Step>
                <Note>Pembayaran yang dicatat — baik oleh admin, kolektor, maupun via payment gateway — otomatis menonaktifkan status isolir dan mengaktifkan koneksi kembali tanpa perlu tindakan manual tambahan.</Note>
              </>
            )}
            {panduanTab === 'monitoring' && (
              <>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>📡 Monitoring & Troubleshooting</h3>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Status Pelanggan</div>
                <Step num={1} title="Lihat Status di Daftar Pelanggan">
                  Kolom <strong>Status</strong> menampilkan kondisi terkini pelanggan:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                    <li><span style={{ color: '#10b981', fontWeight: 600 }}>● AKTIF</span> — sedang konek ke jaringan</li>
                    <li><span style={{ color: '#6b7280', fontWeight: 600 }}>○ OFFLINE</span> — tidak konek (PPP Secret aktif)</li>
                    <li><span style={{ color: '#ef4444', fontWeight: 600 }}>⊘ ISOLIR</span> — PPP Secret dinonaktifkan, tidak bisa konek</li>
                    <li><span style={{ color: '#9ca3af', fontWeight: 600 }}>× BERHENTI</span> — langganan diakhiri</li>
                  </ul>
                </Step>
                <Step num={2} title="Pembaruan Status Otomatis">
                  Status diperbarui setiap <strong>2 menit</strong> secara otomatis dari data koneksi aktif MikroTik. Tidak perlu refresh halaman secara manual.
                </Step>
                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }}></div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Troubleshooting Umum</div>
                <Step num={1} title="Router Status OFFLINE di menu NAS">
                  Cek apakah IP MikroTik benar dan port API 8728 bisa diakses dari server. Pastikan user API di MikroTik masih aktif dengan permission <em>read + write + api</em>.
                </Step>
                <Step num={2} title="Pelanggan Online di MikroTik tapi OFFLINE di Sistem">
                  Status diperbarui tiap 2 menit — tunggu sebentar lalu refresh. Jika masih offline, cek status koneksi router di menu NAS — pastikan statusnya <span style={{ color: '#10b981', fontWeight: 600 }}>ONLINE</span>.
                </Step>
                <Step num={3} title="Pelanggan Tidak Bisa Konek (Auth Gagal)">
                  Cek apakah status pelanggan <strong>ISOLIR</strong>. Jika iya, tagihan perlu dilunasi terlebih dahulu. Jika tidak isolir, cek username dan password PPPoE di detail pelanggan — pastikan sesuai dengan yang dikonfigurasi di perangkat pelanggan.
                </Step>
                <Step num={4} title="Menambah Router Baru">
                  Tambah router baru di <strong>NAS / Router</strong>, isi kredensial API MikroTik, dan pilih <strong>Mode Autentikasi</strong> (Local atau FreeRADIUS). Simpan — router langsung aktif dan pelanggan bisa didaftarkan ke router tersebut.
                </Step>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderLogin = () => {
    return (
      <div className="login-container">
        {/* Decorative background elements */}
        <div className="login-blob login-blob-1"></div>
        <div className="login-blob login-blob-2"></div>

        <div className="login-card animate-fade-in">
          <div className="login-header">
            <div className="login-logo">
              <Wifi size={44} strokeWidth={2.5} />
            </div>
            <h1>{portalRole ? PORTAL_INFO[portalRole]?.title : 'PMY NET RADIUS'}</h1>
            <p>{portalRole ? PORTAL_INFO[portalRole]?.subtitle : 'Enterprise Billing & Network Control'}</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Username</label>
              <div className="input-with-icon">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  className="search-input"
                  value={loginForm.username}
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="username@kodemitra"
                  autoComplete="username"
                  required
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 2px' }}>
                Format: <strong>username@kodemitra</strong> — contoh: <em>admin@singa</em>
              </p>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  className="search-input"
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Masuk...' : 'Masuk'}
            </button>
          </form>
          <div className="login-footer">
            <p>&copy; 2026 PMY NET Infrastructure. Professional ISP Solutions.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) return (
    <>
      {renderLogin()}
      {toast.show && <NotificationToast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />}
    </>
  )

  return (
    <AuthContext.Provider value={{ currentUser, authHeader }}>
    <UIContext.Provider value={{ showToast, requestConfirm, requestCritical, hideAmounts, toggleHideAmounts }}>
    <NavigationContext.Provider value={{ navigateTo, activeTab, setActiveTab }}>
    <div className={`app-container ${['technician', 'collector'].includes(currentUser?.role) && activeTab !== 'psb' ? 'has-bottom-nav' : ''}`}>
      <div className={`mobile-overlay ${mobileSidebarOpen ? 'visible' : ''}`} onClick={() => setMobileSidebarOpen(false)}></div>
      <aside
        className={`sidebar ${mobileSidebarOpen ? 'mobile-open' : ''} ${['technician', 'collector'].includes(currentUser?.role) && activeTab !== 'psb' ? 'sidebar-bottom-mobile' : ''} ${sidebarCollapsed && !mobileSidebarOpen ? 'sidebar-collapsed' : ''} ${sidebarCollapsed && sidebarHovered && !mobileSidebarOpen ? 'sidebar-hover-expanded' : ''}`}
        onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="sidebar-header">
          <div className="logo-text"><Wifi size={24} className="logo-icon" /><span>{portalRole ? PORTAL_INFO[portalRole]?.sidebarTitle : currentUser?.is_super_admin && !activeTenantId ? 'SUPER ADMIN' : 'RADIUS ADMIN'}</span></div>
          <button className="sidebar-toggle-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">

          {/* ══ SUPER ADMIN NATIVE MODE ══════════════════════════════════════ */}
          {currentUser?.is_super_admin && !activeTenantId && (<>
            <div className="nav-label">MAIN</div>
            <a href="/sa/dashboard" className={`nav-item ${activeTab === 'sa_dashboard' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_dashboard', e)}>
              <LayoutDashboard size={20} /><span>Dashboard</span>
            </a>

            <div className="nav-label">MITRA</div>
            <a href="/sa/mitra" className={`nav-item ${activeTab === 'sa_mitra' && samitraFilter === 'semua' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_mitra', e, 'semua')}>
              <Building2 size={20} /><span>Semua Mitra</span>
              <span className="nav-badge" style={{ background: 'var(--accent)', marginLeft: 'auto' }}>{tenantSwitcherList.length}</span>
            </a>
            <a href="/sa/mitra/aktif" className={`nav-item ${activeTab === 'sa_mitra' && samitraFilter === 'aktif' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_mitra', e, 'aktif')}>
              <UserCheck size={20} /><span>Mitra Aktif</span>
              {tenantSwitcherList.filter(t => t.status === 'aktif').length > 0 && (
                <span className="nav-badge" style={{ background: 'var(--success)', marginLeft: 'auto' }}>{tenantSwitcherList.filter(t => t.status === 'aktif').length}</span>
              )}
            </a>
            <a href="/sa/mitra/nonaktif" className={`nav-item ${activeTab === 'sa_mitra' && samitraFilter === 'nonaktif' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_mitra', e, 'nonaktif')}>
              <UserX size={20} /><span>Non-Aktif</span>
              {tenantSwitcherList.filter(t => t.status === 'nonaktif').length > 0 && (
                <span className="nav-badge" style={{ background: 'var(--warning)', marginLeft: 'auto' }}>{tenantSwitcherList.filter(t => t.status === 'nonaktif').length}</span>
              )}
            </a>
            <a href="/sa/mitra/berhenti" className={`nav-item ${activeTab === 'sa_mitra' && samitraFilter === 'berhenti' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_mitra', e, 'berhenti')}>
              <UserX size={20} /><span>Berhenti</span>
              {tenantSwitcherList.filter(t => t.status === 'berhenti').length > 0 && (
                <span className="nav-badge" style={{ background: 'var(--danger)', marginLeft: 'auto' }}>{tenantSwitcherList.filter(t => t.status === 'berhenti').length}</span>
              )}
            </a>

            <div className="nav-label">PLATFORM</div>
            <a href="/sa/platform" className={`nav-item ${activeTab === 'sa_platform' ? 'active' : ''}`} onClick={(e) => navigateTo('sa_platform', e)}>
              <Settings size={20} /><span>Pengaturan Platform</span>
            </a>
          </>)}

          {/* ══ REGULAR ADMIN / IMPERSONATION MODE ══════════════════════════ */}
          {(!currentUser?.is_super_admin || activeTenantId) && (<>

          {/* ── MAIN ─────────────────────────────────── */}
          {currentUser?.role !== 'noc' && <div className="nav-label">MAIN</div>}
          {currentUser?.role !== 'noc' && (
            <a href="/dashboard" className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={(e) => navigateTo('dashboard', e)}>
              <LayoutDashboard size={20} /><span>Dashboard</span>
            </a>
          )}

          {/* ── PELANGGAN ────────────────────────────── */}
          {['admin', 'technician', 'noc'].includes(currentUser?.role) && <div className="nav-label">PELANGGAN</div>}
          {['admin', 'technician', 'noc'].includes(currentUser?.role) && (
            <a href="/pppoe/users" className={`nav-item ${activeTab === 'pelanggan' && pelangganSubTab === 'all' ? 'active' : ''}`} onClick={(e) => navigateTo('pelanggan', e, 'all')}>
              <Users size={20} /><span>Daftar Pelanggan</span>
            </a>
          )}
          {currentUser?.role === 'technician' && (
            <a className="nav-item nav-item-add-mobile" onClick={() => setShowAddUserModal(true)}>
              <div className="add-icon-wrapper"><Plus size={28} /></div>
              <span>PSB</span>
            </a>
          )}
          {['admin', 'noc'].includes(currentUser?.role) && (
            <a href="/pppoe/profiles" className={`nav-item ${activeTab === 'paket' ? 'active' : ''}`} onClick={(e) => navigateTo('paket', e)}>
              <Package size={20} /><span>Daftar Paket</span>
            </a>
          )}

          {/* ── JARINGAN (INFRA + MONITORING digabung) ── */}
          {['admin', 'noc'].includes(currentUser?.role) && (
            <>
              <div className="nav-label">JARINGAN</div>
              <a href="/mikrotik" className={`nav-item ${activeTab === 'settings_mikrotik' ? 'active' : ''}`} onClick={(e) => navigateTo('settings_mikrotik', e)}>
                <Wifi size={20} /><span>NAS / Router</span>
              </a>
              <a href="/log" className={`nav-item ${activeTab === 'log' ? 'active' : ''}`} onClick={(e) => navigateTo('log', e)}>
                <History size={20} /><span>Log Aktivitas</span>
              </a>
            </>
          )}

          {/* ── PENAGIHAN ────────────────────────────── */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
            <div className="nav-label">PENAGIHAN</div>
          )}
          {(currentUser?.role === 'admin' || currentUser?.role === 'collector') && (
            <a href="/billing" className={`nav-item ${activeTab === 'billing' && invoiceFilter.status === 'all' ? 'active' : ''}`} onClick={(e) => { navigateTo('billing', e); setInvoiceFilter({ ...invoiceFilter, status: 'all' }); }}>
              <CreditCard size={20} />
              <span className="nav-label-full">{currentUser?.role === 'collector' ? 'Penagihan Wilayah' : 'Penagihan'}</span>
              <span className="nav-label-short">Tagihan</span>
              {currentUser?.role === 'collector' && invoices.filter(i => i.status === 'unpaid').length > 0 && (
                <span className="nav-badge">{invoices.filter(i => i.status === 'unpaid').length > 99 ? '99+' : invoices.filter(i => i.status === 'unpaid').length}</span>
              )}
              {currentUser?.role === 'admin' && pendingProofsCount > 0 && (
                <span className="nav-badge" style={{ background: '#f59e0b' }}>{pendingProofsCount > 99 ? '99+' : pendingProofsCount}</span>
              )}
            </a>
          )}
          {currentUser?.role === 'collector' && (
            <>
              <a href="/billing/unpaid" className={`nav-item nav-billing-sub ${activeTab === 'billing' && invoiceFilter.status === 'unpaid' ? 'active' : ''}`} style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }} onClick={(e) => { navigateTo('billing', e); setInvoiceFilter({ ...invoiceFilter, status: 'unpaid' }); }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}></div>
                <span>Belum Lunas</span>
              </a>
              <a href="/billing/paid" className={`nav-item nav-billing-sub ${activeTab === 'billing' && invoiceFilter.status === 'paid' ? 'active' : ''}`} style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }} onClick={(e) => { navigateTo('billing', e); setInvoiceFilter({ ...invoiceFilter, status: 'paid' }); }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }}></div>
                <span>Sudah Lunas</span>
              </a>
            </>
          )}
          {['admin', 'collector'].includes(currentUser?.role) && (
            <a href="/billing/finances" className={`nav-item ${activeTab === 'finances' ? 'active' : ''}`} onClick={(e) => navigateTo('finances', e)}>
              <Wallet size={20} />
              <span className="nav-label-full">Laporan Keuangan</span>
              <span className="nav-label-short">Keuangan</span>
            </a>
          )}
          {currentUser?.role === 'admin' && (
            <a href="/collector-settlements" className={`nav-item ${activeTab === 'collector_settlements' ? 'active' : ''}`} onClick={(e) => navigateTo('collector_settlements', e)}>
              <BadgeCent size={20} />
              <span className="nav-label-full">Rekap Setoran</span>
              <span className="nav-label-short">Setoran</span>
            </a>
          )}
          {currentUser?.role === 'collector' && (
            <>
              <a href="/collector/isolir" className={`nav-item ${activeTab === 'collector_isolir' ? 'active' : ''}`} onClick={(e) => navigateTo('collector_isolir', e)}>
                <UserX size={20} />
                <span className="nav-label-full">Pelanggan Isolir</span>
                <span className="nav-label-short">Isolir</span>
                {users.filter(u => u.is_suspended).length > 0 && (
                  <span className="nav-badge" style={{ background: '#ef4444' }}>
                    {users.filter(u => u.is_suspended).length > 99 ? '99+' : users.filter(u => u.is_suspended).length}
                  </span>
                )}
              </a>
              <a href="/collector/ont" className={`nav-item ${activeTab === 'collector_ont' ? 'active' : ''}`} onClick={(e) => navigateTo('collector_ont', e)}>
                <Unplug size={20} />
                <span className="nav-label-full">Riwayat Cabut ONT</span>
                <span className="nav-label-short">Cabut ONT</span>
              </a>
              <a href="/collector/proofs" className={`nav-item ${activeTab === 'collector_proofs' ? 'active' : ''}`} onClick={(e) => navigateTo('collector_proofs', e)}>
                <Inbox size={20} />
                <span className="nav-label-full">Bukti Transfer</span>
                <span className="nav-label-short">Bukti</span>
                {pendingProofsCount > 0 && (
                  <span className="nav-badge" style={{ background: '#f59e0b' }}>{pendingProofsCount > 99 ? '99+' : pendingProofsCount}</span>
                )}
              </a>
            </>
          )}

          {/* ── OPERASIONAL ──────────────────────────── */}
          {['admin', 'technician', 'noc'].includes(currentUser?.role) && (
            <div className="nav-label">OPERASIONAL</div>
          )}
          {['admin', 'noc'].includes(currentUser?.role) && (
            <a href="/laporan/psb" className={`nav-item ${activeTab === 'laporan_psb' ? 'active' : ''}`} onClick={(e) => navigateTo('laporan_psb', e)}>
              <CalendarCheck size={20} />
              <span className="nav-label-full">Laporan PSB</span>
              <span className="nav-label-short">PSB</span>
            </a>
          )}
          {['admin', 'technician', 'noc'].includes(currentUser?.role) && (
            <a href="/waiting-list" className={`nav-item ${activeTab === 'waiting_list' ? 'active' : ''}${currentUser?.role === 'technician' ? ' nav-hide-mobile' : ''}`} onClick={(e) => navigateTo('waiting_list', e)}>
              <ClipboardList size={20} />
              <span className="nav-label-full">Waiting List</span>
              <span className="nav-label-short">Antrian</span>
              {(() => {
                const wlUnread = notifications.filter(n => !n.read_at && (n.type === 'new_waiting_list' || n.type === 'waiting_list_installed')).length
                return wlUnread > 0 ? <span className="nav-badge" style={{ background: '#f59e0b' }}>{wlUnread > 99 ? '99+' : wlUnread}</span> : null
              })()}
            </a>
          )}
          {['admin', 'noc'].includes(currentUser?.role) && (
            <a href="/admin/ont-tasks" className={`nav-item ${activeTab === 'admin_ont_tasks' ? 'active' : ''}`} onClick={(e) => navigateTo('admin_ont_tasks', e)}>
              <Unplug size={20} />
              <span className="nav-label-full">Task Cabut ONT</span>
              <span className="nav-label-short">Cabut ONT</span>
              {(() => {
                const pendingOnt = users.filter(u => u.has_ont_task).length
                return pendingOnt > 0 ? <span className="nav-badge" style={{ background: '#ef4444' }}>{pendingOnt > 99 ? '99+' : pendingOnt}</span> : null
              })()}
            </a>
          )}

          {/* ── ADMINISTRASI ─────────────────────────── */}
          {currentUser?.role === 'admin' && <div className="nav-label">ADMINISTRASI</div>}
          <a href="/notifications" className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}${['technician','collector','noc'].includes(currentUser?.role) ? ' nav-hide-mobile' : ''}`} onClick={(e) => navigateTo('notifications', e)}>
            <Bell size={20} />
            <span className="nav-label-full">Notifikasi</span>
            <span className="nav-label-short">Notif</span>
            {unreadCount > 0 && (
              <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </a>
          {currentUser?.role === 'admin' && (
            <>
              <a href="/territories" className={`nav-item ${activeTab === 'territories' ? 'active' : ''}`} onClick={(e) => navigateTo('territories', e)}>
                <MapPin size={20} /><span>Manajemen Wilayah</span>
              </a>
              <a href="/addon-types" className={`nav-item ${activeTab === 'addon_types' ? 'active' : ''}`} onClick={(e) => navigateTo('addon_types', e)}>
                <Package size={20} /><span>Layanan Tambahan</span>
              </a>
              <a href="/system/users" className={`nav-item ${activeTab === 'system_users' ? 'active' : ''}`} onClick={(e) => navigateTo('system_users', e)}>
                <ShieldCheck size={20} /><span>Manajemen Staff</span>
              </a>
              <a href="/pengaturan" className={`nav-item ${activeTab === 'settings_billing' ? 'active' : ''}`} onClick={(e) => navigateTo('settings_billing', e)}>
                <Settings size={20} /><span>Pengaturan</span>
              </a>
              <a href="/panduan" className={`nav-item nav-item-panduan ${activeTab === 'panduan' ? 'active' : ''}`} onClick={(e) => navigateTo('panduan', e)}>
                <BookOpen size={20} />
                <span className="nav-label-full">Panduan</span>
                <span className="nav-label-short">Guide</span>
                <span className="panduan-badge">BACA</span>
              </a>
            </>
          )}

          {/* close regular admin/impersonation block */}
          </>)}
        </nav>
      </aside>

      <div className={`main-wrapper ${sidebarCollapsed ? 'sidebar-collapsed-main' : ''}`}>
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="hamburger-btn" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            {currentUser?.is_super_admin && activeTenantId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '3px 10px', fontWeight: 600, letterSpacing: '0.03em' }}>
                  MODE PANTAU
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {tenantSwitcherList.find(t => t.id === activeTenantId)?.nama || `Mitra #${activeTenantId}`}
                </span>
                <button
                  onClick={() => handleTenantSwitch(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
                  title="Kembali ke Super Admin"
                >
                  <X size={14} /> Keluar
                </button>
              </div>
            ) : (
              <div className="breadcrumb">
                <span>{currentUser?.is_super_admin ? 'Super Admin' : portalRole === 'technician' ? 'Teknisi' : portalRole === 'collector' ? 'Kolektor' : currentUser?.role === 'noc' ? 'NOC' : 'Admin'}</span>
                <span>/</span>
                <span className="breadcrumb-active">{tabLabels[activeTab]}</span>
              </div>
            )}
          </div>
          <div className="header-actions">
            {/* Tenant Switcher — hanya untuk super admin */}
            {currentUser?.is_super_admin && (
              <div ref={tenantSwitcherRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowTenantSwitcher(v => !v)}
                  title="Ganti tampilan mitra"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '5px 10px', borderRadius: '20px', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--border-color)',
                    background: activeTenantId ? 'rgba(var(--accent-rgb,99,102,241),0.12)' : 'var(--bg-tertiary)',
                    color: activeTenantId ? 'var(--accent)' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Building2 size={13} />
                  <span className="hide-mobile">
                    {activeTenantId
                      ? (tenantSwitcherList.find(t => t.id === activeTenantId)?.nama || `Mitra #${activeTenantId}`)
                      : 'Semua Mitra'}
                  </span>
                  <ChevronDown size={12} style={{ opacity: 0.6 }} />
                </button>
                {showTenantSwitcher && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    minWidth: 220, background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)', borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 200001,
                    overflow: 'hidden'
                  }}>
                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Lihat Data Mitra
                    </div>
                    <button
                      onClick={() => handleTenantSwitch(null)}
                      style={{
                        width: '100%', padding: '0.6rem 0.85rem', textAlign: 'left',
                        background: !activeTenantId ? 'var(--bg-tertiary)' : 'transparent',
                        color: !activeTenantId ? 'var(--accent)' : 'var(--text-primary)',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: '0.82rem', fontWeight: !activeTenantId ? 600 : 400
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: !activeTenantId ? 'var(--accent)' : 'transparent', border: '1.5px solid var(--border-color)', flexShrink: 0 }} />
                      Semua Mitra (Global)
                    </button>
                    {tenantSwitcherList.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleTenantSwitch(t.id)}
                        style={{
                          width: '100%', padding: '0.6rem 0.85rem', textAlign: 'left',
                          background: activeTenantId === t.id ? 'var(--bg-tertiary)' : 'transparent',
                          color: activeTenantId === t.id ? 'var(--accent)' : 'var(--text-primary)',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: '0.82rem', fontWeight: activeTenantId === t.id ? 600 : 400,
                          borderTop: '1px solid var(--border-color)'
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeTenantId === t.id ? 'var(--accent)' : 'transparent', border: '1.5px solid var(--border-color)', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{t.nama}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{t.kode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Indikator status MikroTik — hanya untuk admin */}
            {currentUser?.role === 'admin' && mtConfigs.length > 0 && (() => {
              const isOnline = routerStatus[mtConfigs[0]?.id]?.status === 'online'
              return (
                <div title={`MikroTik: ${isOnline ? 'Terkoneksi' : 'Disconnect'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: '600',
                    color: isOnline ? '#16a34a' : '#ef4444', padding: '4px 10px',
                    background: isOnline ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                    borderRadius: '20px', border: `1px solid ${isOnline ? 'rgba(22,163,74,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    cursor: 'default' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline ? '#16a34a' : '#ef4444',
                    boxShadow: isOnline ? '0 0 0 2px rgba(22,163,74,0.3)' : 'none',
                    animation: isOnline ? 'pulse-green 2s infinite' : 'none' }} />
                  <Wifi size={13} />
                  <span className="hide-mobile">{isOnline ? 'MikroTik OK' : 'MikroTik OFF'}</span>
                </div>
              )
            })()}
            <button
              className="icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? "Ganti ke Tema Terang" : "Ganti ke Tema Gelap"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="icon-btn" onClick={() => fetchData()} title="Muat Ulang Data"
              style={{ position: 'relative' }}>
              <Activity size={18} style={{ animation: isSilentRefetching ? 'spin 1s linear infinite' : 'none' }} />
              {isSilentRefetching && (
                <span style={{ position: 'absolute', top: '2px', right: '2px', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              )}
            </button>

            {/* Notification Bell */}
            <div ref={notifPanelRef} style={{ position: 'relative' }}>
              <button className="icon-btn" title="Notifikasi" onClick={() => { setShowNotifPanel(v => !v); if (!showNotifPanel) fetchNotifications() }}
                style={{ position: 'relative' }}>
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '2px', right: '2px',
                    background: '#ef4444', color: '#fff', borderRadius: '50%',
                    width: '16px', height: '16px', fontSize: '10px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                  }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {showNotifPanel && (
                <div style={{
                  position: 'fixed',
                  top: '60px',
                  right: '8px',
                  left: '8px',
                  maxWidth: '380px',
                  marginLeft: 'auto',
                  maxHeight: 'calc(100vh - 80px)',
                  overflowY: 'auto',
                  background: 'var(--bg-surface)', borderRadius: '14px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)', border: '1px solid var(--border-color)',
                  zIndex: 200000
                }}>
                  <div style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, background: 'var(--bg-surface)', borderRadius: '14px 14px 0 0' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>🔔 Notifikasi</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllNotifRead} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <Bell size={32} style={{ opacity: 0.2, marginBottom: '0.5rem' }} /><br />Belum ada notifikasi
                    </div>
                  ) : notifications.slice(0, 7).map(n => (
                    <div key={n.id} onClick={() => handleNotifClick(n)} style={{
                      padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer', transition: 'background 0.15s',
                      background: n.read_at ? 'transparent' : 'rgba(99,102,241,0.06)',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = n.read_at ? 'transparent' : 'rgba(99,102,241,0.06)'}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        {!n.read_at && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)', flexShrink: 0, marginTop: '5px' }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: n.read_at ? '500' : '700', fontSize: '0.82rem', marginBottom: '2px' }}>{n.title}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{n.body}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Footer: lihat semua */}
                  {notifications.length > 0 && (
                    <div
                      onClick={() => { setShowNotifPanel(false); navigateTo('notifications') }}
                      style={{ padding: '0.75rem 1rem', textAlign: 'center', borderTop: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', color: 'var(--primary-color)', position: 'sticky', bottom: 0, background: 'var(--bg-surface)', borderRadius: '0 0 14px 14px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                    >
                      Lihat semua notifikasi →
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="user-profile-dropdown" style={{ marginLeft: '1rem', position: 'relative' }}>
              <button
                className="user-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="avatar">{currentUser?.username?.charAt(0).toUpperCase() || 'A'}</div>
                <div className="user-details-mini" style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'var(--text-main)' }}>{currentUser?.fullname || currentUser?.username || 'Admin'}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{currentUser?.role || 'Super Admin'}</div>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: '4px' }} />
              </button>

              {showUserMenu && (
                <div className="dropdown-menu animate-fade-in" style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.75rem',
                  width: '200px',
                  background: 'var(--bg-surface)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  zIndex: 200000,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opsi Akun</div>
                  </div>
                  {currentUser?.role === 'admin' && (
                    <button className="dropdown-item" onClick={() => { setShowUserMenu(false); navigateTo('settings_billing', null); }}>
                      <Settings size={16} /><span>Profil & Keamanan</span>
                    </button>
                  )}
                  <button className="dropdown-item" style={{ color: '#f43f5e' }} onClick={handleLogout}>
                    <LogOut size={16} /><span>Logout Akun</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>
        <main className="page-content">
          <Suspense fallback={<div className="page-loading">Memuat...</div>}>
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'psb' && <PSBPage
            openWlPicker={openWlPicker}
            selectedWlEntry={selectedWlEntry}
            setSelectedWlEntry={setSelectedWlEntry}
            newUser={newUser}
            setNewUser={setNewUser}
            formWarnings={formWarnings}
            setFormWarnings={setFormWarnings}
            wizardStep={wizardStep}
            setWizardStep={setWizardStep}
            handleCreateUser={handleCreateUser}
            validateStep1={validateStep1}
            psbSubmitting={psbSubmitting}
            ktpPhoto={ktpPhoto}
            setKtpPhoto={setKtpPhoto}
            handleKtpSelect={handleKtpSelect}
            wilayahData={wilayahData}
            selWilayah={selWilayah}
            setSelWilayah={setSelWilayah}
            handleSelWilayah={handleSelWilayah}
            territories={territories}
            profiles={profiles}
            formatSpeed={formatSpeed}
            mtConfigs={mtConfigs}
            waitingList={waitingList}
            psbAddons={psbAddons}
            setPsbAddons={setPsbAddons}
            authHeader={authHeader}
          />}
          {activeTab === 'pelanggan' && renderPelanggan()}
          {activeTab === 'paket' && renderPaket()}
          {activeTab === 'billing' && renderBilling()}
          {activeTab === 'finances' && renderFinances()}
          {activeTab === 'laporan_psb' && renderLaporanPsb()}
          {activeTab === 'ippool' && renderIPPool()}
          {activeTab === 'system_users' && renderSystemUsers()}
          {activeTab === 'waiting_list' && renderWaitingList()}
          {activeTab === 'territories' && renderTerritories()}
          {activeTab === 'addon_types' && (
            <AddonTypesPage authHeader={authHeader} showToast={showToast} requestConfirm={requestConfirm} />
          )}
          {activeTab === 'settings_billing' && renderSettingsBilling()}
          {activeTab === 'settings_mikrotik' && renderSettingsMikrotik()}
          {activeTab === 'log' && renderLog()}
          {activeTab === 'mapping' && (
            <MappingView users={users} onlineUsers={onlineUsers} onViewUser={u => { setViewingUser(u); setShowUserDetailModal(true) }} />
          )}
          {activeTab === 'collector_isolir' && renderCollectorIsolir()}
          {activeTab === 'collector_ont' && renderCollectorOnt()}
          {activeTab === 'collector_proofs' && renderCollectorProofs()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'collector_settlements' && renderCollectorSettlements()}
          {activeTab === 'admin_ont_tasks' && renderAdminOntTasks()}
          {activeTab === 'tenants' && currentUser?.is_super_admin && <TenantManagementPage />}
          {/* Super Admin native mode pages */}
          {activeTab === 'sa_dashboard' && currentUser?.is_super_admin && !activeTenantId && <SuperAdminDashboard />}
          {activeTab === 'sa_mitra' && currentUser?.is_super_admin && !activeTenantId && <TenantManagementPage statusFilter={samitraFilter} />}
          {activeTab === 'sa_platform' && currentUser?.is_super_admin && !activeTenantId && <SuperAdminPlatformPage authHeader={authHeader} showToast={showToast} />}
          {activeTab === 'panduan' && renderPanduan()}
          </Suspense>
        </main>
      </div>

      {/* --- MODALS --- */}

      {/* Payment Method Modal */}
      {/* Modal Full-view Foto KTP */}
      {ktpPhotoView && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setKtpPhotoView(null) }} style={{ zIndex: 200000 }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <img src={ktpPhotoView} alt="Foto KTP" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', objectFit: 'contain' }} />
            <button onClick={() => setKtpPhotoView(null)} style={{ position: 'absolute', top: '-12px', right: '-12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>✕</button>
          </div>
        </div>
      )}

      {/* Modal Diskon Invoice */}
      {showDiscountModal && discountTarget && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowDiscountModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🏷️</span> Berikan Diskon
              </h2>
              <button className="icon-btn" onClick={() => setShowDiscountModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1.25rem 0' }}>
              {/* Info invoice */}
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Invoice yang akan didiskon:</div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{discountTarget.fullname || discountTarget.username}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Periode {discountTarget.period} · <span style={{ fontWeight: '700', color: '#d97706' }}>Rp {Number(discountTarget.amount).toLocaleString('id-ID')}</span></div>
              </div>
              {/* Warning */}
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#ef4444' }}>
                ⚠️ Invoice ini akan ditandai <strong>LUNAS dengan diskon penuh</strong>. Nominal <strong>Rp {Number(discountTarget.amount).toLocaleString('id-ID')}</strong> tidak akan dihitung dalam omzet.
              </div>
              {/* Alasan */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: '600' }}>Alasan Diskon <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(opsional)</span></label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Contoh: Pelanggan nunggak 3 bulan, bayar 1 bulan..."
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitDiscount() }}
                  autoFocus />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDiscountModal(false)}>Batal</button>
              <button className="btn" style={{ flex: 1, background: '#d97706', color: '#fff', border: 'none' }} onClick={submitDiscount}>
                Konfirmasi Diskon
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && paymentTarget && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowPaymentModal(false); setTransferProofFile(null); setTransferProofPreview(null) }}>
          <div className="modal-content" style={{ maxWidth: '440px', animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Konfirmasi Pembayaran</h2>
              <button className="icon-btn" onClick={() => { setShowPaymentModal(false); setTransferProofFile(null); setTransferProofPreview(null) }}><X size={24} /></button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="modal-body" style={{ padding: '1.5rem 0' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Tandai invoice untuk <strong style={{ color: 'var(--text-main)' }}>{paymentTarget.username}</strong> sebagai <strong style={{ color: '#16a34a' }}>LUNAS</strong>.
                </p>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Periode</div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{monthLabel(paymentTarget.period)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Total Tagihan</div>
                    <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#16a34a' }}>Rp {Number(paymentTarget.amount || 0).toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Metode Pembayaran:</p>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                  <label style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
                    padding: '1rem', borderRadius: '12px', cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'cash' ? '#22c55e' : 'var(--border-color)'}`,
                    background: paymentMethod === 'cash' ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-hover)',
                    transition: 'all 0.15s ease'
                  }}>
                    <input type="radio" name="paymentMethod" value="cash" style={{ display: 'none' }} checked={paymentMethod === 'cash'} onChange={() => { setPaymentMethod('cash'); setTransferProofFile(null); setTransferProofPreview(null) }} />
                    <BadgeCent size={32} style={{ color: paymentMethod === 'cash' ? '#22c55e' : 'var(--text-muted)' }} />
                    <span style={{ fontWeight: '600', fontSize: '0.875rem', color: paymentMethod === 'cash' ? '#22c55e' : 'var(--text-main)' }}>Cash / Tunai</span>
                  </label>
                  <label style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
                    padding: '1rem', borderRadius: '12px', cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'transfer' ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    background: paymentMethod === 'transfer' ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-hover)',
                    transition: 'all 0.15s ease'
                  }}>
                    <input type="radio" name="paymentMethod" value="transfer" style={{ display: 'none' }} checked={paymentMethod === 'transfer'} onChange={() => setPaymentMethod('transfer')} />
                    <Smartphone size={32} style={{ color: paymentMethod === 'transfer' ? 'var(--accent-color)' : 'var(--text-muted)' }} />
                    <span style={{ fontWeight: '600', fontSize: '0.875rem', color: paymentMethod === 'transfer' ? 'var(--accent-color)' : 'var(--text-main)' }}>Transfer Bank</span>
                  </label>
                </div>

                {/* Upload bukti transfer */}
                {paymentMethod === 'transfer' && (
                  <div style={{ marginTop: '0.25rem' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Bukti Transfer {currentUser?.role !== 'admin' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Opsional)</span>}
                    </p>
                    {transferProofPreview ? (
                      <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '2px solid var(--accent-color)' }}>
                        <img src={transferProofPreview} alt="Bukti Transfer" style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block', background: 'var(--bg-secondary)' }} />
                        <button type="button" onClick={() => { setTransferProofFile(null); setTransferProofPreview(null) }}
                          style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                          ✕
                        </button>
                        <div style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
                          {transferProofFile?.name}
                        </div>
                      </div>
                    ) : (
                      <label style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                        padding: '1.5rem', borderRadius: '10px', cursor: 'pointer',
                        border: '2px dashed var(--border-color)', background: 'var(--bg-secondary)',
                        transition: 'border-color 0.15s'
                      }}>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTransferProofSelect} />
                        <Download size={28} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Klik untuk upload foto bukti transfer</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>JPG, PNG, maksimal 5MB</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: '600' }} onClick={() => { setShowPaymentModal(false); setTransferProofFile(null); setTransferProofPreview(null) }}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: '600', minWidth: '160px' }}
                  disabled={paymentMethod === 'transfer' && !transferProofPreview && currentUser?.role !== 'admin'}>
                  <CheckCircle size={16} /> Konfirmasi Lunas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat Task Cabut ONT */}
      {showOntTaskModal && ontTaskTarget && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) setShowOntTaskModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Unplug size={20} style={{ color: '#ef4444' }} /> Buat Task Cabut ONT
              </h2>
              <button className="icon-btn" onClick={() => setShowOntTaskModal(false)}><X size={20} /></button>
            </div>
            {/* Info pelanggan */}
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{ontTaskTarget.fullname || ontTaskTarget.username}</div>
              {ontTaskTarget.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{ontTaskTarget.address}</div>}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {ontTaskTarget.territory_name || 'Umum'} · ID: {ontTaskTarget.customer_id || ontTaskTarget.username}
              </div>
            </div>
            {/* Pilih teknisi */}
            <div className="form-group">
              <label style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.5rem', display: 'block' }}>Assign ke Teknisi</label>
              {technicianList.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Memuat daftar teknisi...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {technicianList.map(t => {
                    const checked = ontTaskTechUsername === t.username
                    return (
                      <label key={t.username} onClick={() => setOntTaskTechUsername(t.username)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 0.85rem',
                        borderRadius: '10px', cursor: 'pointer',
                        background: checked ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)',
                        border: checked ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-color)',
                      }}>
                        <input type="radio" checked={checked} onChange={() => {}} style={{ accentColor: '#ef4444', width: '15px', height: '15px', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{t.fullname || t.username}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{t.username}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Catatan */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.5rem', display: 'block' }}>
                Catatan <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(opsional)</span>
              </label>
              <textarea className="search-input" rows={2}
                style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical' }}
                placeholder="Contoh: ONT di lantai 2, minta foto setelah dicabut..."
                value={ontTaskNotes}
                onChange={e => setOntTaskNotes(e.target.value)}
              />
            </div>
            {ontTaskTechUsername && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem', color: '#16a34a' }}>
                🔔 Teknisi akan mendapat notifikasi task cabut ONT ini.
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '1.25rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowOntTaskModal(false)}>Batal</button>
              <button className="btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={submitOntTask} disabled={ontTaskLoading || !ontTaskTechUsername}>
                {ontTaskLoading ? 'Menyimpan...' : 'Buat Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selesaikan Task Cabut ONT (Teknisi) */}
      {showOntCompleteModal && ontCompleteTarget && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) setShowOntCompleteModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={20} style={{ color: '#10b981' }} /> Tandai Selesai
              </h2>
              <button className="icon-btn" onClick={() => setShowOntCompleteModal(false)}><X size={20} /></button>
            </div>
            <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{ontCompleteTarget.fullname}</div>
              {ontCompleteTarget.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{ontCompleteTarget.address}</div>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.5rem', display: 'block' }}>
                Catatan <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(opsional)</span>
              </label>
              <textarea className="search-input" rows={3}
                style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical' }}
                placeholder="Kondisi perangkat, catatan tambahan..."
                value={ontCompleteNotes}
                onChange={e => setOntCompleteNotes(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '1.25rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowOntCompleteModal(false)}>Batal</button>
              <button className="btn" style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none' }}
                onClick={submitOntComplete} disabled={ontCompleteLoading}>
                {ontCompleteLoading ? 'Menyimpan...' : '✓ Konfirmasi Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cabut ONT */}
      {showCabutModal && cabutTarget && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowCabutModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px', animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Unplug size={18} style={{ color: '#ef4444' }} /> Cabut ONT / Router
              </h2>
              <button className="icon-btn" onClick={() => setShowCabutModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontWeight: '700' }}>{cabutTarget.fullname || cabutTarget.username}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {cabutTarget.customer_id} · {cabutTarget.address || '—'}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: '600' }}>Catatan <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opsional)</span></label>
                <textarea
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem', minHeight: '80px', resize: 'vertical', paddingTop: '0.6rem' }}
                  placeholder="Contoh: ONT rusak, kabel putus, pelanggan pindah..."
                  value={cabutNotes}
                  onChange={e => setCabutNotes(e.target.value)}
                />
              </div>
              <p style={{ fontSize: '0.78rem', color: '#f59e0b', margin: 0, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                Pencabutan akan dicatat dan admin akan mendapat notifikasi.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCabutModal(false)} disabled={cabutLoading}>Batal</button>
              <button className="btn" style={{ flex: 2, background: '#ef4444', color: '#fff', border: 'none', gap: '6px' }} onClick={submitCabut} disabled={cabutLoading}>
                <Unplug size={15} /> {cabutLoading ? 'Menyimpan...' : 'Konfirmasi Dicabut'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Struk Pembayaran */}
      {receiptModal && (
        <ReceiptModal
          invoice={receiptModal}
          companyName={billingSettings?.company_name}
          companyLogo={billingSettings?.company_logo}
          companyAddress={billingSettings?.company_address}
          companyPhone={billingSettings?.company_phone}
          onClose={() => setReceiptModal(null)}
        />
      )}

      {/* ── PWA Install Banner ── */}
      {showPwaBanner && !pwaInstalled && (
        <div style={{
          position: 'fixed',
          bottom: ['technician','collector'].includes(currentUser?.role) ? '76px' : '16px',
          left: '1rem', right: '1rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '0.875rem 1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 200000,
          animation: 'slideUpSheet 0.35s cubic-bezier(0.34,1.1,0.64,1) forwards'
        }}>
          {/* Baris atas: ikon + judul + tombol tutup */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
            <div style={{ fontSize: '1.75rem', flexShrink: 0, lineHeight: 1 }}>
              {portalRole === 'technician' ? '🔧' : '💰'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', lineHeight: 1.2 }}>
                Pasang sebagai Aplikasi
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                Akses langsung dari homescreen tanpa buka browser
              </div>
            </div>
            <button
              onClick={() => { setShowPwaBanner(false); localStorage.setItem('pwa_banner_dismissed', '1') }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '4px', flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
          {/* Baris bawah: dua tombol full width */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handlePwaInstall}
              style={{
                flex: 1, background: portalRole === 'technician' ? '#1d4ed8' : '#15803d',
                color: '#fff', border: 'none', borderRadius: '10px',
                padding: '0.6rem', fontWeight: '700', fontSize: '0.85rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              📲 Install Sekarang
            </button>
            <button
              onClick={() => { setShowPwaBanner(false); localStorage.setItem('pwa_banner_dismissed', '1') }}
              style={{
                flex: 0, background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                border: '1px solid var(--border-color)', borderRadius: '10px',
                padding: '0.6rem 1rem', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              Nanti
            </button>
          </div>
        </div>
      )}

      {/* Modal Edit Metode Pembayaran (Admin Only) */}
      {editPayMethodModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setEditPayMethodModal(null)}>
          <div className="modal-content" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Metode Pembayaran</h3>
              <button className="modal-close" onClick={() => setEditPayMethodModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Invoice <strong>{editPayMethodModal.username}</strong> — periode <strong>{editPayMethodModal.period}</strong>
              </div>
              <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Metode Pembayaran</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { value: 'cash', label: '💵 Cash' },
                  { value: 'transfer', label: '🏦 Transfer' },
                  { value: 'online', label: '🌐 Online' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditPayMethodValue(opt.value)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                      border: editPayMethodValue === opt.value ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
                      background: editPayMethodValue === opt.value ? 'rgba(99,102,241,0.1)' : 'var(--bg-surface)',
                      color: editPayMethodValue === opt.value ? 'var(--accent-primary)' : 'var(--text-main)',
                      transition: 'all 0.15s',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '1rem 1.5rem' }}>
              <button className="btn btn-outline" onClick={() => setEditPayMethodModal(null)}>Batal</button>
              <button
                className="btn btn-primary"
                disabled={editPayMethodLoading || editPayMethodValue === editPayMethodModal.current}
                onClick={handleEditPaymentMethod}
              >
                {editPayMethodLoading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pay Modal */}
      {showBulkPayModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowBulkPayModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '460px', animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">⚡ Bayar Massal</h2>
              <button className="icon-btn" onClick={() => setShowBulkPayModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Ringkasan */}
              <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.07)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '4px' }}>
                  {selectedInvoiceIds.length} invoice akan dilunasi
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Total: <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>
                    Rp {invoices.filter(i => selectedInvoiceIds.includes(i.id)).reduce((s, i) => s + Number(i.amount), 0).toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>

              {/* Metode Pembayaran */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: '600' }}>Metode Pembayaran</label>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {[['cash', '💵 Cash'], ['transfer', '🏦 Transfer']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        flex: 1, padding: '0.65rem', borderRadius: '8px', border: '2px solid',
                        borderColor: bulkPayMethod === val ? 'var(--primary-color)' : 'var(--border-color)',
                        background: bulkPayMethod === val ? 'rgba(99,102,241,0.1)' : 'var(--bg-surface)',
                        color: bulkPayMethod === val ? 'var(--primary-color)' : 'var(--text-primary)',
                        fontWeight: bulkPayMethod === val ? '700' : '500', cursor: 'pointer', fontSize: '0.9rem'
                      }}
                      onClick={() => setBulkPayMethod(val)}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Upload Bukti Transfer (opsional untuk transfer) */}
              {bulkPayMethod === 'transfer' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                    Bukti Transfer {currentUser?.role !== 'admin' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Opsional)</span>}
                    <span style={{ fontWeight: '400', color: 'var(--text-muted)', marginLeft: '6px' }}>— satu bukti berlaku untuk semua</span>
                  </label>
                  {bulkPayProof ? (
                    <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                      <img src={bulkPayProof} alt="Bukti" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                      <button type="button" onClick={() => setBulkPayProof(null)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '0.5rem', padding: '1.5rem', border: '2px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      📁 Klik untuk upload bukti transfer
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const file = e.target.files[0]
                        if (!file) return
                        try {
                          const compressed = await compressImage(file, 1200, 0.80)
                          setBulkPayProof(compressed)
                        } catch {
                          const reader = new FileReader()
                          reader.onload = ev => setBulkPayProof(ev.target.result)
                          reader.readAsDataURL(file)
                        }
                      }} />
                    </label>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowBulkPayModal(false)} disabled={bulkPayLoading}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 2, gap: '6px' }} onClick={submitBulkPay} disabled={bulkPayLoading}>
                {bulkPayLoading ? 'Memproses...' : `✅ Lunasi ${selectedInvoiceIds.length} Invoice`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Image Modal */}
      {showProofImageModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowProofImageModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Bukti Transfer</h3>
              <button onClick={() => setShowProofImageModal(false)} className="modal-close-btn">✕</button>
            </div>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              {proofImageLoading ? (
                <div style={{ padding: '4rem', color: 'var(--text-muted)' }}>Memuat gambar...</div>
              ) : proofImageData ? (
                <img src={proofImageData} alt="Bukti Transfer" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#ef4444' }}>Gagal memuat gambar.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collector Transfer Proof Modal */}
      {showCollectorProofModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowCollectorProofModal(false) }} style={{ zIndex: 200000 }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Bukti Transfer Collector</h3>
              <button onClick={() => setShowCollectorProofModal(false)} className="modal-close-btn">✕</button>
            </div>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              {collectorProofLoading ? (
                <div style={{ padding: '4rem', color: 'var(--text-muted)' }}>Memuat gambar...</div>
              ) : collectorProofData ? (
                <img src={collectorProofData} alt="Bukti Transfer Collector" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <div style={{ padding: '4rem', color: '#ef4444' }}>Tidak ada bukti transfer untuk invoice ini.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Proof Reason Modal */}
      {showRejectModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowRejectModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Alasan Penolakan</h3>
              <button onClick={() => setShowRejectModal(false)} className="modal-close-btn">✕</button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Masukkan alasan penolakan bukti transfer (akan dikirim ke pelanggan).</p>
              <div className="form-group">
                <label>Alasan</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Misal: Foto tidak jelas / nominal tidak sesuai" />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowRejectModal(false)}>Batal</button>
                <button className="btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
                  disabled={proofVerifyLoading || !rejectReason.trim()}
                  onClick={() => handleVerifyProof(rejectingProofId, 'reject', rejectReason)}>
                  {proofVerifyLoading ? 'Menyimpan...' : '✕ Tolak Bukti'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Gateway Modal */}
      {showPGModal && pgInvoice && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowPGModal(false); setPaymentResult(null); }}>
          <div className="modal-content" style={{ maxWidth: '480px', animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title"><CreditCard size={20} style={{ marginRight: 8 }} />Bayar Online</h2>
              <button className="icon-btn" onClick={() => { setShowPGModal(false); setPaymentResult(null); }}><X size={24} /></button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem 0' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Invoice #{pgInvoice.id?.toString().padStart(5, '0')}</div>
                <div style={{ fontWeight: '700', fontSize: '1.25rem', color: 'var(--primary-color)' }}>Rp {Number(pgInvoice.amount).toLocaleString()}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{pgInvoice.fullname || pgInvoice.username} • Periode {pgInvoice.period}</div>
              </div>

              {paymentResult ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '1rem' }} />
                  <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Link Pembayaran Siap!</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    Gateway: <strong>{paymentResult.gateway?.toUpperCase()}</strong> • Order: <code>{paymentResult.order_id}</code>
                  </div>
                  <a href={paymentResult.payment_url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-primary" style={{ display: 'block', textAlign: 'center', marginBottom: '0.75rem', textDecoration: 'none' }}>
                    Buka Halaman Pembayaran
                  </a>
                  <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => {
                    navigator.clipboard.writeText(paymentResult.payment_url);
                    showToast('Link disalin ke clipboard', 'success');
                  }}>Salin Link</button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '1rem' }}>Pilih Gateway Pembayaran:</p>
                  {(() => {
                    const allGateways = [
                      { key: 'duitku', label: 'Duitku', color: '#0066cc', desc: 'QRIS, VA, E-Wallet', activeKey: 'pg_duitku_active' },
                      { key: 'tripay', label: 'Tripay', color: '#e02020', desc: 'QRIS, VA, Alfamart', activeKey: 'pg_tripay_active' },
                      { key: 'xendit', label: 'Xendit', color: '#003087', desc: 'VA, OVO, DANA', activeKey: 'pg_xendit_active' },
                      { key: 'midtrans', label: 'Midtrans', color: '#27ae60', desc: 'GoPay, OVO, VA', activeKey: 'pg_midtrans_active' }
                    ]
                    const activeGateways = allGateways.filter(gw => paymentGatewayConfig[gw.activeKey] === '1')
                    if (activeGateways.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          <CreditCard size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                          <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Belum ada gateway aktif</div>
                          <div style={{ fontSize: '0.8rem' }}>Aktifkan gateway di <strong>Pengaturan → Payment Gateway</strong></div>
                        </div>
                      )
                    }
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: activeGateways.length === 1 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                          {activeGateways.map(gw => (
                            <button key={gw.key}
                              disabled={paymentLoading}
                              onClick={() => handleCreatePayment(gw.key)}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                padding: '1.25rem 1rem', borderRadius: '12px', border: `2px solid ${gw.color}`,
                                background: `${gw.color}15`, cursor: paymentLoading ? 'wait' : 'pointer',
                                opacity: paymentLoading ? 0.7 : 1, transition: 'transform 0.1s'
                              }}>
                              <span style={{ fontWeight: '800', color: gw.color, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>{gw.label}</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{gw.desc}</span>
                            </button>
                          ))}
                        </div>
                        {paymentLoading && (
                          <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            Membuat link pembayaran...
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Gateway Settings Modal */}
      {showPGSettingsModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowPGSettingsModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
              <h2 className="modal-title"><CreditCard size={20} style={{ marginRight: 8 }} />Konfigurasi Payment Gateway</h2>
              <button className="icon-btn" onClick={() => setShowPGSettingsModal(false)}><X size={24} /></button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem 0' }}>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontWeight: '600' }}>Base URL Aplikasi</label>
                <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="https://billing.pmynet.id"
                  value={pgSettings.pg_app_base_url || ''}
                  onChange={e => setPgSettings({ ...pgSettings, pg_app_base_url: e.target.value })} />
                <small style={{ color: 'var(--text-muted)' }}>Isi dengan domain saja, tanpa path. Contoh: <code>https://billing.pmynet.id</code></small>
              </div>

              {/* Helper: toggle switch style */}
              {[{
                key: 'duitku', label: 'Duitku', color: '#0066cc', activeKey: 'pg_duitku_active',
                fields: [
                  { label: 'Merchant Code', key: 'pg_duitku_merchant_code', type: 'text' },
                  { label: 'API Key', key: 'pg_duitku_api_key', type: 'password' }
                ],
                sandbox: { key: 'pg_duitku_sandbox', label: 'Mode Sandbox (Testing)' }
              }, {
                key: 'tripay', label: 'Tripay', color: '#e02020', activeKey: 'pg_tripay_active',
                fields: [
                  { label: 'Merchant Code', key: 'pg_tripay_merchant_code', type: 'text' },
                  { label: 'API Key', key: 'pg_tripay_api_key', type: 'password' },
                  { label: 'Private Key', key: 'pg_tripay_private_key', type: 'password', full: true }
                ],
                sandbox: { key: 'pg_tripay_sandbox', label: 'Mode Sandbox (Testing)' }
              }, {
                key: 'xendit', label: 'Xendit', color: '#003087', activeKey: 'pg_xendit_active',
                fields: [
                  { label: 'Secret API Key', key: 'pg_xendit_api_key', type: 'password' },
                  { label: 'Webhook Token', key: 'pg_xendit_webhook_token', type: 'password' }
                ]
              }, {
                key: 'midtrans', label: 'Midtrans', color: '#27ae60', activeKey: 'pg_midtrans_active',
                fields: [
                  { label: 'Server Key', key: 'pg_midtrans_server_key', type: 'password' },
                  { label: 'Client Key', key: 'pg_midtrans_client_key', type: 'text' }
                ],
                sandbox: { key: 'pg_midtrans_sandbox', label: 'Mode Sandbox (Testing)', invertCheck: true }
              }].map(gw => {
                const isActive = pgSettings[gw.activeKey] === '1'
                return (
                  <div key={gw.key} className="card" style={{
                    padding: '1.25rem', marginBottom: '1rem',
                    borderLeft: `4px solid ${isActive ? gw.color : 'var(--border-color)'}`,
                    opacity: isActive ? 1 : 0.75, transition: 'all 0.2s'
                  }}>
                    {/* Header with toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isActive ? '1rem' : 0 }}>
                      <span style={{ fontWeight: '700', color: isActive ? gw.color : 'var(--text-muted)', fontSize: '1rem' }}>{gw.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: isActive ? gw.color : 'var(--text-muted)', fontWeight: '600' }}>
                          {isActive ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                        <div
                          onClick={() => setPgSettings({ ...pgSettings, [gw.activeKey]: isActive ? '0' : '1' })}
                          style={{
                            width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
                            background: isActive ? gw.color : 'var(--border-color)',
                            position: 'relative', transition: 'background 0.2s'
                          }}>
                          <div style={{
                            position: 'absolute', top: '3px',
                            left: isActive ? '23px' : '3px',
                            width: '18px', height: '18px', borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                          }} />
                        </div>
                      </div>
                    </div>
                    {/* Fields — only show when active */}
                    {isActive && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          {gw.fields.map(f => (
                            <div key={f.key} className="form-group" style={f.full ? { gridColumn: '1 / -1' } : {}}>
                              <label style={{ fontSize: '0.813rem' }}>{f.label}</label>
                              <input type={f.type} className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                                value={pgSettings[f.key] || ''}
                                onChange={e => setPgSettings({ ...pgSettings, [f.key]: e.target.value })} />
                            </div>
                          ))}
                        </div>
                        {gw.sandbox && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.75rem' }}>
                            <input type="checkbox"
                              checked={gw.sandbox.invertCheck ? pgSettings[gw.sandbox.key] !== '0' : pgSettings[gw.sandbox.key] === '1'}
                              onChange={e => setPgSettings({ ...pgSettings, [gw.sandbox.key]: e.target.checked ? '1' : '0' })} />
                            {gw.sandbox.label}
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )
              })}

              {/* Rekening Transfer Manual */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={16} /> Rekening Transfer Manual
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Ditampilkan ke pelanggan saat upload bukti transfer di portal.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Nama Bank (Rekening 1)</label>
                    <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Mandiri"
                      value={pgSettings.transfer_bank_name || ''}
                      onChange={e => setPgSettings({ ...pgSettings, transfer_bank_name: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Nomor Rekening</label>
                    <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="1730031910152"
                      value={pgSettings.transfer_account_number || ''}
                      onChange={e => setPgSettings({ ...pgSettings, transfer_account_number: e.target.value })} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.8rem' }}>Nama Pemilik Rekening</label>
                  <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="SAKTI WIJAYA NETWORK"
                    value={pgSettings.transfer_account_name || ''}
                    onChange={e => setPgSettings({ ...pgSettings, transfer_account_name: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Nama Bank (Rekening 2 — opsional)</label>
                    <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="BCA"
                      value={pgSettings.transfer_bank_2_name || ''}
                      onChange={e => setPgSettings({ ...pgSettings, transfer_bank_2_name: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Nomor Rekening 2</label>
                    <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="0123456789"
                      value={pgSettings.transfer_bank_2_number || ''}
                      onChange={e => setPgSettings({ ...pgSettings, transfer_bank_2_number: e.target.value })} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.8rem' }}>Nama Pemilik Rekening 2</label>
                  <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Nama Pemilik"
                    value={pgSettings.transfer_bank_2_account || ''}
                    onChange={e => setPgSettings({ ...pgSettings, transfer_bank_2_account: e.target.value })} />
                </div>
              </div>

              {(() => {
                let base = pgSettings.pg_app_base_url || 'https://billing.pmynet.id'
                try { base = new URL(base).origin } catch (_) { base = base.replace(/\/api\/.*$/, '').replace(/\/$/, '') }
                const webhookUrl = `${base}/api/payment-gateway/webhook`
                return (
                  <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    <strong>Webhook URL:</strong> <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>
                      {webhookUrl}
                    </code>
                    <br />Daftarkan URL ini di dashboard setiap payment gateway.
                  </div>
                )
              })()}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowPGSettingsModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSavePGSettings}><CheckCircle size={16} /> Simpan Konfigurasi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Dropdown — rendered at root to escape table overflow/stacking ── */}
      {openActionMenu && (() => {
        const au = users.find(u => u.username === openActionMenu)
        if (!au) return null
        return (
          <div
            className="action-dropdown"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: actionMenuOpenUp ? 'auto' : actionMenuPos.top,
              bottom: actionMenuOpenUp ? (window.innerHeight - actionMenuPos.top) : 'auto',
              right: actionMenuPos.right,
              zIndex: 99999
            }}
          >
            {au.status !== 'berhenti' && (
              au.is_suspended ? (
                <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); handleActivateUser(au.username); }}>
                  <UserX size={14} style={{ color: '#10b981' }} /> Buka Isolir
                </button>
              ) : (
                <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); handleSuspendUser(au.username); }}>
                  <UserCheck size={14} style={{ color: '#f59e0b' }} /> Isolir
                </button>
              )
            )}
            <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); openSetPin(au); }}>
              <KeyRound size={14} style={{ color: '#8b5cf6' }} /> Set PIN Portal
            </button>
            {!!au.is_suspended && au.status !== 'berhenti' && (
              <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); openOntTaskModal(au); }}>
                <Unplug size={14} style={{ color: '#ef4444' }} /> Buat Task Cabut ONT
              </button>
            )}
            {au.status !== 'berhenti' && (
              activePromises[au.username] ? (
                <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); handleCancelPromise(au.username); }}>
                  <CalendarX size={14} style={{ color: '#f59e0b' }} /> Batalkan Janji
                </button>
              ) : (
                <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); openPromise(au); }}>
                  <CalendarCheck size={14} style={{ color: '#10b981' }} /> Janji Bayar
                </button>
              )
            )}
            <div className="action-dropdown-divider" />
            {au.status === 'berhenti' ? (
              <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); handleReactivateUser(au.username); }}>
                <UserCheck size={14} style={{ color: '#10b981' }} /> Aktifkan Kembali
              </button>
            ) : (
              <button className="action-dropdown-item danger" onClick={() => { setOpenActionMenu(null); handleStopUser(au.username, au.fullname); }}>
                <UserX size={14} /> Set Berhenti
              </button>
            )}
            <button className="action-dropdown-item danger" onClick={() => { setOpenActionMenu(null); handleDeleteUser(au.username); }}>
              <Trash2 size={14} /> Hapus Permanen
            </button>
            <div className="action-dropdown-divider" />
            <button className="action-dropdown-item" onClick={() => { setOpenActionMenu(null); handleSyncSecret(au.username); }}>
              🔁 Sinkron Secret
            </button>
          </div>
        )
      })()}

      {isStaffModalOpen && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setIsStaffModalOpen(false) }}>
          <div className="modal-content" style={{ maxWidth: '500px', animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{currentStaff ? 'Edit Informasi Staff' : 'Tambah Staff Baru'}</h2>
              <button className="icon-btn" onClick={() => setIsStaffModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const url = currentStaff ? `/api/system/users/${currentStaff.id}` : '/api/system/users';
                const method = currentStaff ? 'PUT' : 'POST';
                const res = await fetch(url, {
                  method,
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                  },
                  body: JSON.stringify(staffForm)
                });
                if (res.ok) {
                  showToast(`Berhasil ${currentStaff ? 'update' : 'tambah'} staff`, 'success');
                  setIsStaffModalOpen(false);
                  fetchData(true);
                } else {
                  const err = await res.json();
                  showToast(err.error || 'Gagal menyimpan data', 'error');
                }
              } catch (e) { showToast('Terjadi kesalahan koneksi', 'error'); }
            }}>
              <div className="modal-body" style={{ padding: '1.5rem 0' }}>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Nama Lengkap Staff</label>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem' }}
                    value={staffForm.fullname}
                    onChange={e => setStaffForm({ ...staffForm, fullname: e.target.value })}
                    required
                    placeholder="Ex: Budi Setiawan"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Username Login</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="search-input"
                      style={{ width: '100%', paddingLeft: '1rem', paddingRight: tenantKode ? `calc(${currentUser.tenant_kode.length + 1}ch + 1.5rem)` : '1rem', fontFamily: 'monospace' }}
                      value={staffForm.username}
                      onChange={e => setStaffForm({ ...staffForm, username: e.target.value.replace(/\s|@/g, '') })}
                      required
                      disabled={!!currentStaff}
                      placeholder="cth: budi_teknisi"
                    />
                    {tenantKode && (
                      <span style={{ position: 'absolute', right: '0.875rem', color: 'var(--primary-color)', fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: '600', pointerEvents: 'none', userSelect: 'none' }}>
                        @{currentUser.tenant_kode}
                      </span>
                    )}
                  </div>
                  {tenantKode && !currentStaff && (
                    <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Staff login dengan: <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-primary)' }}>{staffForm.username || 'username'}@{currentUser.tenant_kode}</code>
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Hak Akses (Role)</label>
                  <select
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem', appearance: 'auto' }}
                    value={staffForm.role}
                    onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}
                  >
                    <option value="technician">Technician / Teknisi</option>
                    <option value="collector">Collector / Penagih</option>
                    <option value="noc">NOC (Network Operation Center)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    {currentStaff ? 'Reset Password (Kosongkan jika tidak diubah)' : 'Password Awal'}
                  </label>
                  <input
                    type="password"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem' }}
                    value={staffForm.password || ''}
                    onChange={e => setStaffForm({ ...staffForm, password: e.target.value, new_password: e.target.value })}
                    required={!currentStaff}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: '600' }} onClick={() => setIsStaffModalOpen(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: '600', minWidth: '160px' }}>Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Registrasi Pelanggan Baru</h2>
              <button className="icon-btn" onClick={() => { setShowAddUserModal(false); setWizardStep(1); }}><X size={24} /></button>
            </div>

            {/* Wizard Steps Indicator */}
            <div className="wizard-steps">
              <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''}`}>
                <div className="step-number">1</div>
                <div className="step-label">Data Pelanggan</div>
              </div>
              <div className="step-line"></div>
              <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''}`}>
                <div className="step-number">2</div>
                <div className="step-label">Data Pembayaran</div>
              </div>
              <div className="step-line"></div>
              <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''}`}>
                <div className="step-number">3</div>
                <div className="step-label">Data Secret</div>
              </div>
              <div className="step-line"></div>
              <div className={`wizard-step ${wizardStep >= 4 ? 'active' : ''}`}>
                <div className="step-number">4</div>
                <div className="step-label">Review</div>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault()
              if (wizardStep === 4) { handleCreateUser(e) }
              else if (wizardStep === 1) { if (validateStep1()) setWizardStep(2) }
              else { setWizardStep(wizardStep + 1) }
            }}>

              {/* Step 1: Data Pelanggan */}
              {wizardStep === 1 && (
                <div className="animate-fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

                    {/* Nama */}
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Nama Lengkap Pelanggan{currentUser?.role === 'technician' && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.fullname} onChange={e => setNewUser({ ...newUser, fullname: e.target.value })} placeholder="Masukkan nama sesuai KTP" required />
                    </div>

                    {/* No HP & NIK */}
                    <div className="form-group">
                      <label>No HP / WhatsApp (62xxx){currentUser?.role === 'technician' && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</label>
                      <input type="tel" inputMode="numeric" className="search-input" style={{ width: '100%', paddingLeft: '1rem', borderColor: formWarnings.phone ? '#f59e0b' : '' }} value={newUser.phone} onChange={e => { let v = e.target.value.replace(/\D/g, ''); if (v.startsWith('0') && v.length > 1) v = '62' + v.slice(1); setNewUser({ ...newUser, phone: v }); setFormWarnings(w => ({ ...w, phone: '' })) }} placeholder="628123456789" />
                      {formWarnings.phone && <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '0.3rem' }}>{formWarnings.phone}</div>}
                    </div>
                    <div className="form-group">
                      <label>No Identitas (NIK){currentUser?.role === 'technician' && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem', borderColor: formWarnings.nik ? (formWarnings.nik.startsWith('⚠️') ? '#f59e0b' : '#ef4444') : '' }} value={newUser.identity_number} onChange={e => { setNewUser({ ...newUser, identity_number: e.target.value }); setFormWarnings(w => ({ ...w, nik: '' })) }} placeholder="3201xxxxxxxxxxxx" maxLength={16} />
                      {formWarnings.nik && <div style={{ fontSize: '0.78rem', color: formWarnings.nik.startsWith('⚠️') ? '#f59e0b' : '#ef4444', marginTop: '0.3rem' }}>{formWarnings.nik}</div>}
                    </div>


                    {/* Foto KTP — Admin PSB modal */}
                    <div className="form-group">
                      <label>Foto KTP <span style={{ color: '#ef4444' }}>*</span></label>
                      {ktpPhoto ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={ktpPhoto} alt="KTP Preview" style={{ width: '100%', maxWidth: '280px', borderRadius: '8px', border: '2px solid #10b981', objectFit: 'cover', maxHeight: '140px' }} />
                          <button type="button" onClick={() => setKtpPhoto(null)} style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                          <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '4px' }}>✓ Foto siap ({Math.round(ktpPhoto.length * 0.75 / 1024)} KB)</div>
                        </div>
                      ) : (
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '1rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleKtpSelect} />
                          📷 Ambil foto / pilih gambar KTP
                        </label>
                      )}
                    </div>

                    {/* ── Alamat Pemasangan ── */}
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Alamat Pemasangan</label>
                      {/* Provinsi – Kabupaten – Kecamatan – Kelurahan */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Provinsi{currentUser?.role === 'technician' && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</small>
                          <SearchableSelect options={wilayahData.provinsi} value={selWilayah.prov}
                            onSelect={(kode, nama) => handleSelWilayah('prov', kode, nama)}
                            placeholder="Cari provinsi..." disabled={false} />
                        </div>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kabupaten / Kota</small>
                          <SearchableSelect options={wilayahData.kabupaten} value={selWilayah.kab}
                            onSelect={(kode, nama) => handleSelWilayah('kab', kode, nama)}
                            placeholder="Cari kabupaten..." disabled={!selWilayah.prov} />
                        </div>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kecamatan</small>
                          <SearchableSelect options={wilayahData.kecamatan} value={selWilayah.kec}
                            onSelect={(kode, nama) => handleSelWilayah('kec', kode, nama)}
                            placeholder="Cari kecamatan..." disabled={!selWilayah.kab} />
                        </div>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kelurahan / Desa</small>
                          <SearchableSelect options={wilayahData.kelurahan} value={selWilayah.kel}
                            onSelect={(kode, nama) => handleSelWilayah('kel', kode, nama)}
                            placeholder="Cari kelurahan..." disabled={!selWilayah.kec} />
                        </div>
                      </div>
                      {/* Dusun */}
                      <div style={{ marginBottom: '0.5rem' }}>
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Dusun / Kampung <span style={{ color: '#ef4444' }}>*</span></small>
                        {psbDusunPicker && psbDusunOptions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                            {(() => {
                              // Group options by territory untuk header
                              const groups = {}
                              psbDusunOptions.forEach(opt => {
                                const key = opt.id // territory id
                                if (!groups[key]) groups[key] = { name: opt.name, collector: opt.collector_name, opts: [] }
                                groups[key].opts.push(opt)
                              })
                              const groupKeys = Object.keys(groups)
                              const multiGroup = groupKeys.length > 1
                              return groupKeys.map(gKey => (
                                <div key={gKey}>
                                  {multiGroup && (
                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 4px', marginBottom: '3px' }}>
                                      {groups[gKey].collector ? `Kolektor: ${groups[gKey].collector}` : groups[gKey].name}
                                    </div>
                                  )}
                                  {groups[gKey].opts.map(opt => (
                                    <button
                                      key={opt.area_id}
                                      type="button"
                                      className={`btn ${psbSelectedAreaId === opt.area_id ? 'btn-primary' : 'btn-outline'}`}
                                      style={{ textAlign: 'left', justifyContent: 'flex-start', gap: '8px', padding: '0.5rem 0.85rem', width: '100%' }}
                                      onClick={() => {
                                        setPsbSelectedAreaId(opt.area_id)
                                        setSelWilayah(s => ({ ...s, dusun: opt.dusun_nama }))
                                        setNewUser(u => ({ ...u, territory_id: String(opt.territory_id || opt.id), territory_area_id: String(opt.area_id) }))
                                      }}
                                    >
                                      <MapPin size={13} />
                                      <span style={{ fontWeight: '600' }}>{opt.dusun_nama}</span>
                                      {opt.collector_name && <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 'auto' }}>— {opt.collector_name}</span>}
                                    </button>
                                  ))}
                                </div>
                              ))
                            })()}
                          </div>
                        ) : (
                          <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                            placeholder="Contoh: Cibogo, Sukamaju, Kadu..." required
                            value={selWilayah.dusun}
                            onChange={e => setSelWilayah(s => ({ ...s, dusun: e.target.value }))} />
                        )}
                      </div>
                      {/* RT & RW */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RT <span style={{ color: '#ef4444' }}>*</span></small>
                          <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                            placeholder="Contoh: 001" required
                            value={selWilayah.rt}
                            onChange={e => setSelWilayah(s => ({ ...s, rt: e.target.value }))} />
                        </div>
                        <div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RW <span style={{ color: '#ef4444' }}>*</span></small>
                          <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                            placeholder="Contoh: 005" required
                            value={selWilayah.rw}
                            onChange={e => setSelWilayah(s => ({ ...s, rw: e.target.value }))} />
                        </div>
                      </div>
                      {/* Detail Jalan */}
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                        placeholder="Detail: Jl. Merdeka No. 5 (opsional)"
                        value={selWilayah.detail}
                        onChange={e => setSelWilayah(s => ({ ...s, detail: e.target.value }))} />
                      {composeAddress(selWilayah) && (
                        <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          📍 {composeAddress(selWilayah)}
                        </div>
                      )}
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        📍 Koordinat Lokasi Pelanggan
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>— salin dari Google Maps, tempel di sini atau pilih di peta</span>
                      </label>
                      <div style={{ position: 'relative', marginBottom: '8px' }}>
                        <input
                          type="text"
                          className="search-input"
                          style={{ width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }}
                          placeholder="cth: -6.917464, 107.619123"
                          value={newUser.latitude && newUser.longitude ? `${newUser.latitude}, ${newUser.longitude}` : ''}
                          onChange={e => {
                            const raw = e.target.value
                            const match = raw.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
                            if (match) {
                              setNewUser(u => ({ ...u, latitude: match[1], longitude: match[2] }))
                            } else if (!raw.trim()) {
                              setNewUser(u => ({ ...u, latitude: null, longitude: null }))
                            }
                          }}
                        />
                        {newUser.latitude && newUser.longitude && (
                          <a href={`https://www.google.com/maps?q=${newUser.latitude},${newUser.longitude}`}
                            target="_blank" rel="noreferrer" title="Verifikasi di Google Maps"
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', textDecoration: 'none' }}>🗺️</a>
                        )}
                      </div>
                      {newUser.latitude && newUser.longitude && (
                        <div style={{ marginBottom: '6px', fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          ✓ {Number(newUser.latitude).toFixed(6)}, {Number(newUser.longitude).toFixed(6)}
                          <a href={`https://www.google.com/maps?q=${newUser.latitude},${newUser.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: '0.75rem' }}>Verifikasi di Maps →</a>
                        </div>
                      )}
                      <MapPicker
                        lat={newUser.latitude}
                        lng={newUser.longitude}
                        onChange={(lat, lng) => setNewUser(u => ({ ...u, latitude: lat, longitude: lng }))}
                      />
                    </div>

                    {/* Tanggal Pemasangan */}
                    <div className="form-group">
                      <label>Tanggal Pemasangan</label>
                      <input type="date" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                        max={new Date().toISOString().split('T')[0]}
                        value={newUser.install_date || new Date().toISOString().split('T')[0]}
                        onChange={e => setNewUser({ ...newUser, install_date: e.target.value })} />
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                        Isi tanggal lama untuk migrasi — tidak dihitung pelanggan baru
                      </small>
                    </div>

                    {/* Info kolektor — tampil kalau dusun sudah dipilih */}
                    {newUser.territory_id && !psbDusunPicker && (() => {
                      const area = collectorAreas.find(a => String(a.territory_id) === String(newUser.territory_id))
                      const collectorName = area?.collector_name || territories.find(t => String(t.id) === String(newUser.territory_id))?.collector_name
                      if (!collectorName) return null
                      return (
                        <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
                          <User size={12} />
                          <span>Kolektor: <strong>{collectorName}</strong></span>
                        </div>
                      )
                    })()}

                  </div>
                </div>
              )}

              {/* Step 2: Data Pembayaran */}
              {wizardStep === 2 && (
                <div className="animate-fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Profile / Paket <span style={{ color: '#ef4444' }}>*</span></label>
                      <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.groupname} onChange={e => setNewUser({ ...newUser, groupname: e.target.value })} required>
                        <option value="">-- Pilih Paket --</option>
                        {profiles.map(p => <option key={p.id} value={p.name}>{p.name}{p.rate_limit ? ` (${formatSpeed(p.rate_limit)})` : ''}{p.price ? ` — Rp ${Number(p.price).toLocaleString('id-ID')}` : ''}</option>)}
                      </select>
                      {newUser.groupname && (() => { const p = profiles.find(x => x.name === newUser.groupname); return p?.price ? <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600' }}>💰 Tagihan bulanan: Rp {Number(p.price).toLocaleString('id-ID')}</div> : null })()}
                    </div>
                    <div className="form-group">
                      <label>Tanggal Jatuh Tempo (1-31)</label>
                      <input type="number" min="1" max="31" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.due_date_day} onChange={e => setNewUser({ ...newUser, due_date_day: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Rp</span>
                        <input type="number" min="0" className="search-input" style={{ width: '100%', paddingLeft: '2.5rem' }} value={newUser.discount || ''} onChange={e => setNewUser({ ...newUser, discount: e.target.value })} placeholder="0" />
                      </div>
                      {newUser.discount > 0 && (() => { const p = profiles.find(x => x.name === newUser.groupname); const base = p?.price || 0; const net = Math.max(0, base - parseInt(newUser.discount || 0)); return <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--primary-color)' }}>Tagihan jadi: <strong>Rp {net.toLocaleString('id-ID')}</strong>/bln</div> })()}
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Alasan Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                      <input type="text" className="search-input" style={{ width: '100%' }} value={newUser.discount_note || ''} onChange={e => setNewUser({ ...newUser, discount_note: e.target.value })} placeholder="cth: Ketua RT, warga kurang mampu, dll" />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>💳 Tipe Tagihan</label>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {[{ val: 'prepaid', label: '💰 Prabayar', desc: 'Bayar dulu, baru aktif' }, { val: 'postpaid', label: '📋 Pascabayar', desc: 'Pakai dulu, bayar belakangan' }].map(opt => (
                          <label key={opt.val} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 1rem', borderRadius: '8px', border: `2px solid ${(newUser.billing_type || 'prepaid') === opt.val ? 'var(--primary-color)' : 'var(--border-color)'}`, background: (newUser.billing_type || 'prepaid') === opt.val ? 'rgba(37,99,235,0.06)' : 'transparent', cursor: 'pointer' }}>
                            <input type="radio" value={opt.val} checked={(newUser.billing_type || 'prepaid') === opt.val} onChange={() => setNewUser({ ...newUser, billing_type: opt.val })} style={{ display: 'none' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{opt.label}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Layanan Tambahan */}
                  <PsbAddonSelector addons={psbAddons} setAddons={setPsbAddons} authHeader={authHeader} />
                </div>
              )}

              {/* Step 3: Data Secret */}
              {wizardStep === 3 && (
                <div className="animate-fade-in">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Tipe Koneksi */}
                    <div className="form-group">
                      <label>Tipe Koneksi</label>
                      <select
                        className="search-input"
                        style={{ width: '100%' }}
                        value={newUser.connection_type || 'pppoe'}
                        onChange={e => setNewUser({ ...newUser, connection_type: e.target.value, username: '', password: '', staticIp: '', macAddress: '' })}
                      >
                        <option value="pppoe">PPPoE</option>
                        <option value="static">Static IP (ARP)</option>
                        <option value="hotspot">Static IP (Hotspot Binding)</option>
                      </select>
                    </div>

                    {/* Field kondisional berdasarkan tipe */}
                    {(newUser.connection_type || 'pppoe') === 'pppoe' ? (<>
                      <div className="form-group">
                        <label>Username PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })} placeholder="Username PPPoE (tanpa spasi)" required />
                      </div>
                      <div className="form-group">
                        <label>Password PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password PPPoE" required />
                      </div>
                      <div className="form-group">
                        <label>Static IP <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(opsional)</span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.staticIp} onChange={e => setNewUser({ ...newUser, staticIp: e.target.value })} placeholder="0.0.0.0" />
                      </div>
                    </>) : (<>
                      <div className="form-group">
                        <label>Nama Identifikasi <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })} placeholder="ID unik pelanggan (tanpa spasi)" required />
                      </div>
                      <div className="form-group">
                        <label>IP Address Static <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.staticIp} onChange={e => setNewUser({ ...newUser, staticIp: e.target.value })} placeholder="Contoh: 192.168.60.100" required />
                      </div>
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label>MAC Address <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>
                          {newUser.connection_type === 'hotspot' ? '(opsional — untuk Hotspot IP Binding)' : '(opsional — untuk ARP binding di MikroTik)'}
                        </span></label>
                        <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem', textTransform: 'uppercase' }} value={newUser.macAddress || ''} onChange={e => setNewUser({ ...newUser, macAddress: e.target.value.replace(/[^0-9a-fA-F:]/g, '').toUpperCase() })} placeholder="AA:BB:CC:DD:EE:FF" maxLength={17} />
                      </div>
                    </>)}

                    {/* Field selalu muncul */}
                    <div className="form-group">
                      <label>ODP (Reference)</label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.odp} onChange={e => setNewUser({ ...newUser, odp: e.target.value })} placeholder="Contoh: ODP-01-GRD" />
                    </div>
                    <div className="form-group">
                      <label>NAS / Router <span style={{ color: '#ef4444' }}>*</span></label>
                      <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.nas_id} onChange={e => setNewUser({ ...newUser, nas_id: e.target.value })} required>
                        <option value="">-- Pilih Router --</option>
                        {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {wizardStep === 4 && (
                <div className="animate-fade-in">
                  <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Periksa kembali semua data sebelum mendaftarkan pelanggan. Tekan <strong>Kembali</strong> jika ada yang perlu diperbaiki.
                  </div>
                  {/* Data Pelanggan */}
                  <div style={{ marginBottom: '0.75rem', padding: '0.85rem 1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#10b981', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>👤 Data Pelanggan</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Nama</span><strong>{newUser.fullname || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>No HP</span><strong>{newUser.phone || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>NIK</span><strong>{newUser.identity_number || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Tgl Pemasangan</span><strong>{newUser.install_date || new Date().toISOString().split('T')[0]}</strong></div>
                      <div style={{ gridColumn: 'span 2' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Alamat</span><strong style={{ fontSize: '0.8rem' }}>{composeAddress(selWilayah) || newUser.address || '—'}</strong></div>
                      <div style={{ gridColumn: 'span 2' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Koordinat GPS</span><strong>{newUser.latitude && newUser.longitude ? `${Number(newUser.latitude).toFixed(6)}, ${Number(newUser.longitude).toFixed(6)}` : <span style={{ color: 'var(--text-muted)' }}>Tidak diisi</span>}</strong></div>
                    </div>
                  </div>
                  {/* Data Pembayaran */}
                  <div style={{ marginBottom: '0.75rem', padding: '0.85rem 1rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💰 Data Pembayaran</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                      <div style={{ gridColumn: 'span 2' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Paket</span><strong>{newUser.groupname || '—'}{(() => { const p = profiles.find(x => x.name === newUser.groupname); const base = p?.price ? Number(p.price) : 0; const disc = parseInt(newUser.discount || 0); const net = Math.max(0, base - disc); return base ? ` — Rp ${net.toLocaleString('id-ID')}/bln${disc > 0 ? ` (diskon Rp ${disc.toLocaleString('id-ID')})` : ''}` : '' })()}</strong></div>
                      {psbAddons.length > 0 && (
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Layanan Tambahan</span>
                          <strong>{psbAddons.length} layanan tambahan dipilih</strong>
                        </div>
                      )}
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Jatuh Tempo Tgl</span><strong>{newUser.due_date_day || '—'}</strong></div>
                    </div>
                  </div>
                  {/* Data Koneksi */}
                  <div style={{ marginBottom: '0.5rem', padding: '0.85rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#d97706', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      🔌 Data Koneksi ({newUser.connection_type === 'hotspot' ? 'Hotspot Binding' : newUser.connection_type === 'static' ? 'Static IP (ARP)' : 'PPPoE'})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{(newUser.connection_type === 'static' || newUser.connection_type === 'hotspot') ? 'ID Pelanggan' : 'Username'}</span><strong>{newUser.username || '—'}</strong></div>
                      {(newUser.connection_type === 'static' || newUser.connection_type === 'hotspot')
                        ? <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>IP Address</span><strong style={{ color: '#3b82f6' }}>{newUser.staticIp || '—'}</strong></div>
                        : <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Password</span><strong>{newUser.password || '—'}</strong></div>
                      }
                      {(newUser.connection_type || 'pppoe') === 'static' && newUser.macAddress && (
                        <div style={{ gridColumn: 'span 2' }}><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>MAC Address</span><strong>{newUser.macAddress}</strong></div>
                      )}
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>NAS / Router</span><strong>{mtConfigs.find(c => String(c.id) === String(newUser.nas_id))?.name || mtConfigs.find(c => String(c.id) === String(newUser.nas_id))?.host || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>ODP</span><strong>{newUser.odp || '—'}</strong></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="wizard-action-bar">
                {wizardStep > 1 && (
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setWizardStep(wizardStep - 1)}>Kembali</button>
                )}
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddUserModal(false); setWizardStep(1); }}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={wizardStep === 4 && psbSubmitting}>
                  {wizardStep === 4 && psbSubmitting ? '⏳ Menyimpan...' : wizardStep === 4 ? 'Daftarkan Pelanggan' : 'Selanjutnya →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingGroup ? 'Edit Paket' : 'Buat Paket Baru'}</h2>
              <button className="icon-btn" onClick={() => { setShowAddGroupModal(false); setEditingGroup(null); }}><Plus size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>Nama Paket</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newGroup.groupname} onChange={e => setNewGroup({ ...newGroup, groupname: e.target.value })} disabled={!!editingGroup} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Upload (misal: 5M)</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newGroup.uploadLimit} onChange={e => setNewGroup({ ...newGroup, uploadLimit: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Download (misal: 10M)</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newGroup.downloadLimit} onChange={e => setNewGroup({ ...newGroup, downloadLimit: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label>IP Pool</label>
                <select className="search-input" style={{ width: '100%', paddingLeft: '1rem', background: 'var(--bg-surface)' }} value={newGroup.ipPool} onChange={e => setNewGroup({ ...newGroup, ipPool: e.target.value })}>
                  <option value="">-- Tanpa Pool --</option>
                  {ipPools.map(p => <option key={p.pool_name} value={p.pool_name}>{p.pool_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>MikroTik Profile (Optional)</label>
                <select className="search-input" style={{ width: '100%', paddingLeft: '1rem', background: 'var(--bg-surface)' }} value={newGroup.mikrotikProfile} onChange={e => setNewGroup({ ...newGroup, mikrotikProfile: e.target.value })}>
                  <option value="">-- Manual Radius --</option>
                  {mtProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddGroupModal(false); setEditingGroup(null); }}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>{editingGroup ? 'Update Paket' : 'Simpan Paket'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddPoolModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowAddPoolModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah IP Pool</h2>
              <button className="icon-btn" onClick={() => setShowAddPoolModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreatePool}>
              <div className="modal-body" style={{ padding: '1.5rem 0' }}>
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  Masukkan nama pool sesuai nama IP Pool di MikroTik kamu.
                </div>
                <div className="form-group">
                  <label>Nama Pool <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem', background: 'var(--bg-surface)', fontFamily: 'monospace', fontWeight: '600' }}
                    value={newPool.pool_name}
                    onChange={e => setNewPool({ ...newPool, pool_name: e.target.value })}
                    placeholder="contoh: pool-100mbps, dhcp-pelanggan"
                    required
                    autoFocus
                  />
                  <small style={{ display: 'block', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Harus sama persis dengan nama di MikroTik (case-sensitive)
                  </small>
                </div>
                <div className="form-group">
                  <label>Keterangan <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '0.8rem' }}>(opsional)</span></label>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem', background: 'var(--bg-surface)' }}
                    value={newPool.description}
                    onChange={e => setNewPool({ ...newPool, description: e.target.value })}
                    placeholder="contoh: Pool untuk paket 100 Mbps"
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddPoolModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ minWidth: '140px' }}>
                  <Plus size={16} /> Tambah Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit IP Pool Modal */}
      {showEditPoolModal && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Ubah Nama IP Pool</h2>
              <button className="icon-btn" onClick={() => setShowEditPoolModal(false)}><X size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            <form onSubmit={handleEditPoolSubmit}>
              <div className="form-group">
                <label>Nama Pool Baru</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={editPoolName} onChange={e => setEditPoolName(e.target.value)} required />
                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                  Catatan: Mengubah nama pool di sini juga akan otomatis mengubah namanya pada semua Paket Internet yang menggunakannya.
                </small>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowEditPoolModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMtModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingMt ? 'Edit Router' : 'Hubungkan MikroTik'}</h2>
              <button className="icon-btn" onClick={() => { setShowAddMtModal(false); setEditingMt(null) }}><Plus size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            <form onSubmit={handleAddMtConfig}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem 0' }}>
                <div className="form-group">
                  <label>Nama Router (Opsional)</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newMtConfig.name} onChange={e => setNewMtConfig({ ...newMtConfig, name: e.target.value })} placeholder="Misal: Router Pusat" />
                </div>
                <div className="form-group">
                  <label>IP Host / Domain</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newMtConfig.host} onChange={e => setNewMtConfig({ ...newMtConfig, host: e.target.value })} placeholder="Misal: 192.168.1.1" required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>User API</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newMtConfig.user} onChange={e => setNewMtConfig({ ...newMtConfig, user: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Pass API</label>
                  <input type="password" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newMtConfig.pass} onChange={e => setNewMtConfig({ ...newMtConfig, pass: e.target.value })} placeholder={editingMt ? 'Kosongkan jika tidak ingin mengubah' : ''} />
                </div>
              </div>
              <div className="form-group">
                <label>Port API (Default: 8728)</label>
                <input type="number" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newMtConfig.port} onChange={e => setNewMtConfig({ ...newMtConfig, port: e.target.value })} />
              </div>
              <div className="form-group">
                <label>RADIUS Shared Secret</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={newMtConfig.radiusSecret}
                  onChange={e => setNewMtConfig({ ...newMtConfig, radiusSecret: e.target.value })}
                  placeholder="Kosongkan untuk pakai default: Mynet@2026" />
                {!newMtConfig.radiusSecret.trim() && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '6px', fontSize: '0.76rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠ Secret kosong — akan menggunakan default: <b>Mynet@2026</b>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>RADIUS NAS IP <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(Opsional — isi jika WAN IP berbeda dari IP Host)</span></label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={newMtConfig.radiusNasIp}
                  onChange={e => setNewMtConfig({ ...newMtConfig, radiusNasIp: e.target.value })}
                  placeholder={`Kosongkan untuk pakai IP Host: ${newMtConfig.host || '...'}`} />
                {newMtConfig.radiusNasIp.trim() && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', fontSize: '0.76rem', color: 'var(--primary)' }}>
                    NAS terdaftar di RADIUS dengan IP: <b>{newMtConfig.radiusNasIp.trim()}</b>
                  </div>
                )}
              </div>
              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Mode Autentikasi {!editingMt && <span style={{ color: '#ef4444' }}>*</span>}</label>
                <select className="search-input" style={{ width: '100%', paddingLeft: '1rem', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  value={newMtConfig.authMode}
                  onChange={e => setNewMtConfig({ ...newMtConfig, authMode: e.target.value })}
                  required={!editingMt}>
                  <option value="">-- Pilih Mode --</option>
                  <option value="local">Local — PPP Secret di MikroTik</option>
                  <option value="radius">RADIUS — FreeRADIUS (radcheck)</option>
                </select>
                {newMtConfig.authMode === 'local' && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', fontSize: '0.76rem', color: '#10b981' }}>
                    Sistem akan membuat PPP Secret di MikroTik untuk setiap pelanggan baru.
                  </div>
                )}
                {newMtConfig.authMode === 'radius' && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '6px', fontSize: '0.76rem', color: 'var(--primary)' }}>
                    Autentikasi via FreeRADIUS. PPP Secret bersifat opsional saat PSB (bisa dicentang di tahap review).
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddMtModal(false); setEditingMt(null) }}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>{editingMt ? 'Simpan Perubahan' : 'Simpan Router'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MikroTik Script Modal --- */}
      {showMtScriptModal && scriptNas && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowMtScriptModal(false); setScriptGenerated(false) }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
              <div>
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileOutput size={20} className="text-primary" /> Script MikroTik
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {scriptNas.name || scriptNas.host} — Isi parameter lalu klik <b>Generate Script</b>
                </p>
              </div>
              <button className="icon-btn" onClick={() => { setShowMtScriptModal(false); setScriptGenerated(false) }}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem 0' }}>

              {/* ── LANGKAH 1: Form parameter ── */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Langkah 1 — Isi parameter jaringan
                  </div>
                  {/* Versi RouterOS toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px' }}>
                    {['v6', 'v7'].map(v => (
                      <button key={v} onClick={() => { setScriptConfig({ ...scriptConfig, ros_version: v }); setScriptGenerated(false) }}
                        style={{
                          padding: '3px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600',
                          background: scriptConfig.ros_version === v ? 'var(--primary-color)' : 'transparent',
                          color: scriptConfig.ros_version === v ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.15s'
                        }}>
                        ROS {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.8rem' }}>
                    IP Server RADIUS <span style={{ color: '#ef4444' }}>*</span>
                    {serverIpLoading && <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--primary-color)' }}>Mendeteksi…</span>}
                  </label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem', fontFamily: 'monospace' }}
                    placeholder={serverIpLoading ? 'Mendeteksi otomatis…' : 'Misal: 103.x.x.x'}
                    value={scriptConfig.server_ip}
                    onChange={e => { setScriptConfig({ ...scriptConfig, server_ip: e.target.value }); setScriptGenerated(false) }}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>IP VPS tempat sistem billing & FreeRADIUS ini berjalan</small>
                </div>

              </div>

              {/* ── Tabel IP Pool ── */}
              <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                    IP Pool &amp; Range
                    <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '0.73rem', marginLeft: '6px' }}>(opsional — isi jika ingin buat pool baru)</span>
                  </label>
                  <button className="btn btn-outline" style={{ fontSize: '0.73rem', padding: '2px 10px' }}
                    onClick={() => { setScriptConfig({ ...scriptConfig, pools: [...(scriptConfig.pools || []), { pool_name: '', ip_range: '' }] }); setScriptGenerated(false) }}>
                    + Tambah Pool
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(scriptConfig.pools || []).map((pool, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: '0.4rem', alignItems: 'center' }}>
                      {ipPools.length > 0 ? (
                        <select className="search-input" style={{ paddingLeft: '0.75rem', fontSize: '0.8rem', background: 'var(--bg-surface)' }}
                          value={pool.pool_name}
                          onChange={e => { const p = [...scriptConfig.pools]; p[idx] = { ...p[idx], pool_name: e.target.value }; setScriptConfig({ ...scriptConfig, pools: p }); setScriptGenerated(false) }}>
                          <option value="">— Pilih pool —</option>
                          {ipPools.map(p => <option key={p.pool_name} value={p.pool_name}>{p.pool_name}</option>)}
                        </select>
                      ) : (
                        <input type="text" className="search-input" style={{ paddingLeft: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}
                          placeholder="Nama pool" value={pool.pool_name}
                          onChange={e => { const p = [...scriptConfig.pools]; p[idx] = { ...p[idx], pool_name: e.target.value }; setScriptConfig({ ...scriptConfig, pools: p }); setScriptGenerated(false) }} />
                      )}
                      <input type="text" className="search-input" style={{ paddingLeft: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}
                        placeholder="10.10.1.2-10.10.1.254"
                        value={pool.ip_range}
                        onChange={e => { const p = [...scriptConfig.pools]; p[idx] = { ...p[idx], ip_range: e.target.value }; setScriptConfig({ ...scriptConfig, pools: p }); setScriptGenerated(false) }} />
                      <button className="icon-btn-sm" style={{ color: '#ef4444', flexShrink: 0 }}
                        onClick={() => { const p = scriptConfig.pools.filter((_, i) => i !== idx); setScriptConfig({ ...scriptConfig, pools: p }); setScriptGenerated(false) }}>✕</button>
                    </div>
                  ))}
                  {(scriptConfig.pools || []).length === 0 && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.4rem 0' }}>
                      Kosongkan jika pool sudah ada di MikroTik — klik <b>+ Tambah Pool</b> untuk buat pool baru via script.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Tombol Generate ── */}
              {!scriptGenerated && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={!scriptConfig.server_ip}
                  onClick={() => setScriptGenerated(true)}
                >
                  <FileOutput size={18} /> Generate Script
                </button>
              )}
              {!scriptGenerated && !scriptConfig.server_ip && (
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Isi IP Server RADIUS terlebih dahulu
                </p>
              )}

              {/* ── LANGKAH 2: Script yang dihasilkan ── */}
              {scriptGenerated && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                    Langkah 2 — Salin & jalankan di Terminal MikroTik
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
                    <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                      onClick={() => setScriptGenerated(false)}>
                      ← Ubah Parameter
                    </button>
                    <button className="btn btn-primary" style={{ padding: '0.3rem 0.875rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        const text = generateMikroTikScript(scriptNas, scriptConfig)
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(text)
                            .then(() => showToast('Script berhasil disalin! Paste di New Terminal Winbox.', 'success'))
                            .catch(() => {
                              // Fallback: execCommand
                              const ta = document.createElement('textarea')
                              ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
                              document.body.appendChild(ta); ta.select()
                              document.execCommand('copy')
                              document.body.removeChild(ta)
                              showToast('Script berhasil disalin! Paste di New Terminal Winbox.', 'success')
                            })
                        } else {
                          const ta = document.createElement('textarea')
                          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
                          document.body.appendChild(ta); ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                          showToast('Script berhasil disalin! Paste di New Terminal Winbox.', 'success')
                        }
                      }}>
                      <Copy size={14} /> Salin Script
                    </button>
                  </div>
                  <pre style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px',
                    padding: '1rem', fontSize: '0.765rem', lineHeight: '1.65', overflowX: 'auto', overflowY: 'auto',
                    maxHeight: '380px', whiteSpace: 'pre', color: 'var(--text-main)', fontFamily: 'monospace',
                    userSelect: 'all', cursor: 'text'
                  }}>
                    {generateMikroTikScript(scriptNas, scriptConfig)}
                  </pre>
                </div>
              )}

            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg-surface)' }}>
              <button className="btn btn-outline" onClick={() => { setShowMtScriptModal(false); setScriptGenerated(false) }}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW MODALS --- */}
      {showAddProfileModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {profileSyncResults ? (
              <>
                <div className="modal-header">
                  <h2 className="modal-title">Paket Berhasil Disimpan</h2>
                  <button className="icon-btn" onClick={() => { setShowAddProfileModal(false); setProfileSyncResults(null); setNewProfile({ name: '', upload: '', download: '', price: '', description: '', ipPool: '', mikrotik_profile: '', routerOverrides: {} }); setEditingProfile(null); setProfilePppOptions({}); }}><X size={24} /></button>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', marginBottom: '1.25rem', color: '#16a34a', fontWeight: 600 }}>
                    <CheckCircle size={18} /> Data paket & RADIUS berhasil disimpan
                  </div>
                  <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>Status Sinkronisasi ke Router:</p>
                  {profileSyncResults.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1rem', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                      Tidak ada router yang terdaftar. Tambahkan router di menu Pengaturan MikroTik.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {profileSyncResults.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', borderRadius: '8px', background: r.status === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${r.status === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                          {r.status === 'ok' ? <CheckCircle size={16} color="#16a34a" /> : <XCircle size={16} color="#ef4444" />}
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.router}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({r.host})</span>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: r.status === 'ok' ? '#16a34a' : '#ef4444' }}>{r.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setShowAddProfileModal(false); setProfileSyncResults(null); setNewProfile({ name: '', upload: '', download: '', price: '', description: '', ipPool: '', mikrotik_profile: '', routerOverrides: {} }); setEditingProfile(null); setProfilePppOptions({}); }}>
                  Selesai
                </button>
              </>
            ) : (
              <>
                <div className="modal-header">
                  <h2 className="modal-title">{editingProfile ? 'Edit Profil Paket' : 'Buat Profil Paket'}</h2>
                  <button className="icon-btn" onClick={() => { setShowAddProfileModal(false); setProfilePppOptions({}); }}><X size={24} /></button>
                </div>
                <form onSubmit={(e) => handleCreateProfile(e)}>
                  <div className="form-group">
                    <label>Nama Paket</label>
                    <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newProfile.name} onChange={e => setNewProfile({ ...newProfile, name: e.target.value })} placeholder="Contoh: Paket 10 Mbps" required />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Rate Limit
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: 'rgba(139,92,246,0.12)', color: '#7c3aed' }}>RADIUS</span>
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Upload (Mbps)</label>
                        <div style={{ position: 'relative' }}>
                          <input type="number" className="search-input" style={{ width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }} value={newProfile.upload} onChange={e => setNewProfile({ ...newProfile, upload: e.target.value })} placeholder="Contoh: 10" min="1" required />
                          <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, pointerEvents: 'none' }}>M</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Download (Mbps)</label>
                        <div style={{ position: 'relative' }}>
                          <input type="number" className="search-input" style={{ width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }} value={newProfile.download} onChange={e => setNewProfile({ ...newProfile, download: e.target.value })} placeholder="Contoh: 10" min="1" required />
                          <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, pointerEvents: 'none' }}>M</span>
                        </div>
                      </div>
                    </div>
                    {newProfile.upload && newProfile.download && (
                      <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--primary-color)', fontWeight: 600 }}>Rate limit: {newProfile.upload}M/{newProfile.download}M</small>
                    )}
                    <small style={{ display: 'block', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Dikirim via FreeRADIUS ke router RADIUS. Router LOCAL mengabaikan ini — kecepatan diatur lewat PPP Profile MikroTik di bawah.
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Harga Bulanan (Rp)</label>
                    <input type="number" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newProfile.price} onChange={e => setNewProfile({ ...newProfile, price: e.target.value })} placeholder="Contoh: 150000" min="0" required />
                  </div>
                  {/* Override profil per router */}
                  {mtConfigs.length > 0 && (
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        PPP Profile per Router
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: '#059669' }}>LOCAL</span>
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.82rem' }}>(Opsional)</span>
                      </label>
                      <small style={{ display: 'block', marginBottom: '0.6rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Kosong = menggunakan <strong>nama paket</strong> sebagai PPP Profile. Isi hanya jika nama profil di router tertentu berbeda.
                        Router RADIUS tidak perlu diisi — kecepatan dikontrol via Rate Limit di atas.
                      </small>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {mtConfigs.map(r => {
                          const isRadius = r.auth_mode === 'radius'
                          const opts = profilePppOptions[r.id]
                          const overrideVal = (newProfile.routerOverrides || {})[String(r.id)] || ''
                          return (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: isRadius ? 'rgba(139,92,246,0.04)' : overrideVal ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                              <div style={{ flex: '0 0 auto', minWidth: 120, maxWidth: 160, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name || r.host}>{r.name || r.host}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', width: 'fit-content',
                                  background: isRadius ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)',
                                  color: isRadius ? '#7c3aed' : '#059669' }}>
                                  {isRadius ? 'RADIUS' : 'LOCAL'}
                                </span>
                              </div>
                              {isRadius ? (
                                <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0 0.25rem' }}>
                                  Kecepatan dikontrol via RADIUS ({newProfile.upload || '?'}M↑ / {newProfile.download || '?'}M↓)
                                </div>
                              ) : (
                                <>
                                  <div style={{ flex: 1, position: 'relative' }}>
                                    {opts?.profiles?.length > 0 ? (
                                      <select
                                        className="search-input"
                                        style={{ width: '100%', paddingLeft: '0.75rem' }}
                                        value={overrideVal}
                                        onChange={e => setNewProfile(prev => ({ ...prev, routerOverrides: { ...(prev.routerOverrides || {}), [String(r.id)]: e.target.value } }))}
                                      >
                                        <option value="">— {newProfile.name || 'sama dengan nama paket'} —</option>
                                        {opts.profiles.map(p => (
                                          <option key={p.name} value={p.name}>{p.name}{p.rateLimit ? ` (${p.rateLimit})` : ''}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        className="search-input"
                                        style={{ width: '100%', paddingLeft: '0.75rem' }}
                                        value={overrideVal}
                                        onChange={e => setNewProfile(prev => ({ ...prev, routerOverrides: { ...(prev.routerOverrides || {}), [String(r.id)]: e.target.value } }))}
                                        placeholder={newProfile.name ? `— ${newProfile.name} —` : '— sama dengan nama paket —'}
                                      />
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    disabled={opts?.loading}
                                    onClick={() => fetchRouterPppProfiles(r.id)}
                                  >
                                    {opts?.loading ? '⏳' : '↓ Ambil'}
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Deskripsi <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.82rem' }}>(Opsional)</span></label>
                    <textarea className="search-input" style={{ width: '100%', paddingLeft: '1rem', paddingTop: '0.5rem', height: '80px' }} value={newProfile.description} onChange={e => setNewProfile({ ...newProfile, description: e.target.value })} placeholder="Keterangan mengenai paket ini..." />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddProfileModal(false); setProfilePppOptions({}); }}>Batal</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }} disabled={profileSaving}>
                      {profileSaving ? '⏳ Menyimpan...' : 'Simpan Profil'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Auto-logout idle warning */}
      {idleWarning && (
        <div className="modal-overlay confirm-backdrop animate-fade-in" style={{ zIndex: 99999 }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-pulse stat-icon-yellow">
              <AlertCircle size={36} />
            </div>
            <h2>Sesi Tidak Aktif</h2>
            <p>Anda tidak aktif selama 30 menit. Sistem akan keluar otomatis dalam <strong>{idleCountdown} detik</strong>.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => {
                setIdleWarning(false)
                setIdleCountdown(60)
              }}>Saya Masih Di Sini</button>
              <button className="btn btn-secondary" onClick={() => {
                setIdleWarning(false)
                handleLogout()
              }}>Keluar Sekarang</button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Confirm Modal Replacement */}
      {confirmModal.show && (
        <div className="modal-overlay confirm-backdrop animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setConfirmModal({ ...confirmModal, show: false }) }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <div className={`confirm-icon-pulse ${confirmModal.type === 'danger' ? 'stat-icon-pink' :
              confirmModal.type === 'warning' ? 'stat-icon-yellow' : 'stat-icon-blue'
              }`}>
              {confirmModal.type === 'danger' && <Trash2 size={36} />}
              {confirmModal.type === 'warning' && <AlertCircle size={36} />}
              {confirmModal.type === 'info' && <Database size={36} />}
            </div>

            <h2>{confirmModal.title}</h2>
            <p>{confirmModal.message}</p>

            <div className="confirm-actions">
              <button className="btn btn-outline" onClick={() => setConfirmModal({ ...confirmModal, show: false })}>Batal</button>
              <button
                className={`btn ${confirmModal.type === 'danger' ? 'btn-soft-red' :
                  confirmModal.type === 'warning' ? 'btn-orange' : 'btn-darkblue'
                  }`}
                onClick={() => {
                  setConfirmModal({ ...confirmModal, show: false });
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                }}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Aksi Kritis (dengan verifikasi password) ── */}
      {criticalModal.show && (
        <div className="modal-overlay confirm-backdrop animate-fade-in" style={{ zIndex: 200000 }} onClick={e => { if (e.target !== e.currentTarget) return; if (!criticalModal.loading) { document.activeElement?.blur(); setCriticalModal(m => ({ ...m, show: false })) } }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="confirm-icon-pulse stat-icon-pink">
              <ShieldAlert size={36} />
            </div>
            <h2>{criticalModal.title}</h2>
            <p style={{ marginBottom: '1.25rem' }}>{criticalModal.message}</p>
            <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                Masukkan Password Admin untuk konfirmasi
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={criticalModal.showPass ? 'text' : 'password'}
                  className="search-input"
                  style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
                  placeholder="Password kamu..."
                  value={criticalModal.password}
                  onChange={e => setCriticalModal(m => ({ ...m, password: e.target.value, error: '' }))}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !criticalModal.loading) submitCritical() }}
                  autoComplete="new-password"
                  autoFocus
                  disabled={criticalModal.loading}
                />
                <button type="button"
                  onClick={() => setCriticalModal(m => ({ ...m, showPass: !m.showPass }))}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  {criticalModal.showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {criticalModal.error && (
                <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '5px' }}>⚠ {criticalModal.error}</p>
              )}
            </div>
            <div className="confirm-actions">
              <button className="btn btn-outline" disabled={criticalModal.loading}
                onClick={() => { document.activeElement?.blur(); setCriticalModal(m => ({ ...m, show: false })) }}>
                Batal
              </button>
              <button className="btn btn-soft-red" onClick={submitCritical} disabled={criticalModal.loading}>
                {criticalModal.loading ? 'Memverifikasi...' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Grafik Analitik User */}
      {showUserStatsModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowUserStatsModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '800px', background: 'var(--bg-surface)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="stat-icon-wrapper stat-icon-blue" style={{ width: '32px', height: '32px' }}><Activity size={18} /></div>
                <h2 className="modal-title">Analitik & Distribusi Pelanggan</h2>
              </div>
              <button className="close-btn" onClick={() => setShowUserStatsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '2rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Distribusi Paket (Pie Chart) */}
                <div className="chart-container" style={{ textAlign: 'center', background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px' }}>
                  <h3 style={{ marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pangsa Pasar Paket</h3>
                  <div style={{ height: '240px', minHeight: 240 }}>
                    <ResponsiveContainer width="100%" height={240} minWidth={0}>
                      <PieChart>
                        <Pie
                          data={groups.map(g => ({
                            name: g.groupname,
                            value: users.filter(u => u.groupname === g.groupname).length
                          })).filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {groups.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)', background: 'var(--bg-surface)', padding: '10px' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Perbandingan User (Bar Chart) */}
                <div className="chart-container" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px' }}>
                  <h3 style={{ marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jumlah User per Paket</h3>
                  <div style={{ height: '240px', minHeight: 240 }}>
                    <ResponsiveContainer width="100%" height={240} minWidth={0}>
                      <BarChart data={groups.map(g => ({
                        name: g.groupname,
                        count: users.filter(u => u.groupname === g.groupname).length
                      })).filter(d => d.count > 0)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} stroke="var(--text-muted)" />
                        <YAxis axisLine={false} tickLine={false} fontSize={10} stroke="var(--text-muted)" />
                        <Tooltip cursor={{ fill: 'var(--bg-hover)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)', background: 'var(--bg-surface)' }} />
                        <Bar dataKey="count" fill="var(--primary-color)" radius={[6, 6, 0, 0]} barSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Summary Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>Profile Terpopuler</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                    {groups.length > 0 ? groups.reduce((prev, curr) => (users.filter(u => u.groupname === prev.groupname).length > users.filter(u => u.groupname === curr.groupname).length) ? prev : curr).groupname : '-'}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>Rata-rata User/Paket</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {groups.length > 0 ? (users.length / groups.length).toFixed(1) : 0}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>Total Jenis Paket</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>{groups.length} Paket</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Pelanggan (Upgrade/Downgrade) */}
      {showEditUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit & Upgrade Pelanggan</h2>
              <button className="close-btn" onClick={() => { setShowEditUserModal(false); setEditingUser(null); setEditDusunSearch(null); }}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateUser}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>
                      Username PPPoE
                      {currentUser?.role === 'admin' && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>● dapat diubah</span>
                      )}
                    </label>
                    {currentUser?.role === 'admin' ? (
                      <input
                        type="text"
                        className="search-input"
                        value={newUser.username}
                        onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })}
                        placeholder="Username PPPoE"
                        required
                        style={{ fontWeight: 600 }}
                      />
                    ) : (
                      <input type="text" className="search-input" value={newUser.username} disabled style={{ background: '#f1f5f9' }} />
                    )}
                    {editingUser && newUser.username !== editingUser.username && newUser.username && (
                      <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '4px' }}>
                        ⚠ Username akan diubah dari <b>{editingUser.username}</b> → <b>{newUser.username}</b>. Pastikan perangkat pelanggan ikut diperbarui.
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Password Baru (Kosongkan jika tetap)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        className="search-input"
                        style={{ paddingRight: '2.5rem' }}
                        value={newUser.password}
                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="Kosongkan jika tidak diubah"
                      />
                      <button type="button" onClick={() => setShowEditPassword(v => !v)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                        title={showEditPassword ? 'Sembunyikan' : 'Tampilkan'}>
                        {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editingUser?.password && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Password saat ini: <code style={{ cursor: 'pointer' }} onClick={() => setShowEditPassword(true)}>{showEditPassword ? editingUser.password : '••••••••'}</code>
                      </div>
                    )}
                  </div>
                </div>

                {currentUser?.role !== 'noc' && (
                  <div className="form-group">
                    <label>Pilih Paket Internet (Upgrade/Downgrade)</label>
                    <select
                      className="search-input"
                      value={newUser.groupname}
                      onChange={e => setNewUser({ ...newUser, groupname: e.target.value })}
                      required
                    >
                      <option value="">-- Pilih Paket --</option>
                      {profiles.map(p => (
                        <option key={p.name} value={p.name}>{p.name}{p.rate_limit ? ` (${formatSpeed(p.rate_limit)})` : ''} — Rp {Math.round(parseFloat(p.price)).toLocaleString()}</option>
                      ))}
                    </select>
                  </div>
                )}

                {currentUser?.role !== 'noc' && <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" className="search-input" value={newUser.fullname} onChange={e => setNewUser({ ...newUser, fullname: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>WhatsApp</label>
                    <input type="tel" inputMode="numeric" className="search-input" value={newUser.phone} onChange={e => { let v = e.target.value.replace(/\D/g, ''); if (v.startsWith('0') && v.length > 1) v = '62' + v.slice(1); setNewUser({ ...newUser, phone: v }) }} placeholder="628123456789" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>No Identitas (NIK)</label>
                    <input type="text" className="search-input" value={newUser.identity_number} onChange={e => setNewUser({ ...newUser, identity_number: e.target.value })} placeholder="3201xxxxxxxxxxxx" />
                  </div>
                  <div className="form-group">
                    <label>Tanggal Jatuh Tempo</label>
                    <input type="number" min="1" max="31" className="search-input" value={newUser.due_date_day} onChange={e => setNewUser({ ...newUser, due_date_day: e.target.value })} />
                  </div>
                </div>

                {/* Diskon pelanggan */}
                {currentUser?.role === 'admin' && (
                  <div style={{ padding: '0.75rem 1rem', background: parseInt(newUser.discount) > 0 ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)', borderRadius: '8px', border: `1px solid ${parseInt(newUser.discount) > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}`, marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>🏷️ Diskon Pelanggan</span>
                      {parseInt(newUser.discount) > 0 && (
                        <span style={{ fontSize: '0.72rem', background: 'rgba(245,158,11,0.15)', color: '#b45309', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                          Aktif: Rp {parseInt(newUser.discount).toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Nominal Diskon (Rp)</label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Rp</span>
                          <input type="number" min="0" className="search-input" style={{ paddingLeft: '2.5rem' }} value={newUser.discount || ''} onChange={e => setNewUser({ ...newUser, discount: e.target.value })} placeholder="0 = tidak ada diskon" />
                        </div>
                        {parseInt(newUser.discount) > 0 && (() => { const p = profiles.find(x => x.name === newUser.groupname); const base = p?.price ? Number(p.price) : 0; const net = Math.max(0, base - parseInt(newUser.discount || 0)); return base ? <div style={{ fontSize: '0.72rem', marginTop: '3px', color: '#b45309' }}>Tagihan jadi: <strong>Rp {net.toLocaleString('id-ID')}</strong>/bln</div> : null })()}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>Alasan Diskon</label>
                        <input type="text" className="search-input" value={newUser.discount_note || ''} onChange={e => setNewUser({ ...newUser, discount_note: e.target.value })} placeholder="cth: Ketua RT" />
                      </div>
                    </div>
                    {parseInt(newUser.discount) > 0 && (
                      <button type="button" style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => setNewUser({ ...newUser, discount: '0', discount_note: '' })}>
                        ✕ Hapus diskon (kembalikan ke harga normal)
                      </button>
                    )}
                  </div>
                )}

                {currentUser?.role === 'admin' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📅 Tanggal Pemasangan
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>(untuk koreksi data impor)</span>
                      </label>
                      <input type="date" className="search-input" value={newUser.install_date || ''} onChange={e => setNewUser({ ...newUser, install_date: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>💳 Tipe Tagihan</label>
                      <select className="search-input" value={newUser.billing_type || 'prepaid'} onChange={e => setNewUser({ ...newUser, billing_type: e.target.value })}>
                        <option value="prepaid">Prabayar — bayar dulu, baru aktif</option>
                        <option value="postpaid">Pascabayar — pakai dulu, bayar belakangan</option>
                      </select>
                      {newUser.billing_type === 'postpaid' && (
                        <small style={{ color: '#f59e0b', marginTop: '3px', display: 'block' }}>⚠ Isolir berlaku setelah grace period pascabayar.</small>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Alamat Lengkap</label>
                  <textarea
                    className="search-input"
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem' }}
                    value={newUser.address}
                    onChange={e => setNewUser({ ...newUser, address: e.target.value })}
                    placeholder="Contoh: Dusun Parigi I, RT 001/RW 002, Desa Parigi, Kec. Sukasari"
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    📍 Koordinat Lokasi
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      (salin dari Google Maps atau pilih di peta)
                    </span>
                  </label>
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="search-input"
                      style={{ width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }}
                      placeholder="cth: -6.917464, 107.619123"
                      value={newUser.latitude && newUser.longitude ? `${newUser.latitude}, ${newUser.longitude}` : ''}
                      onChange={e => {
                        const raw = e.target.value
                        const match = raw.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
                        if (match) {
                          setNewUser(u => ({ ...u, latitude: match[1], longitude: match[2] }))
                        } else if (!raw.trim()) {
                          setNewUser(u => ({ ...u, latitude: null, longitude: null }))
                        }
                      }}
                    />
                    {newUser.latitude && newUser.longitude && (
                      <a href={`https://www.google.com/maps?q=${newUser.latitude},${newUser.longitude}`}
                        target="_blank" rel="noreferrer" title="Verifikasi di Google Maps"
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', textDecoration: 'none' }}>🗺️</a>
                    )}
                  </div>
                  {newUser.latitude && newUser.longitude && (
                    <div style={{ marginBottom: '6px', fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✓ {Number(newUser.latitude).toFixed(6)}, {Number(newUser.longitude).toFixed(6)}
                      <a href={`https://www.google.com/maps?q=${newUser.latitude},${newUser.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: '0.75rem' }}>Verifikasi di Maps →</a>
                    </div>
                  )}
                  <MapPicker
                    lat={newUser.latitude}
                    lng={newUser.longitude}
                    onChange={(lat, lng) => setNewUser(u => ({ ...u, latitude: lat, longitude: lng }))}
                    compact={true}
                  />
                </div>

                {/* Foto KTP di modal edit */}
                <div className="form-group">
                  <label>Foto KTP <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(upload untuk memperbarui)</span></label>
                  {ktpPhoto ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={ktpPhoto} alt="KTP Preview" style={{ width: '100%', maxWidth: '280px', borderRadius: '8px', border: '2px solid #10b981', objectFit: 'cover', maxHeight: '140px' }} />
                      <button type="button" onClick={() => setKtpPhoto(null)} style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '4px' }}>✓ Foto baru siap ({Math.round(ktpPhoto.length * 0.75 / 1024)} KB)</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {editingUser && (
                        <button type="button" className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '4px 10px', width: 'fit-content' }}
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/users/${encodeURIComponent(editingUser.username)}/ktp`, { headers: authHeader() })
                              if (!res.ok) { showToast('Belum ada foto KTP', 'info'); return }
                              const d = await res.json()
                              setKtpPhotoView(d.ktp_photo)
                            } catch { showToast('Gagal memuat foto', 'error') }
                          }}>
                          👁 Lihat foto KTP tersimpan
                        </button>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', width: 'fit-content' }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleKtpSelect} />
                        📷 Ganti foto KTP
                      </label>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>POP</label>
                    <input type="text" className="search-input" value={newUser.pop} onChange={e => setNewUser({ ...newUser, pop: e.target.value })} placeholder="Nama POP" />
                  </div>
                  <div className="form-group">
                    <label>ODP</label>
                    <input type="text" className="search-input" value={newUser.odp} onChange={e => setNewUser({ ...newUser, odp: e.target.value })} placeholder="Nama ODP" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>NAS / Router</label>
                    <select className="search-input" value={newUser.nas_id} onChange={e => setNewUser({ ...newUser, nas_id: e.target.value })}>
                      <option value="">— Pilih NAS —</option>
                      {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Wilayah / Dusun</label>
                    {/* Dusun search — cari berdasarkan nama dusun, auto-set territory_id */}
                    {(() => {
                      const allDusun = territories.flatMap(t =>
                        (t.areas || []).map(a => ({
                          areaId: a.id,
                          dusun: a.dusun_nama || a.kelurahan_nama,
                          kelurahan: a.kelurahan_nama,
                          kecamatan: a.kecamatan_nama,
                          territoryId: t.id,
                          territoryName: t.name,
                          collectorName: t.collector_name || a.collector_name,
                        }))
                      )
                      const selTerritory = territories.find(t => String(t.id) === String(newUser.territory_id))
                      return (
                        <div>
                          {/* Search input */}
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              className="search-input"
                              placeholder="Ketik nama dusun/kampung untuk mencari..."
                              value={editDusunSearch !== null && editDusunSearch !== undefined ? editDusunSearch : (() => {
                                if (!newUser.territory_area_id) return ''
                                const area = territories.flatMap(t => t.areas || []).find(a => String(a.id) === String(newUser.territory_area_id))
                                return area?.dusun_nama || area?.kelurahan_nama || ''
                              })()}
                              onChange={e => setEditDusunSearch(e.target.value)}
                              onFocus={e => { setEditDusunSearch('') }}
                              style={{ width: '100%', paddingLeft: '2rem' }}
                            />
                            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>🔍</span>
                          </div>
                          {/* Dropdown hasil pencarian */}
                          {editDusunSearch !== null && editDusunSearch !== undefined && (
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', background: 'var(--bg-primary)', zIndex: 10, position: 'relative' }}>
                              {allDusun.filter(d =>
                                editDusunSearch === ''
                                  ? true
                                  : (d.dusun + ' ' + (d.kelurahan || '') + ' ' + (d.kecamatan || '')).toLowerCase().includes(editDusunSearch.toLowerCase())
                              ).slice(0, 30).map(d => (
                                <div key={d.areaId}
                                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  onClick={() => {
                                    setNewUser(u => ({ ...u, territory_id: String(d.territoryId), territory_area_id: String(d.areaId) }))
                                    setEditDusunSearch(null)
                                  }}>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{d.dusun}</span>
                                    {d.kelurahan && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{d.kelurahan}{d.kecamatan ? `, ${d.kecamatan}` : ''}</span>}
                                  </div>
                                  {d.collectorName && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '8px', opacity: 0.7 }}>🧑‍💼 {d.collectorName}</span>}
                                </div>
                              ))}
                              {allDusun.filter(d =>
                                editDusunSearch === ''
                                  ? true
                                  : (d.dusun + ' ' + (d.kelurahan || '') + ' ' + (d.kecamatan || '')).toLowerCase().includes(editDusunSearch.toLowerCase())
                              ).length === 0 && (
                                <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Tidak ditemukan. Pilih manual di bawah ↓</div>
                              )}
                            </div>
                          )}
                          {/* Pilih manual / fallback territory dropdown — hanya tampil jika belum ada dusun terpilih */}
                          {!newUser.territory_area_id && (
                            <select className="search-input" style={{ marginTop: '8px', width: '100%' }}
                              value={newUser.territory_id}
                              onChange={e => { setNewUser({ ...newUser, territory_id: e.target.value, territory_area_id: '' }); setEditDusunSearch(null) }}>
                              <option value="">— Atau pilih wilayah —</option>
                              {territories.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name}{t.collector_name ? ` (${t.collector_name})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                          {/* Info wilayah terpilih */}
                          {selTerritory && (
                            <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                              <span>✅ <strong>{selTerritory.name}</strong></span>
                              <span style={{ opacity: 0.7 }}>🧑‍💼 {selTerritory.collector_name || 'Tanpa kolektor'}</span>
                              <span style={{ opacity: 0.7 }}>👥 {selTerritory.user_count || 0}</span>
                              <button type="button" style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                onClick={() => setNewUser(u => ({ ...u, territory_id: '', territory_area_id: '' }))}>✕ Hapus</button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>IP Statis (Opsional)</label>
                    <input type="text" className="search-input" value={newUser.staticIp} onChange={e => setNewUser({ ...newUser, staticIp: e.target.value })} placeholder="Ex: 10.10.10.50" />
                  </div>
                </div>

                <div className="toggle-box" style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={newUser.auto_suspend === 1}
                    onChange={e => setNewUser({ ...newUser, auto_suspend: e.target.checked ? 1 : 0 })}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Isolir Otomatis</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pelanggan akan diisolir otomatis jika menunggak.</div>
                  </div>
                </div>
                </>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setShowEditUserModal(false); setEditingUser(null); setEditDusunSearch(null); }}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {packageChangeWarning && (
        <div className="modal-overlay confirm-backdrop animate-fade-in" style={{ zIndex: 200001 }} onClick={e => { if (e.target !== e.currentTarget) return; setPackageChangeWarning(null); setPackageChangeReason('') }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="confirm-icon-pulse stat-icon-primary">
              <ArrowLeftRight size={32} />
            </div>
            <h2>Konfirmasi Ganti Paket</h2>
            <p style={{ marginBottom: '1rem' }}>
              Pelanggan memiliki tagihan <strong>{packageChangeWarning.period}</strong> sebesar <strong>Rp {Number(packageChangeWarning.old_amount).toLocaleString('id-ID')}</strong> yang belum lunas. Tagihan lama akan otomatis <strong>dilunaskan dan masuk omzet</strong>, lalu tagihan baru sebesar <strong>Rp {Number(packageChangeWarning.new_amount).toLocaleString('id-ID')}</strong> akan dibuat.
            </p>
            <div style={{ width: '100%', background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: '0.85rem', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>Tagihan lama</span>
                <span style={{ fontWeight: 600 }}>{packageChangeWarning.old_package} — Rp {Number(packageChangeWarning.old_amount).toLocaleString('id-ID')} <span style={{ color: '#10b981', fontSize: '0.75rem' }}>→ LUNAS</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tagihan baru</span>
                <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{packageChangeWarning.new_package} — Rp {Number(packageChangeWarning.new_amount).toLocaleString('id-ID')} <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>→ UNPAID</span></span>
              </div>
            </div>
            <div style={{ width: '100%', textAlign: 'left', marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
                Alasan perubahan paket <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={packageChangeReason}
                onChange={e => setPackageChangeReason(e.target.value)}
                placeholder="Contoh: Pelanggan request upgrade ke paket lebih cepat"
                rows={3}
                autoFocus
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)', padding: '8px 12px', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-main)', fontFamily: 'inherit' }}
              />
            </div>
            <div className="confirm-actions">
              <button className="btn btn-outline" onClick={() => { setPackageChangeWarning(null); setPackageChangeReason('') }}>Batal</button>
              <button
                className="btn btn-primary"
                disabled={!packageChangeReason.trim()}
                onClick={() => handleUpdateUser(null, true, packageChangeReason.trim())}
              >
                Ya, Ganti Paket
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Import Pelanggan</h2>
              <button className="icon-btn" onClick={() => setShowImportModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1rem 0' }}>

              {/* Info & download template */}
              <div style={{ marginBottom: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden', fontSize: '0.78rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', background: 'rgba(59,130,246,0.07)', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.8rem' }}>📋 Panduan Kolom</span>
                  <button className="btn btn-outline" style={{ whiteSpace: 'nowrap', fontSize: '0.73rem', padding: '0.3rem 0.7rem', flexShrink: 0 }}
                    onClick={downloadImportTemplate}>
                    ⬇ Template Excel + Referensi
                  </button>
                </div>
                {/* Kolom guide */}
                <div style={{ padding: '0.65rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1.5rem' }}>
                  {[
                    { name: 'username', status: 'wajib', note: 'Username unik, tanpa spasi' },
                    { name: 'password', status: 'wajib', note: 'Wajib untuk PPPoE, kosongkan untuk static' },
                    { name: 'connection_type', status: 'disarankan', note: '"pppoe" atau "static" (kosong = pppoe)' },
                    { name: 'groupname', status: 'disarankan', note: 'Nama paket (lihat sheet Referensi)' },
                    { name: 'fullname', status: 'opsional', note: 'Nama lengkap pelanggan' },
                    { name: 'phone', status: 'opsional', note: 'HP format 628xxx' },
                    { name: 'billing_type', status: 'disarankan', note: 'prepaid atau postpaid (kosong = prepaid)' },
                    { name: 'nas_id', status: 'opsional', note: 'Nama atau IP router' },
                    { name: 'static_ip', status: 'opsional', note: 'Wajib untuk tipe static, opsional untuk PPPoE' },
                    { name: 'mac_address', status: 'opsional', note: 'Untuk ARP binding (tipe static)' },
                    { name: 'dusun', status: 'opsional', note: 'Nama dusun (untuk assign kolektor)' },
                    { name: 'install_date', status: 'opsional', note: 'YYYY-MM-DD, kosong = hari ini' },
                    { name: 'due_date_day', status: 'opsional', note: 'Tanggal jatuh tempo (1–31)' },
                    { name: 'address', status: 'opsional', note: 'Alamat lengkap' },
                    { name: 'pop / odp', status: 'opsional', note: 'Titik jaringan pemasangan' },
                  ].map(col => (
                    <div key={col.name} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', padding: '0.18rem 0' }}>
                      <code style={{
                        fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                        color: col.status === 'wajib' ? '#ef4444' : col.status === 'disarankan' ? '#f59e0b' : 'var(--text-secondary)',
                        background: col.status === 'wajib' ? 'rgba(239,68,68,0.08)' : col.status === 'disarankan' ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)',
                        padding: '0 4px', borderRadius: '3px',
                      }}>{col.name}</code>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.71rem', lineHeight: 1.3 }}>{col.note}</span>
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div style={{ padding: '0.4rem 1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem', background: 'var(--bg-secondary)' }}>
                  <span style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 600 }}>● Wajib</span>
                  <span style={{ color: '#f59e0b', fontSize: '0.7rem', fontWeight: 600 }}>● Disarankan</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>● Opsional</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: 'auto' }}>Template berisi sheet <b>Referensi</b> dengan data nyata dari sistem</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Pilih File Excel atau CSV</label>
                <input type="file" className="search-input" accept=".xlsx,.xls,.csv" style={{ width: '100%', padding: '0.5rem' }} onChange={handleImportFileChange} />
              </div>

              {importPreview.length > 0 && (() => {
                const thisMonth = new Date().toISOString().slice(0, 7);
                const rows = importPreview.map((u, i) => {
                  const isStatic = u.connection_type === 'static';
                  const isSkip = !u.username || (!isStatic && !u.password) || (isStatic && !u.static_ip); // hard required → skip
                  const isWarn = !isSkip && !u.groupname;              // soft required → impor + warning
                  const isMig = !isSkip && u.install_date && u.install_date.slice(0, 7) !== thisMonth;
                  return { ...u, _i: i, _skip: isSkip, _warn: isWarn, _isMig: isMig };
                });
                const skipCount = rows.filter(r => r._skip).length;
                const warnCount = rows.filter(r => r._warn).length;
                const validCount = rows.filter(r => !r._skip).length;
                return (
                  <div style={{ marginBottom: '1rem' }}>
                    {/* Summary */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#10b981' }}>✓ {validCount} akan diimpor</span>
                      {warnCount > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f59e0b' }}>⚠ {warnCount} tanpa paket (assign manual)</span>}
                      {skipCount > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ef4444' }}>✗ {skipCount} dilewati (username/password kosong)</span>}
                    </div>
                    {/* Keterangan kolom */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>Wajib:</span> username, password &nbsp;·&nbsp;
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>Disarankan:</span> groupname &nbsp;·&nbsp;
                      <span>Opsional:</span> fullname, phone, NIK, alamat, POP, ODP, tanggal pasang, dll.
                    </div>
                    {/* Preview table */}
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>#</th>
                            <th style={{ padding: '6px 8px' }}>Username</th>
                            <th style={{ padding: '6px 8px' }}>Nama</th>
                            <th style={{ padding: '6px 8px' }}>Paket</th>
                            <th style={{ padding: '6px 8px' }}>Tgl Pasang</th>
                            <th style={{ padding: '6px 8px' }}>Keterangan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 8).map((u) => (
                            <tr key={u._i} style={{
                              borderTop: '1px solid var(--border-color)',
                              background: u._skip ? 'rgba(239,68,68,0.04)' : u._warn ? 'rgba(245,158,11,0.04)' : 'transparent',
                              opacity: u._skip ? 0.6 : 1
                            }}>
                              <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{u._i + 1}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 600, color: u.username ? 'inherit' : '#ef4444' }}>
                                {u.username || <i>kosong</i>}
                              </td>
                              <td style={{ padding: '6px 8px', color: u.fullname ? 'inherit' : 'var(--text-muted)' }}>
                                {u.fullname || '—'}
                              </td>
                              <td style={{ padding: '6px 8px', color: u.groupname ? 'inherit' : '#f59e0b' }}>
                                {u.groupname || <i>kosong</i>}
                              </td>
                              <td style={{ padding: '6px 8px', color: u.install_date ? 'inherit' : 'var(--text-muted)' }}>
                                {u.install_date || 'hari ini'}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                {u._skip
                                  ? <span style={{ color: '#ef4444', fontWeight: 600 }}>✗ Dilewati</span>
                                  : u._warn
                                    ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Tanpa paket</span>
                                    : u._isMig
                                      ? <span style={{ color: '#8b5cf6', fontWeight: 600 }}>↩ Migrasi</span>
                                      : <span style={{ color: '#10b981' }}>✓ OK</span>
                                }
                              </td>
                            </tr>
                          ))}
                          {rows.length > 8 && (
                            <tr>
                              <td colSpan="6" style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                ... dan {rows.length - 8} baris lainnya
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview([]) }}>Batal</button>
                <button className="btn btn-orange" style={{ flex: 1.5 }} onClick={executeBulkImport}
                  disabled={importing || !importFile || importPreview.filter(u => u.username && (u.password || u.connection_type === 'static' || u.connection_type === 'hotspot' || (!u.connection_type && u.static_ip && !u.password))).length === 0}>
                  {importing ? 'Mengimpor...' : `Impor ${importPreview.filter(u => u.username && (u.password || u.connection_type === 'static' || u.connection_type === 'hotspot' || (!u.connection_type && u.static_ip && !u.password))).length} Pelanggan`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSyncAddonModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget) setShowSyncAddonModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🔄 Sinkronisasi Addon</h2>
              <button className="icon-btn" onClick={() => setShowSyncAddonModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                Proses ini akan memeriksa semua invoice <b>BELUM BAYAR</b> dan memperbarui tagihan yang belum mencantumkan layanan tambahan (addon) yang aktif.
              </p>
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', fontSize: '0.8rem', color: '#b45309' }}>
                ⚠️ Cocok dipakai jika ada pelanggan dengan addon aktif tapi nominalnya belum bertambah di tagihan bulan ini.
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowSyncAddonModal(false)}>Batal</button>
                <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={handleSyncAddons} disabled={syncingAddon}>
                  {syncingAddon ? 'Menyinkronkan...' : 'Ya, Sinkronkan Sekarang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGenerateInvoiceModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Generate Tagihan Masal</h2>
              <button className="icon-btn" onClick={() => setShowGenerateInvoiceModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
                Tindakan ini akan membuat tagihan atau invoice baru untuk <b>SELURUH PELANGGAN AKTIF</b> pada periode bulan <b>{invoiceFilter.period}</b>.
              </p>
              <div className="form-group">
                <label>Pilih Periode Bulan</label>
                <input
                  type="month"
                  className="search-input"
                  style={{ width: '100%' }}
                  value={invoiceFilter.period}
                  onChange={e => setInvoiceFilter({ ...invoiceFilter, period: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowGenerateInvoiceModal(false)}>Batal</button>
                <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={handleGenerateInvoices} disabled={generating}>
                  {generating ? 'Memproses...' : 'Proses Sekarang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Kelola Area Modal ── */}
      {(() => {
        const managingTerritory = territories.find(t => t.id === managingAreasTerritoryId) || null
        if (!managingAreasTerritoryId || !managingTerritory) return null
        return (
          <div className="modal-overlay confirm-backdrop animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setManagingAreasTerritoryId(null) }}>
            <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h2 className="modal-title" style={{ fontSize: '1.1rem', marginBottom: '1px' }}>Kelola Area</h2>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{managingTerritory.name}</div>
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setManagingAreasTerritoryId(null)}><X size={22} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem 0' }}>
                {/* Add area cascade */}
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Tambah Kelurahan / Desa</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <SearchableSelect options={areaWilayahData.provinsi} value={areaSearchWilayah.prov} onSelect={(kode, nama) => handleAreaSelWilayah('prov', kode, nama)} placeholder="Cari provinsi..." disabled={false} />
                    <SearchableSelect options={areaWilayahData.kabupaten} value={areaSearchWilayah.kab} onSelect={(kode, nama) => handleAreaSelWilayah('kab', kode, nama)} placeholder="Cari kabupaten/kota..." disabled={!areaSearchWilayah.prov} />
                    <SearchableSelect options={areaWilayahData.kecamatan} value={areaSearchWilayah.kec} onSelect={(kode, nama) => handleAreaSelWilayah('kec', kode, nama)} placeholder="Cari kecamatan..." disabled={!areaSearchWilayah.kab} />
                    <SearchableSelect options={areaWilayahData.kelurahan} value={areaSearchWilayah.kel} onSelect={(kode, nama) => handleAreaSelWilayah('kel', kode, nama)} placeholder="Cari kelurahan/desa..." disabled={!areaSearchWilayah.kec} />
                    {/* Dusun / Kampung input (opsional) */}
                    {areaSearchWilayah.kel && (
                      <div style={{ position: 'relative' }}>
                        <input
                          className="search-input"
                          style={{ width: '100%', paddingLeft: '1rem' }}
                          list="dusun-suggestions-list"
                          placeholder="Nama dusun/kampung (opsional)"
                          value={areaDusunInput}
                          onChange={e => setAreaDusunInput(e.target.value)}
                          autoComplete="off"
                        />
                        <datalist id="dusun-suggestions-list">
                          {areaDusunSuggestions.map(d => <option key={d} value={d} />)}
                        </datalist>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          Kosongkan jika satu desa cukup untuk satu wilayah
                        </div>
                      </div>
                    )}
                    <button className="btn btn-primary" style={{ width: '100%' }} disabled={!areaSearchWilayah.kel} onClick={handleAddArea}>
                      <Plus size={16} /><span>Tambahkan ke Wilayah</span>
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)' }} />

                {/* Current areas list */}
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                    Area Terdaftar
                    <span style={{ marginLeft: '6px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '1px 8px', fontWeight: '600', fontSize: '0.75rem' }}>
                      {managingTerritory.areas?.length || 0}
                    </span>
                  </div>
                  {!managingTerritory.areas || managingTerritory.areas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
                      Belum ada area terdaftar. Tambahkan kelurahan/desa di atas.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '220px', overflowY: 'auto' }}>
                      {managingTerritory.areas.map(area => (
                        <div key={area.id || area.kelurahan_kode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.9rem', background: 'var(--bg-secondary)', borderRadius: '8px', gap: '0.5rem', border: '1px solid var(--border-color)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                              {area.dusun_nama ? `${area.dusun_nama} — ` : ''}{area.kelurahan_nama}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '1px' }}>{[area.kecamatan_nama, area.kabupaten_nama].filter(Boolean).join(' · ')}</div>
                          </div>
                          <button className="icon-btn danger" style={{ padding: '5px 7px', flexShrink: 0 }} title="Hapus area"
                            onClick={() => handleRemoveArea(area.id, area.dusun_nama ? `${area.dusun_nama} — ${area.kelurahan_nama}` : area.kelurahan_nama)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setManagingAreasTerritoryId(null)}>Selesai</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal Assign Dusun ke Kolektor (sistem baru) ── */}
      {showAssignDusunModal && (() => {
        const col = systemStaff.find(s => String(s.id) === String(assignDusunCollectorId))
        const myAreas = collectorAreas.filter(a => String(a.collector_id) === String(assignDusunCollectorId))
        return (
          <div className="modal-overlay confirm-backdrop animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowAssignDusunModal(false) }}>
            <div className="modal-content" style={{ maxWidth: '520px', overflow: 'visible' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={18} className="text-primary" />
                  Assign Dusun — {col?.fullname || col?.username}
                </h2>
                <button className="icon-btn" onClick={() => setShowAssignDusunModal(false)}><X size={24} /></button>
              </div>

              <div style={{ padding: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Wilayah picker — 2 col grid, pakai SearchableSelect */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* Provinsi */}
                  <div className="form-group" style={{ margin: 0, minWidth: 0, overflow: 'visible' }}>
                    <label style={{ fontSize: '0.78rem' }}>Provinsi</label>
                    <SearchableSelect options={assignDusunWilayahData.provinsi} value={assignDusunWilayah.prov}
                      placeholder="Cari provinsi..." disabled={false}
                      onSelect={async (kode, nama) => {
                        setAssignDusunWilayah(w => ({ ...w, prov: kode, provNama: nama, kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '', kelKode: '' }))
                        setAssignDusunWilayahData(d => ({ ...d, kabupaten: [], kecamatan: [], kelurahan: [] }))
                        if (kode) {
                          const kab = await fetchWilayah('kabupaten', kode)
                          setAssignDusunWilayahData(d => ({ ...d, kabupaten: kab }))
                        }
                      }} />
                  </div>
                  {/* Kabupaten */}
                  <div className="form-group" style={{ margin: 0, minWidth: 0, overflow: 'visible' }}>
                    <label style={{ fontSize: '0.78rem' }}>Kabupaten / Kota</label>
                    <SearchableSelect options={assignDusunWilayahData.kabupaten} value={assignDusunWilayah.kab}
                      placeholder="Cari kabupaten..." disabled={!assignDusunWilayah.prov}
                      onSelect={async (kode, nama) => {
                        setAssignDusunWilayah(w => ({ ...w, kab: kode, kabNama: nama, kec: '', kecNama: '', kel: '', kelNama: '', kelKode: '' }))
                        setAssignDusunWilayahData(d => ({ ...d, kecamatan: [], kelurahan: [] }))
                        if (kode) {
                          const kec = await fetchWilayah('kecamatan', kode)
                          setAssignDusunWilayahData(d => ({ ...d, kecamatan: kec }))
                        }
                      }} />
                  </div>
                  {/* Kecamatan */}
                  <div className="form-group" style={{ margin: 0, minWidth: 0, overflow: 'visible' }}>
                    <label style={{ fontSize: '0.78rem' }}>Kecamatan</label>
                    <SearchableSelect options={assignDusunWilayahData.kecamatan} value={assignDusunWilayah.kec}
                      placeholder="Cari kecamatan..." disabled={!assignDusunWilayah.kab}
                      onSelect={async (kode, nama) => {
                        setAssignDusunWilayah(w => ({ ...w, kec: kode, kecNama: nama, kel: '', kelNama: '', kelKode: '' }))
                        setAssignDusunWilayahData(d => ({ ...d, kelurahan: [] }))
                        if (kode) {
                          const kel = await fetchWilayah('kelurahan', kode)
                          setAssignDusunWilayahData(d => ({ ...d, kelurahan: kel }))
                        }
                      }} />
                  </div>
                  {/* Kelurahan / Desa */}
                  <div className="form-group" style={{ margin: 0, minWidth: 0, overflow: 'visible' }}>
                    <label style={{ fontSize: '0.78rem' }}>Kelurahan / Desa</label>
                    <SearchableSelect options={assignDusunWilayahData.kelurahan} value={assignDusunWilayah.kel}
                      placeholder="Cari kelurahan..." disabled={!assignDusunWilayah.kec}
                      onSelect={(kode, nama) => {
                        setAssignDusunWilayah(w => ({ ...w, kel: kode, kelNama: nama, kelKode: kode }))
                      }} />
                  </div>
                </div>

                {/* Input nama dusun */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Nama Dusun / Kampung <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="search-input" style={{ flex: 1, paddingLeft: '1rem' }}
                      placeholder="Contoh: Parigi I, Salagedang, Cikaret..."
                      value={assignDusunName}
                      onChange={e => setAssignDusunName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAssignDusun() } }}
                    />
                    <button type="button" className="btn btn-primary" style={{ flexShrink: 0, padding: '0 1rem' }}
                      disabled={assignDusunLoading || !assignDusunWilayah.kelKode || !assignDusunName.trim()}
                      onClick={handleAssignDusun}>
                      {assignDusunLoading ? '...' : '+ Tambah'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Tekan Enter atau klik Tambah. Bisa tambah beberapa dusun sekaligus.</p>
                </div>

                {/* Daftar dusun yang sudah diassign ke kolektor ini */}
                {myAreas.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Dusun yang sudah diassign ({myAreas.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                      {myAreas.map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', padding: '2px 6px 2px 9px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981' }}>
                          <span style={{ fontWeight: '600' }}>{a.dusun_nama}</span>
                          <span style={{ opacity: 0.6, fontSize: '0.65rem' }}> · {a.kelurahan_nama}</span>
                          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 0 0 2px', lineHeight: 1 }}
                            onClick={() => handleRemoveCollectorArea(a.id, a.dusun_nama)}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowAssignDusunModal(false)}>Selesai</button>
              </div>
            </div>
          </div>
        )
      })()}

      {showAddTerritoryModal && (
        <div className="modal-overlay confirm-backdrop animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowAddTerritoryModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingTerritory ? 'Edit Data Wilayah' : 'Tambah Wilayah Baru'}</h2>
              <button className="icon-btn" onClick={() => setShowAddTerritoryModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateTerritory}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem 0' }}>
                <div className="form-group">
                  <label>Nama Wilayah</label>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem' }}
                    required
                    placeholder="Misal: Pagaden Barat, Subang Kota, dsb."
                    value={newTerritory.name}
                    onChange={e => setNewTerritory({ ...newTerritory, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Deskripsi / Catatan</label>
                  <textarea
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem', paddingTop: '0.75rem', height: '80px' }}
                    placeholder="Keterangan cakupan wilayah..."
                    value={newTerritory.description}
                    onChange={e => setNewTerritory({ ...newTerritory, description: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Collector Penanggung Jawab</label>
                  <select
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                    value={newTerritory.collector_id}
                    onChange={e => setNewTerritory({ ...newTerritory, collector_id: e.target.value })}
                  >
                    <option value="">-- Pilih Collector --</option>
                    {systemStaff.filter(s => s.role === 'collector' || s.role === 'admin').map(s => (
                      <option key={s.id} value={s.id}>{s.fullname} ({s.username})</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Pilih staf yang akan bertanggung jawab menagih di wilayah ini.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAddTerritoryModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingTerritory ? 'Update Wilayah' : 'Simpan Wilayah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUserDetailModal && viewingUser && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target !== e.currentTarget) return; setShowUserDetailModal(false) }}>
          <div className="modal-content user-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="stat-icon-wrapper stat-icon-primary" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
                  <User size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <h2 className="modal-title" style={{ fontSize: '1.25rem', margin: 0 }}>{viewingUser.fullname || viewingUser.username}</h2>
                    {viewingUser.status === 'berhenti'
                      ? <span className="badge badge-stopped" style={{ fontSize: '0.7rem' }}>BERHENTI</span>
                      : viewingUser.is_suspended
                        ? <span className="badge badge-isolir" style={{ fontSize: '0.7rem' }}>ISOLIR</span>
                        : viewingUser.is_online
                          ? <span className="badge badge-online" style={{ fontSize: '0.7rem' }}>AKTIF</span>
                          : <span className="badge badge-offline" style={{ fontSize: '0.7rem' }}>OFFLINE</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{viewingUser.username}</span>
                    <span>•</span>
                    <span>ID: {viewingUser.customer_id || '-'}</span>
                  </div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowUserDetailModal(false)}><X size={24} /></button>
            </div>

            <div className="detail-tabs">
              <button onClick={() => setDetailTab('info')} className="detail-tab-btn"
                style={{ color: detailTab === 'info' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: `2px solid ${detailTab === 'info' ? 'var(--primary-color)' : 'transparent'}` }}>
                Informasi Umum
              </button>
              <button onClick={() => { setDetailTab('history'); setHistoryLimit(3) }} className="detail-tab-btn"
                style={{ color: detailTab === 'history' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: `2px solid ${detailTab === 'history' ? 'var(--primary-color)' : 'transparent'}` }}>
                Riwayat & Aktivitas
              </button>
              {currentUser?.role === 'admin' && (
                <button onClick={() => { setDetailTab('addons'); loadCustomerAddons(viewingUser.username) }} className="detail-tab-btn"
                  style={{ color: detailTab === 'addons' ? 'var(--primary-color)' : 'var(--text-muted)', borderBottom: `2px solid ${detailTab === 'addons' ? 'var(--primary-color)' : 'transparent'}` }}>
                  Layanan Tambahan
                </button>
              )}
            </div>

            <div className="detail-body">
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                  <p style={{ color: 'var(--text-muted)' }}>Memuat data detail...</p>
                </div>
              ) : detailTab === 'addons' ? (
                <CustomerAddonsPanel
                  username={viewingUser?.username}
                  authHeader={authHeader}
                  showToast={showToast}
                  requestConfirm={requestConfirm}
                  customerAddons={customerAddons}
                  setCustomerAddons={setCustomerAddons}
                  addonsLoading={addonsLoading}
                />
              ) : detailTab === 'info' ? (
                <>
                  {/* ── Kredensial (Admin, NOC, Teknisi) ── */}
                  {['admin', 'noc', 'technician'].includes(currentUser?.role) && (
                    <div style={{ marginBottom: '1.5rem', padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                      <KeyRound size={16} style={{ color: '#6366f1', flexShrink: 0, marginTop: '3px' }} />
                      <div className="detail-credentials" style={{ flex: 1 }}>
                        {viewingUser.connection_type === 'static' ? (
                          <>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID Pelanggan (Static)</div>
                              <code style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '0.02em' }}>{viewingUser.username}</code>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IP Address Static</div>
                              <code style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '0.02em', color: '#10b981' }}>
                                {viewingUser.static_ip || customerDetailData.info?.static_ip || '—'}
                              </code>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username PPPoE</div>
                              <code style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '0.02em' }}>{viewingUser.username}</code>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password PPPoE</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <code style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: showDetailPassword ? '0.02em' : '0.1em' }}>
                                  {showDetailPassword ? (viewingUser.password || '-') : '••••••••'}
                                </code>
                                <button type="button" onClick={() => setShowDetailPassword(v => !v)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title={showDetailPassword ? 'Sembunyikan' : 'Tampilkan password'}>
                                  {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="detail-grid">
                    <div className="detail-section">
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={14} /> Profil & Kontak
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>No. WhatsApp / HP</label>
                          {customerDetailData.info?.phone ? (
                            <a href={`https://wa.me/${normalizePhone(customerDetailData.info.phone)}`} target="_blank" rel="noreferrer"
                              style={{ fontWeight: '600', fontSize: '0.95rem', color: '#25d366', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                              <WhatsAppIcon size={16} color="#25d366" />{customerDetailData.info.phone}
                            </a>
                          ) : <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>—</div>}
                        </div>
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>No. KTP / Identitas</label>
                          <div style={{ fontWeight: '600' }}>{customerDetailData.info?.identity_number || '-'}</div>
                        </div>
                        {/* Foto KTP di Customer Detail */}
                        {['admin', 'technician'].includes(currentUser?.role) && (
                          <div className="detail-item">
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Foto KTP</label>
                            <button type="button" className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/users/${encodeURIComponent(customerDetailData.info.username)}/ktp`, { headers: authHeader() })
                                  if (!res.ok) { showToast('Belum ada foto KTP yang tersimpan', 'info'); return }
                                  const d = await res.json()
                                  setKtpPhotoView(d.ktp_photo)
                                } catch { showToast('Gagal memuat foto KTP', 'error') }
                              }}>
                              🪪 Lihat Foto KTP
                            </button>
                          </div>
                        )}
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Alamat Lengkap</label>
                          <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{customerDetailData.info?.address || '-'}</div>
                        </div>
                        {customerDetailData.info?.latitude && customerDetailData.info?.longitude && (
                          <div className="detail-item">
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>📍 Koordinat Lokasi</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                                {parseFloat(customerDetailData.info.latitude).toFixed(6)}, {parseFloat(customerDetailData.info.longitude).toFixed(6)}
                              </span>
                              <a
                                href={`https://www.google.com/maps?q=${customerDetailData.info.latitude},${customerDetailData.info.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ padding: '3px 8px', borderRadius: '5px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: '0.75rem', textDecoration: 'none' }}
                              >
                                Buka Google Maps ↗
                              </a>
                            </div>
                          </div>
                        )}
                        <div className="detail-item" style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Teknisi Pemasang</label>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Wand2 size={12} className="text-primary" /> {customerDetailData.info?.creator_name || 'System / Import'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Tgl Registrasi: {customerDetailData.info?.created_at ? new Date(customerDetailData.info.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wifi size={14} /> Teknis & Layanan
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Paket Aktif</label>
                          <span className="badge badge-purple" style={{ fontSize: '0.85rem' }}>{customerDetailData.info?.package_name || viewingUser?.groupname || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Wilayah (Territory)</label>
                          <div style={{ fontWeight: '600' }}>{customerDetailData.info?.territory_name || 'Umum'}</div>
                        </div>
                        <div className="detail-item">
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Parameter Koneksi</label>
                          <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {(viewingUser.connection_type === 'static' || customerDetailData.info?.connection_type === 'static') ? 'IP Static:' : 'IP:'}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '700', color: (viewingUser.connection_type === 'static' || customerDetailData.info?.connection_type === 'static') ? '#10b981' : 'inherit' }}>
                                {(viewingUser.connection_type === 'static' || customerDetailData.info?.connection_type === 'static')
                                  ? (viewingUser.static_ip || customerDetailData.info?.static_ip || '—')
                                  : (customerDetailData.info?.static_ip || 'Dynamic')}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Tipe:</span>
                              <span style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.78rem' }}>
                                {(viewingUser.connection_type === 'static' || customerDetailData.info?.connection_type === 'static') ? '🔒 Static IP' : '🔗 PPPoE'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>POP/ODP:</span>
                              <span>{customerDetailData.info?.pop || '-'}/{customerDetailData.info?.odp || '-'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="detail-item" style={{ marginTop: '8px' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Jatuh Tempo</label>
                          <div style={{ fontWeight: '600', color: 'var(--accent-color)' }}>Setiap Tanggal {customerDetailData.info?.due_date_day}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="payment-history">
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem', color: 'var(--text-muted)' }}>Histori Pembayaran</h3>
                  {customerDetailData.history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada histori pembayaran.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {customerDetailData.history.slice(0, historyLimit).map((inv, idx) => {
                        const installDate = customerDetailData.info?.install_date
                        const isNewInstallMonth = installDate && inv.period && installDate.slice(0, 7) === inv.period.slice(0, 7)
                        return (
                        <div key={inv.id} style={{
                          padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px',
                          border: `1px solid ${isNewInstallMonth ? 'rgba(16,185,129,0.4)' : inv.status === 'cancelled' ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`, position: 'relative'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Periode</div>
                                {isNewInstallMonth && (
                                  <span style={{ fontSize: '0.62rem', fontWeight: '700', padding: '1px 7px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>✦ Pasang Baru</span>
                                )}
                              </div>
                              <div style={{ fontWeight: '700' }}>{new Date(inv.period).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
                              {inv.package_name && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>📦 {inv.package_name}</div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className={`badge badge-${inv.status}`}>{inv.status === 'paid' ? 'LUNAS' : inv.status === 'cancelled' ? 'BATAL' : 'BELUM BAYAR'}</span>
                            </div>
                          </div>
                          <div style={{ paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)' }}>
                            {/* Breakdown rincian tagihan */}
                            {(() => {
                              const pkgPrice = parseFloat(inv.package_price || 0)
                              const discount = parseFloat(inv.discount || 0)
                              const addonTotal = parseFloat(inv.addon_amount || 0)
                              const hasDetail = discount > 0 || addonTotal > 0
                              return hasDetail ? (
                                <div style={{ fontSize: '0.75rem', marginBottom: '0.6rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                                    <span>📦 Paket {inv.package_name}</span>
                                    <span>Rp {pkgPrice.toLocaleString('id-ID')}</span>
                                  </div>
                                  {(inv.addons || []).map((a, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                                      <span>➕ {a.name}</span>
                                      <span>Rp {a.amount.toLocaleString('id-ID')}</span>
                                    </div>
                                  ))}
                                  {discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                      <span>🏷 Diskon</span>
                                      <span>- Rp {discount.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--border-color)', paddingTop: '3px', marginTop: '2px' }}>
                                    <span>Total</span>
                                    <span>Rp {parseFloat(inv.amount).toLocaleString('id-ID')}</span>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginBottom: '0.6rem' }}>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Nominal</div>
                                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Rp {parseFloat(inv.amount).toLocaleString('id-ID')}</div>
                                </div>
                              )
                            })()}
                            {inv.status === 'paid' && (
                              <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Dilunasi Oleh</div>
                                <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                                  {inv.payer_name || 'System'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  {new Date(inv.paid_at).toLocaleDateString('id-ID')} · {inv.payment_method === 'transfer' || inv.payment_method === 'online' ? '🏦 Transfer' : '💵 Cash'}
                                </div>
                                {(inv.payment_method === 'transfer' || inv.payment_method === 'online') && inv.collector_proof && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewCollectorProof(inv.id)}
                                    style={{ marginTop: '6px', fontSize: '0.7rem', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--accent-color)', background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: '600' }}
                                  >
                                    📎 Lihat Bukti
                                  </button>
                                )}
                              </div>
                            )}
                            {inv.status === 'cancelled' && inv.cancel_reason && (
                              <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Alasan Batal</div>
                                <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>{inv.cancel_reason}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                      {customerDetailData.history.length > historyLimit && (
                        <button
                          onClick={() => setHistoryLimit(h => h + 6)}
                          style={{ width: '100%', padding: '0.625rem', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-color)'; e.currentTarget.style.color = 'var(--primary-color)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                        >
                          Muat lebih banyak ({customerDetailData.history.length - historyLimit} lagi)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Log Perubahan Paket */}
                  {customerDetailData.package_logs?.length > 0 && (
                    <div style={{ marginTop: '2rem' }}>
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-muted)' }}>Riwayat Ganti Paket</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {customerDetailData.package_logs.map(log => (
                          <div key={log.id} style={{ padding: '0.875rem 1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                                <span style={{ color: '#6b7280' }}>{log.old_package || '—'}</span>
                                <span style={{ margin: '0 8px', color: 'var(--primary-color)' }}>→</span>
                                <span>{log.new_package || '—'}</span>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {new Date(log.changed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                            {(log.old_amount || log.new_amount) && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Rp {Number(log.old_amount).toLocaleString('id-ID')} → Rp {Number(log.new_amount).toLocaleString('id-ID')}
                                {log.invoice_updated ? <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>· Tagihan diperbarui</span> : ''}
                              </div>
                            )}
                            {log.reason && (
                              <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: '4px', fontStyle: 'italic' }}>"{log.reason}"</div>
                            )}
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>Oleh: {log.changed_by}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="detail-footer">
              <button className="btn btn-outline" onClick={() => setShowUserDetailModal(false)}>Tutup</button>
              {currentUser?.role === 'admin' && (
                <button className="btn btn-primary" onClick={() => { setShowUserDetailModal(false); prepareEditUser(viewingUser); }}>
                  Edit Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Janji Bayar Modal */}
      {showPromiseModal && promiseTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target !== e.currentTarget) return; setShowPromiseModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title"><CalendarCheck size={18} style={{ marginRight: 8, color: '#10b981' }} />Buat Janji Bayar</h2>
              <button className="icon-btn" onClick={() => setShowPromiseModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{promiseTarget.fullname || promiseTarget.username}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>ID: {promiseTarget.customer_id || promiseTarget.username} · {promiseTarget.phone || '-'}</div>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                Pelanggan berjanji akan membayar paling lambat tanggal di bawah. Isolir akan otomatis dicabut sekarang, dan <strong>otomatis diisolir kembali</strong> jika belum bayar saat tanggal tersebut tiba.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Batas Tanggal Pembayaran</label>
                <input type="date" className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  value={promiseDate}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  onChange={e => setPromiseDate(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Catatan (opsional)</label>
                <input type="text" className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Misal: menunggu gaji tanggal 29"
                  value={promiseNotes}
                  onChange={e => setPromiseNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPromiseModal(false)}>Batal</button>
                <button className="btn btn-primary" style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
                  disabled={!promiseDate || promiseLoading} onClick={handleCreatePromise}>
                  {promiseLoading ? 'Menyimpan...' : 'Buat Janji & Buka Isolir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set PIN Portal Modal */}
      {showSetPinModal && pinTargetUser && (
        <div className="modal-overlay" onClick={e => { if (e.target !== e.currentTarget) return; setShowSetPinModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title"><KeyRound size={18} style={{ marginRight: 8, color: '#8b5cf6' }} />Set PIN Portal</h2>
              <button className="icon-btn" onClick={() => setShowSetPinModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Atur PIN 6 digit untuk akun portal pelanggan <strong style={{ color: 'var(--text-main)' }}>{pinTargetUser.fullname || pinTargetUser.username}</strong>.
                PIN ini digunakan untuk login ke portal pelanggan bersama nomor HP.
              </p>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">PIN Baru (6 digit angka)</label>
                <input
                  className="search-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="••••••"
                  value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ width: '100%', paddingLeft: '1rem', letterSpacing: '0.25em', fontSize: '1.1rem' }}
                  autoFocus
                />
                <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Gunakan PIN yang mudah diingat pelanggan tapi tidak mudah ditebak orang lain.
                </small>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSetPinModal(false)}>
                  Batal
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  disabled={pinValue.length < 6 || pinLoading}
                  onClick={handleSetPin}
                >
                  {pinLoading ? 'Menyimpan...' : 'Simpan PIN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal NIK Duplikat */}
      {showDuplicateNikModal && (
        <div className="modal-overlay" onClick={e => { if (e.target !== e.currentTarget) return; setShowDuplicateNikModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title"><AlertCircle size={18} style={{ marginRight: 8, color: '#f59e0b' }} />NIK Duplikat</h2>
              <button className="icon-btn" onClick={() => setShowDuplicateNikModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {duplicateNiks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Tidak ada NIK duplikat</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Semua data NIK pelanggan unik.</div>
                </div>
              ) : (
                <>
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                    Ditemukan <strong>{duplicateNiks.length}</strong> NIK yang dipakai lebih dari satu pelanggan. Buka modal edit pelanggan terkait dan kosongkan / perbaiki NIK yang salah.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
                    {duplicateNiks.map((d, i) => (
                      <div key={i} style={{ padding: '0.875rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>NIK: <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{d.identity_number}</span> — {d.count}× dipakai</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>
                          {d.fullnames} <span style={{ color: 'var(--text-muted)' }}>({d.usernames})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDuplicateNikModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Waiting List Modals --- */}

      {/* Modal Tambah / Edit Waiting List */}
      {showWlModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 110000 }} onClick={e => { if (e.target === e.currentTarget) setShowWlModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} /> {wlEditEntry ? 'Edit Antrian' : 'Tambah Antrian Baru'}
              </h2>
              <button className="icon-btn" onClick={() => setShowWlModal(false)}><X size={24} /></button>
            </div>

            <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Nama */}
              <div className="form-group">
                <label>Nama Lengkap <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Nama calon pelanggan"
                  value={wlForm.fullname}
                  onChange={e => setWlForm(f => ({ ...f, fullname: e.target.value }))} />
              </div>

              {/* Paket Internet */}
              <div className="form-group">
                <label>Paket Internet <span style={{ color: '#ef4444' }}>*</span></label>
                <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                  value={wlForm.groupname}
                  onChange={e => setWlForm(f => ({ ...f, groupname: e.target.value }))}>
                  <option value="">-- Pilih Paket --</option>
                  {profiles.map(p => <option key={p.id} value={p.name}>{p.name}{p.rate_limit ? ` (${formatSpeed(p.rate_limit)})` : ''}{p.price ? ` — Rp ${Number(p.price).toLocaleString('id-ID')}` : ''}</option>)}
                </select>
                {wlForm.groupname && (() => { const p = profiles.find(x => x.name === wlForm.groupname); return p?.price ? <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: '600' }}>💰 Rp {Number(p.price).toLocaleString('id-ID')}/bulan</div> : null })()}
              </div>

              {/* Telepon & NIK */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>No. Telepon</label>
                  <input type="text" inputMode="numeric" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                    placeholder="628xxxxxxxxxx"
                    value={wlForm.phone}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, '')
                      if (v.startsWith('0')) v = '62' + v.slice(1)
                      setWlForm(f => ({ ...f, phone: v }))
                    }} />
                </div>
                <div className="form-group">
                  <label>NIK / No. KTP <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(16 digit)</span></label>
                  <input type="text" inputMode="numeric" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                    placeholder="3201xxxxxxxxxxxx"
                    maxLength={16}
                    value={wlForm.identity_number}
                    onChange={e => setWlForm(f => ({ ...f, identity_number: e.target.value.replace(/\D/g, '').slice(0, 16) }))} />
                  {wlForm.identity_number && wlForm.identity_number.length > 0 && wlForm.identity_number.length < 16 && (
                    <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.2rem' }}>⚠️ NIK harus 16 digit ({wlForm.identity_number.length}/16)</div>
                  )}
                </div>
              </div>

              {/* Foto KTP */}
              <div className="form-group">
                <label>Foto KTP {!wlEditEntry && <span style={{ color: '#ef4444' }}>*</span>}</label>
                {wlForm.ktp_photo ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={wlForm.ktp_photo} alt="Preview KTP" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' }} />
                    <button onClick={() => setWlForm(f => ({ ...f, ktp_photo: null }))}
                      style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '1rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleWlPhotoChange} />
                    📷 Ambil foto / pilih gambar KTP
                  </label>
                )}
              </div>

              {/* Alamat — cascading wilayah */}
              <div className="form-group">
                <label>Alamat</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Provinsi</small>
                    <SearchableSelect options={wlWilayahData.provinsi} value={wlSelWilayah.prov}
                      onSelect={(kode, nama) => handleWlSelWilayah('prov', kode, nama)}
                      placeholder="Cari provinsi..." disabled={false} />
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kabupaten / Kota</small>
                    <SearchableSelect options={wlWilayahData.kabupaten} value={wlSelWilayah.kab}
                      onSelect={(kode, nama) => handleWlSelWilayah('kab', kode, nama)}
                      placeholder="Cari kabupaten..." disabled={!wlSelWilayah.prov} />
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kecamatan</small>
                    <SearchableSelect options={wlWilayahData.kecamatan} value={wlSelWilayah.kec}
                      onSelect={(kode, nama) => handleWlSelWilayah('kec', kode, nama)}
                      placeholder="Cari kecamatan..." disabled={!wlSelWilayah.kab} />
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kelurahan / Desa</small>
                    <SearchableSelect options={wlWilayahData.kelurahan} value={wlSelWilayah.kel}
                      onSelect={(kode, nama) => handleWlSelWilayah('kel', kode, nama)}
                      placeholder="Cari kelurahan..." disabled={!wlSelWilayah.kec} />
                  </div>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Dusun / Kampung</small>
                  {wlDusunPicker && wlDusunOptions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                      {(() => {
                        const groups = {}
                        wlDusunOptions.forEach(opt => {
                          const key = opt.id
                          if (!groups[key]) groups[key] = { name: opt.name, collector: opt.collector_name, opts: [] }
                          groups[key].opts.push(opt)
                        })
                        const groupKeys = Object.keys(groups)
                        const multiGroup = groupKeys.length > 1
                        return groupKeys.map(gKey => (
                          <div key={gKey}>
                            {multiGroup && (
                              <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 4px', marginBottom: '3px' }}>
                                {groups[gKey].collector ? `Kolektor: ${groups[gKey].collector}` : groups[gKey].name}
                              </div>
                            )}
                            {groups[gKey].opts.map(opt => (
                              <button
                                key={opt.area_id}
                                type="button"
                                className={`btn ${String(wlForm.territory_id) === String(opt.territory_id || opt.id) && wlSelWilayah.dusun === opt.dusun_nama ? 'btn-primary' : 'btn-outline'}`}
                                style={{ textAlign: 'left', justifyContent: 'flex-start', gap: '8px', padding: '0.5rem 0.85rem', width: '100%' }}
                                onClick={() => {
                                  setWlSelWilayah(s => ({ ...s, dusun: opt.dusun_nama }))
                                  setWlForm(f => ({ ...f, territory_id: String(opt.territory_id || opt.id), territory_area_id: String(opt.area_id || opt.id) }))
                                }}
                              >
                                <MapPin size={13} />
                                <span style={{ fontWeight: '600' }}>{opt.dusun_nama}</span>
                                {opt.collector_name && <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 'auto' }}>— {opt.collector_name}</span>}
                              </button>
                            ))}
                          </div>
                        ))
                      })()}
                    </div>
                  ) : (
                    <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                      placeholder="Contoh: Cibogo, Sukamaju..."
                      value={wlSelWilayah.dusun}
                      onChange={e => setWlSelWilayah(s => ({ ...s, dusun: e.target.value }))} />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RT</small>
                    <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                      placeholder="001"
                      value={wlSelWilayah.rt}
                      onChange={e => setWlSelWilayah(s => ({ ...s, rt: e.target.value }))} />
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RW</small>
                    <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                      placeholder="005"
                      value={wlSelWilayah.rw}
                      onChange={e => setWlSelWilayah(s => ({ ...s, rw: e.target.value }))} />
                  </div>
                </div>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Detail: Jl. Merdeka No. 5 (opsional)"
                  value={wlSelWilayah.detail}
                  onChange={e => setWlSelWilayah(s => ({ ...s, detail: e.target.value }))} />
                {composeAddress(wlSelWilayah) && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    📍 {composeAddress(wlSelWilayah)}
                  </div>
                )}
                {/* Info kolektor */}
                {wlForm.territory_id && !wlDusunPicker && (() => {
                  const area = collectorAreas.find(a => String(a.territory_id) === String(wlForm.territory_id))
                  const collectorName = area?.collector_name || territories.find(t => String(t.id) === String(wlForm.territory_id))?.collector_name
                  if (!collectorName) return null
                  return (
                    <div style={{ marginTop: '0.4rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
                      <User size={12} />
                      <span>Kolektor: <strong>{collectorName}</strong></span>
                    </div>
                  )
                })()}
              </div>

              {/* Koordinat Lokasi */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  📍 Koordinat Lokasi <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>— salin dari Google Maps, tempel di sini</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '1rem', paddingRight: '2.5rem' }}
                    placeholder="cth: -6.917464, 107.619123"
                    value={wlForm.latitude && wlForm.longitude ? `${wlForm.latitude}, ${wlForm.longitude}` : ''}
                    onChange={e => {
                      const raw = e.target.value
                      const match = raw.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
                      if (match) {
                        setWlForm(f => ({ ...f, latitude: match[1], longitude: match[2] }))
                      } else if (!raw.trim()) {
                        setWlForm(f => ({ ...f, latitude: '', longitude: '' }))
                      }
                    }}
                  />
                  {wlForm.latitude && wlForm.longitude && (
                    <a href={`https://www.google.com/maps?q=${wlForm.latitude},${wlForm.longitude}`}
                      target="_blank" rel="noreferrer" title="Verifikasi di Google Maps"
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', textDecoration: 'none' }}>🗺️</a>
                  )}
                </div>
                {!wlForm.latitude && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444' }}>
                    ⚠️ Buka Google Maps → cari lokasi → tahan titik → salin koordinat → tempel di atas
                  </div>
                )}
                {wlForm.latitude && wlForm.longitude && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✓ {Number(wlForm.latitude).toFixed(6)}, {Number(wlForm.longitude).toFixed(6)}
                    <a href={`https://www.google.com/maps?q=${wlForm.latitude},${wlForm.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: '0.75rem' }}>Verifikasi di Maps →</a>
                  </div>
                )}
              </div>

              {/* Catatan */}
              <div className="form-group">
                <label>Catatan</label>
                <textarea className="search-input" style={{ width: '100%', paddingLeft: '1rem', minHeight: '72px', resize: 'vertical' }}
                  placeholder="Catatan tambahan (opsional)"
                  value={wlForm.notes}
                  onChange={e => setWlForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Sales */}
              {['admin', 'noc'].includes(currentUser?.role) && (
                <div className="form-group">
                  <label>Sales <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opsional)</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                    placeholder="Nama sales yang mereferensikan"
                    value={wlForm.sales}
                    onChange={e => setWlForm(f => ({ ...f, sales: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowWlModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={submitWlForm} disabled={wlFormLoading}>
                {wlFormLoading ? 'Menyimpan...' : wlEditEntry ? 'Simpan Perubahan' : 'Tambah ke Antrian'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lihat Foto KTP Waiting List */}
      {showWlKtpModal && wlKtpPreview && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 110000 }} onClick={e => { if (e.target === e.currentTarget) { setShowWlKtpModal(false); setWlKtpPreview(null) } }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <img src={wlKtpPreview} alt="Foto KTP" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', objectFit: 'contain' }} />
            <button onClick={() => { setShowWlKtpModal(false); setWlKtpPreview(null) }}
              style={{ position: 'absolute', top: '-12px', right: '-12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>✕</button>
          </div>
        </div>
      )}

      {/* Modal Assign Teknisi ke Waiting List (single & bulk) */}
      {showWlAssignModal && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget) setShowWlAssignModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>👤</span>
                {wlAssignTarget ? 'Tugaskan Teknisi' : `Tugaskan ${wlSelectedIds.length} Pelanggan`}
              </h2>
              <button className="icon-btn" onClick={() => setShowWlAssignModal(false)}><X size={20} /></button>
            </div>

            {/* Info pelanggan — single mode */}
            {wlAssignTarget && (
              <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{wlAssignTarget.fullname}</div>
                {wlAssignTarget.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{wlAssignTarget.address}</div>}
                {wlAssignTarget.groupname && <span className="badge badge-purple" style={{ fontSize: '0.7rem', marginTop: '5px', display: 'inline-block' }}>{wlAssignTarget.groupname}</span>}
              </div>
            )}

            {/* Daftar pelanggan — bulk mode */}
            {!wlAssignTarget && (
              <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', maxHeight: '130px', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {wlSelectedIds.length} calon pelanggan dipilih
                </div>
                {waitingList.filter(w => wlSelectedIds.includes(w.id)).map((w, i, arr) => (
                  <div key={w.id} style={{ fontSize: '0.82rem', padding: '3px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-color)' : 'none', display: 'flex', gap: '6px' }}>
                    <span style={{ fontWeight: '600' }}>{w.fullname}</span>
                    {w.address && <span style={{ color: 'var(--text-muted)' }}>— {w.address}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Daftar teknisi dengan checkbox */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.6rem', display: 'block' }}>
                Pilih Teknisi <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(boleh lebih dari satu)</span>
              </label>
              {technicianList.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Memuat daftar teknisi...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                  {technicianList.map(t => {
                    const checked = wlAssignTechUsernames.includes(t.username)
                    return (
                      <label key={t.username} onClick={() => toggleWlTech(t.username)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '0.6rem 0.85rem',
                        borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s',
                        background: checked ? 'rgba(37,99,235,0.1)' : 'var(--bg-secondary)',
                        border: checked ? '1px solid rgba(37,99,235,0.35)' : '1px solid var(--border-color)',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => {}} style={{ width: '15px', height: '15px', accentColor: 'var(--primary-color)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{t.fullname || t.username}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{t.username}</div>
                        </div>
                        {checked && <span style={{ fontSize: '0.7rem', background: 'rgba(37,99,235,0.15)', color: 'var(--primary-color)', borderRadius: '99px', padding: '2px 8px', fontWeight: '700', flexShrink: 0 }}>Dipilih</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {wlAssignTechUsernames.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '0.6rem 0.85rem', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🔔 {wlAssignTechUsernames.length} teknisi akan mendapat notifikasi tugas pemasangan.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '1.25rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowWlAssignModal(false)}>Batal</button>
              {wlAssignTarget && wlAssignTarget.assigned_technicians?.length > 0 && wlAssignTechUsernames.length === 0 && (
                <button className="btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                  onClick={submitWlAssign} disabled={wlAssignLoading}>
                  {wlAssignLoading ? 'Menghapus...' : 'Hapus Penugasan'}
                </button>
              )}
              {wlAssignTechUsernames.length > 0 && (
                <button className="btn btn-primary" style={{ flex: 1 }}
                  onClick={submitWlAssign} disabled={wlAssignLoading}>
                  {wlAssignLoading ? 'Menyimpan...' : `Tugaskan (${wlAssignTechUsernames.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Pilih dari Waiting List (Teknisi PSB) */}
      {showWlPickerModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 110000 }} onClick={e => { if (e.target === e.currentTarget) setShowWlPickerModal(false) }}>
          <div className="modal-content" style={{ maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} /> Pilih dari Waiting List
              </h2>
              <button className="icon-btn" onClick={() => setShowWlPickerModal(false)}><X size={24} /></button>
            </div>
            <div style={{ padding: '0.75rem 0' }}>
              {wlPickerList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <ClipboardList size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.75rem' }} />
                  Belum ada pelanggan yang ditugaskan ke kamu.<br />
                  <small>Hubungi NOC/Admin untuk mendapat penugasan pemasangan.</small>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {wlPickerList.map(w => (
                    <div key={w.id}
                      onClick={() => { psbFromWlRef.current = true; selectWlForPsb(w) }}
                      style={{ padding: '0.875rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
                      <div style={{ fontWeight: 600, marginBottom: '2px' }}>{w.fullname}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {w.phone && <span>{w.phone} · </span>}
                        {w.address && <span>📍 {w.address}</span>}
                      </div>
                      {w.notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>{w.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowWlPickerModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Setoran Kolektor */}
      {showSettlementDetail && settlementDetail && (
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget) setShowSettlementDetail(false) }}>
          <div className="modal-content" style={{ maxWidth: '620px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem' }}>
              <div>
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BadgeCent size={20} /> {settlementDetail.collector?.fullname || settlementDetail.collector?.username}
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Settlement {new Date(settlementDate).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  {settlementDetail.confirmation && (
                    <span style={{ marginLeft: '8px', color: '#059669', fontWeight: '600' }}>
                      ✓ Dikonfirmasi oleh {settlementDetail.confirmation.confirmed_by}
                    </span>
                  )}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowSettlementDetail(false)}><X size={20} /></button>
            </div>

            {/* Summary */}
            {(() => {
              const invs = settlementDetail.invoices.filter(i => !i.cancelled_at)
              const total = invs.reduce((s, i) => s + Number(i.amount), 0)
              const cash = invs.filter(i => i.payment_method === 'cash' || !i.payment_method).reduce((s, i) => s + Number(i.amount), 0)
              const transfer = invs.filter(i => i.payment_method === 'transfer' || i.payment_method === 'online').reduce((s, i) => s + Number(i.amount), 0)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', borderBottom: '1px solid var(--border-color)' }}>
                  {[['Total', `Rp ${total.toLocaleString('id-ID')}`, '#2563eb'],
                    ['💵 Cash', `Rp ${cash.toLocaleString('id-ID')}`, '#10b981'],
                    ['🏦 Transfer', `Rp ${transfer.toLocaleString('id-ID')}`, '#8b5cf6']].map(([l, v, c]) => (
                    <div key={l} style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{l}</div>
                      <div style={{ fontWeight: '800', fontSize: '0.95rem', color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '1.25rem' }}>Pelanggan</th>
                    <th>Periode</th>
                    <th>Nominal</th>
                    <th>Metode</th>
                    <th>Jam Bayar</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementDetail.invoices.map(inv => (
                    <tr key={inv.id} style={inv.cancelled_at ? { opacity: 0.45, textDecoration: 'line-through', background: 'rgba(239,68,68,0.04)' } : {}}>
                      <td style={{ paddingLeft: '1.25rem' }}>
                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{inv.fullname || inv.username}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{inv.customer_id || inv.username}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{inv.period}</td>
                      <td style={{ fontWeight: '700', fontSize: '0.85rem' }}>Rp {Number(inv.amount).toLocaleString('id-ID')}</td>
                      <td>
                        {inv.payment_method === 'cash' || !inv.payment_method
                          ? <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', fontSize: '0.7rem' }}>Cash</span>
                          : inv.payment_method === 'discount'
                            ? <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', fontSize: '0.7rem' }}>Diskon</span>
                            : <span className="badge" style={{ background: 'rgba(139,92,246,0.1)', color: '#7c3aed', fontSize: '0.7rem' }}>Transfer</span>}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {inv.paid_at ? new Date(inv.paid_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        {inv.paid_at && new Date(inv.paid_at).getHours() >= 17 && (
                          <span style={{ marginLeft: '4px', color: '#f59e0b', fontSize: '0.65rem', fontWeight: '700' }}>⏰ Late</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {!inv.cancelled_at && (
                            <button className="btn btn-outline" style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#ef4444', borderColor: '#ef4444' }}
                              onClick={() => { setCancelInvoiceTarget(inv); setCancelInvoiceReason('') }}>
                              Batalkan
                            </button>
                          )}
                          {inv.cancelled_at && (
                            <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>Dibatalkan</span>
                          )}
                          <button className="btn btn-outline" style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#9ca3af', borderColor: '#9ca3af' }}
                            title="Hapus invoice permanen"
                            onClick={() => handleDeleteInvoice(inv)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', background: 'var(--bg-secondary)' }}>
              <button className="btn btn-outline" onClick={() => setShowSettlementDetail(false)}>Tutup</button>
              {!settlementDetail.confirmation ? (
                <button className="btn" style={{ background: '#10b981', color: '#fff', border: 'none' }}
                  onClick={() => confirmSettlement(settlementDetail.collector.id, settlementDate)}
                  disabled={settlementConfirmLoading}>
                  ✓ Konfirmasi Setoran Ini
                </button>
              ) : (
                <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#ef4444' }}
                  onClick={() => unconfirmSettlement(settlementDetail.collector.id, settlementDate)}>
                  Hapus Konfirmasi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Batalkan Pelunasan */}
      {cancelInvoiceTarget && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 120000 }} onClick={e => { if (e.target === e.currentTarget) setCancelInvoiceTarget(null) }}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={20} style={{ color: '#ef4444' }} /> Batalkan Pelunasan
              </h2>
              <button className="icon-btn" onClick={() => setCancelInvoiceTarget(null)}><X size={20} /></button>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: '700' }}>{cancelInvoiceTarget.fullname || cancelInvoiceTarget.username}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Periode {cancelInvoiceTarget.period} · Rp {Number(cancelInvoiceTarget.amount).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.5rem', display: 'block' }}>
                Alasan Pembatalan <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea className="search-input" rows={3}
                style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical' }}
                placeholder="Contoh: Kolektor kurang setor Rp 50.000 — akan disesuaikan besok"
                value={cancelInvoiceReason}
                onChange={e => setCancelInvoiceReason(e.target.value)}
                autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '1.25rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setCancelInvoiceTarget(null)}>Batal</button>
              <button className="btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={() => {
                  if (!cancelInvoiceReason.trim()) return showToast('Alasan wajib diisi', 'warning')
                  requestCritical(
                    'Batalkan Pelunasan',
                    `Kamu akan membatalkan pelunasan ${cancelInvoiceTarget.fullname || cancelInvoiceTarget.username} (${cancelInvoiceTarget.period}). Tindakan ini tidak dapat diurungkan.`,
                    submitCancelInvoice
                  )
                }}
                disabled={!cancelInvoiceReason.trim()}>
                Batalkan Pelunasan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && <NotificationToast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />}
    </div>
    </NavigationContext.Provider>
    </UIContext.Provider>
    </AuthContext.Provider>
  )
}

// Reusable Notification Toast Component
const NotificationToast = ({ message, type, onClose }) => {
  return createPortal(
    <div className="toast-container">
      <div className={`toast toast-${type}`}>
        <div className="toast-icon">
          {type === 'success' ? <CheckCircle size={20} color="#10b981" /> :
            type === 'error' ? <XCircle size={20} color="#ef4444" /> :
              <AlertCircle size={20} color="#f59e0b" />}
        </div>
        <div className="toast-message">{message}</div>
        <div className="toast-close" onClick={onClose}>
          <X size={16} />
        </div>
      </div>
    </div>
  , document.body)
}

export default App
