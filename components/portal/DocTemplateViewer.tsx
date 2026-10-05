"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "./DataState";
import { docxToTree } from "@/lib/docxParse";
import type { DocTree } from "@/lib/docTemplate";
import { renderDocTree } from "@/lib/docTreeRender";
import { saveBlob } from "@/lib/download";
import { useAuth } from "@/lib/auth";
import { IconDownload, IconShield } from "@/components/icons";

// ── What a browser can and cannot withhold from the person at the screen ──
// The GM asked that an opened document be impossible to take "by any means —
// not with Ctrl+C, not through inspect". That is not something a web page can
// deliver, and pretending otherwise would be the worst outcome: the document
// is rendered by the reader's own browser, so the reader's own browser will
// always hand it back. Devtools reads the live DOM, the network tab holds the
// DOCX that was fetched, the same URL can be re-requested with the session
// token, and a screenshot or a phone camera works no matter what the page
// does. Blocking F12 would not change any of that — devtools also opens from
// the browser menu, and can already be open before the page loads — so this
// module deliberately does not pretend to block it.
//
// What is achievable, and what this module does, is the same two-layer shape
// components/chat/MeetingGuard.tsx already uses for a confidential call:
//
//   1. CASUAL COPYING FAILS. The document surface is not selectable, the
//      clipboard events on it are cancelled, the context menu and text drag
//      are off, the Ctrl/Cmd combinations that copy, select-all, save and
//      print are swallowed while the document is open, and printing to PDF
//      yields a notice instead of the text (see the @media print rules in the
//      wp-docprotect block). Everything that a client would reach for without
//      thinking now returns nothing.
//
//   2. DELIBERATE COPYING LEAVES A TRACE. A faint repeating watermark carries
//      who is looking at this screen and on what day, tiled across the whole
//      sheet, so a screenshot or a camera photo names its source. A leak stops
//      being anonymous, which is the only lever a web page really has.
//
// Two things are deliberately left alone. The download button below is the
// paid product — clients are meant to have the file, so it is outside the
// guarded container and untouched. And nothing here is applied to form
// fields: what the client typed themselves stays theirs to copy.

/** How long the blocked-copy line stays swapped in after a refused press. */
const FLASH_MS = 2600;

/**
 * The line burnt into the document background: who is at this screen and on
 * what day. The phone is masked to its last four digits and the name is
 * clipped — the same "enough to identify the account internally, not enough to
 * harvest as a contact detail" rule CallRoom's watermark already follows. The
 * date is written numerically rather than through the locale formatter because
 * this is a forensic record read back off a screenshot, not prose.
 */
export function useViewerStamp(): string {
  const { session } = useAuth();
  const name = session?.name || "";
  const phone = session?.phone || "";
  return useMemo(() => {
    const d = new Date();
    const day = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const digits = phone.replace(/\D/g, "");
    // 24 characters of name keeps the whole stamp inside the 460px SVG tile
    // below; a longer one would be clipped at the tile edge mid-word.
    return ["LexGo", name.trim().slice(0, 24), digits ? `••${digits.slice(-4)}` : "", day]
      .filter(Boolean)
      .join(" · ");
  }, [name, phone]);
}

/**
 * Everything the guarded surface needs: the props that cancel the clipboard on
 * it, the background that watermarks it, and whether a press was just refused.
 * `active` must be false while no document is on screen, so the key handler is
 * not installed over the rest of the portal.
 */
/**
 * How much the gap between the outer window and the viewport must GROW,
 * against the gap measured when the document opened, before docked devtools
 * is the likeliest explanation.
 *
 * It is a growth and not an absolute, because the absolute is never zero: an
 * ordinary Chrome window spends its own chrome on that gap — roughly 40px of
 * tab strip, 40px of address bar, ~30px more with a bookmarks bar, plus the
 * window frame — so outerHeight − innerHeight sits around 110-190px on a
 * normal desktop with nothing open at all. A flat "gap > 160 means devtools"
 * therefore fires for a large share of ordinary users, which is exactly what
 * went wrong: the sheet was hidden from people who had opened nothing.
 *
 * Measuring the growth instead costs one thing and it is worth stating: if
 * devtools is ALREADY open when the document is opened, it is part of the
 * baseline and goes unnoticed. Hiding the document from everyone was the
 * worse trade.
 */
const DEVTOOLS_GROWTH = 140;

