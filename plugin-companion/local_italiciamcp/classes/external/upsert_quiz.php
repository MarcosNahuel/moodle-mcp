<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;
use moodle_url;

global $CFG;
require_once($CFG->dirroot . '/course/lib.php');

/**
 * Create or update a mod_quiz shell (no questions). Questions are imported
 * separately via GIFT in a future plugin function; here we just manage the
 * quiz wrapper: name, intro HTML, attempts, time limit, visibility, etc.
 *
 * Idempotent by idnumber: re-calling with the same idnumber updates fields
 * in place; cmid and instanceid stay stable.
 */
class upsert_quiz extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'    => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum'  => new external_value(PARAM_INT,  'Section number (0 = general)'),
            'idnumber'    => new external_value(PARAM_TEXT, 'Stable idnumber'),
            'name'        => new external_value(PARAM_TEXT, 'Quiz display name'),
            'intro'       => new external_value(PARAM_RAW,  'Quiz intro / description HTML', VALUE_DEFAULT, ''),
            'timeopen'    => new external_value(PARAM_INT,  'Unix ts when quiz opens (0 = no restriction)', VALUE_DEFAULT, 0),
            'timeclose'   => new external_value(PARAM_INT,  'Unix ts when quiz closes (0 = none)', VALUE_DEFAULT, 0),
            'timelimit'   => new external_value(PARAM_INT,  'Seconds limit per attempt (0 = unlimited)', VALUE_DEFAULT, 0),
            'attempts'    => new external_value(PARAM_INT,  'Max attempts per student (0 = unlimited)', VALUE_DEFAULT, 0),
            'grademethod' => new external_value(PARAM_INT,  '1 highest 2 average 3 first 4 last', VALUE_DEFAULT, 1),
            'grade'       => new external_value(PARAM_FLOAT, 'Max grade', VALUE_DEFAULT, 10.0),
            'visible'     => new external_value(PARAM_INT,  '1 visible 0 hidden', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * @return array{action: string, cmid: int, instanceid: int, url: string}
     */
    public static function execute(
        int $courseid,
        int $sectionnum,
        string $idnumber,
        string $name,
        string $intro = '',
        int $timeopen = 0,
        int $timeclose = 0,
        int $timelimit = 0,
        int $attempts = 0,
        int $grademethod = 1,
        float $grade = 10.0,
        int $visible = 1
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid, 'sectionnum' => $sectionnum, 'idnumber' => $idnumber,
            'name' => $name, 'intro' => $intro, 'timeopen' => $timeopen, 'timeclose' => $timeclose,
            'timelimit' => $timelimit, 'attempts' => $attempts, 'grademethod' => $grademethod,
            'grade' => $grade, 'visible' => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_italiciamcp', '', null,
                'idnumber required');
        }

        $existing = $DB->get_record('course_modules', [
            'course' => $course->id, 'idnumber' => $params['idnumber'],
        ]);

        if ($existing) {
            return self::update_existing($course, $existing, $params);
        }
        return self::create_new($course, $params);
    }

    private static function update_existing(\stdClass $course, \stdClass $existing, array $params): array {
        global $DB;

        $quizid = (int)$existing->instance;
        if ($quizid <= 0) {
            throw new \moodle_exception('noinstance', 'local_italiciamcp', '', null,
                "course_module {$existing->id} has no quiz instance");
        }

        $update = (object)[
            'id'            => $quizid,
            'name'          => $params['name'],
            'intro'         => $params['intro'],
            'introformat'   => FORMAT_HTML,
            'timeopen'      => $params['timeopen'],
            'timeclose'     => $params['timeclose'],
            'timelimit'     => $params['timelimit'],
            'attempts'      => $params['attempts'],
            'grademethod'   => $params['grademethod'],
            'grade'         => $params['grade'],
            'timemodified'  => time(),
        ];
        $DB->update_record('quiz', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }
        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $quizid,
            'url'        => (new moodle_url('/mod/quiz/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB;

        // 1. Insert mod_quiz instance with sensible defaults for the fields
        //    we do not expose through this function.
        $quiz = new \stdClass();
        $quiz->course               = (int)$course->id;
        $quiz->name                 = $params['name'];
        $quiz->intro                = $params['intro'];
        $quiz->introformat          = FORMAT_HTML;
        $quiz->timeopen             = (int)$params['timeopen'];
        $quiz->timeclose            = (int)$params['timeclose'];
        $quiz->timelimit            = (int)$params['timelimit'];
        $quiz->overduehandling      = 'autosubmit';
        $quiz->graceperiod          = 0;
        $quiz->preferredbehaviour   = 'deferredfeedback';
        $quiz->canredoquestions     = 0;
        $quiz->attempts             = (int)$params['attempts'];
        $quiz->attemptonlast        = 0;
        $quiz->grademethod          = (int)$params['grademethod'];
        $quiz->decimalpoints        = 2;
        $quiz->questiondecimalpoints = -1;
        $quiz->reviewattempt        = 69888;
        $quiz->reviewcorrectness    = 4352;
        $quiz->reviewmarks          = 4352;
        $quiz->reviewspecificfeedback = 4352;
        $quiz->reviewgeneralfeedback = 4352;
        $quiz->reviewrightanswer    = 4352;
        $quiz->reviewoverallfeedback = 4352;
        $quiz->questionsperpage     = 1;
        $quiz->navmethod            = 'free';
        $quiz->shuffleanswers       = 1;
        $quiz->sumgrades            = 0;
        $quiz->grade                = (float)$params['grade'];
        $quiz->timecreated          = time();
        $quiz->timemodified         = time();
        $quiz->password             = '';
        $quiz->subnet               = '';
        $quiz->browsersecurity      = '-';
        $quiz->delay1               = 0;
        $quiz->delay2               = 0;
        $quiz->showuserpicture      = 0;
        $quiz->showblocks           = 0;
        $quiz->completionattemptsexhausted = 0;
        $quiz->completionminattempts = 0;
        $quiz->allowofflineattempts = 0;
        $quiz->id                   = $DB->insert_record('quiz', $quiz);

        // 1b. Create the default quiz_sections row. Without this, attempts
        // fail with noquestionsfound because the layout builder needs at
        // least one section to materialize pages from quiz_slots.
        $section = new \stdClass();
        $section->quizid           = (int)$quiz->id;
        $section->firstslot        = 1;
        $section->heading          = '';
        $section->shufflequestions = 0;
        $DB->insert_record('quiz_sections', $section);

        // 2. Get module type id.
        $moduletype = $DB->get_record('modules', ['name' => 'quiz'], 'id', MUST_EXIST);

        // 3. Create course_module row.
        $cm = new \stdClass();
        $cm->course              = (int)$course->id;
        $cm->module              = (int)$moduletype->id;
        $cm->instance            = (int)$quiz->id;
        $cm->section             = 0;
        $cm->added               = time();
        $cm->score               = 0;
        $cm->idnumber            = $params['idnumber'];
        $cm->visible             = (int)$params['visible'];
        $cm->visibleoncoursepage = 1;
        $cm->visibleold          = (int)$params['visible'];
        $cm->groupmode           = 0;
        $cm->groupingid          = 0;
        $cm->completion          = 0;
        $cm->completiongradeitemnumber = null;
        $cm->completionview      = 0;
        $cm->completionexpected  = 0;
        $cm->showdescription     = 0;
        $cm->availability        = null;
        $cm->deletioninprogress  = 0;
        $cm->id = add_course_module($cm);
        // Moodle 5.x add_course_module() does not always persist idnumber; force it.
        if ($params['idnumber'] !== '') {
            $DB->set_field('course_modules', 'idnumber', $params['idnumber'], ['id' => $cm->id]);
        }

        // 4. Add to section.
        course_add_cm_to_section($course, $cm->id, (int)$params['sectionnum']);

        if (!$params['visible']) {
            set_coursemodule_visible($cm->id, 0);
        }
        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'created',
            'cmid'       => (int)$cm->id,
            'instanceid' => (int)$quiz->id,
            'url'        => (new moodle_url('/mod/quiz/view.php', ['id' => $cm->id]))->out(false),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'quiz.id'),
            'url'        => new external_value(PARAM_URL,   'Module view URL'),
        ]);
    }
}
