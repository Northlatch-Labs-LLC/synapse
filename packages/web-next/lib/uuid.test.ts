import { afterEach, describe, expect, it, vi } from "vitest"

import { createUuid, isUuid } from "./uuid"

const realCrypto = globalThis.crypto

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createUuid", () => {
  it("produces a valid v4 UUID when crypto.randomUUID exists", () => {
    const id = createUuid()
    expect(isUuid(id)).toBe(true)
    expect(id[14]).toBe("4")
  })

  it("produces a valid v4 UUID without crypto.randomUUID", () => {
    // An http://<ip>:<port> deploy is an insecure context: randomUUID is gone
    // but getRandomValues is still there. This is the path that used to throw.
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => realCrypto.getRandomValues(array),
    })

    const ids = new Set<string>()
    for (let index = 0; index < 50; index += 1) {
      const id = createUuid()
      expect(isUuid(id)).toBe(true)
      expect(id[14]).toBe("4")
      expect(["8", "9", "a", "b"]).toContain(id[19])
      ids.add(id)
    }
    expect(ids.size).toBe(50)
  })

  it("produces a valid v4 UUID with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined)

    const id = createUuid()
    expect(isUuid(id)).toBe(true)
    expect(id[14]).toBe("4")
  })
})
