import { z } from 'zod';

/**
 * Zod schemas for the handful of Moodle Web Services responses this MCP
 * consumes in v0.1. They pin down the fields we actually read; everything
 * else passes through via `.passthrough()` so Moodle minor-version drift
 * does not break our parsing.
 *
 * Docs: https://docs.moodle.org/dev/Web_service_API_functions
 */

/** Moodle encodes booleans as 0 / 1 on most endpoints but some use real booleans. */
export const moodleBool = z
  .union([z.literal(0), z.literal(1), z.boolean()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 1));

// --- core_webservice_get_site_info ---

export const SiteInfoFunctionSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
  })
  .passthrough();

export const SiteInfoResponseSchema = z
  .object({
    sitename: z.string(),
    username: z.string(),
    userid: z.number(),
    siteurl: z.string(),
    release: z.string(),
    version: z.string(),
    functions: z.array(SiteInfoFunctionSchema).default([]),
  })
  .passthrough();

export type SiteInfoResponse = z.infer<typeof SiteInfoResponseSchema>;

// --- core_course_get_courses_by_field ---

export const CourseSchema = z
  .object({
    id: z.number(),
    fullname: z.string(),
    shortname: z.string(),
    categoryid: z.number().optional(),
    format: z.string().optional(),
    startdate: z.number().optional(),
    enddate: z.number().optional(),
    visible: moodleBool.optional(),
    idnumber: z.string().optional(),
  })
  .passthrough();

export type Course = z.infer<typeof CourseSchema>;

export const CoursesByFieldResponseSchema = z
  .object({
    courses: z.array(CourseSchema),
    warnings: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type CoursesByFieldResponse = z.infer<typeof CoursesByFieldResponseSchema>;

// --- core_course_get_contents ---

export const ModuleSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    modname: z.string(),
    instance: z.number().optional(),
    visible: moodleBool.optional(),
    uservisible: z.boolean().optional(),
    idnumber: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export type Module = z.infer<typeof ModuleSchema>;

export const SectionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    section: z.number(),
    summary: z.string().optional().default(''),
    summaryformat: z.number().optional(),
    visible: moodleBool.optional(),
    uservisible: z.boolean().optional(),
    hiddenbynumsections: z.number().optional(),
    modules: z.array(ModuleSchema).default([]),
  })
  .passthrough();

export type Section = z.infer<typeof SectionSchema>;

export const CourseContentsResponseSchema = z.array(SectionSchema);
export type CourseContentsResponse = z.infer<typeof CourseContentsResponseSchema>;

// --- core_enrol_get_enrolled_users ---

export const EnrolledUserRoleSchema = z
  .object({
    roleid: z.number(),
    name: z.string().optional(),
    shortname: z.string(),
    sortorder: z.number().optional(),
  })
  .passthrough();

export const EnrolledUserSchema = z
  .object({
    id: z.number(),
    username: z.string().optional(),
    firstname: z.string().optional(),
    lastname: z.string().optional(),
    fullname: z.string(),
    email: z.string().optional(),
    roles: z.array(EnrolledUserRoleSchema).default([]),
  })
  .passthrough();

export type EnrolledUser = z.infer<typeof EnrolledUserSchema>;

export const EnrolledUsersResponseSchema = z.array(EnrolledUserSchema);
export type EnrolledUsersResponse = z.infer<typeof EnrolledUsersResponseSchema>;

// --- core_files_upload ---

export const FileUploadResponseSchema = z
  .object({
    itemid: z.number(),
    filename: z.string().optional(),
    filearea: z.string().optional(),
    filepath: z.string().optional(),
    component: z.string().optional(),
    contextid: z.number().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;

// --- Known teacher/manager role shortnames used when we need to count docentes ---

export const TEACHER_ROLE_SHORTNAMES = new Set([
  'editingteacher',
  'teacher',
  'manager',
]);
