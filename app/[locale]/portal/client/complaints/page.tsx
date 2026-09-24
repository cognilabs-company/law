"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { listComplaints, createComplaint } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useReload, Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconAlert, IconPlus } from "@/components/icons";
import { dateOnly } from "@/lib/date";

const CATS = ["service", "lawyer", "payment", "quality", "other"];

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
}

export default function ClientComplaints() {
  const t = useTranslations("portal.client.complaints");
  const locale = useLocale();
  const [key, reload] = useReload();
  const res = useResource(() => listComplaints(), [key]);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("service");
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !subject.trim() || !desc.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await createComplaint({ category: cat, subject: subject.trim(), description: desc.trim() });
      setNote({ ok: true, msg: t("sent") });
      setSubject("");
      setDesc("");
      reload();
      setTimeout(() => setOpen(false), 900);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  const catOpts = CATS.map((c) => ({ value: c, label: t(`cat.${c}`) }));

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}>
          <IconPlus />
          {t("new")}
        </button>
      </div>
      <p className="ppanel__note">{t("lead")}</p>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconAlert />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((c) => (
            <div className="creq" key={c.id}>
              <span className="creq__st" />
              <div className="creq__m">
                <b>{c.subject || (t.has(`cat.${c.category}`) ? t(`cat.${c.category}`) : c.category)}</b>
                <span>{[t.has(`cat.${c.category}`) ? t(`cat.${c.category}`) : c.category, fmt(c.createdAt, locale)].filter(Boolean).join(" · ")}</span>
              </div>
              <span className="creq__badge">{t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status}</span>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("new")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
          <div>
            <label>{t("catLabel")}</label>
            <Select value={cat} onChange={setCat} options={catOpts} ariaLabel={t("catLabel")} />
          </div>
          <div>
            <label>{t("subject")}</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("subjectPh")} />
          </div>
          <div>
            <label>{t("desc")}</label>
            <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("descPh")} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("sending") : t("submit")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
