import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { exec as execChild } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const exec = promisify(execChild);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== LIST ====================

  async listBackups() {
    const backups = await this.prisma.backupHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { success: true, backups };
  }

  async getHistory() {
    const history = await this.prisma.backupHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { success: true, history };
  }

  // ==================== CREATE ====================

  async createBackup() {
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);

    const dbUrl = process.env.DATABASE_URL || '';
    try {
      await exec(`mysqldump --opt --single-transaction "${dbUrl}" > "${filepath}"`, { timeout: 300000 });
      const stats = await fs.stat(filepath);

      const backup = await this.prisma.backupHistory.create({
        data: {
          filename, filepath,
          filesize: stats.size,
          type: 'manual', status: 'success', method: 'local',
        },
      });

      return {
        success: true,
        filename,
        downloadUrl: `/api/v1/backup/download/${backup.id}`,
        backup,
      };
    } catch (err: any) {
      await this.prisma.backupHistory.create({
        data: { filename, filepath, filesize: 0, type: 'manual', status: 'failed', method: 'local', error: err.message },
      });
      throw new HttpException(`Backup failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ==================== DOWNLOAD ====================

  async getBackupFile(id: string) {
    const backup = await this.prisma.backupHistory.findUnique({ where: { id } });
    if (!backup) throw new HttpException('Backup not found', HttpStatus.NOT_FOUND);
    if (!backup.filepath) throw new HttpException('Backup file path missing', HttpStatus.BAD_REQUEST);

    try {
      const fileBuffer = await fs.readFile(backup.filepath);
      return { buffer: fileBuffer, filename: backup.filename };
    } catch {
      throw new HttpException('Backup file not found on disk', HttpStatus.NOT_FOUND);
    }
  }

  // ==================== DELETE ====================

  async deleteBackup(id: string) {
    const backup = await this.prisma.backupHistory.findUnique({ where: { id } });
    if (!backup) throw new HttpException('Backup not found', HttpStatus.NOT_FOUND);

    if (backup.filepath) {
      try { await fs.unlink(backup.filepath); } catch { /* file may already be deleted */ }
    }

    await this.prisma.backupHistory.delete({ where: { id } });
    return { success: true, message: 'Backup deleted' };
  }

  // ==================== RESTORE ====================

  async restoreBackup(file: Express.Multer.File) {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);

    const backupDir = path.join(process.cwd(), 'backups', 'restore');
    await fs.mkdir(backupDir, { recursive: true });
    const filename = `restore-${Date.now()}.sql`;
    const filepath = path.join(backupDir, filename);
    await fs.writeFile(filepath, file.buffer);

    const dbUrl = process.env.DATABASE_URL || '';
    try {
      await exec(`mysql "${dbUrl}" < "${filepath}"`, { timeout: 300000 });
      await fs.unlink(filepath);
      return { success: true, message: 'Database restored successfully' };
    } catch (err: any) {
      try { await fs.unlink(filepath); } catch { /* ignore */ }
      throw new HttpException(`Restore failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ==================== HEALTH ====================

  async getHealth() {
    const tableCount = await this.prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE()');
    const dbSize = await this.prisma.$queryRawUnsafe<any[]>('SELECT SUM(data_length + index_length) / 1024 / 1024 AS size_mb FROM information_schema.tables WHERE table_schema = DATABASE()');

    const backupCount = await this.prisma.backupHistory.count();
    const lastBackup = await this.prisma.backupHistory.findFirst({
      where: { status: 'success' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      health: {
        tables: tableCount[0]?.count || 0,
        sizeMb: Number((dbSize[0]?.size_mb || 0).toFixed(2)),
        totalBackups: backupCount,
        lastBackup: lastBackup?.createdAt || null,
      },
    };
  }
}
