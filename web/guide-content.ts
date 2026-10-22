export const snippets: Record<string, string> = {
  quickstart: `npm ci --ignore-scripts
npm run check
cp .env.example .env.local
# Set DEMO_SESSION_SECRET; generate with openssl rand -hex 32.
# Use http://localhost:4400 for DEMO_ORIGIN.
npm run dev
`,
  client:
    "import { createBrewClient } from '@brew.new/sdk'\n\nexport const platform = createBrewClient({\n  apiKey: process.env.BREW_API_KEY!,\n})\n",
  extract:
    "const created = await platform.brands.create(\n  { url: hotel.websiteUrl },\n  { idempotencyKey: hotel.onboardingRequestId },\n)\n// Persist created.brandId on the existing hotel record immediately.\nconst status = await platform.brands.waitForExtraction(created.brandId, {\n  maxWaitMs: 300_000,\n})\nif (!status.ready) throw new Error(status.error ?? `Brand is ${status.status}`)\nconst hotelBrew = platform.withBrand(created.brandId)\n",
  brand:
    "const context = await hotelBrew.brand.get({\n  include: ['identity', 'emailDesign', 'imageStyle', 'logos'],\n})\n\nawait hotelBrew.brand.patch({\n  identity: { tagline: 'Your approved hotel tagline' },\n})\n",
  generate:
    "const generated = await hotelBrew.emails.generate(\n  {\n    prompt: 'Create an on-brand hotel newsletter for opted-in guests. Use the approved hotel facts. One clear CTA. Do not invent rates, availability, discounts, or amenities.',\n    subjectLine: 'Plan your next city escape',\n    category: 'newsletter',\n  },\n  { idempotencyKey: emailRequestId },\n)\nif (!('emailId' in generated)) throw new Error(generated.response)\n// Persist emailId, emailVersionId and hotel ownership before returning IDs.",
  session:
    "const session = await hotelBrew.canvas.sessions.create({\n  target: { type: 'group', groupId: ownedGroup.groupId },\n  user: { externalId: `${hotel.id}:${staff.id}`, name: staff.displayName },\n  parentOrigin: configuredAdminOrigin,\n  permissions: ['read', 'edit', 'presence'],\n})\n",
  html: "const result = await hotelBrew.emails.get(ownedEmail.emailId, {\n  emailVersionId: authorizedVersionId,\n  include: 'html',\n})\nif (result.status !== 'ready' || !result.html) throw new Error('HTML is not ready')\n",
};
// Compiled from the Markdown handoff by build.mjs.
export const agentPrompts = __BREW_AGENT_PROMPTS__;
export const agentBrief = __BREW_AGENT_BRIEF__;

snippets.selection = `import { createEmailCanvas, createCanvasSessionProvider } from '@brew.new/sdk/embed'
const getSession = createCanvasSessionProvider('/api/brew/canvas-session', {
  headers: () => ({ 'X-CSRF-Token': currentCsrfToken }),
})
let selected = null
const canvas = createEmailCanvas(container, {
  getSession,
  groupId: ownedGroupId,
  onEmailSelectionChange: emails => { selected = emails[0] ?? null },
  onSaved: receipt => {
    if (selected?.emailId === receipt.emailId)
      selected = { ...selected, emailVersionId: receipt.emailVersionId ?? null }
  },
  onError: error => showCanvasError(error.message),
})
// selected: { emailId, emailVersion: number | 'latest', emailVersionId }
// Keep this controller mounted; don't key by email/version.
// On exit: await flush(), revoke the owned backend grant, then destroy.
// Custom session providers do not revoke automatically.
`;
snippets.remix = `// Backend: authorize the template and hotel before generating.
const variant = await hotelBrew.emails.generate({
  referenceEmailId: ownedTemplate.emailId,
  groupId: ownedGroupId,
  subjectLine: 'Votre prochain séjour',
  prompt: 'Create a French (fr-FR) version. Preserve the template layout, imagery, URLs and approved facts. Translate copy, preview text and CTA. Do not send.',
}, { idempotencyKey: localeRequestId })
if (!('emailId' in variant)) throw new Error(variant.response)
// Store the new emailId/version per locale. Source is unchanged.
// referenceEmailId uses latest. For historical: clone({ emailId,
// emailVersionId, title }) first, then reference the clone's emailId.
`;
snippets.rename = `await hotelBrew.emailGroups.update({
  groupId: ownedGroupId, name: 'Welcome locales',
})
await hotelBrew.emails.edit({
  emailId: ownedEmailId, title: 'Welcome · French',
})
// Metadata-only patches: no AI run or new version.
`;
snippets.edit = `// Browser: snapshot before save/deselection callbacks can update the UI.
const requested = selected ? { ...selected } : null
if (!requested?.emailVersionId) throw new Error('Select a resolved version')
// Block new manual selection until the API call finishes.
await canvas.clearSelection() // flush + release editing lease; same iframe
// Backend: authorize requested email/version against hotel records first.
const edited = await hotelBrew.emails.edit({
  emailId: requested.emailId,
  emailVersionId: requested.emailVersionId,
  prompt: 'Shorten the intro and refine the CTA.',
})
if (!('emailId' in edited)) throw new Error(edited.response)
// Browser: live subscription updates the document.
await canvas.focusEmail(edited.emailId)
`;
snippets.clientCanvas = `import { createEmailCanvas } from '@brew.new/sdk/embed'

const canvas = createEmailCanvas(container, {
  clientId: configuredClientId, // publishable; All brands or one brand
  brandId: authorizedBrandId, // required for All brands client IDs
  groupId: ownedGroupId,
  onEmailSelectionChange: rows => retainDisplayedSelection(rows[0] ?? null),
  onSaved: receipt => retainExactSavedVersion(receipt),
  onError: error => showCanvasError(error.message),
})
// SDK manages client-ID session renewal and cleanup.
// Await flush before export/navigation, then destroy on exit.
`;
