/**
 * Shared WireGuard utilities used by both:
 *   - /api/network/vps-wg-peer  (manages peers via API)
 *   - /api/network/vpn-client   (DELETE handler removes peer directly)
 *
 * Functions here are server-only (Node.js fs/child_process).
 */

import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile } from 'fs/promises'

const exec = promisify(execCb)

export const WG_IFACE = process.env.WG_IFACE || 'wg0'
export const WG_CONF  = `/etc/wireguard/${WG_IFACE}.conf`

/**
 * Remove a [Peer] block (and its optional leading "# Peer:" comment) from wg.conf,
 * then apply the change with `wg syncconf` (zero-downtime).
 */
export async function removePeerFromConf(pubKey: string): Promise<void> {
  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { return }

  const escaped = pubKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `(#[^\n]*\\n)?\\[Peer\\]\\n(?:[^\\n]*\\n)*?PublicKey\\s*=\\s*${escaped}[^\\n]*\\n(?:[^\\n]*\\n)*?(?=\\n|$)`,
    'g',
  )
  const cleaned = conf.replace(re, '')
  await writeFile(WG_CONF, cleaned, 'utf8')

  try {
    await exec(`wg syncconf ${WG_IFACE} <(wg-quick strip ${WG_IFACE})`, { shell: '/bin/bash' })
  } catch {
    try { await exec(`wg set ${WG_IFACE} peer ${pubKey} remove`) } catch { /* ignore */ }
  }
}
