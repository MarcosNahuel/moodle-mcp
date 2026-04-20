<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;
use context_module;
use moodle_url;

global $CFG;
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/gift/format.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');
require_once($CFG->libdir . '/questionlib.php');

/**
 * Import a block of GIFT-formatted questions into a course's question bank
 * and append them as slots to an existing mod_quiz identified by idnumber.
 *
 * Idempotency model: by design this APPENDS. Callers that want to replace
 * questions should first delete the quiz (delete_module_by_idnumber) and
 * recreate via upsert_quiz. A `replace` flag could be added later; for the
 * v0.3.3 launch we keep the surface minimal so Alicia can add preguntas
 * incrementally from the WhatsApp bot flow.
 */
class add_questions_gift extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'       => new external_value(PARAM_INT,  'Course ID'),
            'quizidnumber'   => new external_value(PARAM_TEXT, 'idnumber of the quiz course_module (empty if using cmid)',
                                                   VALUE_DEFAULT, ''),
            'cmid'           => new external_value(PARAM_INT,  'course_modules.id of the quiz (alternative to idnumber)',
                                                   VALUE_DEFAULT, 0),
            'gift'           => new external_value(PARAM_RAW,  'GIFT-formatted text with 1+ questions'),
            'category_name'  => new external_value(PARAM_TEXT, 'Question bank category name (created if missing)',
                                                   VALUE_DEFAULT, 'MCP Import'),
            'default_mark'   => new external_value(PARAM_FLOAT, 'Default mark per question', VALUE_DEFAULT, 1.0),
        ]);
    }

    /**
     * @return array{action:string, cmid:int, quizid:int, imported:int, questionids:int[], url:string}
     */
    public static function execute(
        int $courseid,
        string $quizidnumber = '',
        int $cmid = 0,
        string $gift = '',
        string $category_name = 'MCP Import',
        float $default_mark = 1.0
    ): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'      => $courseid,
            'quizidnumber'  => $quizidnumber,
            'cmid'          => $cmid,
            'gift'          => $gift,
            'category_name' => $category_name,
            'default_mark'  => $default_mark,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);
        require_capability('moodle/question:add', $context);

        if (trim($params['quizidnumber']) === '' && (int)$params['cmid'] <= 0) {
            throw new \moodle_exception('identifierrequired', 'local_italiciamcp', '', null,
                'Either quizidnumber or cmid is required');
        }
        if (trim($params['gift']) === '') {
            throw new \moodle_exception('giftempty', 'local_italiciamcp', '', null,
                'gift text required');
        }

        // Resolve the quiz: prefer explicit cmid, fall back to idnumber.
        if ((int)$params['cmid'] > 0) {
            $cm = $DB->get_record('course_modules', [
                'id'     => (int)$params['cmid'],
                'course' => $course->id,
            ], '*', MUST_EXIST);
        } else {
            $cm = $DB->get_record('course_modules', [
                'course'   => $course->id,
                'idnumber' => $params['quizidnumber'],
            ], '*', MUST_EXIST);
        }
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);

        // Ensure the module type is quiz.
        $moduletype = $DB->get_record('modules', ['id' => $cm->module], 'name', MUST_EXIST);
        if ($moduletype->name !== 'quiz') {
            throw new \moodle_exception('notaquiz', 'local_italiciamcp', '', null,
                "resolved module is not a quiz (it's {$moduletype->name})");
        }

        // Moodle 5.x requires question categories to live in CONTEXT_MODULE.
        // Use the quiz's own module context so questions belong to that quiz
        // and show up in its per-quiz question bank.
        $modulecontext = context_module::instance($cm->id);
        $category = self::ensure_category($modulecontext, $params['category_name']);

        // Write GIFT text to a temp file (qformat_gift reads from disk).
        $tmpdir = make_request_directory();
        $tmpfile = $tmpdir . '/import.gift';
        file_put_contents($tmpfile, $params['gift']);

        // Configure and run the GIFT importer.
        $qformat = new \qformat_gift();
        $qformat->setCategory($category);
        $qformat->setContexts([$modulecontext]);
        $qformat->setCourse($course);
        $qformat->setFilename($tmpfile);
        $qformat->setRealfilename('import.gift');
        $qformat->setMatchgrades('nearest');
        $qformat->setCatfromfile(false);
        $qformat->setContextfromfile(false);
        $qformat->setStoponerror(true);

        // Capture qformat_gift output (HTML status + any errors) into a buffer
        // so it can be inspected — but DO NOT discard silently on error.
        ob_start();
        $preok = $qformat->importpreprocess();
        $procok = $preok ? $qformat->importprocess() : false;
        $importoutput = ob_get_clean();

        if (!$preok) {
            throw new \moodle_exception('importpreprocessfailed', 'local_italiciamcp', '', null,
                "qformat_gift->importpreprocess() returned false. Output: " . substr($importoutput, 0, 500));
        }
        if (!$procok) {
            throw new \moodle_exception('importprocessfailed', 'local_italiciamcp', '', null,
                "qformat_gift->importprocess() returned false. Output: " . substr($importoutput, 0, 500));
        }

        // Collect the question ids created by this import.
        $importedids = is_array($qformat->questionids ?? null) ? $qformat->questionids : [];
        $importedids = array_values(array_map('intval', $importedids));

        if (empty($importedids)) {
            throw new \moodle_exception('noquestionsimported', 'local_italiciamcp', '', null,
                "GIFT parser returned zero questions. Check GIFT syntax. Output: " . substr($importoutput, 0, 500));
        }

        // VERIFY: each imported qid must exist in `question` table with a
        // corresponding `question_versions` + `question_bank_entries` record.
        // If not, quiz_add_quiz_question will create slots referencing nothing
        // and the quiz attempt will fail with "No se han encontrado respuestas".
        $verified = [];
        $orphans = [];
        foreach ($importedids as $qid) {
            $q = $DB->get_record('question', ['id' => $qid], 'id,name,qtype');
            if (!$q) {
                $orphans[] = $qid;
                continue;
            }
            // Find the question_versions row for this question.
            $qv = $DB->get_record_sql(
                "SELECT qv.id, qv.questionbankentryid, qv.version
                   FROM {question_versions} qv
                  WHERE qv.questionid = :qid
               ORDER BY qv.version DESC",
                ['qid' => $qid],
                IGNORE_MULTIPLE
            );
            if (!$qv) {
                $orphans[] = $qid;
                continue;
            }
            // Confirm the bank entry exists.
            $qbe = $DB->get_record('question_bank_entries', ['id' => $qv->questionbankentryid]);
            if (!$qbe) {
                $orphans[] = $qid;
                continue;
            }
            $verified[] = $qid;
        }

        if (!empty($orphans)) {
            throw new \moodle_exception(
                'importverificationfailed',
                'local_italiciamcp', '', null,
                "qformat_gift reported " . count($importedids) . " ids but " . count($orphans)
                . " are orphans (no question_versions or question_bank_entries). Orphan qids: "
                . implode(',', $orphans) . ". Verified: " . count($verified)
                . ". This means GIFT import wrote to question table but not to modern Moodle bank schema."
            );
        }

        // CRITICAL Moodle 5 fix: qformat_gift->importprocess() creates
        // question_versions rows with status='draft'. The quiz attempt engine
        // filters slots to version where status='ready'. With status='draft'
        // the attempt silently fails with "No se han encontrado respuestas".
        // Force status='ready' on all imported versions.
        if (!empty($verified)) {
            [$insql, $inparams] = $DB->get_in_or_equal($verified, SQL_PARAMS_NAMED, 'qid');
            $DB->execute(
                "UPDATE {question_versions} SET status = :ready WHERE questionid $insql",
                array_merge(['ready' => 'ready'], $inparams)
            );
        }

        // Attach each VERIFIED question to the quiz as a new slot.
        // quiz_add_quiz_question in Moodle 5.x creates the question_references row.
        foreach ($verified as $qid) {
            quiz_add_quiz_question((int)$qid, $quiz, 0, (float)$params['default_mark']);
        }

        // Post-verify: every new quiz_slot row must have a question_references row.
        $slotsorphans = $DB->get_records_sql(
            "SELECT qs.id, qs.slot
               FROM {quiz_slots} qs
          LEFT JOIN {question_references} qr
                 ON qr.itemid = qs.id
                AND qr.component = 'mod_quiz'
                AND qr.questionarea = 'slot'
              WHERE qs.quizid = :quizid
                AND qr.id IS NULL",
            ['quizid' => (int)$quiz->id]
        );
        if (!empty($slotsorphans)) {
            throw new \moodle_exception(
                'slotsorphansdetected',
                'local_italiciamcp', '', null,
                "After quiz_add_quiz_question, " . count($slotsorphans)
                . " slots in quiz {$quiz->id} have no question_references. "
                . "Attempts will fail. Slot ids: " . implode(',', array_column($slotsorphans, 'id'))
            );
        }

        // Recompute sumgrades so grade display is correct.
        quiz_update_sumgrades($quiz);

        rebuild_course_cache((int)$course->id, true);

        return [
            'action'      => 'imported',
            'cmid'        => (int)$cm->id,
            'quizid'      => (int)$quiz->id,
            'imported'    => count($verified),
            'questionids' => $verified,
            'url'         => (new moodle_url('/mod/quiz/edit.php', ['cmid' => $cm->id]))->out(false),
        ];
    }

    /**
     * Look up a question category in the course context by name, or create it.
     * Uses the per-course default category as the parent so the new one shows
     * up in the normal bank UI.
     */
    private static function ensure_category(\context $context, string $name): \stdClass {
        global $DB, $USER;

        $existing = $DB->get_record('question_categories', [
            'contextid' => $context->id,
            'name'      => $name,
        ]);
        if ($existing) {
            return $existing;
        }

        // Parent = the default category for this context, or 0 if none yet.
        $parent = $DB->get_record('question_categories', [
            'contextid' => $context->id,
            'parent'    => 0,
        ], 'id', IGNORE_MULTIPLE);
        $parentid = $parent ? (int)$parent->id : 0;

        $cat = new \stdClass();
        $cat->name        = $name;
        $cat->contextid   = $context->id;
        $cat->info        = 'Created by local_italiciamcp (MCP).';
        $cat->infoformat  = FORMAT_HTML;
        $cat->stamp       = make_unique_id_code();
        $cat->parent      = $parentid;
        $cat->sortorder   = 999;
        $cat->idnumber    = null;
        $cat->id = $DB->insert_record('question_categories', $cat);
        return $cat;
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'      => new external_value(PARAM_ALPHA, 'imported'),
            'cmid'        => new external_value(PARAM_INT,   'course_modules.id of the quiz'),
            'quizid'      => new external_value(PARAM_INT,   'quiz.id'),
            'imported'    => new external_value(PARAM_INT,   'number of questions imported'),
            'questionids' => new external_multiple_structure(
                new external_value(PARAM_INT, 'question.id'),
                'Ids of the imported questions'
            ),
            'url'         => new external_value(PARAM_URL,   'quiz edit URL'),
        ]);
    }
}
