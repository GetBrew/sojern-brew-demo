# Working on the Sojern Brew demo

This repository is a standalone, runnable consumer of the public Brew SDK. It is
the source for https://sojern-brew-demo.vercel.app. Keep the integration small:
a static TypeScript UI, a React/Radix menu island and one stateless API function.

## Read first

1. `README.md`: setup, credentials, source map and release steps.
2. `docs/POC-GUIDE.md`: Antonio's testing and integration path.
3. `web/implementation-guide.md`: detailed API contracts and complete agent prompts.
4. `lib/contracts.ts`: UI/function types derived from `@brew.new/sdk`.

The public SDK documentation is authoritative for API behavior:
https://docs.brew.new/sdks/typescript/white-label-email-editor and
https://docs.brew.new/sdks/typescript/embedded-email-canvas.
Do not invent SDK methods or unsupported brand-management operations.

## Run and check

Use Node 24 and the committed npm lockfile:

```sh
npm ci --ignore-scripts
npm run check
cp .env.example .env.local
# Configure DEMO_SESSION_SECRET and the exact DEMO_ORIGIN.
npm run dev
```

`npm run check` runs formatting, strict types, isolated Node tests and the
browser build. Tests mock Brew and do not need account credentials. The compiled
ESM test catches server imports that work in TypeScript but fail after emission.
Keep `rewriteRelativeImportExtensions` enabled in `tsconfig.json`.

For behavior changes, add a meaningful regression test, observe it fail, then
make the smallest fix. For documentation changes, check formatting, links and
handoff consistency. Do not add infrastructure or a framework migration for a
simple integration change.

## Contracts to preserve

- The playground accepts a user-supplied API key in page memory. It sends the key
  only to the same-origin function over HTTPS and clears it on disconnect or
  reload. Never add an environment API-key fallback or store credentials in
  browser storage, logs, traces, source, prompts or downloads.
- A real Sojern staff integration keeps organization keys on its backend and
  retains existing SSO, hotel authorization and CSRF protection. This playground
  is not that staff authorization layer.
- Resolve the authorized hotel-to-brand mapping on the backend. `withBrand()`
  chooses context; it does not restrict the underlying organization credential.
  Authorize email, reference, group, version and session ownership too.
- Persist extraction and generation receipts before follow-up reads. Keep one
  idempotency key per creation intent. Never automatically retry an AI PATCH;
  reconcile ambiguous outcomes and recover committed result receipts.
- Generation can return a saved design or a prose response. Handle both.
- `referenceEmailId` uses the source's latest saved content. For an exact
  historical reference, clone that version first. Keep separate emails per
  locale and require designer review of AI translations and facts.
- Use the published shared canvas from `@brew.new/sdk/embed`. Do not fork,
  reimplement or bundle a separate renderer.
- Keep one controller/iframe for a brand, group and credential tuple. Creation,
  edits and version callbacks must not remount it. Scope changes may replace it.
- Selection exposes `emailId`, `emailVersion` and nullable `emailVersionId`.
  Clear stale pins during unresolved/deselected transitions. Snapshot the
  requested baseline before awaits; callbacks can update current selection.
- Await `flush()` before export/navigation. Before an API AI edit, await
  `clearSelection()` to save and release the editor lease, then focus the result.
  A failed flush must block completion. Read exact saved-version HTML.
- Backend-issued sessions require explicit owned-session renewal and revocation.
  Publishable client-ID sessions use the SDK's managed lifecycle. An All brands
  client ID still needs explicit `brandId` and remains organization-scoped.
- API-key sessions are editable by default. Client-ID editing and exact allowed
  origins come from its app configuration. Preserve origin admission, signed
  receipt ownership checks and no-store API responses.
- The demo authors and exports email. It does not send email.

## Handoff and deployment

Edit `web/implementation-guide.md` as the detailed source of truth. Its four
agent prompts feed the live Copy controls. If it changes, regenerate the PDF:

```sh
python3 scripts/build-pdf.py
npm run check
python3 scripts/package-source.py
```

PDF regeneration needs ReportLab and DejaVu Sans fonts. Normal Node builds use
the committed PDF and reject a stale handout. Commit the PDF, handout manifest
and refreshed source ZIP when their inputs change. CI checks archive contents.
Update the focused POC guide when the customer-facing path changes.

Vercel uses Node 24, `npm ci --ignore-scripts`, `npm run build` and output
`public`. Configure only the host's exact `DEMO_ORIGIN` and a random
`DEMO_SESSION_SECRET` through runtime settings. Preserve the existing production
project and its secrets. Never publish local environment files or `.artifacts`.

Live account checks are separate from CI. Use controlled test hotels and pin
email/version IDs before content writes; do not select an arbitrary recent
email. Account capacity and AI credits apply. Record actual results and any
untested path; a browser protocol fixture does not prove production client-ID
authorization or hardware performance.
