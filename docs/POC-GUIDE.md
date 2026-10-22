# Antonio's guide: Sojern × Brew POC

The goal is to create and edit hotel-branded email inside Sojern's existing
internal application, using Brew programmatically and embedding the same hosted
canvas used by Brew. Keep Sojern's staff login, hotel records and delivery system.

- **Try it:** https://sojern-brew-demo.vercel.app/
- **Source:** https://github.com/GetBrew/sojern-brew-demo
- **Detailed implementation guide and agent prompts:** https://sojern-brew-demo.vercel.app/sojern-implementation-guide.md
- **Portable PDF:** https://sojern-brew-demo.vercel.app/sojern-implementation-guide.pdf
- **SDK:** `@brew.new/sdk@13.2.0` or a compatible newer version.

The demo and repository are public. Account actions require your own Brew API
key; no key is included in the source or this handoff.

## 1. Test the workflow before integrating

Use a dedicated test hotel and group. For the complete flow, use an organization
API key with `brands` and `emails` permissions, an available brand slot and AI
credits. An existing ready brand is enough to start authoring. A brand-scoped key
works within its assigned brand but cannot provision other hotels.

1. Open the demo and enter your key. Leave the optional canvas client ID blank
   for the first test; the backend issues an editable canvas session.
2. Select an existing ready brand, or extract an approved public HTTPS hotel
   website. Wait for **Ready**, then inspect its identity and design guidance.
3. Create a named group and an English email using approved hotel facts and a
   subject you choose. Keep the returned email and version IDs.
4. Select the email in the canvas. In **Create**, choose **Use selected**, select
   French, and enter a French subject, for example `Votre prochain séjour`.
   Create the variant. It should have a different email ID; the source remains.
5. Rename the group and email from the picker/actions. Apply an AI edit to the
   variant, then click its text to make a manual edit. Test pan and zoom while
   the pointer is over the email.
6. Choose **Save & HTML** and inspect the exact saved version. Reopen the canvas
   to confirm persistence, then disconnect. Nothing is sent.

Generation and AI edits use real account credits. If an operation times out,
read saved state and versions before deciding to repeat it. A committed-result
error can contain saved IDs even when the final response was unavailable.
Extraction can continue after polling ends; keep its brand ID.

**Expected result:** one hotel brand, an English source, a separate French
variant, saved AI/manual changes, and retrievable HTML for the saved version.
AI localization requires review; it does not guarantee pixel-identical output.

## 2. Run the source locally

Use Node 24:

```sh
git clone https://github.com/GetBrew/sojern-brew-demo.git
cd sojern-brew-demo
npm ci --ignore-scripts
npm run check
cp .env.example .env.local
```

Set `DEMO_ORIGIN=http://localhost:4400` in `.env.local`. Generate a signing secret
with `openssl rand -hex 32` and set it as `DEMO_SESSION_SECRET` in that file.
Then run `npm run dev` and open http://localhost:4400. Enter your Brew key in the
UI. Do not put it in `.env.local`, source control, a prompt or a shared message.

For your own HTTPS deployment, use Vercel Node 24, build `npm run build`, output
`public`, and configure the exact HTTPS `DEMO_ORIGIN` plus the signing secret in
runtime settings. The source README explains the files and release commands.

`npm run check` checks formatting, strict types, API/security tests and the
browser build. CI makes no live Brew API calls. Use the acceptance checks below
to validate your account, origin and integration separately.

## 3. Add the smallest integration to Sojern

```text
Existing Sojern staff UI
  ├─ Existing backend + staff/hotel authorization → Brew brand and email APIs
  └─ Embedded Brew canvas → short-lived, authorized editing session
       Save → await flush() → backend → exact-version HTML → existing delivery flow
```

Install the SDK on your backend. Keep the organization key in your existing
secret manager. Use `createBrewClient({ apiKey })`, then
`platform.withBrand(authorizedHotel.brewBrandId)` for each hotel operation.
The existing hotel record is the source of the brand ID; do not trust a raw
browser-supplied brand or email ID as authorization.

| Milestone        | Add to the existing app                                                                              | Evidence to retain                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Hotel onboarding | `brands.create`, immediate hotel → brand ID mapping, bounded readiness polling, brand reads/updates. | A ready test hotel and clear slot/domain/failure states.                             |
| Email authoring  | Generate/edit, paginated groups/emails, metadata renames and `referenceEmailId` locale variants.     | Separate source/locale IDs, saved versions and source preservation.                  |
| Designer canvas  | Mount the SDK controller, track selection and saves, issue/renew/revoke authorized sessions.         | Manual edit → flush → exact-version HTML → reopen; stable iframe through API writes. |
| POC review       | Exercise access denial and the actual HTTPS origin with a designer.                                  | Results for each check below and a list of remaining product decisions.              |

