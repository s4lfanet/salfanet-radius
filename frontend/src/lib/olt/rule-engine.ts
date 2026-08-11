/**
 * Custom Alert Rule Engine
 * Evaluates complex alert conditions and executes actions
 */

// Condition types
export interface RuleCondition {
  metric: string; // 'offline_onu_count' | 'low_signal_count' | 'temperature' | 'cpu_usage' | 'memory_usage' | etc.
  operator: string; // '>=' | '<=' | '>' | '<' | '==' | '!='
  value: number;
  timeWindow?: number; // seconds
  logicOperator?: 'AND' | 'OR';
}

// Action types
export interface RuleAction {
  type: string; // 'whatsapp' | 'email' | 'log' | 'webhook'
  severity?: string; // 'info' | 'warning' | 'critical'
  recipients?: string[];
  webhookUrl?: string;
  message?: string;
}

// Schedule configuration
export interface RuleSchedule {
  days?: number[]; // 0=Sunday, 6=Saturday
  hours?: { start: number; end: number };
  timezone?: string;
}

// Context data for rule evaluation
export interface RuleContext {
  oltId: string;
  oltName: string;
  offlineOnuCount: number;
  lowSignalCount: number;
  dyingGaspCount: number;
  temperature: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  totalOnu: number;
  onlineOnu: number;
  offlineOnu: number;
  onus: any[];
  timestamp: Date;
}

/**
 * Evaluate a single condition against context
 */
function evaluateCondition(condition: RuleCondition, context: RuleContext): boolean {
  let actualValue: number | null = null;

  switch (condition.metric) {
    case 'offline_onu_count':       actualValue = context.offlineOnuCount; break;
    case 'low_signal_count':        actualValue = context.lowSignalCount; break;
    case 'dying_gasp_count':        actualValue = context.dyingGaspCount; break;
    case 'temperature':             actualValue = context.temperature; break;
    case 'cpu_usage':               actualValue = context.cpuUsage; break;
    case 'memory_usage':            actualValue = context.memoryUsage; break;
    case 'total_onu':               actualValue = context.totalOnu; break;
    case 'online_onu':              actualValue = context.onlineOnu; break;
    case 'offline_onu_percentage':
      actualValue = context.totalOnu > 0
        ? (context.offlineOnu / context.totalOnu) * 100
        : 0;
      break;
    default:
      console.warn(`[RuleEngine] Unknown metric: ${condition.metric}`);
      return false;
  }

  if (actualValue === null) return false;

  switch (condition.operator) {
    case '>=': return actualValue >= condition.value;
    case '<=': return actualValue <= condition.value;
    case '>':  return actualValue > condition.value;
    case '<':  return actualValue < condition.value;
    case '==': return actualValue === condition.value;
    case '!=': return actualValue !== condition.value;
    default:
      console.warn(`[RuleEngine] Unknown operator: ${condition.operator}`);
      return false;
  }
}

/**
 * Evaluate all conditions with AND/OR logic
 */
function evaluateConditions(conditions: RuleCondition[], context: RuleContext): boolean {
  if (conditions.length === 0) return false;

  let result = evaluateCondition(conditions[0], context);

  for (let i = 1; i < conditions.length; i++) {
    const condition = conditions[i];
    const prevCondition = conditions[i - 1];
    const conditionResult = evaluateCondition(condition, context);

    if (prevCondition.logicOperator === 'OR') {
      result = result || conditionResult;
    } else {
      result = result && conditionResult;
    }
  }

  return result;
}

/**
 * Check if current time matches schedule
 */
function isScheduleActive(schedule: RuleSchedule | null): boolean {
  if (!schedule) return true;

  const now = new Date();

  if (schedule.days && schedule.days.length > 0) {
    if (!schedule.days.includes(now.getDay())) return false;
  }

  if (schedule.hours) {
    const currentHour = now.getHours();
    const { start, end } = schedule.hours;
    if (start <= end) {
      if (currentHour < start || currentHour > end) return false;
    } else {
      if (currentHour < start && currentHour > end) return false;
    }
  }

  return true;
}

/**
 * Check if rule is in cooldown period
 */
function isInCooldown(lastTriggeredAt: Date | null, cooldownSeconds: number): boolean {
  if (!lastTriggeredAt) return false;
  const cooldownMs = cooldownSeconds * 1000;
  return Date.now() - lastTriggeredAt.getTime() < cooldownMs;
}

/**
 * Create rule context from OLT poll data
 */
export function createRuleContext(
  oltId: string,
  oltName: string,
  onus: any[],
  metrics: {
    temperature?: number | null;
    cpuUsage?: number | null;
    memoryUsage?: number | null;
  }
): RuleContext {
  const onlineOnus = onus.filter((o) => o.status === 'online');
  const offlineOnus = onus.filter((o) => o.status === 'offline');
  const dyingGaspOnus = onus.filter((o) => o.status === 'dying_gasp');
  const lowSignalOnus = onus.filter((o) => o.rxPower !== null && o.rxPower < -27);

  return {
    oltId,
    oltName,
    offlineOnuCount: offlineOnus.length,
    lowSignalCount: lowSignalOnus.length,
    dyingGaspCount: dyingGaspOnus.length,
    temperature: metrics.temperature ?? null,
    cpuUsage: metrics.cpuUsage ?? null,
    memoryUsage: metrics.memoryUsage ?? null,
    totalOnu: onus.length,
    onlineOnu: onlineOnus.length,
    offlineOnu: offlineOnus.length,
    onus,
    timestamp: new Date(),
  };
}

/**
 * Evaluate custom alert rules for an OLT
 * Returns array of triggered rules with their actions
 */
export async function evaluateCustomRules(
  rules: Array<{
    id: string;
    name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    schedule: RuleSchedule | null;
    cooldownSeconds: number;
    lastTriggeredAt: Date | null;
  }>,
  context: RuleContext
): Promise<Array<{ ruleId: string; ruleName: string; actions: RuleAction[] }>> {
  const triggered: Array<{ ruleId: string; ruleName: string; actions: RuleAction[] }> = [];

  for (const rule of rules) {
    // Check schedule
    if (!isScheduleActive(rule.schedule)) continue;

    // Check cooldown
    if (isInCooldown(rule.lastTriggeredAt, rule.cooldownSeconds)) continue;

    // Evaluate conditions
    if (evaluateConditions(rule.conditions, context)) {
      triggered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        actions: rule.actions,
      });
    }
  }

  return triggered;
}
