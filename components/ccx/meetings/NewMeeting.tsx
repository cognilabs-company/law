"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { createSecureChat, startCall } from "@/lib/services/backend";
import { makeInviteSearch, type InviteSearch } from "@/lib/inviteSearch";
import { regionLabel } from "@/lib/labels";
import { notify } from "@/lib/toast";
import type { SearchOption } from "@/components/SearchSelect";
import { Choice, Note } from "../panel/bits";
import { IcMeeting } from "../icons";
import { IcCalendar } from "./glyphs";
import { DEFAULT_MINUTES, DURATIONS, START_ID, isTransient, type Active } from "./model";
import PeoplePick from "./PeoplePick";

export default function NewMeeting({ onOpen }: { onOpen: (a: Active) => void }) {
  const t = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const tn = useTranslations("common.notify");
  const te = useTranslations("enums");
  const x = useTranslations("admin.ccx.meetings");
  const { session } = useAuth();
  const uid = useId();
  const seller = session?.role === "advocate" || session?.role === "lawyer";
  const canHost = canMakeCalls(session);
  const [title, setTitle] = useState("");
  const [picks, setPicks] = useState<SearchOption[]>([]);
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const startRef = useRef<() => void>(() => undefined);
  const searchRef = useRef<InviteSearch | null>(null);
  const clientLabel = tc("inviteClient");

  useEffect(() => () => notify.dismiss(START_ID), []);

  function searchOptions(q: string) {
    if (!searchRef.current) {
      searchRef.current = makeInviteSearch({
        clientLabel,
        regionLabel: (v) => regionLabel(te, v),
        exclude: () => (session?.id ? [session.id] : []),
        roleLabel: (r) => t(`role.${r}`),
      });
    }
    return searchRef.current(q);
  }

  function changePicks(next: SearchOption[]) {
    setPicks(next);
    if (next.length) setPickErr("");
  }

  function reset() {
    setTitle("");
    setPicks([]);
    setPickErr("");
  }

  const firstName = picks.length ? (picks[0].label === "—" ? "" : picks[0].label).trim() : "";
  const autoTitle = firstName
    ? picks.length > 1
      ? t("defaultTitleMore", { name: firstName, n: picks.length - 1 })
      : t("defaultTitle", { name: firstName })
    : t("defaultTitleNoName");

  async function start() {
    if (busy || !session) return;
    if (picks.length < 1) {
      setPickErr(t("needParticipants"));
      form.current?.querySelector<HTMLInputElement>("[role=combobox]")?.focus();
      return;
    }
    notify.dismiss(START_ID);
    setBusy(true);
    try {
      const ids = picks.map((p) => p.value);
      const room = await createSecureChat(seller ? { client_user_id: ids[0], seller_user_id: session.id } : { client_user_id: session.id || ids[0], seller_user_id: ids[0] });
      const name = title.trim() || autoTitle;
      const call = await startCall(room.id, "video", name, {
        participantUserIds: ids,
        maxDurationMinutes: Number(minutes) || DEFAULT_MINUTES,
      });
      onOpen({
        roomId: room.id,
        callId: call.id,
        callType: "video",
        isCaller: true,
        title: name,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken, hints: call.hints, quality: call.quality } : null,
      });
      reset();
    } catch (e) {
      notify.error(t("startFailed"), {
        id: START_ID,
        error: e,
        map: { 402: t("planLimit"), 403: t("noPermission"), 405: t("backendMissing"), 501: t("backendMissing") },
        action: isTransient(e) ? { label: tn("retry"), onClick: () => startRef.current() } : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    startRef.current = () => void start();
  });

  return (
    <section className="opx-mtg-box opx-mtg-new" data-ai-target="meetings:create" aria-labelledby={`${uid}-h`}>
      <header className="opx-mtg-box__head">
        <span className="opx-mtg-box__ic" aria-hidden="true">
          <IcCalendar size={20} />
        </span>
        <h3 id={`${uid}-h`}>{t("newMeeting")}</h3>
      </header>
      {canHost ? (
        <form
          ref={form}
          className="opx-mtg-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <div className="opx-field">
            <label htmlFor={`${uid}-title`}>{t("titleLabel")}</label>
            <input
              id={`${uid}-title`}
              data-mtg-title=""
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={picks.length ? autoTitle : t("titlePh")}
              autoComplete="off"
              enterKeyHint="go"
            />
          </div>
          <PeoplePick label={t("participants")} value={picks} onChange={changePicks} search={searchOptions} error={pickErr} />
          <Choice label={t("col.duration")} options={DURATIONS.map((n) => ({ value: String(n), label: t("durationMin", { n }) }))} value={minutes} onChange={setMinutes} />
          <p className="opx-mtg-hint">{seller ? t("sellerHint") : t("hint")}</p>
          <footer className="opx-mtg-form__foot">
            <small>{t("enterHint")}</small>
            {title || picks.length ? (
              <button type="button" className="opx-pbtn" onClick={reset}>
                {t("clear")}
              </button>
            ) : null}
            <button type="submit" className="opx-pbtn opx-pbtn--main" disabled={busy} aria-busy={busy || undefined}>
              <IcMeeting size={18} />
              {busy ? t("starting") : t("start")}
            </button>
          </footer>
          <details className="opx-mtg-how">
            <summary>{t("howTitle")}</summary>
            <ol>
              <li>{t("how1")}</li>
              <li>{t("how2")}</li>
              <li>{x("how3")}</li>
            </ol>
          </details>
        </form>
      ) : (
        <Note tone="warn">{t("noPermission")}</Note>
      )}
    </section>
  );
}
