import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const root = process.cwd();
const sourcePath = path.join(root, "calls_week_anon.xlsx");
const publicDir = path.join(root, "public");
const outputPath = path.join(publicDir, "calls.json");

function normalizeText(value) {
  return String(value || "").toLowerCase().replaceAll("ё", "е");
}

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1 ? Math.round(value * 24 * 60 * 60) : Math.round(value);
  }
  const text = String(value || "").trim();
  const match = /^(\d{1,3}):(\d{2})$/.exec(text);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(Number(text)) ? Number(text) : 0;
}

function classify(row) {
  const transcript = String(row["история диалога юзер-бот"] || "").trim();
  const text = normalizeText(transcript);
  const duration = parseDuration(row["длительность мин:сек"]);
  const hasBot = /(^|\n)\s*bot\s*:/i.test(transcript);
  const hasUser = /(^|\n)\s*user\s*:/i.test(transcript) || /(^|\n)\s*клиент\s*:/i.test(transcript);
  const emptyDial = (Boolean(transcript) && !hasUser) || ["автоответ", "тишина", "не слыш", "молч", "шум"].some((token) => text.includes(token));
  const answered = hasUser || hasBot;
  const meaningful = hasUser && duration >= 12 && !emptyDial;

  let maxFunnelStage = "";
  if (meaningful) maxFunnelStage = "Приветствие пройдено";
  if (meaningful && ["искусствен", "ии", "кейс", "отдел продаж", "бот", "автоматизац"].some((token) => text.includes(token))) maxFunnelStage = "Оффер раскрыт";
  const meetingOffered = meaningful && ["встреч", "созвон", "эксперт", "демо", "презентац", "показать"].some((token) => text.includes(token));
  if (meetingOffered) maxFunnelStage = "Встреча предложена";
  const meetingScheduled = meetingOffered && ["договор", "назнач", "запис", "подойдет", "подходит", "соглас", "завтра", "сегодня", "понедельник", "вторник", "сред", "четверг", "пятниц"].some((token) => text.includes(token));
  if (meetingScheduled) maxFunnelStage = "Встреча назначена";
  const qualificationDone = meaningful && ["сколько", "менеджер", "заяв", "лид", "crm", "продаж", "отдел", "команд"].some((token) => text.includes(token));
  if (qualificationDone) maxFunnelStage = "Квалификация проведена";

  let failureStage = "";
  let failureReason = "";
  if (!answered) {
    failureStage = "Не дозвонились";
    failureReason = "Нет диалога в transcript";
  } else if (emptyDial) {
    failureStage = "Пустой дозвон / автоответчик / тишина";
    failureReason = hasBot ? "Нет реплики клиента" : "Пустой transcript";
  } else if (!meetingOffered) {
    failureStage = maxFunnelStage === "Оффер раскрыт" ? "Оффер" : "Приветствие";
    failureReason = "Разговор не дошел до предложения встречи";
  } else if (!meetingScheduled) {
    failureStage = "Предложение встречи";
    failureReason = "Встреча не назначена";
  } else if (!qualificationDone) {
    failureStage = "Квалификация";
    failureReason = "Встреча есть, квалификация не зафиксирована";
  }

  const qualification = meetingScheduled ? "Назначена встреча" : meaningful ? "Не квалифицирован" : "";
  const contactType = !answered ? "Неотвеченный звонок" : emptyDial ? "Пустой дозвон / автоответчик / тишина" : "Осмысленный разговор";

  return {
    duration_seconds: duration || undefined,
    normalized_status: answered ? "answered" : "not_answered",
    technical_status: row["статус"] || "",
    answered,
    meaningful_conversation: meaningful,
    contact_type: contactType,
    max_funnel_stage: maxFunnelStage,
    funnel_stage: maxFunnelStage,
    failure_stage: failureStage,
    failure_reason: failureReason,
    meeting_offered: meetingOffered,
    meeting_scheduled: meetingScheduled,
    qualification,
    qualification_confidence: meaningful ? 0.64 : undefined,
    ai_summary: meaningful ? "Осмысленный разговор определен по transcript из XLSX." : contactType,
    ai_comment: "Авторазметка рассчитана prepare-data из исходной XLSX-таблицы.",
  };
}

if (!existsSync(sourcePath)) {
  console.warn("calls_week_anon.xlsx not found, skipping static data generation");
  process.exit(0);
}

const workbook = XLSX.readFile(sourcePath, { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
const calls = rows.map((row, index) => ({
  id: `xlsx-${index + 1}`,
  ...row,
  ...classify(row),
}));

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(calls));
console.log(`Generated ${path.relative(root, outputPath)} with ${calls.length} calls`);
