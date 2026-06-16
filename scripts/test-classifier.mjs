import assert from "node:assert/strict";
import { classifyCall } from "./classifier.mjs";

function classify(transcript) {
  return classifyCall({ "история диалога юзер-бот": transcript, "длительность мин:сек": "1:00", статус: "ended" });
}

const fixtures = [
  {
    name: "bot script with ellipsis only",
    transcript: "bot: Добрый день, хотел рассказать про ИИ.\nuser: ...\nbot: Меня зовут Лариса.\nuser: ...",
    expected: { normalized_status: "bot_monologue_or_ignored", meaningful_conversation: false, funnel_stage: "answered" },
  },
  {
    name: "allo and cannot hear",
    transcript: "bot: Добрый день, меня слышно?\nuser: алло\nbot: Меня слышно?\nuser: не слышу",
    expected: { meaningful_conversation: false },
    acceptedStatuses: ["empty_or_voicemail", "bot_monologue_or_ignored"],
  },
  {
    name: "explicit rejection",
    transcript: "bot: Добрый день, звоню насчет ИИ для продаж.\nuser: не интересно, не звоните больше",
    expected: { normalized_status: "meaningful", meaningful_conversation: true },
  },
  {
    name: "send information after offer",
    transcript: "bot: Мы делаем AI-агента для продаж, который квалифицирует клиентов.\nuser: Пришлите информацию, я посмотрю",
    expected: { normalized_status: "meaningful", meaningful_conversation: true, funnel_stage: "offer_explained", qualification: "Нужен перезвон" },
  },
  {
    name: "meeting scheduled",
    transcript: "bot: Можем назначить короткий созвон с экспертом завтра?\nuser: Да, завтра в 15:00 удобно",
    expected: { was_meeting_offered: true, was_meeting_scheduled: true, funnel_stage: "meeting_scheduled" },
  },
];

for (const fixture of fixtures) {
  const result = classify(fixture.transcript);
  if (fixture.acceptedStatuses) assert.ok(fixture.acceptedStatuses.includes(result.normalized_status), `${fixture.name}: status ${result.normalized_status}`);
  for (const [key, expected] of Object.entries(fixture.expected)) {
    assert.equal(result[key], expected, `${fixture.name}: ${key}`);
  }
}

console.log(`Classifier fixtures passed: ${fixtures.length}`);
