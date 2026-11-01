"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ChatWidget from "./chat/ChatWidget";
import { IconChatDots } from "./icons";
import { OPEN_CHAT } from "@/lib/chatBus";
import { useDialogFocus } from "@/lib/useDialogFocus";

export default function AIChatDock() {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  // Not modal (the page stays usable beside it), so no Tab trap: the
  // keyboard lands in the chat on open and goes back to the button on close.
  useDialogFocus(open, dock, { trap: false });

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(OPEN_CHAT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_CHAT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open && window.innerWidth <= 760) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        className="fab"
        type="button"
        onClick={() => setOpen(true)}
      >
        {/* Named by its content, so the visible "AI" is part of the name. */}
        <span className="sr-only">{t("openLabel")}</span>
        <IconChatDots />
        <span className="fab__b">AI</span>
      </button>
      <div
        className={`dockbg${open ? " on" : ""}`}
        onClick={() => setOpen(false)}
      />
      <div
        ref={dock}
        className={`dock${open ? " on" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-label={t("title")}
      >
        {open ? (
          <ChatWidget variant="dock" onClose={() => setOpen(false)} />
        ) : null}
      </div>
    </>
  );
}
