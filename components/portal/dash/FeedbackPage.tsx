"use client";

import "./dash1920.css";
import "./feedback1920.css";
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bug, CircleCheck, Clock3, ImageUp, Lightbulb, Loader, MessageCircle, MessageSquareWarning, Send, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useResource } from "@/lib/useResource";
import { createSupportTicket, isClosedStatus, listMySupportTickets, type SupportTicket } from "@/lib/services/support";
import { shortDateTime } from "@/lib/date";
import { notify } from "@/lib/toast";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import { groupsFor } from "../portalNav";

// "Xato va takliflar" (reference/design-lexgo-1920/1c, 2c): the same page for
// the client, the advocate and the lawyer. Requests travel as support
// tickets (POST /support/tickets) marked by `source`, so they reach the
// support team's queue and their answers come back through /support.

type Kind = "bug" | "idea" | "other";
const KINDS: { k: Kind; Icon: typeof Bug }[] = [
  { k: "bug", Icon: Bug },
  { k: "idea", Icon: Lightbulb },
  { k: "other", Icon: MessageCircle },
];
const SOURCE: Record<Kind, string> = { bug: "feedback_bug", idea: "feedback_suggestion", other: "feedback_other" };
const CATEGORY: Record<Kind, string> = { bug: "technical", idea: "general", other: "general" };
const MAX = 1000;
const MAX_BYTES = 5 * 1024 * 1024;

