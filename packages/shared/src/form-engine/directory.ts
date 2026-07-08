import { z } from 'zod';

// ── Directory search (form-engine, tenant-scoped) — PRD §6.3 pickers ──────
// Backs the `user-picker`/`project-picker` field types: a lightweight, capped
// search used to populate the renderer's searchable dropdowns. Open to any
// authenticated tenant user (not admin-gated) — unlike the org-masters CRUD
// list endpoints these mirror.

/** Query param that arrives as either a repeated key or a comma-separated string. */
const csvParam = z.preprocess((v) => {
  if (v === undefined) return undefined;
  const values = Array.isArray(v) ? v : [v];
  const flat = values.flatMap((s) => String(s).split(',')).filter(Boolean);
  return flat.length > 0 ? flat : undefined;
}, z.array(z.string()).optional());

export const directoryUsersQuerySchema = z.object({
  search: z.string().optional(),
  /** Role keys (e.g. "hr-head") — matches a field's `pickerConfig.roles`. */
  roles: csvParam,
  /** Department ids — matches a field's `pickerConfig.departments`. */
  departments: csvParam,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DirectoryUsersQuery = z.infer<typeof directoryUsersQuerySchema>;

export const directoryUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export type DirectoryUserDto = z.infer<typeof directoryUserSchema>;

export const directoryUsersResponseSchema = z.object({
  rows: z.array(directoryUserSchema),
});
export type DirectoryUsersResponse = z.infer<typeof directoryUsersResponseSchema>;

export const directoryProjectsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DirectoryProjectsQuery = z.infer<typeof directoryProjectsQuerySchema>;

export const directoryProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type DirectoryProjectDto = z.infer<typeof directoryProjectSchema>;

export const directoryProjectsResponseSchema = z.object({
  rows: z.array(directoryProjectSchema),
});
export type DirectoryProjectsResponse = z.infer<typeof directoryProjectsResponseSchema>;
