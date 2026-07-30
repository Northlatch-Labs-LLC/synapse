import { afterEach, describe, expect, it, vi } from "vitest"

import { copyTextToClipboard } from "./clipboard"

type FakeTextarea = {
  value: string
  style: Record<string, string>
  setAttribute: (name: string, value: string) => void
  select: () => void
  setSelectionRange: (start: number, end: number) => void
  remove: () => void
}

/**
 * Minimal stand-in for the bits of the DOM the execCommand fallback touches.
 * The vitest environment is "node", so there is no real document.
 */
function stubDocument(execCommandResult: boolean | (() => boolean)) {
  const created: FakeTextarea[] = []
  const appended: FakeTextarea[] = []
  const removed: FakeTextarea[] = []

  const doc = {
    createElement: () => {
      const textarea: FakeTextarea = {
        value: "",
        style: {},
        setAttribute: () => {},
        select: () => {},
        setSelectionRange: () => {},
        remove: () => removed.push(textarea),
      }
      created.push(textarea)
      return textarea
    },
    body: {
      appendChild: (node: FakeTextarea) => appended.push(node),
    },
    execCommand: (command: string) => {
      expect(command).toBe("copy")
      return typeof execCommandResult === "function"
        ? execCommandResult()
        : execCommandResult
    },
  }

  vi.stubGlobal("document", doc)
  return { created, appended, removed }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard when the context is secure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const dom = stubDocument(false)

    await expect(copyTextToClipboard("hello")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("hello")
    // The fallback must not run when the async clipboard succeeded.
    expect(dom.created).toHaveLength(0)
  })

  it("falls back to execCommand when navigator.clipboard is missing", async () => {
    // What an http://<ip>:<port> deploy actually looks like: the whole
    // clipboard object is absent because the origin is not a secure context.
    vi.stubGlobal("navigator", {})
    const dom = stubDocument(true)

    await expect(copyTextToClipboard("hello")).resolves.toBe(true)
    expect(dom.created).toHaveLength(1)
    expect(dom.created[0]!.value).toBe("hello")
    expect(dom.appended).toHaveLength(1)
  })

  it("falls back to execCommand when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const dom = stubDocument(true)

    await expect(copyTextToClipboard("hello")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledOnce()
    expect(dom.created).toHaveLength(1)
  })

  it("reports failure when execCommand returns false", async () => {
    vi.stubGlobal("navigator", {})
    stubDocument(false)

    await expect(copyTextToClipboard("hello")).resolves.toBe(false)
  })

  it("reports failure when execCommand throws, and still detaches the node", async () => {
    vi.stubGlobal("navigator", {})
    const dom = stubDocument(() => {
      throw new Error("boom")
    })

    await expect(copyTextToClipboard("hello")).resolves.toBe(false)
    expect(dom.removed).toHaveLength(1)
  })

  it("reports failure with no clipboard and no document", async () => {
    vi.stubGlobal("navigator", {})
    vi.stubGlobal("document", undefined)

    await expect(copyTextToClipboard("hello")).resolves.toBe(false)
  })
})
