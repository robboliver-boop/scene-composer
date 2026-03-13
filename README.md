# Scene Composer

Standalone UGC-realistic scene builder. Describe any scene in natural language — get a detailed, physics-grounded prompt or generate a photo directly.

## What it does

1. **Compose** — You describe a scene ("café, morning light, talking to camera"). An LLM decomposes it into two reusable blocks:
   - **Environment DNA** — physical space, camera, lighting physics, image texture
   - **Subject Direction** — pose, expression, framing, body language
2. **Generate** — Either:
   - **Export Prompt** — Copy the full prompt into any AI image tool (Midjourney, ChatGPT, ComfyUI, etc.)
   - **Generate Photo** — Send it to Nano Banana 2 (Gemini 3.1 Flash Image) via fal.ai

Optionally upload a **character sheet** to preserve identity across scenes.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5174`, click the gear icon, and add your API keys.

## API Keys

| Key | What it does | Where to get it |
|-----|-------------|-----------------|
| **Gemini API Key** | Scene composition (default LLM) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Anthropic API Key** | Scene composition (Claude) | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **fal.ai API Key** | Image generation (Nano Banana 2) | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |

### Supported LLM providers

The app supports **three native providers** for scene composition. Switch between them in Settings.

#### Google Gemini (default)

| Model | ID | Notes |
|-------|----|-------|
| Gemini 3 Flash | `gemini-3-flash-preview` | **Default** — frontier-class, fast |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Most advanced, agentic |
| Gemini 3.1 Flash Image | `gemini-3.1-flash-image-preview` | Budget-friendly |

#### Anthropic Claude

| Model | ID | Notes |
|-------|----|-------|
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | **Default** — best speed + intelligence balance |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Fastest, cheapest ($1/$5 per MTok) |
| Claude Opus 4.6 | `claude-opus-4-6` | Most intelligent |

#### OpenAI / Compatible

Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint:

| Provider | Base URL | Example model |
|----------|----------|---------------|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-5.4` (default) · `gpt-5-mini` |
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` · `openai/gpt-oss-120b` |
| **Together AI** | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| **Ollama (local)** | `http://localhost:11434/v1` | `llama3.3` · `qwen3-next` · `gpt-oss` |
| **LM Studio (local)** | `http://localhost:1234/v1` | whatever model is loaded |

### Running fully local (no cloud keys)

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull llama3.3`
2. In Settings → OpenAI / Compatible:
   - Base URL: `http://localhost:11434/v1`
   - API Key: `ollama`
   - Model: `llama3.3`
3. Use **Export Prompt** mode (no fal.ai key needed)

## Project structure

```
src/
  config.ts                  — API key storage (localStorage)
  services/
    llmProvider.ts           — LLM abstraction (Gemini + Anthropic + OpenAI-compatible)
    sceneComposerService.ts  — Scene composition, prompt building, few-shot examples
    imageService.ts          — fal.ai Nano Banana 2 image generation
  components/
    Settings.tsx             — API key configuration modal (3 providers)
    SceneComposer.tsx        — 4-step wizard UI
  App.tsx                    — Entry point with header + settings
  main.tsx                   — React mount
  index.css                  — Styles (no Tailwind dependency)
```

## Tech stack

- **React 19** + **TypeScript** + **Vite**
- **@google/genai** — Gemini SDK (scene composition)
- **@fal-ai/client** — fal.ai SDK (image generation)
- Zero CSS framework dependency — all styles are vanilla CSS

## How the UGC realism works

Every composed scene enforces smartphone photography physics:
- Deep depth of field, zero bokeh, zero portrait mode
- Smartphone sensor noise, computational focus
- Mixed/uncontrolled lighting with auto-exposure artifacts
- Visible skin texture, hair strand detail, fabric weave
- Lived-in environments with mundane everyday detail

The prompt engineering is baked into the few-shot examples and quality footer — the LLM learns the vocabulary and level of detail from 3 diverse reference scenes.

## License

MIT
