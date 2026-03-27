# HIGH PRIORITY SECURITY FIXES

This document covers HIGH severity vulnerabilities and their fixes. Apply these within 1 week.

---

## FIX #5: Template Injection in Email & WhatsApp Senders

Apply to ALL files that use template message replacement:
- `src/app/api/admin/users/[id]/renewal/route.ts`
- `src/app/api/customer/renewal/route.ts`
- `src/app/api/payment/webhook/route.ts`
- `src/app/api/evoucher/purchase/route.ts`

### Implementation Steps:

1. **Use the validation utility created**: Already done at `src/lib/utils/validation.ts`

2. **Update WhatsApp template sending**:

```typescript
import { escapeHtml, sanitizeEmail, sanitizePhone } from '@/lib/utils/validation';

// Replace this:
let message = whatsappTemplate.message
  .replace(/{{customerName}}/g, user.name);

// With this:
let message = whatsappTemplate.message
  .replace(/{{customerName}}/g, escapeHtml(user.name || ''));

// For phone numbers - ensure E.164 format
const sanitizedPhone = sanitizePhone(user.phone || '');
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: sanitizedPhone,
    message,
  }),
});
```

3. **Update email template sending**:

```typescript
import { escapeHtml, sanitizeEmail } from '@/lib/utils/validation';

const variables: Record<string, string> = {
  customerName: escapeHtml(user.name || ''),
  username: escapeHtml(user.username || ''),
  email: sanitizeEmail(user.email || ''),
  phone: sanitizePhone(user.phone || ''),
  customerId: escapeHtml(user.customerId || ''),
  invoiceNumber: escapeHtml(invoiceNumber || ''),
  amount: `Rp ${amount.toLocaleString('id-ID')}`,
  dueDate: newExpiredDate.toLocaleDateString('id-ID'),
  paymentLink: escapeHtml(paymentLink || ''),
  companyName: escapeHtml(company?.name || ''),
  companyPhone: escapeHtml(company?.phone || ''),
};

let htmlBody = emailTemplate.htmlBody;
Object.entries(variables).forEach(([key, value]) => {
  const placeholder = `{{${key}}}`;
  const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
  htmlBody = htmlBody.replace(regex, value);
});

// Validate email before sending
try {
  validateEmail(user.email || '');
  await EmailService.send({
    to: user.email,
    toName: escapeHtml(user.name),
    subject: emailTemplate.subject,
    html: htmlBody,
  });
} catch (error) {
  console.error('Invalid email address:', user.email);
  // Continue without email
}
```

---

## FIX #6: File Upload Security - Add Magic Bytes Validation

Apply to:
- `src/app/api/upload/payment-proof/route.ts`
- `src/app/api/upload/pppoe-customer/route.ts`
- `src/app/api/upload/logo/route.ts`

### Step 1: Install dependencies

```bash
npm install file-type@18.0.0 sharp@0.32.0
```

### Step 2: Create upload security utility

**File**: `src/lib/utils/upload-security.ts`

```typescript
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

export interface UploadValidationResult {
  isValid: boolean;
  error?: string;
  buffer?: Buffer;
  mimeType?: string;
}

/**
 * Validate uploaded file with magic bytes check
 * @param buffer - File buffer
 * @param allowedMimes - Array of allowed MIME types
 * @param maxSize - Maximum file size in bytes
 * @returns Validation result
 */
export async function validateImageUpload(
  buffer: Buffer,
  allowedMimes: string[] = ['image/jpeg', 'image/png', 'image/webp'],
  maxSize: number = 2 * 1024 * 1024
): Promise<UploadValidationResult> {
  // Check size
  if (buffer.length === 0 || buffer.length > maxSize) {
    return {
      isValid: false,
      error: `File size must be between 1 byte and ${maxSize} bytes`,
    };
  }

  // Check magic bytes
  const detectedType = await fileTypeFromBuffer(buffer);

  if (!detectedType) {
    return {
      isValid: false,
      error: 'Unable to detect file type (may be corrupted)',
    };
  }

  if (!allowedMimes.includes(detectedType.mime)) {
    return {
      isValid: false,
      error: `Invalid file type. Detected: ${detectedType.mime}. Allowed: ${allowedMimes.join(', ')}`,
    };
  }

  // Re-encode image to strip embedded code/EXIF data
  try {
    const reencoded = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF
      .toFormat('jpeg', { quality: 90, progressive: true })
      .withMetadata(false) // Strip EXIF
      .toBuffer();

    return {
      isValid: true,
      buffer: reencoded,
      mimeType: 'image/jpeg',
    };
  } catch (error: any) {
    return {
      isValid: false,
      error: 'Failed to process image (may be invalid or corrupted)',
    };
  }
}

/**
 * Generate secure filename
 * @param originalName - Original filename (may be unsafe)
 * @param extension - Safe file extension
 * @returns Secure filename
 */
export function generateSecureFilename(originalName: string, extension: string = 'jpg'): string {
  const { randomBytes } = require('crypto');
  const uniqueId = randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return `file-${timestamp}-${uniqueId}.${extension}`;
}
```

