import { useState, useEffect } from 'react';
import { loadConfig, saveConfig, type AppConfig, type LlmProvider } from '../config';
import {
  requestGoogleToken,
  revokeGoogleToken,
  isTokenValid,
  isGisLoaded,
  type GoogleAuthState,
} from '../services/googleAuth';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: AppConfig) => void;
  googleAuth: GoogleAuthState | null;
  onGoogleAuth: (auth: GoogleAuthState | null) => void;
}

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI / Compatible',
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

type ValidationStatus = 'idle' | 'testing' | 'ok' | 'error';
interface ValidationResult {
  llm: { status: ValidationStatus; message: string };
  fal: { status: ValidationStatus; message: string };
}

const INITIAL_VALIDATION: ValidationResult = {
  llm: { status: 'idle', message: '' },
  fal: { status: 'idle', message: '' },
};

async function testGeminiKey(apiKey: string, model: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const resp = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: 'Say "ok"' }] }],
  });
  const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty response');
  return `${model} responded`;
}

async function testGeminiOAuth(accessToken: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Say "ok"' }] }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body.slice(0, 120)}`);
  }
  return `${model} responded (OAuth)`;
}

async function testAnthropicKey(apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Say "ok"' }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body.slice(0, 120)}`);
  }
  return `${model} responded`;
}

async function testOpenAIKey(apiKey: string, baseUrl: string, model: string): Promise<string> {
  const url = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Say "ok"' }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body.slice(0, 120)}`);
  }
  return `${model} responded`;
}

async function testFalKey(apiKey: string): Promise<string> {
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: apiKey });
  try {
    await fal.queue.status('fal-ai/fast-sdxl', {
      requestId: '00000000-0000-0000-0000-000000000000',
    });
  } catch (err: any) {
    const msg = err?.message || err?.body?.detail || String(err);
    if (/unauthorized|forbidden|invalid.*key|401|403/i.test(msg)) {
      throw new Error('Invalid fal.ai key');
    }
    // "not found" or similar means the key is valid but the request ID doesn't exist — that's fine
  }
  return 'Key valid';
}

