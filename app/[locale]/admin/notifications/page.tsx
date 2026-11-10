"use client";

import "./notifications.css";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { listAdminUsers, type AdminUser } from "@/lib/services/users";
import { useResource } from "@/lib/useResource";
import { sendAdminNotification } from "@/lib/services/notify";
import { NOTIF_ROW_CATEGORIES, type NotifCategory } from "@/lib/notifications";
import { humanizeSlug } from "@/lib/lawyers";
import { useAiReveal } from "@/lib/guide/targets";
import { useAiSelection } from "@/lib/ai/registry";
import { notify } from "@/lib/toast";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import FieldError from "@/components/ui/FieldError";
import InlineAlert from "@/components/ui/InlineAlert";
import ScrollCue from "@/components/ui/ScrollCue";
import { IconBell, IconChevronDown, IconClose, IconEdit, IconEye, IconLayers, IconSearch, IconSend, IconUser, IconUsers } from "@/components/icons";
import { useCan } from "@/lib/useCan";
import { useAuth, sessionRoles } from "@/lib/auth";
import PeoplePicker, { PeopleEmpty, PeopleSkeleton, PersonAvatar, PersonRow, type PickedPerson } from "@/components/admin/notifications/PeoplePicker";
import { AudienceLine, AvatarStack, CATEGORY_META, CHANNELS, CHANNEL_META, ChoiceTiles, NotifPreview, ROLE_META, SendResult, Step, type RecipientResult } from "@/components/admin/notifications/ComposerParts";
import { canBroadcastNotifications } from "@/lib/notifyAccess";
import { isForbidden } from "@/lib/http";

// Role tabs feed GET /admin/users?role=… (backend UserRole values).
const ROLE_TABS = ["all", "client", "yurist", "advokat", "advokat_tashkiloti", "call_center", "sales"] as const;
type RoleTab = (typeof ROLE_TABS)[number];
// Parallel sends per batch: enough to be quick, few enough to stay polite.
const CONCURRENCY = 3;
// Soft limits that keep a push readable on a lock screen.
const TITLE_MAX = 120;
const BODY_MAX = 1000;

type Recipient = { id: string; name: string };
type SendSummary = { results: RecipientResult[]; stopped: boolean };
type SendMode = "individual" | "broadcast";
type BroadcastRole = Exclude<RoleTab, "all">;
const BROADCAST_ROLES = ROLE_TABS.filter((r): r is BroadcastRole => r !== "all");

// The preview column sticks under the top bar only while it fits the
// viewport; a taller one scrolls with the page so nothing is cut off.
function useFitsSticky<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest<HTMLElement>(".pbody, .opx-stage");
    const check = () => {
      const room = scroller ? scroller.clientHeight : window.innerHeight;
      setFits(el.offsetHeight <= room - 32);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return [ref, fits] as const;
}

