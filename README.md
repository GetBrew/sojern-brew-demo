# Brew headless email studio

A small, working integration guide and email studio for any Brew account. Hosted at https://sojern-brew-demo.vercel.app.

Source: [https://github.com/GetBrew/sojern-brew-demo](https://github.com/GetBrew/sojern-brew-demo). The standalone repository belongs to GetBrew. The live demo and source ZIP are public.

Start with [Antonio's POC guide](docs/POC-GUIDE.md). It covers the first live
test, local setup, the four implementation milestones and acceptance checks.
Use [the message draft](docs/ANTONIO-MESSAGE.md) when sharing the handoff.
Coding agents should read [AGENTS.md](AGENTS.md) before changing this repository;
the [detailed guide](web/implementation-guide.md#prompts-for-implementation-agents)
contains the complete implementation prompts for Sojern's application.

The live workspace, implementation guide and agent prompts are public. Download the [Markdown](https://sojern-brew-demo.vercel.app/sojern-implementation-guide.md), [PDF](https://sojern-brew-demo.vercel.app/sojern-implementation-guide.pdf) or [complete example source](https://sojern-brew-demo.vercel.app/headless-email-studio.zip) without signing in. Supply your own Brew credentials to run account actions.

Enter an API key in the UI, discover your brands, extract a website, create/AI-edit emails, remix a selected template into another language, rename groups/emails, manually edit the embedded canvas, and retrieve exact saved HTML. No login provider, database, fixed organization, sample IDs, sending, or automatic AI-edit retries.

## Credentials

The entered API key stays in page memory and travels over HTTPS only to the stateless same-origin function. The function uses the official `@brew.new/sdk` and never falls back to an environment API key. Disconnect or reload clears the key. Browser session storage contains only a public visitor ID, selected resource IDs and idempotency intents, never credentials.

Use an organization key with `brands` and `emails` permissions for the complete workflow. Brand-scoped keys discover their single brand and work within their existing permissions. Extraction needs organization scope and spare brand capacity. AI operations use account credits.

Optionally enter a publishable canvas client ID. In Brew Settings → API → Client apps, an organization admin can choose All brands (current and future) or one specific brand; members can select only an authorized brand. Allow the exact host origin and enable editing. The demo keeps the ID at connection scope and passes the selected brandId with every canvas target through SDK 13.2. Brew rejects brands outside that ID’s scope. Leaving the ID blank uses editable, backend-issued API-key sessions. Disconnect, reload or account change clears the ID. A client ID grants no brand-management or generation API access.

## Run

Use Node 24 (Node 22.18+ also supported).

```sh
git clone https://github.com/GetBrew/sojern-brew-demo.git
cd sojern-brew-demo
npm ci --ignore-scripts
npm run check
npm run build
cp .env.example .env.local
```

In `.env.local`, set `DEMO_ORIGIN` to `http://localhost:4400` and `DEMO_SESSION_SECRET` to a random signing secret (generate with `openssl rand -hex 32`). Then run `npm run dev` and open http://localhost:4400. The development server reads this ignored file; it binds only to loopback. No `BREW_API_KEY` environment variable is needed. The embedded canvas defaults to production https://brew.new. Enter the API key in the UI.

Deploy as a Vercel project: build `npm run build`, output `public`, Node 24, function duration 300 seconds. Configure both host variables for that deployment's exact origin. The browser talks only to `/api/demo` and Brew's canvas/client-ID endpoints; API keys never appear in URLs or iframe messages. Public deployment needs no Vercel login protection on the intended demo domain.

Run `npm run check` before deployment. `npm run build` enforces strict TypeScript checks before bundling and verifies that the included PDF matches the Markdown. Dependencies are pinned in `package-lock.json`; Vercel installs with `npm ci --ignore-scripts`. Do not configure a fallback organization API key on the deployment.

The download includes the guide PDF and Markdown. These are shareable implementation references. For a production staff application, retain existing staff authentication/authorization and keep the organization's API key on your own backend, rather than accepting staff-supplied keys as this playground does.

## Verification

`npm run check` verifies formatting, strict TypeScript, isolated API/security tests and the browser build. `npm test` checks credential isolation, explicit brand scoping, origin admission, signed canvas receipt ownership, invalid input and write-result recovery. Test an actual allowed client ID on the deployed origin. The guide includes complete agent prompts and end-to-end acceptance criteria.

The picker is a small React island built with shadcn-style Radix dropdown menus. The rest remains a static guide and one stateless API function. SDK 13.2 supports organization-wide client IDs with explicit brand context, exact displayed selection events and clearSelection. Each ready brand opens a group canvas, including empty groups. New generation and AI-edit results update its live subscriptions without replacing the iframe. Switching brands/groups or explicitly reopening creates a new scoped iframe. Supply a localized subject line; locale prompts guide AI translation and preserve the template layout and approved facts. The reference API reads latest; exact historical references require cloning first.

The hosted canvas uses Brew's shared GPU renderer and needs WebGPU or WebGL2. Handle the SDK's `onError` callback when GPU initialization fails. The parent app does not load or bundle a separate renderer.

## Source layout

| File                               | Responsibility                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `web/app.ts`                       | Account connection, brand/email actions, exact-version selection and the persistent SDK controller.  |
| `web/email-picker.tsx`             | Small React/Radix nested group/email menu.                                                           |
| `api/demo.ts`                      | Same-origin POST handler; validates input and invokes the official server SDK with the supplied key. |
| `lib/contracts.ts`                 | UI/function response types derived from public SDK types; unknown-error handling.                    |
| `lib/security.ts`                  | Origin and credential admission; signed, expiring canvas ownership receipts.                         |
| `web/implementation-guide.md`      | Canonical handoff and complete agent prompts.                                                        |
| `build.mjs`, `dev.mjs`, `scripts/` | Bundle, local server, isolated tests and shareable handoff packaging.                                |

The function exposes only authoring actions: `brands`/`extract`/`read`/`brandPatch`, `groups`/`createGroup`/`renameGroup`, `emails`/`generate`/`edit`/`renameEmail`/`html`, and `canvas`/`revoke`. It accepts JSON with an `action`, an explicit `brandId` when applicable, and action fields. Every request requires the exact configured origin and `Authorization: Bearer <user-supplied-key>`. Errors return `{ error: { code, message, ... }, trace, elapsedMs }` with no-store caching. Trace entries contain method/path/status/timing/request ID, never request headers or bodies.

Keep the SDK controller mounted for one brand/group/credential tuple. API writes update the canvas through its subscriptions. Selection callbacks can expose unresolved or historical versions; flush and retain the exact saved ID before HTML retrieval. Before an AI edit, release the editing lease with `clearSelection()` and preserve the requested baseline. On disconnect, flush, destroy the iframe, wait for in-flight grants and revoke the owned backend session. Generation uses stable per-intent idempotency keys; AI edits are never retried automatically.

## Update the handoff

Edit `web/implementation-guide.md` first. The build extracts its four complete agent prompts for the live page, so the copied prompts match the Markdown and PDF. Update interactive code snippets in `web/guide-content.ts` when the integration examples change.

To regenerate the PDF after editing the guide, install ReportLab and the DejaVu Sans fonts in a Python/Linux environment and run `python3 scripts/build-pdf.py`. The normal Node build needs no Python; it checks the included PDF and content manifest and fails if the handout is stale. Then run `npm run check` and `python3 scripts/package-source.py` to refresh the downloadable source. The source archive uses an explicit allowlist and rejects API-key patterns. Do not include `.artifacts`, credentials or local environment files in a deployment or archive.

The implementation guide includes the demo sequence, account requirements, current API boundaries and pilot acceptance checks. It distinguishes earlier extraction evidence, the current production checks and configuration-dependent paths. Record validation evidence for your own deployment using the POC guide's acceptance checks.
