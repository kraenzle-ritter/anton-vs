# Changelog

All notable changes to **anton-vs** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions match the pushed `v*` git tags.

## [1.2.0]

### Added
- **“Anton: Referenz entfernen” command** — clears the reference attribute from the mapped
  element under the caret, preserving all other attributes. Available in the editor context
  menu and the command palette (no default keybinding).

## [1.1.0]

### Added
- **“In Anton öffnen” button** on every search hit (↗ icon) — opens the entity’s Anton
  detail page in the browser to verify a match before tagging. Uses the `permalink`
  returned by the API; the picker stays open.

### Changed
- **Actionable network errors.** TLS/DNS failures now show a hint that names the setting
  to fix instead of the raw Node message — e.g. a host not covered by the certificate
  (mistyped tenant subdomain) points at `anton.baseUrl`, self-signed certs point at
  `anton.insecureTls`.

## [1.0.1]

### Changed
- **macOS default keybinding is now `Cmd+Alt+A`** (was `Cmd+Shift+A`, which collides with
  Alfred). Windows/Linux stays `Ctrl+Shift+A`.

## [1.0.0]

### Added
- Initial release. Live search of actors / places / keywords in Anton, writing the matched
  id into a configurable attribute (default `@ref`) of the TEI element under the caret.
- **Wrap & Tag** for bare text selections; **serial tagging** (“Einfügen & weiter”) that
  jumps to the next occurrence of the same text.
- Configurable element→register mapping, target attribute, id-value template and base URL;
  optional lenient TLS for local hosts.
- CI (compile + offline tests) and a tag-triggered Release workflow that builds the `.vsix`
  and, with a `VSCE_PAT` secret, publishes to the VS Code Marketplace.
