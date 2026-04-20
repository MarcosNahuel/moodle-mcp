<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Ensure the given quiz has a default quiz_sections row (firstslot=1).
 * Without it, the attempt layout builder produces an empty pagelayout
 * and attempts fail with "noquestionsfound" even though quiz_slots and
 * question_references are populated correctly.
 *
 * This heals quizzes created by upsert_quiz v0.3.5..v0.3.7 which skipped
 * the sections row insert. Idempotent: if a row exists, does nothing.
 */
class repair_quiz_sections extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'course_modules.id of the quiz'),
        ]);
    }

    public static function execute(int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        $cm = $DB->get_record('course_modules', ['id' => $params['cmid']], '*', MUST_EXIST);
        $context = context_course::instance($cm->course);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $moduletype = $DB->get_record('modules', ['id' => $cm->module], 'name', MUST_EXIST);
        if ($moduletype->name !== 'quiz') {
            throw new \moodle_exception('notaquiz', 'local_italiciamcp', '', null,
                "cm is not a quiz (it's {$moduletype->name})");
        }

        $quizid = (int)$cm->instance;
        $existing = $DB->get_record('quiz_sections', [
            'quizid'    => $quizid,
            'firstslot' => 1,
        ]);

        if ($existing) {
            return [
                'cmid'    => (int)$cm->id,
                'quizid'  => $quizid,
                'created' => false,
                'message' => "quiz_sections row already exists (id={$existing->id})",
            ];
        }

        $section = new \stdClass();
        $section->quizid           = $quizid;
        $section->firstslot        = 1;
        $section->heading          = '';
        $section->shufflequestions = 0;
        $sectionid = $DB->insert_record('quiz_sections', $section);

        return [
            'cmid'    => (int)$cm->id,
            'quizid'  => $quizid,
            'created' => true,
            'message' => "inserted quiz_sections row id={$sectionid}",
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid'    => new external_value(PARAM_INT, 'course_modules.id'),
            'quizid'  => new external_value(PARAM_INT, 'quiz.id'),
            'created' => new external_value(PARAM_BOOL, 'whether a new row was inserted'),
            'message' => new external_value(PARAM_TEXT, 'human-readable result'),
        ]);
    }
}
