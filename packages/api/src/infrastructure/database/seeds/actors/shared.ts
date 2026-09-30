import {
  normalizeActorDocs,
  textBlocks,
  type ActorDocInput,
  type ActorRole,
} from "@synapse/shared"

export const OFFICIAL_ACTOR_TEMPLATE_VERSION = "1.0.0"
export const OFFICIAL_ACTOR_TEMPLATE_FAMILY = "official-role-library"
export const OFFICIAL_ACTOR_LAUNCH_COLLECTION = "official-roles-v1"

export type SeedActorProfile = {
  displayName: string
  role: ActorRole
  title: string
  avatarFileId?: string
  avatarEmoji?: string
  canRepresentUser: boolean
  docs: ReturnType<typeof normalizeActorDocs>
  specialties: string[]
  config: Record<string, unknown>
}

export type ActorCatalogRefs = {
  slug: string
  actorItemId: string
  actorVersionId: string
  actor: SeedActorProfile
}

export type RuntimeRefs = {
  actorIds: string[]
  chiefActorId: string
}

export type OfficialActorCatalogSeedResult = {
  actorRefs: ActorCatalogRefs[]
  defaultActorRefs: ActorCatalogRefs
}

type BuildActorDocsInput = {
  slug: string
  identity: string
  publicPersona?: string
  soul?: string[]
  selfNarrative?: string
  originStory?: string
  relationship: string
  relationshipWithTeam?: string
  representationGuidelines?: string
  socialProtocol?: string
  mission: string
  roleCharter: string
  workDoctrine: string[]
  limitations?: string
  routines?: string[]
  conversationExample?: string
  extraDocs?: ActorDocInput[]
}

export type OfficialActorTemplateSeed = {
  slug: string
  displayName: string
  summary: string
  longDescription: string
  tags: string[]
  actor: SeedActorProfile
  itemMetadata: Record<string, unknown>
  versionMetadata: Record<string, unknown>
  actorMetadata: Record<string, unknown>
  setupGuide: ReturnType<typeof textBlocks>
  releaseNotes: ReturnType<typeof textBlocks>
}

type CreateOfficialActorTemplateInput = {
  lane: string
  tone: string
  featured?: boolean
  fictionalizedArchetype?: boolean
  slug: string
  displayName: string
  summary: string
  longDescription: string
  tags: string[]
  templateRevision?: string
  actor: {
    displayName: string
    role: ActorRole
    title: string
    avatarEmoji?: string
    canRepresentUser: boolean
    specialties: string[]
    config?: Record<string, unknown>
  }
  docs: Omit<BuildActorDocsInput, "slug">
  setupGuide: string
  releaseNotes?: string
}

export type BuiltInRoleTemplateInput = {
  slug: string
  displayName: string
  summary: string
  longDescription: string
  tags: string[]
  lane: string
  tone: string
  featured?: boolean
  templateRevision?: string
  actor: {
    displayName: string
    role: ActorRole
    title: string
    avatarEmoji?: string
    canRepresentUser?: boolean
    specialties: string[]
    config?: Record<string, unknown>
  }
  vibe: string
  identity: string
  relationship: string
  collaboration: string
  mission: string
  roleCharter: string
  workDoctrine: string[]
  principles?: string[]
  socialProtocol?: string
  representationGuidelines?: string
  limitations?: string
  routines?: string[]
  conversationExample?: string
  setupGuide: string
  releaseNotes?: string
}

export type ImportedBuiltInRoleTemplateInput = {
  slug: string
  displayName: string
  lane: string
  tone: string
  featured?: boolean
  templateRevision?: string
  tags: string[]
  actor: {
    displayName: string
    role: ActorRole
    title?: string
    canRepresentUser?: boolean
    specialties: string[]
  }
  source: {
    description: string
    vibe?: string
    emoji?: string
    color?: string
    userQuery?: string
    authoritativeRoleMarkdown: string
  }
}

export type CollaborationRoleTemplateInput = BuiltInRoleTemplateInput

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter((value): value is T => Boolean(value))
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  )
}

function bulletList(lines: string[]) {
  return lines.map((line) => `- ${line}`).join("\n")
}

function markdownSection(title: string, body?: string | null) {
  const trimmed = body?.trim()
  if (!trimmed) {
    return ""
  }
  return `## ${title}\n${trimmed}`
}

function defaultRepresentationGuidelines(title: string) {
  return [
    `When you state positions, commitments, budgets, timelines, or external confirmations on the user's behalf as the ${title}, draft from known facts first and ask the user to confirm at each key commitment.`,
    "Do not make decisions for the user beyond the scope of explicit authorization.",
  ].join("\n\n")
}

