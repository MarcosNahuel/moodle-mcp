<?php
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_italiciamcp_upsert_page' => [
        'classname'    => 'local_italiciamcp\\external\\upsert_page',
        'methodname'   => 'execute',
        'description'  => 'Create or update a mod_page in a course section, keyed by a stable idnumber',
        'type'         => 'write',
        'capabilities' => 'moodle/course:manageactivities',
        'ajax'         => true,
    ],
    'local_italiciamcp_delete_module_by_idnumber' => [
        'classname'    => 'local_italiciamcp\\external\\delete_module_by_idnumber',
        'methodname'   => 'execute',
        'description'  => 'Delete a course module identified by its idnumber',
        'type'         => 'write',
        'capabilities' => 'moodle/course:manageactivities',
        'ajax'         => true,
    ],
];

// We intentionally do not register a pre-built external service here.
// The admin adds these functions to the existing `moodle-mcp` service
// manually (same flow as with `local_wsmanagesections`).
