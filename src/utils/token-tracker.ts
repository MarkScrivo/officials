export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model: string;
  operation: string;
  timestamp: string;
}

export interface TokenSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  operationCount: number;
  operations: TokenUsage[];
  averageCostPerOperation: number;
}

// Model pricing per 1M tokens (input/output)
export const MODEL_PRICING = {
  // Gemini models
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  
  // OpenAI models
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  'gpt-5-mini-2025-08-07': { input: 0.25, output: 2.00 },
  'gpt-5': { input: 1.25, output: 10.00 },
  
  // Anthropic models
  'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 }
};

export class TokenTracker {
  private tokenUsages: TokenUsage[] = [];
  
  /**
   * Track token usage for an API call
   */
  trackUsage(
    inputTokens: number,
    outputTokens: number,
    model: string,
    operation: string
  ): TokenUsage {
    const totalTokens = inputTokens + outputTokens;
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
    
    if (!pricing) {
      console.warn(`Unknown model for pricing: ${model}, using default Gemini Flash-Lite pricing`);
      const defaultPricing = MODEL_PRICING['gemini-2.5-flash-lite'];
      const inputCost = (inputTokens / 1_000_000) * defaultPricing.input;
      const outputCost = (outputTokens / 1_000_000) * defaultPricing.output;
      const cost = inputCost + outputCost;
      
      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        model,
        operation,
        timestamp: new Date().toISOString()
      };
      
      this.tokenUsages.push(usage);
      return usage;
    }
    
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const cost = inputCost + outputCost;
    
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      model,
      operation,
      timestamp: new Date().toISOString()
    };
    
    this.tokenUsages.push(usage);
    
    console.log(`🔢 Token Usage - ${operation}:`);
    console.log(`   Model: ${model}`);
    console.log(`   Input: ${inputTokens.toLocaleString()} tokens ($${inputCost.toFixed(6)})`);
    console.log(`   Output: ${outputTokens.toLocaleString()} tokens ($${outputCost.toFixed(6)})`);
    console.log(`   Total: ${totalTokens.toLocaleString()} tokens ($${cost.toFixed(6)})`);
    
    return usage;
  }
  
  /**
   * Get summary of all token usage
   */
  getSummary(): TokenSummary {
    const totalInputTokens = this.tokenUsages.reduce((sum, usage) => sum + usage.inputTokens, 0);
    const totalOutputTokens = this.tokenUsages.reduce((sum, usage) => sum + usage.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCost = this.tokenUsages.reduce((sum, usage) => sum + usage.cost, 0);
    const operationCount = this.tokenUsages.length;
    const averageCostPerOperation = operationCount > 0 ? totalCost / operationCount : 0;
    
    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCost,
      operationCount,
      operations: [...this.tokenUsages],
      averageCostPerOperation
    };
  }
  
  /**
   * Print detailed summary
   */
  printSummary(): void {
    const summary = this.getSummary();
    
    console.log('\n💰 TOKEN USAGE SUMMARY');
    console.log('=' .repeat(50));
    console.log(`Total Operations: ${summary.operationCount}`);
    console.log(`Total Input Tokens: ${summary.totalInputTokens.toLocaleString()}`);
    console.log(`Total Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`);
    console.log(`Total Tokens: ${summary.totalTokens.toLocaleString()}`);
    
    // Show model used
    if (summary.operations.length > 0) {
      const model = summary.operations[0].model;
      console.log(`Model Used: ${model}`);
      
      // Show cost comparison with other models
      console.log(`\nCost Comparison:`);
      console.log(`  Current Model (${model}): $${summary.totalCost.toFixed(6)}`);
      
      // Calculate costs for other models
      const models = Object.keys(MODEL_PRICING) as Array<keyof typeof MODEL_PRICING>;
      models.forEach(m => {
        if (m !== model) {
          const altCost = TokenTracker.estimateCost(
            summary.totalInputTokens,
            summary.totalOutputTokens,
            m
          );
          const diff = altCost - summary.totalCost;
          const percent = summary.totalCost > 0 ? ((diff / summary.totalCost) * 100) : 0;
          const cheaper = diff < 0;
          console.log(`  ${m}: $${altCost.toFixed(6)} (${cheaper ? '' : '+'}${percent.toFixed(1)}%)`);
        }
      });
    }
    
    console.log(`\nAverage Cost per Operation: $${summary.averageCostPerOperation.toFixed(6)}`);
    
    if (summary.operations.length > 0) {
      console.log('\nBreakdown by Operation:');
      const operationSummary = new Map<string, { count: number; cost: number; tokens: number }>();
      
      summary.operations.forEach(op => {
        const current = operationSummary.get(op.operation) || { count: 0, cost: 0, tokens: 0 };
        operationSummary.set(op.operation, {
          count: current.count + 1,
          cost: current.cost + op.cost,
          tokens: current.tokens + op.totalTokens
        });
      });
      
      operationSummary.forEach((data, operation) => {
        console.log(`  ${operation}:`);
        console.log(`    Calls: ${data.count}`);
        console.log(`    Tokens: ${data.tokens.toLocaleString()}`);
        console.log(`    Cost: $${data.cost.toFixed(6)}`);
        console.log(`    Avg Cost/Call: $${(data.cost / data.count).toFixed(6)}`);
      });
    }
  }
  
  /**
   * Clear all tracking data
   */
  reset(): void {
    this.tokenUsages = [];
  }
  
  /**
   * Get cost estimate for given token counts with a specific model
   */
  static estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: keyof typeof MODEL_PRICING
  ): number {
    const pricing = MODEL_PRICING[model];
    
    if (!pricing) {
      console.warn(`Unknown model: ${model}`);
      return 0;
    }
    
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }
  
  /**
   * Compare costs between all models
   */
  static compareCosts(inputTokens: number, outputTokens: number): Record<string, number> {
    const costs: Record<string, number> = {};
    
    Object.keys(MODEL_PRICING).forEach(model => {
      costs[model] = this.estimateCost(
        inputTokens,
        outputTokens,
        model as keyof typeof MODEL_PRICING
      );
    });
    
    return costs;
  }
  
  /**
   * Get model information
   */
  static getModelInfo(model: string): string {
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
    
    if (!pricing) {
      return `Unknown model: ${model}`;
    }
    
    return `
${model}:
- Input: $${pricing.input}/1M tokens
- Output: $${pricing.output}/1M tokens
    `;
  }
}