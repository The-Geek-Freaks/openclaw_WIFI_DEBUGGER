import { createChildLogger } from '../utils/logger.js';
import { DEFAULT_NOISE_FLOOR_DBM } from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { 
  BenchmarkSuiteResult, 
  IperfResult, 
  LatencyTestResult,
  ChannelTestResult,
  SpectrumScanResult 
} from '../types/benchmark.js';

const logger = createChildLogger('benchmark-engine');

export class BenchmarkEngine {
  private readonly sshClient: AsusSshClient;
  private benchmarkHistory: BenchmarkSuiteResult[] = [];

  constructor(sshClient: AsusSshClient) {
    this.sshClient = sshClient;
  }

  async runThroughputTest(
    targetHost: string,
    duration: number = 10,
    protocol: 'tcp' | 'udp' = 'tcp'
  ): Promise<IperfResult | null> {
    logger.info({ targetHost, duration, protocol }, 'Running throughput test');

    try {
      const flags = protocol === 'udp' ? '-u -b 0' : '';
      const command = `iperf3 -c ${targetHost} -t ${duration} ${flags} -J 2>/dev/null || echo '{"error": true}'`;
      
      const output = await this.sshClient.execute(command);
      
      try {
        const result = JSON.parse(output);
        
        if (result.error) {
          logger.warn('iPerf3 not available or target unreachable');
          return null;
        }

        const endData = result.end;
        
        return {
          timestamp: new Date(),
          sourceNode: 'router',
          targetNode: targetHost,
          protocol,
          direction: 'upload',
          duration,
          bandwidthMbps: (endData?.sum_sent?.bits_per_second ?? 0) / 1_000_000,
          transferMB: (endData?.sum_sent?.bytes ?? 0) / 1_000_000,
          retransmits: endData?.sum_sent?.retransmits,
          jitterMs: endData?.sum?.jitter_ms,
          packetLossPercent: endData?.sum?.lost_percent,
        };
      } catch {
        logger.warn('Failed to parse iPerf3 output');
        return null;
      }
    } catch (err) {
      logger.error({ err }, 'Throughput test failed');
      return null;
    }
  }

