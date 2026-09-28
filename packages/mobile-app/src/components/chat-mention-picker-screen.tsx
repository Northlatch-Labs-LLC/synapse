import Feather from "@expo/vector-icons/Feather"
import {
  CONVERSATION_PARTICIPANT_TYPE,
  type ConversationParticipantType,
} from "@shared"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import {
  ALPHABET_ENTITY_TARGET_TYPE,
  AlphabetIndexedEntityList,
  type AlphabetIndexedEntityItem,
} from "@/components/alphabet-indexed-entity-list"
import { EmptyState, ScreenView } from "@/components/ui"
import { publishMentionSelection } from "@/lib/chat-mention-selection"
import {
  getConversationViewerParticipant,
  getMentionableConversationParticipants,
  participantToConversationEntityRef,
} from "@/lib/chat-data"
import { useChat } from "@/providers/chat-provider"
import { theme } from "@/theme/tokens"

function buildParticipantSubtitle(participant: {
  participantType: ConversationParticipantType
  title?: string
  role?: string
}) {
  const fallback =
    participant.participantType === CONVERSATION_PARTICIPANT_TYPE.ACTOR ||
    participant.participantType === CONVERSATION_PARTICIPANT_TYPE.REMOTE_AGENT
      ? "Workspace Actor"
      : participant.participantType === CONVERSATION_PARTICIPANT_TYPE.EXTERNAL
        ? "External contact"
        : "Workspace member"

  return participant.title?.trim() || participant.role?.trim() || fallback
}

export function ChatMentionPickerScreen() {
  const router = useRouter()
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>()
  const { getConversation, workspaceMemberId } = useChat()
  const [query, setQuery] = useState("")

  const conversation = conversationId ? getConversation(conversationId) : null
  const viewerParticipantId = getConversationViewerParticipant(
    conversation,
    workspaceMemberId
  )?.participantId

  const participants = useMemo(
    () =>
      getMentionableConversationParticipants(conversation, viewerParticipantId),
    [conversation, viewerParticipantId]
  )

  const filteredParticipants = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return participants
    }

    return participants.filter((participant) => {
      const haystack = [participant.name, participant.title, participant.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [participants, query])

  const items = useMemo<AlphabetIndexedEntityItem[]>(
    () =>
      filteredParticipants.map((participant) => ({
        key: participant.participantId,
        title: participant.name,
        subtitle: buildParticipantSubtitle(participant),
        avatarUrl: participant.avatarUrl || null,
        targetType:
          participant.participantType === CONVERSATION_PARTICIPANT_TYPE.ACTOR
            ? ALPHABET_ENTITY_TARGET_TYPE.ACTOR
            : ALPHABET_ENTITY_TARGET_TYPE.USER,
        onPress: () => {
          if (!conversationId) {
            return
          }

          publishMentionSelection(
            conversationId,
            participantToConversationEntityRef(participant)
          )
          router.back()
        },
      })),
    [conversationId, filteredParticipants, router]
  )

  return (
    <ScreenView>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerNav,
              pressed && styles.headerNavPressed,
            ]}
          >
            <Feather name="chevron-left" size={22} color={theme.colors.text} />
          </Pressable>

          <Text numberOfLines={1} style={styles.headerTitle}>
            Choose Who to Mention
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search names"
            placeholderTextColor={theme.colors.textSoft}
            style={styles.searchInput}
          />
        </View>

        {!conversation ? (
          <View style={styles.stateWrap}>
            <EmptyState
              icon="at-sign"
              title="Can't choose who to mention right now"
              description="The chat hasn't synced yet. Go back and try again."
            />
          </View>
        ) : (
          <AlphabetIndexedEntityList
            items={items}
            bottomPadding={40}
            emptyState={
              <View style={styles.stateWrap}>
                <EmptyState
                  icon="at-sign"
                  title="No one to mention yet"
                  description={
                    query.trim()
                      ? "Try a different keyword."
                      : "There are no other members to select in this chat yet."
                  }
                />
              </View>
            }
          />
        )}
      </View>
    </ScreenView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerNav: {
    width: 56,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerNavPressed: {
    opacity: 0.55,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 56,
    height: 40,
  },
  searchWrap: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 10,
  },
  stateWrap: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
})
