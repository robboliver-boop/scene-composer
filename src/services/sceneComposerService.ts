// ─── SCENE COMPOSER SERVICE ─────────────────────────────────────────
// Composes UGC-realistic scene descriptions from natural language.
// LLM-agnostic: uses the pluggable llmProvider.
// Output: environmentDna + subjectDirection — model-agnostic text prompts.

import { callLlm } from './llmProvider';
import type { AppConfig } from '../config';
import type { GoogleAuthState } from './googleAuth';

// ─── TYPES ──────────────────────────────────────────────────────────

export interface ComposedScene {
  environmentDna: string;
  subjectDirection: string;
  sceneName: string;
  sceneSubtitle: string;
  tags: {
    style: string;
    mood: string;
    framing: string;
  };
  aspectRatio: string;
}

export type ComposerResolution = '1K' | '2K' | '4K';

export interface ComposerImageResult {
  url: string;
  resolution: ComposerResolution;
}

// ─── FEW-SHOT EXAMPLES ─────────────────────────────────────────────

const FEW_SHOT_EXAMPLES = [
  {
    userRequest: 'living room, seated on a sofa, talking to camera',
    environmentDna: `Lived-in sofa with natural fabric texture and slight cushion compression. Low camera angle, looking slightly upward at seat level. Behind, a real living room: a side table with a lamp, a bookshelf or floating shelf with a few books and a small plant, a window with curtains partially open letting in ambient daylight, a throw blanket draped over the sofa arm. The room is lived-in and authentic — not styled, not minimalist, not cluttered. Everyday domestic detail. All background elements completely sharp — lamp, shelf items, window curtain, throw blanket, wall texture. Zero optical bokeh. Zero portrait mode. Zero depth separation between subject and background. Captured on a propped smartphone rear camera (24mm equivalent). Stable framing. Deep depth of field — infinite focus from foreground to background. Lighting: Mixed indoor — natural daylight from the window to one side combined with warm overhead room light. The two sources create a mild warm-cool colour temperature clash across the face — the window side slightly cooler, the room-lit side slightly warmer. The lamp on the side table adds a localized warm pool of light in the mid-ground. Auto-exposure handles the mixed sources with slightly compressed dynamic range — the window is mildly blown out, the room interior is evenly exposed. Image texture: Smartphone sensor noise visible in shadow areas — under the chin, in the darker corners of the room, in the sofa fabric folds. Computational focus. Visible natural skin texture — pores, fine lines, natural subsurface scattering. Hair strand detail visible. Clothing fabric texture and wrinkles rendered naturally. Sofa upholstery weave, lamp shade, book spines, plant leaves all sharp. Zero retouching. Zero skin smoothing. Zero beauty filter.`,
    subjectDirection: `Seated on the sofa, leaning slightly forward with a natural mid-conversation expression — relaxed, engaged, speaking directly to the camera with easy eye contact. Hands resting loosely in their lap or on their knees — nothing held. Medium shot — head and upper torso visible.`,
  },
  {
    userRequest: 'garden, standing outside, relaxed',
    environmentDna: `A real garden: green foliage and plants at varying depths, a wooden fence or low hedge partially visible, dappled sunlight filtering through tree leaves above, a patch of grass or garden path. The garden is natural and domestic — not a park, not landscaped, just an ordinary back garden with real plants and real wear. All background elements completely sharp — individual leaves, fence wood grain, grass blades, the sky visible through tree canopy. Zero optical bokeh. Zero portrait mode. Zero depth separation. Captured on a propped smartphone rear camera (24mm equivalent). Stable framing. Deep depth of field — infinite focus from foreground to background. Lighting: Natural daylight — directional sunlight filtered through tree canopy creating dappled patches of light and shadow. One side of the face is well-lit, the other receives softer ambient fill from the sky and surrounding greenery. The foliage behind reflects green-tinted ambient fill. Auto-exposure struggles mildly with the high dynamic range — patches of sky visible through the canopy are blown out to near-white, while the subject's face is correctly exposed. Image texture: Smartphone sensor noise in the dappled shadow areas. Computational focus. Visible natural skin texture — pores, fine lines, natural subsurface scattering in the sunlit patches. Hair catches individual strands of sunlight. Clothing fabric texture visible. Leaves, fence, grass all rendered with full sharp detail. Zero retouching. Zero skin smoothing. Zero beauty filter.`,
    subjectDirection: `Standing in the garden, body slightly angled toward the camera, speaking with a relaxed and natural expression — easy eye contact, mid-sentence, the comfortable energy of someone talking outside on a nice day. Arms relaxed at their sides or one hand resting lightly on a hip — nothing held. Medium shot — head and upper torso. Eye-level camera angle.`,
  },
  {
    userRequest: 'car, sitting in the driver\'s seat, animated',
    environmentDna: `Inside a parked car. Car interior is clearly visible — dashboard, steering wheel, seatbelt, windows. Slightly low angle as if the phone is mounted on the dashboard. Behind, scenery visible through windows. All interior and exterior detail completely sharp — dashboard texture, seatbelt fabric, window reflections. Zero optical bokeh. Zero portrait mode. Zero depth separation. Captured on a dashboard-mounted smartphone (24mm equivalent). Deep depth of field — infinite focus. Lighting: Uncontrolled natural daylight coming through the windshield. Harsh, flat light hitting the face, with the background windows entirely overexposed (blown out to pure white) due to the phone's auto-exposure struggling with the bright exterior. Interior surfaces have a warm ambient bounce. Image texture: Micro-grain visible in the darker areas of the car interior. Computational focus. Visible natural skin texture — pores, fine lines. Steering wheel texture, dashboard plastic, fabric seat weave all sharp. Zero retouching. Zero skin smoothing. Zero beauty filter.`,
    subjectDirection: `Sitting in the driver's seat of the parked car. Wide-eyed, animated expression as if excitedly mid-speech, looking directly into the camera lens. Medium close-up framing — head and shoulders visible, seatbelt crossing the torso naturally.`,
  },
];

