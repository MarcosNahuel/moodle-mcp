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
 *  - Updates `question.name`, `question.questiontext`, `question.timemodified`
 *    for the given question_id (NOT a new version — modifies in place).
 *  - Optionally updates `question_answers` (match by position/index).
 *  - Purges the quiz caches so the running attempts see the new text.
 *
 * What this does NOT do:
 *  - Create a new question_version. The edit is in-place on the current
 *    row. This is by design: for production use after this endpoint
 *    ships, prefer `add_questions_gift` + delete for structural changes.
 *    This endpoint is for typo fixes / feedback tweaks.
 *  - Validate that the user owns the question (beyond the course
 *    capability check). The caller is trusted (bot with manager role).
 *
 * Scope: the caller must pass `courseid` so we can do a capability
 * check in that course's context. The question can belong to any
 * category inside the course's quiz banks.
 */
class update_question_simple extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'     => new external_value(PARAM_INT,  'Course id for capability check'),
            'question_id'  => new external_value(PARAM_INT,  'question.id to update'),
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
            'courseid' => $courseid,
            'question_id' => $question_id,
            'name' => $name,
            'questiontext' => $questiontext,
            'answers' => $answers,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $question = $DB->get_record('question', ['id' => $params['question_id']], '*', MUST_EXIST);

        $changes = [];

        // 1. Update question row in place.
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
        if (count($update) > 2) { // more than just id + timemodified
            $DB->update_record('question', (object)$update);
        }

        // 2. Optional answers update.
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
                $up = ['id' => $row->id];
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
                    $answerChanges[] = ['index' => $idx, 'answer_id' => (int)$row->id, 'fields' => array_diff(array_keys($up), ['id'])];
                }
            }
        }

        // 3. Purge caches so in-flight quiz attempts pick up the new content.
        if (class_exists('\\core\\cache_helper')) {
            \core\cache_helper::purge_by_event('changesinquestions');
        } else if (class_exists('\\cache_helper')) {
            \cache_helper::purge_by_event('changesinquestions');
        }

        return [
            'question_id' => (int)$question->id,
            'name' => $params['name'] !== '' ? $params['name'] : $question->name,
            'question_fields_changed' => $changes,
            'answers_updated' => $answerChanges,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'question_id' => new external_value(PARAM_INT, 'question.id'),
            'name' => new external_value(PARAM_TEXT, 'Current question name after update'),
            'question_fields_changed' => new external_multiple_structure(
                new external_value(PARAM_TEXT, 'Field name that was updated')
            ),
            'answers_updated' => new external_multiple_structure(
                new external_single_structure([
                    'index' => new external_value(PARAM_INT, '0-based index'),
                    'answer_id' => new external_value(PARAM_INT, 'question_answers.id'),
                    'fields' => new external_multiple_structure(
                        new external_value(PARAM_TEXT, 'Field name')
                    ),
                ])
            ),
        ]);
    }
}
