import { z } from "zod"
import {
  PLATFORM_ACCESS_KEYS,
  PLATFORM_ACCESS_SOURCES,
  PLATFORM_USER_STATUS_FILTERS,
} from "../constants/enums.js"
import { IsoInstantStringSchema } from "./datetime.js"

export const PlatformNavigationViewSchema = z.strictObject({
  canAccessPlatformModels: z.boolean(),
  canAccessPlatformAccess: z.boolean(),
  canAccessPlatformSkills: z.boolean(),
  canAccessPlatformUsers: z.boolean(),
})
export type PlatformNavigationView = z.infer<
  typeof PlatformNavigationViewSchema
>

export const PlatformAccessGrantInputSchema = z.strictObject({
  userId: z.uuid(),
  accessKey: z.enum(PLATFORM_ACCESS_KEYS),
})
export type PlatformAccessGrantInput = z.infer<
  typeof PlatformAccessGrantInputSchema
>

export const PlatformAccessBindingViewSchema = z.strictObject({
  userId: z.uuid(),
  accessKey: z.enum(PLATFORM_ACCESS_KEYS),
  source: z.enum(PLATFORM_ACCESS_SOURCES),
  assignedByUserId: z.uuid().nullable(),
  createdAt: IsoInstantStringSchema,
  updatedAt: IsoInstantStringSchema,
  userName: z.string().optional(),
  userEmail: z.email().optional(),
  avatarUrl: z.string().nullable().optional(),
})
export type PlatformAccessSource = (typeof PLATFORM_ACCESS_SOURCES)[number]
export type PlatformAccessBindingView = z.infer<
  typeof PlatformAccessBindingViewSchema
>

export const PlatformAccessBindingListViewSchema = z.array(
  PlatformAccessBindingViewSchema
)
export type PlatformAccessBindingListView = z.infer<
  typeof PlatformAccessBindingListViewSchema
>

export const PlatformNoContentSchema = z.undefined()

// ─────────────────────────── Platform users (admin) ───────────────────────────
// Registered-users layer for platform admins (packages/api/src/modules/platform-users).

export const PlatformUserListQuerySchema = z.object({
  // Case-insensitive substring match over email OR name.
  search: z.string().trim().min(1).max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PLATFORM_USER_STATUS_FILTERS).default("active"),
})
export type PlatformUserListQuery = z.input<typeof PlatformUserListQuerySchema>
export type PlatformUserListParsedQuery = z.output<
  typeof PlatformUserListQuerySchema
>

export const PlatformUserViewSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: IsoInstantStringSchema,
  deletedAt: IsoInstantStringSchema.nullable(),
  suspendedAt: IsoInstantStringSchema.nullable(),
  workspaceCount: z.number().int().min(0),
  agentRuns7d: z.number().int().min(0),
  lastSuccessAt: IsoInstantStringSchema.nullable(),
})
export type PlatformUserView = z.infer<typeof PlatformUserViewSchema>

export const PlatformUserListViewSchema = z.strictObject({
  users: z.array(PlatformUserViewSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
})
export type PlatformUserListView = z.infer<typeof PlatformUserListViewSchema>
