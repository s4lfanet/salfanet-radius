import * as fs from 'fs/promises';
import * as path from 'path';
import { formatWIB } from '@/lib/timezone';

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
  const now = formatWIB(new Date());
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
  }
): Promise<{ success: boolean; error?: string }> {
  const now = formatWIB(new Date());
  
  const statusEmoji = health.status === 'healthy' ? '🟢' : health.status === 'warning' ? '🟡' : '🔴';
  
  const message = `
${statusEmoji} <b>Database Health Report</b>

📊 <b>Status:</b> ${health.status.toUpperCase()}
💾 <b>Size:</b> ${health.size}
📋 <b>Tables:</b> ${health.tables}
🔌 <b>Connections:</b> ${health.connections}
⏱ <b>Uptime:</b> ${health.uptime}

📅 ${now} WIB
  `.trim();
  
  return await sendTelegramMessage(options, message);
}

/**
 * Send backup file to Telegram with caption
 */
export async function sendBackupToTelegram(
  options: TelegramSendOptions,
  filepath: string,
  filesize: number | bigint
): Promise<{ success: boolean; error?: string }> {
  const now = formatWIB(new Date());
  const filename = path.basename(filepath) || 'backup.sql';
  const sizeMB = (Number(filesize) / 1024 / 1024).toFixed(2);
  
  const caption = `
💾 <b>Database Backup</b>

📁 ${filename}
📦 Size: ${sizeMB} MB
📅 ${now} WIB

✅ Backup completed successfully!
  `.trim();
  
  return await sendTelegramFile(options, filepath, caption);
}
