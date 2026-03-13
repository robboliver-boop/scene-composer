import { useState } from 'react';
import { loadConfig, type AppConfig } from './config';
import { Settings } from './components/Settings';
import { SceneComposer } from './components/SceneComposer';
import type { GoogleAuthState } from './services/googleAuth';

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthState | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── TOP BAR ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-200/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-900">Scene Composer</h1>
              <p className="text-[10px] text-slate-400 tracking-wide">UGC-realistic scene builder</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Google connected badge */}
            {googleAuth?.accessToken && config.llmProvider === 'gemini' && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full hidden sm:inline-block">
                Google Connected
              </span>
            )}

            {/* Provider badge */}
            <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full hidden sm:inline-block">
              {config.llmProvider === 'gemini'
                ? config.geminiModel || 'Gemini'
                : config.llmProvider === 'anthropic'
                ? config.anthropicModel || 'Claude'
                : config.openaiModel || 'OpenAI'}
            </span>

            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-5 py-8">
        <SceneComposer
          config={config}
          googleAuth={googleAuth}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </main>

      {/* ─── SETTINGS MODAL ─────────────────────────────────── */}
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={setConfig}
        googleAuth={googleAuth}
        onGoogleAuth={setGoogleAuth}
      />
    </div>
  );
}