export function buildActorDocs(input: BuildActorDocsInput) {
  const soulContent = input.soul?.length
    ? markdownSection("Core Principles", bulletList(input.soul))
    : ""

  return normalizeActorDocs(
    compact<ActorDocInput>([
      {
        id: `${input.slug}:identity-card`,
        key: "identity_card",
        title: "Identity Card",
        content: textBlocks(input.identity),
        visibility: "always",
        priority: 120,
      },
      input.publicPersona
        ? {
            id: `${input.slug}:public-persona`,
            key: "public_persona",
            title: "Public Persona",
            content: textBlocks(input.publicPersona),
            visibility: "always",
            priority: 115,
          }
        : undefined,
      soulContent
        ? {
            id: `${input.slug}:soul`,
            key: "soul",
            title: "Soul",
            content: textBlocks(soulContent),
            visibility: "always",
            priority: 110,
          }
        : undefined,
      input.selfNarrative
        ? {
            id: `${input.slug}:self-narrative`,
            key: "self_narrative",
            title: "Self Narrative",
            content: textBlocks(input.selfNarrative),
            visibility: "always",
            priority: 105,
          }
        : undefined,
      input.originStory
        ? {
            id: `${input.slug}:origin-story`,
            key: "origin_story",
            title: "Origin Story",
            content: textBlocks(input.originStory),
            visibility: "internal_only",
            priority: 100,
          }
        : undefined,
      {
        id: `${input.slug}:relationship-with-user`,
        key: "relationship_with_user",
        title: "Relationship With User",
        content: textBlocks(input.relationship),
        visibility: "always",
        priority: 98,
      },
      input.relationshipWithTeam
        ? {
            id: `${input.slug}:relationship-with-team`,
            key: "relationship_with_team",
            title: "Relationship With Team",
            content: textBlocks(input.relationshipWithTeam),
            visibility: "multi_member_only",
            priority: 96,
          }
        : undefined,
      input.representationGuidelines
        ? {
            id: `${input.slug}:representation-guidelines`,
            key: "representation_guidelines",
            title: "Representation Guidelines",
            content: textBlocks(input.representationGuidelines),
            visibility: "internal_only",
            priority: 94,
          }
        : undefined,
      input.socialProtocol
        ? {
            id: `${input.slug}:social-protocol`,
            key: "social_protocol",
            title: "Social Protocol",
            content: textBlocks(input.socialProtocol),
            visibility: "multi_member_only",
            priority: 92,
          }
        : undefined,
      {
        id: `${input.slug}:role-charter`,
        key: "role_charter",
        title: "Role Charter",
        content: textBlocks(input.roleCharter),
        visibility: "always",
        priority: 90,
      },
      {
        id: `${input.slug}:mission`,
        key: "mission",
        title: "Mission",
        content: textBlocks(input.mission),
        visibility: "always",
        priority: 88,
      },
      {
        id: `${input.slug}:work-doctrine`,
        key: "work_doctrine",
        title: "Work Doctrine",
        content: textBlocks(bulletList(input.workDoctrine)),
        visibility: "always",
        priority: 86,
      },
      input.limitations
        ? {
            id: `${input.slug}:limitations-and-escalation`,
            key: "limitations_and_escalation",
            title: "Limitations And Escalation",
            content: textBlocks(input.limitations),
            visibility: "always",
            priority: 84,
          }
        : undefined,
      input.routines?.length
        ? {
            id: `${input.slug}:routines`,
            key: "routines",
            title: "Routines",
            content: textBlocks(bulletList(input.routines)),
            visibility: "internal_only",
            priority: 80,
          }
        : undefined,
      input.conversationExample
        ? {
            id: `${input.slug}:conversation-examples`,
            key: "conversation_examples",
            title: "Conversation Examples",
            content: textBlocks(input.conversationExample),
            visibility: "internal_only",
            priority: 78,
          }
        : undefined,
      ...(input.extraDocs || []),
    ])
  )
}

export function createOfficialActorTemplateSeed(
  input: CreateOfficialActorTemplateInput
): OfficialActorTemplateSeed {
  const templateRevision = input.templateRevision || "v1"
  const sharedMetadata = {
    lane: input.lane,
    tone: input.tone,
    featured: input.featured === true,
    fictionalizedArchetype: input.fictionalizedArchetype === true,
    launchCollection: OFFICIAL_ACTOR_LAUNCH_COLLECTION,
    templateFamily: OFFICIAL_ACTOR_TEMPLATE_FAMILY,
    templateRevision,
  }

  return {
    slug: input.slug,
    displayName: input.displayName,
    summary: input.summary,
    longDescription: input.longDescription,
    tags: uniqueStrings(input.tags),
    actor: {
      displayName: input.actor.displayName,
      role: input.actor.role,
      title: input.actor.title,
      avatarEmoji: input.actor.avatarEmoji,
      canRepresentUser: input.actor.canRepresentUser,
      docs: buildActorDocs({
        slug: input.slug,
        ...input.docs,
      }),
      specialties: uniqueStrings(input.actor.specialties),
      config: input.actor.config || {},
    },
    itemMetadata: sharedMetadata,
    versionMetadata: sharedMetadata,
    actorMetadata: sharedMetadata,
    setupGuide: textBlocks(input.setupGuide),
    releaseNotes: textBlocks(
      input.releaseNotes ||
        "Initial release of this official built-in role template."
    ),
  }
}

