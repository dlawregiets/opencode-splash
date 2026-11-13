import { describe, expect, test } from "bun:test"
import {
  DEFAULT_BACKGROUND,
  DEFAULT_DURATION,
  DEFAULT_SIZE,
  readOptions,
  resolveBackground,
} from "../src/options.ts"

describe("readOptions", () => {
  test("uses defaults for an empty options object", () => {
    expect(readOptions({})).toEqual({
      duration: DEFAULT_DURATION,
      background: DEFAULT_BACKGROUND,
      color: undefined,
      size: DEFAULT_SIZE,
      art: {},
    })
    expect(DEFAULT_DURATION).toBe(4000)
    expect(DEFAULT_BACKGROUND).toBe("theme")
    expect(DEFAULT_SIZE).toBe("auto")
  })

  test("rounds and clamps duration", () => {
    expect(readOptions({ duration: 1234.6 }).duration).toBe(1235)
    expect(readOptions({ duration: 0 }).duration).toBe(0)
    expect(readOptions({ duration: -10 }).duration).toBe(0)
    expect(readOptions({ duration: 99_999 }).duration).toBe(60_000)
    expect(readOptions({ duration: "4000" }).duration).toBe(DEFAULT_DURATION)
    expect(readOptions({ duration: Number.NaN }).duration).toBe(DEFAULT_DURATION)
  })

  test("trims string options and rejects empty values", () => {
    expect(readOptions({ background: "  #101010 " }).background).toBe("#101010")
    expect(readOptions({ background: "   " }).background).toBe(DEFAULT_BACKGROUND)
    expect(readOptions({ color: "  #4398F9 " }).color).toBe("#4398F9")
    expect(readOptions({ color: "" }).color).toBeUndefined()
    expect(readOptions({ color: 42 }).color).toBeUndefined()
  })

  test("rejects unsafe or unknown color strings", () => {
    expect(readOptions({ background: "#fff\x1b[2J" }).background).toBe(DEFAULT_BACKGROUND)
    expect(readOptions({ background: "\u009b31m" }).background).toBe(DEFAULT_BACKGROUND)
    expect(readOptions({ color: "#fff\x00" }).color).toBeUndefined()
    expect(readOptions({ color: "not-a-real-color" }).color).toBeUndefined()
    expect(readOptions({ color: "red" }).color).toBe("red")
    expect(readOptions({ background: "#FFFFFF" }).background).toBe("#FFFFFF")
  })

  test("accepts only known sizes", () => {
    expect(readOptions({ size: "large" }).size).toBe("large")
    expect(readOptions({ size: "medium" }).size).toBe("medium")
    expect(readOptions({ size: "small" }).size).toBe("small")
    expect(readOptions({ size: "huge" }).size).toBe(DEFAULT_SIZE)
    expect(readOptions({ size: 3 }).size).toBe(DEFAULT_SIZE)
  })

  test("reads art paths by size and ignores other values", () => {
    expect(
      readOptions({
        art: {
          large: " ~/art/large.txt ",
          medium: "/tmp/medium.txt",
          small: "",
          extra: "/tmp/nope.txt",
          default: 12,
        },
      }).art,
    ).toEqual({
      large: "~/art/large.txt",
      medium: "/tmp/medium.txt",
    })

    expect(readOptions({ art: "/tmp/art.txt" }).art).toEqual({})
    expect(readOptions({ art: null }).art).toEqual({})
    expect(readOptions({ art: ["/tmp/art.txt"] }).art).toEqual({})
  })

  test("rejects unsafe or overlong art paths", () => {
    expect(
      readOptions({
        art: {
          large: "a\nb",
          medium: "a".repeat(5_000),
          small: "/tmp/ok.txt",
        },
      }).art,
    ).toEqual({ small: "/tmp/ok.txt" })
  })
})

describe("resolveBackground", () => {
  const opaque = { a: 1 }
  const clear = { a: 0 }

  test("uses an explicit background as-is", () => {
    expect(resolveBackground("#FFFFFF", opaque, opaque, "dark")).toBe("#FFFFFF")
  })

  test("prefers the base theme background when it is opaque", () => {
    expect(resolveBackground("theme", opaque, { a: 0.5 }, "dark")).toBe(opaque)
  })

  test("falls back to the raised surface when the base is transparent", () => {
    expect(resolveBackground("theme", clear, opaque, "dark")).toBe(opaque)
  })

  test("falls back to a solid default when all theme backgrounds are transparent", () => {
    expect(resolveBackground("theme", clear, clear, "dark")).toBe("#0B0B0B")
    expect(resolveBackground("theme", clear, clear, "light")).toBe("#FFFFFF")
  })

  test("ignores invalid explicit backgrounds", () => {
    expect(resolveBackground("\x1b[2J", opaque, opaque, "dark")).toBe(opaque)
    expect(resolveBackground("not-a-color", opaque, opaque, "dark")).toBe(opaque)
  })
})
