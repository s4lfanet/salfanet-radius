/**
 * Network Feature — Domain Types
 *
 * @module features/network/types
 */

import type { Prisma } from '@prisma/client'

export type Router = Prisma.routerGetPayload<Record<string, never>>
export type VpnServer = Prisma.vpnServerGetPayload<Record<string, never>>
export type VpnClient = Prisma.vpnClientGetPayload<Record<string, never>>

export type RouterWithStats = Router & {
  userCount: number
  voucherCount: number
}

export type NetworkTopology = {
  routers: RouterWithStats[]
  vpnServers: VpnServer[]
  vpnClients: VpnClient[]
}
