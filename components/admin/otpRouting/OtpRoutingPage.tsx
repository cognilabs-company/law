"use client";

import "./otpRouting.css";
import "@/components/auth/otpMethod.css";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, ChevronLeft, ChevronRight, MessageSquareText, RefreshCw, Search, Send, ShieldAlert, type LucideIcon } from "lucide-react";
import { ApiError, errDetail, isForbidden, isOffline, logApiError } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { notify } from "@/lib/toast";
import type { OtpDeliveryMethod } from "@/lib/otpDelivery";
import {
  getOtpAccountDelivery,
  getOtpProviders,
  listOtpAccounts,
  otpRoutingErrorOf,
  providerUsable,
  setOtpAccountDelivery,
  type OtpAccount,
  type OtpAccountDelivery,
  type OtpAccountPage,
  type OtpProvider,
  type OtpProviderCatalog,
} from "@/lib/services/otpRouting";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import ScrollCue from "@/components/ui/ScrollCue";
import InlineAlert from "@/components/ui/InlineAlert";
import FieldError from "@/components/ui/FieldError";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import OtpMethodPicker, { useOtpMethodName } from "@/components/auth/OtpMethodPicker";

// Superadmin › Tizim › "OTP yetkazish"
// (LEXGO_FRONTEND_CENTRAL_OTP_DELIVERY_MANAGEMENT_2026_11_09.md §UI):
//   1. provider status cards,
//   2. a searchable, paginated account table,
//   3. channel and availability filters,
//   4. an account drawer with the current channel, recent deliveries and the
//      routing audit,
//   5. a change dialog — channel, language, a required reason and a plain
//      "no OTP will be sent now"; no OTP confirmation step, because this
//      change sends none (otp_sent: false),
//   6. after a change the drawer (and with it the audit) and the list are
//      read again.

