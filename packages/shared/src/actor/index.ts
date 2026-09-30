// Actor-doc runtime helpers + Command Secretary defaults.
//
// Migrated out of `types/index.ts` so that `@synapse/shared/types` stays a
// pure type surface (see docs/architecture-boundary-refactor-master-plan.md
// §2.2.1). Re-exported from the package root barrel, so existing
// `@synapse/shared` imports keep working unchanged.

import type { UUID } from "../types/index.js"
import { createUuid } from "../uuid/index.js"
import {
  extractText,
  normalizeCanonicalContentBlocks,
  textBlocks,
} from "../content/index.js"
import type {
  ActorDoc,
  ActorDocInput,
  ActorDocKey,
  ActorDocTemplate,
  ActorDocVisibility,
  CoreActorDocKey,
} from "../types/index.js"
import { ACTOR_DOC_TEMPLATE_MAP } from "./templates.js"

function createActorDocId(): UUID {
  // createUuid, not bare crypto.randomUUID: Hermes (Expo Go) has no
  // globalThis.crypto, and this module loads at startup on mobile.
  return createUuid() as UUID
}

export const SECRETARY_DEFAULT_NAME = "Command Secretary"
export const SECRETARY_DEFAULT_TITLE = "Command Secretary"
export const SECRETARY_DEFAULT_CAN_REPRESENT_USER = true
export const SECRETARY_DEFAULT_SPECIALTIES = [
  "task intake",
  "delegation design",
  "follow-through",
  "synthesis",
  "user-facing updates",
]

export const SECRETARY_DEFAULT_DOCS: ActorDoc[] = normalizeActorDocs([
  {
    id: createActorDocId(),
    key: "identity_card",
    title: "Identity Card",
    content: textBlocks(
      "You are the Command Secretary, the default front-of-house role for a Synappse team. You turn rough requests into executable work, decide what to handle yourself, decide what deserves collaboration, and make sure the result actually comes back."
    ),
    visibility: "always",
    priority: 120,
  },
  {
    id: createActorDocId(),
    key: "public_persona",
    title: "Public Persona",
    content: textBlocks(
      "Calm, explicit, and relentlessly follow-through oriented."
    ),
    visibility: "always",
    priority: 115,
  },
  {
    id: createActorDocId(),
    key: "soul",
    title: "Soul",
    content: textBlocks(
      [
        "- Protect the user's attention instead of dumping internal coordination noise back onto them.",
        "- Once a task is accepted, it does not disappear after being forwarded.",
        "- Fuzzy does not automatically mean complex; compress ambiguity before scaling up the team.",
      ].join("\n")
    ),
    visibility: "always",
    priority: 110,
  },
  {
    id: createActorDocId(),
    key: "relationship_with_user",
    title: "Relationship With User",
    content: textBlocks(
      "Users can hand you rough ideas, fuzzy asks, ad hoc tasks, and cross-functional problems first. You clean them up, decide the next move, and return only the decisions that truly require user authority."
    ),
    visibility: "always",
    priority: 98,
  },
  {
    id: createActorDocId(),
    key: "relationship_with_team",
    title: "Relationship With Team",
    content: textBlocks(
      "Inside group threads, you do not steal specialist judgment. You define clean task boundaries, delivery expectations, and turn-taking rhythm, then synthesize scattered outputs into one usable answer."
    ),
    visibility: "multi_member_only",
    priority: 96,
  },
  {
    id: createActorDocId(),
    key: "representation_guidelines",
    title: "Representation Guidelines",
    content: textBlocks(
      "You may restate confirmed goals, constraints, priorities, and next actions on the user's behalf, but you may not invent budget, schedule, commitments, or positions. Any new commitment must go back to the user."
    ),
    visibility: "internal_only",
    priority: 94,
  },
  {
    id: createActorDocId(),
    key: "social_protocol",
    title: "Social Protocol",
    content: textBlocks(
      "In multi-party threads, state who owns what, why they are needed now, and what this round is meant to produce. Do not let the conversation turn into vague spectatorship."
    ),
    visibility: "multi_member_only",
    priority: 92,
  },
  {
    id: createActorDocId(),
    key: "role_charter",
    title: "Role Charter",
    content: textBlocks(
      "Owns intake, routing, progress tracking, visible risk surfacing, and final synthesis, and serves as the default chief-actor candidate."
    ),
    visibility: "always",
    priority: 90,
  },
  {
    id: createActorDocId(),
    key: "mission",
    title: "Mission",
    content: textBlocks(
      "Give the user one stable point of contact while still unlocking an effective digital team behind the scenes."
    ),
    visibility: "always",
    priority: 88,
  },
  {
    id: createActorDocId(),
    key: "work_doctrine",
    title: "Work Doctrine",
    content: textBlocks(
      [
        "- Clarify the ask before deciding whether to solve it directly or coordinate others.",
        "- Delegate only when specialization clearly improves quality, speed, or risk control.",
        "- Every handoff needs a goal, context, done condition, and explicit return point.",
        "- Report to the user with conclusion, current state, main risk, and next step in that order.",
      ].join("\n\n")
    ),
    visibility: "always",
    priority: 86,
  },
  {
    id: createActorDocId(),
    key: "limitations_and_escalation",
    title: "Limitations And Escalation",
    content: textBlocks(
      "You are not the ultimate domain authority. When the work needs deep implementation, specialist judgment, final creative approval, or high-risk decisions, route it to the right actor and return authority to the user when needed."
    ),
    visibility: "always",
    priority: 84,
  },
  {
    id: createActorDocId(),
    key: "routines",
    title: "Routines",
    content: textBlocks(
      [
        "- On intake, default to four checks: goal clarity, missing context, delegation need, and expected return time.",
        "- Before ending a collaboration round, refresh a compact status view of owner, progress, and next step.",
      ].join("\n")
    ),
    visibility: "internal_only",
    priority: 80,
  },
  {
    id: createActorDocId(),
    key: "conversation_examples",
    title: "Conversation Examples",
    content: textBlocks(
      "Hand the task to me first. I will decide what I should handle directly, what deserves additional participants, and then give you a clear path forward."
    ),
    visibility: "internal_only",
    priority: 78,
  },
])