### Step 3: Update upload endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { validateImageUpload, generateSecureFilename } from '@/lib/utils/upload-security';

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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate using magic bytes
    const validation = await validateImageUpload(
      buffer,
      ['image/jpeg', 'image/png', 'image/webp'],
      2 * 1024 * 1024 // 2MB max
    );

    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Generate secure filename
    const filename = generateSecureFilename(file.name, 'jpg');

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'payment-proofs');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filepath = join(uploadDir, filename);
    
    // Write re-encoded image
    await writeFile(filepath, validation.buffer!);

    return NextResponse.json({
      success: true,
      url: `/uploads/payment-proofs/${filename}`,
      filename,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 }
    );
  }
}
```

---

## FIX #7: Enum Validation in Query Parameters

Apply to ALL API routes that accept enum-like query parameters:
- `src/app/api/keuangan/transactions/route.ts`
- `src/app/api/agent/dashboard/route.ts`
- `src/app/api/payment-gateway/webhook-logs/route.ts`

### Pattern to apply:

```typescript
import { validateEnum } from '@/lib/utils/validation';

const VALID_TRANSACTION_TYPES = ['INCOME', 'EXPENSE'] as const;
const VALID_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Get and validate enum value
  const typeParam = searchParams.get('type');
  let type: string | undefined;

  if (typeParam && typeParam !== 'all') {
    try {
      validateEnum(typeParam, VALID_TRANSACTION_TYPES, 'type');
      type = typeParam;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid type parameter' },
        { status: 400 }
      );
    }
  }

  // Build query safely
  const where: any = {};
  if (type) {
    where.type = type;
  }

  // Continue with query...
}
```

---

## FIX #8: Amount Validation

Apply to ALL payment/financial endpoints:
- `src/app/api/payment/create/route.ts`
- `src/app/api/agent/deposit/payment-methods/route.ts`
- `src/app/api/customer/payment-methods/route.ts`
- `src/app/api/keuangan/transactions/route.ts`

### Implementation:

```typescript
import { validateAmount, validatePagination } from '@/lib/utils/validation';

