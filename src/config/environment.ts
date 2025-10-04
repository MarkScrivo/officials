import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type AIProvider = 'gemini' | 'openai' | 'anthropic';
export type GeminiModel = 'gemini-2.5-flash-lite' | 'gemini-2.5-flash';
export type OpenAIModel = 'gpt-5-nano' | 'gpt-5-mini-2025-08-07' | 'gpt-5';
export type AnthropicModel = 'claude-3-5-sonnet-20241022' | 'claude-3-5-haiku-20241022' | 'claude-3-opus-20240229';
export type AIModel = GeminiModel | OpenAIModel | AnthropicModel;

export const config = {
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini') as AIProvider,
    model: (process.env.AI_MODEL || 'gemini-2.5-flash-lite') as AIModel,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.AI_MODEL as GeminiModel || 'gemini-2.5-flash-lite'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL as OpenAIModel || 'gpt-5-mini-2025-08-07'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL as AnthropicModel || 'claude-3-5-sonnet-20241022'
  },
  playwright: {
    headless: process.env.HEADLESS !== 'false',
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

export function validateConfig(): void {
  // Validate provider selection
  if (!['gemini', 'openai', 'anthropic'].includes(config.ai.provider)) {
    throw new Error(
      `Invalid AI_PROVIDER: ${config.ai.provider}. Must be 'gemini', 'openai', or 'anthropic'`
    );
  }

  // Validate API keys based on provider
  if (config.ai.provider === 'gemini') {
    if (!config.gemini.apiKey) {
      throw new Error(
        'GEMINI_API_KEY is required when using Gemini provider. Please set it in your .env file.\n' +
        'Get your API key from: https://aistudio.google.com/apikey'
      );
    }
    
    // No model validation - allow any Gemini model name
    if (!config.ai.model) {
      throw new Error('AI_MODEL is required. Please specify a Gemini model name in your .env file.');
    }
  } else if (config.ai.provider === 'openai') {
    if (!config.openai.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is required when using OpenAI provider. Please set it in your .env file.\n' +
        'Get your API key from: https://platform.openai.com/api-keys'
      );
    }
    
    // No model validation - allow any OpenAI model name
    if (!config.ai.model) {
      throw new Error('AI_MODEL is required. Please specify an OpenAI model name in your .env file.');
    }
  } else if (config.ai.provider === 'anthropic') {
    if (!config.anthropic.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required when using Anthropic provider. Please set it in your .env file.\n' +
        'Get your API key from: https://console.anthropic.com/'
      );
    }
    
    // No model validation - allow any Anthropic model name
    if (!config.ai.model) {
      throw new Error('AI_MODEL is required. Please specify an Anthropic model name in your .env file.');
    }
  }

  console.log(`✅ Using ${config.ai.provider.toUpperCase()} provider with model: ${config.ai.model}`);
}