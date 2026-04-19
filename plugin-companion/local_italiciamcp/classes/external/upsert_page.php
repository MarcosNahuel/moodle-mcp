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
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->libdir . '/resourcelib.php');

/**
 * Upsert a mod_page in a course section using a stable idnumber as the key.
 *
 * - If a course_module with matching idnumber already exists in the course,
 *   its name/intro/content/visibility are updated in place.
 * - Otherwise, a new mod_page is created via add_moduleinfo() and its
 *   idnumber is written to course_modules.
 *
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_page extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'   => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the module'),
            'name'       => new external_value(PARAM_TEXT, 'Module display name'),
            'intro'      => new external_value(PARAM_RAW,  'Short description / intro HTML', VALUE_DEFAULT, ''),
            'content'    => new external_value(PARAM_RAW,  'Main body HTML content'),
            'visible'    => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
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
        string $content,
        int $visible
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'idnumber'   => $idnumber,
            'name'       => $name,
            'intro'      => $intro,
            'content'    => $content,
            'visible'    => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_italiciamcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        // Lookup existing module by idnumber (scoped to this course).
        $existing = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
        ]);

        if ($existing) {
            return self::update_existing($course, $existing, $params);
        }
        return self::create_new($course, $params);
    }

    /**
     * Update the mod_page behind an existing course_module.
     * Uses a minimal update object to avoid round-tripping all columns
     * through $DB->update_record (which in some schemas has trouble
     * re-writing columns read back as strings).
     */
    private static function update_existing(
        \stdClass $course,
        \stdClass $existing,
        array $params
    ): array {
        global $DB;

        $pageid = (int)$existing->instance;
        if ($pageid <= 0) {
            throw new \moodle_exception('noinstance', 'local_italiciamcp', '', null,
                "course_module {$existing->id} has no mod_page instance");
        }

        $update = (object)[
            'id'            => $pageid,
            'name'          => $params['name'],
            'intro'         => $params['intro'],
            'introformat'   => FORMAT_HTML,
            'content'       => $params['content'],
            'contentformat' => FORMAT_HTML,
            'timemodified'  => time(),
        ];
        $DB->update_record('page', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $pageid,
            'url'        => (new moodle_url('/mod/page/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    /**
     * Create a new mod_page using low-level Moodle helpers.
     *
     * We avoid `add_moduleinfo()` because it runs through the course form
     * stack and expects many derived fields to be present (completion,
     * availability, grade). For this plugin we only need the minimum
     * viable path: insert a `page` row, register a `course_modules` row,
     * attach it to the course section, and purge caches.
     */
    private static function create_new(\stdClass $course, array $params): array {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/course/lib.php');

        // 1. Insert mod_page instance.
        $page = new \stdClass();
        $page->course         = (int)$course->id;
        $page->name           = $params['name'];
        $page->intro          = $params['intro'];
        $page->introformat    = FORMAT_HTML;
        $page->content        = $params['content'];
        $page->contentformat  = FORMAT_HTML;
        $page->legacyfiles    = 0;
        $page->legacyfileslast = null;
        $page->display        = RESOURCELIB_DISPLAY_AUTO;
        $page->displayoptions = serialize(['printheading' => 1, 'printintro' => 0, 'printlastmodified' => 1]);
        $page->revision       = 1;
        $page->timemodified   = time();
        $page->id             = $DB->insert_record('page', $page);

        // 2. Look up the `page` module type id.
        $moduletype = $DB->get_record('modules', ['name' => 'page'], 'id', MUST_EXIST);

        // 3. Create the course_module row (without section yet).
        $cm = new \stdClass();
        $cm->course              = (int)$course->id;
        $cm->module              = (int)$moduletype->id;
        $cm->instance            = (int)$page->id;
        $cm->section             = 0; // placeholder, set by course_add_cm_to_section
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

        // 4. Attach the cm to the section (by number, 0..numsections).
        course_add_cm_to_section($course, $cm->id, (int)$params['sectionnum']);

        // 5. Optional: disable visibility if needed (add_course_module copies from $cm).
        if (!$params['visible']) {
            set_coursemodule_visible($cm->id, 0);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'created',
            'cmid'       => (int)$cm->id,
            'instanceid' => (int)$page->id,
            'url'        => (new moodle_url('/mod/page/view.php', ['id' => $cm->id]))->out(false),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'page.id (mod_page instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL'),
        ]);
    }
}
