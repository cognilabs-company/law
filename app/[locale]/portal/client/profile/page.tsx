"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import {
  getClientProfile,
  updateClientProfile,
  listFamilyMembers,
  addFamilyMember,
  deleteFamilyMember,
  setFamilyMemberAccess,
  listMyActivity,
  listPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  getNotificationPreferences,
  updateNotificationPreferences,
  listSessions,
  revokeSession,
  NOTIF_KEYS,
  type NotifPrefs,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { useResource, useResourceOne } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconEdit, IconPlus, IconClose, IconCard, IconCheck, IconClock } from "@/components/icons";
import IdentityVerify from "@/components/portal/IdentityVerify";
import TwoFactorCard from "@/components/portal/TwoFactorCard";
import TelegramLinkCard from "@/components/portal/TelegramLinkCard";

function fmtDateTime(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU");
}

export default function ClientProfile() {
  const t = useTranslations("portal.client.profile");
  const { session, update, logout } = useAuth();
  const [key, setKey] = useState(0);
  const reload = () => setKey((k) => k + 1);
  const prof = useResourceOne(getClientProfile, [key]);
  const family = useResource(() => listFamilyMembers(), [key]);
  const methods = useResource(() => listPaymentMethods(), [key]);
  const activity = useResource(() => listMyActivity(), [key]);
  const prefs = useResourceOne(getNotificationPreferences, [key]);
  const sessions = useResource(() => listSessions(), [key]);
  const [famErr, setFamErr] = useState<string | null>(null);
  const [prefsLocal, setPrefsLocal] = useState<NotifPrefs | null>(null);
  const pf = prefsLocal ?? prefs.data ?? null;

  async function togglePref(k: keyof NotifPrefs) {
    if (!pf) return;
    const next = { ...pf, [k]: !pf[k] };
    setPrefsLocal(next);
    try {
      await updateNotificationPreferences({ [k]: next[k] });
    } catch {
      setPrefsLocal(pf); // revert on failure
    }
  }
  async function revoke(id: string) {
    const current = sessions.data.find((x) => x.id === id)?.current;
    try {
      await revokeSession(id);
      // This device's own session is gone → sign out cleanly instead of
      // failing the next refresh with a misleading "inactivity" notice.
      if (current) {
        logout();
        return;
      }
      reload();
    } catch {
      /* ignore */
    }
  }

  async function toggleShare(id: string, next: boolean) {
    setFamErr(null);
    try {
      await setFamilyMemberAccess(id, next);
      reload();
    } catch (e) {
      // 402 = the account owner has no active plan to share.
      setFamErr(e instanceof ApiError && e.status === 402 ? t("familyPlanRequired") : t("error"));
    }
  }

  const [editOpen, setEditOpen] = useState(false);
  const [famOpen, setFamOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const p = prof.data;
  const name = p?.name || session?.name || "—";
  const phone = p?.phone || session?.phone || "—";
  const email = p?.email || "";

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("personal")}</b>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => setEditOpen(true)}>
            <IconEdit />
            {t("edit")}
          </button>
        </div>
        {prof.status === "loading" ? (
          <Skeleton rows={2} />
        ) : (
          <div className="pkv">
            {session?.lexgoId ? (
              <div className="pkv__i"><label>{t("myId")}</label><b className="pkv__id">{session.lexgoId}</b></div>
            ) : null}
            <div className="pkv__i"><label>{t("name")}</label><b>{name}</b></div>
            <div className="pkv__i"><label>{t("phone")}</label><b>{phone}</b></div>
            <div className="pkv__i"><label>{t("email")}</label><b>{email || t("notSet")}</b></div>
            <div className="pkv__i"><label>{t("card")}</label><b>{methods.data[0] ? `•••• ${methods.data[0].last4}` : t("notSet")}</b></div>
          </div>
        )}
      </div>

      <IdentityVerify />

      <TwoFactorCard />

      <TelegramLinkCard />

      <div className="pgrid2">
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("family")}</b>
            <button className="btn btn--soft btn--sm" type="button" onClick={() => setFamOpen(true)}>
              <IconPlus />
              {t("addFamily")}
            </button>
          </div>
          <p className="ppanel__note">{t("familyShareNote")}</p>
          {famErr ? <Notice ok={false} msg={famErr} /> : null}
          {family.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !family.data.length ? (
            <p style={{ margin: 0, color: "var(--gray2)", fontSize: ".88rem" }}>{t("noFamily")}</p>
          ) : (
            <div className="alist">
              {family.data.map((m) => (
                <div className="creq" key={m.id}>
                  <span className="creq__st" />
                  <div className="creq__m">
                    <b>{m.name}</b>
                    <span>{[m.phone, m.relation].filter(Boolean).join(" · ")}</span>
                  </div>
                  <button
                    type="button"
                    className={`famshare${m.sharedAccess ? " on" : ""}`}
                    aria-pressed={m.sharedAccess}
                    onClick={() => toggleShare(m.id, !m.sharedAccess)}
                  >
                    {m.sharedAccess ? <IconCheck /> : null}
                    {m.sharedAccess ? t("shared") : t("share")}
                  </button>
                  <button
                    className="calev__x"
                    type="button"
                    aria-label={t("remove")}
                    onClick={() => deleteFamilyMember(m.id).then(reload).catch(() => {})}
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("cards")}</b>
            <button className="btn btn--soft btn--sm" type="button" onClick={() => setCardOpen(true)}>
              <IconPlus />
              {t("addCard")}
            </button>
          </div>
          {methods.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !methods.data.length ? (
            <p style={{ margin: 0, color: "var(--gray2)", fontSize: ".88rem" }}>{t("noCards")}</p>
          ) : (
            <div className="alist">
              {methods.data.map((m) => (
                <div className="creq" key={m.id}>
                  <span className="creq__st" />
                  <div className="creq__m">
                    <b>{[m.brand || "card", `•••• ${m.last4}`].join(" · ")}</b>
                    <span>{m.expires}{m.isDefault ? ` · ${t("defaultCard")}` : ""}</span>
                  </div>
                  <button
                    className="calev__x"
                    type="button"
                    aria-label={t("remove")}
                    onClick={() => deletePaymentMethod(m.id).then(reload).catch(() => {})}
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("subscription")}</b>
        </div>
        <p style={{ margin: 0, color: "var(--gray)", fontSize: ".9rem", display: "flex", alignItems: "center", gap: 8 }}>
          <IconCard style={{ width: 16, height: 16 }} />
          {p?.subscription
            ? `${p.subscription.planName} · ${p.subscription.status}`
            : t("subActive")}
        </p>
      </div>

      <div className="pgrid2">
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("notifPrefs")}</b></div>
          {prefs.status === "loading" || !pf ? (
            <Skeleton rows={2} />
          ) : (
            <div className="prefs">
              {NOTIF_KEYS.map((k) => (
                <button key={k} type="button" className={`prefs__row${pf[k] ? " on" : ""}`} onClick={() => togglePref(k)} aria-pressed={pf[k]}>
                  <span>
                    {t.has(`notif.${k}`) ? t(`notif.${k}`) : k}
                    {/* Only when the link state is known to be off, never when unknown. */}
                    {k === "telegram" && session?.telegramLinked === false ? (
                      <small className="prefs__hint">{t("notifTelegramHint")}</small>
                    ) : null}
                  </span>
                  <span className="prefs__sw" />
                </button>
              ))}
            </div>
          )}
          {pf ? <p className="ppanel__note" style={{ marginTop: 10 }}>{t("notifSmsHint")}</p> : null}
        </div>
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("sessions")}</b></div>
          {sessions.status === "loading" ? (
            <Skeleton rows={2} />
          ) : !sessions.data.length ? (
            <p className="advmuted">{t("noSessions")}</p>
          ) : (
            <div className="alist">
              {sessions.data.map((s) => (
                <div className="creq" key={s.id}>
                  <span className="creq__st" />
                  <div className="creq__m"><b>{s.deviceLabel || s.ip || t("device")}</b><span>{[s.ip, s.lastUsedAt].filter(Boolean).join(" · ")}</span></div>
                  <button className="btn btn--line btn--sm" type="button" onClick={() => revoke(s.id)}>{t("revoke")}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("activity")}</b>
        </div>
        {activity.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !activity.data.length ? (
          <EmptyState icon={<IconClock />} title={t("noActivity")} text={t("noActivityText")} />
        ) : (
          <div className="alist">
            {activity.data.map((a) => (
              <div className="creq" key={a.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{t.has(`log.${a.action}`) ? t(`log.${a.action}`) : a.action || "—"}</b>
                  <span>{[a.detail, a.ip, fmtDateTime(a.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ name: p?.name || session?.name || "", email }}
        onSaved={(np) => {
          if (np.name && session) update({ name: np.name });
          reload();
        }}
      />
      <FamilyModal open={famOpen} onClose={() => setFamOpen(false)} onSaved={reload} />
      <CardModal open={cardOpen} onClose={() => setCardOpen(false)} onSaved={reload} />
    </>
  );
}

function EditModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: { name: string; email: string };
  onSaved: (p: { name: string; email: string }) => void;
}) {
  const t = useTranslations("portal.client.profile");
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await updateClientProfile({ name: name.trim(), email: email.trim() });
      setNote({ ok: true, msg: t("saved") });
      onSaved({ name: name.trim(), email: email.trim() });
      setTimeout(onClose, 800);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("editTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} />
        </div>
        <div>
          <label>{t("email")}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPh")} type="email" />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}

function FamilyModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("portal.client.profile");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim() || !phone.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await addFamilyMember({ name: name.trim(), phone: phone.trim(), relation: relation.trim() || undefined });
      setNote({ ok: true, msg: t("saved") });
      setName("");
      setPhone("");
      setRelation("");
      onSaved();
      setTimeout(onClose, 800);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addFamily")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("memberName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} />
        </div>
        <div>
          <label>{t("memberPhone")}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 __ ___ __ __" type="tel" />
        </div>
        <div>
          <label>{t("relation")}</label>
          <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder={t("relationPh")} />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}

function CardModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("portal.client.profile");
  const [brand, setBrand] = useState("uzcard");
  const [last4, setLast4] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const brandOpts = ["uzcard", "humo", "visa", "mastercard"].map((v) => ({ value: v, label: v.toUpperCase() }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const l4 = last4.replace(/\D/g, "").slice(-4);
    if (busy || l4.length !== 4) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await addPaymentMethod({ brand, last4: l4, expires: expires.trim() || undefined });
      setNote({ ok: true, msg: t("saved") });
      setLast4("");
      setExpires("");
      onSaved();
      setTimeout(onClose, 800);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addCard")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("cardBrand")}</label>
          <Select value={brand} onChange={setBrand} options={brandOpts} ariaLabel={t("cardBrand")} />
        </div>
        <div>
          <label>{t("cardLast4")}</label>
          <input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="1234" inputMode="numeric" maxLength={4} />
        </div>
        <div>
          <label>{t("cardExpires")}</label>
          <input value={expires} onChange={(e) => setExpires(e.target.value)} placeholder="MM/YY" maxLength={5} />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}
