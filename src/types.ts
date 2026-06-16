export type TabId = "dashboard" | "calls";

export type FunnelNodeId =
  | "total"
  | "not_answered"
  | "answered"
  | "empty_dial"
  | "bot_monologue"
  | "meaningful"
  | "greeting_lost"
  | "greeting_passed"
  | "offer_lost"
  | "offer_revealed"
  | "meeting_offer_lost"
  | "meeting_offered"
  | "meeting_not_scheduled"
  | "meeting_scheduled"
  | "qualification_not_done"
  | "qualification_done"
  | "not_hot_lead"
  | "hot_lead";

export type TranscriptMessage = {
  role: "user" | "bot" | "system";
  text: string;
};

export type RawCallRecord = Record<string, unknown>;

export type CallRecord = {
  id: string;
  client: string;
  phone?: string;
  company?: string | null;
  callStartedAt?: string;
  durationSeconds?: number;
  normalizedStatus?: string;
  technicalStatus?: string;
  audioUrl?: string;
  endReason?: string;
  result?: string;
  contactType?: string;
  maxFunnelStage?: string;
  funnelStage?: string;
  failureStage?: string;
  failureReason?: string;
  aiSummary?: string;
  aiComment?: string;
  answered?: boolean;
  meaningfulConversation?: boolean;
  botMonologueOrIgnored?: boolean;
  stageRank?: number;
  wasOfferExplained?: boolean;
  wasMeetingOffered?: boolean;
  wasMeetingScheduled?: boolean;
  wasQualificationAttempted?: boolean;
  wasQualificationCompleted?: boolean;
  isHotLead?: boolean;
  meetingOffered?: boolean;
  meetingScheduled?: boolean;
  expertCallTime?: string;
  qualification?: string;
  qualificationConfidence?: number;
  qualificationIsCorrect?: boolean | null;
  checkedByAnalyst?: boolean;
  manualQualification?: string;
  manualFunnelStage?: string;
  manualFailureStage?: string;
  manualFailureReason?: string;
  analystComment?: string;
  transcript?: TranscriptMessage[];
  transcriptText?: string;
  raw: RawCallRecord;
};

export type CallFilters = {
  dateFrom: string;
  dateTo: string;
  client: string;
  company: string;
  status: string;
  answered: "" | "answered" | "not_answered";
  meaningfulOnly: boolean;
  funnelStage: string;
  failureStage: string;
  failureReason: string;
  meetingScheduled: "" | "yes" | "no";
  qualification: string;
  checkedByAnalyst: "" | "yes" | "no";
  hasAudio: "" | "yes" | "no";
  lowConfidence: boolean;
  manualQualification: string;
  funnelNode?: FunnelNodeId;
};

export type KpiMetric = {
  key: string;
  label: string;
  value: number;
};

export type FunnelNode = {
  id: FunnelNodeId;
  label: string;
  count: number;
  kind?: "total" | "success" | "loss" | "warning" | "neutral";
  helper?: string;
  children?: FunnelNode[];
};

export type LossRow = {
  stage: string;
  count: number;
  share: number;
  recommendation: string;
};

export type ReviewFocusItem = {
  label: string;
  count: number;
  share: number;
  recommendation: string;
};

export type AnalyticsSnapshot = {
  kpis: KpiMetric[];
  funnel: FunnelNode;
  losses: LossRow[];
  reviewFocus: ReviewFocusItem[];
};
