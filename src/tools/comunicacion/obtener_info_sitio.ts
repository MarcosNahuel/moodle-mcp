import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolContext,
  type ToolDefinition,
  type ToolResponse,
} from '../types.js';

const InputSchema = z
  .object({
    include_functions: z
      .boolean()
      .default(false)
      .describe(
        'If true, return the full list of WS functions available to the token (can be large — usually 700+).',
      ),
    functions_filter: z
      .string()
      .optional()
      .describe(
        'Substring to filter the functions list (only applies if include_functions=true).',
      ),
  })
  .strict();

export type ObtenerInfoSitioInput = z.infer<typeof InputSchema>;

interface SiteInfoResponse {
  sitename: string;
  username: string;
  userid: number;
  siteurl: string;
  release: string;
  version: string;
  mobilecssurl?: string;
  functions?: Array<{ name: string; version: string }>;
  downloadfiles?: number;
  uploadfiles?: number;
  lang?: string;
  usercanmanageownfiles?: boolean;
}

/**
 * Health check + introspection of the Moodle WS service the token is
 * attached to. Useful at bootstrap to verify the token is alive and,
 * optionally, which plugin functions the service currently exposes.
 */
export function buildObtenerInfoSitioTool(): ToolDefinition<ObtenerInfoSitioInput> {
  return {
    name: 'obtener_info_sitio',
    description:
      'Get site + user + token info (core_webservice_get_site_info). Use include_functions=true at bootstrap to verify which plugin WS functions are exposed to the token.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const obtenerInfoSitioTool = buildObtenerInfoSitioTool();

async function execute(args: ObtenerInfoSitioInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const info = (await ctx.client.call('core_webservice_get_site_info', {})) as SiteInfoResponse;

    const base = {
      sitename: info.sitename,
      siteurl: info.siteurl,
      release: info.release,
      version: info.version,
      user: {
        id: info.userid,
        username: info.username,
        lang: info.lang ?? null,
      },
      uploads_allowed: info.uploadfiles === 1,
      downloads_allowed: info.downloadfiles === 1,
    };

    if (!args.include_functions) {
      return toJsonResponse({
        ...base,
        functions_count: info.functions?.length ?? 0,
      });
    }

    const allFns = info.functions ?? [];
    const filtered = args.functions_filter
      ? allFns.filter((f) => f.name.includes(args.functions_filter!))
      : allFns;

    return toJsonResponse({
      ...base,
      functions_total: allFns.length,
      functions_returned: filtered.length,
      functions: filtered.map((f) => f.name),
    });
  } catch (e) {
    ctx.logger.warn('obtener_info_sitio.failed', {
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
