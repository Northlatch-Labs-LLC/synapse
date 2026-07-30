/**
 * Clipboard copy that survives INSECURE browser contexts.
 *
 * `navigator.clipboard` is secure-context-only: on the `http://<ip>:<port>`
 * deployments Synapse now supports it is `undefined` (localhost is exempt, a
 * bare IP is not), so an unguarded `navigator.clipboard.writeText(...)` throws
 * a TypeError and the copy silently does nothing. Fall back to the legacy
 * hidden-textarea + `document.execCommand("copy")` path, which has no
 * secure-context requirement.
 *
 * Returns whether the text reached the clipboard so callers can keep their
 * existing toast / "Copied" feedback.
 */

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false

  let textarea: HTMLTextAreaElement | undefined

  // select() moves focus to the offscreen textarea and replaces the page
  // selection — capture both so the copy is invisible to the user (keystrokes
  // keep landing in their input, highlighted text stays highlighted). All
  // guarded: this also runs in non-browser test environments without the
  // HTMLElement global or getSelection.
  const active = document.activeElement
  const previousActive =
    typeof HTMLElement !== "undefined" && active instanceof HTMLElement
      ? active
      : null
  const selection = document.getSelection?.() ?? null
  const previousRanges: Range[] = []
  for (let i = 0; i < (selection?.rangeCount ?? 0); i += 1) {
    const range = selection?.getRangeAt(i)
    if (range) previousRanges.push(range.cloneRange())
  }

  try {
    textarea = document.createElement("textarea")
    textarea.value = text
    // The element has to stay selectable, so it can't be `hidden` or
    // `display: none` — park it off the layout and mute it instead. `readonly`
    // keeps mobile keyboards from popping up during the copy.
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.top = "0"
    textarea.style.left = "0"
    textarea.style.opacity = "0"
    textarea.style.pointerEvents = "none"

    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea?.remove()
    if (selection && previousRanges.length > 0) {
      selection.removeAllRanges()
      for (const range of previousRanges) {
        selection.addRange(range)
      }
    }
    previousActive?.focus({ preventScroll: true })
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Present but refused (denied permission, unfocused document) — the
      // legacy path below still works, so try it before reporting failure.
    }
  }

  return copyViaExecCommand(text)
}
