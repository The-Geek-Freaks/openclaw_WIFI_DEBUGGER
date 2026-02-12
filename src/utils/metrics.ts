import { createChildLogger } from './logger.js';

const logger = createChildLogger('metrics');

export interface MetricPoint {
  timestamp: number;
  value: number;
  labels: Record<string, string>;
}

export interface MetricStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class Counter {
  private value = 0;
  private readonly name: string;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
  }

  inc(delta = 1): void {
    this.value += delta;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  toJSON(): { name: string; type: 'counter'; value: number; labels: Record<string, string> } {
    return { name: this.name, type: 'counter', value: this.value, labels: this.labels };
  }
}

class Gauge {
  private value = 0;
  private readonly name: string;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
  }

  set(value: number): void {
    this.value = value;
  }

  inc(delta = 1): void {
    this.value += delta;
  }

  dec(delta = 1): void {
    this.value -= delta;
  }

  get(): number {
    return this.value;
  }

  toJSON(): { name: string; type: 'gauge'; value: number; labels: Record<string, string> } {
    return { name: this.name, type: 'gauge', value: this.value, labels: this.labels };
  }
}

class Histogram {
  private values: number[] = [];
  private readonly name: string;
  private readonly labels: Record<string, string>;
  private readonly maxSamples: number;

  constructor(name: string, labels: Record<string, string> = {}, maxSamples = 1000) {
    this.name = name;
    this.labels = labels;
    this.maxSamples = maxSamples;
  }

  observe(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSamples) {
      this.values.shift();
    }
  }

  getStats(): MetricStats {
    if (this.values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      sum,
      min: sorted[0]!,
      max: sorted[count - 1]!,
      avg: sum / count,
      p50: sorted[Math.floor(count * 0.5)]!,
      p95: sorted[Math.floor(count * 0.95)]!,
      p99: sorted[Math.floor(count * 0.99)]!,
    };
  }

  reset(): void {
    this.values = [];
  }

  toJSON(): { name: string; type: 'histogram'; stats: MetricStats; labels: Record<string, string> } {
    return { name: this.name, type: 'histogram', stats: this.getStats(), labels: this.labels };
  }
}

class SkillMetrics {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private readonly startTime = Date.now();

  // Pre-defined metrics
  readonly actionTotal = this.counter('skill_actions_total');
  readonly actionErrors = this.counter('skill_action_errors_total');
  readonly actionDuration = this.histogram('skill_action_duration_ms');
  readonly sshCommands = this.counter('skill_ssh_commands_total');
  readonly sshErrors = this.counter('skill_ssh_errors_total');
  readonly sshDuration = this.histogram('skill_ssh_duration_ms');
  readonly deviceCount = this.gauge('skill_devices_total');
  readonly nodeCount = this.gauge('skill_mesh_nodes_total');
  readonly circuitBreakerState = this.gauge('skill_circuit_breaker_open');

  private counter(name: string, labels: Record<string, string> = {}): Counter {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, labels));
    }
    return this.counters.get(key)!;
  }

  private gauge(name: string, labels: Record<string, string> = {}): Gauge {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, labels));
    }
    return this.gauges.get(key)!;
  }

  private histogram(name: string, labels: Record<string, string> = {}): Histogram {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, labels));
    }
    return this.histograms.get(key)!;
  }

  labeledCounter(name: string, labels: Record<string, string>): Counter {
    return this.counter(name, labels);
  }

  labeledHistogram(name: string, labels: Record<string, string>): Histogram {
    return this.histogram(name, labels);
  }

  recordAction(action: string, durationMs: number, success: boolean): void {
    this.actionTotal.inc();
    this.actionDuration.observe(durationMs);
    this.labeledCounter('skill_actions_by_type', { action }).inc();
    this.labeledHistogram('skill_action_duration_by_type', { action }).observe(durationMs);
    
    if (!success) {
      this.actionErrors.inc();
      this.labeledCounter('skill_action_errors_by_type', { action }).inc();
    }
  }

  recordSshCommand(durationMs: number, success: boolean): void {
    this.sshCommands.inc();
    this.sshDuration.observe(durationMs);
    if (!success) {
      this.sshErrors.inc();
    }
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getAll(): {
    uptime: number;
    counters: Array<ReturnType<Counter['toJSON']>>;
    gauges: Array<ReturnType<Gauge['toJSON']>>;
    histograms: Array<ReturnType<Histogram['toJSON']>>;
  } {
    return {
      uptime: this.getUptime(),
      counters: Array.from(this.counters.values()).map(c => c.toJSON()),
      gauges: Array.from(this.gauges.values()).map(g => g.toJSON()),
      histograms: Array.from(this.histograms.values()).map(h => h.toJSON()),
    };
  }

  getSummary(): {
    uptime: number;
    actions: { total: number; errors: number; errorRate: number; avgDuration: number };
    ssh: { total: number; errors: number; errorRate: number; avgDuration: number };
    network: { devices: number; nodes: number };
  } {
    const actionStats = this.actionDuration.getStats();
    const sshStats = this.sshDuration.getStats();
    const actionTotal = this.actionTotal.get();
    const sshTotal = this.sshCommands.get();

    return {
      uptime: this.getUptime(),
      actions: {
        total: actionTotal,
        errors: this.actionErrors.get(),
        errorRate: actionTotal > 0 ? (this.actionErrors.get() / actionTotal) * 100 : 0,
        avgDuration: actionStats.avg,
      },
      ssh: {
        total: sshTotal,
        errors: this.sshErrors.get(),
        errorRate: sshTotal > 0 ? (this.sshErrors.get() / sshTotal) * 100 : 0,
        avgDuration: sshStats.avg,
      },
      network: {
        devices: this.deviceCount.get(),
        nodes: this.nodeCount.get(),
      },
    };
  }

  logSummary(): void {
    const summary = this.getSummary();
    logger.info(summary, 'Skill metrics summary');
  }

  reset(): void {
    this.counters.forEach(c => c.reset());
    this.histograms.forEach(h => h.reset());
  }
}

export const metrics = new SkillMetrics();
