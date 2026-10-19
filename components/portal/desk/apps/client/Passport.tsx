"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServicePassport, type ServicePassport } from "@/lib/services/backend";
import { usePassportBlocks } from "@/components/portal/ServicePassport";
import { IconChevronRight, IconDocLines } from "@/components/icons";
import { Spinner } from "../../kit/kit";

// A catalog service's passport as a disclosure group (the Mac's disclosure
// triangle, Windows' expander), loaded when first opened.
export default function Passport({ serviceId, open: startOpen = false }: { serviceId: string; open?: boolean }) {
  const t = useTranslations("portal.passport");
  const locale = useLocale();
  const [open, setOpen] = useState(startOpen);
  const [state, setState] = useState<{ id: string; p: ServicePassport | null } | null>(null);
  const loaded = state?.id === serviceId ? state : null;
  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    getServicePassport(serviceId, locale)
      .then((r) => alive && setState({ id: serviceId, p: r.passport }))
      .catch(() => alive && setState({ id: serviceId, p: null }));
    return () => {
      alive = false;
    };
  }, [open, loaded, serviceId, locale]);
  return (
    <section className={`dxcg-pass${open ? " is-open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconChevronRight aria-hidden />
        {t("title")}
      </button>
      {open ? !loaded ? <Spinner small /> : loaded.p ? <Blocks p={loaded.p} /> : <p className="dxcs-lead">{t("loadError")}</p> : null}
    </section>
  );
}

function Blocks({ p }: { p: ServicePassport }) {
  const t = useTranslations("portal.passport");
  const blocks = usePassportBlocks(p).map((b) => ({ ...b, rows: b.rows.filter(([, v]) => v) })).filter((b) => b.rows.length);
  return (
    <div className="dxcg-pass__body">
      {blocks.map((b) => (
        <div key={b.title}>
          <h4>{b.title}</h4>
          <dl>
            {b.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div>
        <h4>{t("documents")}</h4>
        {p.requiredDocuments.length ? (
          <ul>
            {p.requiredDocuments.map((d, i) => (
              <li key={i}>
                <IconDocLines aria-hidden /> {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dxcs-lead">{t("noDocuments")}</p>
        )}
      </div>
    </div>
  );
}
