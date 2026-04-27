<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_multiple_structure;
use core_external\external_value;
use context_course;

/**
 * Direct DB update of an existing `question` row + its `question_answers`
 * rows, bypassing the Moodle question edit form (which in some 4.5+/5.x
 * combinations redisplays the form without persisting changes — see
 * italiacia_whatsapp/moodle/decisiones-y-lecciones.md L14 for the full
 * post-mortem).
 *
 * What this does:
 *  - Resolves the actual question row being served to students via the
 *    question_versions chain (Moodle 5.x: quiz renders latest-ready version,
 *    NOT necessarily the passed question_id which may be a draft/old version).
 *  - Updates `question.name`, `question.questiontext`, `question.timemodified`
 *    on the RESOLVED row.
 *  - Optionally updates `question_answers` (match by position/index).
 *  - Marks the resolved version as status='ready' so it is visible.
 *  - Updates question_bank_entries.timemodified to bust upstream caches.
 *  - Purges the quiz caches so running attempts see the new text.
 *
 * What this does NOT do:
 *  - Create a new question_version. The edit is applied to the current
 *    ready version row. For structural rewrites prefer `add_questions_gift`.
 *  - Validate question ownership beyond the course capability check.
 *
 * Scope: the caller must pass `courseid` for capability check. The question
 * can belong to any category inside the course's quiz banks.
 */
class update_question_simple extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'     => new external_value(PARAM_INT,  'Course id for capability check'),
            'question_id'  => new external_value(PARAM_INT,  'question.id to update (will be resolved to the latest-ready version)'),
            'name'         => new external_value(PARAM_TEXT, 'New question name (optional; pass "" to skip)', VALUE_DEFAULT, ''),
            'questiontext' => new external_value(PARAM_RAW,  'New question text in HTML (optional; pass "" to skip)', VALUE_DEFAULT, ''),
            'answers'      => new external_multiple_structure(
                new external_single_structure([
                    'index'     => new external_value(PARAM_INT,   '0-based index of the answer to update (ordered by question_answers.id ASC)'),
                    'answer'    => new external_value(PARAM_RAW,   'Answer text HTML', VALUE_DEFAULT, ''),
                    'feedback'  => new external_value(PARAM_RAW,   'Feedback HTML', VALUE_DEFAULT, ''),
                    'fraction'  => new external_value(PARAM_FLOAT, 'Fraction: 1.0 correct, 0.0 wrong, or partial', VALUE_DEFAULT, -999.0),
                ]),
                'Optional list of answer edits. Leave fields empty / fraction=-999 to skip that field.',
                VALUE_DEFAULT, []
            ),
        ]);
    }

    public static function execute(
        int $courseid,
        int $question_id,
        string $name = '',
        string $questiontext = '',
        array $answers = []
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'     => $courseid,
            'question_id'  => $question_id,
            'name'         => $name,
            'questiontext' => $questiontext,
            'answers'      => $answers,
        ]);

        $course  = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // ── Resolve the question row actually being served to students ────────
        // Moodle 5.x quiz rendering chain:
        //   quiz_slots → question_references → question_versions (latest ready)
        //   → question row
        // The passed question_id may be a draft or an older version while the
        // quiz displays a DIFFERENT question.id. We resolve to the latest-ready
        // version of the same question_bank_entry before writing anything.
        $version_row = $DB->get_record('question_versions', ['questionid' => $params['question_id']]);
        $target_id   = $params['question_id'];  // fallback: edit as requested

        if ($version_row) {
            $entry_id     = $version_row->questionbankentryid;
            $latest_ready = $DB->get_record_sql(
                "SELECT * FROM {question_versions}
                  WHERE questionbankentryid = :eid
                    AND status = 'ready'
                  ORDER BY version DESC
                  LIMIT 1",
                ['eid' => $entry_id]
            );
            if ($latest_ready) {
                $target_id = $latest_ready->questionid;
            } else {
                // No ready version exists — promote ours so the quiz can see it.
                $DB->set_field('question_versions', 'status', 'ready',
                    ['questionid' => $params['question_id']]);
            }
        }

        $question = $DB->get_record('question', ['id' => $target_id], '*', MUST_EXIST);
        $changes  = [];

        // 1. Update the resolved question row.
        $update = ['id' => $question->id, 'timemodified' => time()];
        if ($params['name'] !== '') {
            $update['name'] = $params['name'];
            $changes[] = 'name';
        }
        if ($params['questiontext'] !== '') {
            $update['questiontext'] = $params['questiontext'];
            $update['questiontextformat'] = FORMAT_HTML;
            $changes[] = 'questiontext';
        }
        if (count($update) > 2) {
            $DB->update_record('question', (object)$update);
        }

        // 2. Optional answers update (on the resolved question row).
        $answerChanges = [];
        if (!empty($params['answers'])) {
            $answerRows = $DB->get_records('question_answers', ['question' => $question->id], 'id ASC');
            $answerRows = array_values($answerRows);
            foreach ($params['answers'] as $a) {
                $idx = (int)$a['index'];
                if (!isset($answerRows[$idx])) {
                    continue;
                }
                $row = $answerRows[$idx];
                $up  = ['id' => $row->id];
                if ($a['answer'] !== '') {
                    $up['answer'] = $a['answer'];
                    $up['answerformat'] = FORMAT_HTML;
                }
                if ($a['feedback'] !== '') {
                    $up['feedback'] = $a['feedback'];
                    $up['feedbackformat'] = FORMAT_HTML;
                }
                if ($a['fraction'] > -998.0) {
                    $up['fraction'] = (float)$a['fraction'];
                }
                if (count($up) > 1) {
                    $DB->update_record('question_answers', (object)$up);
                    $answerChanges[] = [
                        'index'     => $idx,
                        'answer_id' => (int)$row->id,
                        'fields'    => array_values(array_diff(array_keys($up), ['id'])),
                    ];
                }
            }
        }

        // 3. Ensure the resolved version is 'ready' so the quiz can serve it.
        //    NOTE: question_bank_entries has no timemodified column in Moodle 5.x
        //    — only touch question_versions.
        if ($version_row) {
            $DB->set_field('question_versions', 'status', 'ready', [
                'questionbankentryid' => $version_row->questionbankentryid,
                'questionid'          => $target_id,
            ]);
        }

        // 4. Purge question caches so in-flight quiz attempts pick up the change.
        if (class_exists('\\core\\cache_helper')) {
            \core\cache_helper::purge_by_event('changesinquestions');
        } else if (class_exists('\\cache_helper')) {
            \cache_helper::purge_by_event('changesinquestions');
        }

        return [
            'question_id'             => (int)$question->id,
            'name'                    => $params['name'] !== '' ? $params['name'] : $question->name,
            'question_fields_changed' => $changes,
            'answers_updated'         => $answerChanges,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'question_id' => new external_value(PARAM_INT, 'question.id of the row that was actually updated (may differ from the requested id if a newer version existed)'),
            'name' => new external_value(PARAM_TEXT, 'Current question name after update'),
            'question_fields_changed' => new external_multiple_structure(
                new external_value(PARAM_TEXT, 'Field name that was updated')
            ),
            'answers_updated' => new external_multiple_structure(
                new external_single_structure([
                    'index'     => new external_value(PARAM_INT, '0-based index'),
                    'answer_id' => new external_value(PARAM_INT, 'question_answers.id'),
                    'fields'    => new external_multiple_structure(
                        new external_value(PARAM_TEXT, 'Field name')
                    ),
                ])
            ),
        ]);
    }
}