  async runLatencyTest(
    targetHost: string,
    count: number = 20
  ): Promise<LatencyTestResult | null> {
    logger.info({ targetHost, count }, 'Running latency test');

    try {
      const output = await this.sshClient.execute(`ping -c ${count} -W 2 ${targetHost}`);
      
      const lines = output.split('\n');
      const statsLine = lines.find(l => l.includes('min/avg/max'));
      const lossLine = lines.find(l => l.includes('packet loss'));

      if (!statsLine) {
        logger.warn('Could not parse ping output');
        return null;
      }

      const statsMatch = statsLine.match(/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)/);
      const lossMatch = lossLine?.match(/(\d+)%/);
      const sentMatch = lossLine?.match(/(\d+) packets transmitted/);
      const recvMatch = lossLine?.match(/(\d+) received/);

      if (!statsMatch) return null;

      return {
        timestamp: new Date(),
        target: targetHost,
        minMs: parseFloat(statsMatch[1]!),
        avgMs: parseFloat(statsMatch[2]!),
        maxMs: parseFloat(statsMatch[3]!),
        jitterMs: parseFloat(statsMatch[4]!) || (parseFloat(statsMatch[3]!) - parseFloat(statsMatch[1]!)) / 2,
        packetsSent: parseInt(sentMatch?.[1] ?? String(count), 10),
        packetsReceived: parseInt(recvMatch?.[1] ?? String(count), 10),
        packetLossPercent: parseFloat(lossMatch?.[1] ?? '0'),
      };
    } catch (err) {
      logger.error({ err }, 'Latency test failed');
      return null;
    }
  }

  async runChannelTest(
    band: '2g' | '5g',
    durationSeconds: number = 10
  ): Promise<ChannelTestResult[]> {
    logger.info({ band, durationSeconds }, 'Running channel test');

    const results: ChannelTestResult[] = [];

    try {
      const iface = this.sshClient.getInterface(band);
      const scanOutput = await this.sshClient.execute(`wl -i ${iface} scanresults`);
      
      const channelStats = new Map<number, {
        aps: number;
        signals: number[];
      }>();

      const lines = scanOutput.split('\n');
      for (const line of lines) {
        const channelMatch = line.match(/Channel:\s*(\d+)/);
        const rssiMatch = line.match(/RSSI:\s*(-?\d+)/);
        
        if (channelMatch) {
          const channel = parseInt(channelMatch[1]!, 10);
          const rssi = rssiMatch ? parseInt(rssiMatch[1]!, 10) : -90;
          
          if (!channelStats.has(channel)) {
            channelStats.set(channel, { aps: 0, signals: [] });
          }
          
          const stats = channelStats.get(channel)!;
          stats.aps++;
          stats.signals.push(rssi);
        }
      }

      const channels = band === '2g' 
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
        : [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];

      for (const channel of channels) {
        const stats = channelStats.get(channel) ?? { aps: 0, signals: [] };
        const avgSignal = stats.signals.length > 0
          ? stats.signals.reduce((a, b) => a + b, 0) / stats.signals.length
          : -95;

        const utilization = Math.min(100, stats.aps * 15 + (avgSignal > -60 ? 30 : 0));
        const coChannel = stats.aps * 10;
        const adjacent = this.calculateAdjacentInterference(channel, channelStats);

        let score = 100 - utilization * 0.5 - coChannel * 0.3 - adjacent * 0.2;
        score = Math.max(0, Math.min(100, score));

        let recommendation: 'excellent' | 'good' | 'acceptable' | 'avoid';
        if (score >= 80) recommendation = 'excellent';
        else if (score >= 60) recommendation = 'good';
        else if (score >= 40) recommendation = 'acceptable';
        else recommendation = 'avoid';

        results.push({
          channel,
          band: band === '2g' ? '2.4GHz' : '5GHz',
          testDuration: durationSeconds,
          metrics: {
            noiseFloorDbm: DEFAULT_NOISE_FLOOR_DBM,
            avgUtilization: utilization,
            peakUtilization: Math.min(100, utilization * 1.2),
            interferingAPs: stats.aps,
            coChannelInterference: coChannel,
            adjacentChannelInterference: adjacent,
          },
          score,
          recommendation,
        });
      }
    } catch (err) {
      logger.error({ err }, 'Channel test failed');
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private calculateAdjacentInterference(
    channel: number,
    stats: Map<number, { aps: number; signals: number[] }>
  ): number {
    let interference = 0;
    
    for (let offset = -2; offset <= 2; offset++) {
      if (offset === 0) continue;
      const adjacent = stats.get(channel + offset);
      if (adjacent) {
        interference += adjacent.aps * (3 - Math.abs(offset));
      }
    }
    
    return interference;
  }

  async runSpectrumScan(band: '2g' | '5g'): Promise<SpectrumScanResult> {
    logger.info({ band }, 'Running spectrum scan');

    const channelResults = await this.runChannelTest(band, 10);
    const bestChannel = channelResults[0]?.channel ?? (band === '2g' ? 1 : 36);
    
    let currentChannel = 0;
    try {
      const nvramKey = band === '2g' ? 'wl0_channel' : 'wl1_channel';
      const output = await this.sshClient.execute(`nvram get ${nvramKey}`);
      currentChannel = parseInt(output.trim(), 10) || 0;
    } catch {
      logger.warn('Could not get current channel');
    }

    let recommendedAction: string | undefined;
    if (channelResults.length > 0) {
      const currentScore = channelResults.find(c => c.channel === currentChannel)?.score ?? 0;
      const bestScore = channelResults[0]!.score;
      
      if (bestScore - currentScore > 20) {
        recommendedAction = `Wechsel von Kanal ${currentChannel} zu ${bestChannel} empfohlen (+${(bestScore - currentScore).toFixed(0)} Score)`;
      }
    }

    return {
      timestamp: new Date(),
      band: band === '2g' ? '2.4GHz' : '5GHz',
      scanDuration: 10,
      channels: channelResults,
      bestChannel,
      currentChannel,
      recommendedAction,
    };
  }

  async runFullBenchmark(targets: string[] = ['8.8.8.8', '1.1.1.1']): Promise<BenchmarkSuiteResult> {
    logger.info('Running full benchmark suite');
    const startTime = Date.now();

    const latencyResults: LatencyTestResult[] = [];
    const throughputResults: IperfResult[] = [];

    for (const target of targets) {
      const latency = await this.runLatencyTest(target, 10);
      if (latency) latencyResults.push(latency);
    }

    const throughput = await this.runThroughputTest(targets[0] ?? '8.8.8.8', 5);
    if (throughput) throughputResults.push(throughput);

    const scores = this.calculateScores(latencyResults, throughputResults);

    const previousResult = this.benchmarkHistory[this.benchmarkHistory.length - 1];
    
    const result: BenchmarkSuiteResult = {
      id: `bench_${Date.now()}`,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      tests: {
        latency: latencyResults,
        throughput: throughputResults,
      },
      scores,
      comparison: previousResult ? {
        previousScore: previousResult.scores.overall,
        improvement: scores.overall - previousResult.scores.overall,
        trend: scores.overall > previousResult.scores.overall ? 'improving' 
             : scores.overall < previousResult.scores.overall ? 'degrading' 
             : 'stable',
      } : undefined,
    };

    this.benchmarkHistory.push(result);
    logger.info({ scores, duration: result.duration }, 'Benchmark complete');

    return result;
  }

  private calculateScores(
    latencyResults: LatencyTestResult[],
    throughputResults: IperfResult[]
  ): BenchmarkSuiteResult['scores'] {
    let latencyScore = 100;
    let throughputScore = 50;
    let stabilityScore = 100;

    if (latencyResults.length > 0) {
      const avgLatency = latencyResults.reduce((s, r) => s + r.avgMs, 0) / latencyResults.length;
      const avgJitter = latencyResults.reduce((s, r) => s + r.jitterMs, 0) / latencyResults.length;
      const avgLoss = latencyResults.reduce((s, r) => s + r.packetLossPercent, 0) / latencyResults.length;

      if (avgLatency < 10) latencyScore = 100;
      else if (avgLatency < 30) latencyScore = 90;
      else if (avgLatency < 50) latencyScore = 80;
      else if (avgLatency < 100) latencyScore = 60;
      else latencyScore = 40;

      stabilityScore = 100 - avgLoss * 10 - avgJitter;
      stabilityScore = Math.max(0, Math.min(100, stabilityScore));
    }

    if (throughputResults.length > 0) {
      const avgBandwidth = throughputResults.reduce((s, r) => s + r.bandwidthMbps, 0) / throughputResults.length;
      
      if (avgBandwidth > 500) throughputScore = 100;
      else if (avgBandwidth > 200) throughputScore = 80;
      else if (avgBandwidth > 100) throughputScore = 60;
      else if (avgBandwidth > 50) throughputScore = 40;
      else throughputScore = 20;
    }

    const overall = Math.round(
      latencyScore * 0.3 + throughputScore * 0.4 + stabilityScore * 0.3
    );

    // Coverage score: estimate based on stability and throughput
    // Real coverage requires spatial data from triangulation/heatmap
    const coverageScore = this.estimateCoverageScore(latencyResults, throughputResults);

    return {
      overall,
      throughput: throughputScore,
      latency: latencyScore,
      stability: stabilityScore,
      coverage: coverageScore,
    };
  }

  private estimateCoverageScore(
    latencyResults: LatencyTestResult[],
    throughputResults: IperfResult[]
  ): number {
    // Without spatial data, estimate coverage from:
    // 1. Packet loss (high loss = poor coverage somewhere)
    // 2. Latency variance (high variance = inconsistent coverage)
    // 3. Throughput consistency
    
    if (latencyResults.length === 0) return 50; // No data = neutral estimate

    const avgPacketLoss = latencyResults.reduce((s, r) => s + r.packetLossPercent, 0) / latencyResults.length;
    const avgJitter = latencyResults.reduce((s, r) => s + r.jitterMs, 0) / latencyResults.length;

    // Start at 100, deduct for issues
    let score = 100;
    
    // Packet loss heavily impacts coverage estimate
    score -= avgPacketLoss * 5;
    
    // High jitter suggests coverage inconsistency
    if (avgJitter > 50) score -= 20;
    else if (avgJitter > 20) score -= 10;
    else if (avgJitter > 10) score -= 5;

    // Low throughput can indicate coverage issues
    if (throughputResults.length > 0) {
      const avgBandwidth = throughputResults.reduce((s, r) => s + r.bandwidthMbps, 0) / throughputResults.length;
      if (avgBandwidth < 10) score -= 20;
      else if (avgBandwidth < 50) score -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getBenchmarkHistory(): BenchmarkSuiteResult[] {
    return [...this.benchmarkHistory];
  }

  compareBenchmarks(id1: string, id2: string): {
    improvement: number;
    details: Record<string, number>;
  } | null {
    const b1 = this.benchmarkHistory.find(b => b.id === id1);
    const b2 = this.benchmarkHistory.find(b => b.id === id2);

    if (!b1 || !b2) return null;

    return {
      improvement: b2.scores.overall - b1.scores.overall,
      details: {
        throughput: b2.scores.throughput - b1.scores.throughput,
        latency: b2.scores.latency - b1.scores.latency,
        stability: b2.scores.stability - b1.scores.stability,
      },
    };
  }
}
