import { CALL_OUTCOME_LABELS, callOutcomeLabel, failureStageLabel, FUNNEL_STAGE_LABELS, funnelStageLabel } from "./lib/labels";
import type { AnalyticsSnapshot, CallFilters, CallOutcome, CallRecord, ConversationFunnelStep, FunnelNode, FunnelNodeId, KpiMetric, LossRow } from "./types";

export const stageLabels: Record<string, string> = FUNNEL_STAGE_LABELS;

export const funnelStageOptions = ["Приветствие", "Оффер", "Встреча предложена", "Встреча назначена"];

export const failureStageOptions = ["Недозвон", "Сброс / автоответчик / тишина", "Игнор / бот-монолог", "Не заинтересован", "Нужен перезвон", "Заинтересован", "Встреча назначена"];

export const qualificationOptions = ["Не квалифицирован", "Холодный", "Тёплый", "Горячий", "Не целевой", "Нужен перезвон", "Назначена встреча", "Ошибка авторазметки"];

export const statusOptions = [
  { value: "", label: "Все" },
  ...Object.entries(CALL_OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
];

const validOutcomes = new Set<CallOutcome>(Object.keys(CALL_OUTCOME_LABELS) as CallOutcome[]);

function normalize(value?: string | null): string {
  return (value || "").toLowerCase().replace(/ё/g, "е").trim();
}

function isValidOutcome(value?: string | null): value is CallOutcome {
  return Boolean(value && validOutcomes.has(value as CallOutcome));
}

function legacyAnswered(call: CallRecord): boolean {
  if (typeof call.answered === "boolean") return call.answered;
  const status = normalize(call.normalizedStatus);
  const technical = normalize(call.technicalStatus);
  if (status === "no_dialog" || status.includes("no_answer") || status.includes("unanswered") || status.includes("не отвеч")) return false;
  return [status, technical].some((value) => value.includes("answered") || value.includes("answer") || value.includes("отвеч") || value.includes("ended"));
}

function legacyEmpty(call: CallRecord): boolean {
  if (call.botMonologueOrIgnored) return false;
  if (call.normalizedStatus === "empty_or_voicemail") return true;
  if (call.normalizedStatus === "bot_monologue_or_ignored") return false;
  const text = normalize([call.contactType, call.result, call.failureReason, call.endReason, call.aiSummary].filter(Boolean).join(" "));
  return ["автоответ", "тишина", "пуст", "empty", "answering", "voicemail", "silence"].some((token) => text.includes(token));
}

function legacyBotMonologue(call: CallRecord): boolean {
  return call.normalizedStatus === "bot_monologue_or_ignored" || Boolean(call.botMonologueOrIgnored);
}

function legacyConversation(call: CallRecord): boolean {
  if (!legacyAnswered(call) || legacyEmpty(call) || legacyBotMonologue(call)) return false;
  if (typeof call.meaningfulConversation === "boolean") return call.meaningfulConversation;
  return [call.normalizedStatus, call.contactType, call.maxFunnelStage, call.funnelStage].some((value) => normalize(value).includes("meaningful") || normalize(value).includes("осмыс"));
}

function explicitStageRank(call: CallRecord): number {
  const values = [call.manualFunnelStage, call.maxFunnelStage, call.funnelStage].map(normalize);
  const hasStage = (...tokens: string[]) => values.some((value) => tokens.some((token) => value.includes(token)));
  if (call.wasMeetingScheduled || call.meetingScheduled || hasStage("meeting_scheduled", "назнач")) return 7;
  if (call.wasMeetingOffered || call.meetingOffered || hasStage("meeting_offered", "встреча предлож", "предлож")) return 6;
  if (call.wasOfferExplained || hasStage("offer_explained", "offer_revealed", "оффер")) return 5;
  if (hasStage("greeting_passed", "привет")) return 4;
  return legacyConversation(call) ? 4 : legacyAnswered(call) ? 1 : 0;
}

export function getCallOutcome(call: CallRecord): CallOutcome {
  if (isValidOutcome(call.manualCallOutcome)) return call.manualCallOutcome;
  if (isValidOutcome(call.callOutcome)) return call.callOutcome;
  if (!legacyAnswered(call)) return "no_answer";
  if (legacyEmpty(call)) return "dropped_or_voicemail";
  if (legacyBotMonologue(call) || !legacyConversation(call)) return "bot_monologue_ignored";
  if (call.wasMeetingScheduled || call.meetingScheduled) return "meeting_scheduled";
  const text = normalize([call.failureReason, call.result, call.aiSummary, call.qualification].filter(Boolean).join(" "));
  if (["не интересно", "не надо", "не нужен", "не нужно", "отказ", "не звон"].some((token) => text.includes(token))) return "conversation_happened_not_interested";
  if (["перезвон", "потом", "позже", "не сейчас"].some((token) => text.includes(token))) return "conversation_happened_callback";
  return "conversation_happened_interested";
}

export function formatStatus(value?: string): string {
  return callOutcomeLabel(value) || "Требует проверки";
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

export function isAnswered(call: CallRecord): boolean {
  return getCallOutcome(call) !== "no_answer";
}

export function isConversationHappened(call: CallRecord): boolean {
  const outcome = getCallOutcome(call);
  return outcome.startsWith("conversation_happened_") || outcome === "meeting_scheduled";
}

function wasOfferExplained(call: CallRecord): boolean {
  return isConversationHappened(call) && (call.wasOfferExplained === true || explicitStageRank(call) >= 5);
}

function wasMeetingOffered(call: CallRecord): boolean {
  return wasOfferExplained(call) && (call.wasMeetingOffered === true || call.meetingOffered === true || explicitStageRank(call) >= 6);
}

function wasMeetingScheduled(call: CallRecord): boolean {
  return getCallOutcome(call) === "meeting_scheduled";
}

export function stageRank(call: CallRecord): number {
  if (!isAnswered(call)) return 0;
  if (!isConversationHappened(call)) return 1;
  if (wasMeetingScheduled(call)) return 7;
  if (wasMeetingOffered(call)) return 6;
  if (wasOfferExplained(call)) return 5;
  return 4;
}

export function getSalesStage(call: CallRecord): string {
  if (!isConversationHappened(call)) return "";
  if (wasMeetingScheduled(call)) return "Встреча назначена";
  if (wasMeetingOffered(call)) return "Встреча предложена";
  if (wasOfferExplained(call)) return "Оффер";
  return "Приветствие";
}

export function getCallReason(call: CallRecord): string {
  const manual = call.manualFailureReason?.trim();
  if (manual) return manual;
  switch (getCallOutcome(call)) {
    case "no_answer": return "Звонок не состоялся";
    case "dropped_or_voicemail": return "Сброс, автоответчик или тишина";
    case "bot_monologue_ignored": return "Клиент не вступил в диалог";
    case "conversation_happened_not_interested": return "Содержательный отказ";
    case "conversation_happened_callback": return "Попросил перезвонить позже";
    case "conversation_happened_interested": return "Есть интерес или запрос информации";
    case "meeting_scheduled": return "Клиент подтвердил встречу";
  }
}

function count(calls: CallRecord[], predicate: (call: CallRecord) => boolean): number {
  return calls.filter(predicate).length;
}

function metric(key: string, label: string, value: number): KpiMetric {
  return { key, label, value };
}

function outcomeCount(calls: CallRecord[], outcome: CallOutcome): number {
  return count(calls, (call) => getCallOutcome(call) === outcome);
}

function percent(value: number, parent: number): number {
  return parent ? value / parent : 0;
}

const lossMeta: Record<CallOutcome, { stage: string; description: string; recommendation: string; color: string }> = {
  no_answer: { stage: "Недозвон", description: "Клиент не ответил, звонок не перешёл в контакт.", recommendation: "Проверить время обзвона, базу и повторные попытки.", color: "gray" },
  dropped_or_voicemail: { stage: "Сброс / автоответчик / тишина", description: "Звонок был зафиксирован, но разговора не случилось.", recommendation: "Отделить автоответчики, тишину и быстрые сбросы от реальных диалогов.", color: "orange" },
  bot_monologue_ignored: { stage: "Игнор / бот-монолог", description: "Бот говорил, но клиент не дал содержательную реплику.", recommendation: "Тестировать opener, длину первой фразы, паузу и реакцию на молчание.", color: "amber" },
  conversation_happened_not_interested: { stage: "Разговор состоялся — не заинтересован", description: "Клиент вступил в диалог и дал содержательный отказ.", recommendation: "Проверить сегмент базы, формулировку ценности и ранние возражения.", color: "rose" },
  conversation_happened_callback: { stage: "Разговор состоялся — нужен перезвон", description: "Клиент не отказался полностью, но перенёс контакт.", recommendation: "Сделать понятный сценарий follow-up и фиксировать следующий шаг.", color: "violet" },
  conversation_happened_interested: { stage: "Разговор состоялся — заинтересован", description: "Есть вопрос, интерес или просьба прислать информацию.", recommendation: "Быстрее переводить интерес к конкретному слоту встречи.", color: "green" },
  meeting_scheduled: { stage: "Встреча назначена", description: "Клиент явно согласился на встречу или созвон.", recommendation: "Проверить качество подтверждения и передачу следующего шага.", color: "emerald" },
};

export function buildAnalytics(calls: CallRecord[]): AnalyticsSnapshot {
  const total = calls.length;
  const noAnswer = outcomeCount(calls, "no_answer");
  const answered = total - noAnswer;
  const dropped = outcomeCount(calls, "dropped_or_voicemail");
  const botIgnored = outcomeCount(calls, "bot_monologue_ignored");
  const notInterested = outcomeCount(calls, "conversation_happened_not_interested");
  const callback = outcomeCount(calls, "conversation_happened_callback");
  const interested = outcomeCount(calls, "conversation_happened_interested");
  const meetings = outcomeCount(calls, "meeting_scheduled");
  const conversations = notInterested + callback + interested + meetings;

  const kpis = [
    metric("total", "Всего звонков", total),
    metric("answered", "Дозвон", answered),
    metric("conversation", "Разговор состоялся", conversations),
    metric("interested", "Заинтересован", interested),
    metric("callback", "Нужен перезвон", callback),
    metric("meeting", "Встреча назначена", meetings),
  ];

  const funnel: FunnelNode = {
    id: "total",
    label: "Всего звонков",
    count: total,
    kind: "total",
    children: [
      { id: "no_answer", label: CALL_OUTCOME_LABELS.no_answer, count: noAnswer, kind: "loss" },
      {
        id: "answered",
        label: "Дозвон",
        count: answered,
        kind: "success",
        children: [
          { id: "dropped_or_voicemail", label: CALL_OUTCOME_LABELS.dropped_or_voicemail, count: dropped, kind: "warning" },
          { id: "bot_monologue_ignored", label: CALL_OUTCOME_LABELS.bot_monologue_ignored, count: botIgnored, kind: "warning" },
          {
            id: "conversation_happened",
            label: "Разговор состоялся",
            count: conversations,
            kind: "success",
            children: [
              { id: "conversation_happened_not_interested", label: "Не заинтересован", count: notInterested, kind: "loss" },
              { id: "conversation_happened_callback", label: "Нужен перезвон / позже", count: callback, kind: "neutral" },
              { id: "conversation_happened_interested", label: "Заинтересован", count: interested, kind: "success" },
              { id: "meeting_scheduled", label: CALL_OUTCOME_LABELS.meeting_scheduled, count: meetings, kind: "success" },
            ],
          },
        ],
      },
    ],
  };

  const conversationCalls = calls.filter(isConversationHappened);
  const greeting = conversationCalls.length;
  const offer = count(conversationCalls, wasOfferExplained);
  const meetingOffered = count(conversationCalls, wasMeetingOffered);
  const conversationFunnel: ConversationFunnelStep[] = [
    { id: "conversation_happened", label: "Разговор состоялся", count: conversations, parentCount: conversations, color: "cyan" },
    { id: "greeting_passed", label: "Приветствие", count: greeting, parentCount: conversations, color: "blue" },
    { id: "offer_revealed", label: "Оффер раскрыт", count: offer, parentCount: greeting, color: "violet" },
    { id: "meeting_offered", label: "Встреча предложена", count: meetingOffered, parentCount: offer, color: "purple" },
    { id: "meeting_scheduled", label: "Встреча назначена", count: meetings, parentCount: meetingOffered, color: "emerald" },
  ];

  const lossRow = (id: CallOutcome, value: number, parentCount: number): LossRow => ({
    id: id as FunnelNodeId,
    stage: lossMeta[id].stage,
    description: lossMeta[id].description,
    count: value,
    parentCount,
    share: percent(value, parentCount),
    color: lossMeta[id].color,
    recommendation: lossMeta[id].recommendation,
  });
  const losses = [
    lossRow("no_answer", noAnswer, total),
    lossRow("dropped_or_voicemail", dropped, answered),
    lossRow("bot_monologue_ignored", botIgnored, answered),
    lossRow("conversation_happened_not_interested", notInterested, conversations),
    lossRow("conversation_happened_callback", callback, conversations),
    lossRow("conversation_happened_interested", interested, conversations),
  ].filter((row) => row.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);

  const biggestLoss = losses.find((row) => row.id !== "conversation_happened_interested") || losses[0];
  const growthOpportunity = biggestLoss ? {
    id: biggestLoss.id,
    title: `Главная точка роста: ${biggestLoss.stage.toLowerCase()}`,
    text: biggestLoss.recommendation,
    count: biggestLoss.count,
    parentCount: biggestLoss.parentCount,
    lossRate: biggestLoss.share,
  } : null;

  return { kpis, funnel, conversationFunnel, losses, growthOpportunity };
}

function includes(value: string | undefined, needle: string): boolean {
  return normalize(value).includes(normalize(needle));
}

export function matchesFunnelNode(call: CallRecord, node?: FunnelNodeId): boolean {
  if (!node || node === "total") return true;
  const outcome = getCallOutcome(call);
  if (node === "answered") return outcome !== "no_answer";
  if (node === "conversation_happened") return isConversationHappened(call);
  if (isValidOutcome(node)) return outcome === node;
  if (node === "not_answered") return outcome === "no_answer";
  if (node === "empty_dial") return outcome === "dropped_or_voicemail";
  if (node === "bot_monologue") return outcome === "bot_monologue_ignored";
  if (node === "meaningful") return isConversationHappened(call);
  if (node === "greeting_passed") return isConversationHappened(call);
  if (node === "offer_revealed") return wasOfferExplained(call);
  if (node === "meeting_offered") return wasMeetingOffered(call);
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
    if (filters.status && getCallOutcome(call) !== filters.status) return false;
    if (filters.funnelStage) {
      const stage = getSalesStage(call);
      if (!stage || !includes(stage, filters.funnelStage)) return false;
    }
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
    failureReason: "",
    meetingScheduled: "",
    qualification: "",
    checkedByAnalyst: "",
    hasAudio: "",
    lowConfidence: false,
    manualQualification: "",
  };
}
