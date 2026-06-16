import type { AnalyticsSnapshot, CallFilters, CallRecord, FunnelNode, FunnelNodeId, KpiMetric, LossRow, ReviewQueueItem } from "./types";

export const stageLabels: Record<string, string> = {
  greeting_passed: "Приветствие пройдено",
  offer_revealed: "Оффер раскрыт",
  meeting_offered: "Встреча предложена",
  meeting_scheduled: "Встреча назначена",
  qualification_done: "Квалификация проведена",
  hot_lead: "Горячий лид",
  empty_dial: "Пустой дозвон / автоответчик",
  meaningful: "Осмысленный разговор",
  answered: "Отвечено",
  not_answered: "Не отвечено",
};

export const qualificationOptions = [
  "Не квалифицирован",
  "Холодный",
  "Тёплый",
  "Горячий",
  "Не целевой",
  "Нужен перезвон",
  "Назначена встреча",
  "Ошибка авторазметки",
];

export const funnelStageOptions = [
  "Приветствие пройдено",
  "Оффер раскрыт",
  "Встреча предложена",
  "Встреча назначена",
  "Квалификация проведена",
  "Горячий лид",
];

export const failureStageOptions = [
  "Не дозвонились",
  "Пустой дозвон / автоответчик / тишина",
  "Приветствие",
  "Оффер",
  "Предложение встречи",
  "Назначение встречи",
  "Квалификация",
];

const stageFilterMap = [
  { tokens: ["привет", "greeting"], rank: 0 },
  { tokens: ["оффер", "offer"], rank: 1 },
  { tokens: ["предлож", "meeting_offered"], rank: 2 },
  { tokens: ["назнач", "scheduled"], rank: 3 },
  { tokens: ["квалифика", "qualification"], rank: 4 },
  { tokens: ["горяч", "hot"], rank: 5 },
];

function normalize(value?: string): string {
  return (value || "").toLowerCase().replace(/ё/g, "е").trim();
}

function stageThreshold(value: string): number {
  const normalized = normalize(value);
  return stageFilterMap.find((item) => item.tokens.some((token) => normalized.includes(token)))?.rank ?? -1;
}

export function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function statusIsAnswered(call: CallRecord): boolean {
  if (typeof call.answered === "boolean") return call.answered;
  const status = normalize(call.normalizedStatus);
  const technical = normalize(call.technicalStatus);
  return [status, technical].some((value) => value.includes("answered") || value.includes("answer") || value.includes("отвеч") || value.includes("ended"));
}

export function isAnswered(call: CallRecord): boolean {
  const status = normalize(call.normalizedStatus);
  if (status.includes("not") || status.includes("no_answer") || status.includes("unanswered") || status.includes("не отвеч")) return false;
  return statusIsAnswered(call);
}

export function isEmptyDial(call: CallRecord): boolean {
  const text = normalize([call.contactType, call.result, call.failureReason, call.endReason, call.aiSummary].filter(Boolean).join(" "));
  if (typeof call.meaningfulConversation === "boolean" && !call.meaningfulConversation && isAnswered(call)) return true;
  return ["автоответ", "тишина", "пуст", "empty", "answering", "voicemail", "silence"].some((token) => text.includes(token));
}

export function isMeaningful(call: CallRecord): boolean {
  if (typeof call.meaningfulConversation === "boolean") return call.meaningfulConversation;
  if (!isAnswered(call) || isEmptyDial(call)) return false;
  const text = normalize([call.contactType, call.result, call.aiSummary, call.maxFunnelStage, call.funnelStage].filter(Boolean).join(" "));
  return text.includes("осмыс") || text.includes("meaningful") || stageRank(call) >= 0 || Boolean(call.transcript?.length);
}

export function stageRank(call: CallRecord): number {
  const text = normalize([call.manualFunnelStage, call.maxFunnelStage, call.funnelStage, call.result, call.aiSummary, call.qualification].filter(Boolean).join(" "));
  if (normalize(call.qualification).includes("горяч") || text.includes("hot")) return 5;
  if (text.includes("квалифика") || text.includes("qualification")) return 4;
  if (call.meetingScheduled || text.includes("назнач") || text.includes("scheduled")) return 3;
  if (call.meetingOffered || text.includes("предлож") || text.includes("meeting_offered")) return 2;
  if (text.includes("оффер") || text.includes("offer")) return 1;
  if (text.includes("привет") || text.includes("greeting")) return 0;
  return -1;
}

