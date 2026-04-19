<?php
defined('MOODLE_INTERNAL') || die();

/**
 * Serve files uploaded via `local_italiciamcp_upload_file` from the
 * course context's `local_italiciamcp / media` filearea.
 *
 * Enrolled users and managers of the course see the files inline.
 *
 * @param stdClass $course
 * @param stdClass $cm
 * @param context $context
 * @param string $filearea
 * @param array $args [itemid, filepath...], filename]
 * @param bool $forcedownload
 * @param array $options
 * @return bool
 */
function local_italiciamcp_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($filearea !== 'media') {
        return false;
    }

    require_login($course);

    // args: [itemid, filepath...] filename
    $itemid = array_shift($args);
    $filename = array_pop($args);
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';

    $fs = get_file_storage();
    $file = $fs->get_file(
        $context->id,
        'local_italiciamcp',
        'media',
        $itemid,
        $filepath,
        $filename
    );
    if (!$file || $file->is_directory()) {
        send_file_not_found();
    }

    // Default: serve inline for 24 hours of client-side cache.
    send_stored_file($file, 86400, 0, $forcedownload, $options);
}
