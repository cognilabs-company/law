"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../../editor/sx-editor-panels.css";
import "./sx-review.css";
import { useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { downloadStudioVersionFile, exportStudioVersionsXlsx, isApprovalFree, studioErrorOf, useStudioRegistry, type StudioDetail } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../../Button";
import { StatusRail } from "../../StatusRail";
import { playStage, stageKeyOf, useStageText, type SxStageKey } from "../../stage/stage";
import { SxDrawer } from "../../layout/Drawer";
import { SxEmpty } from "../../layout/Empty";
import { SxNote } from "../../layout/Note";
import { useNow } from "../../live";
import { useStudioLabels } from "../../useStudioLabels";
import { ExternalLinkIcon, Undo2Icon, CircleCheckIcon, DownloadIcon, FileDownIcon, PaperclipIcon, PencilIcon, BanIcon, RocketIcon, glyph } from "../../icons";
import { reviewNoteOf } from "../../editor/model";
import { schemaFieldAt } from "../../schema/model";
import { REVIEW_STATUSES, sentAtOf, type ApprRow, type ApprViewer } from "../model";
import { stageAfter, toastKeyOf, type ReviewKind } from "./actions";
import { ActionDialog } from "./ActionDialog";
import { ChangeList, WarningNote } from "./ChangeList";
import { Comments } from "./Comments";
import { changedNames, payloadDiff } from "./diff";
import { StepList } from "./StepList";
import { Timeline } from "./Timeline";
import { useReview, type ReviewState } from "./useReview";

export type ReviewTarget = { id: string; row: ApprRow | null };
export type ReviewDrawerProps = { target: ReviewTarget | null; viewer: ApprViewer; onClose: () => void; onChanged: (id: string) => void };

const AI = "admin.studio.approvals.drawer";
const STEP_STATUSES: ReadonlySet<string> = new Set([...REVIEW_STATUSES, "changes_requested"]);
const DONE_STATUSES: ReadonlySet<string> = new Set(["approved", "published", "archived"]);
const APPROVE_WORD = /approv|done|complete|pass/;

type Armed = { from: string } | null;

export function approvedNames(d: StudioDetail | null): string[] {
  if (!d) return [];
  const out: string[] = [];
  const add = (n: string) => {
    const v = n.trim();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const s of d.steps) {
    const own = s.approvals.filter((a) => APPROVE_WORD.test(a.decision));
    if (own.length) own.forEach((a) => add(a.name));
    else if (APPROVE_WORD.test(s.status) && s.decidedBy) add(s.decidedBy);
  }
  return out;
}

function Block({ id, title, children, ai }: { id: string; title: string; children: ReactNode; ai?: string }): ReactElement {
  return (
    <section className="sx-rv-sec" aria-labelledby={id} data-ai-id={ai} data-ai-type={ai ? "section" : undefined} data-ai-label={ai ? title : undefined}>
      <h3 className="sx-rv-h" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function NextLine({ st }: { st: ReviewState }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  const { row, detail } = st;
  if (!row || !detail) return null;
  const status = detail.status;
  const next = row.next;
  const who =
    next.kind === "people"
      ? labels.list(next.names, 3)
      : next.kind === "role"
        ? labels.role(next.role)
        : next.kind === "author"
          ? next.names[0] || t("sx.appr.next.authorAny")
          : "";
  const names = DONE_STATUSES.has(status) ? approvedNames(detail) : [];
  const done = DONE_STATUSES.has(status) ? [t("sx.appr.dw.next.done"), names.length ? t("sx.appr.dw.next.approvedBy", { names: labels.list(names, 3) }) : ""].filter(Boolean).join(". ") : "";
  const sentAt = sentAtOf(detail);
  const ago = sentAt ? (now ? labels.ago(sentAt, now) : labels.date(sentAt)) : "";
  return (
    <div className="sx-rv-who">
      {next.kind === "you" ? <p className="sx-rv-next" data-you="">{t("sx.appr.dw.next.you")}</p> : who ? <p className="sx-rv-next">{t("sx.appr.dw.next.who", { who })}</p> : null}
      {done ? <p className={next.kind === "none" ? "sx-rv-next" : "sx-rv-sent"}>{done}</p> : null}
      {ago ? (
        <p className="sx-rv-sent">
          <time dateTime={sentAt} title={labels.dateTime(sentAt)}>
            {row.by ? t("sx.appr.dw.sent", { name: row.by, ago }) : t("sx.appr.dw.sentAt", { ago })}
          </time>
        </p>
      ) : null}
    </div>
  );
}

function ReviewPanel({ target, viewer, onClose, onChanged }: { target: ReviewTarget; viewer: ApprViewer; onClose: () => void; onChanged: (id: string) => void }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const uid = useId();
  const st = useReview(target, viewer);
  const stageText = useStageText();
  const [dialog, setDialog] = useState<ReviewKind | null>(null);
  const [running, setRunning] = useState(false);
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState("");
  const [armed, setArmed] = useState<Armed>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const { detail, row, model } = st;
  const id = target.id;
  const code = detail?.code ?? row?.code ?? "";
  const status = detail?.status ?? "";
  const regCtor = reg.items.find((c) => c.code === code) ?? null;

  if (armed && status && status !== "published" && status !== armed.from) setArmed(null);

  const skip = useMemo(
    () =>
      (top: string): boolean => {
        const f = model ? schemaFieldAt(model.ctor.typed, top) : null;
        return !!f && (f.hidden || f.generated);
      },
    [model],
  );
  const entries = useMemo(() => (detail ? payloadDiff(st.before, st.after, skip) : []), [detail, st.before, st.after, skip]);
  const changed = useMemo(() => changedNames(entries, { model, code, labels, t, root: st.after, refName: (_s, v) => labels.unknownRef(v) }), [entries, model, code, labels, t, st.after]);

  const title = row?.title || detail?.title || t("sx.ui.untitled");
  const version = detail?.currentVersion || row?.version || "";
  const description = code ? [labels.ctorName(code), version ? t("sx.editor.versionTag", { v: version }) : ""].filter(Boolean).join(" · ") : undefined;
  const can = st.can;
  const ids = { state: `${uid}-st`, note: `${uid}-nt`, ch: `${uid}-ch`, steps: `${uid}-sp`, cmt: `${uid}-cm`, file: `${uid}-fl`, tl: `${uid}-tl` };

  async function onDone(kind: ReviewKind, after: StudioDetail | null, origin: DOMRect | null) {
    const from = stageKeyOf(status);
    const play = (to: SxStageKey) => playStage({ to, from, steps: kind === "approve" && to === "published" ? ["approved", "published"] : undefined, origin, ...stageText(to) });
    const early = kind !== "approve" || !!after?.status;
    if (early) play(stageAfter(kind, after?.status ?? ""));
    setDialog(null);
    setSettling(true);
    if (kind === "approve" || kind === "publish") setArmed({ from: status });
    const fresh = await st.refresh();
    const statusAfter = (fresh ?? after)?.status ?? "";
    if (statusAfter !== "published") setArmed(null);
    setSettling(false);
    onChanged(id);
    const msg = t(toastKeyOf(kind, statusAfter));
    setResult(msg);
    requestAnimationFrame(() => resultRef.current?.focus());
    if (!early) play(stageAfter(kind, statusAfter));
  }

  async function download() {
    if (!detail || fileBusy) return;
    const vid = st.current?.id || detail.currentVersionId;
    setFileBusy(true);
    try {
      await downloadStudioVersionFile(vid, st.current?.fileName || "");
    } catch (e) {
      logApiError("studio.sx.approvals.download", e);
      notify.error(t("sx.appr.dw.downloadFail"));
    } finally {
      setFileBusy(false);
    }
  }

  async function exportXlsx() {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      await exportStudioVersionsXlsx(id, title);
      notify.success(t("sx.appr.dw.exportOk"));
    } catch (e) {
      logApiError("studio.sx.approvals.versions-xlsx", e);
      notify.error(t("sx.editor.versions.exportFail"));
    } finally {
      setXlsxBusy(false);
    }
  }

  const acts: ReactElement[] = [];
  if (can.approve) {
    acts.push(
      <SxButton key="reject" variant="ghost" className="sx-rv-reject" icon={BanIcon} onClick={() => setDialog("reject")} aria-haspopup="dialog" aiId={`${AI}.reject`}>
        {t("sx.appr.act.reject")}
      </SxButton>,
      <SxButton key="return" variant="secondary" icon={Undo2Icon} onClick={() => setDialog("return")} aria-haspopup="dialog" aiId={`${AI}.changes`}>
        {t("sx.appr.act.return")}
      </SxButton>,
      <SxButton key="approve" variant="primary" icon={CircleCheckIcon} onClick={() => setDialog("approve")} aria-haspopup="dialog" aiId={`${AI}.approve`}>
        {t("sx.appr.act.approve")}
      </SxButton>,
    );
  } else if (can.publish) {
    acts.push(
      <SxButton key="publish" variant="primary" icon={RocketIcon} onClick={() => setDialog("publish")} aria-haspopup="dialog" aiId={`${AI}.publish`}>
        {t("sx.appr.act.publish")}
      </SxButton>,
    );
  } else if (can.fix) {
    acts.push(
      <SxLinkButton key="fix" variant="primary" icon={PencilIcon} href={`/admin/studio/o/${encodeURIComponent(id)}`} aiId={`${AI}.fix`}>
        {t("sx.appr.dw.fix")}
      </SxLinkButton>,
    );
  }
  const footer = acts.length ? (
    <div className="sx-rv-acts">
      {acts}
    </div>
  ) : undefined;

  const err = st.error;
  const errInfo = err ? studioErrorOf(err) : null;
  const notFound = !!errInfo && (errInfo.kind === "not_found" || errInfo.status === 404);
  const note = detail ? (status === "changes_requested" ? reviewNoteOf(detail, st.comments.items) : null) : null;
  const summary = detail && status !== "changes_requested" ? st.current?.summary || "" : "";
  const quote = note?.text ? { cap: t("sx.appr.dw.reviewNote"), text: note.text, by: note.by } : summary ? { cap: t("sx.appr.dw.note"), text: summary, by: "" } : null;
  const retry = (
    <SxButton variant="ghost" size="sm" onClick={st.retry} aiId={`${AI}.retry`}>
      {t("sx.ui.retry")}
    </SxButton>
  );

  let body: ReactNode;
  if (!detail && !row && notFound) body = <SxEmpty compact title={t("sx.editor.err.notFound")} />;
  else if (!detail && !row && err)
    body = (
      <SxNote tone="error" title={t("sx.ui.errorTitle")} action={retry}>
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  else if (!detail)
    body = (
      <div className="sx-rv-sk" aria-busy="true">
        <span className="sx-vh">{t("sx.ui.loading")}</span>
        <span className="sx-sk" data-h="rail" aria-hidden="true" />
        <span className="sx-sk" data-h="line" aria-hidden="true" />
        <span className="sx-sk" data-h="line" aria-hidden="true" />
        <span className="sx-sk" data-h="block" aria-hidden="true" />
      </div>
    );
  else
    body = (
      <>
        <section className="sx-rv-state" aria-labelledby={ids.state}>
          <h3 className="sx-vh" id={ids.state}>
            {t("sx.rail.label")}
          </h3>
          <StatusRail status={detail.statusRaw || detail.status} direct={isApprovalFree(code, regCtor)} celebrateOnPublish={!!armed} />
          <NextLine st={st} />
        </section>
        {err ? (
          <SxNote tone="error" title={t("sx.ui.errorTitle")} action={retry}>
            {t("sx.ui.loadFail")}
          </SxNote>
        ) : null}
        {result ? (
          <div className="sx-rv-result" tabIndex={-1} ref={resultRef}>
            <SxNote tone="success" role="status" id={`${uid}-res`}>
              {result}
            </SxNote>
          </div>
        ) : null}
        {quote ? (
          <figure className="sx-rv-quote">
            <figcaption>{quote.by ? `${quote.cap} · ${quote.by}` : quote.cap}</figcaption>
            <blockquote>
              <p>{quote.text}</p>
            </blockquote>
          </figure>
        ) : null}
        <WarningNote warnings={st.warnings} />
        <Block id={ids.ch} title={t("sx.appr.dw.changes")}>
          <ChangeList key={`${detail.currentVersionId}|${st.base}`} base={st.base} entries={entries} model={model} code={code} root={st.after} pending={!model} />
        </Block>
        {STEP_STATUSES.has(status) ? (
          <Block id={ids.steps} title={t("sx.appr.dw.steps")}>
            <StepList detail={detail} code={code} onChanged={() => void st.refresh().then(() => onChanged(id))} />
          </Block>
        ) : null}
        <Block id={ids.cmt} title={t("sx.appr.dw.comments")}>
          <Comments
            state={st.comments}
            canWrite={can.comment}
            versions={detail.versions}
            onRetry={st.reloadComments}
            onSend={async (text) => {
              const ok = await st.addComment(text);
              if (ok) onChanged(id);
              return ok;
            }}
          />
        </Block>
        <Block id={ids.tl} title={t("sx.ap3.tl.title")} ai={`${AI}.history`}>
          <Timeline history={st.history} versions={detail.versions} onRetry={st.retry} />
        </Block>
        {detail.hasFile ? (
          <Block id={ids.file} title={t("sx.appr.dw.file")}>
            <div className="sx-rv-file">
              {glyph(PaperclipIcon, { size: 16 })}
              <span className="sx-rv-file__n">{st.current?.fileName || t("sx.appr.dw.fileUnnamed")}</span>
              <SxButton variant="ghost" size="sm" icon={DownloadIcon} busy={fileBusy} onClick={() => void download()} aiId={`${AI}.download`}>
                {t("sx.appr.dw.download")}
              </SxButton>
            </div>
          </Block>
        ) : null}
        <div className="sx-rv-links">
          <SxLinkButton variant="ghost" size="sm" icon={ExternalLinkIcon} href={`/admin/studio/o/${encodeURIComponent(id)}`} aiId={`${AI}.open-editor`}>
            {t("sx.appr.dw.openEditor")}
          </SxLinkButton>
          {can.exportVersions ? (
            <SxButton variant="ghost" size="sm" icon={FileDownIcon} busy={xlsxBusy} onClick={() => void exportXlsx()} aiId={`${AI}.versions-xlsx`}>
              {t("sx.appr.dw.exportVersions")}
            </SxButton>
          ) : null}
        </div>
      </>
    );

  return (
    <>
      <SxDrawer open size="lg" title={title} description={description} busy={running || settling} aiId={AI} footer={footer} onClose={onClose}>
        <div className="sx-rv">{body}</div>
      </SxDrawer>
      {dialog ? (
        <ActionDialog
          key={dialog}
          kind={dialog}
          state={st}
          changed={changed}
          onClose={() => setDialog(null)}
          onDone={(k, after, origin) => void onDone(k, after, origin)}
          onStale={() => onChanged(id)}
          onRunning={setRunning}
        />
      ) : null}
    </>
  );
}

export function ReviewDrawer(props: ReviewDrawerProps): ReactElement | null {
  const { target, viewer, onClose, onChanged } = props;
  if (!target) return null;
  return <ReviewPanel key={target.id} target={target} viewer={viewer} onClose={onClose} onChanged={onChanged} />;
}
