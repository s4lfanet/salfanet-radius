/**
 * SSH Client for OLT Command Execution
 */

import { Client, ConnectConfig, Channel } from 'ssh2';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  timeout?: number;
}

export interface SSHResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Execute a single command via SSH exec
 */
export async function executeCommand(config: SSHConfig, command: string): Promise<SSHResult> {
  return new Promise((resolve) => {
    const client = new Client();
    let output = '';
    let errorOutput = '';

    const connectionConfig: ConnectConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: config.timeout || 30000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      algorithms: {
        kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group-exchange-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521'],
        cipher: ['aes128-cbc', '3des-cbc', 'blowfish-cbc', 'aes192-cbc', 'aes256-cbc', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
        hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-md5'],
      },
    };

    const timeout = setTimeout(() => {
      client.end();
      resolve({ success: false, error: 'SSH connection timeout' });
    }, config.timeout || 30000);

    client.on('ready', () => {
      client.exec(command, (err: Error | undefined, stream: Channel) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
          return;
        }

        stream.on('data', (data: Buffer) => { output += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });

        stream.on('close', (code: number) => {
          clearTimeout(timeout);
          client.end();
          if (code !== 0 && errorOutput) {
            resolve({ success: false, error: errorOutput });
          } else {
            resolve({ success: true, output });
          }
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
        });
      });
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    client.connect(connectionConfig);
  });
}

/**
 * Execute multiple commands in an interactive SSH shell
 */
export async function executeCommandsInShell(config: SSHConfig, commands: string[]): Promise<SSHResult> {
  return new Promise((resolve) => {
    const client = new Client();
    let output = '';
    let errorOutput = '';

    const connectionConfig: ConnectConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: config.timeout || 30000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      algorithms: {
        kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group-exchange-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521'],
        cipher: ['aes128-cbc', '3des-cbc', 'blowfish-cbc', 'aes192-cbc', 'aes256-cbc', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
        hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-md5'],
      },
    };

    const timeout = setTimeout(() => {
      client.end();
      resolve({ success: false, error: 'SSH shell timeout' });
    }, (config.timeout || 30000) * commands.length);

    client.on('ready', () => {
      client.shell((err: Error | undefined, stream: Channel) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let commandIndex = 0;

        stream.on('data', (data: Buffer) => {
          output += data.toString();
          if (commandIndex < commands.length) {
            const dataStr = data.toString();
            if (dataStr.includes('#') || dataStr.includes('>') || dataStr.includes('$')) {
              setTimeout(() => {
                if (commandIndex < commands.length) {
                  stream.write(commands[commandIndex] + '\n');
                  commandIndex++;
                  if (commandIndex === commands.length) {
                    setTimeout(() => { stream.write('exit\n'); }, 500);
                  }
                }
              }, 200);
            }
          }
        });

        stream.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });

        stream.on('close', () => {
          clearTimeout(timeout);
          client.end();
          if (errorOutput && !output) {
            resolve({ success: false, error: errorOutput });
          } else {
            resolve({ success: true, output });
          }
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
        });
      });
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    client.connect(connectionConfig);
  });
}

/**
 * Test SSH connectivity — just check if handshake/auth succeeds, no command needed
 */
export async function testSSH(config: SSHConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new Client();
    const timeout = setTimeout(() => {
      client.end();
      resolve(false);
    }, config.timeout || 15000);

    client.on('ready', () => {
      clearTimeout(timeout);
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    client.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      readyTimeout: config.timeout || 15000,
      algorithms: {
        kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group-exchange-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521'],
        cipher: ['aes128-cbc', '3des-cbc', 'blowfish-cbc', 'aes192-cbc', 'aes256-cbc', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
        hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-md5'],
      },
    });
  });
}
