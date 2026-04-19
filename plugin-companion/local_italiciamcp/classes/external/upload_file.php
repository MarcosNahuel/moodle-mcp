<?php
namespace local_italiciamcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Upload a binary file (base64-encoded) into a course's files filearea and
 * return its pluginfile URL. Used by the MCP to attach images and audios
 * to mod_page content without needing the `moodle/user:manageownfiles`
 * capability that `core_files_upload` requires on the caller's own draft
 * area.
 *
 * The file is stored in the course context under
 * `component=local_italiciamcp, filearea=media` with a deterministic
 * filename so subsequent calls with the same filename replace in place.
 */
class upload_file extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'       => new external_value(PARAM_INT,  'Course context to own the file'),
            'filename'       => new external_value(PARAM_TEXT, 'File name including extension'),
            'filecontent_b64' => new external_value(PARAM_RAW, 'File content, base64-encoded'),
            'mimetype'       => new external_value(PARAM_TEXT, 'MIME type (e.g., audio/mpeg, image/png)', VALUE_DEFAULT, ''),
        ]);
    }

    /**
     * @return array{url: string, filename: string, filesize: int, contextid: int}
     */
    public static function execute(
        int $courseid,
        string $filename,
        string $filecontent_b64,
        string $mimetype = ''
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'filename' => $filename,
            'filecontent_b64' => $filecontent_b64,
            'mimetype' => $mimetype,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['filename'] === '' || $params['filecontent_b64'] === '') {
            throw new \moodle_exception('invalidparam', 'local_italiciamcp', '', null,
                'filename and filecontent_b64 are required');
        }

        $content = base64_decode($params['filecontent_b64'], true);
        if ($content === false) {
            throw new \moodle_exception('invalidparam', 'local_italiciamcp', '', null,
                'filecontent_b64 is not valid base64');
        }

        $fs = get_file_storage();
        $fileinfo = [
            'contextid' => $context->id,
            'component' => 'local_italiciamcp',
            'filearea'  => 'media',
            'itemid'    => 0,
            'filepath'  => '/',
            'filename'  => $params['filename'],
        ];

        // Delete existing file with same name to get idempotency.
        $existing = $fs->get_file(
            $context->id,
            'local_italiciamcp',
            'media',
            0,
            '/',
            $params['filename']
        );
        if ($existing) {
            $existing->delete();
        }

        $storedfile = $fs->create_file_from_string($fileinfo, $content);

        // Build the pluginfile URL (served publicly without login only if
        // we register a pluginfile callback — for now assume logged-in
        // access, which is the common Moodle default for course content).
        $url = \moodle_url::make_pluginfile_url(
            $storedfile->get_contextid(),
            $storedfile->get_component(),
            $storedfile->get_filearea(),
            $storedfile->get_itemid(),
            $storedfile->get_filepath(),
            $storedfile->get_filename(),
            false  // $forcedownload = false (preview inline when possible)
        )->out(false);

        return [
            'url'       => $url,
            'filename'  => $storedfile->get_filename(),
            'filesize'  => (int)$storedfile->get_filesize(),
            'contextid' => (int)$storedfile->get_contextid(),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'url'       => new external_value(PARAM_URL,  'Public pluginfile URL'),
            'filename'  => new external_value(PARAM_TEXT, 'Stored filename'),
            'filesize'  => new external_value(PARAM_INT,  'Size in bytes'),
            'contextid' => new external_value(PARAM_INT,  'Course context id'),
        ]);
    }
}
