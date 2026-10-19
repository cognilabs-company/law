"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { checkConflict, createLawyerClient, getLawyerClientDetail, getLawyerClients, type ConflictResult, type LawyerClient, type LawyerClientDetail } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { dateOnly } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { IconAlert, IconBriefcase, IconCard, IconChat, IconClock, IconCopy, IconFileText, IconPhone, IconPlus, IconShieldCheck, IconTag, IconUsers } from "@/components/icons";
import { App, Avatar, Banner, Btn, Dialog, Empty, Field, Input, Loading, Search, Seg, Sidebar, Tag, TextArea, Tool, Toolbar, useHost, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./clients.css";

// Clients as a desktop program: Contacts on the Mac (groups, the list by
// letter, the card), People on Windows (the list and a page of tabs). Each
// client's card holds what this seller shares with them — history, cases,
// orders, payments, documents — and opens the private chat. New clients
// from outside LexGo and the conflict-of-interest check are dialogs.

type Group = "all" | "active" | "recent" | "conflict";
const fmtNum = (n: number, locale: string) => new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "uz-UZ").format(n);

export default function ClientsApp({ base, openApp }: NativeProps) {
  const t = useTranslations("portal.advocate.clients");
  const d = useTranslations("portal.desk.clients");
  const os = useOs();
  const { menu } = useHost();
  const [list, setList] = useState<LawyerClient[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState<Group>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reload, setReload] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    getLawyerClients()
      .then((l) => alive && setList(l))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [reload]);

  const all = useMemo(() => list ?? [], [list]);
  const inGroup = (c: LawyerClient, g: Group) => (g === "active" ? c.activeCaseIds.length > 0 : g === "conflict" ? c.hasConflict : g === "recent" ? !!c.lastActiveAt : true);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const l = all.filter((c) => inGroup(c, group) && (!needle || `${c.name} ${c.phone}`.toLowerCase().includes(needle)));
    return group === "recent" ? l.sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "")) : l.sort((a, b) => a.name.localeCompare(b.name));
  }, [all, group, needle]);
  const letters = useMemo(() => {
    const m = new Map<string, LawyerClient[]>();
    for (const c of shown) {
      const k = group === "recent" ? "" : (c.name.trim()[0] ?? "#").toUpperCase();
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [shown, group]);
  const current = all.find((c) => c.id === sel) ?? null;

  const sections: NavSection[] = [
    {
      id: "g",
      title: os === "mac" ? d("groups") : undefined,
      items: [
        { id: "all", label: d("all"), icon: <IconUsers />, count: all.length },
        { id: "active", label: d("active"), icon: <IconBriefcase />, count: all.filter((c) => inGroup(c, "active")).length },
        { id: "recent", label: d("recent"), icon: <IconClock /> },
        { id: "conflict", label: d("conflict"), icon: <IconAlert />, count: all.filter((c) => c.hasConflict).length },
      ],
    },
  ];
  const rowMenu = (e: MouseEvent, c: LawyerClient) =>
    menu?.(e, c.name, [
      { id: "card", label: d("showCard"), icon: <IconUsers />, onSelect: () => setSel(c.id) },
      ...(c.phone ? [{ id: "copy", label: d("copyPhone"), icon: <IconCopy />, onSelect: () => void navigator.clipboard?.writeText(c.phone).then(() => say(d("copied"))) }] : []),
      { sep: true, id: "s" },
      { id: "chk", label: d("checkThis"), icon: <IconShieldCheck />, onSelect: () => setChecking(true) },
    ]);

  const listPane = (
    <section className="dxk-list" aria-label={t("title")}>
      {os === "mac" ? (
        <div className="dxk-list__search">
          <Search value={q} onChange={setQ} placeholder={d("search")} wide />
        </div>
      ) : null}
      {list === null ? (
        failed ? (
          <Empty icon={<IconAlert />} title={d("loadError")} />
        ) : (
          <Loading label={d("loading")} />
        )
      ) : !shown.length ? (
        <Empty icon={<IconUsers />} title={needle ? d("noResults") : group === "all" ? t("empty") : d(`empty.${group}`)} text={!needle && group === "all" ? t("emptyText") : undefined} />
      ) : (
        <div className="dxk-scroll" role="listbox" aria-label={t("title")}>
          {letters.map(([k, cs]) => (
            <div key={k || "-"} className="dxk-sec">
              {k ? <p className="dxk-letter">{k}</p> : null}
              {cs.map((c) => (
                <div
                  key={c.id}
                  role="option"
                  tabIndex={sel === c.id ? 0 : -1}
                  aria-selected={sel === c.id}
                  className={`dx-row dxk-row${sel === c.id ? " is-on" : ""}`}
                  onClick={() => setSel(c.id)}
                  onContextMenu={(e) => (e.preventDefault(), setSel(c.id), rowMenu(e, c))}
                >
                  {os === "win" ? <Avatar name={c.name} size={32} /> : null}
                  <span className="dx-row__t">
                    <b>{c.name || c.phone || "—"}</b>
                    {os === "win" ? <small>{[c.phone, t("casesCount", { n: c.casesCount })].filter(Boolean).join(" · ")}</small> : null}
                  </span>
                  {c.hasConflict ? <IconAlert className="dxk-flag" aria-label={t("conflict")} /> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {os === "mac" ? (
        <footer className="dxk-list__foot">
          <Btn kind="plain" small icon={<IconPlus />} title={d("new")} onClick={() => setAdding(true)} />
          <span>{d("count", { n: shown.length })}</span>
        </footer>
      ) : null}
    </section>
  );

  return (
    <App name="clients" sidebar={<Sidebar label={t("title")} sections={sections} value={group} onChange={(g) => setGroup(g as Group)} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={d("search")} wide /> : undefined} />}>
      {os === "win" ? (
        <Toolbar title={t("title")} subtitle={list ? d("count", { n: shown.length }) : undefined}>
          <Tool icon={<IconPlus />} label={d("new")} primary onClick={() => setAdding(true)} />
          <Tool icon={<IconShieldCheck />} label={d("check")} onClick={() => setChecking(true)} />
        </Toolbar>
      ) : (
        <Toolbar title={t("title")} subtitle={list ? d("count", { n: shown.length }) : undefined}>
          <Tool icon={<IconShieldCheck />} label={d("check")} onClick={() => setChecking(true)} />
          <Tool icon={<IconPlus />} label={d("new")} onClick={() => setAdding(true)} />
        </Toolbar>
      )}
      <div className="dxk-body">
        {listPane}
        {current ? (
          <Card key={current.id} c={current} onChat={(id) => openApp("messages", `/portal/chat/${id}`)} onOrder={(id) => openApp("marketplaceOrders", `${base}/marketplace-orders/${id}`)} onCopy={() => current.phone && void navigator.clipboard?.writeText(current.phone).then(() => say(d("copied")))} />
        ) : (
          <div className="dxk-none">
            <Empty icon={<IconUsers />} title={d("pick")} />
          </div>
        )}
      </div>
      <AddClient
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          setReload((n) => n + 1);
          say(d("added"));
        }}
      />
      <ConflictCheck open={checking} onClose={() => setChecking(false)} />
      {toast}
    </App>
  );
}

// The client's card: who they are, the counts, the way to their chat, and
// everything shared with them by tab.
function Card({ c, onChat, onOrder, onCopy }: { c: LawyerClient; onChat: (roomId: string) => void; onOrder: (id: string) => void; onCopy: () => void }) {
  const t = useTranslations("portal.clientDetail");
  const tc = useTranslations("portal.common");
  const tl = useTranslations("portal.advocate.clients");
  const d = useTranslations("portal.desk.clients");
  const locale = useLocale();
  const os = useOs();
  const [det, setDet] = useState<LawyerClientDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [tab, setTab] = useState<"timeline" | "cases" | "orders" | "payments" | "documents">("timeline");
  useEffect(() => {
    let alive = true;
    getLawyerClientDetail(c.id)
      .then((x) => {
        if (!alive) return;
        setDet(x);
        setState("ready");
      })
      .catch((e) => alive && setState(e instanceof ApiError && e.status === 404 ? "missing" : "error"));
    return () => {
      alive = false;
    };
  }, [c.id]);
  const fmt = (s: string) => (s ? dateOnly(s, locale) : "");
  const chat = det?.chats[0];
  const rows = (items: { key: string; title: string; sub: string; icon: ReactNode; onOpen?: () => void }[]) =>
    items.length ? (
      <div className="dxk-items">
        {items.map((x) => (
          <button key={x.key} type="button" className="dxk-item" onClick={x.onOpen} disabled={!x.onOpen}>
            <span className="dxk-item__ic">{x.icon}</span>
            <span className="dxk-item__t">
              <b>{x.title || "—"}</b>
              <small>{x.sub}</small>
            </span>
          </button>
        ))}
      </div>
    ) : (
      <p className="dxk-empty">{t("empty")}</p>
    );
  return (
    <article className="dxk-card" aria-label={c.name}>
      <header className="dxk-card__h">
        <Avatar name={c.name} size={os === "mac" ? 72 : 64} />
        <div>
          <h2>{c.name || "—"}</h2>
          <p>{[det?.client.company, det?.type === "manual" ? t("manual") : null].filter(Boolean).join(" · ") || tl("casesCount", { n: c.casesCount })}</p>
          {c.hasConflict ? (
            <Tag tone="err">
              <IconAlert aria-hidden />
              {tl("conflict")}
            </Tag>
          ) : null}
        </div>
      </header>
      <div className="dxk-card__acts">
        <Btn kind="primary" icon={<IconChat />} disabled={!chat} onClick={() => chat && onChat(chat.id)}>
          {d("message")}
        </Btn>
        {c.phone ? (
          <Btn icon={<IconPhone />} onClick={() => (window.location.href = `tel:${c.phone}`)}>
            {d("call")}
          </Btn>
        ) : null}
        {c.phone ? <Btn icon={<IconCopy />} title={d("copyPhone")} onClick={onCopy} /> : null}
      </div>
      {c.hasConflict ? <Banner tone="err" title={tl("conflictAlert")} /> : null}
      <dl className="dxk-facts">
        {c.phone ? (
          <div>
            <dt>{d("phone")}</dt>
            <dd>{c.phone}</dd>
          </div>
        ) : null}
        {det?.client.region ? (
          <div>
            <dt>{d("region")}</dt>
            <dd>{det.client.region}</dd>
          </div>
        ) : null}
        {det?.client.createdAt ? (
          <div>
            <dt>{d("since")}</dt>
            <dd>{fmt(det.client.createdAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{d("work")}</dt>
          <dd>{[tl("casesCount", { n: c.casesCount }), tl("ordersCount", { n: c.ordersCount }), c.activeCaseIds.length ? tl("activeCases", { n: c.activeCaseIds.length }) : ""].filter(Boolean).join(" · ")}</dd>
        </div>
        {det?.client.notes ? (
          <div>
            <dt>{d("notes")}</dt>
            <dd>{det.client.notes}</dd>
          </div>
        ) : null}
      </dl>
      {state === "loading" ? (
        <Loading label={d("loadingCard")} />
      ) : state === "missing" ? (
        <p className="dxk-empty">{t("notFound")}</p>
      ) : state === "error" || !det ? (
        <p className="dxk-empty">{t("error")}</p>
      ) : (
        <>
          <div className="dxk-tabs">
            <Seg
              label={d("sections")}
              small
              value={tab}
              onChange={setTab}
              items={(["timeline", "cases", "orders", "payments", "documents"] as const).map((k) => ({ id: k, label: t(`tabs.${k}`), count: k === "timeline" ? 0 : det[k].length }))}
            />
          </div>
          {tab === "timeline"
            ? rows(det.timeline.map((x) => ({ key: `${x.type}-${x.id}`, title: `${t.has(`types.${x.type}`) ? t(`types.${x.type}`) : x.type}: ${x.title || "—"}`, sub: [x.status ? statusLabel(tc, x.status) : "", fmt(x.updatedAt || x.createdAt)].filter(Boolean).join(" · "), icon: <IconClock /> })))
            : tab === "cases"
              ? rows(det.cases.map((x) => ({ key: x.id, title: x.title || x.caseNumber, sub: [x.caseNumber, statusLabel(tc, x.stage), statusLabel(tc, x.status), x.deadlineAt ? `${t("deadline")}: ${fmt(x.deadlineAt)}` : ""].filter(Boolean).join(" · "), icon: <IconBriefcase /> })))
              : tab === "orders"
                ? rows(det.orders.map((x) => ({ key: x.id, title: x.title || x.serviceName || "", sub: [statusLabel(tc, x.status), statusLabel(tc, x.paymentStatus), fmt(x.createdAt)].filter(Boolean).join(" · "), icon: <IconTag />, onOpen: () => onOrder(x.id) })))
                : tab === "payments"
                  ? rows(det.payments.map((x) => ({ key: x.id, title: `${fmtNum(x.amount, locale)} ${t("som")}`, sub: [statusLabel(tc, x.status), x.method, x.description, fmt(x.createdAt)].filter(Boolean).join(" · "), icon: <IconCard /> })))
                  : rows(det.documents.map((x) => ({ key: x.id, title: x.title || x.documentType || "", sub: [statusLabel(tc, x.status), fmt(x.createdAt)].filter(Boolean).join(" · "), icon: <IconFileText /> })))}
        </>
      )}
    </article>
  );
}

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function AddClient({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const tc = useTranslations("portal.clientsTools");
  const d = useTranslations("portal.desk.clients");
  const empty = { name: "", phone: "", pinfl: "", company: "", opponents: "", representatives: "", notes: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const c = await checkConflict({ phone: f.phone, pinfl: f.pinfl, opponent: split(f.opponents)[0], representatives: split(f.representatives) }).catch(() => null);
      setConflict(c && c.status === "potential_conflict" ? c : null);
      await createLawyerClient({ name: f.name.trim(), phone: f.phone.trim(), pinfl: f.pinfl.trim(), company: f.company.trim(), opponents: split(f.opponents), representatives: split(f.representatives), notes: f.notes.trim() });
      setF(empty);
      onSaved();
    } catch {
      setErr(tc("saveError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={tc("addTitle")}
      onClose={onClose}
      onSubmit={() => void save()}
      width={520}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!f.name.trim()}>
            {tc("save")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{tc("addLead")}</p>
      <Field label={tc("name")}>
        <Input value={f.name} onChange={(v) => set({ name: v })} required maxLength={200} autoFocus />
      </Field>
      <div className="dxk-form2">
        <Field label={tc("phone")}>
          <Input type="tel" value={f.phone} onChange={(v) => set({ phone: v })} placeholder="+998" maxLength={20} />
        </Field>
        <Field label={tc("pinfl")}>
          <Input value={f.pinfl} onChange={(v) => set({ pinfl: v.replace(/\D/g, "").slice(0, 14) })} placeholder={tc("pinflPh")} />
        </Field>
      </div>
      <Field label={tc("company")}>
        <Input value={f.company} onChange={(v) => set({ company: v })} maxLength={200} />
      </Field>
      <div className="dxk-form2">
        <Field label={tc("opponents")} hint={tc("listPh")}>
          <Input value={f.opponents} onChange={(v) => set({ opponents: v })} />
        </Field>
        <Field label={tc("representatives")} hint={tc("listPh")}>
          <Input value={f.representatives} onChange={(v) => set({ representatives: v })} />
        </Field>
      </div>
      <Field label={tc("notes")}>
        <TextArea value={f.notes} onChange={(v) => set({ notes: v })} rows={3} maxLength={2000} />
      </Field>
      {conflict ? <ConflictView r={conflict} /> : null}
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

function ConflictCheck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tc = useTranslations("portal.clientsTools");
  const d = useTranslations("portal.desk.clients");
  const [f, setF] = useState({ phone: "", pinfl: "", opponent: "", representatives: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<ConflictResult | null>(null);
  const [err, setErr] = useState("");
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function run() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      setR(await checkConflict({ phone: f.phone, pinfl: f.pinfl, opponent: f.opponent, representatives: split(f.representatives) }));
    } catch {
      setErr(tc("checkError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={tc("checkTitle")}
      onClose={onClose}
      onSubmit={() => void run()}
      width={500}
      actions={
        <>
          <Btn onClick={onClose}>{d("close")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!f.phone && !f.pinfl && !f.opponent && !f.representatives}>
            {d("check")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{tc("checkLead")}</p>
      <div className="dxk-form2">
        <Field label={tc("phone")}>
          <Input type="tel" value={f.phone} onChange={(v) => set({ phone: v })} placeholder="+998" />
        </Field>
        <Field label={tc("pinfl")}>
          <Input value={f.pinfl} onChange={(v) => set({ pinfl: v.replace(/\D/g, "").slice(0, 14) })} placeholder={tc("pinflPh")} />
        </Field>
      </div>
      <Field label={tc("opponent")}>
        <Input value={f.opponent} onChange={(v) => set({ opponent: v })} />
      </Field>
      <Field label={tc("representatives")} hint={tc("listPh")}>
        <Input value={f.representatives} onChange={(v) => set({ representatives: v })} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
      {r ? <ConflictView r={r} /> : null}
    </Dialog>
  );
}

function ConflictView({ r }: { r: ConflictResult }) {
  const tc = useTranslations("portal.clientsTools");
  if (r.status === "clear") return <Banner tone="ok" title={tc("clear")} />;
  return (
    <Banner tone="warn" title={tc("potential")}>
      <ul className="dxk-conf">
        {r.matches.map((m, i) => (
          <li key={i}>
            <b>{m.title || m.caseNumber || "—"}</b> — {tc.has(`reasons.${m.reason}`) ? tc(`reasons.${m.reason}`) : m.reason}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
