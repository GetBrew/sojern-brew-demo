import {
  createEmailCanvas,
  createCanvasSessionProvider,
} from "@brew.new/sdk/embed";
import { createEmailPicker } from "./email-picker.tsx";
import { snippets, agentPrompts, agentBrief } from "./guide-content.ts";
import { element as $ } from "./dom.ts";
import {
  errorInfo,
  isRecord,
  type DemoInput,
  type DemoResults,
  type StudioState,
  type TraceMetadata,
  type DemoCanvasSession,
} from "../lib/contracts.ts";
import type {
  Brand,
  EmailGroup,
  ListEmailsResponse,
  Pagination,
  GetEmailResponse,
} from "@brew.new/sdk";
import type {
  CanvasSavedEvent,
  CanvasSelectedEmail,
  CanvasTarget,
  CanvasSession,
  CanvasSessionRequest,
  CanvasAuthentication,
  EmailCanvasController,
} from "@brew.new/sdk/embed";
type RenameTarget =
  | { type: "newGroup"; name: string }
  | { type: "email" | "group"; id: string; name?: string };
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );
let apiKey = "",
  credentialScope = "",
  state: StudioState | null = null,
  brands: Brand[] = [],
  brandPage: Pagination | null = null,
  emails: ListEmailsResponse["data"] = [],
  canvas: EmailCanvasController | null = null,
  canvasReady = false,
  canvasDirty = false,
  currentProof: string | null = null,
  lastSaved: CanvasSavedEvent | null = null,
  canvasKey: string | null = null,
  latestResult: unknown = null,
  htmlResult: GetEmailResponse | null = null,
  busy = false,
  pollTimer: ReturnType<typeof setTimeout> | undefined = undefined,
  brandFormKey: string | null = null,
  pollDeadline = 0;
let pendingGrants = new Set<Promise<CanvasSession>>(),
  groups: EmailGroup[] = [],
  groupPage: Pagination | null = null,
  groupId = "ungrouped",
  groupRows = new Map<string, ListEmailsResponse>(),
  selectedEmail: CanvasSelectedEmail | null = null,
  canvasSelectedId: string | null = null,
  referenceEmail: CanvasSelectedEmail | null = null,
  canvasTarget: CanvasTarget | null = null,
  renameTarget: RenameTarget | null = null;
const groupLoads = new Map<string, Promise<void>>();
const visitorId =
  sessionStorage.getItem("headless-visitor-id") || crypto.randomUUID();
sessionStorage.setItem("headless-visitor-id", visitorId);
let canvasClientId = "";
const versions = () => state?.email?.versions || [],
  clientId = () => canvasClientId;
