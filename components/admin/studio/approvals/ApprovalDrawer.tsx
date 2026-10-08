"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import {
  downloadStudioVersionFile,
  exportStudioVersionsXlsx,
  getStudioObject,
  isApprovalFree,
  type StudioAccess,
  type StudioConstructor,
  type StudioDetail,
} from "@/lib/services/studio";
import { editorFor } from "../editors";
import { ConstructorIcon, StudioCodeChip, StudioStatusPill, StudioStatusSteps, useStudioErrorText, useStudioText } from "../bits";
import DecisionModal, { type DecisionKind } from "./DecisionModal";
import ApprovalComments from "./ApprovalComments";
import { canActOnStep, canPublishItem, currentStepOf, currentVersionOf, isReviewable, mergeDetail, normRole, stepBack, stepDone, submittedOf, versionLabelOf } from "./helpers";
import {
  IconChat,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClose,
  IconDocLines,
  IconDownload,
  IconEdit,
  IconExternal,
  IconFileText,
  IconHourglass,
  IconInfo,
  IconPaperclip,
  IconRefresh,
  IconRocket,
  IconShieldCheck,
} from "@/components/icons";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';


const noop = () => undefined;

export default function ApprovalDrawer({
  base,
  ctor,
  access,
  pulse,
  onClose,
  onChanged,
}: {
  base: StudioDetail | null;
  ctor: StudioConstructor | null;
  access: StudioAccess;
  pulse: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!base) return null;
  return <DrawerPanel key={base.id} base={base} ctor={ctor} access={access} pulse={pulse} onClose={onClose} onChanged={onChanged} />;
}

