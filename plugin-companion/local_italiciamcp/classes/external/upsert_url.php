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
 * Upsert a mod_url in a course section using a stable idnumber as the key.
 *
 * Mirrors the shape of `upsert_page`: find-or-create by idnumber, update
 * name/intro/externalurl/visibility in place when the cm already exists,
 * create a new mod_url attached to the given section number otherwise.
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_url extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'    => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum'  => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'    => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the module'),
            'name'        => new external_value(PARAM_TEXT, 'Module display name'),
            'externalurl' => new external_value(PARAM_URL,  'Target URL the student will be sent to'),
            'intro'       => new external_value(PARAM_RAW,  'Short description / intro HTML', VALUE_DEFAULT, ''),
            'display'     => new external_value(PARAM_INT,  'Display mode (0 auto, 1 embed, 2 open, 5 new)', VALUE_DEFAULT, 0),
            'visible'     => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
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
        string $externalurl,
        string $intro,
        int $display,
        int $visible
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'    => $courseid,
            'sectionnum'  => $sectionnum,
            'idnumber'    => $idnumber,
            'name'        => $name,
            'externalurl' => $externalurl,
            'intro'       => $intro,
            'display'     => $display,
            'visible'     => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_italiciamcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }
        if ($params['externalurl'] === '') {
            throw new \moodle_exception('externalurlempty', 'local_italiciamcp', '', null,
                'externalurl parameter is required and must be non-empty');
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

        $urlid = (int)$existing->instance;
        if ($urlid <= 0) {
            throw new \moodle_exception('noinstance', 'local_italiciamcp', '', null,
                "course_module {$existing->id} has no mod_url instance");
        }

        $update = (object)[
            'id'           => $urlid,
            'name'         => $params['name'],
            'intro'        => $params['intro'],
            'introformat'  => FORMAT_HTML,
            'externalurl'  => $params['externalurl'],
            'display'      => (int)$params['display'],
            'timemodified' => time(),
        ];
        $DB->update_record('url', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $urlid,
            'url'        => (new moodle_url('/mod/url/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/course/lib.php');

        // 1. Insert mod_url instance.
        $url = new \stdClass();
        $url->course         = (int)$course->id;
        $url->name           = $params['name'];
        $url->intro          = $params['intro'];
        $url->introformat    = FORMAT_HTML;
        $url->externalurl    = $params['externalurl'];
        $url->display        = (int)$params['display'];
        $url->displayoptions = serialize([]);
        $url->parameters     = serialize([]);
        $url->timemodified   = time();
        $url->id             = $DB->insert_record('url', $url);

        // 2. Look up module type id.
        $moduletype = $DB->get_record('modules', ['name' => 'url'], 'id', MUST_EXIST);

        // 3. Create course_module row.
        $cm = new \stdClass();
        $cm->course              = (int)$course->id;
        $cm->module              = (int)$moduletype->id;
        $cm->instance            = (int)$url->id;
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

        if (!$params['visible']) {
            set_coursemodule_visible($cm->id, 0);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'created',
            'cmid'       => (int)$cm->id,
            'instanceid' => (int)$url->id,
            'url'        => (new moodle_url('/mod/url/view.php', ['id' => $cm->id]))->out(false),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'url.id (mod_url instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL in Moodle'),
        ]);
    }
}
