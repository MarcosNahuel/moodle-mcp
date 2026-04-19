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
 * Delete a course module identified by its idnumber.
 *
 * Idempotent: returns `{ action: 'noop' }` if the idnumber is not found.
 */
class delete_module_by_idnumber extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT,  'Course ID'),
            'idnumber' => new external_value(PARAM_TEXT, 'idnumber of the module to delete'),
        ]);
    }

    /**
     * @return array{action: string, cmid: int|null}
     */
    public static function execute(int $courseid, string $idnumber): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'idnumber' => $idnumber,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_italiciamcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        $cm = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
        ]);

        if (!$cm) {
            return ['action' => 'noop', 'cmid' => null];
        }

        course_delete_module($cm->id);
        rebuild_course_cache($course->id, true);

        return ['action' => 'deleted', 'cmid' => (int)$cm->id];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'deleted or noop'),
            'cmid'   => new external_value(PARAM_INT,   'course_modules.id (null if noop)', VALUE_REQUIRED, null, NULL_ALLOWED),
        ]);
    }
}
