"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import {
  addFamilyMember,
  addPaymentMethod,
  deleteFamilyMember,
  deletePaymentMethod,
  getClientProfile,
  getIdentity,
  getPaymentReceipt,
  listFamilyMembers,
  listPaymentMethods,
  listPayments,
  setFamilyMemberAccess,
  updateClientProfile,
  type ClientProfile,
} from "@/lib/services/backend";
import { saveBlob } from "@/lib/download";
import { statusLabel } from "@/lib/labels";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { isProfileTab } from "@/lib/profileTabs";
import IdentityVerify from "@/components/portal/IdentityVerify";
import ClientComplaints from "@/components/complaints/ClientComplaints";
import ClientWarranty from "@/components/portal/ClientWarranty";
import { IconBell, IconCard, IconClipboardCheck, IconDownload, IconMail, IconPhone, IconPlus, IconShieldCheck, IconSparkle, IconTrash, IconUser, IconUsers } from "@/components/icons";
import { App, Avatar, Btn, Dialog, Empty, Field, Group, Input, Loading, Select, SettingRow, Sidebar, Table, Tag, Toggle, Toolbar, useConfirm, useOs, useToast, type Col, type NavSection } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { Notes, Security } from "../ProfileApp";
import { toneOf } from "./bits";
import "./client.css";

// The client's profile as a desktop program, the way a computer's
// settings are: the sections on the side (account, family, payments,
// complaints, security, notifications), each a page of grouped rows. The
// identity check, complaints and warranty claims are the web's own forms
// on the desktop's look; everything else is drawn here.

type Sec = "account" | "family" | "payments" | "complaints" | "security" | "notes";
const SECS: Sec[] = ["account", "family", "payments", "complaints", "security", "notes"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const slugOf = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
// "MM/YY", and not already over.
const expiresProblem = (raw: string): "" | "format" | "past" => {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(raw.trim());
  if (!raw.trim()) return "";
  if (!m) return "format";
  return new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59, 59).getTime() < Date.now() ? "past" : "";
};
const uzPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 9 ? `+998${d}` : d.length === 12 && d.startsWith("998") ? `+${d}` : null;
};