const LIMIT = 20;
const REASON_MIN = 5;
const ICONS: Record<OtpDeliveryMethod, LucideIcon> = { telegram_bot: Bot, sms: MessageSquareText, telegram_gateway: Send };
type Availability = "" | "usable" | "unusable";
type ListLoad = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; page: OtpAccountPage };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function OtpRoutingPage() {
  const t = useTranslations("otpRouting");
  const locale = useLocale();
  const nameOf = useOtpMethodName();

  const [catalog, setCatalog] = useState<OtpProviderCatalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<unknown>(null);
  const [catalogKey, setCatalogKey] = useState(0);
  useEffect(() => {
    let alive = true;
    getOtpProviders()
      .then((c) => alive && (setCatalog(c), setCatalogErr(null)))
      .catch((e) => {
        if (!alive) return;
        logApiError("otp providers", e);
        setCatalogErr(e);
      });
    return () => {
      alive = false;
    };
  }, [catalogKey]);
  const providerOf = useCallback((m: OtpDeliveryMethod | "") => catalog?.items.find((p) => p.method === m), [catalog]);

  // Filters. The availability filter is the set of channels it leaves: one
  // channel goes to the backend as `method`, two are narrowed here.
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [method, setMethod] = useState<OtpDeliveryMethod | "">("");
  const [avail, setAvail] = useState<Availability>("");
  const [offset, setOffset] = useState(0);
  const allowed = useMemo(() => {
    const all = catalog?.items.map((p) => p.method) ?? [];
    if (!avail) return all;
    return all.filter((m) => (avail === "usable" ? providerUsable(providerOf(m)) : !providerUsable(providerOf(m))));
  }, [catalog, avail, providerOf]);
  const serverMethod: OtpDeliveryMethod | "" = method || (avail && allowed.length === 1 ? allowed[0] : "");
  const noMatch = !!avail && !method && allowed.length === 0;
  const methodBlocked = !!method && !!avail && !allowed.includes(method);

  const [list, setList] = useState<ListLoad>({ status: "loading" });
  const [listKey, setListKey] = useState(0);
  useEffect(() => {
    if (noMatch || methodBlocked) return;
    // A page already on screen stays while the next one loads.
    const ctrl = new AbortController();
    listOtpAccounts({ search: q, method: serverMethod, limit: LIMIT, offset }, ctrl.signal)
      .then((page) => setList({ status: "ready", page }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        logApiError("otp accounts", e);
        setList({ status: "error", error: e });
      });
    return () => ctrl.abort();
  }, [q, serverMethod, offset, listKey, noMatch, methodBlocked]);
  // A new search or filter starts from the first page.
  const resetPage = () => setOffset(0);

  const rows = useMemo(() => {
    if (list.status !== "ready") return [];
    const items = list.page.items;
    // Two allowed channels and no explicit one: narrowed on this page.
    return avail && !serverMethod ? items.filter((a) => a.selectedMethod && allowed.includes(a.selectedMethod)) : items;
  }, [list, avail, serverMethod, allowed]);

  const [openId, setOpenId] = useState("");
  const openRow = rows.find((r) => r.userId === openId);

  const langLabel = (l: string) => (l ? (t.has(`lang.${l}`) ? t(`lang.${l}`) : l) : "—");
  const sourceLabel = (s: string) => (s ? (t.has(`source.${s}`) ? t(`source.${s}`) : s.replace(/_/g, " ")) : "—");
  const changeLabel = (s: string) => (s ? (t.has(`changeSource.${s}`) ? t(`changeSource.${s}`) : s.replace(/_/g, " ")) : "—");
  const when = (iso: string) => (iso ? shortDateTime(iso, locale) : "—");

  if (isForbidden(catalogErr) || (list.status === "error" && isForbidden(list.error))) {
    return (
      <div className="ppanel otpr">
        <EmptyState icon={<ShieldAlert />} title={t("forbidden")} text={t("forbiddenText")} />
      </div>
    );
  }

  const total = list.status === "ready" ? list.page.total : 0;

  return (
    <div className="otpr" data-ai-target="otp-routing:page">
      <section className="ppanel otpr__head">
        <div className="ppanel__h">
          <b className="ppanel__t">{t("title")}</b>
          {list.status === "ready" ? <span className="advmuted">{t("total", { n: total })}</span> : null}
        </div>
        <p className="ppanel__note">{t("lead")}</p>

        <h2 className="otpr__h2">{t("providers.title")}</h2>
        {catalogErr && !catalog ? (
          <InlineAlert tone="error" compact action={{ label: t("retry"), onClick: () => setCatalogKey((k) => k + 1) }}>
            {t("providers.error")}
          </InlineAlert>
        ) : !catalog ? (
          <div className="otpr__provs">
            {[0, 1, 2].map((i) => <div key={i} className="otpd__skel otpr__provskel" />)}
          </div>
        ) : (
          <div className="otpr__provs">
            {catalog.items.map((p) => (
              <ProviderCard
                key={p.method}
                p={p}
                isDefault={p.isDefault || catalog.defaultMethod === p.method}
                active={method === p.method}
                onPick={() => {
                  setMethod((m) => (m === p.method ? "" : p.method));
                  resetPage();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="ppanel otpr__list" aria-labelledby="otpr-list-h">
        <h2 id="otpr-list-h" className="sr-only">{t("cols.account")}</h2>
        <div className="otpr__filters" role="search">
          <label className="otpr__search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder={t("filters.search")}
              aria-label={t("filters.search")}
            />
          </label>
          <div className="otpr__sel">
            <Select
              value={method}
              onChange={(v) => {
                setMethod(v as OtpDeliveryMethod | "");
                resetPage();
              }}
              ariaLabel={t("filters.method")}
              options={[
                { value: "", label: t("filters.allMethods") },
                ...(catalog?.items ?? []).map((p) => ({ value: p.method, label: nameOf(p.method), hint: providerUsable(p) ? undefined : t("providers.notConfigured") })),
              ]}
            />
          </div>
          <div className="otpr__sel">
            <Select
              value={avail}
              onChange={(v) => {
                setAvail(v as Availability);
                resetPage();
              }}
              ariaLabel={t("filters.availability")}
              options={[
                { value: "", label: t("filters.allAvailability") },
                { value: "usable", label: t("filters.usable") },
                { value: "unusable", label: t("filters.unusable") },
              ]}
            />
          </div>
          {search || method || avail ? (
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                setSearch("");
                setMethod("");
                setAvail("");
                resetPage();
              }}
            >
              {t("filters.clear")}
            </button>
          ) : null}
        </div>

        {noMatch || methodBlocked ? (
          <EmptyState icon={<ShieldAlert />} title={t("empty")} text={avail === "unusable" ? t("filters.noneUnusable") : t("emptyText")} />
        ) : list.status === "loading" ? (
          <Skeleton rows={6} />
        ) : list.status === "error" ? (
          <div className="otpr__fail">
            <EmptyState icon={<ShieldAlert />} title={t("error")} text={t("errorText")} />
            <button type="button" className="btn btn--line btn--sm" onClick={() => { setList({ status: "loading" }); setListKey((k) => k + 1); }}>
              <RefreshCw aria-hidden="true" />
              {t("retry")}
            </button>
          </div>
        ) : !rows.length ? (
          <EmptyState icon={<Search />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <ScrollCue className="otpr__tablewrap">
            <table className="otpr__table">
              <thead>
                <tr>
                  <th scope="col">{t("cols.account")}</th>
                  <th scope="col">{t("cols.phone")}</th>
                  <th scope="col">{t("cols.method")}</th>
                  <th scope="col">{t("cols.language")}</th>
                  <th scope="col">{t("cols.source")}</th>
                  <th scope="col">{t("cols.changedBy")}</th>
                  <th scope="col">{t("cols.changedAt")}</th>
                  <th scope="col"><span className="sr-only">{t("cols.open")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.userId} className="otpr__tr" onClick={() => setOpenId(a.userId)}>
                    <td data-l={t("cols.account")}>
                      <span className="otpr__who">
                        <b>{a.name || "—"}</b>
                        {a.lexgoId ? <small>{a.lexgoId}</small> : null}
                      </span>
                    </td>
                    <td data-l={t("cols.phone")} className="otpr__num">{a.phone || "—"}</td>
                    <td data-l={t("cols.method")}>
                      <MethodChip m={a.selectedMethod} usable={!a.selectedMethod || providerUsable(providerOf(a.selectedMethod)) || !catalog} />
                    </td>
                    <td data-l={t("cols.language")}>{langLabel(a.language)}</td>
                    <td data-l={t("cols.source")}>{sourceLabel(a.source)}</td>
                    <td data-l={t("cols.changedBy")}>{changeLabel(a.changeSource)}</td>
                    <td data-l={t("cols.changedAt")} className="otpr__num">{when(a.changedAt)}</td>
                    <td className="otpr__go">
                      <button
                        type="button"
                        className="otpr__open"
                        aria-label={`${t("cols.open")}: ${a.name || a.phone}`}
                        title={t("cols.open")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(a.userId);
                        }}
                      >
                        <span className="otpr__openl">{t("cols.open")}</span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollCue>
        )}

        {list.status === "ready" && !noMatch && !methodBlocked && (offset > 0 || list.page.hasMore) ? (
          <div className="otpr__pager">
            <span>{t("pager.range", { from: total ? offset + 1 : 0, to: Math.min(offset + list.page.items.length, total), total })}</span>
            <div>
              <button type="button" className="btn btn--line btn--sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>
                <ChevronLeft aria-hidden="true" />
                {t("pager.prev")}
              </button>
              <button type="button" className="btn btn--line btn--sm" disabled={!list.page.hasMore} onClick={() => setOffset((o) => o + LIMIT)}>
                {t("pager.next")}
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {openId ? (
        <AccountDrawer
          userId={openId}
          fallback={openRow}
          catalog={catalog}
          onClose={() => setOpenId("")}
          onChanged={() => setListKey((k) => k + 1)}
          labels={{ langLabel, sourceLabel, changeLabel, when }}
        />
      ) : null}
    </div>
  );
}

function ProviderCard({ p, isDefault, active, onPick }: { p: OtpProvider; isDefault: boolean; active: boolean; onPick: () => void }) {
  const t = useTranslations("otpRouting.providers");
  const nameOf = useOtpMethodName();
  const Icon = ICONS[p.method];
  const ok = providerUsable(p);
  return (
    <button type="button" className={`otpr__prov${active ? " is-on" : ""}`} data-ok={ok ? "" : undefined} onClick={onPick} aria-pressed={active} title={t("filter")}>
      <span className="otpm__ic" aria-hidden="true"><Icon /></span>
      <span className="otpr__provtx">
        <span className="otpr__provt">
          <b>{nameOf(p.method)}</b>
          {isDefault ? <em className="otpm__badge">{t("default")}</em> : null}
        </span>
        {p.title && p.title !== nameOf(p.method) ? <small>{p.title}</small> : null}
        <span className={`otpr__state${ok ? " is-ok" : " is-off"}`}>{ok ? t("available") : t("notConfigured")}</span>
        {p.requiresUserConfirmation ? <small className="otpr__note">{t("confirm")}</small> : null}
      </span>
    </button>
  );
}

function MethodChip({ m, usable }: { m: OtpDeliveryMethod | ""; usable: boolean }) {
  const t = useTranslations("otpRouting");
  const nameOf = useOtpMethodName();
  if (!m) return <span className="otpr__muted">—</span>;
  const Icon = ICONS[m];
  return (
    <span className={`otpr__chip${usable ? "" : " is-off"}`}>
      <Icon aria-hidden="true" />
      {nameOf(m)}
      {usable ? null : <em>{t("unusable")}</em>}
    </span>
  );
}

type Labels = { langLabel: (l: string) => string; sourceLabel: (s: string) => string; changeLabel: (s: string) => string; when: (iso: string) => string };

function AccountDrawer({
  userId,
  fallback,
  catalog,
  onClose,
  onChanged,
  labels,
}: {
  userId: string;
  fallback?: OtpAccount;
  catalog: OtpProviderCatalog | null;
  onClose: () => void;
  onChanged: () => void;
  labels: Labels;
}) {
  const t = useTranslations("otpRouting");
  const nameOf = useOtpMethodName();
  const [detail, setDetail] = useState<OtpAccountDelivery | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [key, setKey] = useState(0);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let alive = true;
    getOtpAccountDelivery(userId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setState("ready");
      })
      .catch((e) => {
        if (!alive) return;
        logApiError("otp account delivery", e);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [userId, key]);

  const acc = detail ?? fallback;
  const prov = acc?.selectedMethod ? catalog?.items.find((p) => p.method === acc.selectedMethod) : undefined;
  const unusable = !!catalog && !!acc?.selectedMethod && !providerUsable(prov);

  return (
    <Modal open onClose={onClose} title={t("drawer.title")} description={acc ? [acc.name, acc.phone, acc.lexgoId].filter(Boolean).join(" · ") : undefined} variant="drawer" size="md" aiId="otp-routing.drawer">
      <div className="otpr__drawer">
        {state === "error" && !acc ? (
          <InlineAlert tone="error" compact action={{ label: t("retry"), onClick: () => setKey((k) => k + 1) }}>
            {t("drawer.loadError")}
          </InlineAlert>
        ) : !acc ? (
          <Skeleton rows={4} />
        ) : (
          <>
            {state === "error" ? (
              <InlineAlert tone="warn" compact action={{ label: t("retry"), onClick: () => setKey((k) => k + 1) }}>
                {t("drawer.loadError")}
              </InlineAlert>
            ) : null}
            <section className="otpr__cur" aria-label={t("drawer.current")}>
              <div className="otpr__curh">
                <small>{t("drawer.current")}</small>
                <MethodChip m={acc.selectedMethod} usable={!unusable} />
              </div>
              <dl className="otpr__dl">
                <div><dt>{t("drawer.language")}</dt><dd>{labels.langLabel(acc.language)}</dd></div>
                <div><dt>{t("drawer.source")}</dt><dd>{labels.sourceLabel(acc.source)}</dd></div>
                <div><dt>{t("drawer.changeSource")}</dt><dd>{labels.changeLabel(acc.changeSource)}</dd></div>
                <div><dt>{t("drawer.changedAt")}</dt><dd>{labels.when(acc.changedAt)}</dd></div>
                <div><dt>{t("drawer.verifiedAt")}</dt><dd>{labels.when(acc.verifiedAt)}</dd></div>
                {acc.reason ? <div className="otpr__dlwide"><dt>{t("drawer.reason")}</dt><dd>{acc.reason}</dd></div> : null}
              </dl>
              {unusable ? <InlineAlert tone="warn" compact>{t("drawer.unusableWarn")}</InlineAlert> : null}
              <button type="button" className="btn btn--pri btn--sm" onClick={() => setChanging(true)} disabled={!catalog} data-ai-id="otp-routing.change">
                {t("drawer.change")}
              </button>
            </section>

            <section className="otpr__sec">
              <h3>{t("drawer.deliveries")}</h3>
              {state === "loading" ? (
                <Skeleton rows={2} />
              ) : !detail?.recentDeliveries.length ? (
                <p className="otpr__muted">{t("drawer.noDeliveries")}</p>
              ) : (
                <ol className="otpr__log">
                  {detail.recentDeliveries.map((r) => (
                    <li key={r.id}>
                      <span className="otpr__logh">
                        {r.method ? <MethodChip m={r.method} usable /> : <b>{r.provider || "—"}</b>}
                        <StatusChip s={r.status} />
                      </span>
                      <span className="otpr__logm">
                        {[r.phoneLast4 ? t("drawer.phoneEnd", { last4: r.phoneLast4 }) : "", r.purpose.replace(/_/g, " "), labels.when(r.at)].filter(Boolean).join(" · ")}
                      </span>
                      {r.error ? <small className="otpr__err">{r.error.replace(/_/g, " ")}</small> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="otpr__sec">
              <h3>{t("drawer.audit")}</h3>
              {state === "loading" ? (
                <Skeleton rows={2} />
              ) : !detail?.audit.length ? (
                <p className="otpr__muted">{t("drawer.noAudit")}</p>
              ) : (
                <ol className="otpr__log">
                  {detail.audit.map((c) => (
                    <li key={c.id}>
                      <span className="otpr__logh">
                        <b>{[c.from ? nameOf(c.from) : "", c.to ? nameOf(c.to) : ""].filter(Boolean).join(" → ") || "—"}</b>
                        <span className="otpr__muted">{labels.when(c.at)}</span>
                      </span>
                      <span className="otpr__logm">{[labels.changeLabel(c.changeSource), c.actor].filter((x) => x && x !== "—").join(" · ")}</span>
                      {c.reason ? <q className="otpr__reason">{c.reason}</q> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
      {changing && acc && catalog ? (
        <ChangeDialog
          account={acc}
          catalog={catalog}
          onClose={() => setChanging(false)}
          onDone={() => {
            setChanging(false);
            // Re-read the account (its audit with it) and the list row.
            setKey((k) => k + 1);
            onChanged();
          }}
        />
      ) : null}
    </Modal>
  );
}

function StatusChip({ s }: { s: string }) {
  const t = useTranslations("otpRouting.status");
  if (!s) return null;
  const k = s.toLowerCase();
  const tone = /fail|error|reject|expire/.test(k) ? "bad" : /deliver|sent|verif|success|ok/.test(k) ? "ok" : "wait";
  return <span className={`otpr__status otpr__status--${tone}`}>{t.has(k) ? t(k) : s.replace(/_/g, " ")}</span>;
}

function ChangeDialog({ account, catalog, onClose, onDone }: { account: OtpAccount; catalog: OtpProviderCatalog; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("otpRouting");
  const nameOf = useOtpMethodName();
  const uid = useId();
  // Only channels whose provider is configured can be chosen.
  const usable = catalog.items.filter(providerUsable).map((p) => p.method);
  const [method, setMethod] = useState<OtpDeliveryMethod | "">(() => (account.selectedMethod && usable.includes(account.selectedMethod) ? account.selectedMethod : usable[0] ?? ""));
  const [language, setLanguage] = useState(() => (account.language && catalog.languages.includes(account.language) ? account.language : catalog.languages.includes("uz_latn") ? "uz_latn" : catalog.languages[0] ?? "uz_latn"));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const same = method === account.selectedMethod && language === account.language;

  async function save() {
    if (busy || !method) return;
    if (reason.trim().length < REASON_MIN) {
      setReasonErr(t("dialog.reasonRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await setOtpAccountDelivery(account.userId, { method, language, reason });
      notify.success(t("dialog.success", { method: nameOf(method) }), { id: "otp-routing" });
      onDone();
    } catch (e) {
      const code = otpRoutingErrorOf(e instanceof ApiError ? e.code : undefined);
      setErr(code ? t(`errors.${code}`) : isOffline(e) ? errDetail(e) || t("errors.generic") : errDetail(e) || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("dialog.title")}
      description={[account.name, account.phone].filter(Boolean).join(" · ")}
      size="sm"
      busy={busy}
      dirty={!!reason.trim()}
      aiId="otp-routing.change-dialog"
      footer={
        <>
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("dialog.cancel")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void save()} disabled={busy || !method || same} aria-busy={busy || undefined}>
            {busy ? t("dialog.saving") : t("dialog.save")}
          </button>
        </>
      }
    >
      <form
        className="otpr__form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <InlineAlert tone="warn" compact role="note">{t("dialog.notice")}</InlineAlert>
        {usable.length ? (
          <OtpMethodPicker
            name={`${uid}-m`}
            legend={t("dialog.method")}
            methods={usable}
            value={method}
            onChange={setMethod}
            currentMethod={account.selectedMethod || undefined}
            defaultMethod={catalog.defaultMethod || undefined}
            disabled={busy}
            compact
          />
        ) : (
          <p className="otpr__muted">{t("dialog.noUsable")}</p>
        )}
        <div className="otpr__field">
          <span className="otpr__lbl" id={`${uid}-lang`}>{t("dialog.language")}</span>
          <Select
            value={language}
            onChange={setLanguage}
            ariaLabel={t("dialog.language")}
            options={catalog.languages.map((l) => ({ value: l, label: t.has(`lang.${l}`) ? t(`lang.${l}`) : l }))}
          />
        </div>
        <div className="otpr__field">
          <label className="otpr__lbl" htmlFor={`${uid}-reason`}>{t("dialog.reason")}</label>
          <textarea
            id={`${uid}-reason`}
            className="otpr__ta"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonErr) setReasonErr("");
            }}
            placeholder={t("dialog.reasonPh")}
            aria-invalid={reasonErr ? true : undefined}
            aria-describedby={reasonErr ? `${uid}-rerr` : undefined}
            required
          />
          <FieldError id={`${uid}-rerr`} msg={reasonErr} />
        </div>
        {same ? <p className="otpr__muted">{t("dialog.same")}</p> : null}
        {err ? <InlineAlert tone="error" compact role="alert">{err}</InlineAlert> : null}
      </form>
    </Modal>
  );
}
