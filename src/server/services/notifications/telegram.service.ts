import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
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
    
    // Determine MIME type based on extension
    const mimeType = filename.endsWith('.gz') ? 'application/gzip' : 'application/sql';
    
    // Create FormData using native FormData API
    const formData = new FormData();
    formData.append('chat_id', chatId);
    
    // Create blob from buffer
    const blob = new Blob([fileBuffer], { type: mimeType });
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
  const originalSizeMB = (fileSizeNum / 1024 / 1024).toFixed(2);
  const now = formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');
  const originalFilename = path.basename(filepath) || 'backup.sql';
  
  const MAX_TELEGRAM_FILE_SIZE = 50 * 1024 * 1024; // 50MB Telegram Bot API limit
  
  // Auto-compress with gzip if file is large (SQL compresses ~5-10x)
  let sendFilepath = filepath;
  let sendFilename = originalFilename;
  let compressed = false;
  
  if (fileSizeNum > MAX_TELEGRAM_FILE_SIZE) {
    console.log(`[Telegram] Backup ${originalSizeMB} MB exceeds 50MB limit, compressing with gzip...`);
    const gzPath = filepath + '.gz';
    try {
      await pipeline(
        createReadStream(filepath),
        createGzip({ level: 9 }),
        createWriteStream(gzPath)
      );
      const gzStats = await fs.stat(gzPath);
      const gzSizeMB = (gzStats.size / 1024 / 1024).toFixed(2);
      console.log(`[Telegram] Compressed: ${originalSizeMB} MB → ${gzSizeMB} MB`);
      
      if (gzStats.size > MAX_TELEGRAM_FILE_SIZE) {
        // Even compressed is too large — clean up and report
        await fs.unlink(gzPath).catch(() => {});
        return {
          success: false,
          error: `Backup too large even after gzip compression (${originalSizeMB} MB → ${gzSizeMB} MB). Telegram limit is 50 MB.`,
        };
      }
      
      sendFilepath = gzPath;
      sendFilename = originalFilename + '.gz';
      compressed = true;
    } catch (compressError: any) {
      console.error('[Telegram] Gzip compression failed:', compressError);
      await fs.unlink(gzPath).catch(() => {});
      return {
        success: false,
        error: `Failed to compress backup for Telegram: ${compressError.message}`,
      };
    }
  }
  
  const sendStats = compressed ? await fs.stat(sendFilepath) : null;
  const sendSizeMB = compressed
    ? (sendStats!.size / 1024 / 1024).toFixed(2)
    : originalSizeMB;
  
  const caption = `
💾 <b>Database Backup</b>

📁 ${sendFilename}
📦 Size: ${sendSizeMB} MB${compressed ? ` (original: ${originalSizeMB} MB)` : ''}
📅 ${now} WIB

✅ Backup completed successfully!
  `.trim();
  
  const result = await sendTelegramFile(options, sendFilepath, caption);
  
  // Clean up compressed file after sending
  if (compressed) {
    await fs.unlink(sendFilepath).catch(() => {});
  }
  
  return result;
}