export default function CProfileApp({ route, onRoute, openApp }: NativeProps) {
  const t = useTranslations("portal.client.profile");
  const dp = useTranslations("portal.desk.profile");
  const os = useOs();
  const { session, update } = useAuth();
  const [sec, setSec] = useState<Sec>("account");
  const [prof, setProf] = useState<ClientProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    getClientProfile()
      .then((p) => alive && (setProf(p), setFailed(false)))
      .catch(() => alive && setFailed(true));
    getIdentity()
      .then((x) => alive && setVerified(!!x?.verified))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick]);
  // ?tab= (a complaint link, the subscription page) opens its section.
  useEffect(() => {
    if (!route.includes("?")) return;
    const tab = new URLSearchParams(route.split("?")[1]).get("tab");
    const h = setTimeout(() => {
      if (isProfileTab(tab)) setSec(tab === "personal" ? "account" : tab === "notifications" ? "notes" : (tab as Sec));
    }, 0);
    return () => clearTimeout(h);
  }, [route, onRoute]);

  const icon: Record<Sec, ReactNode> = { account: <IconUser />, family: <IconUsers />, payments: <IconCard />, complaints: <IconClipboardCheck />, security: <IconShieldCheck />, notes: <IconBell /> };
  const label = (k: Sec) => (k === "account" ? dp("account") : k === "family" ? t("family") : k === "payments" ? t("tabs.payments") : k === "complaints" ? t("tabs.complaints") : k === "security" ? dp("security") : dp("notes"));
  const name = prof?.name || session?.name || "";
  const header = (
    <div className="dxq-me">
      <Avatar name={name || "?"} size={os === "mac" ? 44 : 40} />
      <span>
        <b>{name || "—"}</b>
        <small>{prof?.phone || session?.phone}</small>
      </span>
    </div>
  );

  return (
    <App name="cprofile" sidebar={<Sidebar label={t("tabsLabel")} header={header} sections={[{ id: "s", items: SECS.map((k) => ({ id: k, label: label(k), icon: icon[k] })) } as NavSection]} value={sec} onChange={(s) => setSec(s as Sec)} />}>
      <Toolbar title={label(sec)} />
      <div className="dxq dx-scroll">
        {sec === "security" ? (
          <Security say={(m, tone) => say(m, tone === "err" ? "err" : undefined)} />
        ) : sec === "notes" ? (
          <Notes />
        ) : sec === "family" ? (
          <Family say={say} />
        ) : sec === "payments" ? (
          <Payments prof={prof} openApp={openApp} say={say} />
        ) : sec === "complaints" ? (
          <div className="dxce">
            <ClientComplaints />
            <ClientWarranty />
          </div>
        ) : failed ? (
          <Empty icon={<IconUser />} title={t("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("edit")}</Btn>} />
        ) : !prof ? (
          <Loading label={t("personal")} />
        ) : (
          <Account
            prof={prof}
            verified={verified}
            lexgoId={session?.lexgoId || ""}
            openApp={openApp}
            onSaved={(p) => {
              setProf({ ...prof, ...p });
              if (p.name && session) update({ name: p.name });
              say(t("saved"));
            }}
          />
        )}
      </div>
      {toast}
    </App>
  );
}

function Account({ prof, verified, lexgoId, openApp, onSaved }: { prof: ClientProfile; verified: boolean; lexgoId: string; openApp: NativeProps["openApp"]; onSaved: (p: { name: string; email: string }) => void }) {
  const t = useTranslations("portal.client.profile");
  const tc = useTranslations("common");
  const tcm = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(prof.name);
  const [email, setEmail] = useState(prof.email);
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = name.trim();
    const m = email.trim();
    const next = { name: !n ? tc("required") : n.length < 2 ? t("errors.nameShort") : undefined, email: m && !EMAIL.test(m) ? t("errors.emailInvalid") : undefined };
    if (next.name || next.email) return setErrs(next);
    setBusy(true);
    try {
      await updateClientProfile({ name: n, email: m });
      onSaved({ name: n, email: m });
      setEdit(false);
    } catch {
      setErrs({ name: t("notify.saveFailed") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="dxcq-card">
        <Avatar name={prof.name || "?"} size={64} />
        <span className="dxcq-card__who">
          <b>
            {prof.name || t("notSet")}
            {verified ? (
              <Tag tone="ok">
                <IconShieldCheck aria-hidden /> {t("verifiedProfile")}
              </Tag>
            ) : null}
          </b>
          {lexgoId ? <small>{`${t("myId")}: ${lexgoId}`}</small> : null}
        </span>
        <Btn onClick={() => (setName(prof.name), setEmail(prof.email), setErrs({}), setEdit(true))}>{t("edit")}</Btn>
      </div>
      <Group title={t("personal")}>
        <SettingRow icon={<IconPhone />} title={prof.phone || "—"} />
        <SettingRow icon={<IconMail />} title={prof.email || t("emailMissing")} />
        <SettingRow icon={<IconSparkle />} title={prof.subscription ? prof.subscription.planName : t("noSub")} desc={prof.subscription ? statusLabel(tcm, prof.subscription.status) : t("noSubText")} onClick={() => openApp("subscription")} />
      </Group>
      <div className="dxce">
        <IdentityVerify />
      </div>
      {edit ? (
        <Dialog
          open
          title={t("edit")}
          onClose={() => setEdit(false)}
          onSubmit={() => void save()}
          actions={
            <>
              <Btn onClick={() => setEdit(false)}>{d("cancel")}</Btn>
              <Btn kind="primary" type="submit" busy={busy}>
                {t("edit")}
              </Btn>
            </>
          }
        >
          <Field label={t("name")} error={errs.name}>
            <Input value={name} onChange={(v) => (setName(v), setErrs((e) => ({ ...e, name: undefined })))} maxLength={120} />
          </Field>
          <Field label={t("email")} error={errs.email}>
            <Input type="email" value={email} onChange={(v) => (setEmail(v), setErrs((e) => ({ ...e, email: undefined })))} maxLength={160} />
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}

type Member = Awaited<ReturnType<typeof listFamilyMembers>>[number];
function Family({ say }: { say: (m: string, tone?: "err") => void }) {
  const t = useTranslations("portal.client.profile");
  const d = useTranslations("portal.desk.client");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [confirm, ask] = useConfirm();
  const [f, setF] = useState({ name: "", phone: "", relation: "" });
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    listFamilyMembers()
      .then((l) => alive && setRows(l))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [tick]);
  async function add() {
    const n = f.name.trim();
    const ph = uzPhone(f.phone);
    const next = { name: n.length < 2 ? t("errors.nameShort") : undefined, phone: ph ? undefined : t("errors.phoneInvalid") };
    if (next.name || next.phone) return setErrs(next);
    setBusy(true);
    try {
      await addFamilyMember({ name: n, phone: ph!, relation: f.relation.trim() || undefined });
      setAdding(false);
      setTick((k) => k + 1);
    } catch {
      say(t("notify.saveFailed"), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Group title={t("family")} end={<Btn small icon={<IconPlus />} onClick={() => (setF({ name: "", phone: "", relation: "" }), setErrs({}), setAdding(true))}>{t("addFamily")}</Btn>} footer={t("familyShareNote")}>
        {rows === null ? (
          <Loading label={t("family")} />
        ) : !rows.length ? (
          <SettingRow icon={<IconUsers />} title={t("noFamily")} desc={t("noFamilyText")} />
        ) : (
          rows.map((m) => (
            <SettingRow key={m.id} icon={<IconUser />} title={m.name} desc={[m.phone, m.relation].filter(Boolean).join(" · ")}>
              <Toggle
                checked={m.sharedAccess}
                label={t("share")}
                onText={t("shared")}
                offText={t("share")}
                onChange={async (v) => {
                  try {
                    await setFamilyMemberAccess(m.id, v);
                    setTick((k) => k + 1);
                  } catch {
                    say(t("familyPlanRequired"), "err");
                  }
                }}
              />
              <Btn
                small
                kind="plain"
                icon={<IconTrash />}
                title={t("remove")}
                onClick={async () => {
                  if (!(await ask({ title: t("confirmFamilyTitle"), text: t("confirmFamilyText", { name: m.name }), ok: t("remove"), cancel: d("cancel"), danger: true }))) return;
                  await deleteFamilyMember(m.id).then(
                    () => setTick((k) => k + 1),
                    () => say(t("notify.removeFailed"), "err"),
                  );
                }}
              />
            </SettingRow>
          ))
        )}
      </Group>
      {adding ? (
        <Dialog
          open
          title={t("addFamily")}
          onClose={() => setAdding(false)}
          onSubmit={() => void add()}
          actions={
            <>
              <Btn onClick={() => setAdding(false)}>{d("cancel")}</Btn>
              <Btn kind="primary" type="submit" busy={busy}>
                {t("addFamily")}
              </Btn>
            </>
          }
        >
          <Field label={t("memberName")} error={errs.name}>
            <Input value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={120} />
          </Field>
          <Field label={t("memberPhone")} error={errs.phone}>
            <Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} placeholder="+998 90 123 45 67" />
          </Field>
          <Field label={t("relation")}>
            <Input value={f.relation} onChange={(v) => setF({ ...f, relation: v })} placeholder={t("relationPh")} maxLength={60} />
          </Field>
        </Dialog>
      ) : null}
      {confirm}
    </>
  );
}

type Method = Awaited<ReturnType<typeof listPaymentMethods>>[number];
type Pay = Awaited<ReturnType<typeof listPayments>>[number];
function Payments({ prof, openApp, say }: { prof: ClientProfile | null; openApp: NativeProps["openApp"]; say: (m: string, tone?: "err") => void }) {
  const t = useTranslations("portal.client.profile");
  const tp = useTranslations("portal.client.payments");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [cards, setCards] = useState<Method[] | null>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState({ brand: "uzcard", last4: "", expires: "" });
  const [cardErr, setCardErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState("");
  const [confirm, ask] = useConfirm();
  useEffect(() => {
    let alive = true;
    listPaymentMethods()
      .then((l) => alive && setCards(l))
      .catch(() => alive && setCards([]));
    listPayments()
      .then((l) => alive && setPays(l))
      .catch(() => alive && setPays([]));
    return () => {
      alive = false;
    };
  }, [tick]);
  const what = (desc: string, kind: string) => {
    const ds = slugOf(desc);
    const k = slugOf(kind);
    const kindLabel = SLUG.test(k) && tp.has(`kinds.${k}`) ? tp(`kinds.${k}`) : "";
    if (SLUG.test(ds) && tp.has(`periods.${ds}`)) return `${kindLabel || tp("kinds.subscription_plan")} · ${tp(`periods.${ds}`)}`;
    if (SLUG.test(ds) && tp.has(`kinds.${ds}`)) return tp(`kinds.${ds}`);
    if (desc.trim() && !SLUG.test(desc.trim())) return desc;
    return kindLabel || humanizeSlug(ds || k) || "—";
  };
  const st = (s: string) => (!s ? "—" : SLUG.test(s) && tp.has(`statuses.${s}`) ? tp(`statuses.${s}`) : humanizeSlug(s));
  async function addCard() {
    const l4 = card.last4.replace(/\D/g, "");
    if (l4.length !== 4) return setCardErr(t("last4Invalid"));
    const exp = expiresProblem(card.expires);
    if (exp) return setCardErr(t(exp === "past" ? "errors.expiresPast" : "errors.expiresFormat"));
    setBusy(true);
    try {
      await addPaymentMethod({ brand: card.brand, last4: l4, expires: card.expires.trim() || undefined });
      setAdding(false);
      setTick((k) => k + 1);
    } catch {
      setCardErr(t("notify.saveFailed"));
    } finally {
      setBusy(false);
    }
  }
  const cols: Col<Pay>[] = [
    {
      id: "what",
      label: tp("what"),
      cell: (p) => (
        <span className="dxcw-name">
          <span className={`dxcw-ic is-${toneOf(p.status)}`} aria-hidden>
            <IconCard />
          </span>
          <span>
            <b>{what(p.description, p.kind)}</b>
            {p.workId ? (
              <small>
                <code>{p.workId}</code>
              </small>
            ) : null}
          </span>
        </span>
      ),
    },
    { id: "date", label: tp("date"), width: "minmax(100px,auto)", cell: (p) => <span className="dxcs-lead">{p.createdAt ? dateOnly(p.createdAt, locale) : "—"}</span> },
    { id: "amount", label: tp("amount"), width: "minmax(110px,auto)", align: "end", cell: (p) => <span className="dxcg-price">{p.amount ? `${fmtUzs(p.amount)} ${/^uzs$/i.test(p.currency) ? te("currency") : p.currency}` : "—"}</span> },
    {
      id: "status",
      label: tp("statusCol"),
      width: "minmax(130px,auto)",
      cell: (p) => (
        <span className="dxcw-tags">
          <Tag tone={toneOf(p.status)}>{st(p.status)}</Tag>
          {p.receiptUrl ? (
            <Btn
              small
              kind="plain"
              icon={<IconDownload />}
              title={tp("receipt")}
              busy={dl === p.id}
              onClick={async () => {
                setDl(p.id);
                await getPaymentReceipt(p.id)
                  .then((b) => saveBlob(b, `lexgo-receipt-${p.id}.pdf`))
                  .catch(() => say(tp("receiptError"), "err"));
                setDl("");
              }}
            />
          ) : null}
        </span>
      ),
    },
  ];
  const sub = prof?.subscription;
  return (
    <>
      <Group title={t("subscription")} end={<Btn small onClick={() => openApp("subscription")}>{sub ? t("subManage") : t("subChoose")}</Btn>}>
        {sub ? (
          <>
            <SettingRow icon={<IconSparkle />} title={sub.planName} desc={statusLabel(tcm, sub.status)} />
            {sub.renewsAt ? <SettingRow title={t("subRenews")} desc={dateOnly(sub.renewsAt, locale)} /> : null}
            {sub.autoRenew !== undefined ? <SettingRow title={t("subAuto")} desc={sub.autoRenew ? t("subAutoOn") : t("subAutoOff")} /> : null}
          </>
        ) : (
          <SettingRow icon={<IconSparkle />} title={t("noSub")} desc={t("noSubText")} />
        )}
      </Group>
      <Group title={t("cards")} end={<Btn small icon={<IconPlus />} onClick={() => (setCard({ brand: "uzcard", last4: "", expires: "" }), setCardErr(""), setAdding(true))}>{t("addCard")}</Btn>}>
        {cards === null ? (
          <Loading label={t("cards")} />
        ) : !cards.length ? (
          <SettingRow icon={<IconCard />} title={t("noCards")} desc={t("noCardsText")} />
        ) : (
          cards.map((m) => {
            const lbl = [m.brand ? m.brand.toUpperCase() : t("cardFallback"), `•••• ${m.last4}`].join(" · ");
            return (
              <SettingRow key={m.id} icon={<IconCard />} title={lbl} desc={[m.expires, m.isDefault ? t("defaultCard") : ""].filter(Boolean).join(" · ")}>
                <Btn
                  small
                  kind="plain"
                  icon={<IconTrash />}
                  title={t("remove")}
                  onClick={async () => {
                    if (!(await ask({ title: t("confirmCardTitle"), text: t("confirmCardText", { card: lbl }), ok: t("remove"), cancel: d("cancel"), danger: true }))) return;
                    await deletePaymentMethod(m.id).then(
                      () => setTick((k) => k + 1),
                      () => say(t("notify.removeFailed"), "err"),
                    );
                  }}
                />
              </SettingRow>
            );
          })
        )}
      </Group>
      <h3 className="dxcq-h">{tp("title")}</h3>
      <div className="dxcq-table">{pays === null ? <Loading label={tp("title")} /> : !pays.length ? <Empty icon={<IconCard />} title={tp("empty")} text={tp("emptyText")} /> : <Table label={tp("title")} cols={cols} rows={pays} rowKey={(p) => p.id} />}</div>
      {adding ? (
        <Dialog
          open
          title={t("addCard")}
          onClose={() => setAdding(false)}
          onSubmit={() => void addCard()}
          actions={
            <>
              <Btn onClick={() => setAdding(false)}>{d("cancel")}</Btn>
              <Btn kind="primary" type="submit" busy={busy}>
                {t("addCard")}
              </Btn>
            </>
          }
        >
          <Field label={t("cardBrand")}>
            <Select value={card.brand} onChange={(v) => setCard({ ...card, brand: v })} ariaLabel={t("cardBrand")} options={["uzcard", "humo", "visa", "mastercard"].map((b) => ({ value: b, label: b.toUpperCase() }))} />
          </Field>
          <Field label={t("cardLast4")} error={cardErr || undefined}>
            <Input value={card.last4} onChange={(v) => (setCard({ ...card, last4: v.replace(/\D/g, "").slice(0, 4) }), setCardErr(""))} placeholder="1234" maxLength={4} />
          </Field>
          <Field label={t("cardExpires")}>
            <Input value={card.expires} onChange={(v) => setCard({ ...card, expires: v.slice(0, 5) })} placeholder="MM/YY" maxLength={5} />
          </Field>
        </Dialog>
      ) : null}
      {confirm}
    </>
  );
}
