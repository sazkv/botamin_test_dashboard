export function normalizeText(value) {
  return String(value || "").toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

export function parseMessages(transcript) {
  return String(transcript || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => {
      const match = /^(bot|user|assistant|client|клиент|бот)\s*:\s*(.*)$/i.exec(line);
      if (!match) return undefined;
      const speaker = normalizeText(match[1]);
      return {
        role: speaker.includes("bot") || speaker.includes("бот") || speaker.includes("assistant") ? "bot" : "user",
        text: match[2].trim(),
        normalized: normalizeText(match[2]),
      };
    })
    .filter(Boolean);
}

export function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1 ? Math.round(value * 24 * 60 * 60) : Math.round(value);
  }
  const text = String(value || "").trim();
  const match = /^(\d{1,3}):(\d{2})$/.exec(text);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(Number(text)) ? Number(text) : 0;
}

const trivialUserReplies = new Set([
  "",
  "...",
  ".",
  "-",
  "[тишина]",
  "[молчание]",
  "тишина",
  "молчание",
  "шум",
  "неразборчиво",
  "алло",
  "але",
  "да",
  "да да",
  "да-да",
  "угу",
  "мг",
  "ага",
  "слушаю",
  "слышу",
  "кто это",
  "кто это?",
  "что",
  "что?",
  "чего",
  "чего?",
  "повторите",
  "не понял",
  "не поняла",
  "не слышу",
  "не слышно",
]);

function hasToken(text, tokens) {
  return tokens.some((token) => text.includes(token));
}

function isSilenceOrNoise(text) {
  return !text || trivialUserReplies.has(text) || hasToken(text, ["тишина", "молч", "шум", "неразбор", "не слыш"]);
}

