import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/avif', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

function getUploadBaseDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  async uploadPaymentProof(file: Express.Multer.File): Promise<{ success: boolean; url: string; filename: string }> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new HttpException('Invalid file type. Only JPG, PNG, and WebP are allowed.', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_FILE_SIZE) throw new HttpException('File size exceeds 5MB limit.', HttpStatus.BAD_REQUEST);

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop();
    const filename = `payment-proof-${timestamp}-${uniqueId}.${ext}`;
    const dir = path.join(getUploadBaseDir(), 'payment-proofs');
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), file.buffer);

    return { success: true, url: `/uploads/payment-proofs/${filename}`, filename };
  }

  async uploadLogo(file: Express.Multer.File): Promise<{ success: boolean; url: string; filename: string }> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    if (!ALLOWED_LOGO_TYPES.includes(file.mimetype)) {
      throw new HttpException('Invalid file type.', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_LOGO_SIZE) throw new HttpException('File size exceeds 2MB limit.', HttpStatus.BAD_REQUEST);

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = file.originalname.split('.').pop();
    const filename = `logo-${uniqueId}.${ext}`;
    const dir = path.join(getUploadBaseDir(), 'logos');
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), file.buffer);

    return { success: true, url: `/uploads/logos/${filename}`, filename };
  }

  async uploadPppoeCustomer(file: Express.Multer.File, type: string): Promise<{ success: boolean; url: string; filename: string }> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new HttpException('Invalid file type.', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_FILE_SIZE) throw new HttpException('File size exceeds 5MB limit.', HttpStatus.BAD_REQUEST);

    const subfolder = type === 'idCard' ? 'id-cards' : 'installations';
    const prefix = type === 'idCard' ? 'ktp' : 'install';
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = file.originalname.split('.').pop();
    const filename = `${prefix}-${uniqueId}.${ext}`;
    const dir = path.join(getUploadBaseDir(), 'pppoe-customers', subfolder);
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), file.buffer);

    return { success: true, url: `/uploads/pppoe-customers/${subfolder}/${filename}`, filename };
  }

  async uploadTicketAttachment(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new HttpException('Invalid file type.', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_FILE_SIZE) throw new HttpException('File size exceeds 5MB limit.', HttpStatus.BAD_REQUEST);

    const uniqueId = crypto.randomUUID();
    const ext = file.originalname.split('.').pop();
    const filename = `${uniqueId}.${ext}`;
    const dir = path.join(getUploadBaseDir(), 'tickets');
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), file.buffer);

    return { url: `/uploads/tickets/${filename}` };
  }
}
