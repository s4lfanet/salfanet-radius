/**
 * Notifications Feature — Zod Schemas
 *
 * @module features/notifications/schemas
 */

import { z } from 'zod'

export const sendWhatsAppSchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(4096),
})

export const sendBroadcastSchema = z.object({
  target: z.enum(['all', 'active', 'expired', 'isolated']),
  channels: z.array(z.enum(['whatsapp', 'email', 'push'])).min(1),
  subject: z.string().optional(),
  message: z.string().min(1).max(4096),
})

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  text: z.string().optional(),
})

export const telegramMessageSchema = z.object({
  message: z.string().min(1).max(4096),
  parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
})

export type SendWhatsAppInput = z.infer<typeof sendWhatsAppSchema>
export type SendBroadcastInput = z.infer<typeof sendBroadcastSchema>
export type SendEmailInput = z.infer<typeof sendEmailSchema>
export type TelegramMessageInput = z.infer<typeof telegramMessageSchema>
