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
    course_id: z.number().int().positive(),
    csv_content: z
      .string()
      .min(1)
      .describe('CSV with headers email,firstname,lastname[,role]. role defaults to student.'),
    create_users_if_missing: z
      .boolean()
      .default(true)
      .describe('If true, unknown emails trigger a user creation with a random temp password.'),
    default_role_shortname: z.enum(['student', 'teacher', 'editingteacher']).default('student'),
  })
  .strict();

export type MatricularCsvInput = z.infer<typeof InputSchema>;

/** Role shortname -> roleid mapping in a vanilla Moodle 5.x install. */
const ROLE_IDS: Record<string, number> = {
  student: 5,
  teacher: 4,
  editingteacher: 3,
  manager: 1,
};

interface CsvRow {
  email: string;
  firstname: string;
  lastname: string;
  role?: 'student' | 'teacher' | 'editingteacher';
}

/**
 * Batch-enrol students (or teachers) from a CSV block. For each row:
 *  1. Lookup user by email via core_user_get_users_by_field.
 *  2. If missing and create_users_if_missing=true, call core_user_create_users
 *     with a random temp password the caller can surface to the student.
 *  3. Enrol with enrol_manual_enrol_users (batched).
 *
 * Returns per-row status so the caller can surface partial failures.
 */
export function buildMatricularCsvTool(): ToolDefinition<MatricularCsvInput> {
  return {
    name: 'matricular_csv',
    description:
      'Batch-enrol users in a course from a CSV (email,firstname,lastname[,role]). Creates missing users by default with a random temp password. Returns per-row status.',
    inputSchema: InputSchema,
    handler: (args, ctx) => execute(args, ctx),
  };
}

export const matricularCsvTool = buildMatricularCsvTool();

function parseCsv(csv: string): { rows: CsvRow[]; errors: Array<{ line: number; error: string }> } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const errors: Array<{ line: number; error: string }> = [];
  if (lines.length < 2) return { rows: [], errors: [{ line: 0, error: 'CSV must have a header and at least one row' }] };

  const header = lines[0]!.split(',').map((s) => s.trim().toLowerCase());
  const emailIdx = header.indexOf('email');
  const fnIdx = header.indexOf('firstname');
  const lnIdx = header.indexOf('lastname');
  const roleIdx = header.indexOf('role');
  if (emailIdx < 0 || fnIdx < 0 || lnIdx < 0) {
    return {
      rows: [],
      errors: [{ line: 1, error: 'CSV header must include email, firstname, lastname (role optional)' }],
    };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map((s) => s.trim());
    const email = parts[emailIdx];
    const firstname = parts[fnIdx];
    const lastname = parts[lnIdx];
    if (!email || !firstname || !lastname) {
      errors.push({ line: i + 1, error: 'missing required field' });
      continue;
    }
    const roleRaw = roleIdx >= 0 ? parts[roleIdx] : undefined;
    const role =
      roleRaw && ['student', 'teacher', 'editingteacher'].includes(roleRaw)
        ? (roleRaw as CsvRow['role'])
        : undefined;
    rows.push({ email, firstname, lastname, role });
  }
  return { rows, errors };
}

function randomPassword(): string {
  // Alphanumeric 16 chars. Not cryptographically unique across calls but good
  // enough for a temp password the user will change on first login.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + '!A1'; // ensure it passes typical Moodle password policy
}

async function execute(args: MatricularCsvInput, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const { rows, errors: parseErrors } = parseCsv(args.csv_content);
    const results: Array<{
      email: string;
      status: 'enrolled' | 'created_and_enrolled' | 'skipped_missing_user' | 'failed';
      user_id?: number;
      temp_password?: string;
      error?: string;
    }> = [];

    for (const row of rows) {
      try {
        const existing = (await ctx.client.call('core_user_get_users_by_field', {
          field: 'email',
          values: [row.email],
        })) as Array<{ id: number }> | undefined;

        let userId: number | null = null;
        let tempPass: string | undefined;

        if (Array.isArray(existing) && existing.length > 0) {
          userId = existing[0]!.id;
        } else if (args.create_users_if_missing) {
          tempPass = randomPassword();
          const username = row.email.split('@')[0]!.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
          const created = (await ctx.client.call('core_user_create_users', {
            users: [
              {
                username: username || row.email.toLowerCase(),
                password: tempPass,
                firstname: row.firstname,
                lastname: row.lastname,
                email: row.email,
                auth: 'manual',
                mailformat: 1,
              },
            ],
          })) as Array<{ id: number; username: string }> | undefined;
          if (Array.isArray(created) && created.length > 0) {
            userId = created[0]!.id;
          }
        } else {
          results.push({ email: row.email, status: 'skipped_missing_user' });
          continue;
        }

        if (!userId) {
          results.push({ email: row.email, status: 'failed', error: 'user_not_created' });
          continue;
        }

        const roleid = ROLE_IDS[row.role ?? args.default_role_shortname] ?? ROLE_IDS.student!;
        await ctx.client.call('enrol_manual_enrol_users', {
          enrolments: [
            {
              roleid,
              userid: userId,
              courseid: args.course_id,
            },
          ],
        });

        results.push({
          email: row.email,
          status: tempPass ? 'created_and_enrolled' : 'enrolled',
          user_id: userId,
          ...(tempPass && { temp_password: tempPass }),
        });
      } catch (e) {
        results.push({
          email: row.email,
          status: 'failed',
          error: (e as Error).message,
        });
      }
    }

    const summary = {
      total_rows: rows.length,
      parse_errors: parseErrors,
      enrolled: results.filter((r) => r.status === 'enrolled').length,
      created_and_enrolled: results.filter((r) => r.status === 'created_and_enrolled').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped_missing_user').length,
      results,
    };

    return toJsonResponse(summary);
  } catch (e) {
    ctx.logger.warn('matricular_csv.failed', {
      course_id: args.course_id,
      error: (e as Error).message,
    });
    return toErrorResponse(e);
  }
}