export function isSubstantiveReply(text) {
  const normalized = normalizeText(text);
  if (isSilenceOrNoise(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  return hasToken(normalized, [
    "не интересно",
    "не звон",
    "перезвоните завтра",
    "перезвоните",
    "пришлите",
    "пришли",
    "информац",
    "давайте",
    "мне интересно",
    "интересно",
    "у нас уже есть",
    "не занимаюсь",
    "я не занимаюсь",
    "директор",
    "руковод",
    "менедж",
    "продаж",
    "встреч",
    "созвон",
    "сколько стоит",
    "цена",
    "стоимость",
    "подума",
    "завтра",
    "сегодня",
  ]);
}

function isNegativeReply(text) {
  return hasToken(text, ["не интересно", "не надо", "не нужен", "не звон", "откаж", "нет,", "нет ", "до свид"]);
}

function isCallbackOrMaterialsReply(text) {
  return hasToken(text, ["пришлите", "пришли", "отправ", "перезвон", "потом", "не сейчас", "подума"]);
}

function isPositiveSchedulingReply(text) {
  if (isNegativeReply(text) || isCallbackOrMaterialsReply(text)) return false;
  const hasAgreement = hasToken(text, ["давайте", "да", "соглас", "можно", "подойдет", "подходит", "готов", "ок", "хорошо", "удобно"]);
  const hasTime = hasToken(text, ["сегодня", "завтра", "после обеда", "утром", "вечером", "понедельник", "вторник", "сред", "четверг", "пятниц", "час", "минут", ":"])
    || /\b\d{1,2}[.:]\d{2}\b/.test(text)
    || /\bв\s*\d{1,2}\b/.test(text);
  return hasAgreement && hasTime;
}

function isHotLeadReply(text) {
  return !isNegativeReply(text) && !isCallbackOrMaterialsReply(text) && hasToken(text, ["интерес", "давайте", "соглас", "подойдет", "подходит", "готов", "хочу", "можно встреч"]);
}

function findFirstIndex(messages, role, predicate) {
  return messages.findIndex((message) => message.role === role && predicate(message.normalized));
}

function hasUserAfter(messages, index, predicate = isSubstantiveReply) {
  if (index < 0) return false;
  return messages.slice(index + 1).some((message) => message.role === "user" && predicate(message.normalized));
}

function firstSubstantiveUserIndex(messages) {
  return messages.findIndex((message) => message.role === "user" && isSubstantiveReply(message.normalized));
}

function botBefore(messages, index, predicate) {
  return messages.slice(0, Math.max(index, 0)).some((message) => message.role === "bot" && predicate(message.normalized));
}

export function classifyCall(row) {
  const transcript = String(row["история диалога юзер-бот"] || row.dialog_text || row.transcript || "").trim();
  const messages = parseMessages(transcript);
  const duration = parseDuration(row["длительность мин:сек"] ?? row.duration ?? row.duration_seconds);
  const userMessages = messages.filter((message) => message.role === "user");
  const botMessages = messages.filter((message) => message.role === "bot");
  const hasTranscript = transcript.length > 0 && messages.length > 0;
  const hasSubstantiveUserReply = userMessages.some((message) => isSubstantiveReply(message.normalized));
  const hasOnlyNoise = userMessages.length > 0 && userMessages.every((message) => isSilenceOrNoise(message.normalized));
  const answered = userMessages.length > 0 || botMessages.length > 0;

  let normalizedStatus = "no_dialog";
  if (!hasTranscript) normalizedStatus = "no_dialog";
  else if (botMessages.length > 0 && !hasSubstantiveUserReply) normalizedStatus = "bot_monologue_or_ignored";
  else if (hasOnlyNoise || (userMessages.length > 0 && !hasSubstantiveUserReply)) normalizedStatus = "empty_or_voicemail";
  else if (hasSubstantiveUserReply) normalizedStatus = "meaningful";

  const isBotMonologue = normalizedStatus === "bot_monologue_or_ignored";
  const emptyOrVoicemail = normalizedStatus === "empty_or_voicemail";
  const meaningful = normalizedStatus === "meaningful";

  const firstMeaningfulUser = firstSubstantiveUserIndex(messages);
  const greetingIndex = findFirstIndex(messages, "bot", (text) => hasToken(text, ["добрый день", "здравствуйте", "звоню"]));
  const greetingPassed = meaningful && greetingIndex >= 0 && firstMeaningfulUser > greetingIndex;
  const offerIndex = findFirstIndex(messages, "bot", (text) => hasToken(text, ["ии-продав", "ии продав", "искусствен", "автоматизац", "первая линия", "квалифицирует клиентов", "передает менеджерам", "кейс с цифрами", "ai-агент", "ai агент"]));
  let wasOfferExplained = meaningful && offerIndex >= 0 && (hasUserAfter(messages, offerIndex, isSubstantiveReply) || botBefore(messages, firstMeaningfulUser, (text) => hasToken(text, ["ии-продав", "искусствен", "ai-агент", "ai агент"])));
  const meetingOfferIndex = findFirstIndex(messages, "bot", (text) => hasToken(text, ["встреч", "созвон", "демо", "эксперт", "пятнадцать минут", "15 минут"]));
  const wasMeetingOffered = meaningful && meetingOfferIndex >= 0;
  if (wasMeetingOffered) wasOfferExplained = true;
  const wasMeetingScheduled = wasMeetingOffered && hasUserAfter(messages, meetingOfferIndex, isPositiveSchedulingReply);
  const qualificationIndex = findFirstIndex(messages, "bot", (text) => hasToken(text, ["сколько", "менеджер", "заяв", "лид", "crm", "отдел продаж", "команд", "кто отвечает", "кто занимается"]));
  const wasQualificationAttempted = meaningful && qualificationIndex >= 0;
  const wasQualificationCompleted = wasQualificationAttempted && hasUserAfter(messages, qualificationIndex, isSubstantiveReply);
  const isHotLead = wasMeetingScheduled || (wasMeetingOffered && hasUserAfter(messages, meetingOfferIndex, isHotLeadReply));

  let stageRank = answered ? 1 : 0;
  if (emptyOrVoicemail || isBotMonologue) stageRank = 2;
  if (meaningful) stageRank = 3;

  let maxFunnelStage = answered ? "answered" : "no_dialog";
  if (emptyOrVoicemail) maxFunnelStage = "empty_or_voicemail";
  if (isBotMonologue) maxFunnelStage = "answered";
  if (greetingPassed) {
    stageRank = Math.max(stageRank, 4);
    maxFunnelStage = "greeting_passed";
  }
  if (wasOfferExplained) {
    stageRank = Math.max(stageRank, 5);
    maxFunnelStage = "offer_explained";
  }
  if (wasMeetingOffered) {
    stageRank = Math.max(stageRank, 6);
    maxFunnelStage = "meeting_offered";
  }
  if (wasMeetingScheduled) {
    stageRank = Math.max(stageRank, 7);
    maxFunnelStage = "meeting_scheduled";
  }
  if (wasQualificationCompleted) {
    stageRank = Math.max(stageRank, 8);
    maxFunnelStage = "qualification_done";
  }
  if (isHotLead) {
    stageRank = Math.max(stageRank, 9);
    if (!wasMeetingScheduled) maxFunnelStage = "hot_lead";
  }

  let failureStage = "";
  let failureReason = "";
  if (!hasTranscript) {
    failureStage = "no_dialog";
    failureReason = "Нет расшифровки / диалог не начался";
  } else if (emptyOrVoicemail) {
    failureStage = "empty_call";
    failureReason = "Тишина, шум или техническая реплика без участия клиента";
  } else if (isBotMonologue) {
    failureStage = "consent";
    failureReason = "Клиент не вступил в диалог / тишина после скрипта";
  } else if (meaningful && userMessages.some((message) => isNegativeReply(message.normalized))) {
    failureStage = wasOfferExplained ? "offer" : "greeting";
    failureReason = "Клиент отказался";
  } else if (!greetingPassed) {
    failureStage = "greeting";
    failureReason = "Разговор оборвался на приветствии";
  } else if (!wasOfferExplained) {
    failureStage = "offer";
    failureReason = "Оффер не был раскрыт с участием клиента";
  } else if (!wasMeetingOffered) {
    failureStage = "meeting_offer";
    failureReason = "Бот не дошел до явного CTA на встречу";
  } else if (!wasMeetingScheduled) {
    failureStage = "meeting_scheduled";
    failureReason = "Клиент не подтвердил встречу";
  } else if (!wasQualificationCompleted) {
    failureStage = "qualification";
    failureReason = wasQualificationAttempted ? "Клиент не дал содержательный ответ на квалификацию" : "Квалификация не была проведена";
  }

  let qualification = "";
  if (wasMeetingScheduled) qualification = "Назначена встреча";
  else if (isHotLead) qualification = "Горячий";
  else if (meaningful && isCallbackOrMaterialsReply(userMessages.map((message) => message.normalized).join(" "))) qualification = "Нужен перезвон";

  const contactType = !answered ? "Нет диалога" : emptyOrVoicemail ? "Пустой дозвон / автоответчик / тишина" : isBotMonologue ? "Бот-монолог / клиент игнорирует" : "Осмысленный разговор";
  const aiSummary = isBotMonologue
    ? "Бот говорил по скрипту, но клиент не вступил в содержательный диалог."
    : meaningful
      ? "Есть содержательная реплика клиента; разговор можно анализировать по воронке."
      : contactType;

  return {
    duration_seconds: duration || undefined,
    normalized_status: normalizedStatus,
    technical_status: row["статус"] || row.technical_status || "",
    answered,
    meaningful_conversation: meaningful,
    bot_monologue_or_ignored: isBotMonologue,
    stage_rank: stageRank,
    was_offer_explained: wasOfferExplained,
    was_meeting_offered: wasMeetingOffered,
    was_meeting_scheduled: wasMeetingScheduled,
    was_qualification_attempted: wasQualificationAttempted,
    was_qualification_completed: wasQualificationCompleted,
    is_hot_lead: isHotLead,
    contact_type: contactType,
    max_funnel_stage: maxFunnelStage,
    funnel_stage: maxFunnelStage,
    failure_stage: failureStage,
    failure_reason: failureReason,
    meeting_offered: wasMeetingOffered,
    meeting_scheduled: wasMeetingScheduled,
    qualification,
    qualification_confidence: meaningful ? 0.68 : undefined,
    ai_summary: aiSummary,
    ai_comment: "Авторазметка рассчитана classifyCall из исходной XLSX-таблицы.",
  };
}
