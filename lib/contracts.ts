// Reuse the public SDK contract across the same-origin function and UI.
import type {
  BrandGetResponse,
  CreateBrandResponse,
  CreateEmailGroupResponse,
  EmailGroupsListResponse,
  GetEmailResponse,
  ListBrandsResponse,
  ListEmailsResponse,
  UpdateBrandInput,
} from "@brew.new/sdk";
import type { CanvasSession, CanvasTarget } from "@brew.new/sdk/embed";

export type StudioEmail = Pick<GetEmailResponse, "emailId"> &
  Partial<Omit<GetEmailResponse, "emailId" | "emailVersionId">> & {
    emailVersionId?: string | null;
  };
export interface StudioState {
  brand: BrandGetResponse;
  email: StudioEmail | null;
  sdkVersion?: string;
}
export interface TraceEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string | null;
}
export interface TraceMetadata {
  trace?: TraceEntry[];
  elapsedMs?: number;
}
export interface EmailReceipt {
  emailId: string;
  emailVersionId: string;
  runId?: string;
}
export type DemoCanvasSession = CanvasSession &
  TraceMetadata & { demoProof: string };
export interface DemoInput {
  brandId?: string;
  emailId?: string;
  emailVersionId?: string;
  referenceEmailId?: string;
  groupId?: string;
  cursor?: string | null;
  url?: string;
  name?: string;
  prompt?: string;
  subjectLine?: string;
  actionId?: string;
  patch?: UpdateBrandInput;
  proof?: string;
  target?: CanvasTarget | null;
}
export interface DemoResults {
  brands: { data: ListBrandsResponse };
  extract: { receipt: CreateBrandResponse };
  groups: { data: EmailGroupsListResponse };
  emails: { data: ListEmailsResponse };
  read: { data: StudioState };
  html: { data: GetEmailResponse };
  brandPatch: { data: BrandGetResponse };
  createGroup: { data: CreateEmailGroupResponse };
  renameGroup: { data: CreateEmailGroupResponse };
  renameEmail: { data: unknown };
  generate: { receipt?: EmailReceipt; answer?: string };
  edit: { receipt?: EmailReceipt; answer?: string };
  revoke: { data: { revoked: boolean } };
}

export interface ErrorInfo {
  message: string;
  code?: string;
  status?: number;
  requestId?: string;
  suggestion?: string;
  details?: {
    committed?: boolean;
    emailId?: string;
    emailVersionId?: string;
    runId?: string;
  };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function errorInfo(value: unknown): ErrorInfo {
  const e = isRecord(value) ? value : {};
  const details = isRecord(e.details) ? e.details : {};
  return {
    message:
      typeof e.message === "string"
        ? e.message
        : "The request could not complete.",
    code: typeof e.code === "string" ? e.code : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
    requestId: typeof e.requestId === "string" ? e.requestId : undefined,
    suggestion: typeof e.suggestion === "string" ? e.suggestion : undefined,
    details: {
      committed: details.committed === true,
      emailId:
        typeof details.emailId === "string" ? details.emailId : undefined,
      emailVersionId:
        typeof details.emailVersionId === "string"
          ? details.emailVersionId
          : undefined,
      runId: typeof details.runId === "string" ? details.runId : undefined,
    },
  };
}
