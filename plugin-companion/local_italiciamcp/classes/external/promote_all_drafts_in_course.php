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
 * Promote every `question_versions.status = 'draft'` row inside the
 * question bank entries that belong to ANY quiz in a given course
 * to `status = 'ready'`.
 *
 * Why this exists: when a teacher edits a question in Moodle 4.5+/5.x,
 * Moodle creates a NEW version in `status=draft` — the `ready` version
 * the quiz slot points to stays untouched. The UI then redraws the
 * edit form using the latest `ready` version, making it look like the
 * edit didn't persist. Running this endpoint promotes those orphan
 * drafts so the next page load of the edit form shows the new content
 * and the quiz slot sees the latest text.
 *
 * Scope: restricted to quizzes inside the course to avoid accidentally
 * promoting drafts the teacher left in flight elsewhere.
 *
 * See `italiacia_whatsapp/moodle/decisiones-y-lecciones.md` L13 for the
 * full bug post-mortem.
 */
class promote_all_drafts_in_course extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID whose quizzes own the question bank entries to scan'),
        ]);
    }

    /**
     * @return array{
     *   courseid: int,
     *   quizzes_scanned: int,
     *   drafts_found: int,
     *   promoted: int,
     *   per_quiz: array
     * }
     */
    public static function execute(int $courseid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), ['courseid' => $courseid]);
        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // 1. All quiz module instances in the course.
        $quizzes = $DB->get_records_sql(
            "SELECT cm.id AS cmid, q.id AS quizid, q.name
               FROM {course_modules} cm
               JOIN {modules} m    ON m.id = cm.module AND m.name = 'quiz'
               JOIN {quiz} q       ON q.id = cm.instance
              WHERE cm.course = :courseid",
            ['courseid' => $course->id]
        );

        $perQuiz = [];
        $totalDrafts = 0;
        $totalPromoted = 0;

        foreach ($quizzes as $quiz) {
            // 2. For this quiz, find all question_bank_entries referenced by slots.
            $qbeids = $DB->get_fieldset_sql(
                "SELECT DISTINCT qr.questionbankentryid
                   FROM {quiz_slots} qs
                   JOIN {question_references} qr
                     ON qr.itemid = qs.id
                    AND qr.component = :comp
                    AND qr.questionarea = :qarea
                  WHERE qs.quizid = :quizid",
                ['comp' => 'mod_quiz', 'qarea' => 'slot', 'quizid' => $quiz->quizid]
            );

            $perQuiz[$quiz->quizid] = [
                'cmid' => (int)$quiz->cmid,
                'quizid' => (int)$quiz->quizid,
                'name' => $quiz->name,
                'qbes' => count($qbeids),
                'drafts_found' => 0,
                'promoted' => 0,
            ];

            if (empty($qbeids)) {
                continue;
            }

            // 3. Find draft versions for those qbes.
            list($insql, $inparams) = $DB->get_in_or_equal($qbeids, SQL_PARAMS_NAMED, 'qbe');
            $drafts = $DB->get_records_sql(
                "SELECT id, questionbankentryid, version, status
                   FROM {question_versions}
                  WHERE questionbankentryid {$insql}
                    AND status = 'draft'",
                $inparams
            );

            $perQuiz[$quiz->quizid]['drafts_found'] = count($drafts);
            $totalDrafts += count($drafts);

            if (empty($drafts)) {
                continue;
            }

            // 4. Promote each draft to ready.
            $promotedHere = 0;
            foreach ($drafts as $d) {
                $DB->set_field('question_versions', 'status', 'ready', ['id' => $d->id]);
                $promotedHere++;
            }
            $perQuiz[$quiz->quizid]['promoted'] = $promotedHere;
            $totalPromoted += $promotedHere;
        }

        // Purge caches so the quiz slot picks the new latest-ready version.
        if (class_exists('\\core\\cache_helper')) {
            \core\cache_helper::purge_by_event('changesinquestions');
        } else if (class_exists('\\cache_helper')) {
            \cache_helper::purge_by_event('changesinquestions');
        }

        return [
            'courseid' => (int)$course->id,
            'quizzes_scanned' => count($quizzes),
            'drafts_found' => $totalDrafts,
            'promoted' => $totalPromoted,
            'per_quiz' => array_values($perQuiz),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'quizzes_scanned' => new external_value(PARAM_INT, 'Number of quiz module instances inspected'),
            'drafts_found' => new external_value(PARAM_INT, 'Total draft versions found across quizzes'),
            'promoted' => new external_value(PARAM_INT, 'Total versions set to ready'),
            'per_quiz' => new external_multiple_structure(
                new external_single_structure([
                    'cmid' => new external_value(PARAM_INT, 'course_modules.id'),
                    'quizid' => new external_value(PARAM_INT, 'quiz.id'),
                    'name' => new external_value(PARAM_TEXT, 'Quiz name'),
                    'qbes' => new external_value(PARAM_INT, 'Number of question bank entries referenced by slots'),
                    'drafts_found' => new external_value(PARAM_INT, 'Draft versions found in this quiz'),
                    'promoted' => new external_value(PARAM_INT, 'Versions promoted in this quiz'),
                ])
            ),
        ]);
    }
}
