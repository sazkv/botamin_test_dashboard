import { startTransition, useDeferredValue, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { fetchCall, fetchCalls, saveAnalystReview, type AnalystReviewPayload } from "./api";
import {
  buildAnalytics,
  emptyFilters,
  failureStageOptions,
  filterCalls,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  funnelStageOptions,
  qualificationOptions,
  stageLabels,
} from "./analytics";
import type { AnalyticsSnapshot, CallFilters, CallRecord, FunnelNode, FunnelNodeId, TabId } from "./types";

const yesNoOptions = [
  { value: "", label: "Все" },
  { value: "yes", label: "Да" },
  { value: "no", label: "Нет" },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
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
      setFilters({ ...emptyFilters(), funnelNode: nodeId });
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
          <button className={activeTab === "calls" ? "active" : ""} onClick={() => setActiveTab("calls")}>Calls</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">B2B SaaS analytics</p>
            <h1>{activeTab === "dashboard" ? "Дашборд аналитика" : "Звонки"}</h1>
          </div>
          <div className="header-meta">
            <span>{calls.length} звонков загружено</span>
            {filters.funnelNode && <button className="ghost-button" onClick={() => setFilters((current) => ({ ...current, funnelNode: undefined }))}>Сбросить узел воронки</button>}
          </div>
        </header>

        {error && <div className="error-banner">API error: {error}</div>}
        {loading && <div className="loading-panel">Загружаем звонки из API...</div>}

        {!loading && activeTab === "dashboard" && <Dashboard analytics={analytics} onNodeClick={openCallsWithNode} onOpenCall={openCall} />}
        {!loading && activeTab === "calls" && <CallsTab calls={filteredCalls} filters={filters} setFilters={setFilters} onOpenCall={openCall} />}
      </main>

      {selectedCall && <CallDrawer call={selectedCall} onClose={() => setSelectedCall(null)} onSaved={updateCall} />}
    </div>
  );
}

function Dashboard({ analytics, onNodeClick, onOpenCall }: { analytics: AnalyticsSnapshot; onNodeClick: (nodeId: FunnelNodeId) => void; onOpenCall: (call: CallRecord) => void }) {
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
            <h2>Интерактивная карта воронки</h2>
            <p>Клик по узлу откроет Calls с применённым фильтром.</p>
          </div>
        </div>
        <FunnelTree node={analytics.funnel} onNodeClick={onNodeClick} root />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Где теряем клиентов</h2>
            <p>Доля считается от осмысленных разговоров.</p>
          </div>
        </div>
        <div className="loss-list">
          {analytics.losses.length ? analytics.losses.map((row) => (
            <div className="loss-row" key={`${row.stage}-${row.reason}`}>
              <div>
                <strong>{row.stage}</strong>
                <span>{row.reason}</span>
              </div>
              <div className="loss-bar" aria-hidden="true"><i style={{ width: `${Math.min(row.share * 100, 100)}%` }} /></div>
              <b>{row.count}</b>
              <em>{Math.round(row.share * 100)}%</em>
            </div>
          )) : <EmptyState text="Нет данных о причинах срыва." />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Очередь для аналитика</h2>
            <p>Сначала звонки с конфликтами или недостающей квалификацией.</p>
          </div>
        </div>
        <div className="queue-list">
          {analytics.reviewQueue.length ? analytics.reviewQueue.map(({ call, reasons }) => (
            <button className="queue-item" key={call.id} onClick={() => onOpenCall(call)}>
              <div>
                <strong>{call.client}</strong>
                <span>{formatDateTime(call.callStartedAt)} · {call.company || ""}</span>
              </div>
              <p>{reasons.join("; ")}</p>
            </button>
          )) : <EmptyState text="Приоритетных звонков для ручной проверки нет." />}
        </div>
      </section>
    </div>
  );
}

