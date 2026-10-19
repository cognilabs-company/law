"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Track, type LocalParticipant, type Participant, type TrackPublication } from "livekit-client";
import type { CallRefs, CallView } from "@/components/chat/CallRoom";
import CallBackgroundPicker from "@/components/chat/CallBackgroundPicker";
import { CaptureShield, MeetingWatermark } from "@/components/chat/MeetingGuard";
import type { SearchOption } from "@/components/SearchSelect";
import { fmtUzs } from "@/lib/money";
import { IconBgPerson, IconChat, IconCheck, IconClock, IconClose, IconDownload, IconGrid, IconMic, IconMicOff, IconMonitor, IconMoreHorizontal, IconPause, IconPhone, IconPlay, IconPlus, IconRecord, IconRefresh, IconSearch, IconSend, IconUser, IconUserPlus, IconUsers, IconVideo } from "@/components/icons";
import { Avatar, Btn, Dialog, Seg, useHost, useOs } from "../../kit/kit";
import "./call.css";

// A call as a desktop program. On the Mac it is FaceTime: the picture fills
// the window, the title floats over it beside the traffic lights, and the
// controls sit in a dark glass capsule at the bottom; requests arrive as
// notification banners in the corner. On Windows it is a Teams meeting
// window: one dark command bar across the top — the clock, chat, people,
// view and more, then camera, mic, share and the red Leave — with the
// people and chat in a pane on the right. The room itself (media, roster,
// recording, extensions, the capture guard) is CallRoom's; this only draws
// it and hands every press back.

