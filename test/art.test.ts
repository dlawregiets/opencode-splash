import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import {
  expandPath,
  formatArtError,
  loadArtPaths,
  makeArt,
  pickArt,
  readArtFile,
  type LoadedArt,
} from "../src/art.ts"
import {
  MAX_ART_COLUMNS,
  MAX_ART_FILE_BYTES,
  MAX_ART_LINE_CHARS,
  MAX_ART_ROWS,
  MAX_ART_TOTAL_SEGMENTS,
  MAX_PATH_LENGTH,
} from "../src/safety.ts"

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "opencode-splash-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function art(width: number, height: number) {
  return makeArt(Array.from({ length: height }, () => "A".repeat(width)), "test")
}

function loaded(entries: Array<[LoadedArt["size"], ReturnType<typeof art>]>): LoadedArt[] {
  return entries.map(([size, value]) => ({ size, art: value }))
}

describe("expandPath", () => {
  test("leaves absolute paths alone", () => {
    expect(expandPath("/tmp/art.txt", "/work")).toBe("/tmp/art.txt")
  })

  test("resolves relative paths from the working directory", () => {
    expect(expandPath("art/large.txt", "/work")).toBe("/work/art/large.txt")
  })

  test("expands home paths", () => {
    expect(expandPath("~/art.txt", "/work")).toBe(join(homedir(), "art.txt"))
    expect(expandPath("~", "/work")).toBe(homedir())
  })

  test("rejects empty, control, null, and overlong paths", () => {
    expect(() => expandPath("   ", "/work")).toThrow()
    expect(() => expandPath("a\0b", "/work")).toThrow()
    expect(() => expandPath("a\nb", "/work")).toThrow()
    expect(() => expandPath("a".repeat(MAX_PATH_LENGTH + 1), "/work")).toThrow()
  })
})

describe("readArtFile", () => {
  test("normalizes BOM, CRLF, edge blank lines, and trailing whitespace", () => {
    const dir = tempDir()
    const file = join(dir, "art.txt")
    writeFileSync(file, "\uFEFF\r\n  hello  \r\n\r\nworld\r\n\r\n")

    const result = readArtFile(file, dir)
    expect(result.lines).toEqual(["  hello", "", "world"])
    expect(result.width).toBe(7)
    expect(result.height).toBe(3)
    expect(result.source).toBe(file)
  })

  test("rejects empty and invisible art", () => {
    const dir = tempDir()
    const empty = join(dir, "empty.txt")
    const spaces = join(dir, "spaces.txt")
    writeFileSync(empty, "\n\n")
    writeFileSync(spaces, "   \n  \n")

    expect(() => readArtFile(empty, dir)).toThrow("empty")
    expect(() => readArtFile(spaces, dir)).toThrow("empty")
  })

  test("rejects non-regular, oversized, too-tall, too-wide, and too-long files", () => {
    const dir = tempDir()

    expect(() => readArtFile(dir, dir)).toThrow(/not a regular file/)

    const huge = join(dir, "huge.txt")
    writeFileSync(huge, "A".repeat(MAX_ART_FILE_BYTES + 1))
    expect(() => readArtFile(huge, dir)).toThrow(/too large/)

    const tall = join(dir, "tall.txt")
    writeFileSync(tall, Array.from({ length: MAX_ART_ROWS + 3 }, () => "A").join("\n"))
    expect(() => readArtFile(tall, dir)).toThrow(/too many rows/)

    const wide = join(dir, "wide.txt")
    writeFileSync(wide, "A".repeat(MAX_ART_COLUMNS + 1))
    expect(() => readArtFile(wide, dir)).toThrow(/too wide/)

    const long = join(dir, "long.txt")
    writeFileSync(long, "A".repeat(MAX_ART_LINE_CHARS + 1))
    expect(() => readArtFile(long, dir)).toThrow(/too long/)
  })

  test("strips control and escape content from hostile files", () => {
    const dir = tempDir()
    const file = join(dir, "evil.txt")
    writeFileSync(
      file,
      "\x1b]0;pwned\x07X\x9b2JY\u2028Z\u202eW\nplain",
    )

    const result = readArtFile(file, dir)
    expect(result.lines.join("")).toBe("XYZWplain")
    for (const line of result.lines) {
      expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u)
    }
  })

  test("sanitizes art error descriptions", () => {
    const formatted = formatArtError({
      size: "large",
      path: "a\x1b[31m\nb",
      error: new Error("c\x07d"),
    })
    expect(formatted).not.toContain("\x1b")
    expect(formatted).not.toContain("\x07")
    expect(formatted).not.toContain("\n")
    expect(formatted).toContain("large:")
  })
})

