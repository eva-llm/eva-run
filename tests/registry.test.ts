import CONF from '../src/config';
import { getModel } from '../src/registry';

jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn((model: string) => ({ provider: 'openai', modelId: model })),
}));
jest.mock('@ai-sdk/anthropic', () => ({
  anthropic: jest.fn((model: string) => ({ provider: 'anthropic', modelId: model })),
}));
jest.mock('@ai-sdk/google', () => ({
  google: jest.fn((model: string) => ({ provider: 'google', modelId: model })),
}));
jest.mock('@ai-sdk/mistral', () => ({
  mistral: jest.fn((model: string) => ({ provider: 'mistral', modelId: model })),
}));
jest.mock('@ai-sdk/amazon-bedrock', () => ({
  bedrock: jest.fn((model: string) => ({ provider: 'bedrock', modelId: model })),
}));
jest.mock('@ai-sdk/azure', () => ({
  azure: jest.fn((model: string) => ({ provider: 'azure', modelId: model })),
}));
jest.mock('@ai-sdk/deepseek', () => ({
  deepseek: jest.fn((model: string) => ({ provider: 'deepseek', modelId: model })),
}));
jest.mock('@ai-sdk/groq', () => ({
  groq: jest.fn((model: string) => ({ provider: 'groq', modelId: model })),
}));
jest.mock('@ai-sdk/perplexity', () => ({
  perplexity: jest.fn((model: string) => ({ provider: 'perplexity', modelId: model })),
}));
jest.mock('@ai-sdk/xai', () => ({
  xai: jest.fn((model: string) => ({ provider: 'xai', modelId: model })),
}));

describe('Registry module', () => {
  beforeEach(() => {
    CONF.restartModelCache();
  });

  describe('getModel', () => {
    it('should return a model for a valid provider', () => {
      const model = getModel('openai', 'gpt-4o');
      expect(model).toEqual({ provider: 'openai', modelId: 'gpt-4o' });
    });

    it('should throw for an unknown provider', () => {
      expect(() => getModel('nonexistent', 'some-model')).toThrow(
        'Unknown provider: "nonexistent"',
      );
    });

    it('should include available providers in the error message', () => {
      expect(() => getModel('nonexistent', 'some-model')).toThrow(
        /Available providers: openai, anthropic, google, mistral, bedrock, azure, deepseek, groq, perplexity, xai/,
      );
    });

    it('should cache the model after the first call', () => {
      const model1 = getModel('anthropic', 'claude-sonnet-4-20250514');
      const model2 = getModel('anthropic', 'claude-sonnet-4-20250514');
      expect(model1).toBe(model2);
    });

    it('should return different models for different model names', () => {
      const model1 = getModel('openai', 'gpt-4o');
      const model2 = getModel('openai', 'gpt-4o-mini');
      expect(model1).not.toBe(model2);
    });

    it('should return different models for different providers', () => {
      const model1 = getModel('openai', 'some-model');
      const model2 = getModel('anthropic', 'some-model');
      expect(model1).not.toBe(model2);
    });

    it.each([
      'openai',
      'anthropic',
      'google',
      'mistral',
      'bedrock',
      'azure',
      'deepseek',
      'groq',
      'perplexity',
      'xai',
    ])('should support the %s provider', (providerName) => {
      const model = getModel(providerName, 'test-model');
      expect(model).toEqual({ provider: providerName, modelId: 'test-model' });
    });

    it('should use the cache key format provider:model', () => {
      getModel('google', 'gemini-pro');
      expect(CONF.modelCache.get('google:gemini-pro')).toEqual({
        provider: 'google',
        modelId: 'gemini-pro',
      });
    });

    it('should serve from cache on subsequent calls without calling the provider again', () => {
      const { openai } = require('@ai-sdk/openai');
      (openai as jest.Mock).mockClear();

      getModel('openai', 'gpt-4o');
      expect(openai).toHaveBeenCalledTimes(1);

      getModel('openai', 'gpt-4o');
      expect(openai).toHaveBeenCalledTimes(1);
    });
  });
});
