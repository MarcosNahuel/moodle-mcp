<?php
// This file is part of Moodle - http://moodle.org/
//
// Italicia MCP — local plugin that exposes the WS functions the
// `@nahuelalbornoz/moodle-mcp` npm package needs to create/update mod_page
// modules by a stable `idnumber` key.
//
// Designed to work alongside `local_wsmanagesections` (sections) so the
// MCP can publish a FichaClase end-to-end without manual clicking.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_italiciamcp';
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = 'v0.3.5';
$plugin->version   = 2026041923;
$plugin->requires  = 2022041900; // Moodle 4.0+
$plugin->supported = [400, 501]; // Moodle 4.0 to 5.1
