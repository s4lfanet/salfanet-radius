// ─── Formatting Utilities ─────────────────────────────────────────────────────

/**
 * Normalisasi nomor HP ke format internasional (62xxx)
 */
export const normalizePhone = (phone) => {
  if (!phone) return ''
  let num = String(phone).replace(/[^0-9]/g, '')
  if (num.startsWith('62')) return num
  if (num.startsWith('0')) return '62' + num.slice(1)
  if (num.startsWith('8')) return '62' + num
  return num
}

/**
 * Format angka ke Rupiah
 * contoh: 120000 → "Rp 120.000"
 */
export const formatRupiah = (amount) => {
  if (!amount && amount !== 0) return '-'
  return 'Rp ' + Number(amount).toLocaleString('id-ID')
}

/**
 * Format angka ke singkatan (120000 → "120rb", 1500000 → "1.5jt")
 */
export const formatRupiahShort = (amount) => {
  const n = Number(amount)
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  return `Rp ${(n / 1_000).toFixed(0)}rb`
}

/**
 * Format periode YYYY-MM ke label Indonesia
 * contoh: "2026-06" → "Juni 2026"
 */
export const monthLabel = (m) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(y, mo - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

/**
 * Format tanggal ke lokal Indonesia
 * contoh: "2026-06-15T08:00:00" → "15 Jun 2026, 08:00"
 */
export const formatDate = (dateStr, opts = {}) => {
  if (!dateStr) return '-'
  const defaults = { day: '2-digit', month: 'short', year: 'numeric' }
  return new Date(dateStr).toLocaleDateString('id-ID', { ...defaults, ...opts })
}

/**
 * Dapatkan periode bulan berjalan dalam format YYYY-MM (timezone Jakarta)
 */
export const getLocalPeriod = () => {
  const now = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  return local.toISOString().substring(0, 7)
}

/**
 * Hitung N bulan sebelum periode tertentu
 * contoh: prevPeriod("2026-06", 1) → "2026-05"
 */
export const prevPeriod = (period, n = 1) => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return d.toISOString().substring(0, 7)
}