describe("loadArtPaths", () => {
  test("loads configured sizes and reports failures", () => {
    const dir = tempDir()
    const large = join(dir, "large.txt")
    const medium = join(dir, "medium.txt")
    writeFileSync(large, "LARGE\n")
    writeFileSync(medium, "MED\n")

    const result = loadArtPaths(
      { large, medium, small: join(dir, "missing.txt") },
      dir,
    )

    expect(result.loaded.map((entry) => entry.size)).toEqual(["large", "medium"])
    expect(result.loaded[0]?.art.lines).toEqual(["LARGE"])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.size).toBe("small")
  })
})

describe("pickArt", () => {
  const large = art(10, 5)
  const medium = art(8, 3)
  const small = art(4, 1)
  const all = loaded([
    ["large", large],
    ["medium", medium],
    ["small", small],
  ])

  test("returns nothing when no art is loaded", () => {
    expect(pickArt([], 80, 24, "auto")).toBeUndefined()
  })

  test("auto prefers the largest art that fits", () => {
    expect(pickArt(all, 20, 20, "auto")).toBe(large)
    expect(pickArt(all, 9, 20, "auto")).toBe(medium)
    expect(pickArt(all, 5, 20, "auto")).toBe(small)
  })

  test("auto accounts for the hint row", () => {
    expect(pickArt(all, 20, 5, "auto")).toBe(small)
  })

  test("auto falls back to the smallest art when nothing fits", () => {
    expect(pickArt(loaded([["large", large]]), 5, 5, "auto")).toBe(large)
    expect(pickArt(all, 2, 2, "auto")).toBe(small)
  })

  test("respects a forced size", () => {
    expect(pickArt(all, 2, 2, "medium")).toBe(medium)
    expect(pickArt(all, 100, 100, "small")).toBe(small)
  })

  test("falls back to another configured size when the forced one is missing", () => {
    const onlyMedium = loaded([["medium", medium]])
    expect(pickArt(onlyMedium, 100, 100, "large")).toBe(medium)
    expect(pickArt(onlyMedium, 100, 100, "small")).toBe(medium)
  })
})

describe("art limits", () => {
  test("rejects too many rows", () => {
    const lines = Array.from({ length: MAX_ART_ROWS + 1 }, () => "A")
    expect(() => makeArt(lines, "test")).toThrow(/too many rows/)
  })

  test("rejects art that is too wide", () => {
    expect(() => makeArt(["A".repeat(MAX_ART_COLUMNS + 1)], "test")).toThrow(/too wide/)
  })

  test("rejects art with too many style runs", () => {
    const lines = Array.from({ length: 11 }, () => "\x1b[31mA".repeat(1_000))
    expect(lines.length * 1_000).toBeGreaterThan(MAX_ART_TOTAL_SEGMENTS)
    expect(() => makeArt(lines, "test")).toThrow(/too many style runs/)
  })

  test("strips control characters in makeArt", () => {
    expect(makeArt(["A\x9b2JB"], "test").lines).toEqual(["AB"])
    expect(makeArt(["A\x07B\u202eC"], "test").lines).toEqual(["ABC"])
  })
})
