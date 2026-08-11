import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('users')
@Controller('users')
@UseGuards(AdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get PPPoE users list with filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'profileId', required: false })
  @ApiQuery({ name: 'routerId', required: false })
  @ApiQuery({ name: 'address', required: false })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Generic search (name/username/address/phone)' })
  @ApiQuery({ name: 'odpIds', required: false, description: 'Comma-separated ODP IDs' })
  async getUsersList(
    @Query('status') status?: string,
    @Query('profileId') profileId?: string,
    @Query('routerId') routerId?: string,
    @Query('address') address?: string,
    @Query('name') name?: string,
    @Query('search') search?: string,
    @Query('odpIds') odpIds?: string,
  ) {
    return this.usersService.getUsersList({ status, profileId, routerId, address, name, search, odpIds });
  }
}
