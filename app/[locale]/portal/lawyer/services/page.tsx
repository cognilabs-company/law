"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getMyServices, putMyServices } from "@/lib/services/backend";
import ServiceSelector from "@/components/register/ServiceSelector";
import { firstFieldError, priceRangeOf } from "@/lib/formErrors";
import { fmtUzs } from "@/lib/money";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck } from "@/components/icons";

export default function LawyerServices() {
  const t = useTranslations("portal.lawyer.services");
  const [sel, setSel] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getMyServices()
      .then((s) => setSel(s))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await putMyServices(sel);
      setNote({ ok: true, msg: t("saved") });
    } catch (e) {
      // 422: the backend says which price is out of range, or which field is invalid.
      const range = priceRangeOf(e);
      const field = firstFieldError(e);
      setNote({
        ok: false,
        msg: range
          ? t("priceOutOfRange", { min: fmtUzs(range.min), max: fmtUzs(range.max) })
          : field
            ? t("invalidField", { detail: field })
            : t("error"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{sel.length}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <ServiceSelector value={sel} onChange={setSel} excludeAdvokatRequired />
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri btn--full" type="button" onClick={save} disabled={busy || !loaded} style={{ marginTop: 14 }}>
        {busy ? t("saving") : t("save")}
        {busy ? null : <IconCheck />}
      </button>
    </div>
  );
}
