import { createChildLogger } from '../utils/logger.js';
import type { NetworkProblem } from '../types/analysis.js';

const logger = createChildLogger('alerting-service');

export interface AlertConfig {
  webhookUrl?: string | undefined;
  mqttBroker?: string | undefined;
  mqttTopic?: string | undefined;
  minSeverity: 'info' | 'warning' | 'critical';
  cooldownMinutes: number;
  enabled: boolean;
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AlertHistory {
  alerts: Alert[];
  lastCleared: Date | null;
  totalAlertsSent: number;
}

export class AlertingService {
  private config: AlertConfig = {
    minSeverity: 'warning',
    cooldownMinutes: 15,
    enabled: false,
  };

  private alertHistory: Alert[] = [];
  private lastAlertTime: Map<string, Date> = new Map();
  private totalAlertsSent = 0;

  configure(config: {
    webhookUrl?: string | undefined;
    mqttBroker?: string | undefined;
    mqttTopic?: string | undefined;
    minSeverity?: 'info' | 'warning' | 'critical' | undefined;
    cooldownMinutes?: number | undefined;
    enabled?: boolean | undefined;
  }): void {
    if (config.webhookUrl !== undefined) this.config.webhookUrl = config.webhookUrl;
    if (config.mqttBroker !== undefined) this.config.mqttBroker = config.mqttBroker;
    if (config.mqttTopic !== undefined) this.config.mqttTopic = config.mqttTopic;
    if (config.minSeverity !== undefined) this.config.minSeverity = config.minSeverity;
    if (config.cooldownMinutes !== undefined) this.config.cooldownMinutes = config.cooldownMinutes;
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
    logger.info({ config: this.config }, 'Alerting service configured');
  }

  isEnabled(): boolean {
    return this.config.enabled && (!!this.config.webhookUrl || !!this.config.mqttBroker);
  }

  async processProblems(problems: NetworkProblem[]): Promise<Alert[]> {
    const newAlerts: Alert[] = [];
    const severityOrder = { info: 0, warning: 1, critical: 2 };
    const minSeverityLevel = severityOrder[this.config.minSeverity];

    for (const problem of problems) {
      const problemSeverity = problem.severity === 'error' ? 'warning' : problem.severity;
      const severityLevel = severityOrder[problemSeverity as keyof typeof severityOrder] ?? 0;

      if (severityLevel < minSeverityLevel) continue;

      const alertKey = `${problem.category}-${problem.affectedDevices.join(',')}`;
      const lastAlert = this.lastAlertTime.get(alertKey);
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;

      if (lastAlert && Date.now() - lastAlert.getTime() < cooldownMs) {
        continue;
      }

      const alert: Alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(),
        severity: problemSeverity as Alert['severity'],
        title: this.generateAlertTitle(problem.category, problem.severity),
        message: problem.description,
        source: problem.category,
        details: {
          affectedDevices: problem.affectedDevices,
          recommendation: problem.recommendation,
        },
        acknowledged: false,
      };

      newAlerts.push(alert);
      this.alertHistory.push(alert);
      this.lastAlertTime.set(alertKey, new Date());

      if (this.alertHistory.length > 1000) {
        this.alertHistory = this.alertHistory.slice(-500);
      }
    }

    if (newAlerts.length > 0 && this.isEnabled()) {
      await this.sendAlerts(newAlerts);
    }

    return newAlerts;
  }

  private async sendAlerts(alerts: Alert[]): Promise<void> {
    for (const alert of alerts) {
      if (this.config.webhookUrl) {
        await this.sendWebhook(alert);
      }
      if (this.config.mqttBroker) {
        await this.sendMqtt(alert);
      }
      this.totalAlertsSent++;
    }
  }

  private async sendWebhook(alert: Alert): Promise<boolean> {
    if (!this.config.webhookUrl) return false;

    try {
      const payload = {
        event: 'network_alert',
        alert: {
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.timestamp.toISOString(),
          source: alert.source,
          details: alert.details,
        },
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Webhook delivery failed');
        return false;
      }

      logger.info({ alertId: alert.id }, 'Webhook alert sent');
      return true;
    } catch (err) {
      logger.error({ err }, 'Webhook send error');
      return false;
    }
  }

  private async sendMqtt(alert: Alert): Promise<boolean> {
    if (!this.config.mqttBroker) return false;

    const topic = this.config.mqttTopic ?? 'openclaw/alerts';
    
    logger.info({ 
      alertId: alert.id, 
      broker: this.config.mqttBroker,
      topic,
    }, 'MQTT alert queued (requires mqtt client implementation)');

    return true;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  getActiveAlerts(): Alert[] {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return this.alertHistory.filter(a => 
      !a.acknowledged && a.timestamp.getTime() > cutoff
    );
  }

  getAlertHistory(hours: number = 24): AlertHistory {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return {
      alerts: this.alertHistory.filter(a => a.timestamp.getTime() > cutoff),
      lastCleared: null,
      totalAlertsSent: this.totalAlertsSent,
    };
  }

  clearAlerts(): void {
    this.alertHistory = [];
    this.lastAlertTime.clear();
    logger.info('All alerts cleared');
  }

  private generateAlertTitle(category: string, severity: string): string {
    const categoryTitles: Record<string, string> = {
      signal_weakness: 'Schwaches Signal',
      interference: 'Interferenz erkannt',
      congestion: 'Netzwerk-Überlastung',
      roaming_issue: 'Roaming-Problem',
      protocol_conflict: 'Protokoll-Konflikt',
      configuration_error: 'Konfigurationsfehler',
      hardware_issue: 'Hardware-Problem',
      capacity_exceeded: 'Kapazität überschritten',
      frequency_overlap: 'Frequenz-Überlappung',
    };

    const severityPrefix = severity === 'critical' ? '🚨 ' : severity === 'warning' ? '⚠️ ' : '';
    return `${severityPrefix}${categoryTitles[category] ?? category}`;
  }

  getAlertSummary(): {
    activeCount: number;
    criticalCount: number;
    warningCount: number;
    last24hCount: number;
    isEnabled: boolean;
  } {
    const active = this.getActiveAlerts();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    
    return {
      activeCount: active.length,
      criticalCount: active.filter(a => a.severity === 'critical').length,
      warningCount: active.filter(a => a.severity === 'warning').length,
      last24hCount: this.alertHistory.filter(a => a.timestamp.getTime() > cutoff).length,
      isEnabled: this.isEnabled(),
    };
  }
}
