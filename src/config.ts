// ─── CONFIGURATION ──────────────────────────────────────────────────
// Persistent API key storage using localStorage.
// Supports Gemini (API key + OAuth), Anthropic, OpenAI-compatible, and fal.ai.

export type LlmProvider = 'gemini' | 'anthropic' | 'openai';

export interface AppConfig {
  llmProvider: LlmProvider;
  // Gemini
  geminiApiKey: string;
  geminiModel: string;
  // Anthropic
  anthropicApiKey: string;
  anthropicModel: string;
  // OpenAI-compatible
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  // fal.ai (image generation)
  falApiKey: string;
}

const STORAGE_KEY = 'scene-composer-config';

const DEFAULTS: AppConfig = {
  llmProvider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-6',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-5.4',
  falApiKey: '',
};

const MODEL_MIGRATIONS: Record<string, string> = {
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3-pro': 'gemini-3.1-pro-preview',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) };

    const migrated = MODEL_MIGRATIONS[parsed.geminiModel];
    if (migrated) {
      parsed.geminiModel = migrated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isLlmConfigured(config: AppConfig, googleAuth?: { accessToken: string | null }): boolean {
  if (config.llmProvider === 'gemini') {
    return !!config.geminiApiKey || !!googleAuth?.accessToken;
  }
  if (config.llmProvider === 'anthropic') return !!config.anthropicApiKey;
  return !!config.openaiApiKey;
}

export function isFalConfigured(config: AppConfig): boolean {
  return !!config.falApiKey;
}