export async function POST(request: Request) {
  const body = await request.json();
  const { amount, invoiceId, gateway } = body;

  // Validate amount (min Rp 1.00, max Rp 999,999.99)
  try {
    validateAmount(amount, {
      minAmount: 100,        // Rp 1.00
      maxAmount: 99999999,   // Rp 999,999.99
      allowZero: false,
      allowNegative: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // Continue with payment processing...
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Validate pagination
  try {
    const { page, limit, skip } = validatePagination(
      searchParams.get('page'),
      searchParams.get('limit'),
      100 // max limit
    );

    // Use page, limit, skip in query...
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

---

## FIX #9: SSRF Protection for Network Endpoints

Apply to:
- `src/app/api/network/vpn-server/test/route.ts`
- Any other endpoints accepting `host`, `url`, or `ip` parameters

### Implementation:

```typescript
import { validateIPAddress, validatePort } from '@/lib/utils/validation';

export async function POST(request: Request) {
  const { host, username, password, apiPort } = await request.json();

  // Validate IP address (reject private IPs)
  try {
    validateIPAddress(host, false); // allowPrivate: false
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Invalid or private IP address not allowed' },
      { status: 400 }
    );
  }

  // Validate port number
  try {
    validatePort(apiPort || 8728, 1, 65535);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // Additional: Rate limit by IP to prevent DOS
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  const key = `vpn-test:${clientIP}`;
  
  // Use Redis or in-memory cache to track attempts
  // Allow max 5 tests per IP per minute

  const mtik = new MikroTikConnection({
    host,
    username,
    password,
    port: parseInt(apiPort) || 8728,
    timeout: 15000,
  });

  const result = await mtik.testConnection();
  return NextResponse.json(result);
}
```

---

## FIX #10: Webhook Signature Verification

Apply to:
- `src/app/api/payment/webhook/route.ts`
- `src/app/api/agent/deposit/webhook/route.ts`

### Implementation Pattern:

```typescript
import crypto from 'crypto';

/**
 * Verify Midtrans webhook signature
 */
function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signature: string
): boolean {
  const data = orderId + statusCode + grossAmount + serverKey;
  const expectedSignature = crypto
    .createHash('sha512')
    .update(data)
    .digest('hex');
  
  return signature === expectedSignature;
}

/**
 * Verify Xendit webhook signature
 */
function verifyXenditSignature(
  xWebhookToken: string,
  expectedToken: string
): boolean {
  return xWebhookToken === expectedToken;
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let body: any;
  let rawBody: string = '';

  // Parse body
  if (contentType.includes('application/x-www-form-urlencoded')) {
    rawBody = await request.text();
    body = Object.fromEntries(new URLSearchParams(rawBody));
  } else {
    rawBody = await request.text();
    body = JSON.parse(rawBody);
  }

  const signature = request.headers.get('x-callback-signature') || 
                    request.headers.get('x-signature');

  // Verify based on gateway
  if (body.order_id && body.status_code && body.gross_amount) {
    // Midtrans webhook
    const isValid = verifyMidtransSignature(
      body.order_id,
      body.status_code,
      body.gross_amount,
      process.env.MIDTRANS_SERVER_KEY || '',
      signature || ''
    );

    if (!isValid) {
      console.warn('[Webhook] Invalid Midtrans signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
  } else if (body.external_id) {
    // Xendit webhook
    const isValid = verifyXenditSignature(
      signature || '',
      process.env.XENDIT_WEBHOOK_TOKEN || ''
    );

    if (!isValid) {
      console.warn('[Webhook] Invalid Xendit signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
  }

  // IDEMPOTENCY: Prevent duplicate processing
  const webhookHash = crypto
    .createHash('sha256')
    .update(rawBody)
    .digest('hex');

  const existingLog = await prisma.webhookLog.findFirst({
    where: { webhookHash }
  });

  if (existingLog && existingLog.createdAt > new Date(Date.now() - 3600000)) {
    // Same webhook received within last hour
    return NextResponse.json(
      { success: true, message: 'Already processed' }
    );
  }

  // Process webhook...
  const payload = body.event ? body.data : body;

  // ... rest of webhook processing
}
```

---

## FIX #11: Email/Phone Input Validation

Apply to ALL endpoints accepting email or phone:

```typescript
import { validateEmail, validatePhone } from '@/lib/utils/validation';

export async function POST(request: Request) {
  const { email, phone, name } = await request.json();

  // Validate email
  if (email) {
    try {
      validateEmail(email);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid email: ${error.message}` },
        { status: 400 }
      );
    }
  }

  // Validate phone
  if (phone) {
    try {
      validatePhone(phone);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid phone: ${error.message}` },
        { status: 400 }
      );
    }
  }

  // Continue with processing...
}
```

---

## FIX #12: Date Validation on Query Parameters

Apply to:
- `src/app/api/keuangan/transactions/route.ts`
- `src/app/api/dashboard/stats/route.ts`
- `src/app/api/keuangan/export/route.ts`

### Implementation:

```typescript
import { validateDateRange, validateDateFormat } from '@/lib/utils/validation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');

  let startFilter: Date | undefined;
  let endFilter: Date | undefined;

  if (startDateStr && endDateStr) {
    try {
      const { start, end } = validateDateRange(startDateStr, endDateStr, 365);
      startFilter = start;
      endFilter = end;
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
  } else if (startDateStr || endDateStr) {
    return NextResponse.json(
      { error: 'Both startDate and endDate are required' },
      { status: 400 }
    );
  }

  // Use startFilter and endFilter in queries...
}
```

---

## FIX #13: File Upload Quotas

Add to `src/app/api/upload/` routes to prevent DOS via file uploads:

```typescript
import { validateFileSize } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  // Validate file size
  try {
    validateFileSize(file.size, 2 * 1024 * 1024, 1);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // Check user upload quota
  const userQuota = await prisma.uploadQuota.findUnique({
    where: { userId: session.user.id }
  });

  const totalBytes = userQuota?.totalBytes || 0;
  const MAX_USER_QUOTA = 100 * 1024 * 1024; // 100MB per month

  if (totalBytes + file.size > MAX_USER_QUOTA) {
    return NextResponse.json(
      { error: 'Upload quota exceeded for this month' },
      { status: 413 }
    );
  }

  // Update quota
  await prisma.uploadQuota.upsert({
    where: { userId: session.user.id },
    update: {
      totalBytes: totalBytes + file.size,
      updatedAt: new Date(),
    },
    create: {
      userId: session.user.id,
      totalBytes: file.size,
    }
  });

  // ... rest of upload logic
}
```

---

## Testing Checklist

- [ ] Test timezone API with invalid input: `"; system('id'); "`  
- [ ] Test file upload with PHP/executable file
- [ ] Test with negative amounts
- [ ] Test with dates in wrong format
- [ ] Test with invalid enum values
- [ ] Test webhook with wrong signature
- [ ] Test email with newline characters: `user@test.com\nBcc: attacker@com`
- [ ] Test search with very long strings (10MB)
- [ ] Test with private IP addresses in network endpoints
- [ ] Load test file uploads to check quota enforcement

---

## Deployment Order

1. **Day 1**: Deploy critical fixes (timezone, path traversal)
2. **Day 2**: Deploy file validation and email escaping
3. **Day 3-4**: Deploy enum/amount/date validation
4. **Day 5**: Deploy SSRF and webhook verification
5. **Week 2**: Deploy quotas and rate limiting

---

END OF HIGH PRIORITY FIXES
