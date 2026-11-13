import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { parseAnsiLine, rowText, trimTrailingWhitespace, type ArtRow } from "./ansi.ts"
import { ART_SIZES, type ArtPaths, type ArtSize, type SplashSize } from "./options.ts"
import {
  MAX_ART_COLUMNS,
  MAX_ART_FILE_BYTES,
  MAX_ART_LINE_CHARS,
  MAX_ART_ROWS,
  MAX_ART_TOTAL_SEGMENTS,
  isValidPathString,
  sanitizeForToast,
} from "./safety.ts"

export type Art = {
  /** Plain text lines, with ANSI styling removed. */
  readonly lines: readonly string[]
  /** Styled rows used for rendering. */
  readonly rows: readonly ArtRow[]
  readonly width: number
  readonly height: number
  /** Resolved file path. */
  readonly source: string
}

export type LoadedArt = {
  readonly size: ArtSize
  readonly art: Art
}

export type ArtError = {
  readonly size: ArtSize
  readonly path: string
  readonly error: Error
}

export function formatArtError(error: ArtError): string {
  const path = sanitizeForToast(error.path, 160)
  const message = sanitizeForToast(error.error.message, 200)
  return `${error.size}: ${path} (${message})`
}

export function makeArtFromRows(rows: readonly ArtRow[], source: string): Art {
  if (rows.length > MAX_ART_ROWS) {
    throw new Error(`art has too many rows (max ${MAX_ART_ROWS})`)
  }

  const lines = rows.map(rowText)
  const width = lines.reduce((max, line) => Math.max(max, line.length), 0)
  if (width === 0) throw new Error("art has no visible characters")
  if (width > MAX_ART_COLUMNS) {
    throw new Error(`art is too wide (max ${MAX_ART_COLUMNS} characters)`)
  }

  const segments = rows.reduce((total, row) => total + row.length, 0)
  if (segments > MAX_ART_TOTAL_SEGMENTS) {
    throw new Error(`art has too many style runs (max ${MAX_ART_TOTAL_SEGMENTS})`)
  }

  return { lines, rows, width, height: rows.length, source }
}

export function makeArt(lines: readonly string[], source: string): Art {
  if (lines.length > MAX_ART_ROWS) {
    throw new Error(`art has too many rows (max ${MAX_ART_ROWS})`)
  }

  let totalSegments = 0
  const rows = lines.map((line) => {
    const row = trimTrailingWhitespace(parseAnsiLine(line))
    totalSegments += row.length
    if (totalSegments > MAX_ART_TOTAL_SEGMENTS) {
      throw new Error(`art has too many style runs (max ${MAX_ART_TOTAL_SEGMENTS})`)
    }
    return row
  })
  return makeArtFromRows(rows, source)
}

export function expandPath(input: string, cwd: string): string {
  const trimmed = input.trim()
  if (!isValidPathString(trimmed)) {
    throw new Error("art path is empty, too long, or contains control characters")
  }

  const expanded =
    trimmed === "~"
      ? homedir()
      : trimmed.startsWith("~/") || trimmed.startsWith("~\\")
        ? resolve(homedir(), trimmed.slice(2))
        : trimmed
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded)
}

export function readArtFile(input: string, cwd: string): Art {
  const source = expandPath(input, cwd)

  // statSync does not block on FIFOs. isFile() rejects directories, sockets,
  // FIFOs, and character devices such as /dev/zero.
  const info = statSync(source, { throwIfNoEntry: false })
  if (info === undefined) throw new Error("art file not found")
  if (!info.isFile()) throw new Error("art path is not a regular file")
  if (info.size > MAX_ART_FILE_BYTES) {
    throw new Error(`art file is too large (max ${MAX_ART_FILE_BYTES} bytes)`)
  }

  const raw = readFileSync(source, "utf8")
  // Guard against a file that grew between statSync and readFileSync.
  if (raw.length > MAX_ART_FILE_BYTES) {
    throw new Error(`art file is too large (max ${MAX_ART_FILE_BYTES} bytes)`)
  }

  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, "\n")
  const lines = normalized.split("\n")
  if (lines.length > MAX_ART_ROWS + 2) {
    throw new Error(`art file has too many rows (max ${MAX_ART_ROWS})`)
  }

  const rows = lines.map((line) => {
    if (line.length > MAX_ART_LINE_CHARS) {
      throw new Error(`art line is too long (max ${MAX_ART_LINE_CHARS} characters)`)
    }
    return trimTrailingWhitespace(parseAnsiLine(line))
  })

  let totalSegments = 0
  for (const row of rows) {
    totalSegments += row.length
    if (totalSegments > MAX_ART_TOTAL_SEGMENTS) {
      throw new Error(`art has too many style runs (max ${MAX_ART_TOTAL_SEGMENTS})`)
    }
  }

  while (rows.length > 0 && rowText(rows[0]!).trim() === "") rows.shift()
  while (rows.length > 0 && rowText(rows[rows.length - 1]!).trim() === "") rows.pop()
  if (rows.length === 0) throw new Error("art file is empty")

  return makeArtFromRows(rows, source)
}

export function loadArtPaths(
  paths: ArtPaths,
  cwd: string,
): { readonly loaded: readonly LoadedArt[]; readonly errors: readonly ArtError[] } {
  const loaded: LoadedArt[] = []
  const errors: ArtError[] = []

  for (const size of ART_SIZES) {
    const path = paths[size]
    if (!path) continue
    try {
      loaded.push({ size, art: readArtFile(path, cwd) })
    } catch (error) {
      errors.push({
        size,
        path,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  return { loaded, errors }
}

/**
 * Pick the best available art for the viewport. Auto mode prefers the largest
 * configured art that fits. If nothing fits, the smallest configured art wins.
 */
export function pickArt(
  loaded: readonly LoadedArt[],
  width: number,
  height: number,
  preference: SplashSize,
): Art | undefined {
  if (loaded.length === 0) return undefined

  const bySize = new Map(loaded.map(({ size, art }) => [size, art]))
  const find = (size: ArtSize) => bySize.get(size)

  if (preference !== "auto") {
    const exact = find(preference)
    if (exact) return exact

    const start = ART_SIZES.indexOf(preference)
    for (let index = start + 1; index < ART_SIZES.length; index++) {
      const art = find(ART_SIZES[index])
      if (art) return art
    }
    for (let index = start - 1; index >= 0; index--) {
      const art = find(ART_SIZES[index])
      if (art) return art
    }
    return loaded[0]?.art
  }

  const maxWidth = Math.max(1, width)
  const maxHeight = Math.max(1, height - 3)

  for (const size of ART_SIZES) {
    const art = find(size)
    if (art && art.width <= maxWidth && art.height <= maxHeight) return art
  }

  for (let index = ART_SIZES.length - 1; index >= 0; index--) {
    const art = find(ART_SIZES[index])
    if (art) return art
  }

  return undefined
}
