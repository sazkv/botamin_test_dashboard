import { startTransition, useDeferredValue, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { fetchCall, fetchCalls, saveAnalystReview, type AnalystReviewPayload } from "./api";
import { buildAnalytics, emptyFilters, filterCalls, formatDateTime, formatDuration, funnelStageOptions, getCallOutcome, getCallReason, getSalesStage, stageLabels, statusOptions } from "./analytics";
import { callOutcomeLabel } from "./lib/labels";
import type { AnalyticsSnapshot, CallFilters, CallOutcome, CallRecord, FunnelNode, FunnelNodeId, TabId } from "./types";

const outcomeIds = new Set<string>([
  "no_answer",
  "dropped_or_voicemail",
  "bot_monologue_ignored",
  "conversation_happened_not_interested",
  "conversation_happened_callback",
  "conversation_happened_interested",
  "meeting_scheduled",
]);

function App() {
  const [activeTab, setActiveTab] = useState<TabId>(() => window.location.hash === "#calls" ? "calls" : "dashboard");
  const [filters, setFilters] = useState<CallFilters>(() => emptyFilters());
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCalls()
      .then((items) => {
        if (!cancelled) setCalls(items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analytics = useMemo(() => buildAnalytics(calls), [calls]);
  const filteredCalls = useMemo(() => filterCalls(calls, deferredFilters), [calls, deferredFilters]);

  function openCallsWithNode(nodeId: FunnelNodeId) {
    startTransition(() => {
      setFilters({ ...emptyFilters(), status: outcomeIds.has(nodeId) ? nodeId : "", funnelNode: outcomeIds.has(nodeId) ? undefined : nodeId });
      setActiveTab("calls");
    });
  }

  function updateCall(updated: CallRecord) {
    setCalls((current) => current.map((call) => (call.id === updated.id ? updated : call)));
    setSelectedCall(updated);
  }

  async function openCall(call: CallRecord) {
    setSelectedCall(call);
    const fresh = await fetchCall(call.id).catch(() => undefined);
    if (fresh) updateCall(fresh);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Botamin</strong>
            <small>Analyst Dashboard</small>
          </div>
        </div>
        <nav className="nav-tabs" aria-label="Основные разделы">
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
          <button className={activeTab === "calls" ? "active" : ""} onClick={() => setActiveTab("calls")}>Звонки</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">B2B SaaS analytics</p>
            <h1>{activeTab === "dashboard" ? "Дашборд аналитика" : "Звонки"}</h1>
          </div>
          <div className="header-meta">
            <span>{calls.length.toLocaleString("ru-RU")} звонков загружено</span>
            {(filters.funnelNode || filters.status) && <button className="ghost-button" onClick={() => setFilters(emptyFilters())}>Сбросить фильтр</button>}
          </div>
        </header>

        {error && <div className="error-banner">API error: {error}</div>}
        {loading && <div className="loading-panel">Загружаем звонки...</div>}

        {!loading && activeTab === "dashboard" && <Dashboard analytics={analytics} onNodeClick={openCallsWithNode} />}
        {!loading && activeTab === "calls" && <CallsTab calls={filteredCalls} filters={filters} setFilters={setFilters} onOpenCall={openCall} />}
      </main>

      {selectedCall && <CallDrawer call={selectedCall} onClose={() => setSelectedCall(null)} onSaved={updateCall} />}
    </div>
  );
}

function Dashboard({ analytics, onNodeClick }: { analytics: AnalyticsSnapshot; onNodeClick: (nodeId: FunnelNodeId) => void }) {
  return (
    <div className="dashboard-grid">
      <section className="kpi-grid" aria-label="KPI">
        {analytics.kpis.map((metric) => (
          <article className="kpi-card" key={metric.key}>
            <span>{metric.label}</span>
            <strong>{metric.value.toLocaleString("ru-RU")}</strong>
          </article>
        ))}
      </section>

      <section className="panel funnel-panel">
        <div className="panel-header">
          <div>
            <h2>Интерактивная панель звонков</h2>
            <p>Дозвон — это ещё не разговор. Клик по узлу откроет вкладку «Звонки».</p>
          </div>
        </div>
        <OutcomeTree root={analytics.funnel} total={analytics.funnel.count} onNodeClick={onNodeClick} />
      </section>

      <section className="panel conversation-panel">
        <div className="panel-header">
          <div>
            <h2>Воронка состоявшихся разговоров</h2>
            <p>Только звонки, где клиент дал содержательную реплику или подтвердил встречу.</p>
          </div>
        </div>
        <ConversationFunnel steps={analytics.conversationFunnel} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Где теряем клиентов</h2>
            <p>Один звонок попадает только в один итоговый статус.</p>
          </div>
        </div>
        <div className="loss-card-grid">
          {analytics.losses.length ? analytics.losses.map((row) => <LossCard row={row} key={row.id} />) : <EmptyState text="Нет данных о причинах срыва." />}
        </div>
      </section>
    </div>
  );
}

function OutcomeTree({ root, total, onNodeClick }: { root: FunnelNode; total: number; onNodeClick: (nodeId: FunnelNodeId) => void }) {
  const nodes = new Map<FunnelNodeId, { node: FunnelNode; parentCount: number }>();

  function collect(node: FunnelNode, parentCount: number) {
    nodes.set(node.id, { node, parentCount });
    node.children?.forEach((child) => collect(child, node.count));
  }
  collect(root, total);

  const card = (id: FunnelNodeId, className: string) => {
    const item = nodes.get(id);
    return item ? <OutcomeCard className={className} node={item.node} total={total} parentCount={item.parentCount} onNodeClick={onNodeClick} /> : null;
  };

  return (
    <div className="outcome-map">
      {card("total", "pos-total")}
      {card("no_answer", "pos-no-answer")}
      {card("answered", "pos-answered")}
      {card("dropped_or_voicemail", "pos-dropped")}
      {card("bot_monologue_ignored", "pos-bot")}
      {card("conversation_happened", "pos-conversation")}
      {card("conversation_happened_not_interested", "pos-not-interested")}
      {card("conversation_happened_callback", "pos-callback")}
      {card("conversation_happened_interested", "pos-interested")}
      {card("meeting_scheduled", "pos-meeting")}
    </div>
  );
}

function OutcomeCard({ node, total, parentCount, onNodeClick, className }: { node: FunnelNode; total: number; parentCount: number; onNodeClick: (nodeId: FunnelNodeId) => void; className: string }) {
  const parentShare = parentCount ? node.count / parentCount : 1;
  const totalShare = total ? node.count / total : 0;
  return (
    <button className={`outcome-node outcome-${node.id} ${className}`} onClick={() => onNodeClick(node.id)}>
      <span>{node.label}</span>
      <strong>{node.count.toLocaleString("ru-RU")}</strong>
      <small>{formatPercent(parentShare)} от родителя</small>
      <small>{formatPercent(totalShare)} от всех</small>
    </button>
  );
}

function ConversationFunnel({ steps }: { steps: AnalyticsSnapshot["conversationFunnel"] }) {
  return (
    <div className="conversation-funnel">
      {steps.map((step, index) => {
        const share = step.parentCount ? step.count / step.parentCount : 0;
        return (
          <article className={`conversation-step flow-${step.color}`} key={step.id}>
            <span>{step.label}</span>
            <strong>{step.count.toLocaleString("ru-RU")}</strong>
            <small>{index === 0 ? "100% базы блока" : `${formatPercent(share)} от предыдущего`}</small>
          </article>
        );
      })}
    </div>
  );
}

function LossCard({ row }: { row: AnalyticsSnapshot["losses"][number] }) {
  return (
    <article className={`loss-card loss-${row.color}`}>
      <div className="loss-card-topline">
        <span aria-hidden="true" />
        <b>{row.count.toLocaleString("ru-RU")}</b>
      </div>
      <strong>{row.stage}</strong>
      <p>{row.description}</p>
      <div className="loss-card-meta">
        <em>{formatPercent(row.share)} от родителя</em>
        <small>из {row.parentCount.toLocaleString("ru-RU")}</small>
      </div>
      <footer>{row.recommendation}</footer>
    </article>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function CallsTab({ calls, filters, setFilters, onOpenCall }: { calls: CallRecord[]; filters: CallFilters; setFilters: Dispatch<SetStateAction<CallFilters>>; onOpenCall: (call: CallRecord) => void }) {
  const visibleCalls = calls.slice(0, 200);

  function setFilter<K extends keyof CallFilters>(key: K, value: CallFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="calls-layout">
      <section className="panel filters-panel">
        <div className="filters-grid simple-filters">
          <label>Период с<input type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} /></label>
          <label>Период по<input type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} /></label>
          <label>Клиент<input value={filters.client} onChange={(event) => setFilter("client", event.target.value)} placeholder="Имя или телефон" /></label>
          <label>Статус<select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Этап<select value={filters.funnelStage} onChange={(event) => setFilter("funnelStage", event.target.value)}><option value="">Все</option>{funnelStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label>Есть аудио<select value={filters.hasAudio} onChange={(event) => setFilter("hasAudio", event.target.value as CallFilters["hasAudio"])}><option value="">Все</option><option value="yes">Да</option><option value="no">Нет</option></select></label>
          <button className="secondary-button" onClick={() => setFilters(emptyFilters())}>Сбросить фильтры</button>
        </div>
        {filters.funnelNode && <div className="active-filter">Фильтр воронки: {stageLabels[filters.funnelNode] || "Требует проверки"}</div>}
      </section>

      <section className="panel table-panel">
        <div className="table-meta">Показано {visibleCalls.length.toLocaleString("ru-RU")} из {calls.length.toLocaleString("ru-RU")} звонков</div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Дата и время</th>
                <th>Длительность</th>
                <th>Статус</th>
                <th>Этап</th>
                <th>Причина</th>
                <th>Аудио</th>
                <th>Подробнее</th>
              </tr>
            </thead>
            <tbody>
              {visibleCalls.map((call) => (
                <tr key={call.id} onClick={() => onOpenCall(call)}>
                  <td><strong>{call.client}</strong></td>
                  <td>{formatDateTime(call.callStartedAt)}</td>
                  <td>{formatDuration(call.durationSeconds)}</td>
                  <td><StatusPill call={call} /></td>
                  <td>{getSalesStage(call)}</td>
                  <td>{getCallReason(call)}</td>
                  <td>{call.audioUrl ? <a href={call.audioUrl} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">Аудио</a> : ""}</td>
                  <td><button className="link-button" onClick={(event) => { event.stopPropagation(); onOpenCall(call); }}>Открыть</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!calls.length && <EmptyState text="Звонков под выбранные фильтры нет." />}
        </div>
      </section>
    </div>
  );
}

function StatusPill({ call }: { call: CallRecord }) {
  const outcome = getCallOutcome(call);
  return <span className={`status-pill status-${outcome}`}>{callOutcomeLabel(outcome)}</span>;
}

function CallDrawer({ call, onClose, onSaved }: { call: CallRecord; onClose: () => void; onSaved: (call: CallRecord) => void }) {
  const [form, setForm] = useState<AnalystReviewPayload>({
    manual_call_outcome: call.manualCallOutcome || "",
    manual_funnel_stage: call.manualFunnelStage || "",
    manual_failure_stage: call.manualFailureStage || "",
    manual_failure_reason: call.manualFailureReason || "",
    analyst_comment: call.analystComment || "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      manual_call_outcome: call.manualCallOutcome || "",
      manual_funnel_stage: call.manualFunnelStage || "",
      manual_failure_stage: call.manualFailureStage || "",
      manual_failure_reason: call.manualFailureReason || "",
      analyst_comment: call.analystComment || "",
    });
  }, [call]);

  function setField<K extends keyof AnalystReviewPayload>(key: K, value: AnalystReviewPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveAnalystReview(call.id, form);
      onSaved(saved || {
        ...call,
        manualCallOutcome: form.manual_call_outcome,
        manualFunnelStage: form.manual_funnel_stage,
        manualFailureStage: form.manual_failure_stage,
        manualFailureReason: form.manual_failure_reason,
        analystComment: form.analyst_comment,
        checkedByAnalyst: true,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{call.client}</h2>
            <p>{formatDateTime(call.callStartedAt)} · {formatDuration(call.durationSeconds) || "длительность неизвестна"}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <section className="drawer-section compact-facts">
          <Fact label="Статус" value={callOutcomeLabel(getCallOutcome(call))} />
          <Fact label="Этап" value={getSalesStage(call) || "Требует проверки"} />
          <Fact label="Причина" value={getCallReason(call)} />
          <Fact label="Аудио" value={call.audioUrl ? <a href={call.audioUrl} target="_blank" rel="noreferrer">Открыть запись</a> : "Требует проверки"} />
        </section>

        <section className="drawer-section">
          <h3>Summary</h3>
          <div className="summary-grid">
            <Fact label="Summary" value={call.aiSummary || call.result || "Требует проверки"} wide />
          </div>
        </section>

        <section className="drawer-section">
          <h3>Ручная правка</h3>
          <div className="review-form">
            <label>Статус<select value={form.manual_call_outcome} onChange={(event) => setField("manual_call_outcome", event.target.value as CallOutcome | "")}><option value="">Требует проверки</option>{statusOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Этап<select value={form.manual_funnel_stage} onChange={(event) => setField("manual_funnel_stage", event.target.value)}><option value="">Требует проверки</option>{funnelStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>Причина<input value={form.manual_failure_reason} onChange={(event) => setField("manual_failure_reason", event.target.value)} placeholder="Короткая причина" /></label>
            <label className="wide-field">Комментарий<textarea value={form.analyst_comment} onChange={(event) => setField("analyst_comment", event.target.value)} rows={4} placeholder="Комментарий аналитика" /></label>
          </div>
          {saveError && <div className="inline-error">{saveError}</div>}
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button>
        </section>

        <section className="drawer-section">
          <h3>Расшифровка</h3>
          {call.transcript?.length ? (
            <div className="transcript-list">
              {call.transcript.map((message, index) => (
                <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === "bot" ? "bot" : message.role === "user" ? "user" : "system"}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          ) : call.transcriptText ? <pre className="plain-transcript">{call.transcriptText}</pre> : <EmptyState text="Транскрипт отсутствует." />}
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "fact wide" : "fact"}>
      <span>{label}</span>
      <strong>{value || "Требует проверки"}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default App;
