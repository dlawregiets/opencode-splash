# opencode-splash

A full-screen, theme-aware startup splash for the [OpenCode](https://opencode.ai) TUI, with configurable ASCII art for large, medium, and small terminals.

The banner below is example art. The plugin only shows a splash when at least one art path is configured.

```text
█████ ████  █      ███  █████ █   █
█     █   █ █     █   █ █     █   █
█████ ████  █     █████ █████ █████
    █ █     █     █   █     █ █   █
█████ █     █████ █   █ █████ █   █
```

## Requirements

- OpenCode 2.2 or newer
- A terminal with Unicode half-block support for block-style art
- Truecolor is recommended; 256-color terminals will approximate custom colors

## Install

Install from GitHub with the OpenCode CLI:

```sh
opencode plugin add github:dlawregiets/opencode-splash
```

The plugin is TUI-only, so its options are read from the terminal config at `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`). Add or update the plugin entry there:

```json
{
  "plugins": [
    {
      "package": "opencode-splash",
      "options": {
        "duration": 4000,
        "art": {
          "large": "/home/me/art/splash-large.txt",
          "medium": "/home/me/art/splash-medium.txt",
          "small": "/home/me/art/splash-small.txt"
        }
      }
    }
  ]
}
```

Art paths are required for a splash; with no art configured, the plugin shows nothing. If `opencode plugin add` recorded the package in `opencode.json`, make sure the entry is in `cli.json` instead — `opencode.json` options are not passed to the TUI part.

TUI-only plugins are loaded by the terminal client and remain active when connected to a remote server.

## Configure

```json
{
  "plugins": [
    {
      "package": "opencode-splash",
      "options": {
        "duration": 4000,
        "background": "theme",
        "size": "auto",
        "art": {
          "large": "/home/me/art/splash-large.txt",
          "medium": "/home/me/art/splash-medium.txt",
          "small": "/home/me/art/splash-small.txt"
        }
      }
    }
  ]
}
```

| Option       | Type                                             | Default   | Description |
| ------------ | ------------------------------------------------ | --------- | ----------- |
| `duration`   | number (milliseconds)                            | `4000`    | How long the splash stays visible. `0` keeps it up until a key is pressed. Clamped to 0–60000. |
| `background` | string                                           | `"theme"` | `"theme"` uses the active theme background. Otherwise a hex color or supported color name; invalid values fall back to the theme. |
| `color`      | string                                           | theme text | Art color: hex or a supported color name. Defaults to the theme's primary text color. |
| `size`       | `"auto" \| "large" \| "medium" \| "small"`       | `"auto"`  | Force an art size, or choose the best size for the terminal. |
| `art`        | `{ large?, medium?, small? }`                    | `{}`      | Paths to UTF-8 text files containing the art for each size. |

### Art files

- Plain UTF-8 text, one terminal row per line.
- Leading spaces are preserved; trailing whitespace is trimmed.
- Empty lines at the top and bottom of the file are removed. Blank lines inside the art are preserved.
- ANSI SGR color codes are supported. Text without a color uses the `color` option. All non-SGR escape sequences and every C0/C1 control, DEL, bidi/format character, and Unicode line/paragraph separator are removed. Tabs become spaces.
- Relative paths resolve from the current working directory. `~/` is expanded. Absolute paths are recommended.
- The file is measured in visible characters, so ANSI codes do not affect centering.
- Only regular files are read. Limits are 1 MiB per file, 256 rows, 1,024 characters per row, 16,384 raw characters per line, and 10,000 style runs. Files outside these limits are rejected.

### ANSI colors

Supported SGR codes:

- 16-color foreground: `30`–`37`, `90`–`97`
- 16-color background: `40`–`47`, `100`–`107`
- 256-color: `38;5;N` and `48;5;N`
- 24-bit: `38;2;R;G;B` and `48;2;R;G;B`
- Attributes: `1` bold, `2` dim, `3` italic, `4` underline, `5` blink, `7` reverse, `9` strikethrough
- Reset: `0`, `22`, `23`, `24`, `25`, `27`, `29`, `39`, `49`

Example sequences:

```text
\x1b[31mred\x1b[0m
\x1b[38;5;208morange\x1b[0m
\x1b[38;2;255;255;0myellow\x1b[0m
\x1b[1;4mbold underline\x1b[0m
```

The escape byte may appear as `\e`, `\x1b`, or `^[` in your editor. A ready-made truecolor example is included at `examples/rainbow.txt`; point `art.large` at it to try it.

### Size selection

With `"size": "auto"`, the plugin picks the largest configured art that fits the terminal. If none fit, it uses the smallest configured art. If a size is forced but that file is missing, it falls back to another configured size.

If no art paths are configured, no splash is shown.

### Behavior

- Shows once per TUI launch. Memory storage survives plugin hot reloads, so `/reload` does not replay the splash.
- The background uses `theme.background.base`; if that is transparent it falls back to `theme.background.raised.base`, then to a light or dark default based on the active theme mode.
- Dismisses automatically after `duration`, or on `escape`, `enter`, `space`, `tab`, `backspace`, a letter, or a digit.
- Printable keys are consumed while the splash is visible so the first characters typed do not leak into the prompt.
- If an art file cannot be read, is not a regular file, or exceeds a limit, a sanitized warning toast explains the problem and the splash falls back to another configured size. If no art can be loaded, no splash is shown.

## Examples

A fixed, light splash:

```json
{
  "plugins": [
    {
      "package": "opencode-splash",
      "options": {
        "duration": 2500,
        "background": "#FFFFFF",
        "color": "#0057B8",
        "art": {
          "large": "/home/me/art/logo-large.txt",
          "medium": "/home/me/art/logo-medium.txt",
          "small": "/home/me/art/logo-small.txt"
        }
      }
    }
  ]
}
```

Wait for a key instead of a timer:

```json
{
  "plugins": [
    {
      "package": "opencode-splash",
      "options": {
        "duration": 0,
        "size": "medium",
        "art": {
          "medium": "/home/me/art/banner.txt"
        }
      }
    }
  ]
}
```

## Local development

Point `opencode.jsonc` or `cli.json` at this checkout:

```json
{
  "plugins": ["/absolute/path/to/opencode-splash"]
}
```

Then run:

```bash
bun install
bun run check
```

`bun run check` runs the TypeScript typecheck and the unit tests.

## Publishing

```bash
npm publish
```

The package publishes TypeScript source and exports the `./tui` entrypoint, matching the OpenCode TUI plugin layout.

## License

MIT for the plugin code. See [LICENSE](LICENSE).