function isHotLead(call: CallRecord): boolean {
  const qualification = normalize(call.manualQualification || call.qualification);
  return qualification.includes("горяч") || qualification.includes("hot") || stageRank(call) >= 5;
}

function count(calls: CallRecord[], predicate: (call: CallRecord) => boolean): number {
  return calls.filter(predicate).length;
}

function metric(key: string, label: string, value: number): KpiMetric {
  return { key, label, value };
}

export function buildAnalytics(calls: CallRecord[]): AnalyticsSnapshot {
  const meaningfulCalls = calls.filter(isMeaningful);
  const uniqueClients = new Set(calls.map((call) => call.phone || call.client).filter(Boolean)).size;
  const reachedOffer = count(calls, (call) => stageRank(call) >= 1);
  const meetingOffered = count(calls, (call) => stageRank(call) >= 2 || Boolean(call.meetingOffered));
  const meetingScheduled = count(calls, (call) => Boolean(call.meetingScheduled) || stageRank(call) >= 3);
  const qualificationDone = count(calls, (call) => stageRank(call) >= 4 || Boolean(call.qualification));
  const hotLeads = count(calls, isHotLead);

  const kpis = [
    metric("total", "Всего звонков", calls.length),
    metric("unique", "Уникальных клиентов", uniqueClients),
    metric("not_answered", "Не отвечено", count(calls, (call) => !isAnswered(call))),
    metric("answered", "Отвечено", count(calls, isAnswered)),
    metric("empty", "Пустой дозвон / автоответчик", count(calls, isEmptyDial)),
    metric("meaningful", "Осмысленные разговоры", meaningfulCalls.length),
    metric("offer", "Дошли до оффера", reachedOffer),
    metric("meeting_offered", "Предложена встреча", meetingOffered),
    metric("meeting_scheduled", "Встреча назначена", meetingScheduled),
    metric("qualification", "Квалификация проведена", qualificationDone),
    metric("hot", "Горячие лиды", hotLeads),
  ];

  const funnel: FunnelNode = {
    id: "total",
    label: "Всего звонков",
    count: calls.length,
    children: [
      { id: "not_answered", label: "Не отвечено", count: count(calls, (call) => !isAnswered(call)) },
      {
        id: "answered",
        label: "Отвечено",
        count: count(calls, isAnswered),
        children: [
          { id: "empty_dial", label: "Пустой дозвон / автоответчик / тишина", count: count(calls, isEmptyDial) },
          {
            id: "meaningful",
            label: "Осмысленный разговор",
            count: meaningfulCalls.length,
            children: [
              { id: "greeting_passed", label: "Приветствие пройдено", count: count(calls, (call) => stageRank(call) >= 0) },
              { id: "offer_revealed", label: "Оффер раскрыт", count: reachedOffer },
              { id: "meeting_offered", label: "Встреча предложена", count: meetingOffered },
              { id: "meeting_scheduled", label: "Встреча назначена", count: meetingScheduled },
              { id: "qualification_done", label: "Квалификация проведена", count: qualificationDone },
              { id: "hot_lead", label: "Горячий лид", count: hotLeads },
            ],
          },
        ],
      },
    ],
  };

  const lossMap = new Map<string, LossRow>();
  meaningfulCalls.forEach((call) => {
    const stage = call.manualFailureStage || call.failureStage || "Не указано";
    const reason = call.manualFailureReason || call.failureReason || call.endReason || "Не указано";
    const key = `${stage}|||${reason}`;
    const current = lossMap.get(key) || { stage, reason, count: 0, share: 0 };
    current.count += 1;
    current.share = meaningfulCalls.length ? current.count / meaningfulCalls.length : 0;
    lossMap.set(key, current);
  });
  const losses = [...lossMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const reviewQueue = calls
    .map<ReviewQueueItem | undefined>((call) => {
      const reasons: string[] = [];
      const endReason = normalize(call.endReason || call.failureReason);
      if (isMeaningful(call) && !call.meetingScheduled) reasons.push("Осмысленный разговор, но нет встречи");
      if (stageRank(call) >= 1 && (endReason.includes("client") || endReason.includes("клиент") || endReason.includes("hangup") || endReason.includes("сброс"))) reasons.push("Дошли до оффера, но клиент сбросил");
      if (typeof call.qualificationConfidence === "number" && call.qualificationConfidence < 0.7) reasons.push("AI не уверен в квалификации");
      if (call.meetingScheduled && !call.qualification) reasons.push("Есть meeting_scheduled, но qualification пустая");
      if (call.qualificationIsCorrect === false) reasons.push("qualification_is_correct = false");
      return reasons.length ? { call, reasons } : undefined;
    })
    .filter(Boolean)
    .sort((a, b) => b!.reasons.length - a!.reasons.length)
    .slice(0, 12) as ReviewQueueItem[];

  return { kpis, funnel, losses, reviewQueue };
}

function includes(value: string | undefined, needle: string): boolean {
  return normalize(value).includes(normalize(needle));
}

export function matchesFunnelNode(call: CallRecord, node?: FunnelNodeId): boolean {
  if (!node || node === "total") return true;
  if (node === "not_answered") return !isAnswered(call);
  if (node === "answered") return isAnswered(call);
  if (node === "empty_dial") return isEmptyDial(call);
  if (node === "meaningful") return isMeaningful(call);
  if (node === "greeting_passed") return stageRank(call) >= 0;
  if (node === "offer_revealed") return stageRank(call) >= 1;
  if (node === "meeting_offered") return stageRank(call) >= 2 || Boolean(call.meetingOffered);
  if (node === "meeting_scheduled") return Boolean(call.meetingScheduled) || stageRank(call) >= 3;
  if (node === "qualification_done") return stageRank(call) >= 4 || Boolean(call.qualification);
  if (node === "hot_lead") return isHotLead(call);
  return true;
}

export function filterCalls(calls: CallRecord[], filters: CallFilters): CallRecord[] {
  const from = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : undefined;
  return calls.filter((call) => {
    const date = call.callStartedAt ? new Date(call.callStartedAt) : undefined;
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    if (filters.client && !includes(`${call.client} ${call.phone || ""}`, filters.client)) return false;
    if (filters.company && !includes(call.company || "", filters.company)) return false;
    if (filters.status && !includes(call.normalizedStatus || "", filters.status)) return false;
    if (filters.answered === "answered" && !isAnswered(call)) return false;
    if (filters.answered === "not_answered" && isAnswered(call)) return false;
    if (filters.meaningfulOnly && !isMeaningful(call)) return false;
    if (filters.funnelStage && stageRank(call) < stageThreshold(filters.funnelStage)) return false;
    if (filters.failureStage && !includes(`${call.failureStage || ""} ${call.manualFailureStage || ""}`, filters.failureStage)) return false;
    if (filters.meetingScheduled === "yes" && !call.meetingScheduled) return false;
    if (filters.meetingScheduled === "no" && call.meetingScheduled) return false;
    if (filters.qualification && !includes(`${call.qualification || ""} ${call.manualQualification || ""}`, filters.qualification)) return false;
    if (filters.checkedByAnalyst === "yes" && !call.checkedByAnalyst) return false;
    if (filters.checkedByAnalyst === "no" && call.checkedByAnalyst) return false;
    if (filters.hasAudio === "yes" && !call.audioUrl) return false;
    if (filters.hasAudio === "no" && call.audioUrl) return false;
    if (!matchesFunnelNode(call, filters.funnelNode)) return false;
    return true;
  });
}

export function emptyFilters(): CallFilters {
  return {
    dateFrom: "",
    dateTo: "",
    client: "",
    company: "",
    status: "",
    answered: "",
    meaningfulOnly: false,
    funnelStage: "",
    failureStage: "",
    meetingScheduled: "",
    qualification: "",
    checkedByAnalyst: "",
    hasAudio: "",
  };
}