export function Settings({ open, onClose, onSave, googleAuth, onGoogleAuth }: SettingsProps) {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [googleError, setGoogleError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(INITIAL_VALIDATION);

  useEffect(() => {
    if (open) {
      setConfig(loadConfig());
      setValidation(INITIAL_VALIDATION);
    }
  }, [open]);

  const update = (patch: Partial<AppConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }));

  const handleSave = () => {
    saveConfig(config);
    onSave(config);
    onClose();
  };

  const handleValidateAll = async () => {
    const next: ValidationResult = {
      llm: { status: 'idle', message: '' },
      fal: { status: 'idle', message: '' },
    };

    // --- LLM ---
    const hasLlmKey =
      (config.llmProvider === 'gemini' && (config.geminiApiKey || (googleAuth && isTokenValid(googleAuth)))) ||
      (config.llmProvider === 'anthropic' && config.anthropicApiKey) ||
      (config.llmProvider === 'openai' && config.openaiApiKey);

    if (hasLlmKey) {
      next.llm = { status: 'testing', message: `Testing ${PROVIDER_LABELS[config.llmProvider]}...` };
    } else {
      next.llm = { status: 'error', message: 'No LLM key configured' };
    }

    // --- fal.ai ---
    if (config.falApiKey) {
      next.fal = { status: 'testing', message: 'Testing fal.ai...' };
    } else {
      next.fal = { status: 'idle', message: 'No fal.ai key (optional for Export Prompt mode)' };
    }

    setValidation({ ...next });

    const results = await Promise.allSettled([
      hasLlmKey
        ? (async () => {
            if (config.llmProvider === 'gemini') {
              const model = config.geminiModel || 'gemini-3-flash-preview';
              if (googleAuth && isTokenValid(googleAuth)) {
                return testGeminiOAuth(googleAuth.accessToken!, model);
              }
              return testGeminiKey(config.geminiApiKey, model);
            }
            if (config.llmProvider === 'anthropic') {
              return testAnthropicKey(config.anthropicApiKey, config.anthropicModel || 'claude-sonnet-4-6');
            }
            return testOpenAIKey(config.openaiApiKey, config.openaiBaseUrl, config.openaiModel || 'gpt-5.4');
          })()
        : Promise.reject(new Error('No key')),
      config.falApiKey ? testFalKey(config.falApiKey) : Promise.reject(new Error('No key')),
    ]);

    const [llmResult, falResult] = results;

    setValidation({
      llm: hasLlmKey
        ? llmResult.status === 'fulfilled'
          ? { status: 'ok', message: llmResult.value }
          : { status: 'error', message: (llmResult as PromiseRejectedResult).reason?.message || 'Failed' }
        : next.llm,
      fal: config.falApiKey
        ? falResult.status === 'fulfilled'
          ? { status: 'ok', message: falResult.value }
          : { status: 'error', message: (falResult as PromiseRejectedResult).reason?.message || 'Failed' }
        : next.fal,
    });
  };

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setGoogleError('Google sign-in is not configured for this deployment.');
      return;
    }
    setGoogleError('');
    setGoogleLoading(true);
    try {
      const auth = await requestGoogleToken(GOOGLE_CLIENT_ID);
      onGoogleAuth(auth);
    } catch (err: any) {
      setGoogleError(err.message || 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignOut = () => {
    if (googleAuth?.accessToken) {
      revokeGoogleToken(googleAuth.accessToken);
    }
    onGoogleAuth(null);
  };

  if (!open) return null;

  const isGoogleConnected = googleAuth && isTokenValid(googleAuth);
  const hasGoogleOAuth = !!GOOGLE_CLIENT_ID;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-4">
          <h2 className="text-base font-extrabold tracking-tight text-slate-900">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-7 pb-7 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* LLM Provider */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              LLM Provider — Scene Composition
            </h3>

            <div className="flex gap-1.5">
              {(['gemini', 'anthropic', 'openai'] as LlmProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => update({ llmProvider: p })}
                  className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold border transition-all ${
                    config.llmProvider === p
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>

            {/* ── Gemini fields ────────────────────────────────── */}
            {config.llmProvider === 'gemini' && (
              <div className="space-y-3">
                {/* Google OAuth — only shown when Client ID is configured via env */}
                {hasGoogleOAuth && (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span className="text-xs font-bold text-slate-700">Google Account</span>
                        {isGoogleConnected && (
                          <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full ml-auto">Connected</span>
                        )}
                      </div>

                      {isGoogleConnected ? (
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-emerald-600 flex-1">
                            Authenticated via Google — no API key needed.
                          </p>
                          <button
                            onClick={handleGoogleSignOut}
                            className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={handleGoogleSignIn}
                            disabled={googleLoading || !isGisLoaded()}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                              googleLoading || !isGisLoaded()
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                            }`}
                          >
                            {googleLoading ? (
                              <>
                                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                                Signing in...
                              </>
                            ) : !isGisLoaded() ? (
                              'Loading Google...'
                            ) : (
                              'Sign in with Google'
                            )}
                          </button>
                          {googleError && (
                            <p className="text-[10px] text-rose-600">{googleError}</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Divider — only if OAuth is available */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">or use API key</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={config.geminiApiKey}
                    onChange={(e) => update({ geminiApiKey: e.target.value })}
                    placeholder="AIza..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Get yours at{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-700 underline">
                      aistudio.google.com/apikey
                    </a>
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    value={config.geminiModel}
                    onChange={(e) => update({ geminiModel: e.target.value })}
                    placeholder="gemini-3-flash-preview"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    gemini-3-flash-preview · gemini-3.1-pro-preview · gemini-3.1-flash-image-preview
                  </p>
                </div>
              </div>
            )}

            {/* ── Anthropic fields ─────────────────────────────── */}
            {config.llmProvider === 'anthropic' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Anthropic API Key
                  </label>
                  <input
                    type="password"
                    value={config.anthropicApiKey}
                    onChange={(e) => update({ anthropicApiKey: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Get yours at{' '}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-700 underline">
                      console.anthropic.com
                    </a>
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    value={config.anthropicModel}
                    onChange={(e) => update({ anthropicModel: e.target.value })}
                    placeholder="claude-sonnet-4-6"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    claude-sonnet-4-6 · claude-haiku-4-5 · claude-opus-4-6
                  </p>
                </div>
              </div>
            )}

            {/* ── OpenAI-compatible fields ──────────────────────── */}
            {config.llmProvider === 'openai' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={config.openaiApiKey}
                    onChange={(e) => update({ openaiApiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={config.openaiBaseUrl}
                    onChange={(e) => update({ openaiBaseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    OpenAI · Groq (api.groq.com/openai/v1) · Ollama (localhost:11434/v1) · LM Studio · Together AI
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    value={config.openaiModel}
                    onChange={(e) => update({ openaiModel: e.target.value })}
                    placeholder="gpt-5.4"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    gpt-5.4 · gpt-5-mini · llama-3.3-70b-versatile · gpt-oss-120b · qwen3-next
                  </p>
                </div>
              </div>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* fal.ai */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              fal.ai — Image Generation
            </h3>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                fal.ai API Key
              </label>
              <input
                type="password"
                value={config.falApiKey}
                onChange={(e) => update({ falApiKey: e.target.value })}
                placeholder="fal_..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Required for "Generate Photo" mode. Get yours at{' '}
                <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-700 underline">
                  fal.ai/dashboard/keys
                </a>
              </p>
            </div>
          </section>
          {/* ── Validate Keys ───────────────────────────── */}
          <section className="space-y-3">
            <button
              onClick={handleValidateAll}
              disabled={validation.llm.status === 'testing' || validation.fal.status === 'testing'}
              className={`w-full py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                validation.llm.status === 'testing' || validation.fal.status === 'testing'
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
              }`}
            >
              {validation.llm.status === 'testing' || validation.fal.status === 'testing' ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                  Validating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                  Validate All Keys
                </>
              )}
            </button>

            {(validation.llm.status !== 'idle' || validation.fal.status !== 'idle') && (
              <div className="space-y-1.5">
                <ValidationRow label={`LLM (${PROVIDER_LABELS[config.llmProvider]})`} status={validation.llm.status} message={validation.llm.message} />
                <ValidationRow label="fal.ai" status={validation.fal.status} message={validation.fal.message} />
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 px-5 py-2.5 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-full shadow-sm transition-all"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function ValidationRow({ label, status, message }: { label: string; status: ValidationStatus; message: string }) {
  const icon =
    status === 'testing' ? (
      <svg className="animate-spin w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
    ) : status === 'ok' ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
    ) : status === 'error' ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></svg>
    );

  const textColor =
    status === 'ok' ? 'text-emerald-600' : status === 'error' ? 'text-rose-600' : 'text-slate-500';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
      {icon}
      <span className="text-[10px] font-bold text-slate-500 w-28 shrink-0">{label}</span>
      <span className={`text-[10px] ${textColor} truncate`}>{message}</span>
    </div>
  );
}
