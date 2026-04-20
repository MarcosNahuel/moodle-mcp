import { describe, it, expect } from 'vitest';
import { obtenerCalificacionesTool } from '../../../src/tools/gradebook/obtener_calificaciones.js';
import { obtenerCompletionTool } from '../../../src/tools/gradebook/obtener_completion.js';
import { obtenerIntentosQuizTool } from '../../../src/tools/gradebook/obtener_intentos_quiz.js';
import { obtenerEntregasAssignTool } from '../../../src/tools/gradebook/obtener_entregas_assign.js';
import { calificarManualmenteTool } from '../../../src/tools/gradebook/calificar_manualmente.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://aula.example.com'): MoodleClient {
  return {
    baseUrl,
    async call(fn, params = {}) {
      const f = scripts[fn];
      if (!f) throw new Error(`unexpected WS call: ${fn}`);
      return await f(params);
    },
  };
}

function ctx(client: MoodleClient) {
  return { client, logger: nullLogger };
}

describe('obtener_calificaciones', () => {
  it('flattens user grades with raw/max/feedback', async () => {
    const client = scriptedClient({
      gradereport_user_get_grade_items: () => ({
        usergrades: [
          {
            userid: 10,
            userfullname: 'Ana',
            gradeitems: [
              { id: 1, itemname: 'Quiz 1', itemmodule: 'quiz', cmid: 70, graderaw: 8, grademax: 10, gradeformatted: '8.00', feedback: '' },
              { id: 2, itemname: 'Course total', graderaw: null, grademax: 100 },
            ],
          },
        ],
      }),
    });

    const result = await obtenerCalificacionesTool.handler(
      { course_id: 5, user_id: 10 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.users).toHaveLength(1);
    expect(p.users[0].items).toHaveLength(2);
    expect(p.users[0].items[0].grade_raw).toBe(8);
    expect(p.users[0].items[1].grade_raw).toBeNull();
  });

  it('does not include userid param when user_id omitted', async () => {
    let params: Record<string, unknown> = {};
    const client = scriptedClient({
      gradereport_user_get_grade_items: (p) => {
        params = p;
        return { usergrades: [] };
      },
    });

    await obtenerCalificacionesTool.handler({ course_id: 5 }, ctx(client));
    expect(params).toEqual({ courseid: 5 });
  });
});

describe('obtener_completion', () => {
  it('maps numeric state to readable strings and sums complete count', async () => {
    const client = scriptedClient({
      core_completion_get_activities_completion_status: () => ({
        statuses: [
          { cmid: 1, modname: 'page', instance: 10, state: 1, tracking: 1 },
          { cmid: 2, modname: 'quiz', instance: 11, state: 2, tracking: 1, timecompleted: 123 },
          { cmid: 3, modname: 'assign', instance: 12, state: 0, tracking: 1 },
        ],
      }),
    });

    const result = await obtenerCompletionTool.handler(
      { course_id: 5, user_id: 10 },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.summary).toEqual({ total: 3, complete: 2, incomplete: 1 });
    const byCmid: Record<number, string> = Object.fromEntries(
      p.activities.map((a: { cmid: number; state: string }) => [a.cmid, a.state]),
    );
    expect(byCmid).toEqual({ 1: 'complete', 2: 'complete_pass', 3: 'incomplete' });
  });
});

describe('obtener_intentos_quiz', () => {
  it('returns attempts, skips review when include_review=false', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      mod_quiz_get_user_quiz_attempts: () => {
        calls.push('attempts');
        return {
          attempts: [
            { id: 100, quiz: 1, userid: 10, attempt: 1, state: 'finished', timefinish: 123, sumgrades: 9 },
          ],
        };
      },
      mod_quiz_get_attempt_review: () => {
        calls.push('review');
        return { questions: [] };
      },
    });

    const result = await obtenerIntentosQuizTool.handler(
      { quiz_id: 1, user_id: 10, status: 'finished', include_review: false },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.attempts).toHaveLength(1);
    expect(p.attempts[0].sum_grades).toBe(9);
    expect(p.reviews).toBeUndefined();
    expect(calls).toEqual(['attempts']);
  });

  it('includes review payload when include_review=true', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      mod_quiz_get_user_quiz_attempts: () => {
        calls.push('attempts');
        return {
          attempts: [
            { id: 100, quiz: 1, userid: 10, attempt: 1, state: 'finished' },
          ],
        };
      },
      mod_quiz_get_attempt_review: () => {
        calls.push('review');
        return { questions: [{ number: 1, text: 'Q1' }] };
      },
    });

    const result = await obtenerIntentosQuizTool.handler(
      { quiz_id: 1, user_id: 10, status: 'finished', include_review: true },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.reviews).toHaveLength(1);
    expect(calls).toEqual(['attempts', 'review']);
  });
});

