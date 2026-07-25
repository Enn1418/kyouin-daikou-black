import { DEFAULT_MODELS } from './constants';

export interface ModelPricing {
  inputPer1M?: number;
  outputPer1M?: number;
  perImage?: number;
  perSong?: number;
  perSecond?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Text Models (Claude)
  [DEFAULT_MODELS.text]: { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-opus-5': { inputPer1M: 5.00, outputPer1M: 25.00 },
  'claude-haiku-4-5': { inputPer1M: 1.00, outputPer1M: 5.00 },

  // Image Models (Gemini)
  [DEFAULT_MODELS.image]: { perImage: 0.067 },
  'gemini-3-pro-image-preview': { perImage: 0.134 },
  'gemini-2.5-flash-image': { perImage: 0.039 },

  // Music Models (Gemini)
  [DEFAULT_MODELS.music]: { perSong: 0.040 },
  'lyria-3-pro-preview': { perSong: 0.080 },

  // Video Models (Gemini)
  [DEFAULT_MODELS.video]: { perSecond: 0.050 },
  'veo-3.1-fast-generate-preview': { perSecond: 0.150 },
  'veo-3.1-generate-preview': { perSecond: 0.400 },
};

export const DEFAULT_PRICING: ModelPricing = MODEL_PRICING[DEFAULT_MODELS.text];

export function calculateCost(promptTokens: number, completionTokens: number, modelName: string, durationOrCount?: number): number {
  const lowerName = modelName.toLowerCase();
  const pricingKey = Object.keys(MODEL_PRICING).find(key => lowerName.includes(key));
  const pricing = pricingKey ? MODEL_PRICING[pricingKey] : DEFAULT_PRICING;

  // 1. Per Image
  if (pricing.perImage !== undefined) {
    return (durationOrCount || 1) * pricing.perImage;
  }

  // 2. Per Song
  if (pricing.perSong !== undefined) {
    return (durationOrCount || 1) * pricing.perSong;
  }

  // 3. Per Second (Video)
  if (pricing.perSecond !== undefined) {
    return (durationOrCount || 4) * pricing.perSecond; // Default 4s if not specified
  }

  // 4. Token based (Text)
  const inputCost = (promptTokens / 1000000) * (pricing.inputPer1M || 0);
  const outputCost = (completionTokens / 1000000) * (pricing.outputPer1M || 0);

  return inputCost + outputCost;
}

export function calculateTokensForCost(modelName: string, durationOrCount?: number): number {
  const lowerName = modelName.toLowerCase();
  const pricingKey = Object.keys(MODEL_PRICING).find(key => lowerName.includes(key));
  const pricing = pricingKey ? MODEL_PRICING[pricingKey] : DEFAULT_PRICING;

  const cost = calculateCost(0, 0, modelName, durationOrCount);
  const baseOutputPrice = MODEL_PRICING[DEFAULT_MODELS.text]?.outputPer1M || 15.0;

  return Math.floor((cost / baseOutputPrice) * 1000000);
}
