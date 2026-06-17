import type { CallFilters, CallOutcome, CallRecord, RawCallRecord } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const STATIC_CALLS_URL = `${import.meta.env.BASE_URL}calls.json`;
const LOCAL_REVIEWS_KEY = "botamin_analyst_reviews";

type RequestOptions = RequestInit & { allowNotFound?: boolean };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (options.allowNotFound && response.status === 404) {
    return undefined as T;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function getLocalReviews(): Record<string, AnalystReviewPayload> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REVIEWS_KEY) || "{}") as Record<string, AnalystReviewPayload>;
  } catch {
    return {};
  }
}

function setLocalReview(id: string, payload: AnalystReviewPayload) {
  const reviews = getLocalReviews();
  reviews[id] = payload;
  localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(reviews));
}

function applyLocalReview(call: CallRecord): CallRecord {
  const review = getLocalReviews()[call.id];
  if (!review) return call;
  return {
    ...call,
    manualCallOutcome: review.manual_call_outcome || review.manualCallOutcome || "",
    manualFunnelStage: review.manual_funnel_stage,
    manualFailureStage: review.manual_failure_stage,
    manualFailureReason: review.manual_failure_reason,
    analystComment: review.analyst_comment,
    checkedByAnalyst: true,
  };
}

const callOutcomes = new Set<CallOutcome>([
  "no_answer",
  "dropped_or_voicemail",
  "bot_monologue_ignored",
  "conversation_happened_not_interested",
  "conversation_happened_callback",
  "conversation_happened_interested",
  "meeting_scheduled",
]);

function firstCallOutcome(raw: RawCallRecord, keys: string[]): CallOutcome | undefined {
  const value = firstString(raw, keys);
  return value && callOutcomes.has(value as CallOutcome) ? value as CallOutcome : undefined;
}

function firstString(raw: RawCallRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstBoolean(raw: RawCallRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();
      if (["true", "yes", "1", "да"].includes(normalized)) return true;
      if (["false", "no", "0", "нет"].includes(normalized)) return false;
    }
  }
  return undefined;
}

function firstNumber(raw: RawCallRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function durationSeconds(raw: RawCallRecord): number | undefined {
  const direct = firstNumber(raw, ["duration_seconds", "call_duration_seconds"]);
  if (direct !== undefined) return direct;

  const value = raw.duration ?? raw.call_duration ?? raw["длительность мин:сек"];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1 ? Math.round(value * 24 * 60 * 60) : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = /^(\d{1,3}):(\d{2})$/.exec(trimmed);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    if (Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return undefined;
}

function parseTranscript(value: unknown): { messages?: CallRecord["transcript"]; text?: string } {
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const record = item as Record<string, unknown>;
        const roleValue = String(record.role || record.speaker || "system").toLowerCase();
        const role = roleValue.includes("bot") ? "bot" : roleValue.includes("user") || roleValue.includes("client") ? "user" : "system";
        const text = String(record.text || record.message || record.content || "").trim();
        return text ? { role, text } : undefined;
      })
      .filter(Boolean) as CallRecord["transcript"];
    return messages?.length ? { messages } : {};
  }

  if (typeof value !== "string" || !value.trim()) return {};

  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const messages = lines
    .map((line) => {
      const match = /^(bot|assistant|user|client|клиент|бот)\s*:\s*(.+)$/i.exec(line);
      if (!match) return undefined;
      const speaker = match[1].toLowerCase();
      return { role: speaker.includes("bot") || speaker.includes("бот") || speaker.includes("assistant") ? "bot" : "user", text: match[2].trim() };
    })
    .filter(Boolean) as CallRecord["transcript"];

  return messages?.length === lines.length ? { messages } : { text: value };
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(numeric));
    const dayFraction = numeric - Math.floor(numeric);
    epoch.setUTCSeconds(Math.round(dayFraction * 24 * 60 * 60));
    return epoch.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function normalizeCall(raw: RawCallRecord): CallRecord {
  const transcriptSource = raw.transcript || raw.dialogue_history || raw.dialog_history || raw["история диалога юзер-бот"];
  const transcript = parseTranscript(transcriptSource);
  const id = firstString(raw, ["id", "uuid", "call_id", "callId", "record_id"]) || firstString(raw, ["audio_url", "recording_url", "запись аудио"]) || crypto.randomUUID();
  const phone = firstString(raw, ["phone", "client_phone", "customer_phone", "телефон"]);
  const client = firstString(raw, ["client", "client_name", "customer", "customer_name", "name", "phone", "телефон"]) || "Без имени";

  return {
    id,
    client,
    phone,
    company: firstString(raw, ["company", "company_name", "organization"]),
    callStartedAt: normalizeDate(firstString(raw, ["call_started_at", "started_at", "date_time", "datetime", "дата и время"])),
    durationSeconds: durationSeconds(raw),
    normalizedStatus: firstString(raw, ["normalized_status", "status_normalized", "status", "статус"]),
    technicalStatus: firstString(raw, ["technical_status", "technicalStatus", "provider_status", "raw_status", "статус"]),
    callOutcome: firstCallOutcome(raw, ["call_outcome", "callOutcome", "manual_call_outcome"]),
    audioUrl: firstString(raw, ["audio_url", "recording_url", "record_url", "audio", "запись аудио"]),
    endReason: firstString(raw, ["end_reason", "hangup_reason", "finish_reason", "причина завершения"]),
    result: firstString(raw, ["result", "call_result", "outcome"]),
    contactType: firstString(raw, ["contact_type", "contactType"]),
    maxFunnelStage: firstString(raw, ["max_funnel_stage", "maxFunnelStage", "funnel_stage", "stage"]),
    funnelStage: firstString(raw, ["funnel_stage", "stage", "manual_funnel_stage"]),
    failureStage: firstString(raw, ["failure_stage", "failed_stage", "dropoff_stage", "where_failed", "manual_failure_stage"]),
    failureReason: firstString(raw, ["failure_reason", "dropoff_reason", "failed_reason", "manual_failure_reason"]),
    aiSummary: firstString(raw, ["ai_summary", "summary"]),
    aiComment: firstString(raw, ["ai_comment", "comment"]),
    answered: firstBoolean(raw, ["answered", "is_answered"]),
    meaningfulConversation: firstBoolean(raw, ["meaningful_conversation", "is_meaningful", "meaningful"]),
    botMonologueOrIgnored: firstBoolean(raw, ["bot_monologue_or_ignored", "is_bot_monologue_or_ignored"]),
    stageRank: firstNumber(raw, ["stage_rank", "stageRank"]),
    wasOfferExplained: firstBoolean(raw, ["was_offer_explained", "offer_explained", "is_offer_explained"]),
    wasMeetingOffered: firstBoolean(raw, ["was_meeting_offered", "meeting_offered", "is_meeting_offered"]),
    wasMeetingScheduled: firstBoolean(raw, ["was_meeting_scheduled", "meeting_scheduled", "is_meeting_scheduled"]),
    wasQualificationAttempted: firstBoolean(raw, ["was_qualification_attempted", "qualification_attempted", "is_qualification_attempted"]),
    wasQualificationCompleted: firstBoolean(raw, ["was_qualification_completed", "qualification_done", "is_qualification_done"]),
    isHotLead: firstBoolean(raw, ["is_hot_lead", "hot_lead"]),
    meetingOffered: firstBoolean(raw, ["meeting_offered", "is_meeting_offered"]),
    meetingScheduled: firstBoolean(raw, ["meeting_scheduled", "is_meeting_scheduled"]),
    expertCallTime: firstString(raw, ["expert_call_time", "meeting_time", "scheduled_at"]),
    qualification: firstString(raw, ["qualification", "lead_qualification"]),
    qualificationConfidence: firstNumber(raw, ["qualification_confidence", "ai_confidence", "confidence"]),
    qualificationIsCorrect: firstBoolean(raw, ["qualification_is_correct", "qualificationCorrect"]) ?? null,
    checkedByAnalyst: firstBoolean(raw, ["checked_by_analyst", "is_checked", "reviewed"]),
    manualQualification: firstString(raw, ["manual_qualification"]),
    manualCallOutcome: firstCallOutcome(raw, ["manual_call_outcome", "manualCallOutcome"]),
    manualFunnelStage: firstString(raw, ["manual_funnel_stage"]),
    manualFailureStage: firstString(raw, ["manual_failure_stage"]),
    manualFailureReason: firstString(raw, ["manual_failure_reason"]),
    analystComment: firstString(raw, ["analyst_comment"]),
    transcript: transcript.messages,
    transcriptText: transcript.text,
    raw,
  };
}

