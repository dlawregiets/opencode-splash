/** @jsxImportSource @opentui/solid */
import type { ColorInput } from "@opentui/core"
import type { AnsiStyle, ArtRow, ArtSegment } from "./ansi.ts"
import { MAX_ART_COLUMNS, MAX_ART_ROWS, MAX_ART_SEGMENTS_PER_LINE, isHexColor, sanitizeText } from "./safety.ts"

export type SplashProps = {
  readonly rows: readonly ArtRow[]
  readonly width: number
  readonly background: ColorInput
  readonly color: ColorInput
  readonly hintColor: ColorInput
  readonly hint: string
}

function spanStyle(style: AnsiStyle, fallback: ColorInput) {
  const fg = style.fg !== undefined && isHexColor(style.fg) ? style.fg : fallback
  const bg = style.bg !== undefined && isHexColor(style.bg) ? style.bg : undefined
  return {
    fg,
    ...(bg !== undefined ? { bg } : {}),
    ...(style.bold ? { bold: true } : {}),
    ...(style.dim ? { dim: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.strikethrough ? { strikethrough: true } : {}),
    ...(style.reverse ? { reverse: true } : {}),
    ...(style.blink ? { blink: true } : {}),
  }
}

function clampRows(rows: readonly ArtRow[]): ArtRow[] {
  const output: ArtRow[] = []

  for (const row of rows.slice(0, MAX_ART_ROWS)) {
    let budget = MAX_ART_COLUMNS
    let count = 0
    const segments: ArtSegment[] = []

    for (const segment of row) {
      if (budget <= 0 || count >= MAX_ART_SEGMENTS_PER_LINE) break
      count += 1
      const raw =
        segment.text.length > MAX_ART_COLUMNS * 2
          ? segment.text.slice(0, MAX_ART_COLUMNS * 2)
          : segment.text
      const text = sanitizeText(raw)
      if (text.length === 0) continue
      const characters = Array.from(text)
      const take = characters.slice(0, budget).join("")
      if (take.length === 0) continue
      budget -= Array.from(take).length
      segments.push({ text: take, style: segment.style })
    }

    output.push(segments)
  }

  return output
}

export function Splash(props: SplashProps) {
  const numericWidth = Number.isFinite(props.width) ? props.width : MAX_ART_COLUMNS
  const width = Math.max(1, Math.min(numericWidth, MAX_ART_COLUMNS))
  const rows = clampRows(props.rows)
  const hint = sanitizeText(props.hint)

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={1_000_000}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={1}
      backgroundColor={props.background}
    >
      <box width={width} flexDirection="column">
        {rows.map((row) => (
          <text wrapMode="none">
            {row.length === 0
              ? " "
              : row.map((segment) => (
                  <span style={spanStyle(segment.style, props.color)}>
                    {segment.text}
                  </span>
                ))}
          </text>
        ))}
      </box>
      <text fg={props.hintColor} wrapMode="none">
        {hint}
      </text>
    </box>
  )
}
