"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  BG_IMAGES,
  CUSTOM_BG,
  getBgEffect,
  getBgStatus,
  preloadBgAssets,
  removeCustomBackground,
  serverBgEffect,
  serverBgStatus,
  storeCustomBackground,
  subscribeBgEffect,
  subscribeBgStatus,
  type BgEffect,
} from "@/lib/callBackground";
import { IconClose, IconPlus, IconTrash } from "../icons";

const BLUR_PREVIEW = "/meeting-bg/thumbs/modern-office.webp";

function Opt({ label, selected, busy, onClick, children, className = "" }: { label: string; selected: boolean; busy: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`mtg__bgopt ${className}`} aria-pressed={selected} aria-label={label} title={label} onClick={onClick}>
      <span className="mtg__bgpic" aria-hidden="true">
        {children}
        {selected && busy ? <i className="mtg__bgspin" /> : null}
      </span>
      <span className="mtg__bglbl">{label}</span>
    </button>
  );
}

export default function CallBackgroundPicker({ camOn, onClose, onPick }: { camOn: boolean; onClose: () => void; onPick: (e: BgEffect) => void }) {
  const t = useTranslations("call.bg");
  const effect = useSyncExternalStore(subscribeBgEffect, getBgEffect, serverBgEffect);
  const status = useSyncExternalStore(subscribeBgStatus, getBgStatus, serverBgStatus);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const downOnScrim = useRef(false);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const active = document.activeElement;
    const prev = active instanceof HTMLElement && active !== document.body ? active : null;
    const root = wrap.current?.closest(".mtg");
    preloadBgAssets();
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || wrap.current?.contains(target) || target.closest(".mtg__bar")) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      const back = prev?.isConnected ? prev : root?.querySelector<HTMLElement>(".mtg__ctl--phone");
      back?.focus({ preventScroll: true });
    };
  }, []);

  const isBlur = (level: "light" | "strong") => effect.kind === "blur" && effect.level === level;
  const isImage = (id: string) => effect.kind === "image" && effect.id === id;
  const pick = (e: BgEffect) => {
    setErr("");
    onPick(e);
  };

  async function upload(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setErr("");
    setUploading(true);
    const before = getBgEffect();
    try {
      await storeCustomBackground(file);
      if (getBgEffect() === before) onPick({ kind: "image", id: CUSTOM_BG });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setErr(code === "type" ? t("errType") : code === "size" ? t("errSize") : t("errRead"));
    } finally {
      setUploading(false);
    }
  }

  function removeCustom() {
    removeCustomBackground();
    setErr("");
    upRef.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={wrap}
      className="mtg__bgwrap"
      onPointerDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnScrim.current) onClose();
        downOnScrim.current = false;
      }}
    >
      <section ref={panel} className="mtg__bgpanel" role="dialog" aria-label={t("title")} tabIndex={-1}>
        <span className="mtg__bggrip" aria-hidden="true" />
        <header className="mtg__bgh">
          <b>{t("title")}</b>
          <button type="button" className="mtg__bgx" onClick={onClose} aria-label={t("close")}>
            <IconClose />
          </button>
        </header>
        {!camOn ? <p className="mtg__bgnote">{t("camOffNote")}</p> : null}

        <div className="mtg__bgsec">
          <span className="mtg__bgcap">{t("effects")}</span>
          <div className="mtg__bgrow">
            <Opt label={t("none")} selected={effect.kind === "none"} busy={false} onClick={() => pick({ kind: "none" })} className="mtg__bgopt--none">
              <i className="mtg__bgslash" />
            </Opt>
            <Opt label={t("blurLight")} selected={isBlur("light")} busy={status.pending} onClick={() => pick({ kind: "blur", level: "light" })}>
              <Image src={BLUR_PREVIEW} alt="" width={320} height={180} unoptimized className="mtg__bgblur mtg__bgblur--light" />
            </Opt>
            <Opt label={t("blurStrong")} selected={isBlur("strong")} busy={status.pending} onClick={() => pick({ kind: "blur", level: "strong" })}>
              <Image src={BLUR_PREVIEW} alt="" width={320} height={180} unoptimized className="mtg__bgblur mtg__bgblur--strong" />
            </Opt>
          </div>
        </div>

        <div className="mtg__bgsec">
          <span className="mtg__bgcap">{t("gallery")}</span>
          <div className="mtg__bggrid">
            <button ref={upRef} type="button" className="mtg__bgopt mtg__bgup" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label={t("upload")} title={t("upload")}>
              <span className="mtg__bgpic" aria-hidden="true">
                {uploading ? <i className="mtg__bgspin" /> : <IconPlus />}
              </span>
              <span className="mtg__bglbl">{t("upload")}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif" hidden onChange={(e) => void upload(e)} />
            {status.custom ? (
              <div className="mtg__bgcustom">
                <Opt label={t("custom")} selected={isImage(CUSTOM_BG)} busy={status.pending} onClick={() => pick({ kind: "image", id: CUSTOM_BG })}>
                  <Image src={status.custom} alt="" width={320} height={180} unoptimized />
                </Opt>
                <button type="button" className="mtg__bgdel" onClick={removeCustom} aria-label={t("removeCustom")} title={t("removeCustom")}>
                  <IconTrash />
                </button>
              </div>
            ) : null}
            {BG_IMAGES.map((b) => (
              <Opt key={b.id} label={t.has(`images.${b.id}`) ? t(`images.${b.id}`) : b.id} selected={isImage(b.id)} busy={status.pending} onClick={() => pick({ kind: "image", id: b.id })}>
                <Image src={b.thumb} alt="" width={320} height={180} unoptimized loading="lazy" />
              </Opt>
            ))}
          </div>
        </div>

        {err ? (
          <p className="mtg__bgerr" role="alert">
            {err}
          </p>
        ) : null}
        <p className="mtg__bgfoot">{t("privacy")}</p>
      </section>
    </div>
  );
}
