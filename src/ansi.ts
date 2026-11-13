import {
  MAX_ART_LINE_CHARS,
  MAX_ART_SEGMENTS_PER_LINE,
  MAX_CSI_LENGTH,
  MAX_SGR_PARAM_LENGTH,
  MAX_SGR_PARAMS,
  MAX_STRING_SEQUENCE_LENGTH,
  sanitizeText,
} from "./safety.ts"

export type AnsiStyle = {
  readonly fg?: string
  readonly bg?: string
  readonly bold?: boolean
  readonly dim?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly reverse?: boolean
  readonly blink?: boolean
}

export type ArtSegment = {
  readonly text: string
  readonly style: AnsiStyle
}

export type ArtRow = readonly ArtSegment[]

const ANSI_BASIC = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
]

const ANSI_BRIGHT = [
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
]

function rgb(red: number, green: number, blue: number): string {
  const channel = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0
    return Math.max(0, Math.min(255, Math.round(safe))).toString(16).padStart(2, "0")
  }
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

function xterm256(index: number): string {
  if (!Number.isFinite(index)) return ANSI_BASIC[0]!
  const value = Math.max(0, Math.min(255, Math.round(index)))
  if (value < 8) return ANSI_BASIC[value]!
  if (value < 16) return ANSI_BRIGHT[value - 8]!
  if (value < 232) {
    const cube = value - 16
    const levels = [0, 95, 135, 175, 215, 255]
    const red = levels[Math.floor(cube / 36)]!
    const green = levels[Math.floor(cube / 6) % 6]!
    const blue = levels[cube % 6]!
    return rgb(red, green, blue)
  }
  const gray = 8 + (value - 232) * 10
  return rgb(gray, gray, gray)
}

function without(style: AnsiStyle, ...keys: (keyof AnsiStyle)[]): AnsiStyle {
  const next = { ...style }
  for (const key of keys) delete next[key]
  return next
}

function clampChannel(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(255, Math.round(value)))
}

function applySgr(style: AnsiStyle, params: string): AnsiStyle {
  if (params.length > MAX_SGR_PARAM_LENGTH) return style
  if (params.length > 0 && !/^[0-9;]*$/.test(params)) return style

  const parts =
    params.length === 0 ? [0] : params.split(";").map((part) => (part === "" ? 0 : Number(part)))
  if (parts.length > MAX_SGR_PARAMS) return style

  let next = style

  for (let index = 0; index < parts.length; index += 1) {
    const code = parts[index]!
    if (!Number.isFinite(code)) continue

    if (code === 0) {
      next = {}
    } else if (code === 1) {
      next = { ...next, bold: true }
    } else if (code === 2) {
      next = { ...next, dim: true }
    } else if (code === 3) {
      next = { ...next, italic: true }
    } else if (code === 4) {
      next = { ...next, underline: true }
    } else if (code === 5) {
      next = { ...next, blink: true }
    } else if (code === 7) {
      next = { ...next, reverse: true }
    } else if (code === 9) {
      next = { ...next, strikethrough: true }
    } else if (code === 21 || code === 22) {
      next = without(next, "bold", "dim")
    } else if (code === 23) {
      next = without(next, "italic")
    } else if (code === 24) {
      next = without(next, "underline")
    } else if (code === 25) {
      next = without(next, "blink")
    } else if (code === 27) {
      next = without(next, "reverse")
    } else if (code === 29) {
      next = without(next, "strikethrough")
    } else if (code === 39) {
      next = without(next, "fg")
    } else if (code === 49) {
      next = without(next, "bg")
    } else if (code >= 30 && code <= 37) {
      next = { ...next, fg: ANSI_BASIC[code - 30]! }
    } else if (code >= 90 && code <= 97) {
      next = { ...next, fg: ANSI_BRIGHT[code - 90]! }
    } else if (code >= 40 && code <= 47) {
      next = { ...next, bg: ANSI_BASIC[code - 40]! }
    } else if (code >= 100 && code <= 107) {
      next = { ...next, bg: ANSI_BRIGHT[code - 100]! }
    } else if (code === 38 || code === 48) {
      const target = code === 38 ? "fg" : "bg"
      const mode = parts[index + 1]

      if (mode === 5) {
        const color = clampChannel(parts[index + 2])
        if (color !== undefined) next = { ...next, [target]: xterm256(color) }
        index += 2
      } else if (mode === 2) {
        const red = clampChannel(parts[index + 2])
        const green = clampChannel(parts[index + 3])
        const blue = clampChannel(parts[index + 4])
        if (red !== undefined && green !== undefined && blue !== undefined) {
          next = { ...next, [target]: rgb(red, green, blue) }
        }
        index += 4
      } else if (mode !== undefined) {
        index += 1
      }
    }
  }

  return next
}

