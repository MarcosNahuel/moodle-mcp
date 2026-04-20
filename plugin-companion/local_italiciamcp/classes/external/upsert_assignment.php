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
require_once($CFG->libdir . '/resourcelib.php');

/**
 * Upsert a mod_assign in a course section using a stable idnumber as the key.
 *
 * Mirrors upsert_page / upsert_url: find-or-create by idnumber, update
 * name/intro/duedate/grade/visibility in place when the cm already exists,
 * create a new mod_assign attached to the given section number otherwise.
 *
 * Only the fields most relevant to a language-teaching assignment are
 * exposed; other columns are seeded with Moodle defaults. If the
 * operator needs to tweak e.g. `teamsubmission`, they can still do it
 * via `ws_raw` + core_course_edit_module or via the Moodle UI.
 *
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_assignment extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'                 => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum'               => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'                 => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the module'),
            'name'                     => new external_value(PARAM_TEXT, 'Assignment display name'),
            'intro'                    => new external_value(PARAM_RAW,  'Description HTML shown to students', VALUE_DEFAULT, ''),
            'duedate'                  => new external_value(PARAM_INT,  'Unix timestamp for due date (0 = no due date)', VALUE_DEFAULT, 0),
            'allowsubmissionsfromdate' => new external_value(PARAM_INT,  'Unix timestamp when submissions open (0 = immediately)', VALUE_DEFAULT, 0),
            'cutoffdate'               => new external_value(PARAM_INT,  'Unix timestamp after which no submissions are accepted (0 = no cutoff)', VALUE_DEFAULT, 0),
            'grade'                    => new external_value(PARAM_INT,  'Max grade (positive = point scale, 0 = no grading, negative = scale id)', VALUE_DEFAULT, 100),
            'visible'                  => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
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
        string $intro,
        int $duedate,
        int $allowsubmissionsfromdate,
        int $cutoffdate,
        int $grade,
        int $visible
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'                 => $courseid,
            'sectionnum'               => $sectionnum,
            'idnumber'                 => $idnumber,
            'name'                     => $name,
            'intro'                    => $intro,
            'duedate'                  => $duedate,
            'allowsubmissionsfromdate' => $allowsubmissionsfromdate,
            'cutoffdate'               => $cutoffdate,
            'grade'                    => $grade,
            'visible'                  => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_italiciamcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        $existing = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
        ]);

        if ($existing) {
            return self::update_existing($course, $existing, $params);
        }
        return self::create_new($course, $params);
    }

    private static function update_existing(
        \stdClass $course,
        \stdClass $existing,
        array $params
    ): array {
        global $DB;

        $assignid = (int)$existing->instance;
        if ($assignid <= 0) {
            throw new \moodle_exception('noinstance', 'local_italiciamcp', '', null,
                "course_module {$existing->id} has no mod_assign instance");
        }

        $update = (object)[
            'id'                       => $assignid,
            'name'                     => $params['name'],
            'intro'                    => $params['intro'],
            'introformat'              => FORMAT_HTML,
            'duedate'                  => (int)$params['duedate'],
            'allowsubmissionsfromdate' => (int)$params['allowsubmissionsfromdate'],
            'cutoffdate'               => (int)$params['cutoffdate'],
            'grade'                    => (int)$params['grade'],
            'timemodified'             => time(),
        ];
        $DB->update_record('assign', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $assignid,
            'url'        => (new moodle_url('/mod/assign/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/course/lib.php');

        // 1. Insert mod_assign instance with seeded defaults.
        $assign = new \stdClass();
        $assign->course                      = (int)$course->id;
        $assign->name                        = $params['name'];
        $assign->intro                       = $params['intro'];
        $assign->introformat                 = FORMAT_HTML;
        $assign->alwaysshowdescription       = 1;
        $assign->submissiondrafts            = 0;
        $assign->sendnotifications           = 0;
        $assign->sendlatenotifications       = 0;
        $assign->sendstudentnotifications    = 1;
        $assign->duedate                     = (int)$params['duedate'];
        $assign->allowsubmissionsfromdate    = (int)$params['allowsubmissionsfromdate'];
        $assign->cutoffdate                  = (int)$params['cutoffdate'];
        $assign->gradingduedate              = 0;
        $assign->grade                       = (int)$params['grade'];
        $assign->timemodified                = time();
        $assign->completionsubmit            = 0;
        $assign->requiresubmissionstatement  = 0;
        $assign->teamsubmission              = 0;
        $assign->requireallteammemberssubmit = 0;
        $assign->teamsubmissiongroupingid    = 0;
        $assign->blindmarking                = 0;
        $assign->hidegrader                  = 0;
        $assign->revealidentities            = 0;
        $assign->attemptreopenmethod         = 'none';
        $assign->maxattempts                 = -1; // unlimited
        $assign->markingworkflow             = 0;
        $assign->markingallocation           = 0;
        $assign->markinganonymous            = 0;
        $assign->preventsubmissionnotingroup = 0;
        $assign->nosubmissions               = 0;
        $assign->activity                    = '';
        $assign->activityformat              = FORMAT_HTML;
        $assign->id = $DB->insert_record('assign', $assign);

        // 2. Look up module type id.
        $moduletype = $DB->get_record('modules', ['name' => 'assign'], 'id', MUST_EXIST);

        // 3. Create course_module row.
        $cm = new \stdClass();
        $cm->course              = (int)$course->id;
        $cm->module              = (int)$moduletype->id;
        $cm->instance            = (int)$assign->id;
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
        if ($params['idnumber'] !== '') {
            $DB->set_field('course_modules', 'idnumber', $params['idnumber'], ['id' => $cm->id]);
        }

        // 4. Attach the cm to the section.
        course_add_cm_to_section($course, $cm->id, (int)$params['sectionnum']);

        // 5. Enable the submission plugins assign needs by default (online text + file).
        // mod_assign reads `assign_plugin_config` on demand; we seed both to
        // match what the UI does when you click "Add assignment".
        self::enable_default_plugins((int)$assign->id);

        if (!$params['visible']) {
            set_coursemodule_visible($cm->id, 0);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'created',
            'cmid'       => (int)$cm->id,
            'instanceid' => (int)$assign->id,
            'url'        => (new moodle_url('/mod/assign/view.php', ['id' => $cm->id]))->out(false),
        ];
    }

    /**
     * Seed the default submission + feedback plugins for a brand-new
     * assignment. Without this, the student has no way to submit.
     */
    private static function enable_default_plugins(int $assignid): void {
        global $DB;

        $configs = [
            ['plugin' => 'onlinetext', 'subtype' => 'assignsubmission', 'name' => 'enabled',   'value' => '1'],
            ['plugin' => 'onlinetext', 'subtype' => 'assignsubmission', 'name' => 'wordlimit', 'value' => '0'],
            ['plugin' => 'file',       'subtype' => 'assignsubmission', 'name' => 'enabled',   'value' => '1'],
            ['plugin' => 'file',       'subtype' => 'assignsubmission', 'name' => 'maxfilesubmissions', 'value' => '3'],
            ['plugin' => 'comments',   'subtype' => 'assignfeedback',   'name' => 'enabled',   'value' => '1'],
        ];
        foreach ($configs as $cfg) {
            $row = (object)array_merge($cfg, ['assignment' => $assignid]);
            $DB->insert_record('assign_plugin_config', $row);
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'assign.id (mod_assign instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL in Moodle'),
        ]);
    }
}
