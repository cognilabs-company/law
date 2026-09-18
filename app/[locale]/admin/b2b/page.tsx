"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  listB2bClients,
  createB2bClient,
  updateB2bClient,
  createB2bInvoice,
  createB2bContract,
  getB2bMonthlyReport,
  type B2bClient,
  type B2bDocument,
} from "@/lib/services/backend";
import { httpBlob, ApiError } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { useReload, AdminForm, Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import MonthPicker from "@/components/MonthPicker";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconBuilding, IconPlus, IconDownload, IconFileText, IconCard } from "@/components/icons";

const som = (n: number) => fmtUzs(n);
const STAGES = ["discovered", "contacted", "meeting", "diagnostics", "proposal", "negotiation", "contract", "active", "renewal", "lost"];
const VAT = 12;

// T1B-07 B2B minimal: company (name, STIR, director, contact), stage, and the
// three PDFs the backend renders — invoice (VAT shown separately), contract,
// monthly report. Files are fetched with the token and saved.
export default function AdminB2b() {
  const t = useTranslations("admin.b2b");
  const [key, reload] = useReload();
  const res = useResource(() => listB2bClients(), [key]);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<{ kind: "invoice" | "contract" | "report"; client: B2bClient } | null>(null);
  const stageOpts = STAGES.map((s) => ({ value: s, label: t.has(`stage.${s}`) ? t(`stage.${s}`) : s }));

  async function setStage(c: B2bClient, stage: string) {
    try { await updateB2bClient(c.id, { stage }); reload(); } catch { /* ignore */ }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{res.data.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}><IconPlus />{t("add")}</button>
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <Modal open={open} onClose={() => setOpen(false)} title={t("add")}>
        <AdminForm
          fields={[
            { name: "name", label: t("cName"), required: true },
            { name: "inn", label: t("cInn"), placeholder: "123456789" },
            { name: "director", label: t("cDirector") },
            { name: "industry", label: t("cIndustry") },
            { name: "contact", label: t("cContact"), placeholder: "+998 __ ___ __ __" },
            { name: "monthly_payment", label: t("cMonthly"), type: "number", placeholder: "0" },
            { name: "sla", label: t("cSla"), placeholder: t("cSlaPh") },
          ]}
          onSubmit={async (v) => {
            const c = await createB2bClient({ name: String(v.name), industry: String(v.industry), contact: String(v.contact), inn: String(v.inn) });
            // Director / monthly payment / SLA are stored through the update endpoint.
            const patch: Record<string, unknown> = {};
            if (String(v.director).trim()) patch.director = String(v.director).trim();
            if (String(v.monthly_payment).trim()) patch.monthly_payment = parseInt(String(v.monthly_payment), 10) || 0;
            if (String(v.sla).trim()) patch.sla = String(v.sla).trim();
            if (Object.keys(patch).length) await updateB2bClient(c.id, patch);
          }}
          submitLabel={t("save")}
          busyLabel={t("saving")}
          okMsg={t("created")}
          errMsg={t("error")}
          onDone={() => { reload(); setOpen(false); }}
        />
      </Modal>
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconBuilding />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((c) => (
            <div className="aitem" key={c.id}>
              <span className="aitem__n"><IconBuilding /></span>
              <div className="aitem__m">
                <b>{c.name || "—"}</b>
                <span className="aitem__meta">{[c.industry, c.contact].filter(Boolean).join(" · ")}</span>
                <div className="aitem__tags" style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setDoc({ kind: "invoice", client: c })}><IconCard />{t("invoice")}</button>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setDoc({ kind: "contract", client: c })}><IconFileText />{t("contract")}</button>
                  <button type="button" className="btn btn--line btn--sm" onClick={() => setDoc({ kind: "report", client: c })}><IconDownload />{t("report")}</button>
                </div>
              </div>
              <div className="aitem__r" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {c.value ? <b className="b2b__val">{som(c.value)}</b> : null}
                <Select value={STAGES.includes(c.stage) ? c.stage : "discovered"} onChange={(v) => setStage(c, v)} options={stageOpts} ariaLabel={t("stageLabel")} />
              </div>
            </div>
          ))}
        </div>
      )}
      <DocModal target={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function DocModal({ target, onClose }: { target: { kind: "invoice" | "contract" | "report"; client: B2bClient } | null; onClose: () => void }) {
  const t = useTranslations("admin.b2b");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [out, setOut] = useState<B2bDocument | null>(null);
  const base = parseInt(amount.replace(/\D/g, "") || "0", 10) || 0;
  const vat = Math.round((base * VAT) / 100);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = target.kind === "invoice"
        ? await createB2bInvoice(target.client.id, { amountWithoutVat: base, vatPercent: VAT, description: desc.trim() || undefined })
        : target.kind === "contract"
          ? await createB2bContract(target.client.id, {})
          : await getB2bMonthlyReport(target.client.id, month);
      setOut(r);
      setNote({ ok: true, msg: t("docReady") });
    } catch (err) {
      setNote({ ok: false, msg: err instanceof ApiError && err.status === 403 ? t("forbidden") : err instanceof ApiError && err.detail ? err.detail : t("error") });
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!out?.fileUrl) return;
    try { saveBlob(await httpBlob(out.fileUrl), `${target?.kind ?? "b2b"}-${target?.client.name ?? ""}.pdf`); }
    catch { setNote({ ok: false, msg: t("downloadError") }); }
  }
  const title = target ? `${t(target.kind)} — ${target.client.name}` : "";

  return (
    <Modal open={!!target} onClose={() => { setOut(null); setNote(null); onClose(); }} title={title}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={run}>
        {target?.kind === "invoice" ? (
          <>
            <div><label>{t("amountNoVat")}</label><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="1000000" required /></div>
            <div><label>{t("description")}</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("descriptionPh")} /></div>
            <div className="opay__rows">
              <div className="opay__row"><span>{t("amountNoVat")}</span><b>{som(base)} {t("som")}</b></div>
              <div className="opay__row"><span>{t("vat", { pct: VAT })}</span><b>{som(vat)} {t("som")}</b></div>
              <div className="opay__row"><span>{t("total")}</span><b>{som(base + vat)} {t("som")}</b></div>
            </div>
          </>
        ) : target?.kind === "report" ? (
          <div><label>{t("month")}</label><MonthPicker value={month} onChange={setMonth} placeholder={t("month")} ariaLabel={t("month")} /></div>
        ) : (
          <p className="advmuted">{t("contractLead")}</p>
        )}
        {out ? (
          <div className="rf__benefit">
            <b>{t("docReady")}</b>
            {out.total ? <p>{t("total")}: {som(out.total)} {t("som")}{out.vatAmount ? ` (${t("vat", { pct: out.vatPercent || VAT })}: ${som(out.vatAmount)})` : ""}</p> : null}
            {out.taskCount != null ? <p>{t("reportTasks", { n: out.taskCount })}</p> : null}
            <button type="button" className="btn btn--pri btn--sm" onClick={download} style={{ marginTop: 6 }}><IconDownload />{t("download")}</button>
          </div>
        ) : null}
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy || (target?.kind === "invoice" && !base)}>{busy ? t("generating") : t("generate")}</button>
      </form>
    </Modal>
  );
}
