/**
 * Render voucher template with actual data
 * Replaces Smarty-style variables like {$vs['code']}, {$_c['currency_code']}, etc.
 */

interface VoucherData {
  code: string
  secret?: string
  total: number
  profile?: {
    name?: string
    validityValue?: number
    validityUnit?: string
    usageQuota?: number | null
    usageDuration?: number | null
  }
  router?: {
    name?: string
    shortname?: string
  }
  voucherType?: string // 'same' or 'different'
}

interface RenderContext {
  currencyCode?: string
  companyName?: string
}

export function renderVoucherTemplate(
  templateHtml: string,
  vouchers: VoucherData[],
  context?: RenderContext
): string {
  const currencyCode = context?.currencyCode || 'IDR'
  const companyName = context?.companyName || 'SALFANET'

  // Split template into header, body, footer
  const headerMatch = templateHtml.match(/\{include file="rad-template-header\.tpl"\}([\s\S]*?)\{foreach/)
  const foreachMatch = templateHtml.match(/\{foreach \$v as \$vs\}([\s\S]*?)\{\/foreach\}/)
  const footerMatch = templateHtml.match(/\{\/foreach\}([\s\S]*?)\{include file="rad-template-footer\.tpl"\}/)

  const header = headerMatch ? headerMatch[1].trim() : ''
  const bodyTemplate = foreachMatch ? foreachMatch[1].trim() : templateHtml
  const footer = footerMatch ? footerMatch[1].trim() : ''

  // Render each voucher
  const renderedVouchers = vouchers.map(vs => {
    let html = bodyTemplate

    // Replace voucher variables
    html = html.replace(/\{\$vs\['code'\]\}/g, vs.code)
    html = html.replace(/\{\$vs\['secret'\]\}/g, vs.secret !== undefined ? vs.secret : '')
    html = html.replace(/\{\$vs\['total'\]\}/g, vs.total.toString())

    // Replace profile info
    html = html.replace(/\{\$vs\['profile_name'\]\}/g, vs.profile?.name || '')

    // Replace validity - format as "X Unit"
    const validityValue = vs.profile?.validityValue || 0
    const validityUnit = vs.profile?.validityUnit || ''
    const validityFormatted = formatValidity(validityValue, validityUnit)
    html = html.replace(/\{\$vs\['validity'\]\}/g, validityFormatted)

    // Replace quota and duration
    const quotaFormatted = formatQuota(vs.profile?.usageQuota)
    const durationFormatted = formatDuration(vs.profile?.usageDuration)
    html = html.replace(/\{\$vs\['quota'\]\}/g, quotaFormatted)
    html = html.replace(/\{\$vs\['duration'\]\}/g, durationFormatted)

    // Replace router/NAS info
    html = html.replace(/\{\$vs\['router_name'\]\}/g, vs.router?.name || companyName)
    html = html.replace(/\{\$vs\['router_shortname'\]\}/g, vs.router?.shortname || '')

    // Replace conditional for code/secret (same username=password vs different)
    html = html.replace(
      /\{if \$vs\['code'\] eq \$vs\['secret'\]\}([\s\S]*?)\{else\}([\s\S]*?)\{\/if\}/g,
      (_, ifBlock, elseBlock) => {
        const isSame = !vs.secret || vs.code === vs.secret
        return isSame ? ifBlock : elseBlock
      }
    )

    // Replace number_format function
    html = html.replace(
      /\{number_format\(\$vs\['total'\],\s*(\d+),\s*'([^']*)',\s*'([^']*)'\)\}/g,
      (_, decimals, decPoint, thousandsSep) => {
        return formatNumber(vs.total, parseInt(decimals), decPoint, thousandsSep)
      }
    )

    // Replace context variables
    html = html.replace(/\{\$_c\['currency_code'\]\}/g, currencyCode)
    html = html.replace(/\{company_name\}/g, companyName)

    return html
  }).join('\n')

  // Combine header + vouchers + footer
  return `${header}\n${renderedVouchers}\n${footer}`
}

/**
 * Format validity display
 */
function formatValidity(value: number, unit: string): string {
  if (!value || !unit) return ''

  const unitMap: Record<string, string> = {
    'MINUTES': 'Menit',
    'HOURS': 'Jam',
    'DAYS': 'Hari',
    'WEEKS': 'Minggu',
    'MONTHS': 'Bulan'
  }

  return `${value} ${unitMap[unit] || unit}`
}

/**
 * Format quota display (bytes to GB/MB)
 */
function formatQuota(bytes: number | null | undefined): string {
  if (!bytes) return 'Unlimited'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

/**
 * Format duration display (minutes to hours/minutes)
 */
function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return 'Unlimited'
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}j ${remainingMinutes}m` : `${hours} Jam`
  }
  return `${minutes} Menit`
}

/**
 * Format number with thousand separators
 */
function formatNumber(
  num: number,
  decimals: number = 0,
  decPoint: string = '.',
  thousandsSep: string = ','
): string {
  const parts = num.toFixed(decimals).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)
  return parts.join(decPoint)
}

/**
 * Get printable HTML with proper styling for print
 */
export function getPrintableHtml(renderedHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Print Vouchers</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A4 portrait;
      margin: 5mm;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 5px;
      background: #fff;
    }

    .voucher-container {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      align-content: flex-start;
      width: 100%;
    }

    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        padding: 0;
      }

      body {
        padding: 3mm;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .voucher-container {
        width: 100%;
        min-height: 291mm;
        display: flex;
        flex-wrap: wrap;
        align-content: space-between;
      }
    }
  </style>
</head>
<body>
<div class="voucher-container">
${renderedHtml}
</div>
</body>
</html>
  `.trim()
}
