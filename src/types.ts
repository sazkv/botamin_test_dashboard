export type TabId = "dashboard" | "calls";

export type FunnelNodeId =
  | "total"
  | "not_answered"
  | "answered"
  | "empty_dial"
  | "meaningful"
  | "greeting_passed"
  | "offer_revealed"
  | "meeting_offered"
  | "meeting_scheduled"
  | "qualification_done"
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
  meetingScheduled: "" | "yes" | "no";
  qualification: string;
  checkedByAnalyst: "" | "yes" | "no";
  hasAudio: "" | "yes" | "no";
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
  helper?: string;
  children?: FunnelNode[];
};

export type LossRow = {
  stage: string;
  reason: string;
  count: number;
  share: number;
};

export type ReviewQueueItem = {
  call: CallRecord;
  reasons: string[];
};

export type AnalyticsSnapshot = {
  kpis: KpiMetric[];
  funnel: FunnelNode;
  losses: LossRow[];
  reviewQueue: ReviewQueueItem[];
};
