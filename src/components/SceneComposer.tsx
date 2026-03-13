import { useState, useRef, useCallback } from 'react';
import {
  composeScene,
  buildFinalPrompt,
  type ComposedScene,
  type ComposerResolution,
} from '../services/sceneComposerService';
import { generateImage } from '../services/imageService';
import type { AppConfig } from '../config';
import { isLlmConfigured, isFalConfigured } from '../config';
import type { GoogleAuthState } from '../services/googleAuth';

// ─── STEPPER ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Character', desc: 'Optional reference' },
  { id: 2, label: 'Describe', desc: 'Your scene idea' },
  { id: 3, label: 'Review', desc: 'Edit & refine' },
  { id: 4, label: 'Output', desc: 'Photo or prompt' },
] as const;

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-md mx-auto mb-10">
      {STEPS.map((step, i) => {
        const isDone = current > step.id;
        const isActive = current === step.id;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.id} className="contents">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isDone
                    ? 'bg-violet-600 text-white'
                    : isActive
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200 scale-110'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                {isDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  step.id
                )}
              </div>
              <div className="text-center">
                <div className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-violet-600' : isDone ? 'text-slate-600' : 'text-slate-400'}`}>
                  {step.label}
                </div>
                <div className="text-[9px] text-slate-400 hidden sm:block">{step.desc}</div>
              </div>
            </div>
            {!isLast && (
              <div className={`flex-1 h-px mx-2 mt-[-18px] transition-colors duration-300 ${isDone ? 'bg-violet-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────

interface SceneComposerProps {
  config: AppConfig;
  googleAuth: GoogleAuthState | null;
  onOpenSettings: () => void;
}

export function SceneComposer({ config, googleAuth, onOpenSettings }: SceneComposerProps) {
  const [step, setStep] = useState(1);

  // Step 1
  const [characterSheet, setCharacterSheet] = useState<string | null>(null);
  const [characterName, setCharacterName] = useState('');
  const [characterAge, setCharacterAge] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [sceneDescription, setSceneDescription] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [composeError, setComposeError] = useState('');

  // Step 3
  const [composedScene, setComposedScene] = useState<ComposedScene | null>(null);
  const [editEnv, setEditEnv] = useState('');
  const [editSubject, setEditSubject] = useState('');

  // Step 4
  const [outputMode, setOutputMode] = useState<'photo' | 'prompt'>('photo');
  const [resolution, setResolution] = useState<ComposerResolution>('2K');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);

  // ─── HANDLERS ─────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCharacterSheet(ev.target?.result as string);
        if (!characterName) setCharacterName(file.name.split('.')[0] || '');
      };
      reader.readAsDataURL(file);
      if (e.target) e.target.value = '';
    },
    [characterName],
  );

  const handleCompose = useCallback(async () => {
    if (!sceneDescription.trim()) return;
    if (!isLlmConfigured(config, googleAuth ? { accessToken: googleAuth.accessToken } : undefined)) {
      setComposeError('LLM not configured. Click the gear icon to add your API key or sign in with Google.');
      return;
    }
    setIsComposing(true);
    setComposeError('');
    try {
      const result = await composeScene(sceneDescription, config, googleAuth);
      setComposedScene(result);
      setEditEnv(result.environmentDna);
      setEditSubject(result.subjectDirection);
      setStep(3);
    } catch (err: any) {
      setComposeError(err.message || 'Failed to compose scene. Try again.');
    } finally {
      setIsComposing(false);
    }
  }, [sceneDescription, config]);

  const handleGenerate = useCallback(async () => {
    if (!composedScene) return;
    const scene: ComposedScene = {
      ...composedScene,
      environmentDna: editEnv,
      subjectDirection: editSubject,
    };
    const prompt = buildFinalPrompt(scene, characterAge || undefined, !!characterSheet);

    if (outputMode === 'prompt') {
      navigator.clipboard.writeText(prompt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }

    if (!isFalConfigured(config)) {
      setGenerateError('fal.ai key not set. Click the gear icon to add it.');
      return;
    }

    setIsGenerating(true);
    setGenerateError('');
    setGeneratedImage(null);
    try {
      const result = await generateImage(prompt, config.falApiKey, {
        characterSheetBase64: characterSheet || undefined,
        aspectRatio,
        resolution,
      });
      setGeneratedImage(result.url);
    } catch (err: any) {
      setGenerateError(err.message || 'Image generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }, [composedScene, editEnv, editSubject, characterAge, characterSheet, outputMode, aspectRatio, resolution, config]);

  const getFinalPrompt = useCallback(() => {
    if (!composedScene) return '';
    const scene: ComposedScene = {
      ...composedScene,
      environmentDna: editEnv,
      subjectDirection: editSubject,
    };
    return buildFinalPrompt(scene, characterAge || undefined, !!characterSheet);
  }, [composedScene, editEnv, editSubject, characterAge, characterSheet]);

  const handleStartOver = () => {
    setStep(1);
    setCharacterSheet(null);
    setCharacterName('');
    setCharacterAge('');
    setSceneDescription('');
    setComposedScene(null);
    setEditEnv('');
    setEditSubject('');
    setGeneratedImage(null);
    setGenerateError('');
    setCopied(false);
  };

  // ─── CONFIG WARNING ────────────────────────────────────────────────

  const showKeyWarning = !isLlmConfigured(config, googleAuth ? { accessToken: googleAuth.accessToken } : undefined);

  // ─── RENDER ────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {showKeyWarning && (
        <button
          onClick={onOpenSettings}
          className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-left hover:bg-amber-100 transition-colors"
        >
          <span className="font-bold">API keys not configured.</span> Click here to open Settings and add your keys to get started.
        </button>
      )}

      <Stepper current={step} />

      {/* ── STEP 1: CHARACTER ─────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Character Reference</h3>
              <p className="text-xs text-slate-400">
                Upload a character sheet or photo. The composer will preserve their identity in the generated scene. This is optional — skip if you just want the prompt.
              </p>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

            {characterSheet ? (
              <div className="flex items-start gap-4">
                <img src={characterSheet} className="w-24 h-32 rounded-xl object-cover border border-slate-200 flex-shrink-0" alt="Character" />
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Name</label>
                    <input
                      type="text"
                      value={characterName}
                      onChange={(e) => setCharacterName(e.target.value)}
                      placeholder="e.g. Emma"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Age</label>
                    <input
                      type="text"
                      value={characterAge}
                      onChange={(e) => setCharacterAge(e.target.value)}
                      placeholder="e.g. Mid 30s"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                    />
                  </div>
                  <button
                    onClick={() => { setCharacterSheet(null); setCharacterName(''); setCharacterAge(''); }}
                    className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-700 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-violet-300 bg-slate-50 hover:bg-violet-50 transition-all flex flex-col items-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 group-hover:border-violet-300 flex items-center justify-center transition-all">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:text-violet-500 transition-colors">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-400 group-hover:text-violet-600 transition-colors">Upload character sheet or photo</span>
                <span className="text-[10px] text-slate-300">PNG, JPG — or skip this step</span>
              </button>
            )}
          </div>

          <div className="flex justify-between items-center">
            <div />
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-full transition-colors">
                Skip
              </button>
              <button onClick={() => setStep(2)} className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-full shadow-sm transition-all">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: DESCRIBE ─────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Describe Your Scene</h3>
              <p className="text-xs text-slate-400">
                Tell us where you want the person and what they're doing. The composer will create a full UGC-realistic scene.
              </p>
            </div>

            <textarea
              value={sceneDescription}
              onChange={(e) => setSceneDescription(e.target.value)}
              placeholder="e.g. Sitting in a cozy café by the window, morning light, talking to camera like a vlog..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all placeholder:text-slate-300"
            />

            <div className="flex flex-wrap gap-1.5">
              {['Café, morning light', 'Gym, mid-workout', 'Bedroom, casual talk', 'Office desk, professional', 'Beach, golden hour', 'Kitchen, cooking'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSceneDescription(s)}
                  className="text-[10px] font-medium text-slate-500 hover:text-violet-600 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 rounded-full px-3 py-1.5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>

            {composeError && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{composeError}</div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-full transition-colors">
              Back
            </button>
            <button
              onClick={handleCompose}
              disabled={!sceneDescription.trim() || isComposing}
              className={`text-xs font-bold text-white px-6 py-2.5 rounded-full shadow-sm transition-all flex items-center gap-2 ${
                !sceneDescription.trim() || isComposing ? 'bg-slate-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'
              }`}
            >
              {isComposing ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                  Composing...
                </>
              ) : (
                'Compose Scene'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: REVIEW ───────────────────────────────────── */}
      {step === 3 && composedScene && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{composedScene.sceneName}</h3>
              <p className="text-[10px] text-slate-400">{composedScene.sceneSubtitle}</p>
            </div>
            <div className="flex gap-1 ml-auto">
              <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{composedScene.tags.style}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest bg-violet-50 text-violet-500 px-2 py-1 rounded-full">{composedScene.tags.mood}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{composedScene.tags.framing}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Environment DNA</span>
              <span className="text-[9px] text-slate-400 ml-auto">Reusable with any character</span>
            </div>
            <textarea
              value={editEnv}
              onChange={(e) => setEditEnv(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed resize-none focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50 transition-all bg-slate-50"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Subject Direction</span>
              <span className="text-[9px] text-slate-400 ml-auto">Pose, expression, framing</span>
            </div>
            <textarea
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed resize-none focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-all bg-slate-50"
            />
          </div>

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(2)} className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-full transition-colors">
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!editEnv.trim() || !editSubject.trim()}
              className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-full shadow-sm transition-all disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: OUTPUT ───────────────────────────────────── */}
      {step === 4 && composedScene && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex gap-1">
            <button
              onClick={() => setOutputMode('photo')}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                outputMode === 'photo'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Generate Photo
            </button>
            <button
              onClick={() => setOutputMode('prompt')}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                outputMode === 'prompt'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Export Prompt
            </button>
          </div>

          {outputMode === 'photo' ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Generate with Nano Banana 2</h3>
                <p className="text-xs text-slate-400">
                  Uses your fal.ai key to generate the image.{' '}
                  {characterSheet ? 'Character sheet will be used as identity reference.' : 'No character sheet — text-to-image mode.'}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Resolution</label>
                <div className="flex gap-2">
                  {(['1K', '2K', '4K'] as ComposerResolution[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        resolution === r
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Aspect Ratio</label>
                <div className="flex gap-1.5 flex-wrap">
                  {['9:16', '1:1', '4:3', '3:4', '16:9'].map((ar) => (
                    <button
                      key={ar}
                      onClick={() => setAspectRatio(ar)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                        aspectRatio === ar
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>

              {generatedImage && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={generatedImage} className="w-full" alt="Generated scene" />
                  <div className="flex items-center gap-2 p-3">
                    <a
                      href={generatedImage}
                      download={`scene-${composedScene.sceneName.toLowerCase().replace(/\s+/g, '-')}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-[10px] font-bold uppercase tracking-widest text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl py-2 transition-all"
                    >
                      Download
                    </a>
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="flex-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl py-2 transition-all"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {generateError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{generateError}</div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Full Composed Prompt</h3>
                <p className="text-xs text-slate-400">
                  Copy this prompt and paste it into any AI image generator — Midjourney, ChatGPT, ComfyUI, Stable Diffusion, or your own pipeline.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-80 overflow-y-auto">
                <pre className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">{getFinalPrompt()}</pre>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(3)} className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-full transition-colors">
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleStartOver}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Start Over
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`text-xs font-bold text-white px-6 py-2.5 rounded-full shadow-sm transition-all flex items-center gap-2 ${
                  isGenerating ? 'bg-slate-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                    Generating...
                  </>
                ) : outputMode === 'photo' ? (
                  generatedImage ? 'Regenerate' : 'Generate Photo'
                ) : copied ? (
                  'Copied!'
                ) : (
                  'Copy Prompt'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
