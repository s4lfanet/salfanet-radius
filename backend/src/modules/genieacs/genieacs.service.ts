import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GenieacsService {
  private readonly logger = new Logger(GenieacsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getSettings() {
    const settings = await this.prisma.genieacsSettings.findFirst({ where: { isActive: true } });
    if (!settings) throw new HttpException('GenieACS not configured', HttpStatus.NOT_FOUND);
    return settings;
  }

  private authHeader(settings: { username: string; password: string }) {
    return 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  }

  // ==================== SETTINGS ====================

  async getSettingsDetail() {
    const settings = await this.prisma.genieacsSettings.findFirst();
    if (!settings) return null;
    return { ...settings, password: settings.password ? '***' : null };
  }

  async updateSettings(body: { host?: string; username?: string; password?: string; isActive?: boolean }) {
    const existing = await this.prisma.genieacsSettings.findFirst();
    if (existing) {
      const data: Record<string, unknown> = {};
      if (body.host !== undefined) data.host = body.host;
      if (body.username !== undefined) data.username = body.username;
      if (body.password !== undefined) data.password = body.password;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      return this.prisma.genieacsSettings.update({ where: { id: existing.id }, data: data as never });
    }
    return this.prisma.genieacsSettings.create({
      data: {
        id: `genieacs_${Date.now()}`,
        host: body.host || 'http://localhost:7557',
        username: body.username || 'admin',
        password: body.password || '',
        isActive: body.isActive ?? true,
      },
    });
  }

  async testConnection() {
    try {
      const settings = await this.getSettings();
      const response = await fetch(`${settings.host}/`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(5000),
      });
      return { success: response.ok, status: response.status, host: settings.host };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ==================== DEVICES ====================

  async listDevices(params: { page?: number; limit?: number; search?: string; showAll?: boolean }) {
    const settings = await this.getSettings();
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 500);

    try {
      const url = new URL(`${settings.host}/devices`);
      if (params.search) url.searchParams.set('query', JSON.stringify({ _id: { $regex: params.search } }));
      if (!params.showAll) url.searchParams.set('projection', JSON.stringify({ _id: 1, 'InternetGatewayDevice.DeviceInfo.SerialNumber': 1, 'InternetGatewayDevice.DeviceInfo.Manufacturer': 1, 'InternetGatewayDevice.DeviceInfo.ModelName': 1, 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': 1, '_lastInform': 1, '_registered': 1 }));

      const response = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      let devices = await response.json() as any[];

      const total = devices.length;
      const start = (page - 1) * limit;
      devices = devices.slice(start, start + limit);

      return { devices, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed to fetch devices: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async getDevice(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed to fetch device: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async getDeviceAllParameters(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}?projection=`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async refreshDevice(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks?task=refreshObject&object=.`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'refreshObject', object: '.' }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async rebootDevice(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'reboot' }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async factoryResetDevice(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'factoryReset' }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async connectionRequest(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'getParameterValues', parameterNames: ['InternetGatewayDevice.ManagementServer.ConnectionRequestURL'] }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async downloadFirmware(deviceId: string, body: { url: string; filename?: string }) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'download', url: body.url, filename: body.filename }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setDeviceParameters(deviceId: string, params: Record<string, string>) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/devices/${encodeURIComponent(deviceId)}/tasks`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'setParameterValues', parameterValues: Object.entries(params).map(([k, v]) => [k, v]) }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok || response.status === 200 || response.status === 202, deviceId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getDeviceWan(deviceId: string) {
    const device = await this.getDevice(deviceId);
    // Extract WAN info from device parameters
    return { deviceId, wan: (device as any)?.InternetGatewayDevice?.WANDevice || null };
  }

  async getDeviceWifi(deviceId: string) {
    const device = await this.getDevice(deviceId);
    return { deviceId, wifi: (device as any)?.InternetGatewayDevice?.LANDevice?.WLANConfiguration || null };
  }

  async getDeviceTasks(deviceId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/tasks?device=${encodeURIComponent(deviceId)}`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== TASKS ====================

  async listTasks() {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/tasks`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async retryTask(taskId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/tasks/${taskId}`, {
        method: 'POST',
        headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok, taskId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteTask(taskId: string) {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(10000),
      });
      return { success: response.ok, taskId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ==================== FAULTS ====================

  async listFaults() {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/faults`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== FILES ====================

  async listFiles() {
    const settings = await this.getSettings();
    try {
      const response = await fetch(`${settings.host}/files`, {
        headers: { Authorization: this.authHeader(settings) },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      return await response.json();
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`Failed: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== PRESETS ====================

  async listPresets() {
    return this.prisma.genieacsPreset.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createPreset(body: { name: string; weight?: number; channel?: string; schedule?: string; events?: string; precondition?: string; provisions: string; description?: string }) {
    return this.prisma.genieacsPreset.create({
      data: {
        name: body.name,
        weight: body.weight || 100,
        channel: body.channel || null,
        schedule: body.schedule || null,
        events: body.events || null,
        precondition: body.precondition || null,
        provisions: body.provisions,
        description: body.description || null,
      },
    });
  }

  async updatePreset(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.genieacsPreset.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deletePreset(id: string) {
    try {
      await this.prisma.genieacsPreset.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== PROVISIONS ====================

  async listProvisions() {
    return this.prisma.genieacsProvision.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createProvision(body: { name: string; script: string; description?: string }) {
    return this.prisma.genieacsProvision.create({
      data: { name: body.name, script: body.script, description: body.description || null },
    });
  }

  async updateProvision(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.genieacsProvision.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Provision not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteProvision(id: string) {
    try {
      await this.prisma.genieacsProvision.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Provision not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== VIRTUAL PARAMETERS ====================

  async listVirtualParameters() {
    return this.prisma.genieacsVirtualParameter.findMany({ orderBy: { displayOrder: 'asc' } });
  }

  async createVirtualParameter(body: Record<string, unknown>) {
    return this.prisma.genieacsVirtualParameter.create({ data: body as never });
  }

  async updateVirtualParameter(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.genieacsVirtualParameter.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Virtual parameter not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteVirtualParameter(id: string) {
    try {
      await this.prisma.genieacsVirtualParameter.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Virtual parameter not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // VP Scripts (genieacsVpScript)
  async listVpScripts() {
    return this.prisma.genieacsVpScript.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createVpScript(body: { name: string; script: string; description?: string }) {
    return this.prisma.genieacsVpScript.create({
      data: { name: body.name, script: body.script, description: body.description || null },
    });
  }

  async updateVpScript(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.genieacsVpScript.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('VP script not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteVpScript(id: string) {
    try {
      await this.prisma.genieacsVpScript.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('VP script not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== PARAMETER DISPLAY CONFIG ====================

  async listParameterDisplay(params: { configType?: string }) {
    const where: Record<string, unknown> = {};
    if (params.configType) where.configType = params.configType;
    return this.prisma.parameterDisplayConfig.findMany({
      where: where as never,
      orderBy: [{ configType: 'asc' }, { section: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async createParameterDisplay(body: Record<string, unknown>) {
    return this.prisma.parameterDisplayConfig.create({ data: body as never });
  }

  async updateParameterDisplay(id: number, body: Record<string, unknown>) {
    try {
      return await this.prisma.parameterDisplayConfig.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Parameter display config not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteParameterDisplay(id: number) {
    try {
      await this.prisma.parameterDisplayConfig.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Parameter display config not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async resetParameterDisplay() {
    await this.prisma.parameterDisplayConfig.deleteMany();
    return { success: true, message: 'All parameter display configs reset' };
  }

  // ==================== SYNC ====================

  async syncToGenieacs() {
    const settings = await this.getSettings();
    const results: any = { presets: [], provisions: [], vpScripts: [] };

    // Sync presets
    const presets = await this.prisma.genieacsPreset.findMany();
    for (const preset of presets) {
      try {
        const response = await fetch(`${settings.host}/presets/${encodeURIComponent(preset.name)}`, {
          method: 'PUT',
          headers: { Authorization: this.authHeader(settings), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weight: preset.weight, channel: preset.channel, schedule: preset.schedule,
            events: preset.events ? JSON.parse(preset.events) : undefined,
            precondition: preset.precondition, provisions: JSON.parse(preset.provisions),
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          await this.prisma.genieacsPreset.update({ where: { id: preset.id }, data: { syncedAt: new Date(), syncError: null } });
          results.presets.push({ name: preset.name, success: true });
        } else {
          const errText = await response.text();
          await this.prisma.genieacsPreset.update({ where: { id: preset.id }, data: { syncError: errText } });
          results.presets.push({ name: preset.name, success: false, error: errText });
        }
      } catch (err: any) {
        await this.prisma.genieacsPreset.update({ where: { id: preset.id }, data: { syncError: err.message } });
        results.presets.push({ name: preset.name, success: false, error: err.message });
      }
    }

    // Sync provisions
    const provisions = await this.prisma.genieacsProvision.findMany();
    for (const prov of provisions) {
      try {
        const response = await fetch(`${settings.host}/provisions/${encodeURIComponent(prov.name)}`, {
          method: 'PUT',
          headers: { Authorization: this.authHeader(settings), 'Content-Type': 'text/javascript' },
          body: prov.script,
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          await this.prisma.genieacsProvision.update({ where: { id: prov.id }, data: { syncedAt: new Date(), syncError: null } });
          results.provisions.push({ name: prov.name, success: true });
        } else {
          const errText = await response.text();
          await this.prisma.genieacsProvision.update({ where: { id: prov.id }, data: { syncError: errText } });
          results.provisions.push({ name: prov.name, success: false, error: errText });
        }
      } catch (err: any) {
        await this.prisma.genieacsProvision.update({ where: { id: prov.id }, data: { syncError: err.message } });
        results.provisions.push({ name: prov.name, success: false, error: err.message });
      }
    }

    // Sync VP scripts
    const vpScripts = await this.prisma.genieacsVpScript.findMany();
    for (const vp of vpScripts) {
      try {
        const response = await fetch(`${settings.host}/virtualParameters/${encodeURIComponent(vp.name)}`, {
          method: 'PUT',
          headers: { Authorization: this.authHeader(settings), 'Content-Type': 'text/javascript' },
          body: vp.script,
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          await this.prisma.genieacsVpScript.update({ where: { id: vp.id }, data: { syncedAt: new Date(), syncError: null } });
          results.vpScripts.push({ name: vp.name, success: true });
        } else {
          const errText = await response.text();
          await this.prisma.genieacsVpScript.update({ where: { id: vp.id }, data: { syncError: errText } });
          results.vpScripts.push({ name: vp.name, success: false, error: errText });
        }
      } catch (err: any) {
        await this.prisma.genieacsVpScript.update({ where: { id: vp.id }, data: { syncError: err.message } });
        results.vpScripts.push({ name: vp.name, success: false, error: err.message });
      }
    }

    return results;
  }

  // ==================== AUTO-PROVISION ====================

  async autoProvision() {
    // Auto-provision logic deferred — would scan devices and assign presets
    return { success: true, message: 'Auto-provision scan deferred', provisioned: 0 };
  }

  // ==================== BACKUP ====================

  async backup() {
    const [presets, provisions, vpScripts, virtualParams, paramDisplay] = await Promise.all([
      this.prisma.genieacsPreset.findMany(),
      this.prisma.genieacsProvision.findMany(),
      this.prisma.genieacsVpScript.findMany(),
      this.prisma.genieacsVirtualParameter.findMany(),
      this.prisma.parameterDisplayConfig.findMany(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      presets, provisions, vpScripts, virtualParams, paramDisplay,
    };
  }
}
