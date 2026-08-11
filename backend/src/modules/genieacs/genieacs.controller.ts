import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GenieacsService } from './genieacs.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('genieacs')
@Controller('genieacs')
export class GenieacsController {
  constructor(private readonly genieacsService: GenieacsService) {}

  // ==================== SETTINGS ====================

  @Get('settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GenieACS settings' })
  async getSettings() { return this.genieacsService.getSettingsDetail(); }

  @Put('settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update GenieACS settings' })
  async updateSettings(@Body() body: Record<string, unknown>) { return this.genieacsService.updateSettings(body as never); }

  @Post('test')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test GenieACS connection' })
  async testConnection() { return this.genieacsService.testConnection(); }

  // ==================== DEVICES ====================

  @Get('devices')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GenieACS devices' })
  async listDevices(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('showAll') showAll?: string) {
    return this.genieacsService.listDevices({
      page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined,
      search, showAll: showAll === 'true',
    });
  }

  @Get('devices/:deviceId')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GenieACS device detail' })
  async getDevice(@Param('deviceId') deviceId: string) { return this.genieacsService.getDevice(deviceId); }

  @Get('devices/:deviceId/all-parameters')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all parameters for device' })
  async getDeviceAllParameters(@Param('deviceId') deviceId: string) { return this.genieacsService.getDeviceAllParameters(deviceId); }

  @Post('devices/:deviceId/refresh')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh device parameters' })
  async refreshDevice(@Param('deviceId') deviceId: string) { return this.genieacsService.refreshDevice(deviceId); }

  @Post('devices/:deviceId/reboot')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reboot device' })
  async rebootDevice(@Param('deviceId') deviceId: string) { return this.genieacsService.rebootDevice(deviceId); }

  @Post('devices/:deviceId/factory-reset')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Factory reset device' })
  async factoryResetDevice(@Param('deviceId') deviceId: string) { return this.genieacsService.factoryResetDevice(deviceId); }

  @Post('devices/:deviceId/connection-request')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send connection request to device' })
  async connectionRequest(@Param('deviceId') deviceId: string) { return this.genieacsService.connectionRequest(deviceId); }

  @Post('devices/:deviceId/download')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Push firmware download to device' })
  async downloadFirmware(@Param('deviceId') deviceId: string, @Body() body: { url: string; filename?: string }) {
    return this.genieacsService.downloadFirmware(deviceId, body);
  }

  @Post('devices/:deviceId/parameters')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set device parameters' })
  async setDeviceParameters(@Param('deviceId') deviceId: string, @Body() body: Record<string, string>) {
    return this.genieacsService.setDeviceParameters(deviceId, body);
  }

  @Get('devices/:deviceId/wan')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device WAN info' })
  async getDeviceWan(@Param('deviceId') deviceId: string) { return this.genieacsService.getDeviceWan(deviceId); }

  @Get('devices/:deviceId/wifi')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device WiFi info' })
  async getDeviceWifi(@Param('deviceId') deviceId: string) { return this.genieacsService.getDeviceWifi(deviceId); }

  @Get('devices/:deviceId/tasks')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device tasks' })
  async getDeviceTasks(@Param('deviceId') deviceId: string) { return this.genieacsService.getDeviceTasks(deviceId); }

  // ==================== TASKS ====================

  @Get('tasks')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all GenieACS tasks' })
  async listTasks() { return this.genieacsService.listTasks(); }

  @Post('tasks/:taskId/retry')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry a task' })
  async retryTask(@Param('taskId') taskId: string) { return this.genieacsService.retryTask(taskId); }

  @Delete('tasks/:taskId')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a task' })
  async deleteTask(@Param('taskId') taskId: string) { return this.genieacsService.deleteTask(taskId); }

  // ==================== FAULTS ====================

  @Get('faults')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GenieACS faults' })
  async listFaults() { return this.genieacsService.listFaults(); }

  // ==================== FILES ====================

  @Get('files')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GenieACS files' })
  async listFiles() { return this.genieacsService.listFiles(); }

  // ==================== PRESETS ====================

  @Get('presets')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List presets' })
  async listPresets() { return this.genieacsService.listPresets(); }

  @Post('presets')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create preset' })
  async createPreset(@Body() body: Record<string, unknown>) { return this.genieacsService.createPreset(body as never); }

  @Put('presets/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update preset' })
  async updatePreset(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.genieacsService.updatePreset(id, body); }

  @Delete('presets/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete preset' })
  async deletePreset(@Param('id') id: string) { return this.genieacsService.deletePreset(id); }

  // ==================== PROVISIONS ====================

  @Get('provisions')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List provisions' })
  async listProvisions() { return this.genieacsService.listProvisions(); }

  @Post('provisions')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create provision' })
  async createProvision(@Body() body: Record<string, unknown>) { return this.genieacsService.createProvision(body as never); }

  @Put('provisions/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update provision' })
  async updateProvision(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.genieacsService.updateProvision(id, body); }

  @Delete('provisions/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete provision' })
  async deleteProvision(@Param('id') id: string) { return this.genieacsService.deleteProvision(id); }

  // ==================== VIRTUAL PARAMETERS ====================

  @Get('virtual-parameters')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List virtual parameters' })
  async listVirtualParameters() { return this.genieacsService.listVirtualParameters(); }

  @Post('virtual-parameters')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create virtual parameter' })
  async createVirtualParameter(@Body() body: Record<string, unknown>) { return this.genieacsService.createVirtualParameter(body); }

  @Put('virtual-parameters/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update virtual parameter' })
  async updateVirtualParameter(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.genieacsService.updateVirtualParameter(id, body); }

  @Delete('virtual-parameters/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete virtual parameter' })
  async deleteVirtualParameter(@Param('id') id: string) { return this.genieacsService.deleteVirtualParameter(id); }

  // VP Scripts
  @Get('vp-scripts')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List VP scripts' })
  async listVpScripts() { return this.genieacsService.listVpScripts(); }

  @Post('vp-scripts')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create VP script' })
  async createVpScript(@Body() body: Record<string, unknown>) { return this.genieacsService.createVpScript(body as never); }

  @Put('vp-scripts/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update VP script' })
  async updateVpScript(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.genieacsService.updateVpScript(id, body); }

  @Delete('vp-scripts/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete VP script' })
  async deleteVpScript(@Param('id') id: string) { return this.genieacsService.deleteVpScript(id); }

  // ==================== PARAMETER DISPLAY CONFIG ====================

  @Get('parameter-display')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List parameter display configs' })
  async listParameterDisplay(@Query('configType') configType?: string) { return this.genieacsService.listParameterDisplay({ configType }); }

  @Post('parameter-display')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create parameter display config' })
  async createParameterDisplay(@Body() body: Record<string, unknown>) { return this.genieacsService.createParameterDisplay(body); }

  @Put('parameter-display/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update parameter display config' })
  async updateParameterDisplay(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.genieacsService.updateParameterDisplay(parseInt(id), body);
  }

  @Delete('parameter-display/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete parameter display config' })
  async deleteParameterDisplay(@Param('id') id: string) { return this.genieacsService.deleteParameterDisplay(parseInt(id)); }

  @Post('parameter-display/reset')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset all parameter display configs' })
  async resetParameterDisplay() { return this.genieacsService.resetParameterDisplay(); }

  // ==================== SYNC ====================

  @Post('sync')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync presets, provisions, and VP scripts to GenieACS' })
  async syncToGenieacs() { return this.genieacsService.syncToGenieacs(); }

  // ==================== AUTO-PROVISION ====================

  @Post('auto-provision')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Run auto-provision scan' })
  async autoProvision() { return this.genieacsService.autoProvision(); }

  // ==================== BACKUP ====================

  @Get('backup')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export GenieACS config backup' })
  async backup() { return this.genieacsService.backup(); }
}
