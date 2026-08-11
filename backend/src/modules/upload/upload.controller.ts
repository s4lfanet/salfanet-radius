import { Controller, Post, UploadedFile, UseGuards, UseInterceptors, Query, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { UploadService } from './upload.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { TechnicianGuard } from '../../common/guards/technician.guard';
import { memoryStorage } from 'multer';

const imageFileFilter = (_req: any, file: any, cb: any) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type'), false);
};

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Public()
  @Post('payment-proof')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload payment proof image (public)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async uploadPaymentProof(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadPaymentProof(file);
  }

  @Post('logo')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: imageFileFilter }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload company logo (admin)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadLogo(file);
  }

  @Post('pppoe-customer')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload PPPoE customer photo (admin)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, type: { type: 'string' } } } })
  async uploadPppoeCustomer(@UploadedFile() file: Express.Multer.File, @Query('type') type: string) {
    return this.uploadService.uploadPppoeCustomer(file, type);
  }

  @Post('ticket')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload ticket attachment (technician)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async uploadTicketAttachment(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadTicketAttachment(file);
  }
}