export function createBuiltInRoleTemplateSeed(input: BuiltInRoleTemplateInput) {
  return createOfficialActorTemplateSeed({
    lane: input.lane,
    tone: input.tone,
    featured: input.featured,
    slug: input.slug,
    displayName: input.displayName,
    summary: input.summary,
    longDescription: input.longDescription,
    tags: input.tags,
    templateRevision: input.templateRevision,
    actor: {
      displayName: input.actor.displayName,
      role: input.actor.role,
      title: input.actor.title,
      avatarEmoji: input.actor.avatarEmoji,
      canRepresentUser: input.actor.canRepresentUser === true,
      specialties: input.actor.specialties,
      config: input.actor.config || {},
    },
    docs: {
      identity: input.identity,
      publicPersona: input.vibe,
      soul: input.principles,
      selfNarrative: input.identity,
      relationship: input.relationship,
      relationshipWithTeam: input.collaboration,
      representationGuidelines:
        input.representationGuidelines ||
        (input.actor.canRepresentUser
          ? defaultRepresentationGuidelines(input.actor.title)
          : undefined),
      socialProtocol: input.socialProtocol,
      mission: input.mission,
      roleCharter: input.roleCharter,
      workDoctrine: input.workDoctrine,
      limitations: input.limitations,
      routines: input.routines,
      conversationExample: input.conversationExample,
    },
    setupGuide: input.setupGuide,
    releaseNotes: input.releaseNotes,
  })
}

export function createImportedBuiltInRoleTemplateSeed(
  input: ImportedBuiltInRoleTemplateInput
) {
  const title = input.actor.title || input.displayName

  return createOfficialActorTemplateSeed({
    lane: input.lane,
    tone: input.tone,
    featured: input.featured,
    slug: input.slug,
    displayName: input.displayName,
    summary: input.source.description,
    longDescription: input.source.description,
    tags: input.tags,
    templateRevision: input.templateRevision,
    actor: {
      displayName: input.actor.displayName,
      role: input.actor.role,
      title,
      canRepresentUser: input.actor.canRepresentUser === true,
      specialties: input.actor.specialties,
      config: {
        accent_color: input.source.color,
      },
    },
    docs: {
      identity: `You are ${input.displayName}. ${input.source.description}`,
      publicPersona: input.source.vibe,
      selfNarrative:
        "The current role document fully defines your professional boundaries, methodology, quality standards, and expression focus. Do not water it down into a generic job summary.",
      relationship: input.source.userQuery
        ? `Users typically summon you for scenarios like: ${input.source.userQuery}`
        : `When users need the expertise of a ${input.displayName}, they come to you directly.`,
      representationGuidelines:
        input.actor.canRepresentUser === true
          ? defaultRepresentationGuidelines(title)
          : undefined,
      mission: `Acting as ${input.displayName}, faithfully execute the duties, methods, and quality standards defined in the current role document.`,
      roleCharter:
        "Treat the current role document as authoritative. Do not silently drop key rules, methodology, success criteria, or professional boundaries.",
      workDoctrine: [
        "Read and follow the current role document first.",
        "Preserve the workflows, taboos, success criteria, and communication style defined in the role.",
        "If the role document conflicts with global system rules, system rules set the upper bound; keep everything else consistent.",
      ],
      conversationExample: input.source.userQuery,
      extraDocs: compact<ActorDocInput>([
        {
          id: `${input.slug}:authoritative-role-prompt`,
          key: "custom",
          title: "Role Manual",
          content: textBlocks(input.source.authoritativeRoleMarkdown),
          visibility: "always",
          priority: 112,
        },
        input.source.userQuery
          ? {
              id: `${input.slug}:source-user-query`,
              key: "custom",
              title: "Source User Query",
              content: textBlocks(input.source.userQuery),
              visibility: "internal_only",
              priority: 77,
            }
          : undefined,
      ]),
    },
    setupGuide: `After installation, the full role manual for ${input.displayName} is used.`,
    releaseNotes: "Updated to the full role-manual version.",
  })
}

const DEFAULT_COLLABORATION_ROLE_RELEASE_NOTES =
  "Rewritten as an official role template for Synappse-style group collaboration, replacing the old imported long-prompt structure."

export function createCollaborationRoleTemplateSeed(
  input: CollaborationRoleTemplateInput
) {
  return createBuiltInRoleTemplateSeed({
    ...input,
    tags: uniqueStrings(input.tags),
    templateRevision: input.templateRevision || "collaboration-v2",
    actor: {
      ...input.actor,
      specialties: uniqueStrings(input.actor.specialties),
    },
    releaseNotes:
      input.releaseNotes || DEFAULT_COLLABORATION_ROLE_RELEASE_NOTES,
  })
}
