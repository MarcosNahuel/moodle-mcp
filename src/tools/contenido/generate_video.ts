import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';

const GenerateVideoInputSchema = z
  .object({
    courseid: z.number().int().positive().describe('Moodle course ID'),
    sectionnum: z
      .number()
      .int()
      .min(0)
      .describe('Section number (0 = General, 1..N for Unità)'),
    idnumber: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/i, 'use lowercase-kebab-case, digits ok')
      .describe(
        'Stable idnumber for idempotency (e.g. "ita-a1-u3-video-mercato")',
      ),
    name: z
      .string()
      .min(3)
      .describe('Visible module name shown to students'),
    prompt: z
      .string()
      .min(20)
      .describe(
        'Italian-language video prompt (what Veo will render). Include scene, characters, mood, lighting, camera style. Audio nativo',
      ),
    duration_seconds: z
      .union([z.literal(4), z.literal(6), z.literal(8)])
      .optional()
      .default(8)
      .describe('Clip duration — Veo 3.1 lite supports 4, 6, 8s'),
    aspect_ratio: z
      .enum(['16:9', '9:16'])
      .optional()
      .default('16:9'),
    resolution: z
      .enum(['720p', '1080p'])
      .optional()
      .default('720p')
      .describe('1080p only allowed with duration=8'),
    comprehension_questions: z
      .array(z.string().min(3))
      .optional()
      .describe('Optional list of 2-4 Italian questions shown below the video'),
    intro_text: z
      .string()
      .optional()
      .describe('Optional Italian intro shown above the video (1-2 sentences)'),
    model: z
      .enum([
        'veo-3.1-lite-generate-preview',
        'veo-3.1-fast-generate-preview',
        'veo-3.1-generate-preview',
      ])
      .optional()
      .default('veo-3.1-lite-generate-preview')
      .describe('Veo model. "lite" is cheapest (~$0.15/clip), default.'),
  })
  .strict();