// ─── COMPOSITION PROMPT ─────────────────────────────────────────────

function buildCompositionPrompt(userDescription: string): string {
  const examples = FEW_SHOT_EXAMPLES.map(
    (ex, i) => `
EXAMPLE ${i + 1}:
User: "${ex.userRequest}"

ENVIRONMENT DNA:
${ex.environmentDna}

SUBJECT DIRECTION:
${ex.subjectDirection}
`,
  ).join('\n---\n');

  return `You are a Scene Composer for UGC-realistic smartphone photography. Your job is to take a user's natural language description and compose two separate text blocks:

1. ENVIRONMENT DNA — describes ONLY the physical environment, camera setup, lighting physics, and image texture. NO mention of the person/subject in this block. This block is reusable with any character.

2. SUBJECT DIRECTION — describes ONLY how the person is posed, their expression, body language, framing, and camera angle relative to them. Generic enough to work for any person. NEVER describe specific appearance (hair color, skin tone, clothing style) — that comes from the character sheet.

RULES:
- Write in the same style, vocabulary, and level of detail as the examples below
- Every scene MUST enforce UGC smartphone realism:
  • Deep depth of field — infinite focus, zero bokeh, zero portrait mode
  • Propped smartphone rear camera (24mm equivalent), stable framing
  • Mixed/uncontrolled lighting with realistic auto-exposure artifacts (blown-out windows, color temperature clashes)
  • Smartphone sensor noise in shadow areas
  • Visible natural skin texture — pores, fine lines, zero retouching, zero beauty filter
  • Computational focus — sharp but without DSLR optical depth
- The environment must feel REAL and LIVED-IN — everyday domestic detail, not styled or minimalist
- Background objects must be described with specific mundane detail (a mug, a paper towel roll, a few books, etc.)
- NEVER use generic phrases like "nice lighting" or "beautiful scene" — describe the specific physics
- Keep "The subject" as the generic placeholder — never name them or describe their appearance
- The SUBJECT DIRECTION block must always include: pose, expression, eye contact (always direct to camera), hand position, framing (close-up / medium shot / etc.), and camera angle

${examples}

---

Now compose a scene for this request:

User: "${userDescription}"

Respond in EXACTLY this format (no other text):

SCENE_NAME: [short name, 2-4 words]
SCENE_SUBTITLE: [location — action, e.g. "Kitchen — Morning Coffee"]
STYLE_TAG: [one of: indoor, outdoor, car, bedroom, office, living-room, kitchen, bathroom, garden, studio, park, street, bar, café, gym, store]
MOOD_TAG: [one of: relaxed, animated, serious, conversational, emotional, energetic]
FRAMING_TAG: [one of: selfie, close-up, medium-shot, full-body, seated]

ENVIRONMENT DNA:
[your composed environment description here]

SUBJECT DIRECTION:
[your composed subject direction here]`;
}

// ─── PARSER ─────────────────────────────────────────────────────────

