import { describe, it, expect } from 'vitest';
import {
  SiteInfoResponseSchema,
  CoursesByFieldResponseSchema,
  CourseContentsResponseSchema,
  EnrolledUsersResponseSchema,
  FileUploadResponseSchema,
  moodleBool,
} from '../../src/schemas/moodle-responses.js';

describe('moodleBool', () => {
  it('maps 0 to false', () => {
    expect(moodleBool.parse(0)).toBe(false);
  });
  it('maps 1 to true', () => {
    expect(moodleBool.parse(1)).toBe(true);
  });
  it('passes boolean through', () => {
    expect(moodleBool.parse(true)).toBe(true);
    expect(moodleBool.parse(false)).toBe(false);
  });
  it('rejects other numbers and strings', () => {
    expect(() => moodleBool.parse(2)).toThrow();
    expect(() => moodleBool.parse('1')).toThrow();
  });
});

describe('SiteInfoResponseSchema', () => {
  it('parses a realistic response', () => {
    const raw = {
      sitename: 'Aula Italicia',
      username: 'moodle-mcp-bot',
      userid: 7,
      siteurl: 'https://aula.italicia.com',
      release: '5.0.2+ (Build: 20250315)',
      version: '2024100700.02',
      functions: [
        { name: 'core_course_get_courses', version: '3.0' },
        { name: 'core_files_upload' },
      ],
      extraField: 'ignored-but-kept',
    };
    const parsed = SiteInfoResponseSchema.parse(raw);
    expect(parsed.sitename).toBe('Aula Italicia');
    expect(parsed.functions).toHaveLength(2);
    expect((parsed as unknown as { extraField: string }).extraField).toBe(
      'ignored-but-kept',
    );
  });

  it('defaults functions to empty array', () => {
    const parsed = SiteInfoResponseSchema.parse({
      sitename: 'x',
      username: 'x',
      userid: 1,
      siteurl: 'https://x',
      release: 'x',
      version: 'x',
    });
    expect(parsed.functions).toEqual([]);
  });
});

describe('CoursesByFieldResponseSchema', () => {
  it('parses a courses list with mixed visible representations', () => {
    const parsed = CoursesByFieldResponseSchema.parse({
      courses: [
        {
          id: 42,
          fullname: 'Italiano A1',
          shortname: 'ITA-A1',
          format: 'topics',
          startdate: 1700000000,
          visible: 1,
          idnumber: '',
        },
        {
          id: 43,
          fullname: 'Portugues A1',
          shortname: 'PT-A1',
          visible: true,
        },
      ],
      warnings: [],
    });
    expect(parsed.courses[0]!.visible).toBe(true);
    expect(parsed.courses[1]!.visible).toBe(true);
  });

  it('rejects non-numeric course id', () => {
    expect(() =>
      CoursesByFieldResponseSchema.parse({ courses: [{ id: 'x', fullname: 'a', shortname: 'b' }] }),
    ).toThrow();
  });
});

describe('CourseContentsResponseSchema', () => {
  it('parses sections with nested modules', () => {
    const parsed = CourseContentsResponseSchema.parse([
      {
        id: 1,
        name: 'Unidad 1',
        section: 1,
        summary: '',
        summaryformat: 1,
        visible: 1,
        modules: [
          {
            id: 100,
            name: 'Introducción',
            modname: 'page',
            instance: 200,
            visible: 1,
            idnumber: 'mcp:abcd',
          },
        ],
      },
      {
        id: 2,
        name: 'Unidad 2',
        section: 2,
        visible: 0,
        modules: [],
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.modules[0]!.modname).toBe('page');
    expect(parsed[0]!.visible).toBe(true);
    expect(parsed[1]!.visible).toBe(false);
    expect(parsed[1]!.summary).toBe('');
  });

  it('defaults modules to empty array when absent', () => {
    const parsed = CourseContentsResponseSchema.parse([
      { id: 1, name: 'x', section: 1 },
    ]);
    expect(parsed[0]!.modules).toEqual([]);
  });
});

describe('EnrolledUsersResponseSchema', () => {
  it('parses a users list with roles', () => {
    const parsed = EnrolledUsersResponseSchema.parse([
      {
        id: 1,
        fullname: 'Alicia',
        username: 'alicia',
        roles: [{ roleid: 3, shortname: 'editingteacher', name: 'Teacher' }],
      },
      {
        id: 2,
        fullname: 'Student One',
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.roles[0]!.shortname).toBe('editingteacher');
    expect(parsed[1]!.roles).toEqual([]);
  });
});

describe('FileUploadResponseSchema', () => {
  it('parses the minimal happy-path shape', () => {
    const parsed = FileUploadResponseSchema.parse({
      itemid: 12345,
      filename: 'img-1.png',
    });
    expect(parsed.itemid).toBe(12345);
  });

  it('rejects when itemid is missing', () => {
    expect(() => FileUploadResponseSchema.parse({})).toThrow();
  });
});
