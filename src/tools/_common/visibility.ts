import type { MoodleClient } from '../../client/moodle-client.js';

/**
 * Toggle section visibility via `core_course_edit_section`.
 *
 * @param sectionid Moodle section primary key (NOT `section` number).
 */
export async function setSectionVisibility(
  client: MoodleClient,
  sectionid: number,
  visible: boolean,
): Promise<void> {
  await client.call('core_course_edit_section', {
    action: visible ? 'show' : 'hide',
    id: sectionid,
    sectionreturn: 0,
  });
}

/**
 * Toggle a module (cmid) visibility.
 */
export async function setModuleVisibility(
  client: MoodleClient,
  cmid: number,
  visible: boolean,
): Promise<void> {
  await client.call('core_course_edit_module', {
    action: visible ? 'show' : 'hide',
    id: cmid,
    sectionreturn: 0,
  });
}
