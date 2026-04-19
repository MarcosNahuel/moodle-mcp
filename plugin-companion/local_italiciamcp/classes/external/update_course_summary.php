<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Update the summary (description) of a course. Supports HTML with inline
 * styles so the MCP can brand the course cover page from a markdown source.
 */
class update_course_summary extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT,  'Course ID'),
            'summary' => new external_value(PARAM_RAW,  'HTML summary / description'),
            'summaryformat' => new external_value(PARAM_INT, 'Format id (default FORMAT_HTML=1)', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * @return array{action: string, courseid: int}
     */
    public static function execute(int $courseid, string $summary, int $summaryformat = 1): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'summary' => $summary,
            'summaryformat' => $summaryformat,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:update', $context);

        $update = (object)[
            'id' => $course->id,
            'summary' => $params['summary'],
            'summaryformat' => $params['summaryformat'],
            'timemodified' => time(),
        ];
        $DB->update_record('course', $update);

        // Course summary changes invalidate the course cache.
        rebuild_course_cache($course->id, true);

        return [
            'action' => 'updated',
            'courseid' => (int)$course->id,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'updated'),
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
        ]);
    }
}
