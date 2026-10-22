import type { IncomingMessage, ServerResponse } from "node:http";
import type { CanvasTarget } from "@brew.new/sdk/embed";
import type { UpdateBrandInput } from "@brew.new/sdk";
import {
  errorInfo,
  isRecord,
  type TraceEntry,
  type EmailReceipt,
} from "../lib/contracts.ts";
type DemoRequest = IncomingMessage & { body?: unknown };
import { createBrewClient, SDK_VERSION } from "@brew.new/sdk";
import {
  DemoError,
  hash,
  sign,
  requireProof,
  credentials,
} from "../lib/security.ts";
function string(value: unknown, name: string, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new DemoError(
      400,
      "INVALID_INPUT",
      `${name} must be a non-empty string of at most ${max} characters.`,
    );
  return value.trim();
}
async function readBody(req: DemoRequest): Promise<Record<string, unknown>> {
  let body;
  try {
    body = req.body;
  } catch {
    throw new DemoError(400, "INVALID_INPUT", "The request JSON is invalid.");
  }
  if (
    body !== undefined &&
    typeof body !== "string" &&
    (!body || typeof body !== "object")
  )
    throw new DemoError(400, "INVALID_INPUT", "Use a JSON object.");
  if (body && typeof body === "object") {
    if (Array.isArray(body))
      throw new DemoError(400, "INVALID_INPUT", "Use a JSON object.");
    if (JSON.stringify(body).length > 450000)
      throw new DemoError(413, "BODY_TOO_LARGE", "The request is too large.");
    return body as Record<string, unknown>;
  }
  let raw = typeof body === "string" ? body : "";
  if (!raw)
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 450000)
        throw new DemoError(413, "BODY_TOO_LARGE", "The request is too large.");
    }
  if (raw.length > 450000)
    throw new DemoError(413, "BODY_TOO_LARGE", "The request is too large.");
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new DemoError(400, "INVALID_INPUT", "Use a JSON object.");
  return parsed as Record<string, unknown>;
}
export default async function handler(req: DemoRequest, res: ServerResponse) {
  const started = Date.now(),
    trace: TraceEntry[] = [];
  const send = (status: number, data: Record<string, unknown>) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(
      JSON.stringify({ ...data, trace, elapsedMs: Date.now() - started }),
    );
  };
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(405, {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Use POST with your API key.",
        },
      });
    }
    const secret = process.env.DEMO_SESSION_SECRET,
      origin = process.env.DEMO_ORIGIN;
    if (!secret || !origin)
      throw new DemoError(
        503,
        "DEMO_NOT_CONFIGURED",
        "The host is being configured.",
      );
    const apiKey = credentials(req, origin),
      principal = hash(apiKey),
      input = await readBody(req),
      params = new URL(req.url || "/api/demo", "https://demo.invalid")
        .searchParams;
    const action = string(input.action || params.get("action"), "Action", 40);
    const platform = createBrewClient({
      apiKey,
      maxRetries: 0,
      retryOnTimeout: false,
      fetch: async (url, options) => {
        const t = Date.now();
        const result = await fetch(url, options);
        const u = new URL(url instanceof Request ? url.url : url);
        trace.push({
          method: options?.method || "GET",
          path: u.pathname + u.search,
          status: result.status,
          durationMs: Date.now() - t,
          requestId: result.headers.get("x-request-id"),
        });
        return result;
      },
    });
    if (action === "brands")
      return send(200, {
        data: await platform.brands.list({
          limit: 50,
          ...(input.cursor
            ? { cursor: string(input.cursor, "Cursor", 8192) }
            : {}),
        }),
      });
    if (action === "extract") {
      const website = string(input.url, "Website", 2048);
      let url;
      try {
        url = new URL(website);
      } catch {
        throw new DemoError(
          400,
          "INVALID_URL",
          "Enter a full HTTPS website URL.",
        );
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.hostname.includes(".") ||
        /^[\d.:]+$/.test(url.hostname) ||
        /\.(local|internal)$/.test(url.hostname)
      )
        throw new DemoError(400, "INVALID_URL", "Use a public HTTPS website.");
      const actionId = string(input.actionId, "Action ID", 80);
      const brand = await platform.brands.create(
        { url: url.href },
        {
          idempotencyKey: `headless-${hash(principal + actionId).slice(0, 48)}`,
        },
      );
      return send(201, { receipt: brand });
    }
    const brandId = string(
        input.brandId || req.headers["x-brew-brand-id"],
        "Brand ID",
        100,
      ),
      client = platform.withBrand(brandId);
    const emailId = () =>
      string(
        input.emailId ||
          (isRecord(input.target) ? input.target.emailId : undefined),
        "Email ID",
        100,
      );
    const canvasTarget = (): CanvasTarget => {
      const t = isRecord(input.target) ? input.target : {};
      if (t?.type === "group")
        return { type: "group", groupId: string(t.groupId, "Group ID", 100) };
      if (t?.type === "email")
        return { type: "email", emailId: string(t.emailId, "Email ID", 100) };
      throw new DemoError(400, "INVALID_TARGET", "Choose a group or email.");
    };
    const targetKey = (t: CanvasTarget) =>
      t.type + ":" + (t.type === "group" ? t.groupId : t.emailId);
    if (action === "groups")
      return send(200, {
        data: await client.emailGroups.list({
          limit: 50,
          ...(input.cursor
            ? { cursor: string(input.cursor, "Cursor", 8192) }
            : {}),
        }),
      });
    if (action === "renameGroup")
      return send(200, {
        data: await client.emailGroups.update({
          groupId: string(input.groupId, "Group ID", 100),
          name: string(input.name, "Name", 60),
        }),
      });
    if (action === "createGroup")
      return send(201, {
        data: await client.emailGroups.create(
          { name: string(input.name, "Name", 60) },
          {
            idempotencyKey: `headless-${hash(principal + brandId + string(input.actionId, "Action ID", 80)).slice(0, 48)}`,
          },
        ),
      });
    if (action === "renameEmail")
      return send(200, {
        data: await client.emails.edit({
          emailId: emailId(),
          title: string(input.name, "Name", 200),
        }),
      });
    if (action === "emails")
      return send(200, {
        data: await client.emails.list({
          limit: 50,
          sortBy: "updatedAt",
          ...(input.groupId
            ? { groupId: string(input.groupId, "Group ID", 100) }
            : {}),
          ...(input.cursor
            ? { cursor: string(input.cursor, "Cursor", 8192) }
            : {}),
        }),
      });
    if (action === "read") {
      const [brand, email] = await Promise.all([
        client.brand.get({
          include: ["identity", "emailDesign", "imageStyle", "logos"],
        }),
        input.emailId
          ? client.emails.get(emailId(), { include: "versions" })
          : null,
      ]);
      return send(200, { data: { brand, email, sdkVersion: SDK_VERSION } });
    }
    if (action === "html") {
      const id = emailId(),
        version = input.emailVersionId
          ? string(input.emailVersionId, "Version ID", 100)
          : (await client.emails.get(id)).emailVersionId;
      if (!version)
        throw new DemoError(
          409,
          "VERSION_UNAVAILABLE",
          "The saved version is not available yet.",
        );
      return send(200, {
        data: await client.emails.get(id, {
          include: ["html", "text", "versions"],
          emailVersionId: version,
        }),
      });
    }
    if (action === "canvas") {
      const target = canvasTarget(),
        id = targetKey(target);
      let session;
      if (input.sessionId) {
        const p = requireProof(
          req.headers["x-canvas-proof"],
          secret,
          principal,
          brandId,
          id,
        );
        if (p.sessionId !== input.sessionId)
          throw new DemoError(
            403,
            "SESSION_NOT_OWNED",
            "The session does not match.",
          );
        session = await client.canvas.sessions.refresh(p.sessionId);
      } else
        session = await client.canvas.sessions.create({
          target,
          user: {
            externalId: `headless:${hash(principal + string(input.visitorId || req.headers["x-visitor-id"], "Visitor ID", 100)).slice(0, 32)}`,
            name: "Email designer",
          },
          parentOrigin: origin,
          permissions: ["read", "edit", "presence"],
        });
      const demoProof = sign(
        {
          kind: "canvas",
          principal,
          brandId,
          targetKey: id,
          sessionId: session.sessionId,
          exp: Date.parse(session.expiresAt),
        },
        secret,
      );
      return send(200, { ...session, demoProof });
    }
    if (action === "revoke") {
      const p = requireProof(
        input.proof,
        secret,
        principal,
        brandId,
        targetKey(canvasTarget()),
      );
      await client.canvas.sessions.revoke(p.sessionId);
      return send(200, { data: { revoked: true } });
    }
    if (action === "brandPatch") {
      const patch = input.patch;
      if (
        !patch ||
        typeof patch !== "object" ||
        Array.isArray(patch) ||
        Object.keys(patch).some(
          (k) => !["identity", "emailDesign", "imageStyle"].includes(k),
        )
      )
        throw new DemoError(
          400,
          "INVALID_INPUT",
          "Only identity, emailDesign and imageStyle can be changed.",
        );
      return send(200, {
        data: await client.brand.patch(patch as UpdateBrandInput),
      });
    }
    if (!["generate", "edit"].includes(action))
      throw new DemoError(
        400,
        "UNKNOWN_ACTION",
        "This action is not available.",
      );
    const ready = await client.brand.get();
    if (!ready.ready)
      throw new DemoError(
        422,
        "BRAND_NOT_READY",
        "Wait for brand extraction to finish.",
      );
    let result:
      | Awaited<ReturnType<typeof client.emails.generate>>
      | EmailReceipt;
    try {
      if (action === "generate")
        result = await client.emails.generate(
          {
            prompt: string(input.prompt, "Prompt", 6000),
            subjectLine: string(input.subjectLine, "Subject", 250),
            category: "newsletter",
            ...(input.referenceEmailId
              ? {
                  referenceEmailId: string(
                    input.referenceEmailId,
                    "Reference email ID",
                    100,
                  ),
                }
              : {}),
            groupId: string(input.groupId || "ungrouped", "Group ID", 100),
          },
          {
            idempotencyKey: `headless-${hash(principal + brandId + string(input.actionId, "Action ID", 80)).slice(0, 48)}`,
          },
        );
      else {
        const source = await client.emails.get(emailId(), {
          ...(input.emailVersionId
            ? {
                emailVersionId: string(input.emailVersionId, "Version ID", 100),
              }
            : {}),
        });
        if (source.status !== "ready")
          throw new DemoError(
            409,
            "EMAIL_NOT_READY",
            "Wait for the active generation to settle.",
          );
        result = await client.emails.edit({
          emailId: emailId(),
          emailVersionId: source.emailVersionId,
          prompt: string(input.prompt, "Edit prompt", 6000),
        });
      }
    } catch (error) {
      const e = errorInfo(error);
      if (
        e.code === "EMAIL_RESULT_UNAVAILABLE" &&
        e.details?.committed &&
        e.details.emailId &&
        e.details.emailVersionId &&
        (action === "generate" || e.details.emailId === emailId())
      )
        result = {
          emailId: e.details.emailId,
          emailVersionId: e.details.emailVersionId,
          runId: e.details.runId,
        };
      else throw error;
    }
    // Return committed IDs independently of follow-up reads, which may fail after the write succeeds.
    return send(
      200,
      "emailId" in result
        ? {
            receipt: {
              emailId: result.emailId,
              emailVersionId: result.emailVersionId,
              runId: "runId" in result ? result.runId : undefined,
            },
          }
        : { answer: result.response },
    );
  } catch (error) {
    const e = errorInfo(error);
    const status =
      error instanceof SyntaxError
        ? 400
        : typeof e.status === "number" &&
            Number.isInteger(e.status) &&
            e.status >= 400 &&
            e.status < 600
          ? e.status
          : 500;
    return send(status, {
      error: {
        code: e.code || (status === 400 ? "INVALID_INPUT" : "DEMO_ERROR"),
        message:
          error instanceof SyntaxError
            ? "The request JSON is invalid."
            : status === 500
              ? "The request could not complete. Read the saved state before repeating an AI action."
              : e.message?.slice(0, 1000) || "The request could not complete.",
        ...(e.requestId ? { requestId: e.requestId } : {}),
        ...(e.suggestion ? { suggestion: e.suggestion } : {}),
        ...(e.details?.committed
          ? {
              details: {
                committed: true,
                emailId: e.details.emailId,
                emailVersionId: e.details.emailVersionId,
                runId: e.details.runId,
              },
            }
          : {}),
      },
    });
  }
}