const C1_TO_ESC: Readonly<Record<string, string>> = {
  "\u0090": "\x1bP",
  "\u0098": "\x1bX",
  "\u009b": "\x1b[",
  "\u009c": "\x1b\\",
  "\u009d": "\x1b]",
  "\u009e": "\x1b^",
  "\u009f": "\x1b_",
}

const C1_INTRODUCERS = /[\u0090\u0098\u009b\u009c\u009d\u009e\u009f]/g

function normalizeC1(input: string): string {
  return input.replace(C1_INTRODUCERS, (char) => C1_TO_ESC[char] ?? char)
}

/**
 * Parse one line of ANSI SGR-styled text. Only SGR styling is kept. C1
 * introducers are normalized to their ESC forms, every other escape family
 * is consumed through its terminator or dropped, and all remaining visible
 * text is sanitized before it becomes an ArtSegment.
 */
export function parseAnsiLine(input: string): ArtRow {
  if (input.length > MAX_ART_LINE_CHARS) {
    throw new RangeError(`art line exceeds ${MAX_ART_LINE_CHARS} characters`)
  }

  const line = normalizeC1(input)
  const segments: ArtSegment[] = []
  let style: AnsiStyle = {}
  let buffer = ""

  const flush = () => {
    if (buffer.length === 0) return
    const text = sanitizeText(buffer)
    buffer = ""
    if (text.length === 0) return
    if (segments.length >= MAX_ART_SEGMENTS_PER_LINE) {
      throw new RangeError(`art line exceeds ${MAX_ART_SEGMENTS_PER_LINE} style runs`)
    }
    segments.push({ text, style })
  }

  let index = 0
  while (index < line.length) {
    const char = line[index]!

    if (char !== "\x1b") {
      buffer += char
      index += 1
      continue
    }

    const next = line[index + 1]

    if (next === "[") {
      let end = index + 2
      const limit = Math.min(line.length, index + 2 + MAX_CSI_LENGTH)
      while (end < limit) {
        const code = line.charCodeAt(end)
        if (code >= 0x40 && code <= 0x7e) break
        if (code < 0x20) {
          end = limit
          break
        }
        end += 1
      }
      if (end >= limit || end >= line.length) {
        index = line.length
        break
      }
      if (line[end] === "m") {
        flush()
        style = applySgr(style, line.slice(index + 2, end))
      }
      index = end + 1
      continue
    }

    if (next === "]" || next === "P" || next === "X" || next === "^" || next === "_") {
      let end = index + 2
      const limit = Math.min(line.length, index + 2 + MAX_STRING_SEQUENCE_LENGTH)
      let terminated = false
      while (end < limit) {
        if (line[end] === "\x07") {
          end += 1
          terminated = true
          break
        }
        if (line[end] === "\x1b" && line[end + 1] === "\\") {
          end += 2
          terminated = true
          break
        }
        end += 1
      }
      if (!terminated) {
        index = line.length
        break
      }
      index = end
      continue
    }

    if (next === "\x1b") {
      index += 1
      continue
    }

    let end = index + 1
    while (end < line.length) {
      const code = line.charCodeAt(end)
      if (code >= 0x20 && code <= 0x2f) {
        end += 1
        continue
      }
      break
    }
    if (end < line.length) end += 1
    index = end
  }

  flush()
  return segments
}

export function rowText(row: ArtRow): string {
  return row.map((segment) => segment.text).join("")
}

export function trimTrailingWhitespace(row: ArtRow): ArtRow {
  const next = row.slice()

  while (next.length > 0) {
    const last = next[next.length - 1]!
    const text = last.text.replace(/[ \t]+$/, "")
    if (text === last.text) break
    if (text.length === 0) {
      next.pop()
      continue
    }
    next[next.length - 1] = { ...last, text }
    break
  }

  return next
}
