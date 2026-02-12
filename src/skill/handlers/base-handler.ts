import type { SkillResponse } from '../actions.js';
import { createChildLogger } from '../../utils/logger.js';

export abstract class BaseHandler {
  protected readonly logger;

  constructor(name: string) {
    this.logger = createChildLogger(`handler:${name}`);
  }

  protected successResponse(
    action: string,
    data: unknown,
    options: {
      suggestions?: string[];
      confidence?: number;
      dataQuality?: 'complete' | 'partial' | 'estimated';
    } = {}
  ): SkillResponse {
    return {
      success: true,
      action,
      data,
      suggestions: options.suggestions,
      timestamp: new Date().toISOString(),
    };
  }

  protected errorResponse(action: string, error: string): SkillResponse {
    this.logger.error({ action, error }, 'Handler error');
    return {
      success: false,
      action,
      error,
      timestamp: new Date().toISOString(),
    };
  }
}

export interface HandlerContext {
  sshClient: unknown;
  hassClient: unknown;
  meshAnalyzer: unknown;
  zigbeeAnalyzer: unknown;
  frequencyOptimizer: unknown;
  problemDetector: unknown;
  knowledgeBase: unknown;
  tweaksChecker: unknown;
  realTriangulation: unknown;
  benchmarkEngine: unknown;
  heatmapGenerator: unknown;
  networkIntelligence: unknown;
  spatialEngine: unknown;
  floorPlanManager: unknown;
  meshState: unknown;
  zigbeeState: unknown;
  pendingOptimizations: Map<string, unknown>;
}