function DrawerPanel({
  base,
  ctor,
  access,
  pulse,
  onClose,
  onChanged,
}: {
  base: StudioDetail;
  ctor: StudioConstructor | null;
  access: StudioAccess;
  pulse: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, ctorName, role, stepStatus, when } = useStudioText();
  const errText = useStudioErrorText();
  const uid = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const [own, setOwn] = useState(0);
  const [fresh, setFresh] = useState<StudioDetail | null>(null);
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);
  const decisionOpen = useRef(false);

  useEffect(() => {
    closeRef.current = onClose;
    decisionOpen.current = decision !== null;
  });

  useEffect(() => {
    let alive = true;
    getStudioObject(base.id)
      .then((d) => {
        if (alive) setFresh(d);
      })
      .catch((e: unknown) => logApiError("studio.approvals.detail", e));
    return () => {
      alive = false;
    };
  }, [base.id, pulse, own]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !decisionOpen.current) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);

  function trap(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const d = mergeDetail(base, fresh && fresh.id === base.id ? fresh : null);
  const cur = currentVersionOf(d);
  const ver = versionLabelOf(d);
  const sub = submittedOf(d);
  const at = currentStepOf(d);
  const free = isApprovalFree(d.code, ctor);
  const canAct = canActOnStep(d, access);
  const canPub = canPublishItem(d, access, ctor);
  const reviewable = isReviewable(d);
  const stepName = at ? at.step.title || role(at.step.role) : "";
  const fileName = cur?.fileName || "";
  const fileVersionId = cur?.id || d.currentVersionId;
  const hasFile = d.hasFile || Boolean(cur?.hasFile);
  const entry = editorFor(d.code);
  const Editor = entry.Editor;
  const empty = !Object.keys(d.payload).length;

  async function download() {
    if (!fileVersionId) return;
    setFileBusy(true);
    try {
      await downloadStudioVersionFile(fileVersionId, fileName);
    } catch (e) {
      logApiError("studio.approvals.file", e);
      toast(errText(e).text || t("approvals.drawer.fileFail"), { tone: "err" });
    } finally {
      setFileBusy(false);
    }
  }

  async function exportVersions() {
    setXlsBusy(true);
    try {
      await exportStudioVersionsXlsx(d.id, d.title);
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.approvals.versions-xlsx", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setXlsBusy(false);
    }
  }

  function done() {
    setDecision(null);
    setOwn((n) => n + 1);
    onChanged();
  }

  function stale() {
    setOwn((n) => n + 1);
    onChanged();
  }

  let footer: ReactNode = null;
  if (reviewable && canAct) {
    footer = (
      <div className="stu-apd__acts">
        <button type="button" className="btn btn--pri" onClick={() => setDecision("approve")} data-ai-id="admin.studio.approvals.drawer.approve" data-ai-type="button" data-ai-label={t("actions.approve")}>
          <IconCircleCheck aria-hidden />
          {t("actions.approve")}
        </button>
        <button type="button" className="btn btn--soft" onClick={() => setDecision("changes_requested")} data-ai-id="admin.studio.approvals.drawer.changes" data-ai-type="button" data-ai-label={t("actions.changesRequested")}>
          <IconRefresh aria-hidden />
          {t("actions.changesRequested")}
        </button>
        <button type="button" className="btn btn--line stu-apm__danger" onClick={() => setDecision("reject")} data-ai-id="admin.studio.approvals.drawer.reject" data-ai-type="button" data-ai-label={t("actions.reject")}>
          <IconCircleX aria-hidden />
          {t("actions.reject")}
        </button>
      </div>
    );
  } else if (canPub) {
    footer = (
      <div className="stu-apd__acts">
        <button type="button" className="btn btn--grad" onClick={() => setDecision("publish")} data-ai-id="admin.studio.approvals.drawer.publish" data-ai-type="button" data-ai-label={t("actions.publish")}>
          <IconRocket aria-hidden />
          {t("actions.publish")}
        </button>
        <p className="stu-apd__why">{t("approvals.drawer.publishHint")}</p>
      </div>
    );
  } else {
    const why = reviewable
      ? t("approvals.drawer.waitStep", { step: stepName || t("approvals.drawer.nextStep"), role: at?.step.role ? role(normRole(at.step.role)) : t("roles.studio_reviewer") })
      : d.status === "approved"
        ? t("approvals.drawer.waitPublisher")
        : d.status === "changes_requested"
          ? t("approvals.drawer.waitAuthor")
          : d.status === "published"
            ? t("approvals.drawer.isPublished")
            : d.status === "archived"
              ? t("flow.archived")
              : t("approvals.drawer.notInQueue");
    footer = (
      <p className="stu-apd__wait">
        <IconHourglass aria-hidden />
        {why}
      </p>
    );
  }

  return (
    <>
      <button type="button" className="rgl-drw__scrim" aria-label={t("actions.close")} tabIndex={-1} onClick={onClose} />
      <aside
        ref={panel}
        className="rgl-drw stu-apd"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        tabIndex={-1}
        onKeyDown={trap}
        data-ai-id="admin.studio.approvals.drawer"
        data-ai-type="modal"
        data-ai-label={d.title}
      >
        <header className="rgl-drw__head">
          <ConstructorIcon code={d.code} size="lg" />
          <div className="rgl-drw__ht">
            <span className="rgl-drw__eyebrow">{ctorName(d.code)}</span>
            <h2 id={`${uid}-t`}>{d.title || t("approvals.untitled")}</h2>
            <div className="rgl-drw__chips">
              <StudioCodeChip code={d.code} />
              {ver ? <span className="stu-apc__ver">v{ver}</span> : null}
              <StudioStatusPill status={d.status} raw={d.statusRaw} />
            </div>
          </div>
          <button type="button" className="rgl-drw__x" onClick={onClose} aria-label={t("actions.close")} data-ai-id="admin.studio.approvals.drawer.close" data-ai-type="button" data-ai-label={t("actions.close")}>
            <IconClose aria-hidden />
          </button>
        </header>

        <div className="rgl-drw__body">
          <StudioStatusSteps status={d.status} raw={d.statusRaw} approvalFree={free} />

          <dl className="rgl-drw__kv">
            <div>
              <dt>{t("approvals.drawer.sentBy")}</dt>
              <dd>{sub.by || "—"}</dd>
            </div>
            <div>
              <dt>{t("approvals.drawer.sentAt")}</dt>
              <dd>{when(sub.at) || "—"}</dd>
            </div>
            <div>
              <dt>{t("approvals.drawer.version")}</dt>
              <dd>{ver ? `v${ver}` : "—"}</dd>
            </div>
            <div>
              <dt>{t("approvals.drawer.step")}</dt>
              <dd>{at ? t("approvals.card.step", { n: at.index + 1, total: at.total, name: stepName }) : d.status === "approved" ? t("approvals.drawer.allApproved") : "—"}</dd>
            </div>
          </dl>

          {cur?.summary ? (
            <p className="stu-apd__sum">
              <IconInfo aria-hidden />
              <span>
                <b>{t("approvals.drawer.summary")}</b> {cur.summary}
              </span>
            </p>
          ) : null}

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-pl`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-pl`}>
                <IconDocLines aria-hidden />
                {t("approvals.drawer.content")}
              </span>
            </div>
            {empty ? (
              <p className="stu-apd__muted">{t("approvals.drawer.noPayload")}</p>
            ) : (
              <div className="stu-apd__preview">
                <Editor
                  code={d.code}
                  constructor={ctor}
                  payload={d.payload}
                  onChange={noop}
                  errors={{}}
                  readOnly
                  file={hasFile ? { hasFile, fileName, fileUrl: cur?.fileUrl || "", versionId: fileVersionId } : null}
                  onUploadFile={null}
                  title={d.title}
                />
              </div>
            )}
          </section>

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-f`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-f`}>
                <IconPaperclip aria-hidden />
                {t("approvals.drawer.file")}
              </span>
            </div>
            {hasFile ? (
              <div className="stu-apd__file">
                <span className="stu-apd__fico" aria-hidden>
                  <IconFileText />
                </span>
                <span className="stu-apd__fname">{fileName || t("approvals.drawer.fileUnnamed")}</span>
                <button type="button" className="btn btn--line btn--sm" onClick={download} disabled={fileBusy || !fileVersionId} data-ai-id="admin.studio.approvals.drawer.download" data-ai-type="button" data-ai-label={t("actions.download")}>
                  {fileBusy ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
                  {t("actions.download")}
                </button>
              </div>
            ) : (
              <p className="stu-apd__muted">{t("approvals.drawer.noFile")}</p>
            )}
          </section>

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-s`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-s`}>
                <IconShieldCheck aria-hidden />
                {t("approvals.drawer.steps")}
              </span>
            </div>
            {d.steps.length ? (
              <ol className="stu-aps">
                {d.steps.map((s, i) => {
                  const ok = stepDone(s);
                  const back = stepBack(s);
                  const now = !ok && !back && at?.index === i;
                  const cls = ok ? " is-done" : back ? " is-back" : now ? " is-cur" : "";
                  return (
                    <li key={s.id} className={`stu-aps__i${cls}`}>
                      <span className="stu-aps__dot" aria-hidden>
                        {ok ? <IconCheck /> : back ? <IconRefresh /> : <span>{i + 1}</span>}
                      </span>
                      <div className="stu-aps__m">
                        <span className="stu-aps__top">
                          <b>{s.title || role(normRole(s.role)) || t("approvals.drawer.stepN", { n: i + 1 })}</b>
                          {s.role && s.title ? <em>{role(normRole(s.role))}</em> : null}
                          <span className="stu-aps__st">{stepStatus(s.status)}</span>
                        </span>
                        {s.decidedBy || s.decidedAt ? <small>{[s.decidedBy, when(s.decidedAt)].filter(Boolean).join(" · ")}</small> : null}
                        {s.comment ? <q className="stu-aps__c">{s.comment}</q> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="stu-apd__muted">{free ? t("flow.direct") : t("approvals.drawer.noSteps")}</p>
            )}
          </section>

          <section className="rgl-drw__sec" aria-labelledby={`${uid}-c`}>
            <div className="rgl-drw__lbl">
              <span id={`${uid}-c`}>
                <IconChat aria-hidden />
                {t("approvals.drawer.comments")}
              </span>
            </div>
            <ApprovalComments objectId={d.id} pulse={pulse + own} canWrite={access.any} />
          </section>

          <div className="stu-apd__links">
            <Link href={`/admin/studio/o/${encodeURIComponent(d.id)}`} className="btn btn--line btn--sm" data-ai-id="admin.studio.approvals.drawer.open-editor" data-ai-type="link" data-ai-label={t("approvals.drawer.openEditor")}>
              {access.canEdit ? <IconEdit aria-hidden /> : <IconExternal aria-hidden />}
              {t("approvals.drawer.openEditor")}
            </Link>
            {access.isAdmin || access.canPublish ? (
              <button type="button" className="btn btn--line btn--sm" onClick={exportVersions} disabled={xlsBusy} data-ai-id="admin.studio.approvals.drawer.versions-xlsx" data-ai-type="button" data-ai-label={t("actions.exportVersions")}>
                {xlsBusy ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
                {t("actions.exportVersions")}
              </button>
            ) : null}
          </div>
        </div>

        <footer className="stu-apd__foot">{footer}</footer>
      </aside>
      <DecisionModal kind={decision} objectId={d.id} objectTitle={d.title} stepName={stepName} onClose={() => setDecision(null)} onDone={done} onStale={stale} />
    </>
  );
}