function parseComposerResponse(raw: string): ComposedScene {
  const getField = (label: string): string => {
    const regex = new RegExp(`${label}:\\s*(.+)`, 'i');
    const match = raw.match(regex);
    return match?.[1]?.trim() || '';
  };

  const getBlock = (label: string): string => {
    const regex = new RegExp(
      `${label}:\\s*\\n([\\s\\S]*?)(?=\\n(?:SCENE_NAME|SCENE_SUBTITLE|STYLE_TAG|MOOD_TAG|FRAMING_TAG|ENVIRONMENT DNA|SUBJECT DIRECTION):|$)`,
      'i',
    );
    const match = raw.match(regex);
    return match?.[1]?.trim() || '';
  };

  return {
    sceneName: getField('SCENE_NAME') || 'Custom Scene',
    sceneSubtitle: getField('SCENE_SUBTITLE') || 'Composed Scene',
    tags: {
      style: getField('STYLE_TAG') || 'indoor',
      mood: getField('MOOD_TAG') || 'conversational',
      framing: getField('FRAMING_TAG') || 'medium-shot',
    },
    environmentDna: getBlock('ENVIRONMENT DNA') || '',
    subjectDirection: getBlock('SUBJECT DIRECTION') || '',
    aspectRatio: '9:16',
  };
}

// ─── COMPOSE ────────────────────────────────────────────────────────

export async function composeScene(
  userDescription: string,
  config: AppConfig,
  googleAuth?: GoogleAuthState | null,
): Promise<ComposedScene> {
  const prompt = buildCompositionPrompt(userDescription);
  const raw = await callLlm(prompt, config, googleAuth);
  return parseComposerResponse(raw);
}

// ─── BUILD FINAL PROMPT ─────────────────────────────────────────────

const QUALITY_FOOTER = `
GAZE DIRECTION (CRITICAL — NON-NEGOTIABLE): The subject is looking DIRECTLY into the camera lens with confident, full eye contact. Not at a phone screen. Not to the side. Not away. Straight into the lens.

CRITICAL REALISM REQUIREMENTS — UGC SMARTPHONE PHYSICS:
- Deep depth of field — infinite focus. Background must be completely sharp and in focus. ZERO bokeh, ZERO portrait mode blur.
- Tiny smartphone sensor physics: flat, unflattering, mixed everyday ambient lighting.
- Skin must show natural pores, texture variance, blemishes, and micro-imperfections. Zero smoothing, zero beauty filtering, zero retouching.
- Avoid perfect symmetry in face and environment.
- Hair must have individual strand variation, natural texture, and flyaways.
- Background must have sharp environmental detail — mundane room clutter, wall textures, everyday objects.
- Smartphone auto-exposure artifacts: blown-out windows, crushed shadows, mixed color temperatures.
- Computational sharpening artifacts, slight barrel distortion from wide-angle front camera.
- The image must feel like it was taken by a regular person with a regular smartphone, not generated or professionally shot.`;

export function buildFinalPrompt(
  scene: ComposedScene,
  characterAge?: string,
  characterSheetAttached?: boolean,
): string {
  const ageClause = characterAge?.trim()
    ? `\nThe subject is approximately ${characterAge.trim()} years old. Render their appearance consistent with this age.\n`
    : '';

  const identityPreamble = characterSheetAttached
    ? `IDENTITY-FIRST PORTRAIT — CHARACTER REFERENCE SHEET ATTACHED:

The attached image is a multi-panel character reference sheet (multiple full-body views and close-up portraits of the same person, shot under controlled studio conditions). Study it carefully to extract this person's EXACT physical identity, then place them in the new scene described below.

ROLE OF THE ATTACHED IMAGE — IDENTITY SOURCE ONLY:
From the reference sheet panels, extract and reproduce precisely: the facial bone structure, jaw shape, nose shape and size, eye shape and color, eyebrow shape and thickness, lip shape and fullness, ear shape, skin tone and undertone, hair color, hair texture and general style, hairline shape, forehead size, cheekbone structure, chin shape, neck proportions, and body build (height, frame, weight). The generated face must be RECOGNIZABLE as the same individual — if placed side by side with the reference, it must clearly be the same person.

WHAT TO COMPLETELY DISCARD FROM THE REFERENCE SHEET:
The reference sheet was produced under controlled studio conditions with flat, even lighting, a neutral gray background, and plain neutral clothing. These are ALL properties of the sheet format — ignore them completely. The studio lighting, gray background, and neutral outfit must NOT influence the output. Only the person's physical identity matters.

Render the skin with natural photographic realism — visible pores, natural subsurface scattering, authentic texture appropriate to the scene's lighting conditions. Do NOT reproduce the smoothed, flat skin rendering of the studio reference sheet. Do NOT alter, beautify, age, or reshape any facial feature. Identity comes FIRST, style comes second.
${ageClause}
SCENE DIRECTION — FOLLOW THIS EXACTLY:
`
    : `${ageClause}SCENE DIRECTION:
`;

  return `${identityPreamble}${scene.subjectDirection}

${scene.environmentDna}

The image must look like a real photograph taken in this specific setting — not AI-generated. No text, watermarks, or typographic elements anywhere in the image.
${QUALITY_FOOTER}`;
}
