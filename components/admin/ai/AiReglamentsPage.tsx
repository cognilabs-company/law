"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { toast } from "@/lib/toast";
import { isForbidden, parseServerTime } from "@/lib/http";
import { useAiField, useAiModal, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import {
  getReglament,
  isOpenGap,
  listReglamentGaps,
  listReglaments,
  mergeReglament,
  recheckReglamentGate,
  reglamentGateMissing,
  reglamentNeedsDetails,
  subscribeReglamentGate,
  type GapFilter,
  type Reglament,
  type ReglamentGap,
  type ReglamentGate,
} from "@/lib/services/aiReglaments";
import { useRgl } from "./bits";
import ReglamentList, { type Phase } from "./ReglamentList";
import ReglamentGaps from "./ReglamentGaps";
import ReglamentDrawer from "./ReglamentDrawer";
import ReglamentEditor, { type EditorMode, type SavedInfo } from "./ReglamentEditor";
import ReglamentUpload, { type UploadSeed, type UploadedInfo } from "./ReglamentUpload";
import { IconAiAnswer, IconCircleCheck, IconClock, IconFileText, IconHelpCircle, IconPlus, IconRefresh, IconUpload } from "@/components/icons";

type Tab = "list" | "gaps";
type ListState = { phase: Phase; items: Reglament[]; error: unknown };
type GapState = { phase: Phase; items: ReglamentGap[]; error: unknown; filter: GapFilter };

const TABS: Tab[] = ["list", "gaps"];

function useGate(key: ReglamentGate): boolean {
  return useSyncExternalStore(
    subscribeReglamentGate,
    () => reglamentGateMissing(key),
    () => false,
  );
}

export default function AiReglamentsPage() {
  const { t, num, day } = useRgl();
  const [tab, setTab] = useState<Tab>("list");
  const [list, setList] = useState<ListState>({ phase: "loading", items: [], error: null });
  const [gaps, setGaps] = useState<GapState>({ phase: "loading", items: [], error: null, filter: "open" });
  const [gapFilter, setGapFilter] = useState<GapFilter>("open");
  const [listBusy, setListBusy] = useState(false);
  const [gapsBusy, setGapsBusy] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [st, setSt] = useState("");
  const [gq, setGq] = useState("");
  const [drawerId, setDrawerId] = useState("");
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editBusy, setEditBusy] = useState("");
  const [flashId, setFlashId] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const listSeq = useRef(0);
  const gapSeq = useRef(0);

  const listMissing = useGate("list");
  const gapsMissing = useGate("gaps");
  const createMissing = useGate("create");
  const updateMissing = useGate("update");
  const uploadMissing = useGate("upload");

  const loadList = useCallback(async (): Promise<Reglament[] | null> => {
    const my = ++listSeq.current;
    try {
      const res = await listReglaments();
      if (my !== listSeq.current) return null;
      setList(res.kind === "missing" ? { phase: "missing", items: [], error: null } : { phase: "ready", items: res.data, error: null });
      return res.kind === "ok" ? res.data : null;
    } catch (e) {
      if (my !== listSeq.current) return null;
      setList((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", items: [], error: e }));
      return null;
    }
  }, []);

  const loadGaps = useCallback(async (filter: GapFilter) => {
    const my = ++gapSeq.current;
    try {
      const res = await listReglamentGaps(filter);
      if (my !== gapSeq.current) return;
      setGaps(res.kind === "missing" ? { phase: "missing", items: [], error: null, filter } : { phase: "ready", items: res.data, error: null, filter });
    } catch (e) {
      if (my !== gapSeq.current) return;
      setGaps((cur) => (cur.phase === "ready" && cur.filter === filter ? { ...cur, error: e } : { phase: "error", items: [], error: e, filter }));
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList, listMissing]);

  useEffect(() => {
    void loadGaps(gapFilter);
  }, [loadGaps, gapFilter, gapsMissing]);

  useAiSelection("admin_ai_reglaments_tab", tab);
  useAiReveal(/^admin\.ai-reglaments\.gaps(\.|$)/, () => setTab("gaps"));
  useAiReveal(/^admin\.ai-reglaments\.(list|item|filters|search)(\.|$)/, () => setTab("list"));
  useAiReveal(/^ai-reglaments:gaps/, () => setTab("gaps"));
  useAiReveal(/^ai-reglaments:(list|search|filters)$/, () => setTab("list"));
  useAiField("admin.ai-reglaments.search.input", { get: () => q, set: setQ });
  useAiField("admin.ai-reglaments.gaps.search.input", { get: () => gq, set: setGq });

  const ready = list.phase === "ready";
  const forbidden = list.phase === "error" && isForbidden(list.error);
  const canCreate = ready && !createMissing;
  const canUpload = ready && !uploadMissing;
  const canEdit = ready && !updateMissing;
  const canAddGap = ready && !(createMissing && updateMissing);

  useAiModal("admin.ai-reglaments.editor", () => {
    if (canCreate) setEditor({ kind: "create" });
  });
  useAiModal("admin.ai-reglaments.upload-modal", () => {
    if (canUpload) setUploadOpen(true);
  });

  async function retryList() {
    setListBusy(true);
    setList((cur) => ({ ...cur, phase: cur.phase === "ready" ? "ready" : "loading" }));
    if (gapsMissing) recheckReglamentGate("gaps");
    if (listMissing) recheckReglamentGate("list");
    else await loadList();
    setListBusy(false);
  }

  async function retryGaps() {
    setGapsBusy(true);
    if (listMissing) recheckReglamentGate("list");
    if (gapsMissing) {
      setGaps((cur) => ({ ...cur, phase: "loading" }));
      recheckReglamentGate("gaps");
    } else {
      await loadGaps(gapFilter);
    }
    setGapsBusy(false);
  }

  function flash(id: string) {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? "" : cur)), 2600);
  }

  async function resolveFull(r: Reglament): Promise<Reglament> {
    if (!reglamentNeedsDetails(r)) return r;
    return mergeReglament(r, await getReglament(r.id));
  }

  async function startEdit(r: Reglament) {
    if (editBusy || !r.id) return;
    let full = r;
    if (reglamentNeedsDetails(r)) {
      setEditBusy(r.id);
      full = await resolveFull(r);
      setEditBusy("");
    }
    setDrawerId("");
    setEditor({ kind: "edit", reglament: full });
  }

  async function onSaved(info: SavedInfo) {
    const fromEdit = editor?.kind === "edit";
    setEditor(null);
    toast(info.created ? t("editor.created", { title: info.title }) : t("editor.updated", { v: info.version }), { tone: "ok" });
    if (info.gapKey) setAdded((cur) => (cur.includes(info.gapKey) ? cur : [...cur, info.gapKey]));
    const fresh = await loadList();
    if (info.gapKey) void loadGaps(gapFilter);
    if (!info.id) return;
    flash(info.id);
    if (fromEdit && fresh?.some((r) => r.id === info.id)) setDrawerId(info.id);
  }

  async function onUploaded(info: UploadedInfo) {
    setUploadOpen(false);
    toast(t("upload.done", { title: info.title, v: info.version }), { tone: "ok" });
    setTab("list");
    const fresh = await loadList();
    if (!info.id) return;
    flash(info.id);
    if (fresh?.some((r) => r.id === info.id)) setDrawerId(info.id);
  }

  function switchToEditor(seed: UploadSeed) {
    setUploadOpen(false);
    setEditor({ kind: "create", title: seed.title, category: seed.category, version: seed.version });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, k: Tab) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(k) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById(`rgl-tab-${next}`)?.focus();
  }

  const items = list.items;
  const active = items.filter((r) => r.status === "active").length;
  const latest = items.reduce((best, r) => {
    const at = parseServerTime(r.updatedAt);
    return Number.isFinite(at) && (!best || at > parseServerTime(best)) ? r.updatedAt : best;
  }, "");
  const gapsLive = gaps.phase === "ready" && gaps.filter === gapFilter;
  const openGaps = gaps.phase === "ready" ? gaps.items.filter(isOpenGap).length : 0;
  const gapsPhase: Phase = gaps.filter !== gapFilter && gaps.phase !== "missing" ? "loading" : gaps.phase;
  const drawerBase = drawerId ? (items.find((r) => (r.id || r.title) === drawerId) ?? null) : null;
  const showActions = list.phase === "loading" || ready;

  const kpis = [
    { key: "active", Icon: IconCircleCheck, value: ready ? `${num(active)} / ${num(items.length)}` : "—", label: t("kpi.active"), warn: false },
    { key: "updated", Icon: IconClock, value: ready && latest ? day(latest) : "—", label: t("kpi.updated"), warn: false },
    { key: "gaps", Icon: IconHelpCircle, value: gaps.phase === "ready" ? num(openGaps) : "—", label: t("kpi.gaps"), warn: gaps.phase === "ready" && openGaps > 0 },
  ];

  return (
    <div className="rgl">
      <section className="rgl-head" data-ai-target="ai-reglaments:header">
        <div className="rgl-head__main">
          <span className="rgl-head__ico" aria-hidden>
            <IconAiAnswer />
          </span>
          <div className="rgl-head__txt">
            <span className="rgl-head__eyebrow">{t("eyebrow")}</span>
            <h2 className="rgl-head__t">{t("title")}</h2>
            <p className="rgl-head__l">{t("lead")}</p>
          </div>
          {showActions ? (
            <div className="rgl-head__acts">
              <button
                type="button"
                className="btn btn--line btn--sm"
                onClick={() => setUploadOpen(true)}
                disabled={!canUpload}
                title={uploadMissing ? t("missing.uploadSoon") : undefined}
                data-ai-id="admin.ai-reglaments.upload"
                data-ai-target="button:upload-reglament"
              >
                <IconUpload aria-hidden />
                {t("uploadCta")}
                {uploadMissing ? <span className="rgl-soon">{t("missing.soon")}</span> : null}
              </button>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                onClick={() => setEditor({ kind: "create" })}
                disabled={!canCreate}
                title={createMissing ? t("missing.writeText") : undefined}
                data-ai-id="admin.ai-reglaments.create"
                data-ai-target="button:new-reglament"
              >
                <IconPlus aria-hidden />
                {t("newCta")}
                {createMissing ? <span className="rgl-soon">{t("missing.soon")}</span> : null}
              </button>
            </div>
          ) : null}
        </div>
        {forbidden ? null : (
          <div className="rgl-kpis">
            {kpis.map(({ key, Icon, value, label, warn }) => (
              <div key={key} className={`rgl-kpi${warn ? " rgl-kpi--warn" : ""}`}>
                <span className="rgl-kpi__ico" aria-hidden>
                  <Icon />
                </span>
                <span className="rgl-kpi__m">
                  <b>{value}</b>
                  <span>{label}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="rgl-tabs" role="tablist" aria-label={t("tabsAria")} data-ai-id="admin.ai-reglaments.tabs" data-ai-target="ai-reglaments:tabs">
        {TABS.map((k) => {
          const n = k === "list" ? (ready ? items.length : null) : gaps.phase === "ready" ? openGaps : null;
          return (
            <button
              key={k}
              id={`rgl-tab-${k}`}
              type="button"
              role="tab"
              className="rgl-tab"
              aria-selected={tab === k}
              aria-controls="rgl-panel"
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              onKeyDown={(e) => onTabKey(e, k)}
              data-ai-id={`admin.ai-reglaments.tab.${k}`}
              data-ai-type="tab"
            >
              {k === "list" ? <IconFileText aria-hidden /> : <IconHelpCircle aria-hidden />}
              {t(`tabs.${k}`)}
              {n !== null ? <span className={`rgl-tab__n${k === "gaps" && n > 0 ? " rgl-tab__n--warn" : ""}`}>{num(n)}</span> : null}
            </button>
          );
        })}
      </div>

      <section className="ppanel rgl-panel" role="tabpanel" id="rgl-panel" aria-labelledby={`rgl-tab-${tab}`}>
        <div className="rgl-panel__h">
          <div className="rgl-panel__t">
            <b>{tab === "list" ? t("list.title") : t("gaps.title")}</b>
            <small>{tab === "list" ? t("list.lead") : t("gaps.lead")}</small>
          </div>
          {tab === "gaps" && gapsLive ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void retryGaps()} disabled={gapsBusy} data-ai-id="admin.ai-reglaments.gaps.refresh">
              <IconRefresh className={gapsBusy ? "rgl-spinning" : undefined} aria-hidden />
              {t("gaps.refresh")}
            </button>
          ) : null}
        </div>

        {tab === "list" ? (
          <ReglamentList
            phase={list.phase}
            items={items}
            error={list.error}
            busy={listBusy}
            q={q}
            onQ={setQ}
            cat={cat}
            onCat={setCat}
            st={st}
            onSt={setSt}
            canCreate={canCreate}
            canUpload={canUpload}
            canEdit={canEdit}
            editBusy={editBusy}
            flashId={flashId}
            onOpen={(r) => setDrawerId(r.id || r.title)}
            onEdit={(r) => void startEdit(r)}
            onCreate={() => setEditor({ kind: "create" })}
            onUpload={() => setUploadOpen(true)}
            onRetry={() => void retryList()}
          />
        ) : (
          <ReglamentGaps
            phase={gapsPhase}
            items={gaps.items}
            error={gaps.error}
            busy={gapsBusy}
            filter={gapFilter}
            onFilter={setGapFilter}
            q={gq}
            onQ={setGq}
            added={added}
            canAdd={canAddGap}
            onAdd={(g) => setEditor({ kind: "gap", gap: g })}
            onRetry={() => void retryGaps()}
          />
        )}
      </section>

      <ReglamentDrawer reglament={drawerBase} canEdit={canEdit} editBusy={Boolean(editBusy)} onEdit={(r) => void startEdit(r)} onClose={() => setDrawerId("")} />
      <ReglamentEditor mode={editor} reglaments={items} resolve={resolveFull} onClose={() => setEditor(null)} onSaved={(info) => void onSaved(info)} />
      <ReglamentUpload
        open={uploadOpen}
        missing={uploadMissing}
        reglaments={items}
        onClose={() => setUploadOpen(false)}
        onDone={(info) => void onUploaded(info)}
        onUseEditor={switchToEditor}
      />
    </div>
  );
}
