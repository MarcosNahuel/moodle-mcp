<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

global $CFG;
require_once($CFG->dirroot . '/course/lib.php');

/**
 * Delete a course module by its course_modules.id (cmid).
 * Complements delete_module_by_idnumber for modules that were created
 * before v0.3.5 (and thus have empty idnumber) or via native Moodle UI.
 */
class delete_module_by_cmid extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'course_modules.id to delete'),
        ]);
    }

    public static function execute(int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        $cm = $DB->get_record('course_modules', ['id' => $params['cmid']], '*', MUST_EXIST);
        $context = context_course::instance($cm->course);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        course_delete_module($cm->id);

        return [
            'deleted' => true,
            'cmid'    => (int)$cm->id,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'deleted' => new external_value(PARAM_BOOL, 'Whether deletion succeeded'),
            'cmid'    => new external_value(PARAM_INT,  'The cmid that was deleted'),
        ]);
    }
}
