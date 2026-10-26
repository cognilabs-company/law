"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconClose, IconEdit, IconEyeOff, IconMonitor, IconRefresh, IconTarget } from "@/components/icons";
import type { RaLink, RaRemoteShare } from "@/lib/remoteAssist/callLink";
import { RA_MARK_COLORS, containRect, raMarkId, raWireAllowed, simplifyPath, type RaMark, type RaMarkColor, type RaMarkTool, type RaPoint, type RaProbeHit, type RaShareState } from "@/lib/remoteAssist/marks";
import { raTabHandle } from "@/lib/remoteAssist/tabHandle";
import { RaMarkLayer, useMarks } from "./RaMarks";

// The operator's live picture of the client's tab (a ScreenShare track in the
// support call) with the drawing tools. A mark is drawn here at once and
// sent over the call's data channel; both sides drop it after 3 s. Nothing
// here touches the remote-assistance API.

// "click" is not a mark: it asks the client what sits under the point and
// opens it (a link) or points at it (a component) through the console.
type Tool = RaMarkTool | "click";
const TOOLS: { key: Tool; label: string }[] = [
  { key: "click", label: "tool.click" },
  { key: "pointer", label: "tool.pointer" },
  { key: "arrow", label: "tool.arrow" },
  { key: "circle", label: "tool.circle" },
  { key: "rect", label: "tool.rect" },
  { key: "pen", label: "tool.pen" },
];

function ToolGlyph({ tool }: { tool: Tool }): ReactElement {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (tool === "click")
    return (
      <svg {...p}>
        <path d="M5 3l5.5 15 2.2-6.3L19 9.5z" />
        <path d="M13 13l6 6" />
      </svg>
    );
  if (tool === "pointer") return <IconTarget aria-hidden="true" />;
  if (tool === "arrow")
    return (
      <svg {...p}>
        <path d="M5 19 19 5M10 5h9v9" />
      </svg>
    );
  if (tool === "circle")
    return (
      <svg {...p}>
        <ellipse cx="12" cy="12" rx="8" ry="6" />
      </svg>
    );
  if (tool === "rect")
    return (
      <svg {...p}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
      </svg>
    );
  return <IconEdit aria-hidden="true" />;
}

