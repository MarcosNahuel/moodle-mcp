import { z } from 'zod';
import { isAbsolute } from 'node:path';
import {
  toErrorResponse,
  type ToolDefinition,
  type ToolResponse,
} from './types.js';
import {
  publicarFichaClaseTool,
  type PublicarFichaClaseInput,
} from './publicar_ficha_clase.js';

const InputSchema = z
  .object({
    ficha_path: z
      .string()
      .min(1)
      .refine((p) => isAbsolute(p), {
        message: 'ficha_path must be an absolute path',
      }),
    course_id: z.number().int().positive(),
  })
  .strict();

export type PublicarPreviewInput = z.infer<typeof InputSchema>;

/**
 * Publish a FichaClase in hidden/preview mode and return a URL Alicia can
 * open in a browser to review before calling `confirmar_preview`.
 *
 * Internally this is `publicar_ficha_clase` with `modo: "oculto"` and an
 * extra `preview_url` field on the response.
 */
export const publicarPreviewTool: ToolDefinition<PublicarPreviewInput> = {
  name: 'publicar_preview',
  description:
    'Publish a FichaClase in hidden preview mode. Returns the same shape as publicar_ficha_clase plus `preview_url` the teacher can open to review. Students will not see anything until `confirmar_preview` is called.',
  inputSchema: InputSchema,
  async handler(args, ctx): Promise<ToolResponse> {
    const delegateInput: PublicarFichaClaseInput = {
      ficha_path: args.ficha_path,
      course_id: args.course_id,
      modo: 'oculto',
    };
    const res = await publicarFichaClaseTool.handler(delegateInput, ctx);
    if (res.isError) return res;

    try {
      const parsed = JSON.parse(res.content[0]!.text) as {
        seccion: { id: number; [k: string]: unknown };
        [k: string]: unknown;
      };
      const baseUrl = deriveBaseUrl(ctx);
      const previewUrl = `${baseUrl}/course/view.php?id=${args.course_id}#section-${parsed.seccion.id}`;
      const augmented = { ...parsed, preview_url: previewUrl };
      return {
        content: [{ type: 'text', text: JSON.stringify(augmented) }],
      };
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};

/**
 * Pull the Moodle base URL from the client; falls back to a placeholder if
 * the context does not carry one (unit tests, typically).
 */
function deriveBaseUrl(ctx: { client: unknown }): string {
  const client = ctx.client as { baseUrl?: string };
  return client.baseUrl ?? '';
}