const cols = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function DeskCall({ v, refs }: { v: CallView; refs: CallRefs }) {
  const t = useTranslations("call");
  const os = useOs();
  const mac = os === "mac";
  const { menu, dragWindow, zoomWindow } = useHost();
  const { root: rootRef, top: topRef, audio: audioRef, stage: stageRef, grid: gridRef, strip: stripRef, chatEnd: chatEndRef } = refs;

  const solo = v.count <= 1;
  const duo = !v.stage && v.strip.length === 2;
  const endLabel = v.isCaller ? t("endAll") : t("end");
  const drag = (e: React.PointerEvent<HTMLElement>) => !(e.target as HTMLElement).closest("button,input,textarea,a,[role=tab]") && dragWindow?.(e);
  const zoom = (e: MouseEvent) => !(e.target as HTMLElement).closest("button") && zoomWindow?.();
  const at = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return mac ? { clientX: r.left, clientY: r.top - 8, up: true } : { clientX: r.left, clientY: r.bottom + 4 };
  };

  const moreMenu = (e: MouseEvent<HTMLElement>) =>
    menu?.(at(e), t("more"), [
      ...(mac && v.video
        ? [
            { id: "grid", label: t("layoutGrid"), icon: <IconGrid />, checked: v.layout === "grid", onSelect: () => v.setLayout("grid") },
            { id: "speaker", label: t("layoutSpeaker"), icon: <IconUser />, checked: v.layout === "speaker", onSelect: () => v.setLayout("speaker") },
            { sep: true as const, id: "s0" },
          ]
        : []),
      ...(v.cam.canSwitch ? [{ id: "switch", label: t("switchCam"), icon: <IconRefresh />, disabled: v.cam.busy, onSelect: v.cam.switchCam }] : []),
      ...(v.bg.ok ? [{ id: "bg", label: t("bg.button"), icon: <IconBgPerson />, checked: v.bg.active, onSelect: () => v.bg.setOpen(true) }] : []),
      ...(v.rec.can
        ? [
            {
              id: "rec",
              label: v.rec.on ? t("recStop", { mode: t(v.rec.mode === "screen" ? "recModeScreen" : "recModeAudio") }) : v.rec.req ? t("recWaitingShort") : t("recStart"),
              icon: <IconRecord />,
              disabled: !!v.rec.req,
              danger: v.rec.on,
              onSelect: () => v.rec.toggle(),
            },
          ]
        : []),
      ...(v.ext.free || v.ext.can || v.pause.show ? [{ sep: true as const, id: "s1" }] : []),
      ...(v.ext.free ? [{ id: "free", label: t("extendFree", { n: v.ext.free }), hint: t("minutesN", { n: v.ext.free }), icon: <IconPlus />, disabled: v.ext.busy || v.paused, onSelect: v.ext.extendFree }] : []),
      ...(v.ext.can ? [{ id: "paid", label: `${t("extendPaid")}…`, icon: <IconClock />, disabled: v.ext.busy || v.paused, onSelect: () => v.ext.setOpen(true) }] : []),
      ...(v.pause.show ? [{ id: "pause", label: v.pause.busy ? t("pauseWorking") : v.paused ? t("resumeAction") : t("pauseAction"), icon: v.paused ? <IconPlay /> : <IconPause />, disabled: v.pause.busy, onSelect: v.pause.toggle }] : []),
    ]);
  const viewMenu = (e: MouseEvent<HTMLElement>) =>
    menu?.(at(e), t("view"), [
      { id: "grid", label: t("layoutGrid"), icon: <IconGrid />, checked: v.layout === "grid", onSelect: () => v.setLayout("grid") },
      { id: "speaker", label: t("layoutSpeaker"), icon: <IconUser />, checked: v.layout === "speaker", onSelect: () => v.setLayout("speaker") },
    ]);
  const togglePanel = (p: "chat" | "people") => v.openPanel(v.panel === p ? "" : p);

  const tile = (p: Participant, extra?: { big?: boolean; share?: boolean; small?: boolean; self?: boolean }) => (
    <DeskTile
      key={`${p.identity}${extra?.share ? ":s" : ""}${extra?.big ? ":b" : ""}`}
      p={p}
      name={v.nameOf(p)}
      you={t("you")}
      camOff={t("camOff")}
      share={extra?.share}
      mirror={p.isLocal && !extra?.share && v.mirror}
      rec={!extra?.share && v.isRecording(p)}
      recLabel={t("a11yRecording")}
      big={extra?.big}
      small={extra?.small}
      self={extra?.self}
      onClick={extra?.big || v.count <= 1 ? undefined : () => v.pin(p.identity)}
    />
  );

  const top = mac ? (
    <header className="dxc-top" ref={topRef} onPointerDown={drag} onDoubleClick={zoom}>
      <div className="dxc-top__t">
        <b>{v.title}</b>
        <small>
          <i className={`dxc-dot is-${v.status}`} aria-hidden />
          {v.statusLabel} · {v.mmss(v.elapsed)}
          {v.remaining != null ? <em className={v.paused ? "is-paused" : v.remaining <= 120 ? "is-low" : ""}> · {v.paused ? t("paused") : `${t("remaining")} ${v.mmss(v.remaining)}`}</em> : null}
        </small>
      </div>
      <div className="dxc-top__r">
        {v.rec.on || v.rec.byNames.length ? (
          <span className="dxc-recpill" title={v.rec.label}>
            <i />
            REC
          </span>
        ) : null}
        <button type="button" className={`dxc-hud${v.panel === "people" ? " is-on" : ""}`} onClick={() => togglePanel("people")} title={t("rosterTitle")} aria-label={t("rosterTitle")} aria-pressed={v.panel === "people"}>
          <IconUsers />
          <span>{v.count}</span>
        </button>
        <button type="button" className={`dxc-hud${v.panel === "chat" ? " is-on" : ""}`} onClick={() => togglePanel("chat")} title={t("chatTab")} aria-label={t("chatTab")} aria-pressed={v.panel === "chat"}>
          <IconChat />
          {v.chat.unread ? <i className="dxc-badge">{v.chat.unread > 9 ? "9+" : v.chat.unread}</i> : null}
        </button>
      </div>
    </header>
  ) : (
    <header className="dxc-top" ref={topRef} onPointerDown={drag} onDoubleClick={zoom}>
      <div className="dxc-top__t">
        <span className={`dxc-clock${v.rec.on || v.rec.byNames.length ? " is-rec" : ""}`} title={v.rec.on || v.rec.byNames.length ? v.rec.label : v.statusLabel}>
          <i className={`dxc-dot is-${v.status}`} aria-hidden />
          {v.mmss(v.elapsed)}
        </span>
        <b>{v.title}</b>
        {v.status !== "live" || v.statusLabel !== t("live") ? <small>{v.statusLabel}</small> : null}
        {v.remaining != null ? <span className={`dxc-left${v.paused ? " is-paused" : v.remaining <= 120 ? " is-low" : ""}`}>{v.paused ? t("paused") : `${t("remaining")} ${v.mmss(v.remaining)}`}</span> : null}
      </div>
      <div className="dxc-cmds">
        <Cmd icon={<IconChat />} label={t("chatTab")} on={v.panel === "chat"} badge={v.chat.unread} onClick={() => togglePanel("chat")} />
        <Cmd icon={<IconUsers />} label={t("rosterTitle")} on={v.panel === "people"} count={v.count} onClick={() => togglePanel("people")} />
        {v.video ? <Cmd icon={v.layout === "grid" ? <IconGrid /> : <IconUser />} label={t("view")} onClick={viewMenu} /> : null}
        <Cmd icon={<IconMoreHorizontal />} label={t("more")} onClick={moreMenu} />
        <i className="dxc-cmds__sep" aria-hidden />
        {v.cam.control ? <Cmd icon={<IconVideo />} label={t("cam")} off={!v.cam.on} slash={!v.cam.on} title={v.cam.upgrade ? t("camUpgrade") : v.cam.on ? t("camOff2") : t("camOn")} disabled={v.cam.busy} onClick={v.cam.toggle} /> : null}
        <Cmd icon={v.mic.on ? <IconMic /> : <IconMicOff />} label={t("mic")} off={!v.mic.on} title={v.mic.hostMuted && !v.mic.on ? t("mutedByHost") : v.mic.on ? t("micMute") : t("micUnmute")} disabled={v.mic.hostMuted && !v.mic.on} onClick={v.mic.toggle} />
        {v.share.can ? <Cmd icon={<IconMonitor />} label={v.share.on ? t("screenStop") : t("screen")} on={v.share.on} onClick={v.share.toggle} /> : null}
        <button type="button" className="dxc-leave" onClick={v.hangUp} title={endLabel}>
          <IconPhone />
          <span>{endLabel}</span>
        </button>
      </div>
    </header>
  );

  const notes: ReactNode[] = [];
  if (v.audioBlocked)
    notes.push(
      <Note key="sound" tone="warn" icon={<IconMicOff />} title={t("soundBlocked")} acts={<Btn small kind="primary" onClick={v.enableSound}>{t("enableSound").replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "")}</Btn>} />,
    );
  if (v.declinedName) notes.push(<Note key="declined" tone="warn" icon={<IconPhone />} title={t("noAnswerTitle")} text={t("noAnswerLead", { name: v.declinedName })} />);
  if (v.rec.file)
    notes.push(
      <Note
        key="recfile"
        tone="ok"
        icon={<IconRecord />}
        title={`${t("recReady")} · ${t(v.rec.file.mode === "screen" ? "recModeScreen" : "recModeAudio")}`}
        text={`${v.mmss(Math.round(v.rec.file.durationMs / 1000))} · ${(v.rec.file.blob.size / 1024 / 1024).toFixed(1)} MB · .${v.rec.file.ext}`}
        onClose={v.rec.dismiss}
        closeLabel={t("close")}
        acts={
          <>
            <Btn small kind="primary" icon={<IconDownload />} onClick={v.rec.save}>
              {t("recSave")}
            </Btn>
            {v.rec.url ? (
              <a className="dx-btn dx-btn--default dx-btn--sm" href={v.rec.url} target="_blank" rel="noopener noreferrer" download>
                <span>{t("recOpen")}</span>
              </a>
            ) : null}
          </>
        }
      />,
    );
  if (v.rec.req)
    notes.push(
      <Note
        key="recreq"
        icon={<IconRecord />}
        title={t("recWaiting", { s: v.rec.req.left })}
        text={t("recWaitingLead", { mode: t(v.rec.req.mode === "screen" ? "recModeScreen" : "recModeAudio") })}
        acts={<Btn small onClick={v.rec.cancelReq}>{t("cancel")}</Btn>}
      />,
    );
  if (v.rec.asks.length) {
    const a = v.rec.asks[0];
    notes.push(
      <Note
        key="recask"
        tone="err"
        icon={<IconRecord />}
        role="dialog"
        title={t("recAskTitle", { name: a.name })}
        text={`${t("recAskLead", { mode: t(a.mode === "screen" ? "recModeScreen" : "recModeAudio") })}${v.rec.asks.length > 1 ? ` · +${v.rec.asks.length - 1}` : ""}`}
        acts={
          <>
            <Btn small onClick={() => v.rec.answer(a.id, false)}>
              {t("recDeny")}
            </Btn>
            <Btn small kind="primary" onClick={() => v.rec.answer(a.id, true)}>
              {t("recAllow")}
            </Btn>
          </>
        }
      />,
    );
  }
  if (v.paused) {
    const ask = v.ext.isPayer && v.ext.pending;
    const p = v.ext.pending;
    notes.push(
      <Note
        key="pause"
        tone={ask ? "info" : "warn"}
        icon={<IconClock />}
        role={ask ? "dialog" : "status"}
        title={ask ? t("extAskTitle") : t("pausedTitle")}
        text={p ? (ask ? t("extAskLead", { minutes: p.minutes, amount: fmtUzs(p.amount) }) : t("pausedLead", { minutes: p.minutes, amount: fmtUzs(p.amount) })) : t("pausedLeadPlain")}
        foot={
          <>
            {p && v.ext.hasDeadline && v.ext.left > 0 ? <span className={`dxc-note__left${v.ext.left <= 60 ? " is-low" : ""}`}>{t("extAnswerLeft", { time: v.mmss(v.ext.left) })}</span> : null}
            <small>{ask ? (v.ext.answer.mine ? (v.ext.answer.mine === "yes" ? t("extAnsYesNote") : t("extAnsNoNote")) : t("extAskNote")) : v.ext.answer.peer === "yes" ? t("extPeerYes") : v.ext.answer.peer === "no" ? t("extPeerNo") : t("pausedExpiry")}</small>
          </>
        }
        acts={
          ask && !v.ext.answer.mine ? (
            <>
              <Btn small onClick={() => v.ext.respond(false)}>
                {t("extDecline")}
              </Btn>
              <Btn small kind="primary" icon={<IconPlus />} onClick={() => v.ext.respond(true)}>
                {t("extConfirm")}
              </Btn>
            </>
          ) : undefined
        }
      />,
    );
  }

  const stage = (
    <main className={`dxc-stage${v.guard.shielded ? " is-guard" : ""}`} ref={stageRef} data-ai-private onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      {v.stage ? (
        <div className="dxc-speaker">
          <div className="dxc-speaker__main">
            {tile(v.stage, { big: true, share: v.stageIsShare })}
            {v.stageIsShare ? (
              <span className="dxc-sharing">
                <IconMonitor />
                {v.stage.isLocal ? t("youShare") : t("sharing", { name: v.nameOf(v.stage) })}
              </span>
            ) : null}
          </div>
          {v.strip.length ? (
            <div className="dxc-strip" ref={stripRef}>
              {v.strip.map((p) => tile(p, { small: true }))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={`dxc-grid${duo ? " is-duo" : ""}${solo ? " is-solo" : ""}`} ref={gridRef} style={{ "--cols": duo ? 1 : cols(v.strip.length) } as CSSProperties}>
          {v.strip.map((p) => tile(p, { self: duo && p.isLocal }))}
        </div>
      )}
      {solo ? (
        <div className="dxc-wait" role="status">
          <span className="dxc-wait__ring" aria-hidden>
            <Avatar name={v.title.split("·").pop()?.trim() || v.title} size={mac ? 84 : 72} />
          </span>
          <b>{v.title}</b>
          <span>{v.status === "error" ? t("error") : v.status === "connecting" ? t("connecting") : t("waitingOthers")}</span>
        </div>
      ) : null}
      {v.toasts.length ? (
        <div className="dxc-toasts" aria-live="polite">
          {v.toasts.map((x) => (
            <span key={x.id} className={`dxc-toast is-${x.kind}`}>
              {x.text}
            </span>
          ))}
        </div>
      ) : null}
      {notes.length ? <div className="dxc-notes">{notes}</div> : null}
      <MeetingWatermark label={v.wmLabel} />
      <CaptureShield reason={v.guard.reason} title={v.guard.captured ? t("guardCaptureTitle") : t("guardTitle")} lead={v.guard.captured ? t("guardCaptureLead") : t("guardLead")} note={t("guardNote")} />
    </main>
  );

  return (
    <div className={`dxc${v.panel ? " has-side" : ""}`} ref={rootRef}>
      <div ref={audioRef} hidden />
      {top}
      <div className="dxc-body">
        <div className="dxc-main">
          {stage}
          {mac ? (
            <footer className="dxc-dock" data-call-bar="">
              <div className="dxc-dock__cap">
                <Round icon={v.mic.on ? <IconMic /> : <IconMicOff />} label={v.mic.hostMuted && !v.mic.on ? t("mutedByHost") : v.mic.on ? t("micMute") : t("micUnmute")} lit={!v.mic.on} disabled={v.mic.hostMuted && !v.mic.on} onClick={v.mic.toggle} />
                {v.cam.control ? <Round icon={<IconVideo />} label={v.cam.upgrade ? t("camUpgrade") : v.cam.on ? t("camOff2") : t("camOn")} lit={!v.cam.on} slash={!v.cam.on} disabled={v.cam.busy} onClick={v.cam.toggle} /> : null}
                {v.share.can ? <Round icon={<IconMonitor />} label={v.share.on ? t("screenStop") : t("screen")} accent={v.share.on} onClick={v.share.toggle} /> : null}
                <Round icon={<IconMoreHorizontal />} label={t("more")} onClick={moreMenu} />
                <Round icon={<IconPhone />} label={endLabel} end onClick={v.hangUp} />
              </div>
            </footer>
          ) : (
            <span hidden data-call-bar="" />
          )}
        </div>
        {v.panel ? <Side v={v} chatEnd={chatEndRef} /> : null}
      </div>

      {v.bg.open && v.bg.ok ? (
        <div className="dxc-bg" data-call-bar="">
          <CallBackgroundPicker camOn={v.cam.on} onClose={v.bg.close} onPick={v.bg.pick} />
        </div>
      ) : null}

      <Dialog
        open={v.rec.picking}
        title={t("recPickTitle")}
        onClose={() => v.rec.setPicking(false)}
        actions={
          <>
            <Btn onClick={() => v.rec.setPicking(false)}>{t("cancel")}</Btn>
            {v.rec.canScreen ? (
              <Btn icon={<IconMonitor />} onClick={() => v.rec.toggle("screen")}>
                {t("recModeScreen")}
              </Btn>
            ) : null}
            <Btn kind="primary" icon={<IconMic />} onClick={() => v.rec.toggle("audio")}>
              {t("recModeAudio")}
            </Btn>
          </>
        }
      >
        <p className="dxc-dlg-lead">{t("recPickLead")}</p>
      </Dialog>

      <Dialog
        open={v.ext.open && !v.paused}
        title={t("extendPaid")}
        onClose={() => v.ext.setOpen(false)}
        onSubmit={v.ext.extendPaid}
        width={400}
        actions={
          <>
            <Btn onClick={() => v.ext.setOpen(false)} disabled={v.ext.busy}>
              {t("close")}
            </Btn>
            <Btn kind="primary" type="submit" busy={v.ext.busy}>
              {v.ext.busy ? t("extendSending") : t("extendAsk")}
            </Btn>
          </>
        }
      >
        <p className="dxc-dlg-lead">{t("extendPrice", { price: fmtUzs(v.ext.price) })}</p>
        <Seg label={t("extendPaid")} items={[5, 10, 15, 30].map((m) => ({ id: String(m), label: t("minutesN", { n: m }) }))} value={String(v.ext.minutes)} onChange={(m) => v.ext.setMinutes(Number(m))} />
        <p className="dxc-dlg-total">{t("extendTotal", { amount: fmtUzs(v.ext.minutes * v.ext.price) })}</p>
      </Dialog>
    </div>
  );
}

// A Teams command-bar button: an icon over its label.
function Cmd({ icon, label, onClick, on, off, slash, badge, count, title, disabled }: { icon: ReactNode; label: string; onClick: (e: MouseEvent<HTMLElement>) => void; on?: boolean; off?: boolean; slash?: boolean; badge?: number; count?: number; title?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`dxc-cmd${on ? " is-on" : ""}${off ? " is-off" : ""}${slash ? " is-slash" : ""}`} onClick={onClick} title={title || label} aria-label={title || label} aria-pressed={on || undefined} disabled={disabled}>
      <span className="dxc-cmd__i">
        {icon}
        {badge ? <i className="dxc-badge">{badge > 9 ? "9+" : badge}</i> : null}
        {count ? <em>{count}</em> : null}
      </span>
      <span className="dxc-cmd__l">{label}</span>
    </button>
  );
}

// A FaceTime capsule button: round, dark glass; white when it is "off".
function Round({ icon, label, onClick, lit, slash, accent, end, disabled }: { icon: ReactNode; label: string; onClick: (e: MouseEvent<HTMLElement>) => void; lit?: boolean; slash?: boolean; accent?: boolean; end?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`dxc-round${lit ? " is-lit" : ""}${slash ? " is-slash" : ""}${accent ? " is-accent" : ""}${end ? " is-end" : ""}`} onClick={onClick} title={label} aria-label={label} disabled={disabled}>
      {icon}
    </button>
  );
}