export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_MS = 10 * 60 * 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function renderVideoPage(
  videoUrl: string,
  name: string,
  intro: string | undefined,
  questions: string[] | undefined,
): string {
  const NAVY = '#1e3a8a';
  const LIME = '#22c55e';
  const SLATE = '#64748b';
  const FAMILY = 'Inter,system-ui,sans-serif';

  const introBlock = intro
    ? `<p style="margin:0;color:#bfdbfe">${escapeHtml(intro)}</p>`
    : `<p style="margin:0;color:#bfdbfe">Video generato con IA — ascolta e guarda.</p>`;

  const questionsBlock =
    questions && questions.length > 0
      ? `
<div style="padding:20px;border-left:4px solid ${LIME};margin-top:16px;background:#f8fafc;font-family:${FAMILY}">
  <p style="margin:0 0 8px 0"><strong>Mira il video e rispondi:</strong></p>
  <ul style="margin:0;padding-left:20px">
    ${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('\n    ')}
  </ul>
</div>`
      : '';

  return `
<div style="background:${NAVY};color:white;padding:24px;border-radius:12px;font-family:${FAMILY}">
  <h2 style="margin:0 0 12px 0;color:white">${escapeHtml(name)}</h2>
  ${introBlock}
</div>

<video controls preload="metadata" style="width:100%;max-width:720px;display:block;margin:16px auto;border-radius:8px;">
  <source src="${videoUrl}" type="video/mp4">
  Il tuo browser non supporta video HTML5.
</video>
${questionsBlock}

<p style="color:${SLATE};font-style:italic;font-size:12px;text-align:center;margin-top:12px;font-family:${FAMILY}">
  Video generato con Google Veo 3.1 · audio italiano nativo
</p>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function downloadVideoBytes(
  ai: GoogleGenAI,
  video: unknown,
): Promise<Uint8Array> {
  // @google/genai: client.files.download returns the file payload. For video
  // generation, video.video is a generated file handle.
  // We use the lower-level fetch-style download and materialize into memory.
  // The SDK's .save() method writes to disk, but we want bytes.
  //
  // In current versions, passing { file: <file-obj> } downloads and returns
  // an ArrayBuffer-like. If the SDK changes, this fallback writes to tmp
  // and re-reads — but avoiding disk IO keeps the MCP stdio-friendly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (ai.files as any).download({ file: (video as any).video });
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (Buffer.isBuffer(result)) return new Uint8Array(result);
  // Some SDK shapes return { data: Uint8Array } or a readable stream-like.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyresult = result as any;
  if (anyresult?.data instanceof Uint8Array) return anyresult.data;
  throw new Error(
    `Unexpected download result shape: ${typeof result}. Update generate_video.ts`,
  );
}

/**
 * Generate a short video with Google Veo 3.1, upload it to Moodle, and
 * embed it in a branded mod_page. Single round-trip for the author.
 *
 * Requires `GEMINI_API_KEY` in the MCP process environment. The Moodle
 * plugin must have `local_italiciamcp_upload_file` and
 * `local_italiciamcp_upsert_page` enabled on its service.
 */
export const generateVideoTool: ToolDefinition<GenerateVideoInput> = {
  name: 'generate_video',
  description:
    'Generate a short Italian-language video with Google Veo 3.1 and embed it in a new mod_page in Moodle. Requires GEMINI_API_KEY env. Returns `{ cmid, video_url, page_url }`. Takes ~1 minute end-to-end for a lite 8s clip.',
  inputSchema: GenerateVideoInputSchema,
  async handler(args, ctx) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return toErrorResponse(
        new Error(
          'GEMINI_API_KEY environment variable is required. Add it to your claude_desktop_config.json env block for the moodle-mcp server.',
        ),
      );
    }

    if (args.resolution === '1080p' && args.duration_seconds !== 8) {
      return toErrorResponse(
        new Error('resolution=1080p requires duration_seconds=8 (Veo 3.1 constraint)'),
      );
    }

    ctx.logger.info('generate_video.start', {
      model: args.model,
      duration: args.duration_seconds,
      idnumber: args.idnumber,
    });

    const ai = new GoogleGenAI({ apiKey });

    // 1) Start generation
    let operation;
    try {
      operation = await ai.models.generateVideos({
        model: args.model,
        prompt: args.prompt,
        config: {
          aspectRatio: args.aspect_ratio,
          durationSeconds: args.duration_seconds,
          resolution: args.resolution,
          personGeneration: 'allow_all',
          numberOfVideos: 1,
        },
      });
    } catch (e) {
      ctx.logger.warn('generate_video.generateVideos_failed', {
        error: (e as Error).message,
      });
      return toErrorResponse(e);
    }

    // 2) Poll
    const started = Date.now();
    while (!operation.done) {
      if (Date.now() - started > MAX_POLL_MS) {
        return toErrorResponse(
          new Error(`Veo generation timed out after ${MAX_POLL_MS / 1000}s`),
        );
      }
      await sleep(POLL_INTERVAL_MS);
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (!operation.response || !operation.response.generatedVideos?.length) {
      return toErrorResponse(new Error('Veo returned no video in response'));
    }

    const elapsedS = Math.round((Date.now() - started) / 1000);
    ctx.logger.info('generate_video.generated', { elapsed_s: elapsedS });

    // 3) Download bytes
    const genVideo = operation.response.generatedVideos[0];
    let videoBytes: Uint8Array;
    try {
      videoBytes = await downloadVideoBytes(ai, genVideo);
    } catch (e) {
      return toErrorResponse(e);
    }
    const b64 = Buffer.from(videoBytes).toString('base64');
    const filename = `${args.idnumber}.mp4`;

    // 4) Upload to Moodle
    let uploadRes: {
      url: string;
      filename: string;
      filesize: number;
      contextid: number;
    };
    try {
      uploadRes = (await ctx.client.call('local_italiciamcp_upload_file', {
        courseid: args.courseid,
        filename,
        filecontent_b64: b64,
        mimetype: 'video/mp4',
      })) as typeof uploadRes;
    } catch (e) {
      ctx.logger.warn('generate_video.upload_failed', {
        error: (e as Error).message,
      });
      return toErrorResponse(e);
    }

    // 5) Render HTML and create/update page
    const html = renderVideoPage(
      uploadRes.url,
      args.name,
      args.intro_text,
      args.comprehension_questions,
    );

    let pageRes: {
      action: string;
      cmid: number;
      instanceid: number;
      url: string;
    };
    try {
      pageRes = (await ctx.client.call('local_italiciamcp_upsert_page', {
        courseid: args.courseid,
        sectionnum: args.sectionnum,
        idnumber: args.idnumber,
        name: args.name,
        content: html,
        visible: 1,
      })) as typeof pageRes;
    } catch (e) {
      ctx.logger.warn('generate_video.upsert_page_failed', {
        error: (e as Error).message,
      });
      return toErrorResponse(e);
    }

    return toJsonResponse({
      cmid: pageRes.cmid,
      video_url: uploadRes.url,
      page_url: pageRes.url,
      bytes: uploadRes.filesize,
      generation_seconds: elapsedS,
      action: pageRes.action,
    });
  },
};
