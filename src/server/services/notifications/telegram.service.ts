import * as fs from 'fs/promises';
import * as path from 'path';
import { formatInTimeZone } from 'date-fns-tz';

interface TelegramSendOptions {
  botToken: string;
  chatId: string;
  topicId?: string; // Message thread ID for topics
}

/**
 * Send a text message to Telegram (optionally to a specific topic)
 */
export async function sendTelegramMessage(
  options: TelegramSendOptions,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { botToken, chatId, topicId } = options;
    
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const body: any = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    };
    
    // Add message_thread_id for topic support
    if (topicId) {
      body.message_thread_id = parseInt(topicId);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('[Telegram] Send message error:', data);
      return {
        success: false,
        error: data.description || 'Failed to send message',
      };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('[Telegram] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send a file to Telegram (optionally to a specific topic)
 */
export async function sendTelegramFile(
  options: TelegramSendOptions,
  filepath: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { botToken, chatId, topicId } = options;
    
    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
    
    // Read file
    const fileBuffer = await fs.readFile(filepath);
    const filename = path.basename(filepath) || 'backup.sql';
    
    // Create FormData using native FormData API
    const formData = new FormData();
    formData.append('chat_id', chatId);
    
    // Create blob from buffer
    const blob = new Blob([fileBuffer], { type: 'application/sql' });
    formData.append('document', blob, filename);
    
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }
    
    // Add message_thread_id for topic support
    if (topicId) {
      formData.append('message_thread_id', topicId);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('[Telegram] Send file error:', data);
      return {
        success: false,
        error: data.description || 'Failed to send file',
      };
    }
    
    console.log('[Telegram] File sent successfully:', filename);
    return { success: true };
  } catch (error: any) {
    console.error('[Telegram] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Test Telegram connection by sending a test message
 */
export async function testTelegramConnection(
  options: TelegramSendOptions
): Promise<{ success: boolean; error?: string }> {
  const now = formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');
  const testMessage = `🤖 <b>SALFANET RADIUS - Test Connection</b>\n\n✅ Bot connection successful!\n\n📅 ${now} WIB`;
  
  return await sendTelegramMessage(options, testMessage);
}

/**
 * Send database health report to Telegram
 */
export async function sendHealthReport(
  options: TelegramSendOptions,
  health: {
    status: string;
    size: string;
    tables: number;
    connections: string;
    uptime: string;
    activeSessions?: number;
    totalUsers?: number;
    activeUsers?: number;
    pendingInvoices?: number;
    issues?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const now = formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');
  
  const statusEmoji = health.status === 'healthy' ? '🟢' : health.status === 'warning' ? '🟡' : '🔴';
  
  let message = `
${statusEmoji} <b>Database Health Report</b>

📊 <b>Status:</b> ${health.status.toUpperCase()}
💾 <b>Size:</b> ${health.size}
📋 <b>Tables:</b> ${health.tables}
🔌 <b>Connections:</b> ${health.connections}
⏱ <b>Uptime:</b> ${health.uptime}`;

  if (health.activeSessions !== undefined) {
    message += `\n📡 <b>Active Sessions:</b> ${health.activeSessions}`;
  }
  if (health.totalUsers !== undefined) {
    message += `\n👥 <b>Total Users:</b> ${health.totalUsers} (Active: ${health.activeUsers ?? 0})`;
  }
  if (health.pendingInvoices !== undefined && health.pendingInvoices > 0) {
    message += `\n⚠️ <b>Overdue Invoices:</b> ${health.pendingInvoices}`;
  }
  if (health.issues) {
    message += `\n\n🚨 <b>Issues:</b> ${health.issues}`;
  }

  message += `\n\n📅 ${now} WIB`;
  
  return await sendTelegramMessage(options, message.trim());
}

/**
 * Send backup file to Telegram with caption
 */
export async function sendBackupToTelegram(
  options: TelegramSendOptions,
  filepath: string,
  filesize: number | bigint
): Promise<{ success: boolean; error?: string }> {
  const fileSizeNum = Number(filesize);
  const MAX_TELEGRAM_FILE_SIZE = 50 * 1024 * 1024; // 50MB Telegram limit
  
  if (fileSizeNum > MAX_TELEGRAM_FILE_SIZE) {
    const sizeMB = (fileSizeNum / 1024 / 1024).toFixed(2);
    return {
      success: false,
      error: `Backup file too large (${sizeMB} MB). Telegram limit is 50 MB. Consider reducing backup size or using a different storage method.`,
    };
  }

  const now = formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');
  const filename = path.basename(filepath) || 'backup.sql';
  const sizeMB = (fileSizeNum / 1024 / 1024).toFixed(2);
  
  const caption = `
💾 <b>Database Backup</b>

📁 ${filename}
📦 Size: ${sizeMB} MB
📅 ${now} WIB

✅ Backup completed successfully!
  `.trim();
  
  return await sendTelegramFile(options, filepath, caption);
}
