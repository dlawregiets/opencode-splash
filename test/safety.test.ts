import { describe, expect, test } from "bun:test"
import {
  MAX_PATH_LENGTH,
  isValidColor,
  isValidPathString,
  sanitizeForToast,
  sanitizeText,
} from "../src/safety.ts"

describe("sanitizeText", () => {
  test("removes C0, C1, DEL, format, and separator characters", () => {
    expect(
      sanitizeText("A\u0000B\u0007C\u001bD\u007fE\u009bF\u202eG\u200bH\u2028I\ufeffJ"),
    ).toBe("ABCDEFGHIJ")
  })

  test("turns tabs into spaces and preserves block characters", () => {
    expect(sanitizeText("a\tb")).toBe("a b")
    expect(sanitizeText("█▀▄")).toBe("█▀▄")
  })

  test("removes lone surrogates but keeps valid pairs", () => {
    expect(sanitizeText("a\ud800b\udfffc")).toBe("abc")
    expect(sanitizeText("a🙂b")).toBe("a🙂b")
  })
})

describe("sanitizeForToast", () => {
  test("collapses whitespace, removes controls, and truncates", () => {
    const value = sanitizeForToast("a\x1b[31m\n b\x07c", 20)
    expect(value).not.toContain("\x1b")
    expect(value).not.toContain("\x07")
    expect(value).not.toContain("\n")
    expect(value).toBe("a[31m bc")

    const long = sanitizeForToast("x".repeat(300), 20)
    expect(long).toHaveLength(20)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("isValidColor", () => {
  test("accepts hex and known names", () => {
    expect(isValidColor("#fff")).toBe(true)
    expect(isValidColor("#ffff")).toBe(true)
    expect(isValidColor("#ffffff")).toBe(true)
    expect(isValidColor("#ffffffff")).toBe(true)
    expect(isValidColor("red")).toBe(true)
    expect(isValidColor("transparent")).toBe(true)
  })

  test("rejects controls, unknown names, and long strings", () => {
    expect(isValidColor("#fff\x1b[2J")).toBe(false)
    expect(isValidColor("\u009b31m")).toBe(false)
    expect(isValidColor("not-a-color")).toBe(false)
    expect(isValidColor("x".repeat(100))).toBe(false)
  })
})

describe("isValidPathString", () => {
  test("accepts normal paths", () => {
    expect(isValidPathString("/tmp/art.txt")).toBe(true)
    expect(isValidPathString("~/art.txt")).toBe(true)
  })

  test("rejects empty, control, null, and overlong paths", () => {
    expect(isValidPathString("")).toBe(false)
    expect(isValidPathString("a\nb")).toBe(false)
    expect(isValidPathString("a\0b")).toBe(false)
    expect(isValidPathString("a".repeat(MAX_PATH_LENGTH + 1))).toBe(false)
  })
})
