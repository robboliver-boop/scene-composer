// ─── IMAGE GENERATION SERVICE ───────────────────────────────────────
// Uses fal.ai Nano Banana 2 (Gemini 3.1 Flash Image) for generation.
// Supports text-to-image and image-edit (with character sheet).

import type { ComposerResolution } from './sceneComposerService';

export interface ImageResult {
  url: string;
  resolution: ComposerResolution;
  width?: number;
  height?: number;
}

export async function generateImage(
  prompt: string,
  falApiKey: string,
  options: {
    characterSheetBase64?: string;
    aspectRatio?: string;
    resolution?: ComposerResolution;
  } = {},
): Promise<ImageResult> {
  if (!falApiKey) throw new Error('fal.ai API key not set. Open Settings to add it.');

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falApiKey });

  const { characterSheetBase64, aspectRatio = '9:16', resolution = '2K' } = options;
  const isEdit = !!characterSheetBase64;
  const endpoint = isEdit ? 'fal-ai/nano-banana-2/edit' : 'fal-ai/nano-banana-2';

  const input: Record<string, unknown> = {
    prompt,
    num_images: 1,
    aspect_ratio: aspectRatio,
    resolution,
    output_format: 'png',
  };

  if (isEdit && characterSheetBase64) {
    const uploadResult = await fal.storage.upload(
      await (await fetch(characterSheetBase64)).blob(),
    );
    input.image_urls = [uploadResult];
  }

  const result = await fal.subscribe(endpoint, {
    input: input as any,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        update.logs?.map((l) => l.message).forEach(console.log);
      }
    },
  });

  const data = result.data as {
    images: Array<{ url: string; width?: number; height?: number }>;
  };
  const img = data.images?.[0];
  if (!img?.url) throw new Error('No image returned from Nano Banana 2.');

  return { url: img.url, resolution, width: img.width, height: img.height };
}