function FunnelTree({ node, onNodeClick, root = false }: { node: FunnelNode; onNodeClick: (nodeId: FunnelNodeId) => void; root?: boolean }) {
  return (
    <div className={root ? "funnel-tree root" : "funnel-tree"}>
      <button className="funnel-node" onClick={() => onNodeClick(node.id)}>
        <span>{node.label}</span>
        <strong>{node.count.toLocaleString("ru-RU")}</strong>
      </button>
      {node.children && (
        <div className="funnel-children">
          {node.children.map((child) => <FunnelTree key={child.id} node={child} onNodeClick={onNodeClick} />)}
        </div>
      )}
    </div>
  );
}

function CallsTab({ calls, filters, setFilters, onOpenCall }: { calls: CallRecord[]; filters: CallFilters; setFilters: Dispatch<SetStateAction<CallFilters>>; onOpenCall: (call: CallRecord) => void }) {
  function setFilter<K extends keyof CallFilters>(key: K, value: CallFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="calls-layout">
      <section className="panel filters-panel">
        <div className="filters-grid">
          <label>Период с<input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label>Период по<input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
          <label>Клиент<input value={filters.client} onChange={(e) => setFilter("client", e.target.value)} placeholder="Имя или телефон" /></label>
          <label>Компания<input value={filters.company} onChange={(e) => setFilter("company", e.target.value)} placeholder="Компания" /></label>
          <label>Статус<input value={filters.status} onChange={(e) => setFilter("status", e.target.value)} placeholder="normalized_status" /></label>
          <label>Отвеченные<select value={filters.answered} onChange={(e) => setFilter("answered", e.target.value as CallFilters["answered"])}><option value="">Все</option><option value="answered">Отвеченные</option><option value="not_answered">Неотвеченные</option></select></label>
          <label>Этап воронки<select value={filters.funnelStage} onChange={(e) => setFilter("funnelStage", e.target.value)}><option value="">Все</option>{funnelStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label>Где сорвался<select value={filters.failureStage} onChange={(e) => setFilter("failureStage", e.target.value)}><option value="">Все</option>{failureStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label>Встреча назначена<select value={filters.meetingScheduled} onChange={(e) => setFilter("meetingScheduled", e.target.value as CallFilters["meetingScheduled"])}>{yesNoOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Квалификация<select value={filters.qualification} onChange={(e) => setFilter("qualification", e.target.value)}><option value="">Все</option>{qualificationOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label>Проверено<select value={filters.checkedByAnalyst} onChange={(e) => setFilter("checkedByAnalyst", e.target.value as CallFilters["checkedByAnalyst"])}>{yesNoOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Есть аудио<select value={filters.hasAudio} onChange={(e) => setFilter("hasAudio", e.target.value as CallFilters["hasAudio"])}>{yesNoOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="checkbox-label"><input type="checkbox" checked={filters.meaningfulOnly} onChange={(e) => setFilter("meaningfulOnly", e.target.checked)} /> Только осмысленные разговоры</label>
          <button className="secondary-button" onClick={() => setFilters(emptyFilters())}>Сбросить фильтры</button>
        </div>
        {filters.funnelNode && <div className="active-filter">Фильтр воронки: {stageLabels[filters.funnelNode] || filters.funnelNode}</div>}
      </section>

      <section className="panel table-panel">
        <div className="table-meta">Показано {calls.length.toLocaleString("ru-RU")} звонков</div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Дата звонка</th>
                <th>Время звонка</th>
                <th>Компания</th>
                <th>Статус</th>
                <th>Этап воронки</th>
                <th>Где сорвался</th>
                <th>Встреча назначена</th>
                <th>Время созвона с экспертом</th>
                <th>Квалификация</th>
                <th>Проверено</th>
                <th>Аудио</th>
                <th>Подробнее</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} onClick={() => onOpenCall(call)}>
                  <td><strong>{call.client}</strong></td>
                  <td>{formatDate(call.callStartedAt)}</td>
                  <td>{formatTime(call.callStartedAt)}</td>
                  <td>{call.company || ""}</td>
                  <td><StatusPill value={call.normalizedStatus} /></td>
                  <td>{call.manualFunnelStage || call.maxFunnelStage || call.funnelStage || ""}</td>
                  <td>{call.manualFailureStage || call.failureStage || ""}</td>
                  <td>{call.meetingScheduled ? "Да" : "Нет"}</td>
                  <td>{call.expertCallTime || ""}</td>
                  <td>{call.manualQualification || call.qualification || ""}</td>
                  <td>{call.checkedByAnalyst ? "Да" : "Нет"}</td>
                  <td>{call.audioUrl ? <a href={call.audioUrl} onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer">audio</a> : ""}</td>
                  <td><button className="link-button" onClick={(e) => { e.stopPropagation(); onOpenCall(call); }}>Открыть</button></td>
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

function StatusPill({ value }: { value?: string }) {
  return <span className="status-pill">{value || ""}</span>;
}

function CallDrawer({ call, onClose, onSaved }: { call: CallRecord; onClose: () => void; onSaved: (call: CallRecord) => void }) {
  const [form, setForm] = useState<AnalystReviewPayload>({
    qualification_is_correct: call.qualificationIsCorrect ?? null,
    manual_qualification: call.manualQualification || "",
    manual_funnel_stage: call.manualFunnelStage || "",
    manual_failure_stage: call.manualFailureStage || "",
    manual_failure_reason: call.manualFailureReason || call.failureReason || "",
    analyst_comment: call.analystComment || "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      qualification_is_correct: call.qualificationIsCorrect ?? null,
      manual_qualification: call.manualQualification || "",
      manual_funnel_stage: call.manualFunnelStage || "",
      manual_failure_stage: call.manualFailureStage || "",
      manual_failure_reason: call.manualFailureReason || call.failureReason || "",
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
        qualificationIsCorrect: form.qualification_is_correct,
        manualQualification: form.manual_qualification,
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
          <Fact label="Аудио" value={call.audioUrl ? <a href={call.audioUrl} target="_blank" rel="noreferrer">Открыть запись</a> : ""} />
          <Fact label="Технический статус" value={call.technicalStatus || ""} />
          <Fact label="Причина завершения" value={call.endReason || ""} />
        </section>

        <section className="drawer-section">
          <h3>Summary</h3>
          <div className="summary-grid">
            <Fact label="Итог звонка" value={call.result || ""} />
            <Fact label="Тип контакта" value={call.contactType || ""} />
            <Fact label="Максимальный этап" value={call.maxFunnelStage || call.funnelStage || ""} />
            <Fact label="Где сорвался" value={call.failureStage || ""} />
            <Fact label="Причина срыва" value={call.failureReason || ""} />
            <Fact label="AI summary" value={call.aiSummary || ""} wide />
            <Fact label="AI comment" value={call.aiComment || ""} wide />
          </div>
        </section>

        <section className="drawer-section">
          <h3>Ручная проверка аналитика</h3>
          <div className="review-form">
            <label>qualification_is_correct<select value={form.qualification_is_correct === null ? "" : form.qualification_is_correct ? "yes" : "no"} onChange={(e) => setField("qualification_is_correct", e.target.value === "" ? null : e.target.value === "yes")}><option value="">Не указано</option><option value="yes">Да</option><option value="no">Нет</option></select></label>
            <label>manual_qualification<select value={form.manual_qualification} onChange={(e) => setField("manual_qualification", e.target.value)}><option value="">Не указано</option>{qualificationOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>manual_funnel_stage<select value={form.manual_funnel_stage} onChange={(e) => setField("manual_funnel_stage", e.target.value)}><option value="">Не указано</option>{funnelStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>manual_failure_stage<select value={form.manual_failure_stage} onChange={(e) => setField("manual_failure_stage", e.target.value)}><option value="">Не указано</option>{failureStageOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>manual_failure_reason<input value={form.manual_failure_reason} onChange={(e) => setField("manual_failure_reason", e.target.value)} placeholder="Причина срыва" /></label>
            <label className="wide-field">analyst_comment<textarea value={form.analyst_comment} onChange={(e) => setField("analyst_comment", e.target.value)} rows={4} placeholder="Комментарий аналитика" /></label>
          </div>
          {saveError && <div className="inline-error">{saveError}</div>}
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? "Сохраняем..." : "Save"}</button>
        </section>

        <section className="drawer-section">
          <h3>Transcript</h3>
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
      <strong>{value || ""}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default App;