// The screenshot rides in the ticket's context as a downscaled JPEG data URL:
// support tickets have no attachment upload of their own yet
// (docs/LEXGO_1920_BACKEND_QUESTIONS.md §1).
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function FeedbackPage({ role }: { role: "client" | "advocate" | "lawyer" }) {
  const t = useTranslations("lxFeedback");
  const tx = useTranslations("lxShell");
  const locale = useLocale();
  const pathname = usePathname();
  const sections = useMemo(() => groupsFor(role).flatMap((g) => g.items).filter((n) => n.key !== "feedback"), [role]);
  const [kind, setKind] = useState<Kind>("bug");
  const [section, setSection] = useState(sections[0]?.key ?? "dashboard");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [shotErr, setShotErr] = useState("");
  const [notifyMe, setNotifyMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const mine = useResource<SupportTicket>(async () => (await listMySupportTickets(0, 50)).items.filter((x) => x.source.startsWith("feedback") || x.workId.startsWith("FB")), []);

  const subjErr = tried && subject.trim().length < 3;
  const detErr = tried && details.trim().length < 10;

  const take = (f: File | undefined | null) => {
    setShotErr("");
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) return setShotErr(t("badType"));
    if (f.size > MAX_BYTES) return setShotErr(t("tooBig"));
    setShot(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    take(e.dataTransfer.files?.[0]);
  };
  const clear = () => {
    setKind("bug");
    setSection(sections[0]?.key ?? "dashboard");
    setSubject("");
    setDetails("");
    setShot(null);
    setShotErr("");
    setNotifyMe(true);
    setTried(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (subject.trim().length < 3 || details.trim().length < 10 || busy) return;
    setBusy(true);
    try {
      const screenshot = shot ? { name: shot.name, mime: "image/jpeg", data_url: await shrink(shot) } : undefined;
      const sec = sections.find((s) => s.key === section);
      const ticket = await createSupportTicket({
        subject: subject.trim(),
        message: details.trim(),
        category: CATEGORY[kind],
        priority: kind === "bug" ? "high" : "normal",
        source: SOURCE[kind],
        context: {
          feedback_type: kind === "idea" ? "suggestion" : kind,
          module: section,
          page_url: sec?.href ?? pathname,
          role,
          notify_when_answered: notifyMe,
          ...(screenshot ? { screenshot } : {}),
        },
      });
      notify.success(t("sent", { id: ticket.workId || ticket.id.slice(0, 8) }));
      clear();
      void mine.refresh();
    } catch {
      notify.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const kindOf = (x: SupportTicket): Kind => (x.source === SOURCE.idea ? "idea" : x.source === SOURCE.other ? "other" : "bug");

  return (
    <div className="lfb">
      <form className="lx-card lfb-form" onSubmit={submit} noValidate>
        <div className="lfb-head">
          <span className="lfb-head__ic"><MessageSquareWarning /></span>
          <div>
            <h2 className="lfb-h">{t("title")}</h2>
            <p className="lx-sub">{t("lead")}</p>
          </div>
        </div>

        <fieldset className="lfb-kinds">
          <legend className="lfb-lbl">{t("kind")}</legend>
          <div className="lfb-kinds__row" role="radiogroup" aria-label={t("kind")}>
            {KINDS.map(({ k, Icon }) => (
              <label key={k} className={`lfb-kind${kind === k ? " on" : ""}`}>
                <input type="radio" name="lfb-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span className="lfb-kind__ic"><Icon /></span>
                <span className="lfb-kind__t"><b>{t(`kinds.${k}.t`)}</b><small>{t(`kinds.${k}.s`)}</small></span>
                <span className="lfb-kind__dot" aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lfb-two">
          <div className="lfb-field lfb-sel">
            <span className="lfb-lbl" id="lfb-sec">{t("section")}</span>
            <Select value={section} onChange={setSection} labelId="lfb-sec" options={sections.map((s) => ({ value: s.key, label: tx(`nav.${role}.${s.key}`) }))} />
          </div>
          <label className="lfb-field">
            <span className="lfb-lbl">{t("subject")}</span>
            <input className={`lfb-input${subjErr ? " is-bad" : ""}`} value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} placeholder={t("subjectPh")} aria-invalid={subjErr || undefined} />
            {subjErr ? <small className="lfb-err">{t("needSubject")}</small> : null}
          </label>
        </div>

        <label className="lfb-field">
          <span className="lfb-lbl lfb-lbl--row"><span>{t("details")}</span><small>{details.length} / {MAX}</small></span>
          <textarea className={`lfb-input lfb-area${detErr ? " is-bad" : ""}`} value={details} maxLength={MAX} onChange={(e) => setDetails(e.target.value)} placeholder={t("detailsPh")} aria-invalid={detErr || undefined} />
          {detErr ? <small className="lfb-err">{t("needDetails")}</small> : null}
        </label>

        <div className="lfb-field">
          <span className="lfb-lbl">{t("shot")}</span>
          <div
            className={`lfb-drop${drag ? " is-drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <span className="lfb-drop__ic"><ImageUp /></span>
            <span className="lfb-drop__t">
              <b>{shot ? shot.name : t("drop")}</b>
              <small>{shotErr || t("dropHint")}</small>
            </span>
            {shot ? (
              <button type="button" className="btn btn--line btn--sm" onClick={() => setShot(null)}><X />{t("remove")}</button>
            ) : (
              <button type="button" className="btn btn--line btn--sm" onClick={() => input.current?.click()}>{t("pick")}</button>
            )}
            <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>

        <CheckBox checked={notifyMe} onChange={setNotifyMe} className="lfb-notify">{t("notify")}</CheckBox>

        <div className="lfb-foot">
          <span className="lfb-eta"><Clock3 />{t("eta")}</span>
          <button type="button" className="btn btn--line btn--lg" onClick={clear} disabled={busy}>{t("clear")}</button>
          <button type="submit" className="btn btn--pri btn--lg" disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader className="lfb-spin" /> : <Send />}
            {busy ? t("sending") : t("send")}
          </button>
        </div>
      </form>

      <aside className="lfb-side">
        <section className="lx-card lfb-list" aria-labelledby="lfb-list-h">
          <h2 id="lfb-list-h" className="lfb-h3">{t("list")}</h2>
          {mine.status === "loading" ? (
            <div className="cx-skel" />
          ) : mine.status === "error" ? (
            <p className="lxs-muted">{t("listError")}</p>
          ) : !mine.data.length ? (
            <p className="lxs-muted">{t("listEmpty")}</p>
          ) : (
            <ul>
              {mine.data.slice(0, 6).map((x) => {
                const done = isClosedStatus(x.status);
                return (
                  <li key={x.id}>
                    <Link href={`/portal/${role}/support/${x.id}`} className="lfb-item">
                      <span className="lfb-item__h">
                        <span className="lfb-item__id">{[x.workId, t(`kinds.${kindOf(x)}.t`)].filter(Boolean).join(" · ")}</span>
                        <span className={`lfb-st${done ? " is-ok" : ""}`}>{done ? <CircleCheck /> : <Loader />}{done ? t("resolved") : t("inReview")}</span>
                      </span>
                      <b>{x.title || x.description}</b>
                      <small>{shortDateTime(x.createdAt, locale)}</small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="lfb-tips" aria-labelledby="lfb-tips-h">
          <h2 id="lfb-tips-h">{t("tipsTitle")}</h2>
          <ol>
            {["1", "2", "3"].map((n) => (
              <li key={n}><span>{n}</span>{t(`tips.${n}`)}</li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
