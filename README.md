# anton-vs

A **VS Code** extension that searches actors, places and keywords **live in
[Anton](https://kr.anton.ch)** and writes the matched id into an attribute of the
TEI/XML element under the caret. It is the VS Code counterpart of the
[anton-oxy](../anton-oxy) Oxygen XML Editor plugin and speaks the same public API.

It issues **one `?search=` request per query** (`GET /api/actors`,
`GET /api/places`, `GET /api/keywords`) — it never downloads a whole register. Anton
returns the full id (including the project slug) ready to use, and the search
endpoints are public (no authentication).

Element→register mapping, the target attribute, the id-value template and the base
URL are all **configurable**, so the extension works for any Anton tenant and tagging
scheme.

The default mapping:

| Element      | Register   | Attribute  | Example written value          |
| ------------ | ---------- | ---------- | ------------------------------ |
| `persName`   | `actors`   | `@ref`     | `ref="kr-actors-123"`          |
| `orgName`    | `actors`   | `@ref`     | `ref="kr-actors-123"`          |
| `placeName`  | `places`   | `@ref`     | `ref="kr-places-45"`           |
| `objectName` | `keywords` | `@ref`     | `ref="kr-keywords-6"`          |
| `term`       | `keywords` | `@ref`     | `ref="kr-keywords-8"`          |
| `unit`       | `keywords` | `@corresp` | `corresp="kr-keywords-12"`     |

(`persName` also covers organisations / Körperschaften. `unit` uses `@corresp` instead
of `@ref` — see the per-element attribute override below.)

## How it works

Trigger the action with **Ctrl+Shift+A** (macOS **Cmd+Shift+A**), the
**⧉ button in the editor title bar**, the command palette (**“Anton: Referenz einfügen
/ Auswahl taggen”**) or the editor context menu. All four appear only for XML/TEI/XSLT
documents. Two ways to start, then the same live search:

**A — caret in an existing element** (set/replace the reference):

1. Put the caret inside a mapped element (e.g. `<persName>…</persName>`).
2. Trigger the action. A search box opens, pre-filled with the element text. Results
   update live as you type.
3. Pick a hit (**Enter**) → the extension sets or replaces the attribute on that
   element. Other attributes are preserved.

**B — select bare text** (*Wrap & Tag*, the fast path):

1. Select an untagged name/place/term and trigger the action.
2. Choose which element to wrap the selection in (`persName`, `placeName`, …) — the
   register follows that choice.
3. Pick a hit → the selection is wrapped as `<persName ref="…">selected text</persName>`
   in one step.

**Serial tagging.** Every hit in the results list has a **▶ button** (“Einfügen &
weiter”). Clicking it inserts the reference, then jumps to and selects the **next
occurrence of the same text** and reopens the search — so tagging every mention of a
person is a rhythm of *pick → ▶ → pick → ▶*. The previously chosen wrap element stays
preselected. (Plain **Enter** inserts once and closes.)

**Switch register.** When more than one register is configured, the search box shows a
**list button** (top-right) to search a different register without leaving the dialog.

## Requirements

- **VS Code 1.85 or newer.** No runtime dependencies — uses Node's built-in HTTP client
  and the VS Code QuickPick API.

## Install

### From a `.vsix` (end users / customers, no Marketplace)

The extension does **not** need the VS Code Marketplace. Every tagged release attaches a
ready-to-install `.vsix` to its [GitHub Release](https://github.com/kraenzle-ritter/anton-vs/releases) —
download that file and install it directly.

**Command line:**

```bash
code --install-extension anton-vs-1.0.0.vsix
```

**Or in the VS Code UI:** open the **Extensions** panel → the **`…` menu** (top right) →
**“Install from VSIX…”** → pick the downloaded file.

Everything works exactly as via the Marketplace (settings, keybinding, menus). The only
difference: **`.vsix` installs are not auto-updated** — to move to a newer version,
download the new `.vsix` from the latest Release and install it over the old one.

### From source (development)

```bash
npm install
npm run compile
```

Then press **F5** in VS Code to launch an *Extension Development Host* with anton-vs
loaded. Set your Anton URL under **Settings → Extensions → Anton** (default
`https://kr.anton.ch`).

### Package as a `.vsix`

```bash
npm install
npm run package                 # -> anton-vs-1.0.0.vsix (runs compile first)
code --install-extension anton-vs-1.0.0.vsix
```

### Releases (CI)

- **`.github/workflows/ci.yml`** — compiles and runs the offline tests on every push
  and pull request.
- **`.github/workflows/release.yml`** — on a pushed `v*` tag it syncs `package.json` to
  the tag version, compiles, tests, builds the `.vsix`, and attaches it to a GitHub
  Release. If a `VSCE_PAT` repository secret is set, it also publishes to the VS Code
  Marketplace.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## Configuration

**Settings → Extensions → Anton** (or run **“Anton: Einstellungen öffnen”**). All
settings live under the `anton.*` namespace in `settings.json`:

| Setting             | Meaning                                                                | Default |
| ------------------- | ---------------------------------------------------------------------- | ------- |
| `anton.baseUrl`     | Anton instance / tenant URL.                                           | `https://kr.anton.ch` |
| `anton.perPage`     | Hits requested per search (page size).                                 | `30` |
| `anton.attribute`   | Default attribute that receives the id.                                | `ref` |
| `anton.template`    | Value written into the attribute. Placeholders: `{fullId}` `{slug}` `{register}` `{id}`. | `{fullId}` |
| `anton.mapping`     | Array of `element=register` entries; an `@attribute` suffix overrides the attribute for that element. | see below |
| `anton.insecureTls` | Accept self-signed / untrusted TLS certs (local DDEV/mkcert hosts).    | `false` |

Default mapping (editable):

```jsonc
"anton.mapping": [
  "persName=actors",
  "orgName=actors",
  "placeName=places",
  "objectName=keywords",
  "term=keywords",
  "unit=keywords@corresp"   // per-element attribute override: writes @corresp
]
```

Example — write `#kr-actors-123` into `@key` instead of `@ref`:

```jsonc
"anton.attribute": "key",
"anton.template": "#{fullId}"
```

## Tests

```bash
npm test
```

Offline sanity checks (no network): mapping parsing and per-element attribute
overrides, id-value templates, element location with attribute preservation and
nesting, Wrap & Tag escaping, and next-occurrence search.

## Project structure

```
package.json          extension manifest: commands, keybinding, settings, menus
tsconfig.json
src/
  extension.ts        activate + command orchestration, live-search QuickPick, serial tagging
  config.ts           reads the anton.* workspace settings
  configCore.ts       pure: mapping parsing + id-value template (no vscode import)
  refTargets.ts       pure: locate element under caret, rebuild tag, wrap, next occurrence
  antonClient.ts      HTTP client for /api/{register}
  types.ts            AntonEntity
test/manual.test.js   offline tests for the pure logic
```

## Differences from anton-oxy

- Oxygen has **Text and Author (WYSIWYG)** modes; VS Code edits XML as **text**, so the
  logic here is the Text-mode path only (which is why serial "next occurrence" always
  works).
- Settings are VS Code workspace/user settings instead of Oxygen's options storage.
- The live search is a native VS Code **QuickPick**; VS Code applies its own fuzzy
  filtering on top of the server results.

## License

MIT — see [LICENSE](LICENSE).
