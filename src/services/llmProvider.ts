// ─── LLM PROVIDER ABSTRACTION ───────────────────────────────────────
// Supports Gemini (API key or OAuth), Anthropic (Claude), and any OpenAI-compatible endpoint.

import type { AppConfig } from '../config';
import { callGeminiWithOAuth, type GoogleAuthState, isTokenValid } from './googleAuth';

export async function callLlm(
  prompt: string,
  config: AppConfig,
  googleAuth?: GoogleAuthState | null,
): Promise<string> {
  if (config.llmProvider === 'gemini') return callGemini(prompt, config, googleAuth);
  if (config.llmProvider === 'anthropic') return callAnthropic(prompt, config);
  return callOpenAICompatible(prompt, config);
}

// ─── GEMINI ─────────────────────────────────────────────────────────
// Prefers OAuth token if available, falls back to API key.

async function callGemini(
  prompt: string,
  config: AppConfig,
  googleAuth?: GoogleAuthState | null,
): Promise<string> {
  const model = config.geminiModel || 'gemini-3-flash-preview';

  if (googleAuth && isTokenValid(googleAuth)) {
    return callGeminiWithOAuth(prompt, googleAuth.accessToken!, model);
  }

  if (!config.geminiApiKey) {
    throw new Error('Gemini not configured. Sign in with Google or add an API key in Settings.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const resp = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
  });

  const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text.trim()) throw new Error('Empty response from Gemini. Try again.');
  return text;
}

// ─── ANTHROPIC (Claude) ─────────────────────────────────────────────

async function callAnthropic(prompt: string, config: AppConfig): Promise<string> {
  if (!config.anthropicApiKey) throw new Error('Anthropic API key not set. Open Settings to add it.');

  const model = config.anthropicModel || 'claude-sonnet-4-6';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  if (!text.trim()) throw new Error('Empty response from Claude. Try again.');
  return text;
}

// ─── OPENAI-COMPATIBLE ──────────────────────────────────────────────

async function callOpenAICompatible(prompt: string, config: AppConfig): Promise<string> {
  if (!config.openaiApiKey) throw new Error('API key not set. Open Settings to add it.');

  const baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config.openaiModel || 'gpt-5.4';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('Empty response from LLM. Try again.');
  return text;
}
