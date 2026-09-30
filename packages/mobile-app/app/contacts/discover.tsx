import Feather from "@expo/vector-icons/Feather"
import { useRouter } from "expo-router"
import { useDeferredValue, useEffect, useState } from "react"
import { CONTACT_TARGET_TYPE, IDENTITY_SEARCH_MATCH_STATE } from "@shared"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import {
  Avatar,
  Button,
  EmptyState,
  LoadingBlock,
  Pill,
  ScreenScroll,
  SectionBlock,
  SectionTitleRow,
} from "@/components/ui"
import { api } from "@/lib/api"
import { titleCase } from "@/lib/contacts"
import { useWorkspace } from "@/providers/workspace-provider"
import { theme } from "@/theme/tokens"
import type { IdentitySearchMatchView } from "@/types/api"

function buildSearchDetailParams(match: IdentitySearchMatchView) {
  return {
    pathname: "/contacts/search/[profileId]" as const,
    params: {
      profileId: match.profileId,
      title: match.title,
      subtitle: match.subtitle || "",
      avatarUrl: match.avatarUrl || "",
      workspaceName: match.workspace.name,
      workspaceSlug: match.workspace.slug,
      state: match.state,
    },
  }
}

function requestStateLabel(match: IdentitySearchMatchView) {
  switch (match.state) {
    case IDENTITY_SEARCH_MATCH_STATE.SAME_WORKSPACE_MEMBER:
      return "Same workspace member"
    case IDENTITY_SEARCH_MATCH_STATE.FRIEND:
    case IDENTITY_SEARCH_MATCH_STATE.EXISTING:
      return "Already connected"
    case IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST:
    case IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL:
      return "Waiting"
    case IDENTITY_SEARCH_MATCH_STATE.APPROVAL_REQUIRED:
      return "Approval required"
    case IDENTITY_SEARCH_MATCH_STATE.AVAILABLE:
      return "Ready to connect"
    default:
      return "Can connect"
  }
}