export function RaScreen({
  link,
  clientId,
  share,
  canDraw,
  pageTitle,
  route,
  onHit,
}: {
  link: RaLink | null;
  clientId: string;
  share: RaShareState | null;
  canDraw: boolean;
  pageTitle: string;
  route: string;
  // The client's answer to a click: a route to open or a component to point at.
  onHit: (hit: RaProbeHit) => void;
}): ReactElement {
  const t = useTranslations("remoteAssist.screen");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [remote, setRemote] = useState<RaRemoteShare>({ video: null, muted: false });
  const [tool, setTool] = useState<Tool>("click");
  const [probe, setProbe] = useState<"" | "wait" | "none">("");
  const probeRef = useRef("");
  const onHitRef = useRef(onHit);
  useEffect(() => {
    onHitRef.current = onHit;
  }, [onHit]);
  const [color, setColor] = useState<RaMarkColor>("blue");
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [draft, setDraft] = useState<RaPoint[] | null>(null);
  const [asked, setAsked] = useState(false);
  const { marks, add, clear } = useMarks();

  // The client captured this very tab (both in one browser): showing it here
  // would be an endless mirror that crashes the page, so it is never shown.
  const mirrorOfSelf = !!share?.tab && share.tab === raTabHandle();

  // The client's answer to the last click (older answers are ignored).
  useEffect(() => {
    if (!link || !clientId) return;
    return link.onWire((msg, from) => {
      if (msg.t !== "probe-hit" || !raWireAllowed(msg, from, { operator: link.self(), client: clientId }) || msg.id !== probeRef.current) return;
      probeRef.current = "";
      if (msg.route || msg.componentId) {
        setProbe("");
        onHitRef.current(msg);
      } else setProbe("none");
    });
  }, [link, clientId]);
  useEffect(() => {
    if (probe !== "wait") return;
    const id = window.setTimeout(() => {
      probeRef.current = "";
      setProbe("none");
    }, 3000);
    return () => window.clearTimeout(id);
  }, [probe]);

  // Follow the client's track as it comes, goes, mutes.
  useEffect(() => {
    if (!link || !clientId) return;
    const read = () => setRemote(link.remoteShare(clientId));
    read();
    return link.onChange(read);
  }, [link, clientId]);

  useEffect(() => {
    const el = videoRef.current;
    const v = remote.video;
    if (!el || !v || mirrorOfSelf) return;
    v.attach(el);
    return () => v.detach(el);
  }, [remote.video, mirrorOfSelf]);

  // The picture's content box inside the frame (object-fit: contain).
  useEffect(() => {
    const frame = boxRef.current;
    const video = videoRef.current;
    if (!frame) return;
    const measure = () => {
      const r = containRect(frame.clientWidth, frame.clientHeight, video?.videoWidth || 16, video?.videoHeight || 9);
      setBox((cur) => (Math.abs(cur.w - r.w) < 0.5 && Math.abs(cur.h - r.h) < 0.5 && Math.abs(cur.x - r.x) < 0.5 && Math.abs(cur.y - r.y) < 0.5 ? cur : r));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(frame);
    video?.addEventListener("loadedmetadata", measure);
    video?.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      video?.removeEventListener("loadedmetadata", measure);
      video?.removeEventListener("resize", measure);
    };
  }, [remote.video]);

  const hidden = remote.muted || !!share?.hidden || mirrorOfSelf;
  const live = !!remote.video && !hidden;
  const notTab = live && !!share?.surface && share.surface !== "browser";

  const at = (e: ReactPointerEvent<HTMLDivElement>): RaPoint | null => {
    const frame = boxRef.current;
    if (!frame) return null;
    // Measured now, not from the last resize: the frame changes height when
    // the hint line below it wraps.
    const v = videoRef.current;
    const live = containRect(frame.clientWidth, frame.clientHeight, v?.videoWidth || 16, v?.videoHeight || 9);
    if (!live.w || !live.h) return null;
    const r = frame.getBoundingClientRect();
    const x = (e.clientX - r.left - live.x) / live.w;
    const y = (e.clientY - r.top - live.y) / live.h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [x, y];
  };
  const send = (points: RaPoint[]) => {
    const mark: RaMark = { v: 1, id: raMarkId(), tool: tool === "click" ? "pointer" : tool, color, points: tool === "pen" ? simplifyPath(points) : points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]), w: Math.round(box.w), h: Math.round(box.h) };
    add(mark);
    link?.send({ t: "mark", mark });
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canDraw || !live) return;
    const p = at(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pointer") {
      send([p]);
      return;
    }
    if (tool === "click") {
      // Show the client where, then ask what is there.
      send([p]);
      const id = raMarkId();
      probeRef.current = id;
      setProbe("wait");
      link?.send({ t: "probe", id, x: p[0], y: p[1] });
      return;
    }
    setDraft([p]);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const p = at(e);
    if (!p) return;
    setDraft((cur) => (cur ? (tool === "pen" ? (cur.length < 2000 ? [...cur, p] : cur) : [cur[0], p]) : cur));
  };
  const up = () => {
    if (!draft) return;
    const pts = draft;
    setDraft(null);
    if (tool !== "pen" && (pts.length < 2 || Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 0.01)) {
      send([pts[0]]);
      return;
    }
    if (pts.length >= 2) send(pts);
  };

  const draftMark: RaMark | null =
    draft && draft.length >= 2 && tool !== "click" ? { v: 1, id: "draft", tool, color, points: tool === "pen" ? draft : [draft[0], draft[draft.length - 1]], w: 1, h: 1 } : null;

  return (
    <div className="ra-scr" data-state={!link ? "nocall" : !remote.video ? "off" : mirrorOfSelf ? "self" : hidden ? "hidden" : "live"}>
      <div className="ra-scr__head">
        <span className="ra-scr__page">
          <b>{pageTitle}</b>
          {route ? <small>{route}</small> : null}
        </span>
        {live ? (
          <span className="ra-scr__live">
            <i aria-hidden="true" />
            {t("live")}
          </span>
        ) : null}
      </div>

      <div
        ref={boxRef}
        className="ra-scr__frame"
        data-tool={canDraw && live ? tool : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDraft(null)}
        role={canDraw && live ? "application" : undefined}
        aria-label={canDraw && live ? t("drawHint") : undefined}
      >
        <video ref={videoRef} className="ra-scr__video" autoPlay playsInline muted hidden={!remote.video} />
        {live ? <RaMarkLayer marks={marks} box={box} draft={draftMark} /> : null}
        {!link ? (
          <div className="ra-scr__state">
            <IconMonitor aria-hidden="true" />
            <b>{t("noCall")}</b>
            <p>{t("noCallText")}</p>
          </div>
        ) : !remote.video ? (
          <div className="ra-scr__state">
            <IconMonitor aria-hidden="true" />
            <b>{t("off")}</b>
            <p>{asked ? t("askedText") : t("offText")}</p>
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                link.send({ t: "ask-share" });
                setAsked(true);
              }}
            >
              <IconRefresh aria-hidden="true" />
              {asked ? t("askAgain") : t("ask")}
            </button>
          </div>
        ) : hidden ? (
          <div className="ra-scr__state ra-scr__state--veil">
            <IconEyeOff aria-hidden="true" />
            <b>{mirrorOfSelf ? t("selfTab") : t("hidden")}</b>
            <p>{mirrorOfSelf ? t("selfTabText") : t("hiddenText")}</p>
          </div>
        ) : null}
      </div>

      {notTab ? <p className="ra-scr__warn">{t("notTab")}</p> : null}

      <div className="ra-tools" role="toolbar" aria-label={t("tools")}>
        <span className="ra-tools__set" role="radiogroup" aria-label={t("toolsShape")}>
          {TOOLS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={tool === x.key} aria-label={t(x.label)} title={t(x.label)} className="ra-tool" onClick={() => setTool(x.key)} disabled={!canDraw || !live}>
              <ToolGlyph tool={x.key} />
            </button>
          ))}
        </span>
        <span className="ra-tools__set" role="radiogroup" aria-label={t("colors")}>
          {RA_MARK_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={t(`color.${c}`)} title={t(`color.${c}`)} className={`ra-swatch ra-swatch--${c}`} onClick={() => setColor(c)} disabled={!canDraw || !live} />
          ))}
        </span>
        <button
          type="button"
          className="ra-tool ra-tool--text"
          onClick={() => {
            clear();
            link?.send({ t: "clear" });
          }}
          disabled={!canDraw || !live}
        >
          <IconClose aria-hidden="true" />
          {t("clear")}
        </button>
        <small className="ra-tools__hint" role="status">{!canDraw ? t("paused") : tool === "click" ? (probe === "wait" ? t("probeWait") : probe === "none" ? t("probeNone") : t("clickHint")) : t("fade")}</small>
      </div>
    </div>
  );
}
