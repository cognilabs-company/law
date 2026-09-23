"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, type ElementType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { splitFilledText, type DocSeg, type DocTree } from "@/lib/docTemplate";
import { IconCheck, IconExternal, IconHeadset } from "@/components/icons";

// The document itself, filled in as the client types.
//
// It renders the template's own text (white-space:pre-wrap keeps the
// authored line breaks) with every `{{field}}` replaced by the answer — the
// same substitution the backend does when it builds the PDF, so this pane is
// the document, not an approximation of it. A field with no answer yet is a
// clickable `[Label]` blank: pressing it jumps to that question, and focusing
// a question highlights and scrolls to its spots here. A field used in more
// than one place (every template repeats claimant_full_name and
// application_date) lights up in all of them at once.
export default function DocPaper({
  segs,
  tree,
  values,
  labelOf,
  active,
  // Bumped by the caller on every navigation event (a question focused or
  // jumped to) — including a re-click on the field that's already active,
  // which otherwise changes nothing here. Without this, clicking the same
  // spot twice would leave `active` unchanged and the arrival animation
  // would only ever play once instead of replaying for a deliberate repeat
  // click.
  navTick,
  onPick,
  fallbackText,
  // The template's own blank source file (service-scoped documents only) —
  // shown as a small "view the original" button next to the preview badge.
  // Fetching happens in the caller; this component only renders the button
  // and shows sourceBusy while it's in flight. There is deliberately no
  // download button here — filling still costs money, so the toolbar's
  // second slot sends the draft to a lawyer instead (onAskLawyer).
  sourceFileName,
  onViewSource,
  onAskLawyer,
  askLawyerBusy,
  askLawyerSent,
  sourceBusy,
  sourceError,
}: {
  segs: DocSeg[];
  // The template's own real DOCX, converted to HTML (see DocFill) — when
  // given, this renders instead of `segs`, so the pane looks like the actual
  // filing (bold labels, centered header, the signature block laid out as
  // written) instead of a flat run of plain text.
  tree?: DocTree[];
  values: Record<string, string>;
  labelOf: (name: string) => string;
  active: string;
  navTick: number;
  onPick: (name: string) => void;
  // Used only when the template text isn't available and all we have is text
  // the backend already filled in (POST …/preview).
  fallbackText?: string;
  sourceFileName?: string;
  onViewSource?: () => void;
  onAskLawyer?: () => void;
  askLawyerBusy?: boolean;
  askLawyerSent?: boolean;
  sourceBusy?: boolean;
  sourceError?: boolean;
}) {
  const t = useTranslations("portal.client.documents");
  const pane = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const band = useRef<HTMLSpanElement>(null);
  const spots = useRef(new Map<string, HTMLElement>());
  // Read inside the two effects below without being one of their triggers —
  // both are navigation animations (scroll into view, arrival highlight),
  // not typing ones, and `values` is a new object on every keystroke. It was
  // in their dependency arrays early on, and replayed the whole highlight
  // sequence on every character typed into the still-focused field.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  });
  // Cancels whatever the arrival-highlight effect below is still mid-way
  // through (its pending rAF/timeouts) — the typing effect further below
  // calls this the moment a keystroke lands, so an edit that starts before
  // the slow reveal finishes isn't left waiting behind it.
  const cancelArrival = useRef<() => void>(() => {});
  // What the active field's content was the last time either effect ran —
  // lets the typing effect tell "a keystroke happened" apart from "a
  // navigation happened", since both can change what's on screen but only
  // one of them should skip the slow reveal.
  const knownContent = useRef("");

  // Bring the active field's first spot into view inside this pane only —
  // scrollIntoView would also scroll the page and the form column with it.
  useEffect(() => {
    if (!active) return;
    const el = spots.current.get(`${active}#0`);
    const box = pane.current;
    if (!el || !box) return;
    const er = el.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (er.top >= br.top + 16 && er.bottom <= br.bottom - 16) return;
    box.scrollTo({ top: box.scrollTop + (er.top - br.top) - br.height / 2 + er.height / 2, behavior: "smooth" });
  }, [active, navTick]);

  // Every occurrence of a field turning its settled colour — yellow once
  // filled, blue while still blank, its own [Label] text turning white to
  // match. Shared by the slow arrival reveal below and by the typing effect
  // further down, which needs the exact same colours but applied instantly.
  function settleColors(name: string) {
    const filled = !!valuesRef.current[name];
    return {
      bg: filled ? "#FFF0B8" : "#1668F0",
      ring: filled ? "0 0 0 2px #FFF0B8" : "0 0 0 3px rgba(22,104,240,.24)",
      fg: filled ? "" : "#fff", // only the blank button's own [Label] text recolours
    };
  }
  function targetsFor(name: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const [k, spotEl] of spots.current) if (k.startsWith(`${name}#`)) out.push(spotEl);
    return out;
  }

  // Arrival highlight (Telegram's "jump to message" feel, adapted to a line
  // of running text): the whole line the spot sits on lights up pale blue,
  // full width, then narrows in from both sides onto just that spot — while
  // it does, the spot itself stays its normal resting colour, NOT the
  // settled yellow/blue, so the two never contradict each other (the spot
  // turning yellow on its own, instantly, while the band is still mid-flight
  // would make the whole approach look broken). Only once the band has
  // arrived and held for a beat does the spot itself (every occurrence of
  // the field, not just the one the band pointed at) turn its settled
  // colour, at the same moment the band fades into it. But this slow reveal
  // is only for "I just jumped here to look" — the moment a keystroke
  // lands (see the typing effect below), it cuts this short and jumps
  // straight to settled, because at that point the reveal has done its job.
  //
  // Plain DOM style writes + CSS transitions, not React state per frame or
  // a CSS class: the target rect and timing are only known at this point,
  // not as fixed percentages a @keyframes could express, and a class-driven
  // transition can't be restarted on a repeat click without a reflow hack
  // that a keyed remount of the *whole* token would fight with the ref map.
  useEffect(() => {
    const bandEl = band.current;
    const sheetEl = sheet.current;
    cancelArrival.current();
    cancelArrival.current = () => {};

    // Whichever spot was previously "active" must not stay yellow/blue once
    // focus has moved elsewhere — and a fresh navigation to the very same
    // spot must restart from its resting look, not from wherever the last
    // run left off.
    for (const el of spots.current.values()) {
      el.style.transition = "";
      el.style.background = "";
      el.style.boxShadow = "";
      el.style.color = "";
    }

    if (!active) {
      if (bandEl) bandEl.style.opacity = "0";
      return;
    }
    knownContent.current = valuesRef.current[active] ?? "";
    const el = spots.current.get(`${active}#0`);
    if (!el || !sheetEl || !bandEl) return;

    const { bg: settleBg, ring: settleRing, fg: settleFg } = settleColors(active);
    const targets = targetsFor(active);
    const settle = (delayMs: number, durMs: number) => {
      for (const target of targets) {
        target.style.transition = `background ${durMs}ms ease ${delayMs}ms, box-shadow ${durMs}ms ease ${delayMs}ms, color ${durMs}ms ease ${delayMs}ms`;
        target.style.background = settleBg;
        target.style.boxShadow = settleRing;
        if (settleFg) target.style.color = settleFg;
      }
    };

    const top = el.offsetTop;
    const height = el.offsetHeight;
    const left = el.offsetLeft;
    const width = el.offsetWidth;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      // Land straight on the spot, no full-line phase — a brief settle fade
      // is all the motion budget this mode allows.
      bandEl.style.transition = "none";
      bandEl.style.opacity = "1";
      bandEl.style.top = `${top}px`;
      bandEl.style.height = `${height}px`;
      bandEl.style.left = `${left}px`;
      bandEl.style.width = `${width}px`;
      bandEl.style.background = settleBg;
      settle(0, 150);
      const hide = setTimeout(() => {
        bandEl.style.opacity = "0";
      }, 400);
      cancelArrival.current = () => clearTimeout(hide);
      return () => clearTimeout(hide);
    }

    // Frame 1: the full line, instantly, no transition yet.
    bandEl.style.transition = "none";
    bandEl.style.opacity = "1";
    bandEl.style.top = `${top}px`;
    bandEl.style.height = `${height}px`;
    bandEl.style.left = "0px";
    bandEl.style.width = `${sheetEl.clientWidth}px`;
    bandEl.style.background = "rgba(22,104,240,.14)";
    // Force layout so the browser commits frame 1 before frame 2 is written —
    // two style writes in the same tick would otherwise coalesce into one
    // paint and nothing would visibly animate.
    void bandEl.offsetWidth;
    // Shrink first (520ms, standard Material "decelerate" curve — quick off
    // the start, easing smoothly to a stop; left and width share the exact
    // same duration+curve, so both edges close in at the same relative pace
    // rather than one side visibly arriving before the other), pause there
    // a beat while everything is still resting-coloured (0.1s — long enough
    // to actually register the stop, not just a blur), only then turn the
    // settle colour, on the band and on the spot itself together.
    const shrinkMs = 520;
    const shrinkEase = "cubic-bezier(0,0,.2,1)";
    const pauseMs = 100;
    const colorMs = 380;
    const raf = requestAnimationFrame(() => {
      bandEl.style.transition = `left ${shrinkMs}ms ${shrinkEase}, width ${shrinkMs}ms ${shrinkEase}, background ${colorMs}ms ease ${shrinkMs + pauseMs}ms`;
      bandEl.style.left = `${left}px`;
      bandEl.style.width = `${width}px`;
      bandEl.style.background = settleBg;
      settle(shrinkMs + pauseMs, colorMs);
    });
    // Once it has settled onto the spot, the spot's own (now-settled)
    // background is already the same colour underneath it — fade the band
    // out rather than leaving a second, redundant highlight layer.
    const hide = setTimeout(() => {
      bandEl.style.opacity = "0";
    }, shrinkMs + pauseMs + colorMs + 200);
    const cancel = () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
    };
    cancelArrival.current = cancel;
    return cancel;
  }, [active, navTick]);

  // A keystroke into the field that's active right now must show its
  // settled colour immediately — the slow reveal above is for "I just
  // jumped here to look", not for "I'm already typing". Compares against
  // `knownContent` (set by the effect above on every navigation) rather
  // than reacting to `values` on its own, so this never fires just because
  // some *other* field's answer changed while this one sits idle and active.
  useEffect(() => {
    if (!active) return;
    const current = values[active] ?? "";
    if (current === knownContent.current) return;
    knownContent.current = current;
    cancelArrival.current();
    cancelArrival.current = () => {};
    const bandEl = band.current;
    if (bandEl) bandEl.style.opacity = "0";
    const { bg, ring, fg } = settleColors(active);
    for (const target of targetsFor(active)) {
      target.style.transition = "background .16s ease, box-shadow .16s ease, color .16s ease";
      target.style.background = bg;
      target.style.boxShadow = ring;
      if (fg) target.style.color = fg;
    }
  }, [active, values]);

  // A blank field renders the same way in both modes — `[Label]` in a
  // clickable chip, wired into the same `spots` map the scroll/arrival
  // effects above read from — so this is shared rather than written twice.
  const tokenNode = useCallback(
    (key: string | number, name: string, n: number): ReactNode => {
      const spotKey = `${name}#${n}`;
      const v = values[name] ?? "";
      const ref = (el: HTMLElement | null) => {
        if (el) spots.current.set(spotKey, el);
        else spots.current.delete(spotKey);
      };
      const label = labelOf(name);
      return v ? (
        <span key={key} ref={ref} className="docpaper__v">
          {v}
        </span>
      ) : (
        // Written the same way as the chip above its question — `[Label]` in
        // both places — so it is obvious which blank a question fills.
        <button key={key} ref={ref} type="button" className="docpaper__b" onClick={() => onPick(name)} title={t("jumpToField", { label })}>
          [{label}]
        </button>
      );
    },
    [values, labelOf, onPick, t],
  );

  const treeBody = useMemo(() => {
    if (!tree?.length) return null;
    let seq = 0;
    const render = (n: DocTree): ReactNode => {
      const key = seq++;
      if (n.k === "text") return <span key={key}>{n.v}</span>;
      if (n.k === "tok") return tokenNode(key, n.name, n.n);
      if (n.tag === "br") return <br key={key} />;
      // createElement, not JSX, for a dynamic tag: with @react-three/fiber in
      // the project, its global JSX.IntrinsicElements augmentation (100+
      // three.js elements) widens the union `<Tag>` resolves against and
      // collapses its prop type to `never` — createElement's own ElementType
      // overload isn't affected by that augmentation.
      const Tag = n.tag as ElementType;
      return createElement(Tag, { key, style: n.style }, n.children.map(render));
    };
    return tree.map(render);
  }, [tree, tokenNode]);

  const flatBody = useMemo(() => {
    if (!segs.length && fallbackText) {
      return splitFilledText(fallbackText).map((p, i) =>
        p.blank ? (
          <span key={i} className="docpaper__b docpaper__b--flat">[{p.v}]</span>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      );
    }
    return segs.map((s, i) => (s.k === "text" ? <span key={i}>{s.v}</span> : tokenNode(i, s.name, s.n)));
  }, [segs, fallbackText, tokenNode]);

  const body = treeBody ?? flatBody;

  return (
    <div className="docpaper">
      <div className="docpaper__top">
        <span className="docpaper__badge">{t("previewTitle")}</span>
        {onViewSource ? (
          <span className="docpaper__src">
            <button type="button" className="docpaper__srcbtn" onClick={onViewSource} disabled={sourceBusy} title={sourceFileName ? t("viewSourceNamed", { name: sourceFileName }) : t("viewSource")}>
              <IconExternal />
              {t("viewSource")}
            </button>
            {onAskLawyer ? (
              <button
                type="button"
                className={`docpaper__srcbtn docpaper__srcbtn--icon${askLawyerSent ? " docpaper__srcbtn--sent" : ""}`}
                onClick={onAskLawyer}
                disabled={askLawyerBusy || askLawyerSent}
                aria-label={askLawyerSent ? t("askLawyerSent") : t("askLawyer")}
                title={askLawyerSent ? t("askLawyerSent") : t("askLawyer")}
              >
                {askLawyerSent ? <IconCheck /> : <IconHeadset />}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {sourceError ? <small className="docpaper__srcerr">{t("sourceError")}</small> : null}
      <div className="docpaper__scroll" ref={pane}>
        {/* Neither the template text nor a server-filled preview came back —
            say so, rather than showing a blank sheet that reads as a broken
            or empty document. */}
        {body.length ? (
          <article className={`docpaper__sheet${treeBody ? " docpaper__sheet--doc" : ""}`} ref={sheet}>
            <span className="docpaper__jump" ref={band} aria-hidden />
            {body}
          </article>
        ) : (
          <p className="docpaper__none">{t("previewUnavailable")}</p>
        )}
      </div>
    </div>
  );
}