export default function DiscoverContactsScreen() {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const [search, setSearch] = useState("")
  const [matches, setMatches] = useState<IdentitySearchMatchView[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingProfileId, setSubmittingProfileId] = useState<string | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search)

  const actors = matches.filter(
    (match) => match.targetType === CONTACT_TARGET_TYPE.ACTOR
  )
  const members = matches.filter(
    (match) => match.targetType === CONTACT_TARGET_TYPE.MEMBER
  )

  useEffect(() => {
    let cancelled = false

    async function loadDiscoveries() {
      if (!workspaceId) {
        setMatches([])
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const response = await api.searchIdentity(workspaceId, deferredSearch)
        if (cancelled) return

        setMatches(response.matches || [])
        setError(null)
      } catch (nextError) {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Remote contact discovery failed."
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDiscoveries()

    return () => {
      cancelled = true
    }
  }, [deferredSearch, workspaceId])

  async function handleRequest(match: IdentitySearchMatchView) {
    if (!workspaceId || submittingProfileId) return

    if (match.contact) {
      router.push({
        pathname: "/contacts/[contactType]/[contactId]",
        params: {
          contactType: match.contact.kind,
          contactId: match.contact.id,
        },
      })
      return
    }

    setSubmittingProfileId(match.profileId)
    setMessage(null)
    try {
      const result = await api.requestIdentityProfile(
        workspaceId,
        match.profileId
      )
      if (result.contact) {
        router.push({
          pathname: "/contacts/[contactType]/[contactId]",
          params: {
            contactType: result.contact.kind,
            contactId: result.contact.id,
          },
        })
        return
      }

      setMatches((current) =>
        current.map((item) =>
          item.profileId === match.profileId
            ? {
                ...item,
                state: IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST,
                requestId: result.requestId,
              }
            : item
        )
      )
      setMessage("Connection request sent. Waiting for them to respond.")
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to send the connection request."
      )
    } finally {
      setSubmittingProfileId(null)
    }
  }

  return (
    <ScreenScroll topPadding={0} bottomPadding={56}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Feather name="chevron-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Discover
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionBlock>
        <Text style={styles.tipText}>
          Search for members or actors in other workspaces and send a connection
          request; anyone you are already connected to opens their contact
          details directly.
        </Text>
        <View style={styles.searchShell}>
          <Feather name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search workspaces, member names, emails, or actors"
            placeholderTextColor={theme.colors.textSoft}
            style={styles.searchInput}
          />
        </View>
        {message ? <Text style={styles.rowCopy}>{message}</Text> : null}
      </SectionBlock>

      {loading ? (
        <SectionBlock>
          <LoadingBlock label="Searching remote contacts..." />
        </SectionBlock>
      ) : error ? (
        <SectionBlock>
          <EmptyState
            icon="alert-circle"
            title="Remote contact discovery failed"
            description={error}
          />
        </SectionBlock>
      ) : actors.length === 0 && members.length === 0 ? (
        <SectionBlock>
          <EmptyState
            icon="compass"
            title="No discoveries"
            description="Try a different keyword, or make sure they have identity search enabled."
          />
        </SectionBlock>
      ) : (
        <>
          <SectionBlock>
            <SectionTitleRow
              title="Remote actors"
              action={
                <Text style={styles.countText}>{actors.length} found</Text>
              }
            />
            {actors.length > 0 ? (
              <View style={styles.listShell}>
                {actors.map((actor) => (
                  <View
                    key={actor.actorId || actor.profileId}
                    style={styles.discoveryCard}
                  >
                    <View style={styles.discoveryHeader}>
                      <Avatar
                        name={actor.title}
                        uri={actor.avatarUrl || undefined}
                        icon="cpu"
                        size={46}
                      />
                      <View style={styles.discoveryBody}>
                        <View style={styles.discoveryTitleLine}>
                          <Text style={styles.rowTitle}>{actor.title}</Text>
                          <Pill label={actor.workspace.name} tone="accent" />
                        </View>
                        <Text style={styles.rowSubtitle}>
                          {actor.subtitle || titleCase(actor.targetType)}
                        </Text>
                        <Text style={styles.rowCopy}>
                          {requestStateLabel(actor)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actionRow}>
                      <Button
                        label={
                          actor.contact
                            ? "View details"
                            : submittingProfileId === actor.profileId
                              ? "Working..."
                              : actor.state ===
                                    IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST ||
                                  actor.state ===
                                    IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL
                                ? "Waiting"
                                : "Connect"
                        }
                        variant={actor.contact ? "secondary" : "primary"}
                        onPress={() => void handleRequest(actor)}
                        disabled={
                          !!submittingProfileId ||
                          actor.state ===
                            IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST ||
                          actor.state ===
                            IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL
                        }
                        style={styles.actionButton}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="cpu"
                title="No remote actors matched"
                description="Try searching by actor name, role, or workspace name."
              />
            )}
          </SectionBlock>

          <SectionBlock>
            <SectionTitleRow
              title="Remote members"
              action={
                <Text style={styles.countText}>{members.length} found</Text>
              }
            />
            {members.length > 0 ? (
              <View style={styles.listShell}>
                {members.map((member) => (
                  <View key={member.profileId} style={styles.discoveryCard}>
                    <View style={styles.discoveryHeader}>
                      <Avatar
                        name={member.title || "Remote member"}
                        uri={member.avatarUrl || undefined}
                        icon="user"
                        size={46}
                      />
                      <View style={styles.discoveryBody}>
                        <View style={styles.discoveryTitleLine}>
                          <Text style={styles.rowTitle}>
                            {member.title || "Unnamed member"}
                          </Text>
                          <Pill label={member.workspace.name} tone="accent" />
                        </View>
                        <Text style={styles.rowSubtitle}>
                          {member.subtitle || "No additional info"}
                        </Text>
                        <Text style={styles.rowCopy}>
                          {requestStateLabel(member)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actionRow}>
                      <Button
                        label={
                          member.contact
                            ? "View details"
                            : submittingProfileId === member.profileId
                              ? "Working..."
                              : member.state ===
                                    IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST ||
                                  member.state ===
                                    IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL
                                ? "Waiting"
                                : "Connect"
                        }
                        variant={member.contact ? "secondary" : "primary"}
                        onPress={() => void handleRequest(member)}
                        disabled={
                          !!submittingProfileId ||
                          member.state ===
                            IDENTITY_SEARCH_MATCH_STATE.PENDING_REQUEST ||
                          member.state ===
                            IDENTITY_SEARCH_MATCH_STATE.PENDING_APPROVAL
                        }
                        style={styles.actionButton}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="users"
                title="No remote members matched"
                description="Try searching by name, email, or workspace name."
              />
            )}
          </SectionBlock>
        </>
      )}
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  header: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 38,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
  countText: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  listShell: {
    marginTop: 2,
    gap: 12,
  },
  discoveryCard: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 14,
  },
  discoveryHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  discoveryBody: {
    flex: 1,
    gap: 3,
  },
  discoveryTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  rowCopy: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSoft,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
})
