const MOCK_TRANSCRIPTION_CHUNKS = [
  "Help me organize today's key tasks",
  "by priority first",
  "then add the people I need to follow up with",
  "and finish with a short action plan",
] as const

export function startMockRealtimeTranscriptionSession({
  onChunk,
  intervalMs = 700,
}: {
  onChunk: (chunk: string) => void
  intervalMs?: number
}) {
  let index = 0

  const timer = setInterval(() => {
    if (index >= MOCK_TRANSCRIPTION_CHUNKS.length) {
      clearInterval(timer)
      return
    }

    const chunk = MOCK_TRANSCRIPTION_CHUNKS[index]!
    index += 1
    onChunk(chunk)
  }, intervalMs)

  return {
    stop() {
      clearInterval(timer)
    },
  }
}