$("allowed-origin").textContent = location.origin;
const updatePicker = createEmailPicker($("email-picker"), {
  loadGroup: (id, more) =>
    loadGroup(id, more).catch((e) => notice(errorInfo(e).message, true)),
  selectGroup: (id) => work("Opening group", () => selectGroup(id)),
  selectEmail: (id, emailId) =>
    work("Opening email", () => openEmail(id, emailId)),
  renameGroup: (group) =>
    openRename({ type: "group", id: group.groupId, name: group.groupName }),
  createGroup: () => openRename({ type: "newGroup", name: "" }),
  moreGroups: () => work("Loading groups", () => loadGroups(true)),
});
function picker() {
  updatePicker({
    groups,
    groupId,
    email: state?.email,
    groupRows,
    hasMore: groupPage?.hasMore,
    busy,
  });
  $("rename-email").hidden = !state?.email;
  $("more-emails").hidden = true;
}
async function loadGroups(more = false) {
  const r = await request("groups", more ? { cursor: groupPage?.cursor } : {});
  groups = more ? [...groups, ...r.data.data] : r.data.data;
  groupPage = r.data.pagination;
  picker();
}
async function loadGroup(id: string, more = false) {
  if (groupLoads.has(id)) return groupLoads.get(id);
  const brandId = state?.brand?.brandId;
  if (!brandId) return;
  const run = (async () => {
    const previous = groupRows.get(id);
    if (previous && !more) return;
    const r = await request("emails", {
      brandId,
      groupId: id,
      ...(more && previous?.pagination?.cursor
        ? { cursor: previous.pagination.cursor }
        : {}),
    });
    if (state?.brand?.brandId !== brandId) return;
    groupRows.set(id, {
      ...r.data,
      data: more ? [...(previous?.data || []), ...r.data.data] : r.data.data,
    });
    picker();
  })();
  groupLoads.set(id, run);
  try {
    return await run;
  } finally {
    groupLoads.delete(id);
  }
}
async function selectGroup(id: string) {
  if (id !== groupId) {
    await dispose();
    groupId = id;
    selectedEmail = null;
    lastSaved = null;
    if (state) state.email = null;
    remember();
  }
  await loadGroup(id);
  renderState();
  await mountCanvas();
  if (canvasReady) await canvas?.fitView();
}
async function openEmail(id: string, emailId: string) {
  await flush();
  if (id !== groupId) {
    await dispose();
    groupId = id;
  }
  lastSaved = null;
  selectedEmail = null;
  apply(await request("read", { emailId }));
  await loadGroup(id);
  await mountCanvas();
  await focus(emailId);
}
async function focus(emailId: string) {
  if (!canvas) return;
  const active = canvas;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (active !== canvas) return;
    if (!canvasReady) {
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    try {
      await active.focusEmail(emailId);
      return;
    } catch (error) {
      const e = errorInfo(error);
      if (
        e.code !== "COMMAND_FAILED" ||
        !e.message.includes("outside this canvas")
      )
        throw error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  notice(
    "The saved email is still appearing in the live canvas. Choose it again from the picker.",
    true,
  );
}
function openRename(target: RenameTarget) {
  renameTarget = target;
  $("rename-heading").textContent =
    target.type === "newGroup"
      ? "New group"
      : target.type === "group"
        ? "Rename group"
        : "Rename email";
  $("rename-name").maxLength = target.type === "email" ? 200 : 60;
  $("rename-name").value = target.name || "";
  $("rename-dialog").showModal();
  $("rename-name").focus();
}
$("rename-cancel").onclick = () => $("rename-dialog").close();
$("rename-email").onclick = () => {
  if (state?.email)
    openRename({
      type: "email",
      id: state.email.emailId,
      name: state.email.title,
    });
};
$("rename-form").onsubmit = (e) => {
  e.preventDefault();
  const target = renameTarget,
    name = $("rename-name").value.trim();
  if (!name || !target) return;
  work("Saving name", async () => {
    await flush();
    if (target.type === "email") {
      await request("renameEmail", { emailId: target.id, name });
      await refresh(target.id);
    } else if (target.type === "group") {
      await request("renameGroup", { groupId: target.id, name });
      await loadGroups();
    } else {
      const r = await request("createGroup", {
        name,
        actionId: intent("createGroup", {
          brandId: state?.brand.brandId,
          name,
        }),
      });
      clearIntent("createGroup");
      await loadGroups();
      await selectGroup(r.data.groupId);
    }
    $("rename-dialog").close();
    notice("Name saved.");
  });
};
function renderReference() {
  $("template-reference").value = referenceEmail ? referenceEmail.emailId : "";
  $("reference-hint").textContent = referenceEmail
    ? `Reference: ${referenceEmail.emailId} · selected version ${referenceEmail.emailVersion}. Remix uses the latest saved version; clone an exact historical version first if needed.`
    : "Optional: remix the selected email. The reference API uses its latest saved version.";
}
$("use-reference").onclick = () => {
  if (!selectedEmail) {
    notice("Select an email in the canvas first.", true);
    return;
  }
  referenceEmail = { ...selectedEmail };
  renderReference();
};
$("clear-reference").onclick = () => {
  referenceEmail = null;
  renderReference();
};

function notice(message: string | undefined, isError = false) {
  const el = $(isError ? "error" : "notice");
  el.textContent = message || "";
  el.hidden = !message;
}
function trace(result: TraceMetadata, label = "Live request") {
  latestResult = JSON.parse(
    JSON.stringify(result, (k, v) =>
      [
        "bootstrapToken",
        "demoProof",
        "csrf",
        "clientSessionToken",
        "accessToken",
      ].includes(k)
        ? "[redacted]"
        : k === "html" && typeof v === "string"
          ? v.slice(0, 1400) + "\n… HTML truncated …"
          : v,
    ),
  );
  $("trace-label").textContent = label + " · " + result.elapsedMs + " ms";
  $("trace-list").innerHTML = (result.trace || [])
    .map(
      (t) =>
        `<div class="trace-row"><span class="method">${escape(t.method)}</span><span class="path" title="${escape(t.path)}">${escape(t.path)}</span><span class="code">${escape(t.status)}</span><span class="duration">${escape(t.durationMs)} ms</span></div>`,
    )
    .join("");
  $("trace-result").textContent = JSON.stringify(latestResult, null, 2);
}
function authHeaders() {
  return {
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json",
  };
}
async function request<A extends keyof DemoResults>(
  action: A,
  data: DemoInput = {},
): Promise<DemoResults[A] & TraceMetadata> {
  if (!apiKey) throw Error("Enter your Brew API key and connect first.");
  const requestScope = credentialScope;
  const response = await fetch("/api/demo", {
    method: "POST",
    credentials: "omit",
    headers: authHeaders(),
    body: JSON.stringify({
      action,
      ...(state?.brand?.brandId ? { brandId: state.brand.brandId } : {}),
      ...data,
    }),
  });
  let result: DemoResults[A] &
    TraceMetadata & { error?: ReturnType<typeof errorInfo> };
  try {
    const body: unknown = await response.json();
    if (!isRecord(body)) throw Error("Invalid API response.");
    // The same-origin function validates inputs and returns these SDK-derived shapes.
    result = body as unknown as typeof result;
  } catch {
    throw Error(
      "The request was interrupted. Read saved state before repeating an AI edit.",
    );
  }
  if (requestScope !== credentialScope)
    throw Error("The connection changed while this request was running.");
  trace(result, action);
  if (!response.ok) {
    const err = new Error(
      `${result.error?.code || "REQUEST_FAILED"}: ${result.error?.message || "The request failed."}${result.error?.suggestion ? " " + result.error.suggestion : ""}`,
    );
    throw err;
  }
  return result;
}
function intent(kind: string, fields: unknown) {
  const key = "headless-intent-" + credentialScope + "-" + kind;
  let old: { signature: string; actionId: string } | null = null;
  try {
    old = JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {}
  const signature = JSON.stringify(fields);
  if (!old || old.signature !== signature) {
    old = { signature, actionId: crypto.randomUUID() };
    sessionStorage.setItem(key, JSON.stringify(old));
  }
  return old.actionId;
}
function clearIntent(kind: string) {
  sessionStorage.removeItem("headless-intent-" + credentialScope + "-" + kind);
}
function currentState(): StudioState {
  if (!state) throw Error("Select or extract a brand first.");
  return state;
}
function remember() {
  if (state?.brand)
    sessionStorage.setItem(
      "headless-selection-" + credentialScope,
      JSON.stringify({
        brandId: state.brand.brandId,
        emailId: state?.email?.emailId || null,
      }),
    );
}
function apply(result: {
  data?: StudioState;
  notice?: string;
  answer?: string;
}) {
  if (result.data?.brand) {
    const email = result.data.email;
    if (email) {
      // Metadata reads may return the head while the mounted card displays history.
      let pin = null;
      if (selectedEmail && selectedEmail.emailId === email.emailId)
        pin = selectedEmail.emailVersionId;
      else if (canvas && state?.email?.emailId === email.emailId)
        pin = state.email.emailVersionId;
      if (pin) email.emailVersionId = pin;
    }
    state = result.data;
    renderState();
    remember();
  }
  if (result.notice) notice(result.notice);
  if (result.answer) notice(result.answer);
}
async function work(
  title: string,
  fn: () => Promise<unknown>,
  description = "Reading and saving through Brew. AI actions may take a few minutes.",
  shouldFreezeCanvas = true,
) {
  if (busy) return;
  busy = true;
  notice("", true);
  $("busy-title").textContent = title;
  $("busy-description").textContent = description;
  $("busy").hidden = false;
  picker();
  $("canvas").inert = shouldFreezeCanvas;
  const controls = [
    ...document.querySelectorAll<
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
    >("button,input,textarea,select"),
  ];
  for (const el of controls) el.disabled = true;
  try {
    return await fn();
  } catch (error) {
    notice(errorInfo(error).message, true);
    if (apiKey && state?.brand && !canvas) {
      try {
        apply(await request("read", { emailId: state?.email?.emailId }));
        await mountCanvas();
      } catch {}
    }
  } finally {
    busy = false;
    $("busy").hidden = true;
    for (const el of controls) el.disabled = false;
    $("canvas").inert = false;
    picker();
  }
}
function brandOptions() {
  const current = state?.brand,
    rows =
      current && !brands.some((b) => b.brandId === current.brandId)
        ? [current, ...brands]
        : brands;
  const el = $("brand-select");
  el.innerHTML =
    '<option value="">Select a brand</option>' +
    rows
      .map(
        (b) =>
          `<option value="${escape(b.brandId)}">${escape(b.domain)}${b.ready ? "" : " · " + escape(b.status)}</option>`,
      )
      .join("");
  el.value = state?.brand?.brandId || "";
  $("more-brands").hidden = !brandPage?.hasMore;
}
function emailOptions() {
  picker();
}
async function loadBrands(more = false) {
  const r = await request("brands", more ? { cursor: brandPage?.cursor } : {});
  brands = more ? [...brands, ...r.data.data] : r.data.data;
  brandPage = r.data.pagination;
  brandOptions();
}
async function loadEmails(more = false) {
  if (!more) groupRows.delete(groupId);
  await loadGroup(groupId, more);
  emails = groupRows.get(groupId)?.data || [];
  emailOptions();
}
async function selectBrand(brandId: string, emailId: string | null = null) {
  await dispose();
  clearTimeout(pollTimer);
  emails = [];
  state = null;
  brandFormKey = null;
  groups = [];
  groupPage = null;
  groupRows.clear();
  groupLoads.clear();
  groupId = "ungrouped";
  selectedEmail = null;
  referenceEmail = null;
  renderReference();
  renderEmpty();
  const r = await request("read", { brandId });
  apply(r);
  $("client-id").value = clientId();
  await loadGroups();
  if (emailId) {
    try {
      apply(await request("read", { emailId }));
      groupId = currentState().email?.group?.groupId || "ungrouped";
    } catch (error) {
      notice(errorInfo(error).message, true);
    }
  }
  await loadEmails();
  const selected =
    currentState().email?.emailId ||
    emails.find((e) => e.status === "ready")?.emailId;
  if (selected && !currentState().email)
    apply(await request("read", { emailId: selected }));
  await mountCanvas();
  if (selected) await focus(selected);
}
function renderEmpty() {
  $("hotel-name").textContent = "Your email canvas";
  $("hotel-domain").textContent = "Select a brand and email to begin.";
  $("brand-summary").textContent = "Select or extract a brand.";
  $("brand-status").textContent = apiKey
    ? "No brand selected"
    : "Not connected";
  $("canvas-status").textContent = "No email selected";
  $("version-label").textContent = "No email selected";
  $("canvas").innerHTML =
    '<div class="canvas-empty">Select a brand, then create or open an email.</div>';
  emailOptions();
  brandOptions();
  for (const id of [
    "brand-name",
    "brand-tagline",
    "brand-description",
    "email-design",
    "image-style",
  ] as const)
    $(id).value = "";
}
function renderState() {
  if (!state) return;
  const brand = state.brand,
    identity = brand.identity || {};
  $("hotel-name").textContent = identity.brandName || brand.domain;
  $("hotel-domain").textContent = brand.domain;
  $("brand-status").textContent = brand.ready ? "Ready" : brand.status;
  $("brand-status").classList.toggle("pending", !brand.ready);
  $("brand-summary").innerHTML =
    `<b>${escape(identity.brandName || brand.domain)}</b><span>${escape(identity.description || brand.error || "Extracting brand facts and visual guidance…")}</span>`;
  const brandChanged = brandFormKey !== brand.brandId;
  if (brandChanged || (brand.ready && !$("brand-name").value)) {
    brandFormKey = brand.brandId;
    pollDeadline = Date.now() + 300000;
    $("hotel-url").value = "https://" + brand.domain;
    for (const [k, id] of [
      ["brandName", "brand-name"],
      ["tagline", "brand-tagline"],
      ["description", "brand-description"],
    ] as const)
      $(id).value = identity[k] || "";
    $("email-design").value = brand.emailDesign || "";
    $("image-style").value = brand.imageStyle || "";
    if (brandChanged)
      $("generate-prompt").value =
        `Create a concise, on-brand newsletter for ${identity.brandName || brand.domain} for guests who opted in to updates. Theme: your next escape. Use approved website facts and existing brand assets. Include one hero and one clear CTA. Do not invent rates, discounts, dates, amenities or availability. Design only; do not send.`;
  }
  const row = brands.find((b) => b.brandId === brand.brandId);
  if (row) Object.assign(row, { status: brand.status, ready: brand.ready });
  brandOptions();
  emailOptions();
  $("version-label").textContent = selectedEmail
    ? `Selected ${selectedEmail.emailId} · version ${selectedEmail.emailVersion} · ${selectedEmail.emailVersionId || "unresolved"}`
    : state.email?.emailVersionId
      ? `Saved version ${state.email.emailVersionId}`
      : "Create an email when the brand is ready";
  renderBaseline();
  clearTimeout(pollTimer);
  if (brand.status === "extracting" && Date.now() < pollDeadline) {
    pollTimer = setTimeout(async () => {
      if (busy) {
        renderState();
        return;
      }
      try {
        apply(await request("read", { emailId: state?.email?.emailId }));
        await mountCanvas();
      } catch (error) {
        notice(errorInfo(error).message, true);
      }
    }, 5000);
  }
}
function renderBaseline() {
  let el = document.querySelector<HTMLSelectElement>("#edit-baseline");
  if (!el) {
    const label = document.createElement("label");
    label.htmlFor = "edit-baseline";
    label.textContent = "AI SOURCE VERSION";
    el = document.createElement("select");
    el.id = "edit-baseline";
    const anchor = document.querySelector('label[for="edit-prompt"]');
    $("edit-form").insertBefore(label, anchor);
    $("edit-form").insertBefore(el, anchor);
  }
  const chosen =
      (lastSaved && lastSaved.emailId === state?.email?.emailId
        ? lastSaved.emailVersionId
        : null) ||
      (selectedEmail && selectedEmail.emailId === state?.email?.emailId
        ? selectedEmail.emailVersionId
        : null) ||
      state?.email?.emailVersionId,
    rows = versions(),
    all = [
      ...(chosen && !rows.some((v) => v.emailVersionId === chosen)
        ? [{ emailVersionId: chosen, version: "saved" }]
        : []),
      ...rows,
    ];
  el.innerHTML = all
    .map(
      (v) =>
        `<option value="${escape(v.emailVersionId)}">Version ${escape(v.version)} · ${escape(v.emailVersionId?.slice(0, 8))}</option>`,
    )
    .join("");
  if (chosen) el.value = chosen;
}
async function flush() {
  if (canvas && canvasReady) await canvas.flush();
  else if (canvasDirty)
    throw Error(
      "Wait for the editor to reconnect. Your edits have not been confirmed saved.",
    );
}
async function dispose() {
  await flush();
  canvas?.destroy();
  canvas = null;
  window.demoCanvas = null;
  window.demoSaved = null;
  canvasReady = false;
  canvasKey = null;
  window.demoReady = false;
  await Promise.allSettled([...pendingGrants]);
  if (currentProof) {
    const proof = currentProof;
    currentProof = null;
    try {
      await request("revoke", { proof, target: canvasTarget });
    } catch {
      /* The closed iframe stops using the grant; server expiration remains the cleanup backstop. */
    }
  }
  lastSaved = null;
  selectedEmail = null;
  canvasSelectedId = null;
  canvasTarget = null;
}
async function mountCanvas() {
  const key = state?.brand?.ready
    ? `${state.brand.brandId}:${groupId}:${clientId()}`
    : null;
  if (key === canvasKey && canvas) return;
  if (canvas) await dispose();
  if (!state?.brand?.ready) {
    $("canvas").innerHTML =
      '<div class="canvas-empty">Select a ready brand to open the editable canvas.</div>';
    $("canvas-status").textContent = "Waiting for brand";
    return;
  }
  canvasKey = key;
  canvasTarget = { type: "group", groupId };
  canvasReady = false;
  canvasDirty = false;
  lastSaved = null;
  $("canvas").replaceChildren();
  $("canvas-status").textContent = "Connecting";
  const proofs = new Map<string, string>(),
    grants = new Set<Promise<CanvasSession>>(),
    headers = authHeaders(),
    brandId = state.brand.brandId;
  pendingGrants = grants;
  const authentication: CanvasAuthentication = clientId()
    ? { clientId: clientId(), brandId }
    : {
        getSession: async (args: CanvasSessionRequest) => {
          const provider = createCanvasSessionProvider(
            "/api/demo?action=canvas",
            {
              headers: () => ({
                ...headers,
                "X-Brew-Brand-Id": brandId,
                "X-Visitor-Id": visitorId,
                ...(args.sessionId
                  ? { "X-Canvas-Proof": proofs.get(args.sessionId) || "" }
                  : {}),
              }),
            },
          );
          const pending = provider(args).then((grant) => {
            // This same-origin endpoint adds an ownership receipt to the SDK session.
            const session = grant as DemoCanvasSession;
            proofs.set(session.sessionId, session.demoProof);
            currentProof = session.demoProof;
            trace(session, "Authorize editable canvas");
            return session;
          });
          grants.add(pending);
          try {
            return await pending;
          } finally {
            grants.delete(pending);
          }
        },
      };
  canvas = createEmailCanvas($("canvas"), {
    groupId,
    ...authentication,
    title:
      "Email canvas for " +
      (state.brand.identity?.brandName || state.brand.domain),
    onReady: () => {
      canvasReady = true;
      window.demoReady = true;
      $("canvas-status").textContent = clientId()
        ? "Live · client ID"
        : "Live · editable";
    },
    onDirtyChange: (dirty) => {
      canvasDirty = dirty;
      $("canvas-status").textContent = dirty
        ? "Saving changes…"
        : clientId()
          ? "Live · client ID"
          : "Live · editable";
    },
    onSelectionChange: (ids) => {
      canvasSelectedId = ids[0] || null;
    },
    onEmailSelectionChange: (rows) => {
      selectedEmail = rows[0] || null;
      window.demoSelection = selectedEmail;
      if (!selectedEmail) {
        $("version-label").textContent = canvasSelectedId
          ? "Loading selected version…"
          : "No email selected";
        return;
      }
      lastSaved =
        lastSaved?.emailId === selectedEmail.emailId &&
        lastSaved.emailVersionId === selectedEmail.emailVersionId
          ? lastSaved
          : null;
      $("version-label").textContent =
        `Selected ${selectedEmail.emailId} · version ${selectedEmail.emailVersion} · ${selectedEmail.emailVersionId || "unresolved"}`;
      if (state?.email?.emailId === selectedEmail.emailId) {
        state.email.emailVersionId = selectedEmail.emailVersionId;
        renderBaseline();
        return;
      }
      const selection = selectedEmail;
      request("read", { emailId: selection.emailId })
        .then((r) => {
          if (selectedEmail?.emailId === selection.emailId) {
            apply(r);
            renderBaseline();
          }
        })
        .catch((e) => notice(errorInfo(e).message, true));
    },
    onSaved: (s) => {
      lastSaved = s;
      window.demoSaved = s;
      $("version-label").textContent =
        `Saved version ${s.emailVersionId || "not yet resolved"}`;
      renderBaseline();
    },
    onError: (e) => {
      notice(
        `${e.code}: ${e.message}${clientId() ? " Check that this client ID allows the selected brand, allows " + location.origin + ", and has editing enabled." : ""}`,
        true,
      );
      $("canvas-status").textContent = "Connection needs attention";
    },
  });
  window.demoCanvas = canvas;
}
async function refresh(emailId = state?.email?.emailId) {
  if (!state?.brand) throw Error("Select or extract a brand first.");
  apply(await request("read", { emailId }));
  await loadEmails();
  await mountCanvas();
}
async function showHtml() {
  if (!state?.email) throw Error("Create or select an email first.");
  await flush();
  requireResolvedSelection();
  const pin =
    (lastSaved?.emailId === state.email.emailId
      ? lastSaved.emailVersionId
      : null) ||
    (selectedEmail?.emailId === state.email.emailId
      ? selectedEmail.emailVersionId
      : null) ||
    state.email.emailVersionId;
  if (!pin) throw Error("Resolve the selected version before exporting.");
  const r = await request("html", {
    emailId: state.email.emailId,
    emailVersionId: pin,
  });
  htmlResult = r.data;
  if (htmlResult.status !== "ready" || !htmlResult.html)
    throw Error("The saved HTML is not ready yet.");
  $("html-meta").textContent =
    `Email: ${htmlResult.emailId}\nVersion: ${htmlResult.emailVersionId}\n${htmlResult.html.length.toLocaleString()} HTML characters`;
  $("html-source").textContent = htmlResult.html;
  $("html-dialog").showModal();
  window.demoHtml = htmlResult;
}
function requireResolvedSelection() {
  if (
    canvasSelectedId &&
    (!selectedEmail?.emailVersionId ||
      selectedEmail.emailId !== canvasSelectedId ||
      state?.email?.emailId !== canvasSelectedId)
  )
    throw Error("Wait for the selected version to load.");
}
function step(name: string) {
  document.querySelectorAll<HTMLElement>("[data-step]").forEach((el) => {
    el.classList.toggle("active", el.dataset.step === name);
    el.setAttribute("aria-selected", String(el.dataset.step === name));
  });
  document
    .querySelectorAll<HTMLElement>(".step-panel")
    .forEach((el) => el.classList.toggle("active", el.id === name + "-step"));
}
async function view(name: string) {
  if (!["workspace", "implementation", "agents"].includes(name))
    name = "workspace";
  try {
    await flush();
  } catch (error) {
    notice(errorInfo(error).message, true);
    return;
  }
  document
    .querySelectorAll<HTMLElement>(".page")
    .forEach((el) => el.classList.toggle("active", el.id === name + "-page"));
  document
    .querySelectorAll<HTMLElement>(".nav")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  history.replaceState(null, "", "#" + name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
for (const el of document.querySelectorAll<HTMLElement>("[data-view]"))
  el.addEventListener("click", (e) => {
    e.preventDefault();
    view(el.dataset.view || "workspace");
  });
for (const el of document.querySelectorAll<HTMLElement>("[data-step]"))
  el.addEventListener("click", () => step(el.dataset.step || "brand"));
for (const el of document.querySelectorAll<HTMLElement>(".close-dialog"))
  el.addEventListener("click", () => el.closest("dialog")?.close());
$("connection-form").onsubmit = (e) => {
  e.preventDefault();
  work("Connecting your Brew account", async () => {
    const nextKey = $("api-key").value.trim() || apiKey;
    let nextClient = $("client-id").value.trim();
    if (apiKey && nextKey !== apiKey && nextClient === canvasClientId) {
      nextClient = "";
    }
    if (apiKey && nextKey === apiKey) {
      await dispose();
      canvasClientId = nextClient;
      if (state?.brand) await refresh();
      notice("Canvas credentials updated.");
      return;
    }
    await dispose();
    $("client-id").value = nextClient;
    clearTimeout(pollTimer);
    apiKey = nextKey;
    credentialScope = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey)),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    state = null;
    brands = [];
    emails = [];
    groups = [];
    groupPage = null;
    groupRows.clear();
    groupLoads.clear();
    groupId = "ungrouped";
    selectedEmail = null;
    referenceEmail = null;
    window.demoSelection = null;
    renderReference();
    canvasClientId = "";
    htmlResult = null;
    latestResult = null;
    window.demoHtml = null;
    $("html-dialog").close();
    $("html-source").textContent = "";
    $("trace-result").textContent = "Connecting…";
    $("trace-list").replaceChildren();
    renderEmpty();
    try {
      await loadBrands();
    } catch (error) {
      apiKey = "";
      credentialScope = "";
      $("connection-status").textContent = "Not connected";
      $("api-key").required = true;
      $("connect-button").textContent = "Connect";
      $("disconnect").hidden = true;
      renderEmpty();
      throw error;
    }
    $("api-key").value = "";
    $("api-key").required = false;
    $("api-key").placeholder = "Connected · enter another key to switch";
    $("connect-button").textContent = "Apply";
    $("disconnect").hidden = false;
    $("connection-status").textContent = "Connected to your Brew account";
    let saved: { brandId?: string; emailId?: string } | null = null;
    try {
      saved = JSON.parse(
        sessionStorage.getItem("headless-selection-" + credentialScope) ||
          "null",
      );
    } catch {}
    const first =
      brands.find((b) => b.brandId === saved?.brandId) ||
      brands.find((b) => b.ready) ||
      brands[0];
    canvasClientId = nextClient;
    if (first) {
      await selectBrand(
        first.brandId,
        saved?.brandId === first.brandId ? saved.emailId || null : null,
      );
    } else notice("Connected. Extract your first brand below.");
  });
};
$("disconnect").onclick = () =>
  work("Disconnecting", async () => {
    await dispose();
    clearTimeout(pollTimer);
    apiKey = "";
    credentialScope = "";
    state = null;
    brands = [];
    emails = [];
    groups = [];
    groupPage = null;
    groupRows.clear();
    groupLoads.clear();
    groupId = "ungrouped";
    selectedEmail = null;
    referenceEmail = null;
    window.demoSelection = null;
    renderReference();
    canvasClientId = "";
    brandPage = null;
    lastSaved = null;
    htmlResult = null;
    latestResult = null;
    window.demoHtml = null;
    $("html-dialog").close();
    $("html-source").textContent = "";
    $("trace-result").textContent = "Disconnected";
    $("trace-list").replaceChildren();
    $("api-key").value = "";
    $("api-key").required = true;
    $("api-key").placeholder = "brew_…";
    $("client-id").value = "";
    $("connect-button").textContent = "Connect";
    $("disconnect").hidden = true;
    $("connection-status").textContent = "Connect your Brew account";
    renderEmpty();
    notice("Disconnected. Your key was not saved.");
  });
$("brand-select").onchange = () => {
  const id = $("brand-select").value;
  if (id) work("Opening brand", () => selectBrand(id));
};
$("more-brands").onclick = () => work("Loading brands", () => loadBrands(true));
$("more-emails").onclick = () => work("Loading emails", () => loadEmails(true));
$("extract-form").onsubmit = (e) => {
  e.preventDefault();
  work("Extracting a brand", async () => {
    await dispose();
    const url = $("hotel-url").value;
    const r = await request("extract", {
      url,
      actionId: intent("extract", { url }),
    });
    clearIntent("extract");
    const b = r.receipt;
    brands.unshift({
      brandId: b.brandId,
      domain: new URL(url).hostname,
      status: b.status || "extracting",
      ready: false,
    });
    sessionStorage.setItem(
      "headless-selection-" + credentialScope,
      JSON.stringify({ brandId: b.brandId, emailId: null }),
    );
    await selectBrand(b.brandId);
    notice(
      "Extraction started. Brand ID saved: " +
        b.brandId +
        ". Status refreshes every five seconds.",
    );
  });
};
$("refresh-state").onclick = () =>
  work("Reading saved state", async () => {
    await flush();
    pollDeadline = Date.now() + 300000;
    await loadBrands();
    await refresh();
    notice("Read current saved state. No AI request was repeated.");
  });
$("brand-form").onsubmit = (e) => {
  e.preventDefault();
  work("Saving brand information", async () => {
    await request("brandPatch", {
      patch: {
        identity: {
          brandName: $("brand-name").value,
          tagline: $("brand-tagline").value,
          description: $("brand-description").value,
        },
      },
    });
    await refresh();
    notice("Brand identity saved. Other identity fields were preserved.");
  });
};
$("design-form").onsubmit = (e) => {
  e.preventDefault();
  work("Saving design guidance", async () => {
    await request("brandPatch", {
      patch: {
        emailDesign: $("email-design").value,
        imageStyle: $("image-style").value,
      },
    });
    await refresh();
    notice(
      "Design guidance saved. These complete Markdown documents replace the previous values.",
    );
  });
};
$("generate-form").onsubmit = (e) => {
  e.preventDefault();
  work(
    "Creating an email",
    async () => {
      if (!state?.brand?.ready)
        throw Error("Select or extract a ready brand first.");
      await flush();
      const locale = $("locale").value,
        prompt =
          $("generate-prompt").value +
          (locale
            ? `\nCreate the entire email in ${locale}, including visible text, CTA, preview text and subject. Preserve hotel names, approved facts, URLs and template layout. Do not send.`
            : ""),
        fields = {
          brandId: state.brand.brandId,
          groupId,
          prompt,
          subjectLine: $("generate-subject").value,
          ...(referenceEmail
            ? { referenceEmailId: referenceEmail.emailId }
            : {}),
        };
      const r = await request("generate", {
        ...fields,
        actionId: intent("generate", fields),
      });
      clearIntent("generate");
      if (r.receipt) {
        lastSaved = null;
        state.email = {
          emailId: r.receipt.emailId,
          emailVersionId: r.receipt.emailVersionId,
        };
        remember();
        notice(
          "Created email " +
            r.receipt.emailId +
            " · version " +
            r.receipt.emailVersionId,
        );
        await refresh(r.receipt.emailId);
        await loadGroups();
        await focus(r.receipt.emailId);
      } else notice(r.answer);
    },
    "Brew is creating and saving a real design using your account’s credits.",
    false,
  );
};
$("edit-form").onsubmit = (e) => {
  e.preventDefault();
  work(
    "Applying an AI edit",
    async () => {
      if (!state?.email) throw Error("Create or select an email first.");
      if (selectedEmail && selectedEmail.emailId !== state.email.emailId)
        throw Error("Wait for the selected email to load.");
      const emailId = state.email.emailId,
        requestedVersion = $("edit-baseline").value;
      await flush();
      requireResolvedSelection();
      const version =
        requestedVersion ||
        selectedEmail?.emailVersionId ||
        state.email.emailVersionId;
      if (!version) throw Error("Resolve the source version before editing.");
      if (!canvas) throw Error("Wait for the canvas to connect.");
      await canvas.clearSelection();
      try {
        const r = await request("edit", {
          emailId,
          emailVersionId: version,
          prompt: $("edit-prompt").value,
        });
        notice(
          r.receipt
            ? "New version saved: " + r.receipt.emailVersionId
            : r.answer,
        );
        lastSaved = null;
        await refresh(emailId);
      } finally {
        await focus(emailId);
      }
    },
    "Manual changes are saved and the editing lease is released. The live canvas stays mounted.",
  );
};
$("fit").onclick = () =>
  canvas?.fitView().catch((e) => notice(errorInfo(e).message, true));
$("reopen").onclick = () =>
  work("Saving and reopening", async () => {
    await dispose();
    await refresh();
    notice("Reopened with a fresh session. Saved content is read from Brew.");
  });
$("save").onclick = $("read-html").onclick = () =>
  work("Reading exact saved HTML", showHtml);
$("trace-toggle").onclick = () => {
  const open = $("trace-content").hidden;
  $("trace-content").hidden = !open;
  $("trace-toggle").setAttribute("aria-expanded", String(open));
};
async function copy(value: string, button: HTMLElement) {
  await navigator.clipboard.writeText(value);
  const old = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => (button.textContent = old), 1500);
}
$("copy-result").onclick = () =>
  copy(JSON.stringify(latestResult, null, 2), $("copy-result")).catch((e) =>
    notice(errorInfo(e).message, true),
  );
$("copy-html").onclick = () =>
  copy(htmlResult?.html || "", $("copy-html")).catch((e) =>
    notice(errorInfo(e).message, true),
  );
$("download-html").onclick = () => {
  if (!htmlResult?.html) return;
  const url = URL.createObjectURL(
    new Blob([htmlResult.html], { type: "text/html" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "email-" + htmlResult.emailVersionId + ".html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("beforeunload", (e) => {
  if (canvasDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  if (currentProof && apiKey && state?.brand)
    fetch("/api/demo", {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: authHeaders(),
      body: JSON.stringify({
        action: "revoke",
        brandId: state.brand.brandId,
        target: canvasTarget,
        proof: currentProof,
      }),
    }).catch(() => {});
});
const codeCard = (key: string, label?: string) =>
  `<div class="code-card"><div><span>${escape(label || "SDK EXAMPLE")}</span><button class="copy-icon" data-copy="${escape(key)}" aria-label="Copy ${escape(key)} example">Copy</button></div><pre data-code="${escape(key)}"></pre></div>`;
$("implementation-content").innerHTML =
  `<section class="doc-section"><h2>Demo sequence</h2><p>Connect → select or extract a hotel → review brand context → create a group and English template → select it and remix into French with a French subject → rename → AI edit → manual edit → Save &amp; HTML → reopen.</p><p>Use a dedicated demo group. Fresh extraction needs a spare brand slot; generation and edits use real credits. The <a href="/sojern-implementation-guide.md" download>Markdown</a> and <a href="/sojern-implementation-guide.pdf" target="_blank" rel="noopener">PDF</a> include the full presenter sequence, recovery steps and verification scope.</p></section><section class="doc-section"><h2>Run this example</h2><p>The guide, prompts and <a href="/headless-email-studio.zip" download>complete source</a> are public. Use Node 24. The example has strict TypeScript, a static UI, a small React/Radix picker and one stateless function. Enter your own API key to run account actions.</p>${codeCard("quickstart", "LOCAL SETUP")}<p>Open http://localhost:4400. For Vercel: build with <code>npm run build</code>, output <code>public</code>, set the exact HTTPS <code>DEMO_ORIGIN</code> and a <code>DEMO_SESSION_SECRET</code> through runtime settings. The source README explains the files, API actions, checks and release process. The maintained app lives in <a href="https://github.com/GetBrew/sojern-brew-demo" target="_blank" rel="noopener">GetBrew’s standalone GitHub repository</a>; the source ZIP is public.</p></section><div class="architecture"><div class="eyebrow">THE INTEGRATION BOUNDARY</div><pre>Sojern admin app · existing SSO and hotel permissions\n  │\n  ├─ Your backend → server-only Brew key → brand & email APIs\n  │     Hotel records → brandId · email ownership · grant ownership\n  │\n  └─ Brew canvas → authorized, short-lived iframe session\n        Save → await flush() → your backend → exact-version HTML</pre></div><div class="doc-grid"><article class="doc-card"><div class="eyebrow">01 · PROVISION THE BRAND</div><h2>Map each hotel brand once.</h2><p>Use an organization key with <code>brands</code> and <code>emails</code> permissions. Persist the hotel-to-brand mapping immediately, then poll the saved ID until <code>ready: true</code>. Reuse your current database and authentication.</p>${codeCard("extract")}</article><article class="doc-card"><div class="eyebrow">02 · CREATE & REFINE</div><h2>Keep ownership on your backend.</h2><p>Pin a client with <code>withBrand()</code>. Save the email and version IDs against the authorized hotel. Check the design-or-prose response union. POST generation supports idempotency; do not automatically retry a PATCH AI edit.</p>${codeCard("generate")}</article><article class="doc-card"><div class="eyebrow">03 · AUTHORIZE THE CANVAS</div><h2>Authorize staff access.</h2><p>Use your existing staff session and hotel authorization to issue a scoped canvas grant from your backend. Configure the exact parent origin and editing permissions; renew and revoke only owned sessions. New brands need no client-app setup.</p>${codeCard("session")}<details><summary>Optional: publishable client ID</summary><p>Configure an All brands client ID to reuse it across current and future hotel brands, or restrict it to one brand. Pass the selected brandId and configure the exact allowed origin and editing. It does not authenticate individual staff or grant generation access.</p>${codeCard("clientCanvas")}</details></article><article class="doc-card"><div class="eyebrow">04 · SAVE & RETRIEVE</div><h2>Export the version you saved.</h2><p>Await <code>flush()</code> before navigation, an AI edit or an HTML read. Retain the canvas <code>onSaved</code> version ID. Manual edits may patch a historical version; do not silently substitute latest.</p>${codeCard("html")}</article></div><section class="doc-section"><h2>Templates, locales and groups</h2><p>Select a template in the live canvas, choose Use selected in Create, and choose the language. Supply the subject in that language. Each remix is a new email in the open group; the source stays intact. The reference API uses the latest saved version. For an exact historical reference, clone that version first.</p>${codeCard("selection")}${codeCard("remix")}<p>The group/email picker uses shadcn nested menus. Rename groups in their menu, or use Rename email for the active email. Ungrouped is reserved.</p>${codeCard("rename")}<p>Keep the group canvas mounted across API writes. Before an AI edit, await clearSelection() to save and release the editing lease; block new selection until the request finishes and focus the result. Never key the iframe by email or version.</p>${codeCard("edit")}</section><section class="doc-section"><h2>Programmatic brand management</h2><p>Read the extracted context, then update the approved identity or design guidance. Identity fields merge. Markdown guidance replaces its entire saved document.</p>${codeCard("brand")}</section><section class="doc-section"><h2>What you need</h2><table class="capabilities-table"><thead><tr><th>Resource</th><th>Use what you already have</th></tr></thead><tbody><tr><td>Staff access</td><td>Sojern SSO, hotel authorization and CSRF protection.</td></tr><tr><td>Data</td><td>Hotel → Brew brand mapping, email ownership, canvas grant ownership.</td></tr><tr><td>Server runtime</td><td>SDK supports Node.js 20+. Allow up to the generation request budget; use an existing worker only if necessary.</td></tr><tr><td>Credentials</td><td>Organization key in the server secret manager. The <code>emails</code> scope also implies <code>sends</code> and <code>domains</code>; expose only authoring operations.</td></tr><tr><td>Browser</td><td>WebGPU or WebGL2 with visible <code>onError</code> handling. Exact HTTPS parent origin and CSP <code>frame-src https://brew.new</code>. React 18/19 or the framework-neutral controller.</td></tr><tr><td>Capacity</td><td>Available brand slots and credits. Show plan limits and rate-limit responses clearly.</td></tr></tbody></table></section><section class="doc-section"><h2>Know the current boundaries</h2><div class="doc-grid"><article class="doc-card"><h3>Supported today</h3><p>Programmatic extraction, brand discovery and readiness, identity/design guidance reads and updates, email generation, AI and manual editing, durable assets, scoped canvas sessions, and saved HTML.</p></article><article class="doc-card"><h3>Confirm in the pilot</h3><p>No public brand deletion, restart-extraction or logo-replacement API. The hosted iframe has no SDK theme, logo or custom-domain options. This playground uses the API key you enter, keeps it in page memory, and calls Brew through a stateless backend. It has no fixed account, login or sample IDs. Production apps should keep organization keys on their own backend and retain existing staff authorization.</p></article></div></section><section class="doc-section"><h2>Verify the complete pilot</h2><ul class="acceptance-list"><li>Fresh extraction reaches ready and exposes failure/limit states.</li><li>Brand identity and Markdown update semantics are verified.</li><li>Generation and AI edits return saved version IDs.</li><li>Manual edits survive flush and reopen.</li><li>Image uploads/crops survive save and CDN reads.</li><li>Viewer access cannot edit.</li><li>Wrong hotel, target and session selections are denied.</li><li>Renewal and revocation recheck staff access.</li><li>Exact-version HTML matches the save receipt.</li><li>Your deployed HTTPS origin and CSP pass browser checks.</li></ul></section><section class="doc-section"><h2>Canonical resources</h2><div class="resource-grid"><a class="resource" href="https://docs.brew.new/sdks/typescript/white-label-email-editor" target="_blank" rel="noopener"><strong>White-label guide ↗</strong><span>The complete four-task integration plan.</span></a><a class="resource" href="https://docs.brew.new/sdks/typescript/embedded-email-canvas" target="_blank" rel="noopener"><strong>Embedded canvas ↗</strong><span>React, controller and session contracts.</span></a><a class="resource" href="https://docs.brew.new/api-reference/api/organization-and-brand-scope" target="_blank" rel="noopener"><strong>Credential boundaries ↗</strong><span>Organization credentials and brand selection.</span></a><a class="resource" href="https://brew.new/openapi.json" target="_blank" rel="noopener"><strong>Live OpenAPI ↗</strong><span>Machine-readable production API contract.</span></a><a class="resource" href="https://github.com/GetBrew/typescript-sdk/tree/main/examples/embedded-email-canvas" target="_blank" rel="noopener"><strong>Open-source example ↗</strong><span>Start from the SDK canvas demo.</span></a><a class="resource" href="/sojern-implementation-guide.md" download><strong>Share with agents ↓</strong><span>Implementation context and acceptance prompts.</span></a></div></section>`;
const master =
  agentBrief +
  "\n\n" +
  agentPrompts
    .map((p) => p.number + ". " + p.title + "\n" + p.text)
    .join("\n\n");
$("agent-content").innerHTML =
  `<article class="agent-card"><div class="agent-heading"><div><div class="eyebrow">COMPLETE IMPLEMENTATION BRIEF</div><h2>One prompt for the whole integration.</h2></div><button class="button small" data-agent="master">Copy full brief</button></div><p>Give this to an agent in your existing application repository, together with the Markdown guide.</p><details><summary>Read the complete prompt</summary><div class="agent-text">${escape(master)}</div></details></article>` +
  agentPrompts
    .map(
      (p, i) =>
        `<article class="agent-card"><div class="agent-heading"><div><div class="eyebrow">TASK ${escape(p.number)}</div><h2>${escape(p.title)}</h2></div><button class="button small" data-agent="${i}">Copy prompt</button></div><div class="agent-text">${escape(p.text)}</div></article>`,
    )
    .join("");
for (const el of document.querySelectorAll<HTMLElement>("[data-code]"))
  el.textContent = snippets[el.dataset.code || ""] || "";
for (const el of document.querySelectorAll<HTMLElement>("[data-copy]"))
  el.addEventListener("click", () =>
    copy(snippets[el.dataset.copy || ""], el).catch((e) =>
      notice(errorInfo(e).message, true),
    ),
  );
for (const el of document.querySelectorAll<HTMLElement>("[data-agent]"))
  el.addEventListener("click", () =>
    copy(
      el.dataset.agent === "master"
        ? master
        : agentPrompts[Number(el.dataset.agent)].text,
      el,
    ).catch((e) => notice(errorInfo(e).message, true)),
  );
view(location.hash.slice(1) || "workspace");
renderEmpty();
