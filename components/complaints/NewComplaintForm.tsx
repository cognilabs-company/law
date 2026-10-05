"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { contactBlockedOf } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { humanize } from "@/lib/labels";
import {
  COMPLAINT_CATEGORIES,
  DESC_MAX,
  DESC_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  fileComplaint,
  findWorkRef,
  workRefValue,
  type ComplaintItem,
  type WorkRef,
} from "@/lib/services/complaints";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { IconRefresh } from "@/components/icons";

export type ComplaintDraft = { category: string; subject: string; description: string; related: string };
export type WorksState = { status: "loading" | "ready" | "error"; items: WorkRef[] };

export function emptyDraft(related = ""): ComplaintDraft {
  return { category: COMPLAINT_CATEGORIES[0], subject: "", description: "", related };
}

type Problems = { subject?: "required" | "short"; description?: "required" | "short" };

function check(d: ComplaintDraft): Problems {
  const out: Problems = {};
  const subject = d.subject.trim();
  const description = d.description.trim();
  if (!subject) out.subject = "required";
  else if (subject.length < SUBJECT_MIN) out.subject = "short";
  if (!description) out.description = "required";
  else if (description.length < DESC_MIN) out.description = "short";
  return out;
}

export default function NewComplaintForm({
  draft,
  onDraft,
  works,
  onRetryWorks,
  onCancel,
  onCreated,
}: {
  draft: ComplaintDraft;
  onDraft: (next: (cur: ComplaintDraft) => ComplaintDraft) => void;
  works: WorksState;
  onRetryWorks: () => void;
  onCancel: () => void;
  onCreated: (item: ComplaintItem) => void;
}) {
  const t = useTranslations("portal.client.complaints");
  const tw = useTranslations("portal.client.works");
  const tc = useTranslations("common");
  const uid = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const ids = {
    cat: `${uid}-cat`,
    subject: `${uid}-subject`,
    subjectErr: `${uid}-subject-err`,
    desc: `${uid}-desc`,
    descErr: `${uid}-desc-err`,
    descCount: `${uid}-desc-count`,
  };
  const problems = tried ? check(draft) : {};
  const subjectMsg =
    problems.subject === "required" ? t("v.subject") : problems.subject === "short" ? t("v.subjectShort", { min: SUBJECT_MIN }) : "";
  const descMsg =
    problems.description === "required" ? t("descRequired") : problems.description === "short" ? t("v.descShort", { min: DESC_MIN }) : "";
  const target = works.status === "ready" ? findWorkRef(works.items, draft.related) : null;
  const blocked = err ? contactBlockedOf(err) : null;
  const serverMsg = err && !blocked ? errorText(err, tc) : "";
  const workType = (type: string) => (type && tw.has(`type.${type}`) ? tw(`type.${type}`) : humanize(type));
  const set = (patch: Partial<ComplaintDraft>) => onDraft((cur) => ({ ...cur, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    const found = check(draft);
    if (found.subject) {
      subjectRef.current?.focus();
      return;
    }
    if (found.description) {
      descRef.current?.focus();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const created = await fileComplaint({
        category: draft.category,
        subject: draft.subject.trim(),
        description: draft.description.trim(),
        relatedRef: target ? workRefValue(target) : "",
      });
      onCreated(created);
    } catch (failure) {
      setErr(failure);
      setBusy(false);
    }
  }

  return (
    <form className="cform shkf" noValidate onSubmit={submit} aria-busy={busy || undefined}>
      <p className="shkf__lead">{t("form.lead")}</p>

      <fieldset className="shkf__set">
        <legend className="shkf__lbl">{t("catLabel")}</legend>
        <div className="shkf__chips">
          {COMPLAINT_CATEGORIES.map((c) => (
            <label key={c} className={`chip shkf__chip${draft.category === c ? " on" : ""}`}>
              <input type="radio" name={ids.cat} value={c} checked={draft.category === c} onChange={() => set({ category: c })} />
              {t(`categories.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={ids.subject}>{t("subject")}</label>
        <input
          id={ids.subject}
          ref={subjectRef}
          value={draft.subject}
          maxLength={SUBJECT_MAX}
          autoComplete="off"
          placeholder={t("subjectPh")}
          onChange={(e) => set({ subject: e.target.value })}
          aria-invalid={subjectMsg ? true : undefined}
          aria-describedby={subjectMsg ? ids.subjectErr : undefined}
        />
        {subjectMsg ? (
          <p id={ids.subjectErr} className="shkf__err">
            {subjectMsg}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={ids.desc}>{t("desc")}</label>
        <textarea
          id={ids.desc}
          ref={descRef}
          rows={5}
          value={draft.description}
          maxLength={DESC_MAX}
          placeholder={t("descPh")}
          onChange={(e) => set({ description: e.target.value })}
          aria-invalid={descMsg ? true : undefined}
          aria-describedby={descMsg ? `${ids.descErr} ${ids.descCount}` : ids.descCount}
        />
        <div className="shkf__under">
          {descMsg ? (
            <p id={ids.descErr} className="shkf__err">
              {descMsg}
            </p>
          ) : (
            <span />
          )}
          <small id={ids.descCount} className="shkf__count">
            {t("form.counter", { n: draft.description.length, max: DESC_MAX })}
          </small>
        </div>
      </div>

      {works.status === "ready" && !works.items.length ? null : (
        <div>
          <span className="shkf__lbl">
            {t("form.related")} <span className="shkf__opt">{t("form.optional")}</span>
          </span>
          {works.status === "loading" ? (
            <p className="shkf__muted" role="status">
              {t("form.relatedLoading")}
            </p>
          ) : works.status === "error" ? (
            <p className="shkf__muted">
              {t("form.relatedError")}{" "}
              <button type="button" className="shkf__retry" onClick={onRetryWorks}>
                <IconRefresh aria-hidden />
                {tc("retry")}
              </button>
            </p>
          ) : (
            <Select
              value={target ? workRefValue(target) : ""}
              onChange={(v) => set({ related: v })}
              ariaLabel={t("form.related")}
              options={[
                { value: "", label: t("form.relatedNone") },
                ...works.items.map((w) => ({
                  value: workRefValue(w),
                  label: [w.title || workType(w.type), w.workId].filter(Boolean).join(" · "),
                })),
              ]}
            />
          )}
        </div>
      )}

      {blocked ? <ContactBlockedNote error={err} /> : null}
      {serverMsg ? (
        <div role="alert">
          <Notice ok={false} msg={serverMsg} />
        </div>
      ) : null}

      <div className="shkf__acts">
        <button type="button" className="btn btn--line" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn--grad" disabled={busy}>
          {busy ? t("sending") : t("submit")}
        </button>
      </div>
    </form>
  );
}
