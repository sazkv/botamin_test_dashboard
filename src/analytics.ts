import type { AnalyticsSnapshot, CallFilters, CallRecord, FunnelNode, FunnelNodeId, KpiMetric, LossRow, ReviewFocusItem } from "./types";

export const stageLabels: Record<string, string> = {
  greeting_passed: "Приветствие пройдено",
  offer_revealed: "Оффер раскрыт",
  meeting_offered: "Встреча предложена",
  meeting_scheduled: "Встреча назначена",
  qualification_done: "Квалификация проведена",
  hot_lead: "Горячий лид",
  empty_dial: "Пустой дозвон / автоответчик",
  bot_monologue: "Бот-монолог / игнор",
  meaningful: "Осмысленный разговор",
  answered: "Отвечено",
  not_answered: "Не отвечено",
  greeting_lost: "Срыв на приветствии",
  offer_lost: "Срыв на оффере",
  meeting_offer_lost: "Срыв на предложении встречи",
  meeting_not_scheduled: "Встреча не назначена",
  qualification_not_done: "Квалификация не проведена",
  not_hot_lead: "Не горячий лид",
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

export const statusOptions = [
  { value: "", label: "Все" },
  { value: "no_dialog", label: "Нет диалога" },
  { value: "empty_or_voicemail", label: "Пустой дозвон / автоответчик" },
  { value: "bot_monologue_or_ignored", label: "Бот-монолог / игнор" },
  { value: "meaningful", label: "Осмысленный разговор" },
];

export function formatStatus(value?: string): string {
  if (value === "no_dialog") return "Нет диалога";
  if (value === "empty_or_voicemail") return "Пустой / автоответчик";
  if (value === "bot_monologue_or_ignored") return "Бот-монолог / игнор";
  if (value === "meaningful") return "Осмысленный разговор";
  if (value === "answered") return "Отвечено";
  if (value === "not_answered") return "Не отвечено";
  return value || "";
}

const stageFilterMap = [
  { tokens: ["привет", "greeting"], rank: 4 },
  { tokens: ["оффер", "offer"], rank: 5 },
  { tokens: ["предлож", "meeting_offered"], rank: 6 },
  { tokens: ["назнач", "scheduled"], rank: 7 },
  { tokens: ["квалифика", "qualification"], rank: 8 },
  { tokens: ["горяч", "hot"], rank: 9 },
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
  if (status === "no_dialog" || status.includes("not") || status.includes("no_answer") || status.includes("unanswered") || status.includes("не отвеч")) return false;
  return statusIsAnswered(call);
}

export function isEmptyDial(call: CallRecord): boolean {
  if (call.normalizedStatus === "empty_or_voicemail") return true;
  if (call.normalizedStatus === "bot_monologue_or_ignored") return false;
  const text = normalize([call.contactType, call.result, call.failureReason, call.endReason, call.aiSummary].filter(Boolean).join(" "));
  if (typeof call.meaningfulConversation === "boolean" && !call.meaningfulConversation && isAnswered(call)) return true;
  return ["автоответ", "тишина", "пуст", "empty", "answering", "voicemail", "silence"].some((token) => text.includes(token));
}

export function isBotMonologue(call: CallRecord): boolean {
  return call.normalizedStatus === "bot_monologue_or_ignored" || Boolean(call.botMonologueOrIgnored);
}

export function isMeaningful(call: CallRecord): boolean {
  if (typeof call.meaningfulConversation === "boolean") return call.meaningfulConversation;
  if (!isAnswered(call) || isEmptyDial(call)) return false;
  const text = normalize([call.contactType, call.result, call.aiSummary, call.maxFunnelStage, call.funnelStage].filter(Boolean).join(" "));
  return text.includes("осмыс") || text.includes("meaningful") || stageRank(call) >= 3;
}

export function stageRank(call: CallRecord): number {
  if (typeof call.stageRank === "number") return call.stageRank;
  const text = normalize([call.manualFunnelStage, call.maxFunnelStage, call.funnelStage, call.result, call.aiSummary, call.qualification].filter(Boolean).join(" "));
  if (normalize(call.qualification).includes("горяч") || text.includes("hot")) return 9;
  if (text.includes("квалифика") || text.includes("qualification")) return 8;
  if (call.meetingScheduled || text.includes("назнач") || text.includes("scheduled")) return 7;
  if (call.meetingOffered || text.includes("предлож") || text.includes("meeting_offered")) return 6;
  if (text.includes("оффер") || text.includes("offer")) return 5;
  if (text.includes("привет") || text.includes("greeting")) return 4;
  if (isMeaningful(call)) return 3;
  if (isEmptyDial(call)) return 2;
  if (isAnswered(call)) return 1;
  return 0;
}

function isHotLead(call: CallRecord): boolean {
  if (typeof call.isHotLead === "boolean") return call.isHotLead;
  const qualification = normalize(call.manualQualification || call.qualification);
  return qualification.includes("горяч") || qualification.includes("hot");
}

function wasOfferExplained(call: CallRecord): boolean {
  return Boolean(call.wasOfferExplained) || stageRank(call) >= 5;
}

function wasMeetingOffered(call: CallRecord): boolean {
  return Boolean(call.wasMeetingOffered ?? call.meetingOffered) || stageRank(call) >= 6;
}

function wasMeetingScheduled(call: CallRecord): boolean {
  return Boolean(call.wasMeetingScheduled ?? call.meetingScheduled) || stageRank(call) >= 7;
}

function wasQualificationCompleted(call: CallRecord): boolean {
  return Boolean(call.wasQualificationCompleted) || stageRank(call) >= 8;
}

function count(calls: CallRecord[], predicate: (call: CallRecord) => boolean): number {
  return calls.filter(predicate).length;
}

function metric(key: string, label: string, value: number): KpiMetric {
  return { key, label, value };
}

export function buildAnalytics(calls: CallRecord[]): AnalyticsSnapshot {
  const meaningfulCalls = calls.filter(isMeaningful);
  const answered = count(calls, isAnswered);
  const notAnswered = count(calls, (call) => !isAnswered(call));
  const empty = count(calls, isEmptyDial);
  const botMonologue = count(calls, isBotMonologue);
  const greetingPassed = count(calls, (call) => stageRank(call) >= 4);
  const reachedOffer = count(calls, wasOfferExplained);
  const meetingOffered = count(calls, wasMeetingOffered);
  const meetingScheduled = count(calls, wasMeetingScheduled);
  const qualificationDone = count(calls, wasQualificationCompleted);
  const hotLeads = count(calls, isHotLead);
  const qualificationAfterMeeting = count(calls, (call) => wasMeetingScheduled(call) && wasQualificationCompleted(call));
  const hotAfterQualification = count(calls, (call) => wasMeetingScheduled(call) && wasQualificationCompleted(call) && isHotLead(call));

  const kpis = [
    metric("total", "Всего звонков", calls.length),
    metric("answered", "Отвечено", answered),
    metric("not_answered", "Не отвечено", notAnswered),
    metric("empty", "Пустой дозвон / автоответчик / тишина", empty),
    metric("bot_monologue", "Бот-монолог / игнор", botMonologue),
    metric("meaningful", "Осмысленный разговор", meaningfulCalls.length),
    metric("offer", "Оффер раскрыт", reachedOffer),
    metric("meeting_offered", "Встреча предложена", meetingOffered),
    metric("meeting_scheduled", "Встреча назначена", meetingScheduled),
    metric("qualification", "Квалификация проведена", qualificationDone),
    metric("hot", "Горячий лид", hotLeads),
  ];

  const loss = {
    greeting: Math.max(meaningfulCalls.length - greetingPassed, 0),
    offer: Math.max(greetingPassed - reachedOffer, 0),
    meetingOffer: Math.max(reachedOffer - meetingOffered, 0),
    meetingScheduled: Math.max(meetingOffered - meetingScheduled, 0),
    qualification: Math.max(meetingScheduled - qualificationAfterMeeting, 0),
    hot: Math.max(qualificationAfterMeeting - hotAfterQualification, 0),
  };

  const funnel: FunnelNode = {
    id: "total",
    label: "Всего звонков",
    count: calls.length,
    kind: "total",
    children: [
      { id: "not_answered", label: "Не отвечено", count: notAnswered, kind: "loss" },
      {
        id: "answered",
        label: "Отвечено",
        count: answered,
        kind: "success",
        children: [
          { id: "empty_dial", label: "Пустой дозвон / автоответчик / тишина", count: empty, kind: "warning" },
          { id: "bot_monologue", label: "Бот-монолог / клиент игнорирует", count: botMonologue, kind: "warning" },
          {
            id: "meaningful",
            label: "Осмысленный разговор",
            count: meaningfulCalls.length,
            kind: "success",
            children: [
              { id: "greeting_lost", label: "Срыв на приветствии", count: loss.greeting, kind: "loss" },
              {
                id: "greeting_passed",
                label: "Приветствие пройдено",
                count: greetingPassed,
                kind: "success",
                children: [
                  { id: "offer_lost", label: "Срыв на оффере", count: loss.offer, kind: "loss" },
                  {
                    id: "offer_revealed",
                    label: "Оффер раскрыт",
                    count: reachedOffer,
                    kind: "success",
                    children: [
                      { id: "meeting_offer_lost", label: "Срыв на предложении встречи", count: loss.meetingOffer, kind: "loss" },
                      {
                        id: "meeting_offered",
                        label: "Встреча предложена",
                        count: meetingOffered,
                        kind: "success",
                        children: [
                          { id: "meeting_not_scheduled", label: "Встреча не назначена", count: loss.meetingScheduled, kind: "loss" },
                          {
                            id: "meeting_scheduled",
                            label: "Встреча назначена",
                            count: meetingScheduled,
                            kind: "success",
                            children: [
                              { id: "qualification_not_done", label: "Квалификация не проведена", count: loss.qualification, kind: "loss" },
                              {
                                id: "qualification_done",
                                label: "Квалификация проведена",
                                count: qualificationAfterMeeting,
                                kind: "success",
                                children: [
                                  { id: "not_hot_lead", label: "Не горячий лид", count: loss.hot, kind: "neutral" },
                                  { id: "hot_lead", label: "Горячий лид", count: hotAfterQualification, kind: "success" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const shareOfMeaningful = (value: number) => (meaningfulCalls.length ? value / meaningfulCalls.length : 0);
  const losses: LossRow[] = [
    { stage: "Потери на приветствии", count: loss.greeting, share: shareOfMeaningful(loss.greeting), recommendation: "Тестировать opener и первые 10 секунд." },
    { stage: "Потери на оффере", count: loss.offer, share: shareOfMeaningful(loss.offer), recommendation: "Сократить и упростить объяснение оффера." },
    { stage: "Потери на предложении встречи", count: loss.meetingOffer, share: shareOfMeaningful(loss.meetingOffer), recommendation: "Быстрее переходить к CTA и явно предлагать следующий шаг." },
    { stage: "Встреча не назначена", count: loss.meetingScheduled, share: shareOfMeaningful(loss.meetingScheduled), recommendation: "Тестировать CTA, варианты времени и обработку отказов." },
    { stage: "Потери на квалификации", count: loss.qualification, share: shareOfMeaningful(loss.qualification), recommendation: "Упростить квалифицирующие вопросы." },
  ].filter((row) => row.count > 0).sort((a, b) => b.count - a.count);

  const focus = (label: string, countValue: number, recommendation: string): ReviewFocusItem => ({ label, count: countValue, share: calls.length ? countValue / calls.length : 0, recommendation });
  const reviewFocus = [
    focus("Осмысленные разговоры без встречи", count(calls, (call) => isMeaningful(call) && !wasMeetingScheduled(call)), "Проверить CTA и возражения перед назначением встречи."),
    focus("Оффер раскрыт, но встреча не предложена", count(calls, (call) => wasOfferExplained(call) && !wasMeetingOffered(call)), "Проверить переход от ценности к следующему шагу."),
    focus("Встреча предложена, но не назначена", count(calls, (call) => wasMeetingOffered(call) && !wasMeetingScheduled(call)), "Проверить формулировку предложения времени."),
    focus("Назначена встреча без квалификации", count(calls, (call) => wasMeetingScheduled(call) && !wasQualificationCompleted(call)), "Проверить, хватает ли квалифицирующих вопросов после согласия."),
    focus("Низкая уверенность AI", count(calls, (call) => typeof call.qualificationConfidence === "number" && call.qualificationConfidence < 0.7), "Выборочно проверить авторазметку и спорные квалификации."),
    focus("Квалификация помечена неверной", count(calls, (call) => call.qualificationIsCorrect === false), "Исправить ручную квалификацию в Calls."),
  ].filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);

  return { kpis, funnel, losses, reviewFocus };
}

function includes(value: string | undefined, needle: string): boolean {
  return normalize(value).includes(normalize(needle));
}

export function matchesFunnelNode(call: CallRecord, node?: FunnelNodeId): boolean {
  if (!node || node === "total") return true;
  if (node === "not_answered") return !isAnswered(call);
  if (node === "answered") return isAnswered(call);
  if (node === "empty_dial") return isEmptyDial(call);
  if (node === "bot_monologue") return isBotMonologue(call);
  if (node === "meaningful") return isMeaningful(call);
  if (node === "greeting_lost") return isMeaningful(call) && stageRank(call) < 4;
  if (node === "greeting_passed") return stageRank(call) >= 4;
  if (node === "offer_lost") return stageRank(call) >= 4 && !wasOfferExplained(call);
  if (node === "offer_revealed") return wasOfferExplained(call);
  if (node === "meeting_offer_lost") return wasOfferExplained(call) && !wasMeetingOffered(call);
  if (node === "meeting_offered") return wasMeetingOffered(call);
  if (node === "meeting_not_scheduled") return wasMeetingOffered(call) && !wasMeetingScheduled(call);
  if (node === "meeting_scheduled") return wasMeetingScheduled(call);
  if (node === "qualification_not_done") return wasMeetingScheduled(call) && !wasQualificationCompleted(call);
  if (node === "qualification_done") return wasQualificationCompleted(call);
  if (node === "not_hot_lead") return wasQualificationCompleted(call) && !isHotLead(call);
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
    if (filters.failureReason && !includes(`${call.failureReason || ""} ${call.manualFailureReason || ""}`, filters.failureReason)) return false;
    if (filters.meetingScheduled === "yes" && !wasMeetingScheduled(call)) return false;
    if (filters.meetingScheduled === "no" && wasMeetingScheduled(call)) return false;
    if (filters.qualification && !includes(`${call.qualification || ""} ${call.manualQualification || ""}`, filters.qualification)) return false;
    if (filters.manualQualification && !includes(call.manualQualification || "", filters.manualQualification)) return false;
    if (filters.checkedByAnalyst === "yes" && !call.checkedByAnalyst) return false;
    if (filters.checkedByAnalyst === "no" && call.checkedByAnalyst) return false;
    if (filters.hasAudio === "yes" && !call.audioUrl) return false;
    if (filters.hasAudio === "no" && call.audioUrl) return false;
    if (filters.lowConfidence && !(typeof call.qualificationConfidence === "number" && call.qualificationConfidence < 0.7)) return false;
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