describe('obtener_entregas_assign', () => {
  it('returns flat submissions list and skips per-user status by default', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      mod_assign_get_submissions: () => {
        calls.push('submissions');
        return {
          assignments: [
            {
              id: 50,
              name: 'T1',
              submissions: [
                { id: 1, userid: 10, attemptnumber: 0, timemodified: 100, status: 'submitted', latest: true },
                { id: 2, userid: 20, attemptnumber: 0, timemodified: 200, status: 'submitted', latest: true },
              ],
            },
          ],
        };
      },
    });

    const result = await obtenerEntregasAssignTool.handler(
      { assign_id: 50, status: 'submitted', include_status_per_user: false },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.submissions_count).toBe(2);
    expect(p.statuses).toBeUndefined();
    expect(calls).toEqual(['submissions']);
  });

  it('fetches per-user status when include_status_per_user=true', async () => {
    const calls: string[] = [];
    const client = scriptedClient({
      mod_assign_get_submissions: () => {
        calls.push('submissions');
        return {
          assignments: [
            {
              id: 50,
              name: 'T1',
              submissions: [
                { id: 1, userid: 10, attemptnumber: 0, timemodified: 100, status: 'submitted', latest: true },
              ],
            },
          ],
        };
      },
      mod_assign_get_submission_status: () => {
        calls.push('status');
        return { gradingstatus: 'notgraded' };
      },
    });

    const result = await obtenerEntregasAssignTool.handler(
      { assign_id: 50, status: 'submitted', include_status_per_user: true },
      ctx(client),
    );

    const p = JSON.parse(result.content[0]!.text);
    expect(p.statuses).toHaveLength(1);
    expect(calls).toEqual(['submissions', 'status']);
  });
});

describe('calificar_manualmente', () => {
  it('sends grade + feedback + attempt params to mod_assign_save_grade', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      mod_assign_save_grade: (params) => {
        sent = params;
        return null;
      },
    });

    const result = await calificarManualmenteTool.handler(
      {
        assign_id: 50,
        user_id: 10,
        grade: 8.5,
        feedback_text: '<p>Buen trabajo</p>',
        apply_to_all_members: false,
        attempt_number: -1,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.assignmentid).toBe(50);
    expect(sent.userid).toBe(10);
    expect(sent.grade).toBe(8.5);
    expect(sent.attemptnumber).toBe(-1);
    expect(sent.applytoall).toBe(0);
    const pd = sent.plugindata as Record<string, Record<string, unknown>>;
    expect(pd.assignfeedbackcomments_editor?.text).toBe('<p>Buen trabajo</p>');
    expect(pd.assignfeedbackcomments_editor?.format).toBe(1);
    // workflow_state omitted → not in payload
    expect(sent.workflowstate).toBeUndefined();
  });

  it('passes workflowstate when provided', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      mod_assign_save_grade: (params) => {
        sent = params;
        return null;
      },
    });

    await calificarManualmenteTool.handler(
      {
        assign_id: 50,
        user_id: 10,
        grade: 7,
        feedback_text: '',
        apply_to_all_members: false,
        workflow_state: 'released',
        attempt_number: -1,
      },
      ctx(client),
    );

    expect(sent.workflowstate).toBe('released');
  });
});
