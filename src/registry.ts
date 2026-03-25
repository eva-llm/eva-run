import { type LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { azure } from '@ai-sdk/azure';
import { deepseek } from '@ai-sdk/deepseek';
import { groq } from '@ai-sdk/groq';
import { perplexity } from '@ai-sdk/perplexity';
import { xai } from '@ai-sdk/xai';

import CONF from './config';


/**
 * Map of provider names to provider functions.
 */
const PROVIDERS: Record<string, Function> = {
  openai,
  anthropic,
  google,
  mistral,
  bedrock,
  azure,
  deepseek,
  groq,
  perplexity,
  xai,
};


/**
 * Get a LanguageModel instance for a given provider and model name, using cache if available.
 * @param {string} providerName - The provider name.
 * @param {string} modelName - The model name.
 * @returns {LanguageModel} The language model instance.
 */
export const getModel = (providerName: string, modelName: string): LanguageModel => {
  const cacheKey = `${providerName}:${modelName}`;

  let model = CONF.isModelCached ? CONF.modelCache.get(cacheKey) : undefined;

  if (!model) {
    const provider = PROVIDERS[providerName];

    if (!provider) {
      throw new Error(`Unknown provider: "${providerName}". Available providers: ${Object.keys(PROVIDERS).join(', ')}`);
    }

    model = provider(modelName);

    if (CONF.isModelCached) {
      CONF.modelCache.set(cacheKey, model);
    }
  }

  return model!;
}
