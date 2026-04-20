import { z } from 'zod';
import {
  toErrorResponse,
  toJsonResponse,
  type ToolDefinition,
} from '../types.js';
import {
  CoursesByFieldResponseSchema,
  CourseContentsResponseSchema,
  EnrolledUsersResponseSchema,
  TEACHER_ROLE_SHORTNAMES,
} from '../../schemas/moodle-responses.js';
import { isMcpIdnumber } from '../../utils/idempotency.js';
import { MoodleWsError } from '../../client/errors.js';

const InputSchema = z
  .object({
    course_id: z.number().int().positive(),
    incluir_ultimas_clases: z
      .number()
      .int()
      .nonnegative()
      .default(5),
  })
  .strict();

export type ObtenerContextoCursoInput = z.infer<typeof InputSchema>;

/**
 * High-level snapshot of a Moodle course: metadata, sections (with module
 * counts), the latest lessons published through this MCP, and enrolment
 * counts split into docentes vs alumnos. Mirrors CONTEXT §5.1.
 */
export const obtenerContextoCursoTool: ToolDefinition<ObtenerContextoCursoInput> = {
  name: 'obtener_contexto_curso',
  description:
    'Returns a compact radiograph of a Moodle course: metadata, sections with module counts, recent MCP-published lessons, and enrolment counts (teachers vs students). Call this before publishing a Ficha so the agent knows where it fits.',
  inputSchema: InputSchema,
  async handler(args, ctx) {
    ctx.logger.debug('obtener_contexto_curso.start', { course_id: args.course_id });
    try {
      const [coursesRaw, contentsRaw, usersRaw] = await Promise.all([
        ctx.client.call('core_course_get_courses_by_field', {
          field: 'id',
          value: args.course_id,
        }),
        ctx.client.call('core_course_get_contents', {
          courseid: args.course_id,
        }),
        ctx.client.call('core_enrol_get_enrolled_users', {
          courseid: args.course_id,
        }),
      ]);

      const courses = CoursesByFieldResponseSchema.parse(coursesRaw);
      const sections = CourseContentsResponseSchema.parse(contentsRaw);
      const users = EnrolledUsersResponseSchema.parse(usersRaw);

      const course = courses.courses[0];
      if (!course) {
        throw new MoodleWsError(`Course ${args.course_id} not found`, {
          code: 'MOODLE_WS_COURSE_NOT_FOUND',
          functionName: 'core_course_get_courses_by_field',
          details: { course_id: args.course_id },
        });
      }

      const secciones = sections.map((s) => ({
        id: s.id,
        name: s.name,
        section: s.section,
        summary: s.summary ?? '',
        visible: s.visible ?? true,
        modules_count: s.modules.length,
      }));

      const mcpSections = sections.filter((s) =>
        s.modules.some((m) => m.idnumber && isMcpIdnumber(m.idnumber)),
      );
      const take = Math.min(args.incluir_ultimas_clases, mcpSections.length);
      const ultimas_clases = mcpSections.slice(-take).map((s) => {
        const mcpModule = s.modules.find(
          (m) => m.idnumber && isMcpIdnumber(m.idnumber),
        );
        return {
          seccion_id: s.id,
          seccion_name: s.name,
          // Moodle WS does not expose a "publishedAt" — callers that need it
          // should query audit logs. We surface the idnumber, which is stable.
          ficha_idnumber: mcpModule?.idnumber,
        };
      });

      let docentes = 0;
      let alumnos = 0;
      for (const u of users) {
        const isTeacher = u.roles.some((r) =>
          TEACHER_ROLE_SHORTNAMES.has(r.shortname),
        );
        if (isTeacher) docentes += 1;
        else alumnos += 1;
      }

      return toJsonResponse({
        course: {
          id: course.id,
          fullname: course.fullname,
          shortname: course.shortname,
          format: course.format ?? 'topics',
          startdate: course.startdate ?? 0,
        },
        secciones,
        ultimas_clases,
        matriculados: {
          total: users.length,
          docentes,
          alumnos,
        },
      });
    } catch (e) {
      return toErrorResponse(e);
    }
  },
};