async function fetchStaticCalls(): Promise<CallRecord[]> {
  const response = await fetch(STATIC_CALLS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Static calls data is unavailable: ${response.status}`);
  const data = (await response.json()) as RawCallRecord[] | { items?: RawCallRecord[]; calls?: RawCallRecord[]; data?: RawCallRecord[] };
  const items = Array.isArray(data) ? data : data.items || data.calls || data.data || [];
  return items.map(normalizeCall).map(applyLocalReview);
}

function filtersToQuery(filters?: Partial<CallFilters>): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchCalls(filters?: Partial<CallFilters>): Promise<CallRecord[]> {
  try {
    const data = await request<RawCallRecord[] | { items?: RawCallRecord[]; calls?: RawCallRecord[]; data?: RawCallRecord[] }>(`/calls${filtersToQuery(filters)}`);
    const items = Array.isArray(data) ? data : data.items || data.calls || data.data || [];
    return items.map(normalizeCall).map(applyLocalReview);
  } catch {
    return fetchStaticCalls();
  }
}

export async function fetchCall(id: string): Promise<CallRecord | undefined> {
  try {
    const data = await request<RawCallRecord | undefined>(`/calls/${encodeURIComponent(id)}`, { allowNotFound: true });
    return data ? applyLocalReview(normalizeCall(data)) : undefined;
  } catch {
    const calls = await fetchStaticCalls().catch(() => []);
    return calls.find((call) => call.id === id);
  }
}

export type AnalystReviewPayload = {
  manual_call_outcome: CallOutcome | "";
  manual_funnel_stage: string;
  manual_failure_stage: string;
  manual_failure_reason: string;
  analyst_comment: string;
  qualification_is_correct?: boolean | null;
  manual_qualification?: string;
  manualCallOutcome?: CallOutcome | "";
};

export async function saveAnalystReview(id: string, payload: AnalystReviewPayload): Promise<CallRecord | undefined> {
  try {
    const data = await request<RawCallRecord | undefined>(`/calls/${encodeURIComponent(id)}/analyst-review`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return data ? applyLocalReview(normalizeCall(data)) : undefined;
  } catch {
    setLocalReview(id, payload);
    return undefined;
  }
}
