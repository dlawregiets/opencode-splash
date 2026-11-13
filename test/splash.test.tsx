/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { makeArt } from "../src/art.ts"
import { MAX_ART_COLUMNS } from "../src/safety.ts"
import { Splash } from "../src/splash.tsx"

test("renders art and the hint", async () => {
  const art = makeArt(["█████  ██████"], "test")
  const setup = await testRender(
    () => (
      <Splash
        rows={art.rows}
        width={art.width}
        background="#101010"
        color="#0766D1"
        hintColor="#888888"
        hint="esc to skip"
      />
    ),
    { width: 80, height: 24 },
  )

  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("█████  ██████")
  expect(frame).toContain("esc to skip")

  await setup.dispose()
})

test("renders ANSI colors", async () => {
  const art = makeArt(
    ["\x1b[31mRED\x1b[0m \x1b[38;2;0;255;0mGREEN\x1b[0m"],
    "test",
  )
  const setup = await testRender(
    () => (
      <Splash
        rows={art.rows}
        width={art.width}
        background="#101010"
        color="#ffffff"
        hintColor="#888888"
        hint="hint"
      />
    ),
    { width: 40, height: 10 },
  )

  await setup.renderOnce()
  const spans = setup.captureSpans().lines.flatMap((line) => line.spans)
  expect(spans.find((span) => span.text === "RED")?.fg.toInts()).toEqual([128, 0, 0, 255])
  expect(spans.find((span) => span.text === "GREEN")?.fg.toInts()).toEqual([0, 255, 0, 255])

  await setup.dispose()
})

test("falls back for malformed style colors", async () => {
  const rows = [[{ text: "X", style: { fg: "#NaNNaNNaN", bg: "#0102NaN" } }]]
  const setup = await testRender(
    () => (
      <Splash
        rows={rows}
        width={1}
        background="#101010"
        color="#ffffff"
        hintColor="#888888"
        hint="hint"
      />
    ),
    { width: 20, height: 5 },
  )

  await setup.renderOnce()
  const spans = setup.captureSpans().lines.flatMap((line) => line.spans)
  const x = spans.find((span) => span.text.includes("X"))
  expect(x?.fg.toInts()).toEqual([255, 255, 255, 255])

  await setup.dispose()
})

test("clamps hostile row counts and widths", async () => {
  const row = [{ text: "A".repeat(5_000), style: {} }]
  const rows = Array.from({ length: 1_000 }, () => row)
  const setup = await testRender(
    () => (
      <Splash
        rows={rows}
        width={1_000_000}
        background="#101010"
        color="#ffffff"
        hintColor="#888888"
        hint="hint"
      />
    ),
    { width: 80, height: 24 },
  )

  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  expect(frame.length).toBeLessThan(100_000)
  for (const span of setup.captureSpans().lines.flatMap((line) => line.spans)) {
    expect(span.text.length).toBeLessThanOrEqual(MAX_ART_COLUMNS)
  }

  await setup.dispose()
})

test("never renders control or format characters", async () => {
  const art = makeArt(["A\u009b2JB\u202eC\u0007D"], "test")
  const setup = await testRender(
    () => (
      <Splash
        rows={art.rows}
        width={art.width}
        background="#101010"
        color="#ffffff"
        hintColor="#888888"
        hint="hint"
      />
    ),
    { width: 80, height: 10 },
  )

  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  const line = frame.split("\n").find((value) => value.includes("ABCD"))
  expect(line).toBeDefined()
  expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/)

  await setup.dispose()
})