export default function AdminNotifications() {
  const t = useTranslations("admin");
  const tn = useTranslations("admin.notifications");
  const tp = useTranslations("portal.notifications");
  const tc = useTranslations("common");
  const tcp = useTranslations("common.person");
  const uid = useId();
  const formId = `${uid}-form`;
  const canDo = useCan();
  // Sending is this page's own notifications.manage. The recipient list
  // with role filter and select-all reads GET /admin/users (users.manage);
  // without that code people are found with the search picker (GET
  // /users/search). Nobody types an id.
  const canListUsers = canDo("users.manage");
  // A whole-role broadcast is admin work (or an explicit broadcast
  // permission): a duty lawyer only writes to people it picks.
  const { session } = useAuth();
  const canBroadcast = canBroadcastNotifications(sessionRoles(session), session?.permissions ?? []);
  // A 403 on send (permission revoked mid-session) keeps its message and
  // takes the send button off the form.
  const [sendDenied, setSendDenied] = useState(false);

  const [modePick, setMode] = useState<SendMode>("individual");
  const mode: SendMode = canBroadcast ? modePick : "individual";
  useAiReveal("notifications:recipients", () => setMode("individual"));
  useAiReveal("notifications:broadcast-role", () => setMode("broadcast"));
  const [broadcastRole, setBroadcastRole] = useState<BroadcastRole>("client");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [q, setQ] = useState("");
  // Debounced and sent to the backend (GET /admin/users?q=) instead of only
  // filtering whatever page of users the role tab already happened to fetch
  // — a name outside that first batch used to read as "no results" even
  // though the person exists.
  const [qLive, setQLive] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setQLive(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);
  const users = useResource(
    () => (canListUsers ? listAdminUsers({ role: roleTab === "all" ? undefined : roleTab, q: qLive || undefined }) : Promise.resolve([] as AdminUser[])),
    [roleTab, qLive, canListUsers],
  );
  // Selection survives role switches so one send can mix roles.
  const [selected, setSelected] = useState<Map<string, PickedPerson>>(() => new Map());
  // Who each result row was, for its avatar after the selection is cleared.
  const [sentTo, setSentTo] = useState<Map<string, PickedPerson>>(() => new Map());

  const [category, setCategory] = useState<NotifCategory>("system");
  const [channel, setChannel] = useState<string>("push");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [bad, setBad] = useState<{ title?: boolean; body?: boolean; recipients?: boolean }>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const stopRef = useRef(false);
  const askRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [sideRef, sideFits] = useFitsSticky<HTMLElement>();

  const selectedInRole = (r: RoleTab) => [...selected.values()].filter((u) => r === "all" || u.role === r).length;
  useAiSelection("admin_notifications_role", mode === "individual" && roleTab !== "all" ? roleTab : "");

  // The message box grows with its text (up to a cap), no resize handle.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 360)}px`;
  }, [body]);

  useEffect(() => {
    if (summary) resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [summary]);

  function toggle(u: PickedPerson) {
    setSelected((m) => {
      const next = new Map(m);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, u);
      return next;
    });
    setBad((b) => (b.recipients ? { ...b, recipients: false } : b));
  }
  function selectMany(list: AdminUser[]) {
    setSelected((m) => {
      const next = new Map(m);
      for (const u of list) if (u.id) next.set(u.id, u);
      return next;
    });
    setBad((b) => (b.recipients ? { ...b, recipients: false } : b));
  }
  const roleLabel = (r: string) => (tn.has(`roles.${r}`) ? tn(`roles.${r}`) : t.has(`roleBadges.${r}`) ? t(`roleBadges.${r}`) : humanizeSlug(r));
  // A person by name, phone or LexGo ID — never the bare user id.
  const userTitle = (u: PickedPerson) => u.name || u.phone || (u.lexgoId ? `LexGo ID ${u.lexgoId}` : "") || tcp("unknown");

  function startOver() {
    setSummary(null);
    setTitle("");
    setBody("");
    setSelected(new Map());
    setCategory("system");
    setChannel("push");
    setBad({});
    document.getElementById(`${uid}-who`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (progress || askRef.current || sendDenied) return;
    if (!title.trim() || !body.trim()) {
      setBad((b) => ({ ...b, title: !title.trim(), body: !body.trim() }));
      document.getElementById(`${uid}-${title.trim() ? "body" : "title"}`)?.focus();
      return;
    }
    // A broadcast reaches an entire role in one shot — a much bigger blast
    // radius than hand-picked recipients, so it gets its own confirmation
    // instead of firing on the same single click.
    if (mode === "broadcast") {
      if (!canBroadcast) return;
      const roleName = tn(`roles.${broadcastRole}`);
      askRef.current = true;
      const ok = await confirmDialog({
        title: tn("broadcastAsk", { role: roleName }),
        text: tn("broadcastAskText", { role: roleName }),
        confirmLabel: tn("broadcastAskOk"),
      }).finally(() => {
        askRef.current = false;
      });
      if (!ok) return;
    }
    setSummary(null);
    stopRef.current = false;

    // Broadcast: the backend fans out to the whole role, so one request.
    if (mode === "broadcast") {
      const roleName = tn(`roles.${broadcastRole}`);
      setProgress({ done: 0, total: 1 });
      try {
        const r = await sendAdminNotification({ audienceRole: broadcastRole, channel, title: title.trim(), body: body.trim(), category });
        setProgress(null);
        setSentTo(new Map());
        setSummary({ results: [{ id: broadcastRole, name: tn("wholeRole", { role: roleName }), ok: true, deliveries: r.deliveries }], stopped: false });
        notify.success(tn("broadcastSent", { role: roleName }), { id: "admin-notif-send" });
        setTitle("");
        setBody("");
      } catch (err) {
        setProgress(null);
        setSentTo(new Map());
        setSummary({ results: [{ id: broadcastRole, name: tn("wholeRole", { role: roleName }), ok: false, deliveries: [] }], stopped: false });
        notify.error(tn("broadcastFailed", { role: roleName }), { id: "admin-notif-send", error: err });
        if (isForbidden(err)) setSendDenied(true);
      }
      return;
    }

    const recipients: Recipient[] = [...selected.values()].map((u) => ({ id: u.id, name: userTitle(u) }));
    if (!recipients.length) {
      setBad((b) => ({ ...b, recipients: true }));
      document.getElementById(`${uid}-who`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    setBad((b) => (b.recipients ? { ...b, recipients: false } : b));
    const people = new Map(selected);
    const total = recipients.length;
    setProgress({ done: 0, total });
    const results: RecipientResult[] = [];
    let done = 0;
    let idx = 0;
    let lastError: unknown;
    // Fan out one POST per recipient (the endpoint takes a single user_id),
    // keeping every recipient's own outcome — not just whichever request
    // happened to resolve last — so the result list below can show exactly
    // who it reached and who it didn't.
    const worker = async () => {
      while (!stopRef.current) {
        const i = idx++;
        if (i >= total) return;
        const r = recipients[i];
        try {
          const res = await sendAdminNotification({ userId: r.id, channel, title: title.trim(), body: body.trim(), category });
          results.push({ id: r.id, name: r.name, ok: true, deliveries: res.deliveries });
        } catch (err) {
          lastError = err;
          results.push({ id: r.id, name: r.name, ok: false, deliveries: [] });
        }
        done += 1;
        setProgress({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    if (!results.some((r) => r.ok) && isForbidden(lastError)) setSendDenied(true);
    const stopped = stopRef.current && done < total;
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    setProgress(null);
    setSentTo(people);
    setSummary({ results, stopped });
    if (stopped) (failCount ? notify.warning : notify.info)(tn("stopped", { done, total }), { id: "admin-notif-send" });
    else if (!failCount) notify.success(tn("resultOk", { n: okCount }), { id: "admin-notif-send" });
    else if (!okCount) notify.error(tn("resultNone"), { id: "admin-notif-send", error: lastError });
    else notify.warning(tn("resultPartial", { ok: okCount, fail: failCount }), { id: "admin-notif-send", body: tn("resultPartialBody") });
    if (okCount && !stopped && !failCount) {
      setTitle("");
      setBody("");
      setSelected(new Map());
    }
  }

  const catOpts = NOTIF_ROW_CATEGORIES.map((c) => ({ value: c, label: tp(`tabs.${c}`), Icon: CATEGORY_META[c].Icon, tone: CATEGORY_META[c].tone }));
  const chOpts = CHANNELS.map((c) => ({ value: c as string, label: t(`notifications.${c}`), hint: tn(`chHint.${c}`), Icon: CHANNEL_META[c].Icon, tone: CHANNEL_META[c].tone }));
  const roleCards = BROADCAST_ROLES.map((r) => ({ value: r, label: tn(`roles.${r}`), Icon: ROLE_META[r] ?? IconUsers, tone: "role" }));
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const noRecipients = Boolean(bad.recipients) && !selected.size;
  const recErrId = `${uid}-recipients-err`;
  const picked = [...selected.values()];
  const roleName = tn(`roles.${broadcastRole}`);
  const channelLabel = t(`notifications.${channel}`);

  const progressBar = progress ? (
    <div className="nsend" role="status">
      <span className="nsend__bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="nsend__txt">{tn("progress", { done: progress.done, total: progress.total })}</span>
      <button
        type="button"
        className="btn btn--line btn--sm"
        onClick={() => {
          stopRef.current = true;
        }}
      >
        {tn("stop")}
      </button>
    </div>
  ) : null;

  const sendButton = sendDenied ? null : (
    <button className="btn btn--pri nsendbtn" type="submit" form={formId} disabled={!!progress} data-ai-target="button:send-notification">
      <IconSend />
      {progress ? t("notifications.sending") : t("notifications.send")}
    </button>
  );
  const deniedNote = sendDenied ? (
    <InlineAlert tone="error" compact>
      {tn("deniedNote")}
    </InlineAlert>
  ) : null;

  return (
    <div className="ncmp">
      <header className="ncmp__hero">
        <span className="ncmp__heroic" aria-hidden="true">
          <IconBell />
        </span>
        <span className="ncmp__herotx">
          <b>{t("notifications.title")}</b>
          <small>{tn("heroLead")}</small>
        </span>
        {canBroadcast ? (
          <ScrollCue className="nmode" role="tablist" aria-label={tn("mode")} data-ai-target="notifications:mode">
            <button type="button" role="tab" className="nmode__b" aria-selected={mode === "individual"} onClick={() => setMode("individual")}>
              <IconUser aria-hidden="true" />
              {tn("modeIndividual")}
            </button>
            <button type="button" role="tab" className="nmode__b" aria-selected={mode === "broadcast"} onClick={() => setMode("broadcast")}>
              <IconUsers aria-hidden="true" />
              {tn("modeBroadcast")}
            </button>
          </ScrollCue>
        ) : null}
      </header>

      <div className="ncmp__grid">
        <div className="ncmp__main">
          {summary?.results.length ? (
            <div ref={resultRef} className="ncmp__res">
              <SendResult results={summary.results} stopped={summary.stopped} queuedNote={t("notifications.queuedNote")} onNew={startOver} people={sentTo} />
            </div>
          ) : null}

          {mode === "broadcast" ? (
            <Step n={1} Icon={IconUsers} title={tn("stepWho")} hint={tn("stepWhoRoleHint")} id={`${uid}-who`} ai="notifications:broadcast-role" label={tn("broadcastRole")}>
              <p className="nlbl">{tn("pickRole")}</p>
              <ChoiceTiles className="nroles" value={broadcastRole} onChange={(v) => setBroadcastRole(v as BroadcastRole)} options={roleCards} label={tn("broadcastRole")} />
            </Step>
          ) : (
            <Step
              n={1}
              Icon={IconUsers}
              title={tn("stepWho")}
              hint={canListUsers ? tn("stepWhoListHint") : tn("stepWhoHint")}
              id={`${uid}-who`}
              ai="notifications:recipients"
              label={tn("recipients")}
              aside={selected.size ? <span className="ncount">{tn("selectedN", { n: selected.size })}</span> : null}
            >
              {picked.length ? (
                <div className="ntray">
                  <div className="ntray__h">
                    <b>
                      {tn("trayTitle")} <span>{picked.length}</span>
                    </b>
                    <button type="button" className="ntray__clear" onClick={() => setSelected(new Map())}>
                      {tn("clearAll")}
                    </button>
                  </div>
                  <ul className="ntray__chips" aria-label={tn("selectedN", { n: picked.length })}>
                    {picked.map((p) => (
                      <li key={p.id}>
                        <PersonAvatar p={p} size="sm" />
                        <span>{userTitle(p)}</span>
                        <button type="button" onClick={() => toggle(p)} aria-label={tn("removeOne", { name: userTitle(p) })} title={tn("removeOne", { name: userTitle(p) })}>
                          <IconClose />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {canListUsers ? (
                <div className="npick">
                  <ScrollCue className="nrtabs" role="group" aria-label={tn("roleTabs")}>
                    {ROLE_TABS.map((r) => {
                      const n = selectedInRole(r);
                      return (
                        <button key={r} type="button" className="nrtab" aria-pressed={roleTab === r} onClick={() => setRoleTab(r)}>
                          {tn(`roles.${r}`)}
                          {n ? <span className="nrtab__n">{n}</span> : null}
                        </button>
                      );
                    })}
                  </ScrollCue>
                  <label className="nsearch" htmlFor={`${uid}-q`}>
                    <IconSearch />
                    <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn("searchPh")} aria-label={tn("searchPh")} autoComplete="off" aria-describedby={noRecipients ? recErrId : undefined} />
                  </label>
                  {users.status === "loading" ? (
                    <PeopleSkeleton />
                  ) : users.status === "error" ? (
                    <InlineAlert tone="error" compact action={{ label: tc("retry"), onClick: users.refresh }}>
                      {tn("usersError")}
                    </InlineAlert>
                  ) : !users.data.length ? (
                    <PeopleEmpty title={tn("noResultTitle")} hint={qLive ? tn("noResultHint") : tn("noUsers")} />
                  ) : (
                    <>
                      <div className="nrcp__list" role="group" aria-label={tn("recipients")} aria-describedby={noRecipients ? recErrId : undefined}>
                        {users.data.map((u) => (
                          <PersonRow key={u.id} p={u} on={selected.has(u.id)} onToggle={() => toggle(u)} roleLabel={roleLabel} title={userTitle(u)} />
                        ))}
                      </div>
                      <div className="nrcp__sum">
                        <span>{tn("shownN", { n: users.data.length })}</span>
                        <button className="btn btn--soft btn--sm" type="button" onClick={() => selectMany(users.data)}>
                          {tn("selectAllRole")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <PeoplePicker selected={selected} onToggle={toggle} roleLabel={roleLabel} title={userTitle} describedBy={noRecipients ? recErrId : undefined} />
              )}
              <FieldError id={recErrId} msg={noRecipients ? tn("noRecipients") : null} />
            </Step>
          )}

          <form id={formId} className="ncmp__form" onSubmit={send} data-ai-target="notifications:compose" noValidate>
            <Step n={2} Icon={IconLayers} title={tn("stepWhat")} hint={tn("stepWhatHint")}>
              <p className="nlbl">{tn("category")}</p>
              <ChoiceTiles className="ncats" value={category} onChange={setCategory} options={catOpts} label={tn("category")} />
              <p className="nlbl">
                {t("notifications.channel")}
                <span className="nlbl__note">
                  <IconBell aria-hidden="true" />
                  {tn("inAppNote")}
                </span>
              </p>
              <ChoiceTiles className="nchans" value={channel} onChange={setChannel} options={chOpts} label={t("notifications.channel")} />
            </Step>

            <Step n={3} Icon={IconEdit} title={tn("stepMsg")} hint={tn("stepMsgHint")}>
              <div className="nfield">
                <div className="nfield__h">
                  <label htmlFor={`${uid}-title`}>{t("form.title")}</label>
                  <span className={`nfield__cnt${title.length > TITLE_MAX * 0.9 ? " is-near" : ""}`} aria-hidden="true">
                    {tn("charsOf", { n: title.length, max: TITLE_MAX })}
                  </span>
                </div>
                <input
                  id={`${uid}-title`}
                  value={title}
                  maxLength={TITLE_MAX}
                  placeholder={tn("titlePh")}
                  autoComplete="off"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setBad((b) => (b.title ? { ...b, title: false } : b));
                  }}
                  aria-invalid={bad.title || undefined}
                  aria-describedby={bad.title ? `${uid}-title-err` : undefined}
                />
                <FieldError id={`${uid}-title-err`} msg={bad.title ? tc("required") : null} />
              </div>
              <div className="nfield">
                <div className="nfield__h">
                  <label htmlFor={`${uid}-body`}>{t("notifications.body")}</label>
                  <span className={`nfield__cnt${body.length > BODY_MAX * 0.9 ? " is-near" : ""}`} aria-hidden="true">
                    {tn("charsOf", { n: body.length, max: BODY_MAX })}
                  </span>
                </div>
                <textarea
                  ref={bodyRef}
                  id={`${uid}-body`}
                  rows={4}
                  value={body}
                  maxLength={BODY_MAX}
                  placeholder={tn("bodyPh")}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setBad((b) => (b.body ? { ...b, body: false } : b));
                  }}
                  aria-invalid={bad.body || undefined}
                  aria-describedby={bad.body ? `${uid}-body-err` : undefined}
                />
                <FieldError id={`${uid}-body-err`} msg={bad.body ? tc("required") : null} />
              </div>
            </Step>
          </form>
        </div>

        <aside ref={sideRef} className={`ncmp__side${sideFits ? " is-sticky" : ""}`} aria-label={tn("preview")}>
          <section className={`npcard${previewOpen ? " is-open" : ""}`}>
            <header className="npcard__h">
              <span className="npcard__ic" aria-hidden="true">
                <IconEye />
              </span>
              <span className="npcard__tx">
                <b>{tn("preview")}</b>
                <small>{tn("previewHint")}</small>
              </span>
              <button type="button" className="npcard__tog" aria-expanded={previewOpen} aria-controls={`${uid}-prev`} onClick={() => setPreviewOpen((o) => !o)} aria-label={previewOpen ? tn("previewHide") : tn("previewShow")}>
                <IconChevronDown />
              </button>
            </header>
            <div id={`${uid}-prev`} className="npcard__b">
              <NotifPreview category={category} categoryLabel={tp(`tabs.${category}`)} channel={channel} channelLabel={channelLabel} title={title} body={body} />
            </div>
            <div className="npcard__aud">
              <span className="nprev__lbl">{tn("toLbl")}</span>
              <AudienceLine mode={mode} people={picked} roleName={roleName} roleKey={broadcastRole} title={userTitle} />
            </div>
            <div className="npcard__act">
              {progressBar}
              {deniedNote}
              {sendButton}
            </div>
          </section>
        </aside>
      </div>

      {/* Phone and tablet: the send action rides in a bar at the bottom. */}
      <div className="ncmp__dock">
        {progress ? (
          <span className="ncmp__dockprog" role="status">
            <span className="nsend__bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            <small>{tn("progress", { done: progress.done, total: progress.total })}</small>
          </span>
        ) : (
          <span className="ncmp__dockaud">
            {mode === "broadcast" ? (
              <>
                <span className="naud__role" aria-hidden="true">
                  {(() => {
                    const RoleIc = ROLE_META[broadcastRole] ?? IconUsers;
                    return <RoleIc />;
                  })()}
                </span>
                <b>{roleName}</b>
              </>
            ) : picked.length ? (
              <>
                <AvatarStack people={picked} />
                <b>{tn("peopleN", { n: picked.length })}</b>
              </>
            ) : (
              <small>{tn("nobodyYet")}</small>
            )}
          </span>
        )}
        {progress ? (
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            {tn("stop")}
          </button>
        ) : sendDenied ? (
          <small className="ncmp__dockdeny">{tn("deniedNote")}</small>
        ) : (
          sendButton
        )}
      </div>
    </div>
  );
}