// A request or a state the call has to show without stopping it: a
// notification banner on the Mac, a toast card on Windows.
function Note({ title, text, icon, tone = "info", acts, foot, role = "status", onClose, closeLabel }: { title: string; text?: string; icon?: ReactNode; tone?: "info" | "ok" | "warn" | "err"; acts?: ReactNode; foot?: ReactNode; role?: "status" | "dialog"; onClose?: () => void; closeLabel?: string }) {
  return (
    <section className={`dxc-note is-${tone}`} role={role} aria-label={title}>
      {icon ? (
        <span className="dxc-note__ic" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="dxc-note__b">
        <b>{title}</b>
        {text ? <p>{text}</p> : null}
        {foot}
        {acts ? <div className="dxc-note__acts">{acts}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className="dxc-note__x" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <IconClose />
        </button>
      ) : null}
    </section>
  );
}

// The pane on the right: the meeting's chat and its people.
function Side({ v, chatEnd }: { v: CallView; chatEnd: CallRefs["chatEnd"] }) {
  const t = useTranslations("call");
  const { menu } = useHost();
  const panel = v.panel === "chat" ? "chat" : "people";
  const personMenu = (e: MouseEvent<HTMLElement>, id: string, name: string, mic: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    menu?.({ clientX: r.left, clientY: r.bottom + 4 }, name, [
      ...(v.perms?.canMute ? [{ id: "mute", label: mic ? t("mute") : t("unmute"), icon: mic ? <IconMicOff /> : <IconMic />, onSelect: () => v.mute(id, mic) }] : []),
      ...(v.perms?.canKick ? [{ id: "kick", label: t("removeParticipant"), icon: <IconClose />, danger: true, onSelect: () => v.kick(id) }] : []),
    ]);
  };
  return (
    <aside className="dxc-side" data-ai-private aria-label={panel === "chat" ? t("chatTab") : t("rosterTitle")}>
      <header className="dxc-side__h">
        <Seg
          small
          label={t("more")}
          value={panel}
          onChange={(p) => v.openPanel(p)}
          items={[
            { id: "chat", label: t("chatTab"), count: v.chat.unread || undefined },
            { id: "people", label: `${t("rosterTitle")} · ${v.count}` },
          ]}
        />
        <button type="button" className="dxc-side__x" onClick={() => v.openPanel("")} aria-label={t("close")} title={t("close")}>
          <IconClose />
        </button>
      </header>
      {panel === "chat" ? (
        <>
          <div className="dxc-chat">
            {!v.chat.messages.length ? (
              <p className="dxc-chat__empty">
                <IconChat />
                {t("noMessages")}
              </p>
            ) : null}
            {v.chat.messages.map((m) =>
              m.system ? (
                <p key={m.id} className="dxc-chat__sys">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className={`dxc-msg${m.from === v.selfId ? " is-me" : ""}`}>
                  {m.from === v.selfId ? null : <Avatar name={m.name || "?"} size={26} />}
                  <div>
                    <small>
                      {m.from === v.selfId ? t("you") : m.name} · {clock(m.at)}
                    </small>
                    <p>{m.text}</p>
                  </div>
                </div>
              ),
            )}
            <div ref={chatEnd} />
          </div>
          <form
            className="dxc-compose"
            onSubmit={(e) => {
              e.preventDefault();
              v.chat.send();
            }}
          >
            <input value={v.chat.draft} onChange={(e) => v.chat.setDraft(e.target.value)} placeholder={t("chatPh")} aria-label={t("chatPh")} maxLength={1000} />
            <button type="submit" disabled={!v.chat.draft.trim()} aria-label={t("send")} title={t("send")}>
              <IconSend />
            </button>
          </form>
        </>
      ) : (
        <div className="dxc-people">
          {v.perms?.canInvite ? <Invite v={v} /> : null}
          {!v.roster.length ? (
            <p className="dxc-chat__empty">
              <IconUsers />
              {t("waitingOthers")}
            </p>
          ) : null}
          <ul>
            {v.roster.map((p) => {
              const self = p.userId === v.selfId;
              const live = v.participants.find((x) => x.identity === p.userId);
              const mic = live ? live.isMicrophoneEnabled : p.micEnabled;
              const host = !self && p.role !== "host" && (v.perms?.canMute || v.perms?.canKick);
              const recording = live ? v.isRecording(live) : false;
              return (
                <li key={p.userId} className={live?.isSpeaking ? "is-speaking" : ""}>
                  <Avatar name={p.name || "?"} size={32} />
                  <span className="dxc-people__n">
                    <b>
                      {p.name || "—"}
                      {self ? ` (${t("you")})` : ""}
                    </b>
                    <small>{p.role === "host" ? t("hostLabel") : live ? t("live") : t.has(`pstatus.${p.status}`) ? t(`pstatus.${p.status}`) : p.status}</small>
                  </span>
                  {recording ? <span className="dxc-recpill is-sm">REC</span> : null}
                  <span className={`dxc-people__mic${mic ? "" : " is-off"}`} aria-label={mic ? t("mic") : t("micUnmute")}>
                    {mic ? <IconMic /> : <IconMicOff />}
                  </span>
                  {host ? (
                    <button type="button" className="dxc-people__more" onClick={(e) => personMenu(e, p.userId, p.name || "—", p.micEnabled)} aria-label={t("more")} title={t("more")}>
                      <IconMoreHorizontal />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

// Adding people to the meeting: a search field, what it finds, the chosen
// ones as chips, and the invite button.
function Invite({ v }: { v: CallView }) {
  const t = useTranslations("call");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SearchOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const search = useRef(v.invite.search);
  useEffect(() => {
    search.current = v.invite.search;
  });
  useEffect(() => {
    const term = q.trim();
    let gone = false;
    const h = setTimeout(
      () => {
        if (!term) {
          setFound([]);
          return;
        }
        setBusy(true);
        search
          .current(term)
          .then((r) => !gone && setFound(r))
          .catch(() => !gone && setFound([]))
          .finally(() => !gone && setBusy(false));
      },
      term ? 280 : 0,
    );
    return () => {
      gone = true;
      clearTimeout(h);
    };
  }, [q]);
  const picks = v.invite.picks;
  const toggle = (o: SearchOption) => {
    setNames((n) => ({ ...n, [o.value]: o.label }));
    v.invite.setPicks(picks.includes(o.value) ? picks.filter((x) => x !== o.value) : [...picks, o.value]);
  };
  return (
    <div className="dxc-invite">
      <label className="dxc-invite__q">
        <IconSearch aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inviteHint")} aria-label={t("invite")} />
      </label>
      {q.trim() ? (
        <ul className="dxc-invite__found" role="listbox" aria-label={t("invite")} aria-busy={busy}>
          {!found.length ? <li className="dxc-invite__none">{busy ? "…" : t("inviteEmpty")}</li> : null}
          {found.map((o) => (
            <li key={o.value} role="option" aria-selected={picks.includes(o.value)} onClick={() => toggle(o)}>
              <Avatar name={o.label} size={26} />
              <span>
                <b>{o.label}</b>
                {o.sub || o.tag ? <small>{[o.tag, o.sub].filter(Boolean).join(" · ")}</small> : null}
              </span>
              {picks.includes(o.value) ? <IconCheck className="dxc-invite__ok" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {picks.length ? (
        <div className="dxc-invite__picks">
          {picks.map((id) => (
            <span key={id} className="dxc-chip">
              {names[id] || id}
              <button type="button" onClick={() => v.invite.setPicks(picks.filter((x) => x !== id))} aria-label={t("close")}>
                <IconClose />
              </button>
            </span>
          ))}
          <Btn
            small
            kind="primary"
            icon={<IconUserPlus />}
            busy={v.invite.busy}
            onClick={() => {
              v.invite.send();
              setQ("");
            }}
          >
            {v.invite.busy ? t("inviteSending") : t("inviteSend")}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

// One person: their camera (or shared screen), or their initials on a
// coloured disc; their name and mic in the corner; a ring while speaking.
function DeskTile({ p, name, you, camOff, share, mirror, rec, recLabel, big, small, self, onClick }: { p: Participant; name: string; you: string; camOff: string; share?: boolean; mirror?: boolean; rec?: boolean; recLabel?: string; big?: boolean; small?: boolean; self?: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState(false);
  const source = share ? Track.Source.ScreenShare : Track.Source.Camera;
  const pub: TrackPublication | undefined = p.getTrackPublication(source);
  const track = pub && !pub.isMuted ? (p.isLocal ? (p as LocalParticipant).getTrackPublication(source)?.track : pub.track) : undefined;
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    const meta = () => setPortrait(el.videoHeight > el.videoWidth);
    el.addEventListener("loadedmetadata", meta);
    el.addEventListener("resize", meta);
    return () => {
      el.removeEventListener("loadedmetadata", meta);
      el.removeEventListener("resize", meta);
      track.detach(el);
    };
  }, [track]);
  const cls = ["dxc-tile", p.isSpeaking && !share ? "is-speaking" : "", big ? "is-big" : "", small ? "is-small" : "", self ? "is-self" : "", share ? "is-share" : "", portrait ? "is-portrait" : "", track ? "" : "is-novideo"].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} role={onClick ? "button" : undefined} data-flip={`${p.identity}${share ? ":s" : ""}`}>
      {track ? (
        <video ref={ref} autoPlay playsInline muted={p.isLocal} style={mirror ? { transform: "scaleX(-1)" } : undefined} />
      ) : (
        <div className="dxc-tile__av">
          <Avatar name={name || "?"} size={big ? 112 : small ? 44 : self ? 40 : 84} />
          {!share && !small && !self ? <small>{camOff}</small> : null}
        </div>
      )}
      {rec ? (
        <span className="dxc-recpill is-sm dxc-tile__rec" aria-label={recLabel}>
          REC
        </span>
      ) : null}
      <span className="dxc-tile__n">
        {p.isMicrophoneEnabled ? null : <IconMicOff />}
        <span>
          {name}
          {p.isLocal ? ` (${you})` : ""}
        </span>
      </span>
    </div>
  );
}