export function useDocGuard(active: boolean) {
  const [blocked, setBlocked] = useState(false);
  // The document is taken off screen entirely: devtools appears to be open,
  // the browser is building a print/PDF rendering, or a capture key was hit.
  const [cloak, setCloak] = useState<"" | "devtools" | "print" | "capture">("");
  // Softer: the window lost focus, so a screenshot tool or a second monitor
  // is looking at it. Blurred rather than hidden, because coming back from
  // another tab to a blank page reads as a crash.
  const [dimmed, setDimmed] = useState(false);
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cloakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stamp = useViewerStamp();

  const deny = useCallback((e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    setBlocked(true);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setBlocked(false), FLASH_MS);
  }, []);

  // Both states are reset during render rather than from inside the effect —
  // one render instead of a cascade, and the rule this repo enforces. When the
  // guard goes inactive the document is gone anyway, so nothing is on screen
  // to cloak.
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) { setCloak(""); setDimmed(false); }
  }

  useEffect(() => {
    if (!active) return;
    const timer = flash;
    const cTimer = cloakTimer;
    // Bound to the window rather than the container: Ctrl+P and Ctrl+S are
    // never delivered to the element under the pointer, they go wherever focus
    // is, and focus on this screen is usually the modal panel or <body>. The
    // guard is installed only while a document is actually rendered, and it
    // steps aside for anything the client is typing into, so a form field
    // elsewhere on the page keeps its own copy/paste.
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      const k = e.key.toLowerCase();

      // PrintScreen never reaches the page on Windows as a keypress the page
      // can cancel — the OS takes the shot first. What CAN be done is blank
      // the sheet on the way past, so a second press catches nothing and the
      // client is told why. Honest about the first one: it already happened.
      if (e.key === "PrintScreen") {
        setCloak("capture");
        clearTimeout(cTimer.current);
        cTimer.current = setTimeout(() => setCloak(""), 1800);
        deny();
        return;
      }
      // The devtools shortcuts, asked for explicitly. F12 and Ctrl+Shift+I/J/C
      // open it; Ctrl+U shows the source. Cancelling these is a speed bump and
      // nothing more — the browser menu opens the same panel and this cannot
      // see that — but a speed bump is what was asked for and it costs
      // nothing. The cloak below is the part that actually does something.
      if (!typing && (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === "i" || k === "j" || k === "c")))) {
        deny(e);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // c/x copy, a select-all, s save-page, p print, u view-source.
      // Deliberately NOT the zoom keys (+ - 0) — reading a court filing at
      // 150% has to keep working.
      if (k !== "c" && k !== "x" && k !== "a" && k !== "s" && k !== "p" && k !== "u") return;
      if (typing) return;
      deny(e);
    };

    // Printing and "Save as PDF" are the same event, and it fires however the
    // print was started — Ctrl+P, the browser menu, or the OS dialogue. The
    // @media print rules already replace the sheet on paper; this takes it out
    // of the DOM for the duration as well, so a renderer that ignores the
    // print stylesheet still has nothing to lay out.
    const onBeforePrint = () => setCloak("print");
    const onAfterPrint = () => setCloak((c) => (c === "print" ? "" : c));

    // Same event, from the media-query side: Safari and some embedded
    // browsers fire the matchMedia change but not beforeprint.
    const printMq = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onPrintMq = (e: MediaQueryListEvent) => (e.matches ? setCloak("print") : onAfterPrint());

    // Focus and visibility: a screenshot utility, a screen recorder or a
    // second window taking over all read as "this tab is no longer the thing
    // being looked at".
    //
    // Visibility is the authority and activity is the override.
    //
    // Neither a one-way blur handler nor document.hasFocus() can be trusted to
    // clear this on its own: a blur can arrive with no focus to answer it (a
    // browser panel or an iframe taking the keyboard), and hasFocus() reports
    // false in perfectly ordinary situations — measured, a headless Chrome
    // never has focus at all and the sheet stayed dimmed through a click.
    // A page that dims and never recovers is the bug this whole layer was
    // supposed to avoid, so the rule is: the tab being HIDDEN dims it, and any
    // sign of a person working in the page clears it, whatever focus claims.
    // setDimmed on every pointermove would re-render the sheet continuously.
    // The ref makes the common case — already awake, pointer moving — free.
    let asleep = false;
    const wake = () => {
      const next = document.visibilityState !== "visible";
      if (next === asleep) return;
      asleep = next;
      setDimmed(next);
    };
    const onBlur = () => { asleep = true; setDimmed(true); };
    const onFocus = wake;
    const onVis = wake;
    const recheck = wake;

    // Docked devtools GROWS the gap between the outer window and the viewport.
    // The baseline is whatever that gap is right now, with the document
    // freshly on screen — see DEVTOOLS_GROWTH for why an absolute threshold
    // was wrong. Polled rather than driven by resize alone because opening a
    // docked panel does not always fire one; 900ms is slow enough to be free.
    let baseW = window.outerWidth - window.innerWidth;
    let baseH = window.outerHeight - window.innerHeight;
    let baseDpr = window.devicePixelRatio;
    // A touch screen is not measured at all. An Android soft keyboard takes
    // 250-350px off innerHeight the moment a field is focused, which is
    // indistinguishable from a docked panel by this measurement and would
    // hide the document every time somebody typed.
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const checkDevtools = () => {
      if (coarse) return;
      // Page zoom moves the gap too. Re-baseline instead of accusing: the
      // reader changed the zoom, which is not the thing being watched for.
      if (window.devicePixelRatio !== baseDpr) {
        baseDpr = window.devicePixelRatio;
        baseW = window.outerWidth - window.innerWidth;
        baseH = window.outerHeight - window.innerHeight;
        setCloak((c) => (c === "devtools" ? "" : c));
        return;
      }
      const w = window.outerWidth - window.innerWidth - baseW;
      const h = window.outerHeight - window.innerHeight - baseH;
      const open = w > DEVTOOLS_GROWTH || h > DEVTOOLS_GROWTH;
      setCloak((c) => (open ? "devtools" : c === "devtools" ? "" : c));
    };
    const poll = coarse ? undefined : setInterval(checkDevtools, 900);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    window.addEventListener("resize", checkDevtools);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    // Any sign that a person is working in this page clears a stale dim.
    window.addEventListener("pointerdown", recheck, true);
    window.addEventListener("pointermove", recheck, { passive: true });
    window.addEventListener("wheel", recheck, { passive: true });
    window.addEventListener("keydown", recheck, true);
    printMq?.addEventListener?.("change", onPrintMq);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      window.removeEventListener("resize", checkDevtools);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", recheck, true);
      window.removeEventListener("pointermove", recheck);
      window.removeEventListener("wheel", recheck);
      window.removeEventListener("keydown", recheck, true);
      printMq?.removeEventListener?.("change", onPrintMq);
      if (poll) clearInterval(poll);
      clearTimeout(timer.current);
      clearTimeout(cTimer.current);
    };
  }, [active, deny]);

  // A tiled SVG background rather than MeetingGuard's repeated <span> rows.
  // A video stage has one known height, so five rows spread evenly over it
  // always look the same; a document sheet is as tall as the filing is long —
  // measured 817px to 1 667px across the seven catalog templates at 1440, and
  // a filled constructor document runs past that — so spreading a fixed row
  // count would stretch the marks apart on a long document and bunch them on
  // a short one. One repeating tile holds the same rhythm at any height and
  // costs a single node.
  const wm = useMemo<CSSProperties | undefined>(() => {
    if (!stamp) return undefined;
    const text = stamp.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300">` +
      `<text x="16" y="215" transform="rotate(-26 16 215)" font-family="Arial, Helvetica, sans-serif" ` +
      `font-size="15" font-weight="700" letter-spacing="1.3" fill="#14213d" fill-opacity="0.085">${text}</text></svg>`;
    return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` };
  }, [stamp]);

  return {
    blocked,
    wm,
    stamp,
    cloak,
    dimmed,
    // Append to the paper container's own class list.
    cls: `${cloak ? " docguard__paper--cloak" : ""}${dimmed && !cloak ? " docguard__paper--dim" : ""}`,
    // Spread onto the scrolling container that holds the sheet. The clipboard
    // events bubble, so a selection anywhere inside is caught here.
    surface: {
      onCopy: deny,
      onCut: deny,
      onContextMenu: deny,
      onDragStart: deny,
    },
  };
}

/**
 * What stands in for the document while it is cloaked. Rendered inside the
 * paper container, over the sheet, so the layout does not jump when it
 * appears — and it names the reason, because a sheet that simply goes white
 * reads as a bug rather than as a rule.
 */
export function DocCloak({ reason }: { reason: "" | "devtools" | "print" | "capture" }) {
  const t = useTranslations("portal.client.documents");
  if (!reason) return null;
  return (
    <div className="docguard__cloak" role="status">
      <IconShield />
      <b>{t(`cloak.${reason}`)}</b>
      <span>{t("cloakHint")}</span>
    </div>
  );
}

/** The watermark layer itself — inside the sheet, above the text, inert. */
export function DocWatermark({ style }: { style: CSSProperties | undefined }) {
  if (!style) return null;
  return <span className="docguard__wm" aria-hidden="true" style={style} />;
}

/**
 * One quiet line above the document saying why copying does nothing, which
 * swaps to the refusal for a moment when a press is actually blocked — a
 * silent refusal reads as a broken page, and a permanent red banner reads as
 * an accusation. role="status" so a screen reader hears the swap.
 */
export function DocGuardNote({ blocked }: { blocked: boolean }) {
  const t = useTranslations("portal.client.documents");
  return (
    <p className={`docguard__note${blocked ? " docguard__note--hit" : ""}`} role="status" aria-live="polite">
      <IconShield />
      <span>{blocked ? t("guardBlocked") : t("guardNote")}</span>
    </p>
  );
}

/** Shown only on paper: printing gives this instead of the document. */
export function DocPrintNotice() {
  const t = useTranslations("portal.client.documents");
  return <p className="docguard__printnote">{t("guardPrint")}</p>;
}

// A browser has no built-in DOCX viewer — the previous "view" buttons (both
// here and in DocumentRequestsInbox) opened the file in a new tab, which for
// a DOCX just flashes a blank tab and silently forces a download instead of
// showing anything. This actually renders the document, inline, in a modal —
// reusing the exact XML→DocTree pipeline DocFill's own live pane already
// uses (lib/docxParse.ts). "Download" stays one tap away underneath, for
// whoever actually wants the file saved (unlike the no-download full-page
// viewer at services/document/[serviceId]/view, which never offers this).

export default function DocTemplateViewer({
  open,
  onClose,
  title,
  fetchBlob,
  fileName,
  protect = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  // A function, not a URL — the caller already knows how to fetch this
  // specific file through the authed proxy (getServiceTemplateSourceFile);
  // null while that URL isn't known yet keeps this a no-op rather than a
  // broken button.
  fetchBlob: (() => Promise<Blob>) | null;
  fileName: string;
  // On by default: every caller today shows a document somebody paid for or
  // a client's own filing, and the GM asked for the preview to be protected
  // across the project. The seam exists so a staff-only surface that really
  // needs to lift text out of a template can opt out in one word rather than
  // by unpicking the guard.
  protect?: boolean;
}) {
  const t = useTranslations("portal.client.documents");
  const [tree, setTree] = useState<DocTree[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [blob, setBlob] = useState<Blob | null>(null);
  const guard = useDocGuard(protect && open && status === "ready");

  useEffect(() => {
    if (!open || !fetchBlob) return;
    let alive = true;
    (async () => {
      setStatus("loading");
      setTree(null);
      setBlob(null);
      try {
        const b = await fetchBlob();
        if (!alive) return;
        setBlob(b);
        const buf = await b.arrayBuffer();
        const parsed = await docxToTree(buf);
        if (!alive) return;
        if (parsed.length) {
          setTree(parsed);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, fetchBlob]);

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      {status === "loading" ? (
        <Skeleton rows={8} />
      ) : status === "error" ? (
        <p className="advmuted">{t("sourceError")}</p>
      ) : (
        <>
          {protect ? <DocGuardNote blocked={guard.blocked} /> : null}
          <div
            className={`docpaper__scroll${protect ? ` docguard__paper${guard.cls}` : ""}`}
            style={{ maxHeight: "60vh" }}
            data-ai-target="documents:template-viewer"
            {...(protect ? guard.surface : null)}
          >
            {protect ? <DocCloak reason={guard.cloak} /> : null}
            <article className="docpaper__sheet docpaper__sheet--doc">
              {protect ? <DocWatermark style={guard.wm} /> : null}
              {tree ? renderDocTree(tree) : null}
            </article>
          </div>
          {protect ? <DocPrintNotice /> : null}
          {/* Outside the guarded container on purpose: the file is the thing
              the client is paying for, and saving it deliberately is not the
              behaviour being defended against. */}
          <button
            type="button"
            className="btn btn--line btn--full"
            style={{ marginTop: 14 }}
            onClick={() => blob && saveBlob(blob, fileName)}
            disabled={!blob}
          >
            <IconDownload />
            {t("downloadSource")}
          </button>
        </>
      )}
    </Modal>
  );
}
