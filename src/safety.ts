/**
 * Shared safety limits and sanitizers for untrusted art files.
 *
 * The art file is the trust boundary: paths come from configuration, but the
 * file contents may be downloaded, shared, or otherwise untrusted.
 */

export const MAX_ART_FILE_BYTES = 1_048_576
export const MAX_ART_ROWS = 256
export const MAX_ART_LINE_CHARS = 16_384
export const MAX_ART_COLUMNS = 1_024
export const MAX_ART_SEGMENTS_PER_LINE = 1_024
export const MAX_ART_TOTAL_SEGMENTS = 10_000
export const MAX_CSI_LENGTH = 512
export const MAX_STRING_SEQUENCE_LENGTH = 4_096
export const MAX_SGR_PARAMS = 64
export const MAX_SGR_PARAM_LENGTH = 256
export const MAX_PATH_LENGTH = 4_096
export const MAX_TOAST_LENGTH = 600

/** C0/C1 controls, format characters, line separators, and paragraph separators. */
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
/** The same classes except line/paragraph separators, for config paths. */
const UNSAFE_CONFIG = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

function stripLoneSurrogates(input: string): string {
  let output = ""
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += input[index]!
        output += input[index + 1]!
        index += 1
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue
    output += input[index]!
  }
  return output
}

/**
 * Remove everything that can affect terminal layout or interpretation:
 * C0/C1 controls (including BEL, ESC, DEL), bidi and zero-width format
 * characters, and Unicode line/paragraph separators. Tabs become spaces.
 */
export function sanitizeText(input: string): string {
  return stripLoneSurrogates(input.replace(/\t/g, " ")).replace(UNSAFE_TEXT, "")
}

/** Truncate by code points so a surrogate pair is never split. */
export function truncateText(value: string, maxLength: number): string {
  const limit = Math.max(1, Math.floor(maxLength))
  const characters = Array.from(value)
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : value
}

/** Collapse whitespace, remove control/format characters, and truncate. */
export function sanitizeForToast(value: string, maxLength = 200): string {
  const safe = sanitizeText(value).replace(/\s+/g, " ").trim()
  return truncateText(safe, maxLength)
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const HEX_SPAN_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const NAMED_COLORS = new Set([
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "cyan",
  "magenta",
  "silver",
  "gray",
  "grey",
  "maroon",
  "olive",
  "lime",
  "aqua",
  "teal",
  "navy",
  "fuchsia",
  "purple",
  "orange",
  "brightblack",
  "brightred",
  "brightgreen",
  "brightblue",
  "brightyellow",
  "brightcyan",
  "brightmagenta",
  "brightwhite",
  "transparent",
])

/** Colors accepted from configuration: hex plus the names OpenTUI supports. */
export function isValidColor(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length <= 64 && (HEX_COLOR.test(trimmed) || NAMED_COLORS.has(trimmed.toLowerCase()))
}

/** Colors produced by the ANSI parser are always six- or eight-digit hex. */
export function isHexColor(value: string): boolean {
  return HEX_SPAN_COLOR.test(value)
}

/** Config paths must be non-empty, bounded, and free of control characters. */
export function isValidPathString(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes("\0") &&
    !UNSAFE_CONFIG.test(value)
  )
}
