import { SetMetadata } from '@nestjs/common';

/**
 * Mark an endpoint as public (no authentication required).
 * Usage:
 *   @Public()
 *   @Get('health')
 *   health() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
