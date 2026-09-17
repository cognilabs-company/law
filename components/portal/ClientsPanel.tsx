"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { getLawyerClients, createLawyerClient, checkConflict, type ConflictResult } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { initials } from "@/lib/lawyers";
import { IconUsers, IconAlert, IconPlus, IconShieldCheck, IconCheck } from "@/components/icons";

// Client roster + manual client base (T1B-05 §3) + conflict check (§1–2),
// shared by the advocate and lawyer portals.
export default function ClientsPanel({ ns }: { ns: string }) {
  const t = useTranslations(ns);
  const tc = useTranslations("portal.clientsTools");
  const [key, setKey] = useState(0);
  const res = useResource(getLawyerClients, [key]);
  const [open, setOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("title")}</b>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--soft btn--sm" type="button" onClick={() => setCheckOpen(true)}><IconShieldCheck />{tc("checkCta")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}><IconPlus />{tc("addCta")}</button>
          </span>
        </div>
        <p className="ppanel__note">{tc("lead")}</p>

        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !res.data.length ? (
          <EmptyState icon={<IconUsers />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="pclients">
            {res.data.map((c) => (
              <div className="pclient" key={c.id}>
                <span className="pclient__av">{initials(c.name || "?")}</span>
                <div className="pclient__m">
                  <b>{c.name || "—"}</b>
                  <span>
                    {[c.phone, t("casesCount", { n: c.casesCount }), c.ordersCount ? t("ordersCount", { n: c.ordersCount }) : tc("manual")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {c.hasConflict ? (
                    <em className="pclient__conflict">
                      <IconAlert />
                      {t("conflictAlert")}
                    </em>
                  ) : null}
                </div>
                {c.activeCaseIds.length ? (
                  <span className="pclient__badge pclient__badge--ok">{t("activeCases", { n: c.activeCaseIds.length })}</span>
                ) : null}
                {c.hasConflict ? <span className="pclient__badge pclient__badge--warn">{t("conflict")}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <NewClientModal open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setKey((k) => k + 1); }} />
      <ConflictModal open={checkOpen} onClose={() => setCheckOpen(false)} />
    </>
  );
}

const split = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

function NewClientModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const tc = useTranslations("portal.clientsTools");
  const [f, setF] = useState({ name: "", phone: "", pinfl: "", company: "", opponents: "", representatives: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || f.name.trim().length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      // The check runs first so a match is shown before the record is saved (§1).
      const c = await checkConflict({ phone: f.phone, pinfl: f.pinfl, opponent: f.opponents ? split(f.opponents)[0] : undefined, representatives: split(f.representatives) }).catch(() => null);
      setConflict(c);
      await createLawyerClient({ name: f.name.trim(), phone: f.phone.trim(), pinfl: f.pinfl.trim(), company: f.company.trim(), opponents: split(f.opponents), representatives: split(f.representatives), notes: f.notes.trim() });
      setNote({ ok: true, msg: tc("saved") });
      setF({ name: "", phone: "", pinfl: "", company: "", opponents: "", representatives: "", notes: "" });
      setTimeout(onSaved, c?.status === "potential_conflict" ? 2500 : 800);
    } catch {
      setNote({ ok: false, msg: tc("saveError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tc("addTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <p className="advmuted">{tc("addLead")}</p>
        <div className="cform__row2">
          <div><label>{tc("name")}</label><input value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} /></div>
          <div><label>{tc("phone")}</label><input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 __ ___ __ __" inputMode="tel" /></div>
        </div>
        <div className="cform__row2">
          <div><label>{tc("pinfl")}</label><input value={f.pinfl} onChange={(e) => set("pinfl", e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" placeholder="14 raqam" /></div>
          <div><label>{tc("company")}</label><input value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
        </div>
        <div><label>{tc("opponents")}</label><input value={f.opponents} onChange={(e) => set("opponents", e.target.value)} placeholder={tc("listPh")} /></div>
        <div><label>{tc("representatives")}</label><input value={f.representatives} onChange={(e) => set("representatives", e.target.value)} placeholder={tc("listPh")} /></div>
        <div><label>{tc("notes")}</label><textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        {conflict ? <ConflictView r={conflict} /> : null}
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy || f.name.trim().length < 2}>{busy ? tc("saving") : tc("save")}</button>
      </form>
    </Modal>
  );
}

function ConflictModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tc = useTranslations("portal.clientsTools");
  const [f, setF] = useState({ phone: "", pinfl: "", opponent: "", representatives: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<ConflictResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function run(e: FormEvent) {
    e.preventDefault();
    if (busy || !(f.phone || f.pinfl || f.opponent || f.representatives)) return;
    setBusy(true);
    setErr(null);
    try { setR(await checkConflict({ phone: f.phone, pinfl: f.pinfl, opponent: f.opponent, representatives: split(f.representatives) })); }
    catch { setErr(tc("checkError")); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={tc("checkTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={run}>
        <p className="advmuted">{tc("checkLead")}</p>
        <div className="cform__row2">
          <div><label>{tc("phone")}</label><input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></div>
          <div><label>{tc("pinfl")}</label><input value={f.pinfl} onChange={(e) => set("pinfl", e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" /></div>
        </div>
        <div><label>{tc("opponent")}</label><input value={f.opponent} onChange={(e) => set("opponent", e.target.value)} /></div>
        <div><label>{tc("representatives")}</label><input value={f.representatives} onChange={(e) => set("representatives", e.target.value)} placeholder={tc("listPh")} /></div>
        {r ? <ConflictView r={r} /> : null}
        {err ? <Notice ok={false} msg={err} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>{busy ? tc("checking") : tc("checkCta")}</button>
      </form>
    </Modal>
  );
}

export function ConflictView({ r }: { r: ConflictResult }) {
  const tc = useTranslations("portal.clientsTools");
  if (r.status === "clear") return <div className="anote anote--ok"><IconCheck style={{ width: 14, height: 14 }} /> {tc("clear")}</div>;
  return (
    <div className="anote anote--err">
      <b style={{ display: "flex", alignItems: "center", gap: 6 }}><IconAlert style={{ width: 14, height: 14 }} />{tc("potential")}</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: ".82rem" }}>
        {r.matches.slice(0, 8).map((m, i) => (
          <li key={i}>{m.title || m.caseNumber || "—"} — {tc.has(`reasons.${m.reason}`) ? tc(`reasons.${m.reason}`) : m.reason}</li>
        ))}
      </ul>
    </div>
  );
}
