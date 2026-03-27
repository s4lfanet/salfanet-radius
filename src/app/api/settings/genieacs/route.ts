import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Simple encryption/decryption for password storage
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY is required in production.');
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this-32'; // Must be 32 chars
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET - Get GenieACS settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.genieacsSettings.findFirst({
      where: { isActive: true },
    });

    if (!settings) {
      return NextResponse.json({ settings: null });
    }

    // Return without decrypting password for security
    return NextResponse.json({
      settings: {
        id: settings.id,
        host: settings.host,
        username: settings.username,
        isActive: settings.isActive,
        hasPassword: !!settings.password,
      },
    });
  } catch (error) {
    console.error('Error fetching GenieACS settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Create or update GenieACS settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { host, username, password } = body;

    if (!host || !username || !password) {
      return NextResponse.json(
        { error: 'Host, username, and password are required' },
        { status: 400 }
      );
    }

    // Validate host URL
    try {
      new URL(host);
    } catch {
      return NextResponse.json(
        { error: 'Invalid host URL format' },
        { status: 400 }
      );
    }

    // Encrypt password
    const encryptedPassword = encrypt(password);

    // Check if settings exist
    const existingSettings = await prisma.genieacsSettings.findFirst({
      where: { isActive: true },
    });

    let settings;
    if (existingSettings) {
      // Update existing
      settings = await prisma.genieacsSettings.update({
        where: { id: existingSettings.id },
        data: {
          host,
          username,
          password: encryptedPassword,
        },
      });
    } else {
      // Create new
      settings = await prisma.genieacsSettings.create({
        data: {
          id: nanoid(),
          host,
          username,
          password: encryptedPassword,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      settings: {
        id: settings.id,
        host: settings.host,
        username: settings.username,
        isActive: settings.isActive,
      },
    });
  } catch (error) {
    console.error('Error saving GenieACS settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}

// Helper function to get decrypted credentials (for internal use only)
export async function getGenieACSCredentials() {
  try {
    const settings = await prisma.genieacsSettings.findFirst({
      where: { isActive: true },
    });

    if (!settings) {
      return null;
    }

    // Try to decrypt password
    let decryptedPassword = '';
    try {
      decryptedPassword = decrypt(settings.password);
    } catch (decryptError) {
      console.error('Error decrypting GenieACS password:', decryptError);
      // If decryption fails, it might be stored in plain text (legacy)
      decryptedPassword = settings.password;
    }

    return {
      host: settings.host,
      username: settings.username,
      password: decryptedPassword,
    };
  } catch (error) {
    console.error('Error getting GenieACS credentials:', error);
    return null;
  }
}
