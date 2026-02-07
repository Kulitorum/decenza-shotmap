import { z } from 'zod';

/** Maximum string lengths */
const MAX_CITY = 100;
const MAX_PROFILE = 200;
const MAX_SOFTWARE_NAME = 100;
const MAX_VERSION = 50;
const MAX_MODEL = 100;
const MAX_IDEMPOTENCY_KEY = 64;

/** Normalize string: trim whitespace, collapse multiple spaces */
function normalizeString(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Shot event input schema */
export const shotEventInputSchema = z.object({
  ts: z.number().int().positive().optional(),
  city: z.string()
    .min(1, 'city is required')
    .max(MAX_CITY, `city must be at most ${MAX_CITY} characters`)
    .transform(normalizeString),
  country_code: z.string()
    .length(2, 'country_code must be 2 characters (ISO 3166-1 alpha-2)')
    .toUpperCase()
    .optional(),
  profile: z.string()
    .min(1, 'profile is required')
    .max(MAX_PROFILE, `profile must be at most ${MAX_PROFILE} characters`)
    .transform(normalizeString),
  software_name: z.string()
    .min(1, 'software_name is required')
    .max(MAX_SOFTWARE_NAME, `software_name must be at most ${MAX_SOFTWARE_NAME} characters`)
    .transform(normalizeString),
  software_version: z.string()
    .min(1, 'software_version is required')
    .max(MAX_VERSION, `software_version must be at most ${MAX_VERSION} characters`)
    .transform(normalizeString),
  machine_model: z.string()
    .min(1, 'machine_model is required')
    .max(MAX_MODEL, `machine_model must be at most ${MAX_MODEL} characters`)
    .transform(normalizeString),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  idempotency_key: z.string()
    .max(MAX_IDEMPOTENCY_KEY, `idempotency_key must be at most ${MAX_IDEMPOTENCY_KEY} characters`)
    .optional(),
});

export type ValidatedShotInput = z.infer<typeof shotEventInputSchema>;

/** WebSocket message schema */
export const wsMessageSchema = z.object({
  action: z.enum(['subscribe', 'unsubscribe', 'ping']),
  filters: z.object({
    country_code: z.string().length(2).toUpperCase().optional(),
  }).optional(),
});

export type ValidatedWsMessage = z.infer<typeof wsMessageSchema>;

/** Validate and parse shot event input */
export function validateShotInput(data: unknown): {
  success: true;
  data: ValidatedShotInput;
} | {
  success: false;
  error: string;
} {
  const result = shotEventInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join('; ') };
}

/** Validate WebSocket message */
export function validateWsMessage(data: unknown): {
  success: true;
  data: ValidatedWsMessage;
} | {
  success: false;
  error: string;
} {
  const result = wsMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join('; ') };
}

/** Maximum string lengths for crash report */
const MAX_VERSION_CR = 50;
const MAX_DEVICE = 100;
const MAX_CRASH_LOG = 50000;
const MAX_USER_NOTES = 2000;
const MAX_DEBUG_LOG = 10000;

/** Crash report input schema */
export const crashReportInputSchema = z.object({
  version: z.string()
    .min(1, 'version is required')
    .max(MAX_VERSION_CR, `version must be at most ${MAX_VERSION_CR} characters`)
    .transform(normalizeString),
  platform: z.enum(['android', 'ios', 'windows', 'macos', 'linux']),
  device: z.string()
    .max(MAX_DEVICE, `device must be at most ${MAX_DEVICE} characters`)
    .transform(normalizeString)
    .optional(),
  crash_log: z.string()
    .min(1, 'crash_log is required')
    .max(MAX_CRASH_LOG, `crash_log must be at most ${MAX_CRASH_LOG} characters`),
  user_notes: z.string()
    .max(MAX_USER_NOTES, `user_notes must be at most ${MAX_USER_NOTES} characters`)
    .optional(),
  debug_log_tail: z.string()
    .max(MAX_DEBUG_LOG, `debug_log_tail must be at most ${MAX_DEBUG_LOG} characters`)
    .optional(),
});

export type ValidatedCrashReportInput = z.infer<typeof crashReportInputSchema>;

/** Validate crash report input */
export function validateCrashReportInput(data: unknown): {
  success: true;
  data: ValidatedCrashReportInput;
} | {
  success: false;
  error: string;
} {
  const result = crashReportInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join('; ') };
}

// ============ Library ============

const MAX_LIBRARY_TYPE = 50;
const MAX_LIBRARY_TAG = 50;
const MAX_LIBRARY_TAGS = 20;
const MAX_LIBRARY_APP_VERSION = 50;
const MAX_LIBRARY_DATA_SIZE = 102400; // 100KB

/** Library entry input schema */
export const libraryEntryInputSchema = z.object({
  version: z.number().int().min(1).max(100),
  type: z.string()
    .min(1, 'type is required')
    .max(MAX_LIBRARY_TYPE)
    .transform(normalizeString),
  tags: z.array(
    z.string().max(MAX_LIBRARY_TAG).transform(normalizeString)
  ).max(MAX_LIBRARY_TAGS).default([]),
  appVersion: z.string()
    .min(1, 'appVersion is required')
    .max(MAX_LIBRARY_APP_VERSION)
    .transform(normalizeString),
  data: z.record(z.unknown()).refine(
    (d) => JSON.stringify(d).length <= MAX_LIBRARY_DATA_SIZE,
    `data must be at most ${MAX_LIBRARY_DATA_SIZE} bytes when serialized`
  ),
});

export type ValidatedLibraryEntryInput = z.infer<typeof libraryEntryInputSchema>;

/** Validate library entry input */
export function validateLibraryEntryInput(data: unknown): {
  success: true;
  data: ValidatedLibraryEntryInput;
} | {
  success: false;
  error: string;
} {
  const result = libraryEntryInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join('; ') };
}

/** Library flag input schema */
export const libraryFlagInputSchema = z.object({
  reason: z.enum(['inappropriate', 'spam', 'broken']),
});

export type ValidatedLibraryFlagInput = z.infer<typeof libraryFlagInputSchema>;

/** Validate library flag input */
export function validateLibraryFlagInput(data: unknown): {
  success: true;
  data: ValidatedLibraryFlagInput;
} | {
  success: false;
  error: string;
} {
  const result = libraryFlagInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join('; ') };
}
