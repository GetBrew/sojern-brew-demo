import type { IncomingHttpHeaders } from "node:http";
import { isRecord } from "./contracts.ts";

export interface CanvasProof {
  kind: string;
  principal: string;
  brandId: string;
  targetKey: string;
  sessionId: string;
  exp: number;
}

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
export class DemoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function safeEqual(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function sign(value: unknown, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
export function verify(
  token: unknown,
  secret: string,
  kind: string,
  now = Date.now(),
): CanvasProof | null {
  try {
    if (typeof token !== "string" || token.length > 12000) return null;
    const [payload, sig, ...extra] = token.split(".");
    if (
      extra.length ||
      !safeEqual(
        sig,
        createHmac("sha256", secret).update(payload).digest("base64url"),
      )
    )
      return null;
    const value: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !isRecord(value) ||
      value.kind !== kind ||
      typeof value.exp !== "number" ||
      !Number.isFinite(value.exp) ||
      value.exp <= now ||
      typeof value.principal !== "string" ||
      typeof value.brandId !== "string" ||
      typeof value.targetKey !== "string" ||
      typeof value.sessionId !== "string"
    )
      return null;
    return {
      kind,
      exp: value.exp,
      principal: value.principal,
      brandId: value.brandId,
      targetKey: value.targetKey,
      sessionId: value.sessionId,
    };
  } catch {
    return null;
  }
}
export function requireProof(
  token: unknown,
  secret: string,
  principal: string,
  brandId: string,
  targetKey: string,
) {
  const p = verify(token, secret, "canvas");
  if (
    !p ||
    p.principal !== principal ||
    p.brandId !== brandId ||
    p.targetKey !== targetKey
  )
    throw new DemoError(
      403,
      "SESSION_NOT_OWNED",
      "This canvas session does not belong to these credentials and target.",
    );
  return p;
}
export function credentials(
  req: { headers: IncomingHttpHeaders },
  origin: string,
) {
  if (req.headers.origin !== origin)
    throw new DemoError(
      403,
      "REQUEST_NOT_AUTHORIZED",
      "Use this app’s own origin.",
    );
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    throw new DemoError(415, "INVALID_CONTENT_TYPE", "Use application/json.");
  const match = /^Bearer (brew_[A-Za-z0-9_-]{8,200})$/.exec(
    req.headers.authorization || "",
  );
  if (!match)
    throw new DemoError(
      401,
      "API_KEY_REQUIRED",
      "Enter your Brew API key to connect.",
    );
  return match[1];
}
