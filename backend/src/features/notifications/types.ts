/**
 * Notifications Feature — Domain Types
 *
 * @module features/notifications/types
 */

import type { Prisma } from '@prisma/client'

export type NotificationChannel = 'whatsapp' | 'email' | 'telegram' | 'push' | 'sms'

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ'

export type BroadcastTarget = 'all' | 'active' | 'expired' | 'isolated'

export type Notification = Prisma.notificationGetPayload<Record<string, never>>
