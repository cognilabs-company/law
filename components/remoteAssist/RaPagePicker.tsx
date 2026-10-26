"use client";

import { useMemo, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconArrowRight, IconSearch, IconTarget } from "@/components/icons";
import { matchesSearch } from "@/lib/searchText";
import { raKey } from "@/lib/services/remoteAssist";
import { RA_GROUPS, RA_NAV_TARGETS } from "@/lib/remoteAssist/registry";

// Every page the operator can open for the client, grouped by section with
// its real title, searchable, and where the client is right now on top.
// Opening still goes through route.navigate and the client's registry.

export function RaPagePicker({ currentPageId, currentRoute, disabled, busyRoute, onOpen }: { currentPageId: string; currentRoute: string; disabled: boolean; busyRoute: string; onOpen: (route: string) => void }): ReactElement {
  const t = useTranslations("remoteAssist");
  const [q, setQ] = useState("");
  const title = (pageId: string) => (t.has(`pages.${raKey(pageId)}`) ? t(`pages.${raKey(pageId)}`) : pageId);

  const groups = useMemo(() => {
    const needle = q.trim();
    return RA_GROUPS.map((g) => ({
      g,
      items: RA_NAV_TARGETS.filter((p) => p.group === g && (!needle || matchesSearch(`${title(p.pageId)} ${p.route}`, needle))),
    })).filter((x) => x.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t]);

  return (
    <div className="ra-pages">
      <div className="ra-pages__now" role="status">
        <IconTarget aria-hidden="true" />
        <span>
          <small>{t("op.clientIsOn")}</small>
          <b>{currentPageId ? title(currentPageId) : t("op.unknownPage")}</b>
          {currentRoute ? <code>{currentRoute}</code> : null}
        </span>
      </div>
      <label className="ra-search">
        <IconSearch aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("op.pageSearch")} aria-label={t("op.pageSearch")} />
      </label>
      {groups.map(({ g, items }) => (
        <section key={g} className="ra-pages__group" aria-label={t(`groups.${g}`)}>
          <h4>{t(`groups.${g}`)}</h4>
          <ul>
            {items.map((p) => {
              const here = p.pageId === currentPageId;
              return (
                <li key={p.pageId}>
                  <button type="button" className="ra-page-btn" data-here={here || undefined} disabled={disabled || here || busyRoute === p.route} onClick={() => onOpen(p.route)} aria-label={t("op.openPage", { page: title(p.pageId) })}>
                    <span>
                      <b>{title(p.pageId)}</b>
                      <small>{p.route}</small>
                    </span>
                    {here ? <em>{t("op.here")}</em> : <IconArrowRight aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!groups.length ? <p className="ra-empty">{t("op.noMatch")}</p> : null}
    </div>
  );
}
