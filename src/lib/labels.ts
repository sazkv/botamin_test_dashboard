import type { CallOutcome } from "../types";

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: "Недозвон",
  dropped_or_voicemail: "Сброс / автоответчик / тишина",
  bot_monologue_ignored: "Игнор / бот-монолог",
  conversation_happened_not_interested: "Разговор состоялся — не заинтересован",
  conversation_happened_callback: "Разговор состоялся — нужен перезвон",
  conversation_happened_interested: "Разговор состоялся — заинтересован",
  meeting_scheduled: "Встреча назначена",
};

export const STATUS_LABELS: Record<string, string> = {
  no_dialog: "Нет диалога",
  no_answer: CALL_OUTCOME_LABELS.no_answer,
  not_answered: CALL_OUTCOME_LABELS.no_answer,
  answered: "Дозвон",
  empty_or_voicemail: CALL_OUTCOME_LABELS.dropped_or_voicemail,
  bot_monologue_or_ignored: CALL_OUTCOME_LABELS.bot_monologue_ignored,
  meaningful: "Разговор состоялся",
  meaningful_conversation: "Разговор состоялся",
  successful: "Успешный звонок",
  failed: "Неуспешный звонок",
};

export const END_REASON_LABELS: Record<string, string> = {
  bot_hangup: "Бот завершил звонок",
  client_hangup: "Клиент сбросил звонок",
  no_answer: "Клиент не ответил",
  technical_issue: "Техническая проблема",
};

export const FAILURE_STAGE_LABELS: Record<string, string> = {
  "не дозвонились": "Не дозвонились",
  "пустой дозвон / автоответчик / тишина": "Пустой дозвон / автоответчик",
  "приветствие": "Срыв на приветствии",
  "оффер": "Срыв на оффере",
  "предложение встречи": "Не назначили встречу",
  "назначение встречи": "Не назначили встречу",
  "квалификация": "Не провели квалификацию",
  no_dialog: "Не дозвонились",
  no_answer: "Не дозвонились",
  empty_call: "Пустой дозвон",
  empty_or_voicemail: "Пустой дозвон / автоответчик",
  ignored: "Клиент молчал / игнорировал",
  consent: "Клиент молчал / игнорировал",
  bot_monologue_or_ignored: "Клиент молчал / игнорировал",
  greeting: "Срыв на приветствии",
  offer: "Срыв на оффере",
  meeting_offer: "Срыв на оффере",
  meeting: "Не назначили встречу",
  meeting_scheduled: "Не назначили встречу",
  qualification: "Не провели квалификацию",
  no_failure: "Успешно пройдено",
};

export const FUNNEL_STAGE_LABELS: Record<string, string> = {
  "приветствие": "Приветствие",
  "приветствие пройдено": "Приветствие",
  "оффер раскрыт": "Оффер раскрыт",
  "встреча предложена": "Встреча предложена",
  "встреча назначена": "Встреча назначена",
  total: "Всего звонков",
  no_dialog: "Нет диалога",
  no_answer: CALL_OUTCOME_LABELS.no_answer,
  not_answered: CALL_OUTCOME_LABELS.no_answer,
  answered: "Дозвон",
  dropped_or_voicemail: CALL_OUTCOME_LABELS.dropped_or_voicemail,
  empty_dial: CALL_OUTCOME_LABELS.dropped_or_voicemail,
  empty_or_voicemail: CALL_OUTCOME_LABELS.dropped_or_voicemail,
  bot_monologue: CALL_OUTCOME_LABELS.bot_monologue_ignored,
  bot_monologue_ignored: CALL_OUTCOME_LABELS.bot_monologue_ignored,
  bot_monologue_or_ignored: CALL_OUTCOME_LABELS.bot_monologue_ignored,
  conversation_happened: "Разговор состоялся",
  conversation_happened_not_interested: CALL_OUTCOME_LABELS.conversation_happened_not_interested,
  conversation_happened_callback: CALL_OUTCOME_LABELS.conversation_happened_callback,
  conversation_happened_interested: CALL_OUTCOME_LABELS.conversation_happened_interested,
  meaningful: "Разговор состоялся",
  meaningful_conversation: "Разговор состоялся",
  greeting_lost: "Срыв на приветствии",
  greeting_passed: "Приветствие",
  offer_lost: "Срыв на оффере",
  offer_revealed: "Оффер раскрыт",
  offer_explained: "Оффер раскрыт",
  meeting_offer_lost: "Срыв на оффере",
  meeting_offered: "Встреча предложена",
  meeting_not_scheduled: "Встреча не назначена",
  meeting_scheduled: "Встреча назначена",
  qualification_not_done: "Квалификация не проведена",
  qualification_done: "Квалификация проведена",
  not_hot_lead: "Не горячий лид",
  hot_lead: "Горячий лид",
};

export const TECHNICAL_STATUS_LABELS: Record<string, string> = {
  no_answer: "Клиент не ответил",
  bot_hangup: "Бот завершил звонок",
  client_hangup: "Клиент сбросил звонок",
  completed: "Звонок завершён",
  ended: "Звонок завершён",
  failed: "Технически неуспешно",
  busy: "Линия занята",
};

function key(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

export function labelFromMap(value: string | undefined | null, labels: Record<string, string>, fallback = "Другая причина"): string {
  const normalized = key(value);
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  return labels[normalized] || fallback;
}

export function statusLabel(value?: string | null): string {
  return labelFromMap(value, STATUS_LABELS, "Другой статус");
}

export function endReasonLabel(value?: string | null): string {
  return labelFromMap(value, END_REASON_LABELS, "Другая причина завершения");
}

export function failureStageLabel(value?: string | null): string {
  return labelFromMap(value, FAILURE_STAGE_LABELS, "Требует проверки");
}

export function funnelStageLabel(value?: string | null): string {
  return labelFromMap(value, FUNNEL_STAGE_LABELS, "Другой этап");
}

export function technicalStatusLabel(value?: string | null): string {
  return labelFromMap(value, TECHNICAL_STATUS_LABELS, "Другой технический статус");
}

export function callOutcomeLabel(value?: string | null): string {
  return labelFromMap(value, CALL_OUTCOME_LABELS, "Требует проверки");
}
