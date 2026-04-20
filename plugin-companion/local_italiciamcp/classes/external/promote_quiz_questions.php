<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Promote all question_versions linked to a quiz's slots from 'draft' to 'ready'.
 * Use this to repair quizzes whose questions were imported via qformat_gift
 * (which leaves status='draft', causing the quiz attempt to silently fail
 * with "No se han encontrado respuestas").
 */
class promote_quiz_questions extends external_api {

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

        // Find all question_bank_entries referenced by this quiz's slots.
        $qbeids = $DB->get_fieldset_sql(
            "SELECT DISTINCT qr.questionbankentryid
               FROM {quiz_slots} qs
               JOIN {question_references} qr
                 ON qr.itemid = qs.id
                AND qr.component = 'mod_quiz'
                AND qr.questionarea = 'slot'
              WHERE qs.quizid = :quizid",
            ['quizid' => $quizid]
        );

        if (empty($qbeids)) {
            return [
                'cmid'       => (int)$cm->id,
                'quizid'     => $quizid,
                'promoted'   => 0,
                'message'    => 'No question_bank_entries found linked to this quiz.',
            ];
        }

        [$insql, $inparams] = $DB->get_in_or_equal($qbeids, SQL_PARAMS_NAMED, 'qbe');
        $before = $DB->count_records_sql(
            "SELECT COUNT(*) FROM {question_versions}
              WHERE status != 'ready'
                AND questionbankentryid $insql",
            $inparams
        );
        $DB->execute(
            "UPDATE {question_versions} SET status = 'ready' WHERE questionbankentryid $insql",
            $inparams
        );

        return [
            'cmid'     => (int)$cm->id,
            'quizid'   => $quizid,
            'promoted' => (int)$before,
            'message'  => "Promoted {$before} question_versions to status=ready",
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid'     => new external_value(PARAM_INT, 'course_modules.id'),
            'quizid'   => new external_value(PARAM_INT, 'quiz.id'),
            'promoted' => new external_value(PARAM_INT, 'count of rows promoted'),
            'message'  => new external_value(PARAM_TEXT, 'human-readable result'),
        ]);
    }
}
