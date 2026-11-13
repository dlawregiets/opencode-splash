import { describe, expect, test } from "bun:test"
import { makeArt } from "../src/art.ts"
import { parseAnsiLine, rowText, trimTrailingWhitespace } from "../src/ansi.ts"
import {
  MAX_ART_LINE_CHARS,
  MAX_ART_SEGMENTS_PER_LINE,
  MAX_CSI_LENGTH,
  MAX_SGR_PARAM_LENGTH,
  MAX_SGR_PARAMS,
  MAX_STRING_SEQUENCE_LENGTH,
} from "../src/safety.ts"

describe("parseAnsiLine", () => {
  test("leaves plain text unstyled", () => {
    expect(parseAnsiLine("plain")).toEqual([{ text: "plain", style: {} }])
  })

  test("parses basic foreground, background, and reset", () => {
    expect(parseAnsiLine("\x1b[31mred\x1b[0m")).toEqual([
      { text: "red", style: { fg: "#800000" } },
    ])
    expect(parseAnsiLine("\x1b[31;44mred\x1b[0m")).toEqual([
      { text: "red", style: { fg: "#800000", bg: "#000080" } },
    ])
    expect(parseAnsiLine("\x1b[91mred\x1b[0m")).toEqual([
      { text: "red", style: { fg: "#ff0000" } },
    ])
  })

  test("parses 256-color and truecolor values", () => {
    expect(parseAnsiLine("\x1b[38;5;196mX")).toEqual([
      { text: "X", style: { fg: "#ff0000" } },
    ])
    expect(parseAnsiLine("\x1b[38;2;12;34;56mX")).toEqual([
      { text: "X", style: { fg: "#0c2238" } },
    ])
    expect(parseAnsiLine("\x1b[48;5;21mX")).toEqual([
      { text: "X", style: { bg: "#0000ff" } },
    ])
  })

  test("parses attributes and turns them off", () => {
    expect(parseAnsiLine("\x1b[1;4mX\x1b[22;24mY")).toEqual([
      { text: "X", style: { bold: true, underline: true } },
      { text: "Y", style: {} },
    ])
    expect(parseAnsiLine("\x1b[3;5;7;9mX")).toEqual([
      { text: "X", style: { italic: true, blink: true, reverse: true, strikethrough: true } },
    ])
  })

  test("splits styled runs", () => {
    expect(parseAnsiLine("\x1b[31mred\x1b[32mgreen\x1b[0m")).toEqual([
      { text: "red", style: { fg: "#800000" } },
      { text: "green", style: { fg: "#008000" } },
    ])
  })

  test("strips cursor movement, OSC, and other escapes", () => {
    expect(parseAnsiLine("\x1b[2Ka\x1b[1;1Hb")).toEqual([
      { text: "ab", style: {} },
    ])
    expect(parseAnsiLine("\x1b]8;;https://example.com\x07link\x1b]8;;\x07")).toEqual([
      { text: "link", style: {} },
    ])
    expect(parseAnsiLine("\x1b(Btext")).toEqual([{ text: "text", style: {} }])
  })

  test("drops incomplete escape sequences", () => {
    expect(parseAnsiLine("a\x1b[31")).toEqual([{ text: "a", style: {} }])
    expect(parseAnsiLine("a\x1b")).toEqual([{ text: "a", style: {} }])
  })

  test("strips C0, DEL, bidi, format, and line separators", () => {
    expect(rowText(parseAnsiLine("A\u0000B\u0007C\u0008D\u007fE\u202eF\u200bG\u2028H\ufeffI")))
      .toBe("ABCDEFGHI")
    expect(rowText(parseAnsiLine("A\u0085B\u009cC"))).toBe("ABC")
  })

  test("normalizes 8-bit C1 introducers", () => {
    expect(parseAnsiLine("\u009b31mred")).toEqual([
      { text: "red", style: { fg: "#800000" } },
    ])
    expect(rowText(parseAnsiLine("a\u009d0;title\u009cb"))).toBe("ab")
    expect(rowText(parseAnsiLine("a\u0090payload\u009cb"))).toBe("ab")
    expect(rowText(parseAnsiLine("a\u001b\u001b]0;title\u0007b"))).toBe("ab")
  })

  test("rejects malformed and truncated SGR parameters", () => {
    expect(parseAnsiLine("\x1b[38;5;?mX")).toEqual([{ text: "X", style: {} }])
    expect(parseAnsiLine("\x1b[38;5mX")).toEqual([{ text: "X", style: {} }])
    expect(parseAnsiLine("\x1b[38;2;1;2mX")).toEqual([{ text: "X", style: {} }])
    expect(parseAnsiLine("\x1b[1:2mX")).toEqual([{ text: "X", style: {} }])
  })

  test("clamps valid extended-color values", () => {
    expect(parseAnsiLine("\x1b[38;5;999mX")).toEqual([
      { text: "X", style: { fg: "#eeeeee" } },
    ])
    expect(parseAnsiLine("\x1b[38;2;999;5;300mX")).toEqual([
      { text: "X", style: { fg: "#ff05ff" } },
    ])
  })

  test("caps SGR parameter count and length", () => {
    const many = "\x1b[" + "1;".repeat(MAX_SGR_PARAMS + 1) + "31mX"
    expect(parseAnsiLine(many)).toEqual([{ text: "X", style: {} }])

    const long = "\x1b[" + "1".repeat(MAX_SGR_PARAM_LENGTH + 1) + "mX"
    expect(parseAnsiLine(long)).toEqual([{ text: "X", style: {} }])
  })

  test("drops overlong CSI and OSC sequences", () => {
    expect(parseAnsiLine("\x1b[" + "0".repeat(MAX_CSI_LENGTH + 10) + "mX")).toEqual([])
    expect(
      parseAnsiLine("\x1b]8;;" + "A".repeat(MAX_STRING_SEQUENCE_LENGTH + 10)),
    ).toEqual([])
  })

  test("caps line length and style runs", () => {
    expect(() => parseAnsiLine("A".repeat(MAX_ART_LINE_CHARS + 1))).toThrow(RangeError)

    const runs = "\x1b[31mA".repeat(MAX_ART_SEGMENTS_PER_LINE + 1)
    expect(() => parseAnsiLine(runs)).toThrow(RangeError)
  })

  test("never emits control or format characters", () => {
    const attacks = [
      "\x1b]0;pwned\x07X",
      "\x1b]52;c;YWJj\x07X",
      "\x1b]8;;https://evil.example\x07link\x1b]8;;\x07",
      "\u009d0;title\u009cX",
      "\u009b6n\x1b[2J\x1b[1;1HX",
      "\x1b[?2004h\x1b[?1049hX",
      "\x1bP$q\x1b\\X",
      "\x1bcX",
      "\x1b[8;100;100tX",
      "\u001b\u001b]0;title\u0007X",
    ]

    for (const attack of attacks) {
      expect(rowText(parseAnsiLine(attack))).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u)
    }
  })
})

describe("row helpers", () => {
  test("joins visible text", () => {
    expect(rowText(parseAnsiLine("\x1b[31mred\x1b[0m blue"))).toBe("red blue")
  })

  test("trims trailing whitespace without losing style", () => {
    const row = parseAnsiLine("\x1b[31mred   \x1b[0m")
    expect(trimTrailingWhitespace(row)).toEqual([{ text: "red", style: { fg: "#800000" } }])
  })
})

describe("ANSI art measurement", () => {
  test("measures visible width and keeps plain lines", () => {
    const art = makeArt(
      ["\x1b[31mRED\x1b[0m", "\x1b[38;2;0;255;0mGREEN\x1b[0m"],
      "test",
    )
    expect(art.lines).toEqual(["RED", "GREEN"])
    expect(art.width).toBe(5)
    expect(art.height).toBe(2)
    expect(art.rows[0]?.[0]?.style.fg).toBe("#800000")
    expect(art.rows[1]?.[0]?.style.fg).toBe("#00ff00")
  })
})
