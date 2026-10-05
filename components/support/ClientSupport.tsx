"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { usePaged } from "@/lib/usePaged";
import { contactBlockedOf, isRouteMissing } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  createSupportTicket,
  getSupportTicket,
  listMySupportTickets,
  supportCategoryFor,
  type SupportTicket,
} from "@/lib/services/support";
import Select from "@/components/Select";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { IconChevronLeft, IconHeadset, IconPhone, IconPlus, IconRefresh } from "@/components/icons";
import SupportChat from "./SupportChat";
import { TicketCard } from "./bits";

const LIMIT = 20;

export default function ClientSupport({ ticketId }: { ticketId?: string }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const { session } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meId = session?.id ?? "";
  const topic = params.get("topic") ?? "";
  const [selected, setSelected] = useState(ticketId || params.get("ticket") || "");
  const [extra, setExtra] = useState<SupportTicket | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [formOpen, setFormOpen] = useState(Boolean(topic) || params.get("new") === "1");
  const [form, setForm] = useState({
    category: (SUPPORT_CATEGORIES as readonly string[]).includes(topic) ? topic : topic ? supportCategoryFor(`/${topic}`) : "general",
    priority: "normal",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<unknown>(null);

  const fetcher = useCallback((o: number, l: number, s: AbortSignal) => listMySupportTickets(o, l, s), []);
  const list = usePaged(fetcher, "me", LIMIT, (x) => x.id);
  const setItems = list.setItems;
  const missing = list.status === "error" && isRouteMissing(list.error);
  const sorted = useMemo(() => [...list.items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)), [list.items]);
  const current = sorted.find((x) => x.id === selected) ?? (extra && extra.id === selected ? extra : null);

  const urlTicket = ticketId || params.get("ticket") || "";
  const [prevUrl, setPrevUrl] = useState(urlTicket);
  if (prevUrl !== urlTicket) {
    setPrevUrl(urlTicket);
    if (urlTicket) setSelected(urlTicket);
  }

  useEffect(() => {
    if (!selected || list.status !== "ready" || list.items.some((x) => x.id === selected)) return;
    const c = new AbortController();
    getSupportTicket(selected, c.signal)
      .then((tk) => {
        if (!tk || c.signal.aborted) return;
        setExtra(tk);
        setItems((cur) => (cur.some((x) => x.id === tk.id) ? cur : [tk, ...cur]));
      })
      .catch(() => {});
    return () => c.abort();
  }, [selected, list.status, list.items, setItems]);

  useEffect(() => {
    if (!selected) return;
    const el = document.querySelector<HTMLElement>(".sup");
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > 100) window.scrollTo({ top: window.scrollY + top - 84, behavior: "smooth" });
  }, [selected]);

  const patch = useCallback(
    (tk: SupportTicket) => {
      setItems((cur) => (cur.some((x) => x.id === tk.id) ? cur.map((x) => (x.id === tk.id ? { ...x, ...tk } : x)) : [tk, ...cur]));
      setExtra((e) => (e && e.id === tk.id ? { ...e, ...tk } : e));
    },
    [setItems, setExtra],
  );

  useSupportEvents(
    (e) => {
      if (e.ticket) patch(e.ticket);
      else if (e.kind === "message" && e.message) {
        const m = e.message;
        list.setItems((cur) => cur.map((x) => (x.id === e.ticketId ? { ...x, lastMessage: m.content || x.lastMessage, updatedAt: m.createdAt || x.updatedAt } : x)));
      } else if (e.kind === "closed") list.setItems((cur) => cur.map((x) => (x.id === e.ticketId ? { ...x, status: "closed" } : x)));
      if (e.kind === "message" && e.ticketId !== selected && e.message?.senderUserId !== meId) setUnread((u) => ({ ...u, [e.ticketId]: (u[e.ticketId] ?? 0) + 1 }));
    },
    list.refresh,
  );
  usePoll(list.refresh, 30000, list.status === "ready");

  const open = (id: string) => {
    setSelected(id);
    setUnread((u) => ({ ...u, [id]: 0 }));
    router.replace(`/portal/client/support?ticket=${encodeURIComponent(id)}` as Parameters<typeof router.replace>[0], { scroll: false });
  };

  const back = () => {
    setSelected("");
    router.replace("/portal/client/support" as Parameters<typeof router.replace>[0], { scroll: false });
  };

  const submit = async () => {
    const message = form.message.trim();
    if (message.length < 3 || sending) return;
    setSending(true);
    setFormErr(null);
    try {
      const tk = await createSupportTicket({ message, category: form.category, priority: form.priority, context: { current_path: pathname, source: "support_page" } });
      patch(tk);
      setForm((f) => ({ ...f, message: "" }));
      setFormOpen(false);
      toast(tk.workId ? t("created", { id: tk.workId }) : t("createdPlain"), { tone: "ok" });
      open(tk.id);
    } catch (e) {
      setFormErr(e);
    } finally {
      setSending(false);
    }
  };

  if (missing) {
    return (
      <div className="sup sup--soon">
        <div className="supsoon">
          <span className="supsoon__ic">
            <IconHeadset />
          </span>
          <b>{t("title")}</b>
          <p>{tc("featureSoon")}</p>
          <div className="supsoon__acts">
            <a className="btn btn--line" href="tel:+998787770000">
              <IconPhone />
              {t("callUs")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`sup${selected ? " sup--chat" : ""}`}>
      <section className="sup__side">
        <div className="sup__head">
          <div>
            <h2>{t("title")}</h2>
            <p>{t("lead")}</p>
          </div>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setFormOpen((v) => !v)} data-ai-target="button:operator-support">
            <IconHeadset />
            {t("newTicket")}
          </button>
        </div>

        {formOpen ? (
          <form
            className="supform"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="supform__row">
              <label>
                <span>{t("category")}</span>
                <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} ariaLabel={t("category")} options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
              </label>
              <label>
                <span>{t("priority")}</span>
                <Select value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} ariaLabel={t("priority")} options={SUPPORT_PRIORITIES.map((p) => ({ value: p, label: t(`priorities.${p}`) }))} />
              </label>
            </div>
            <label className="supform__msg">
              <span>{t("message")}</span>
              <textarea
                value={form.message}
                onChange={(e) => {
                  setForm((f) => ({ ...f, message: e.target.value }));
                  if (formErr) setFormErr(null);
                }}
                placeholder={t("messagePh")}
                rows={3}
                maxLength={4000}
              />
            </label>
            {formErr ? contactBlockedOf(formErr) ? <ContactBlockedNote error={formErr} /> : <p className="supchat__err" role="alert">{isRouteMissing(formErr) ? tc("featureSoon") : errorText(formErr, tc)}</p> : null}
            <div className="supform__acts">
              <button type="button" className="btn btn--line btn--sm" onClick={() => setFormOpen(false)}>
                {t("cancel")}
              </button>
              <button type="submit" className="btn btn--pri btn--sm" disabled={sending || form.message.trim().length < 3}>
                <IconPlus />
                {t("submit")}
              </button>
            </div>
          </form>
        ) : null}

        <div className="sup__list" data-ai-target="support:ticket-list">
          {list.status === "loading" ? (
            [0, 1, 2].map((i) => <div key={i} className="supcard supcard--ghost" aria-hidden="true" />)
          ) : list.status === "error" ? (
            <div className="sup__empty">
              <p>{errorText(list.error, tc)}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={list.reload}>
                <IconRefresh />
                {tc("retry")}
              </button>
            </div>
          ) : !sorted.length ? (
            <div className="sup__empty">
              <IconHeadset />
              <p>{t("empty")}</p>
            </div>
          ) : (
            sorted.map((tk) => <TicketCard key={tk.id} ticket={tk} active={tk.id === selected} unread={unread[tk.id]} onOpen={() => open(tk.id)} />)
          )}
          {list.hasMore ? (
            <button type="button" className="btn btn--line btn--sm sup__more" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
              {tc("loadMore")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="sup__main">
        {current ? (
          <>
            <button type="button" className="sup__back" onClick={back}>
              <IconChevronLeft />
              {t("back")}
            </button>
            <SupportChat key={current.id} ticket={current} meId={meId} mode="client" canWrite={current.status !== "closed"} onTicket={patch} onMessage={(m) => patch({ ...current, lastMessage: m.content, updatedAt: m.createdAt || new Date().toISOString() })} />
          </>
        ) : (
          <div className="sup__pick">
            <IconHeadset />
            <p>{selected && list.status === "ready" ? tc("notFound") : t("pickTicket")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
