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
