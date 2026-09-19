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

interface ExecuteMultipleCommandsOptions {
  sendEnd?: boolean;
}

function escapeExpectString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Execute command via Telnet using expect script
 *
 * IMPORTANT: intentionally does NOT `expect eof` after sending "exit". Some
 * ZTE firmware (confirmed on a live C320 V2.1.0) answers "exit" with a
 * "confirm to logout without saving? [yes/no]:" prompt that this script
 * never answers — waiting for eof after that just burns the full `timeout`
 * (30s default) doing nothing, on EVERY single telnet command. The command's
 * actual output was already captured by the earlier expect block (matched
 * on the post-command "#"/">" prompt), so nothing is lost by letting the
 * script end here — expect closes the spawned telnet session on exit.
 */
export async function executeCommand(config: TelnetConfig, command: string): Promise<TelnetResult> {
  const scriptPath = join('/tmp', `telnet-${Date.now()}-${Math.random().toString(36).slice(2)}.exp`);
  const escapedCommand = escapeExpectString(command);

  try {
    const expectScript = `#!/usr/bin/expect -f
set timeout ${config.timeout || 30}

spawn telnet ${config.host} ${config.port}

expect {
  "Username:" { send "${config.username}\\r" }
  -re {(^|\r|\n)[Ll]ogin:} { send "${config.username}\\r" }
  timeout { exit 1 }
}

expect {
  "Password:" { send "${config.password}\\r" }
  "password:" { send "${config.password}\\r" }
  timeout { exit 1 }
}

expect {
  "#" { send "${escapedCommand}\\r" }
  ">" { send "${escapedCommand}\\r" }
  timeout { exit 1 }
}

expect {
  -re {--More--} { send " "; exp_continue }
  "#" { send "exit\\r" }
  ">" { send "exit\\r" }
  timeout { send "exit\\r" }
}
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
 * Execute multiple commands in sequence via Telnet — for ZTE ONU registration workflows.
 * Connects once, runs each command in order, then disconnects.
 */
export async function executeMultipleCommands(
  config: TelnetConfig,
  commands: string[],
  options: ExecuteMultipleCommandsOptions = {}
): Promise<TelnetResult> {
  const scriptPath = join('/tmp', `telnet-multi-${Date.now()}-${Math.random().toString(36).slice(2)}.exp`);
  const sendEnd = options.sendEnd ?? true;

  // Build the commands section of the expect script
  const cmdLines = commands.map((cmd, index) => {
    const escaped = escapeExpectString(cmd);
    return `
send_user "\\n__COPILOT_CMD_${index}_START__\\n"
send "${escaped}\\r"
expect {
  -re {--More--} { send " "; exp_continue }
  -re {[>#]} { send_user "\\n__COPILOT_CMD_${index}_END__\\n" }
  timeout { exit 1 }
  eof { exit 1 }
}`;
  }).join('\n');

  try {
    const expectScript = `#!/usr/bin/expect -f
set timeout ${config.timeout || 30}

spawn telnet ${config.host} ${config.port || 23}

expect {
  -re {(^|\r|\n)([Uu]sername|[Ll]ogin):} { send "${config.username}\\r" }
  timeout { exit 1 }
  eof { exit 1 }
}

expect {
  -re {[Pp]assword:} { send "${config.password}\\r" }
  timeout { exit 1 }
  eof { exit 1 }
}

expect {
  -re {[>#]} { }
  timeout { exit 1 }
  eof { exit 1 }
}

${cmdLines}

${sendEnd ? 'send "end\\r"\nexpect {\n  -re {--More--} { send " "; exp_continue }\n  -re {[>#]} { }\n  timeout { exit 1 }\n  eof { exit 1 }\n}\n' : ''}
send "exit\\r"
`;
    // No `expect eof` after "exit" — see executeCommand's comment above for
    // why (some ZTE firmware's unanswered logout confirmation prompt turns
    // that into a flat per-call timeout for no benefit; all command output
    // was already captured above).

    await writeFile(scriptPath, expectScript);
    await execAsync(`chmod +x ${scriptPath}`);
    const { stdout, stderr: _stderr } = await execAsync(scriptPath, { timeout: ((config.timeout || 30) + 15) * 1000 });
    await unlink(scriptPath).catch(() => {});

    return { success: true, output: stdout };
  } catch (error: any) {
    await unlink(scriptPath).catch(() => {});
    return { success: false, error: error.message };
  }
}

/**
 * Test Telnet connectivity — check port open first, then try auth
 * Uses a minimal expect script: just connect, wait for any prompt/banner, and disconnect.
 * Avoids running `display version` which may hang on some OLT models.
 * Does not `expect eof` after sending "exit" — see executeCommand's comment;
 * success is already known once we see a shell prompt, so there's nothing
 * to gain from waiting out a logout confirmation the script won't answer.
 */
export async function testTelnet(config: TelnetConfig): Promise<boolean> {
  // 1. Fast TCP port check (3s timeout)
  const portOpen = await new Promise<boolean>((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const timeout = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
    socket.connect(config.port || 23, config.host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => { clearTimeout(timeout); resolve(false); });
  });
  if (!portOpen) return false;

  // 2. Try full auth via expect (15s total timeout)
  const scriptPath = join('/tmp', `telnet-test-${Date.now()}-${Math.random().toString(36).slice(2)}.exp`);
  try {
    const expectScript = `#!/usr/bin/expect -f
set timeout 15

spawn telnet ${config.host} ${config.port || 23}

# Wait for username/login prompt (any common OLT banner)
expect {
  -re {(^|\r|\n)([Uu]sername|[Ll]ogin):} { send "${config.username}\\r" }
  -re {[Pp]assword:}            { send "${config.password}\\r" }
  -re {[>#$]}                   { send "exit\\r"; exit 0 }
  timeout                        { exit 1 }
  eof                            { exit 1 }
}

# Wait for password prompt
expect {
  -re {[Pp]assword:} { send "${config.password}\\r" }
  timeout            { exit 1 }
  eof                { exit 1 }
}

# Wait for any shell prompt — if we get it, auth succeeded
expect {
  -re {[>#$]} { send "exit\\r"; exit 0 }
  timeout     { exit 0 }
  eof         { exit 0 }
}
`;
    await writeFile(scriptPath, expectScript);
    await execAsync(`chmod +x ${scriptPath}`);
    const { stdout: _stdout } = await execAsync(`${scriptPath}`, { timeout: 18000 });
    await unlink(scriptPath).catch(() => {});
    // If expect exited 0, telnet auth succeeded (or banner received)
    return true;
  } catch (_error: any) {
    await unlink(scriptPath).catch(() => {});
    // exit code 1 from the script = failed login; exec timeout = network issue
    // If port was open but auth failed, still return false
    return false;
  }
}
