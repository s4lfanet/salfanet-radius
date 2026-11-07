/**
 * ONU reboot over the ZTE CLI, as the operator's NMS does it after testing on a live OLT.
 *
 * A ZTE ONU reboots through OMCI ("pon-onu-mng", "reboot"), and the OLT then asks
 * "Confirm to reboot? [yes/no]:". Unanswered, the ONU stays up. Other brands of ONU do not react
 * to that command, so their interface is shut down and brought back, which makes them register again.
 */
import { executeMultipleCommands, type TelnetConfig } from './telnet';

const CLI_ERROR = /%Error|invalid input|invalid command|bad password/i;

function normalizeTelnetOutput(output: string): string {
  return output
    .replace(/\r/g, '')
    .replace(/\x08/g, '')
    .replace(/--More--/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function commandSection(output: string, index: number, command: string): string {
  const startToken = `__COPILOT_CMD_${index}_START__`;
  const endToken = `__COPILOT_CMD_${index}_END__`;
  const start = output.indexOf(startToken);
  if (start === -1) return '';
  const from = start + startToken.length;
  const end = output.indexOf(endToken, from);
  const section = end === -1 ? output.slice(from) : output.slice(from, end);
  const lines = normalizeTelnetOutput(section)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  while (lines.length && lines[0].trim() === command.trim()) lines.shift();
  while (lines.length && /^[A-Za-z0-9_.-]+[>#]/.test(lines[lines.length - 1].trim())) lines.pop();

  return lines.join('\n').trim();
}

export interface ZteRebootPlan {
  commands: string[];
  /** The command whose output says whether it worked. */
  checked: number;
  pauseAfter?: Record<number, number>;
  label: string;
}

export function zteRebootPlan(iface: string, serial: string | null | undefined): ZteRebootPlan {
  if (/^ZTE/i.test(serial ?? '')) {
    return { commands: ['configure terminal', `pon-onu-mng ${iface}`, 'reboot', 'exit', 'end'], checked: 2, label: `pon-onu-mng ${iface} -> reboot` };
  }
  return {
    commands: ['configure terminal', `interface ${iface}`, 'shutdown', 'no shutdown', 'exit', 'end'],
    checked: 3,
    pauseAfter: { 2: 2 },
    label: `interface ${iface} -> shutdown, no shutdown`,
  };
}

export async function rebootZteOnu(
  config: TelnetConfig,
  onu: { frame: number; slot: number; port: number; onuId: number; serialNumber: string | null },
): Promise<{ ok: boolean; label: string; detail: string }> {
  // DB port is zero-based, the ZTE CLI one-based.
  const plan = zteRebootPlan(`gpon-onu_${onu.frame}/${onu.slot}/${onu.port + 1}:${onu.onuId}`, onu.serialNumber);
  const result = await executeMultipleCommands(config, plan.commands, { sendEnd: false, answerConfirm: true, pauseAfter: plan.pauseAfter });
  const output = result.output ?? result.error ?? '';
  const detail = commandSection(output, plan.checked, plan.commands[plan.checked]) || normalizeTelnetOutput(output);
  return { ok: result.success && !CLI_ERROR.test(detail), label: plan.label, detail };
}