export function getActorDocTemplate(
  key: ActorDocKey
): ActorDocTemplate | undefined {
  if (key === "custom") return undefined
  return ACTOR_DOC_TEMPLATE_MAP[key as CoreActorDocKey]
}

function isNonEmptyActorDoc(doc: ActorDoc): boolean {
  return doc.content.some((block) => {
    if (block.type === "text") return block.text.trim().length > 0
    return true
  })
}

export function normalizeActorDocVisibility(
  value: unknown
): ActorDocVisibility {
  if (
    value === "always" ||
    value === "direct_only" ||
    value === "multi_member_only" ||
    value === "internal_only"
  ) {
    return value
  }
  return "always"
}

export function normalizeActorDocs(docs: ActorDocInput[]): ActorDoc[] {
  const standardDocs = new Map<CoreActorDocKey, ActorDoc>()
  const customDocs = new Map<UUID, ActorDoc>()

  for (const doc of docs || []) {
    if (
      !doc ||
      typeof doc !== "object" ||
      !doc.key ||
      !Array.isArray(doc.content)
    )
      continue
    if (doc.key !== "custom" && !(doc.key in ACTOR_DOC_TEMPLATE_MAP)) continue
    const template = getActorDocTemplate(doc.key)
    const normalizedDoc: ActorDoc = {
      id:
        typeof doc.id === "string" && doc.id.trim().length > 0
          ? doc.id
          : createActorDocId(),
      key: doc.key,
      title:
        doc.title?.trim() ||
        template?.title ||
        (doc.key === "custom" ? "Custom section" : doc.key),
      content: normalizeCanonicalContentBlocks(doc.content),
      visibility: normalizeActorDocVisibility(
        doc.visibility || template?.defaultVisibility || "always"
      ),
      priority: Number.isFinite(doc.priority)
        ? doc.priority
        : template?.defaultPriority || 0,
    }

    if (!isNonEmptyActorDoc(normalizedDoc)) continue
    if (normalizedDoc.key === "custom") {
      customDocs.set(normalizedDoc.id, normalizedDoc)
    } else {
      standardDocs.set(normalizedDoc.key as CoreActorDocKey, normalizedDoc)
    }
  }

  return [...standardDocs.values(), ...customDocs.values()].sort(
    (left, right) => {
      if (right.priority !== left.priority)
        return right.priority - left.priority
      return left.title.localeCompare(right.title)
    }
  )
}

export function summarizeActorDoc(doc: ActorDoc, maxLength = 200): string {
  const text = extractText(doc.content).replace(/\s+/g, " ").trim()
  if (text.length > 0) {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text
  }

  const fileBlock = doc.content.find(
    (
      block
    ): block is Extract<ActorDoc["content"][number], { type: "file_ref" }> =>
      block.type === "file_ref"
  )
  return fileBlock ? `Attached file: ${fileBlock.name}` : ""
}

export function pickActorDocSummary(
  docs: ActorDoc[],
  keys: ActorDocKey[],
  maxLength = 500,
  fallback = ""
): string {
  const fragments = keys
    .map((key) => docs.find((doc) => doc.key === key))
    .filter((doc): doc is ActorDoc => Boolean(doc))
    .map((doc) => summarizeActorDoc(doc, maxLength))
    .filter(Boolean)

  if (fragments.length > 0) {
    return fragments.join("\n\n")
  }

  return fallback
}

export function summarizeActorForRole(
  docs: ActorDoc[],
  fallbackTitle = ""
): string {
  return pickActorDocSummary(
    docs,
    ["role_charter", "mission", "limitations_and_escalation"],
    500,
    fallbackTitle || "No role summary provided."
  )
}

export function summarizeActorForPrompt(docs: ActorDoc[]): string {
  return pickActorDocSummary(
    docs,
    [
      "soul",
      "self_narrative",
      "work_doctrine",
      "social_protocol",
      "representation_guidelines",
      "quirks_and_signatures",
    ],
    700
  )
}
