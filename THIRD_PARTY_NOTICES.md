# Third-party notices

Quota Island is an independent project, not an official product of Anthropic,
Google or OpenAI. Provider names identify the user's connected services.

## Google Gemini CLI OAuth configuration

The public installed-application OAuth client configuration, OAuth scopes,
and Code Assist quota endpoint conventions in `src/gemini.ts` are referenced
from the Google Gemini CLI project:

- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts
- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/types.ts
- Copyright 2025 Google LLC; Apache License 2.0.
- License: https://github.com/google-gemini/gemini-cli/blob/main/LICENSE

The application uses a public desktop client configuration, so Google's
consent page may identify it as Gemini CLI. This is disclosed in the app.
The embedded OAuth client secret is a public installed-app value, not a user
credential. User tokens are never included in the source or UI.
Quota Island implements its own state-validated, loopback-only PKCE callback
and encrypted credential storage using `google-auth-library` and Electron
`safeStorage`. It does not bundle the Gemini CLI or its agent/tool runtime.

## Other dependencies

- Inter variable font: Copyright the Inter Project Authors, SIL Open Font
  License 1.1. The font and its license are bundled in `dist/ui/fonts/`.
  https://github.com/rsms/inter

- Codex icon: OpenAI's Codex artwork, sourced from the locally installed official
  OpenAI VS Code extension `openai.chatgpt` version `26.1021.22027-win32-x64`,
  asset `codex_new-f14177b03534.svg`. Used solely to identify the connected
  provider; the original geometry is preserved with a light monochrome fill
  for the dark UI. OpenAI trademarks remain OpenAI's property.
  https://openai.com/brand/

- Electron: MIT; Chromium and other notices are included in the distribution's
  `LICENSE` and `LICENSES.chromium.html`.
- google-auth-library: Apache-2.0; https://github.com/googleapis/google-auth-library-nodejs
- ws: MIT; Copyright Einar Otto Stangvik, Arnout Kazemier and contributors,
  Luigi Pinca and contributors. The dependency and its LICENSE are bundled.
  https://github.com/websockets/ws
- Dependency versions and transitive dependencies are recorded in `package-lock.json`.

QuotaDeck, AI Quota Deck and QuotaPulse were researched as references. Their
implementation code and assets are not included in this application.

Ocelin (https://github.com/m-sanchez/ocelin, MIT) was studied as a design
reference for bounded local-session reads and lifecycle reconciliation. The
Quota Pebble metadata-only collector is independently implemented; Ocelin's
runtime, UI, conversation preview and assets are not bundled.

lucianlamp/codex-monitor (https://github.com/lucianlamp/codex-monitor, MIT)
was studied as a reference for the Remote Control challenge/proof protocol.
Pebble's Windows CNG helper and read-only transport are independently implemented;
the upstream executable and the official Desktop App native binaries are not bundled.

cctop (https://github.com/tomstagl/cctop, MIT) and
antigravity-trajectory-extractor
(https://github.com/jijiamoer/antigravity-trajectory-extractor, MIT) were studied
as references for native registry metadata and local RPC discovery. Pebble's
read-only collectors are independently implemented. Their runtimes, Hook
integrations, transcript exporters and assets are not bundled.

fast-xml-parser (https://github.com/NaturalIntelligence/fast-xml-parser), MIT, is bundled for bounded RSS/Atom parsing. Its license and those of its production dependencies are retained in node_modules inside the package.
