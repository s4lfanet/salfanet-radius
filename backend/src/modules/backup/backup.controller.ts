import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, Res, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { BackupService } from './backup.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('backup')
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all backups' })
  async listBackups() {
    return this.backupService.listBackups();
  }

  @Get('history')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get backup history' })
  async getHistory() {
    return this.backupService.getHistory();
  }

  @Post('create')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create manual backup' })
  async createBackup() {
    return this.backupService.createBackup();
  }

  @Get('download/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download backup file by ID' })
  async downloadBackup(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.backupService.getBackupFile(id);
    res.set({
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Delete('delete/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete backup by ID' })
  async deleteBackup(@Param('id') id: string) {
    return this.backupService.deleteBackup(id);
  }

  @Post('restore')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Restore database from SQL/GZIP file' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async restoreBackup(@UploadedFile() file: Express.Multer.File) {
    return this.backupService.restoreBackup(file);
  }

  @Get('health')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get database health metrics' })
  async getHealth() {
    return this.backupService.getHealth();
  }
}
