/**
 * Telnet Client for OLT Command Execution
 * Uses expect CLI utility for automation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export interface TelnetConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  timeout?: number;
}

export interface TelnetResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Execute command via Telnet using expect script
 */
export async function executeCommand(config: TelnetConfig, command: string): Promise<TelnetResult> {
  const scriptPath = join('/tmp', `telnet-${Date.now()}-${Math.random().toString(36).slice(2)}.exp`);

  try {
    const expectScript = `#!/usr/bin/expect -f
set timeout ${config.timeout || 30}

spawn telnet ${config.host} ${config.port}

expect {
  "Username:" { send "${config.username}\\r" }
  "login:" { send "${config.username}\\r" }
  timeout { exit 1 }
}

expect {
  "Password:" { send "${config.password}\\r" }
  "password:" { send "${config.password}\\r" }
  timeout { exit 1 }
}

expect {
  "#" { send "${command}\\r" }
  ">" { send "${command}\\r" }
  timeout { exit 1 }
}

expect {
  "#" { send "exit\\r" }
  ">" { send "exit\\r" }
  timeout { send "exit\\r" }
}

expect eof
`;

    await writeFile(scriptPath, expectScript);
    await execAsync(`chmod +x ${scriptPath}`);

    const { stdout, stderr } = await execAsync(scriptPath);

    await unlink(scriptPath).catch(() => {});

    if (stderr && !stderr.includes('spawn telnet')) {
      return { success: false, error: stderr };
    }

    return { success: true, output: stdout };
  } catch (error: any) {
    await unlink(scriptPath).catch(() => {});
    return { success: false, error: error.message };
  }
}

/**
 * Test Telnet connectivity
 */
export async function testTelnet(config: TelnetConfig): Promise<boolean> {
  const result = await executeCommand(config, 'display version');
  return result.success;
}
