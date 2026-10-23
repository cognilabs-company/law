"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-inline.css";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf, aiSeg } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { getStudioObject, listStudioRecords, type StudioRecord } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { SxButton } from "../Button";
import { loadRowPayload } from "../ctorpage/rowPayloads";
import { dropReferenceCache, firstReferenceInfo } from "../form/useReferenceOptions";
import { PencilIcon, PlusIcon, RefreshCwIcon, ScrollTextIcon, ShieldCheckIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { studioEventCode, useStudioLive } from "../live";
import { useCategoryTitle } from "../schema/categoryOptions";
import { useStudioLabels } from "../useStudioLabels";
import { inlineKeys, inlineKindOf, manageLeadKey, newDraftOwner, objectOwner, type InlineContext, type InlinePending } from "./model";
import { PendingChips } from "./PendingChips";
import { useInlineEditing } from "./useInlineEditing";

type Scope = { type: string; id: string };
type Row = { key: string; value: string; title: string; desc: string; scope: Scope | null; version: string; ctx: string };
type Load = { state: "loading" } | { state: "error" } | { state: "ready"; rows: Row[] };

const GUARANTEES = "/studio/reference/client-guarantees";
const RULES_LIMIT = 100;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

export function ruleApplies(p: Readonly<Record<string, unknown>> | null, categoryId: string, serviceId: string): boolean {
  if (!p) return true;
  const type = str(p.scope_type).toLowerCase();
  if (!type || type === "global") return true;
  if (type === "category") {
    const id = str(p.category_id) || str(p.scope_id);
    return !!categoryId && id === categoryId;
  }
  if (type === "service") {
    const id = str(p.service_id) || str(p.scope_id);
    return !!serviceId && id === serviceId;
  }
  return false;
}

function scopeOf(p: Readonly<Record<string, unknown>> | null): Scope | null {
  if (!p) return null;
  const type = str(p.scope_type).toLowerCase();
  if (!type) return null;
  return { type, id: str(p.category_id) || str(p.service_id) || str(p.scope_id) };
}

async function loadRules(categoryId: string, serviceId: string): Promise<Row[]> {
  const res = await listStudioRecords("K31", { source: "runtime", limit: RULES_LIMIT });
  const recs = res.items.filter((r) => r.source === "runtime");
  const payloads = await Promise.all(recs.map((r: StudioRecord) => loadRowPayload(r)));
  const rows: Row[] = [];
  recs.forEach((r, i) => {
    const p = payloads[i];
    if (!ruleApplies(p, categoryId, serviceId)) return;
    const value = r.runtimeTargetId || r.recordId || r.id;
    rows.push({ key: `${r.source}-${r.id}`, value, title: r.title || str(p?.title), desc: "", scope: scopeOf(p), version: str(p?.version) || r.version, ctx: r.actions.edit });
  });
  return rows;
}

async function loadGuarantees(): Promise<Row[]> {
  dropReferenceCache(GUARANTEES);
  const page = await firstReferenceInfo(GUARANTEES);
  return page.items.map((it) => ({ key: it.value, value: it.value, title: it.label, desc: str(it.raw.description), scope: null, version: "", ctx: "" }));
}

function ScopeTag({ scope, categoryTitle }: { scope: Scope; categoryTitle: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const own = scope.type === "category" && categoryTitle ? categoryTitle : scope.type === "service" ? t("sx.inline.rules.thisService") : "";
  return (
    <span className="sx-inl-mg__scope">
      {labels.option(scope.type, { ctor: "K31", field: "scope_type" })}
      {own ? <span>· {own}</span> : null}
    </span>
  );
}

export type ManagePanelProps = { code: string; mainCode: string; objectId: string; stepKey: string; fallback: ReactNode };

export function ManagePanel({ code, mainCode, objectId, stepKey, fallback }: ManagePanelProps): ReactElement {
  const t = useTranslations("studio");
  const kind = inlineKindOf(code);
  const [ctx, setCtx] = useState<{ id: string; categoryId: string; serviceId: string } | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  const [draft] = useState(newDraftOwner);
  const context: InlineContext = { categoryId: ctx?.id === objectId ? ctx.categoryId : "", list: true };
  const serviceId = ctx?.id === objectId ? ctx.serviceId : "";
  const ready = !objectId || ctx?.id === objectId;
  const categoryTitle = useCategoryTitle(context.categoryId);
  const ai = aiIdOf("admin.studio.wizard.manage", stepKey);

  useEffect(() => {
    if (!objectId) return;
    let live = true;
    getStudioObject(objectId)
      .then((d) => {
        if (live) setCtx({ id: objectId, categoryId: str(d.payload.category_id), serviceId: str(d.raw.runtime_target_id) });
      })
      .catch((e: unknown) => {
        logApiError("studio.sx.inline.context", e);
        if (live) setCtx({ id: objectId, categoryId: "", serviceId: "" });
      });
    return () => {
      live = false;
    };
  }, [objectId]);

  useEffect(() => {
    if (!ready || !kind) return;
    let live = true;
    const run = kind === "rule" ? loadRules(context.categoryId, serviceId) : loadGuarantees();
    run.then(
      (rows) => {
        if (live) setLoad({ state: "ready", rows });
      },
      (e: unknown) => {
        logApiError("studio.sx.inline.manage", e);
        if (live) setLoad({ state: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [ready, kind, context.categoryId, serviceId, nonce]);

  const reload = () => setNonce((n) => n + 1);

  const onPublished = (item: InlinePending) => {
    reload();
    notify.success(t("sx.inline.toast.panelPublished", { name: item.title || t("sx.ui.untitled") }));
  };

  const ed = useInlineEditing({ code, formCode: mainCode, owner: objectOwner(objectId) || draft, pattern: `@${stepKey}`, context, enabled: !!kind, onPublished });

  useStudioLive((e) => {
    if (e.event === "studio.object_published" && studioEventCode(e).toUpperCase() === code.toUpperCase()) reload();
  });

  if (!kind || !ed.canManage) return <>{fallback}</>;
  const k = inlineKeys(kind);
  const add = t(k.add);
  const icon = kind === "rule" ? ScrollTextIcon : ShieldCheckIcon;

  let list: ReactNode;
  if (load.state === "loading" || !ready) {
    list = (
      <div className="sx-inl-mg__sk" role="status" aria-busy="true">
        <span className="sx-vh">{t("sx.ui.loading")}</span>
        <span className="sx-sk" aria-hidden="true" />
        <span className="sx-sk" aria-hidden="true" />
      </div>
    );
  } else if (load.state === "error") {
    list = (
      <SxNote
        tone="error"
        title={t("sx.ui.loadFail")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={reload} aiId={aiIdOf(ai, "retry")}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      />
    );
  } else if (!load.rows.length) {
    list = (
      <div className="sx-inl-mg__empty">
        <p>{t(k.empty)}</p>
      </div>
    );
  } else {
    list = (
      <ul className="sx-inl-mg__list" aria-label={t(`sx.inline.listLabel.${kind}`)}>
        {load.rows.map((r) => {
          const name = r.title || t("sx.ui.untitled");
          return (
            <li key={r.key} className="sx-inl-mg__row" data-ai-id={aiIdOf(ai, "row", aiSeg(r.value))} data-ai-type="item" data-ai-label={name}>
              <span className="sx-inl-mg__icon" aria-hidden="true">
                {glyph(icon, { size: 18 })}
              </span>
              <span className="sx-inl-mg__text">
                <span className="sx-inl-mg__title" title={name}>
                  {name}
                </span>
                {r.scope || r.version || r.desc ? (
                  <span className="sx-inl-mg__meta">
                    {r.scope ? <ScopeTag scope={r.scope} categoryTitle={r.scope.id === context.categoryId ? categoryTitle : ""} /> : null}
                    {r.version ? <span className="sx-code">{r.version}</span> : null}
                    {r.desc ? <span className="sx-inl-mg__desc">{r.desc}</span> : null}
                  </span>
                ) : null}
              </span>
              <SxButton variant="ghost" size="sm" icon={PencilIcon} onClick={() => ed.openEdit(r.value, name, r.ctx || undefined)} aria-label={t("sx.inline.editOf", { name })} aiId={aiIdOf(ai, "row", aiSeg(r.value), "edit")}>
                {t("sx.inline.edit")}
              </SxButton>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="sx-inl-mg" data-ai-id={ai} data-ai-type="section" data-ai-label={t(`sx.inline.listLabel.${kind}`)}>
      <p className="sx-inl-mg__lead">{t(manageLeadKey(kind, !!context.categoryId, !!serviceId), { category: categoryTitle || "" })}</p>
      {list}
      <div className="sx-inl-tail">
        <PendingChips items={ed.pending} label={t("sx.inline.pendingList")} canEdit onOpen={ed.openPending} ai={ai} />
        <SxButton variant="add" size="sm" icon={PlusIcon} className="sx-inl-add" onClick={() => ed.openNew("")} aiId={aiIdOf(ai, "add")}>
          {add}
        </SxButton>
      </div>
      {ed.drawer}
    </div>
  );
}
