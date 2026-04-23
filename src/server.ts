import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { MoodleClient } from './client/moodle-client.js';
import type { Logger } from './utils/logger.js';
import type { ToolDefinition } from './tools/types.js';
import { toErrorResponse } from './tools/types.js';

import { wsRawTool } from './tools/primitive/ws_raw.js';
import { obtenerContextoCursoTool } from './tools/curso/obtener_contexto_curso.js';
import { publicarFichaClaseTool } from './tools/contenido/publicar_ficha_clase.js';
import { publicarPreviewTool } from './tools/contenido/publicar_preview.js';
import { confirmarPreviewTool } from './tools/contenido/confirmar_preview.js';
import { generateVideoTool } from './tools/contenido/generate_video.js';
// v0.5 Phase 3 — Secciones family
import { crearSeccionTool } from './tools/secciones/crear_seccion.js';
import { actualizarSeccionTool } from './tools/secciones/actualizar_seccion.js';
import {
  ocultarSeccionTool,
  liberarSeccionTool,
} from './tools/secciones/visibility.js';
import { reordenarSeccionesTool } from './tools/secciones/reordenar_secciones.js';
// v0.5 Phase 4 — Curso family
import { crearCursoTool } from './tools/curso/crear_curso.js';
import { actualizarCursoTool } from './tools/curso/actualizar_curso.js';
import { duplicarCursoTool } from './tools/curso/duplicar_curso.js';
import { archivarCursoTool } from './tools/curso/archivar_curso.js';
import { listarMisCursosTool } from './tools/curso/listar_mis_cursos.js';
// v0.5 Phase 5 — Evaluacion family (partial — 3 of 7; rest deferred v0.6)
import { configurarQuizTool } from './tools/evaluacion/configurar_quiz.js';
import { importarGiftTool } from './tools/evaluacion/importar_gift.js';
import { modificarPreguntaTool } from './tools/evaluacion/modificar_pregunta.js';
import { publicarFichaExamenTool } from './tools/evaluacion/publicar_ficha_examen.js';
// v0.5 Phase 6 — Alumnos family
import { listarAlumnosTool } from './tools/alumnos/listar_alumnos.js';
import { matricularCsvTool } from './tools/alumnos/matricular_csv.js';
import { darBajaTool } from './tools/alumnos/dar_baja.js';
import { crearGrupoTool, asignarAGrupoTool } from './tools/alumnos/grupos.js';
import { cambiarRolTool } from './tools/alumnos/cambiar_rol.js';
import { resetPasswordTool } from './tools/alumnos/reset_password.js';
// v0.5 Phase 7 — Gradebook family
import { obtenerCalificacionesTool } from './tools/gradebook/obtener_calificaciones.js';
import { obtenerCompletionTool } from './tools/gradebook/obtener_completion.js';
import { obtenerIntentosQuizTool } from './tools/gradebook/obtener_intentos_quiz.js';
import { obtenerEntregasAssignTool } from './tools/gradebook/obtener_entregas_assign.js';
import { calificarManualmenteTool } from './tools/gradebook/calificar_manualmente.js';
// v0.5 Phase 8 — Comunicacion family
import { enviarMensajeMoodleTool } from './tools/comunicacion/enviar_mensaje_moodle.js';
import { crearAnuncioForoTool } from './tools/comunicacion/crear_anuncio_foro.js';
import { obtenerLogsCursoTool } from './tools/comunicacion/obtener_logs_curso.js';
import { obtenerInfoSitioTool } from './tools/comunicacion/obtener_info_sitio.js';
// v0.5 Phase 9 — Calendario family
import { crearEventoCalendarioTool } from './tools/calendario/crear_evento_calendario.js';
import { listarEventosCalendarioTool } from './tools/calendario/listar_eventos_calendario.js';
import { actualizarEventoTool } from './tools/calendario/actualizar_evento.js';
import { eliminarEventoTool } from './tools/calendario/eliminar_evento.js';
// v0.5 Phase 10 — Badges (read-only in v0.5; award deferred v0.6)
import { listarBadgesUsuarioTool } from './tools/badges/listar_badges_usuario.js';

export const ALL_TOOLS: ReadonlyArray<ToolDefinition<unknown>> = [
  wsRawTool,
  obtenerContextoCursoTool,
  publicarFichaClaseTool,
  publicarPreviewTool,
  confirmarPreviewTool,
  generateVideoTool,
  // Secciones
  crearSeccionTool,
  actualizarSeccionTool,
  ocultarSeccionTool,
  liberarSeccionTool,
  reordenarSeccionesTool,
  // Curso
  crearCursoTool,
  actualizarCursoTool,
  duplicarCursoTool,
  archivarCursoTool,
  listarMisCursosTool,
  // Evaluacion
  configurarQuizTool,
  importarGiftTool,
  modificarPreguntaTool,
  publicarFichaExamenTool,
  // Alumnos
  listarAlumnosTool,
  matricularCsvTool,
  darBajaTool,
  crearGrupoTool,
  asignarAGrupoTool,
  cambiarRolTool,
  resetPasswordTool,
  // Gradebook
  obtenerCalificacionesTool,
  obtenerCompletionTool,
  obtenerIntentosQuizTool,
  obtenerEntregasAssignTool,
  calificarManualmenteTool,
  // Comunicacion
  enviarMensajeMoodleTool,
  crearAnuncioForoTool,
  obtenerLogsCursoTool,
  obtenerInfoSitioTool,
  // Calendario
  crearEventoCalendarioTool,
  listarEventosCalendarioTool,
  actualizarEventoTool,
  eliminarEventoTool,
  // Badges
  listarBadgesUsuarioTool,
] as unknown as ReadonlyArray<ToolDefinition<unknown>>;

export interface BuildServerOptions {
  client: MoodleClient;
  logger: Logger;
  name?: string;
  version?: string;
}

/**
 * Build and wire the MCP server. Registering happens eagerly; the caller
 * is responsible for connecting the transport (stdio in production, an
 * in-memory transport in tests).
 */
export function buildServer(opts: BuildServerOptions): Server {
  const server = new Server(
    {
      name: opts.name ?? 'moodle-mcp',
      version: opts.version ?? '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: 'openApi3' }) as Record<
        string,
        unknown
      >,
    })),
  }));

  const callToolHandler = async (request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<unknown> => {
    const { name, arguments: rawArgs } = request.params;
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return toErrorResponse(
        new Error(`Unknown tool: ${name}. Known: ${ALL_TOOLS.map((t) => t.name).join(', ')}`),
      );
    }
    try {
      const args = tool.inputSchema.parse(rawArgs ?? {});
      return await tool.handler(args, { client: opts.client, logger: opts.logger });
    } catch (e) {
      opts.logger.warn('tool.invocation_failed', {
        tool: name,
        error: (e as Error).message,
      });
      return toErrorResponse(e);
    }
  };
  // SDK's `ServerResult` union has evolved to include optional `task` fields
  // for long-running tool invocations. We don't use that yet, so cast through
  // `never` — the runtime contract we produce (`ToolResponse`) is valid.
  server.setRequestHandler(CallToolRequestSchema, callToolHandler as never);

  return server;
}