Reuse existing records for hotel → brand mapping and email → hotel/locale/version
ownership. Track backend-issued canvas sessions by staff owner and target so
refresh/revoke cannot act on another user's grant. There is no Brew-specific
database, queue, Convex setup or separate staff login required on Sojern's side.

The playground intentionally accepts a key in page memory. For the Sojern staff
application, keep that key on the backend and retain existing SSO, hotel access
checks and CSRF protection on every route.

## 4. Choose canvas authorization

**Start with backend-issued sessions** when staff and hotel access must be
checked per request. Authorize the hotel/group or email, issue a session with the
configured parent origin and `read`, `edit`, `presence` permissions, and use
`createCanvasSessionProvider()` with `createEmailCanvas()` in the browser.
The detailed guide includes create, refresh and owned-session revoke patterns.

**Optionally use a publishable client ID.** In Brew **Settings → API → Client
apps**, an organization admin chooses **All brands** or one brand, enables
editing and allows the exact HTTPS admin origin. For the hosted demo, allow
`https://sojern-brew-demo.vercel.app`. An All brands ID can reach current and
future brands in that organization; pass `brandId` with each SDK target. Each
session is still bound to one brand and one group/email.

A client ID authorizes canvas access, not brand extraction or email generation,
and does not authenticate individual staff. Keep staff-specific access on your
backend when required. Validate a real configured client ID on your deployed
origin; API-key session tests alone do not prove that path.

## 5. Preserve these contracts

- Keep the group canvas mounted while creating and editing emails. Do not key
  the component by email version or refresh the iframe after API writes.
- Retain `onEmailSelectionChange` values: `emailId`, `emailVersion` and nullable
  `emailVersionId`. Clear stale selection when unresolved; snapshot the requested
  source before callbacks or awaits can change the UI's current value.
- Before an API AI edit, await `clearSelection()` to save and release the editing
  lease. Afterward, focus the result. Before export/navigation, await `flush()`
  and use the matching saved version ID for the HTML read.
- Generate locale variants with an authorized `referenceEmailId`, target-language
  prompt and explicit localized subject. References use latest. Clone an exact
  historical version first when that is the required source.
- Persist creation receipts before follow-up reads. Retain creation idempotency
  keys; do not automatically retry AI PATCH edits after ambiguous outcomes.
- Handle both saved-design and prose generation responses. Surface quota,
  permission, readiness and rate-limit errors in the existing UI.
- Brand `identity` fields merge; `emailDesign` and `imageStyle` replace their
  complete Markdown documents. Public brand deletion, restart-extraction and
  logo replacement are not part of this POC's API contract.

The iframe uses Brew's shared Rust/WASM renderer and requires WebGPU or WebGL2.
Handle `onError` visibly and evaluate performance on your actual designer devices.
The SDK does not currently expose iframe theme/logo/custom-domain controls.

## 6. POC acceptance checks

Record actual results in your own POC tracker; the demo's CI is not a substitute
for testing Sojern's authorization and deployment.

- A fresh approved hotel reaches ready, or a failed/limited extraction is clearly
  recoverable without losing its saved brand ID.
- Brand information reads and updates preserve the intended fields.
- English and French emails have separate IDs, correct subjects and reviewed
  hotel facts; the reference remains unchanged.
- AI edits and manual edits persist. Selection exposes the displayed version;
  exported HTML matches the saved version, including a historical selection.
- Create/edit/rename operations preserve the active group iframe. Pan/zoom and
  manual editing work over the email. Test an image upload/crop and reopen.
- A staff member cannot read/edit another hotel's email, reference, group,
  version or session. Viewer grants cannot edit; wrong origins are rejected.
- Renewal/revocation recheck owned staff access. If using client IDs, test All
  brands across two brands, a specific-brand denial and a foreign-org denial.

## Give an agent the implementation task

Paste this into an agent working in **Sojern's application repository**:

> Read https://github.com/GetBrew/sojern-brew-demo/blob/main/docs/POC-GUIDE.md and https://sojern-brew-demo.vercel.app/sojern-implementation-guide.md. Inspect the existing app's staff authentication, hotel authorization, data records, UI and runtime before coding. Implement the four POC milestones using @brew.new/sdk 13.2.0 or compatible newer. Keep the organization key on the backend; resolve hotel, email, reference, group, version and session ownership from existing records on every request. Reuse existing infrastructure. Keep one shared SDK canvas per brand/group/credential scope, track displayed selection and exact saves, flush before export and release the lease before AI edits. Support locale remixes as separate emails. Handle limits, prose responses, idempotent creates and ambiguous AI-edit results. Work with controlled test records and do not send mail. Run the existing app's checks, then report changed files, required secret/origin configuration, actual acceptance evidence and untested paths. Use the detailed guide's four complete prompts for the implementation breakdown.

Before implementation, choose the test hotel, target locales, staff roles and
HTTPS admin origin. Coordinate account capacity and credentials through the
normal secret-sharing/runtime process, not source files or agent prompts.
