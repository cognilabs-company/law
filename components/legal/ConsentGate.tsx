"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { currentConsents, listLegalConsents, type AcceptedConsentRef, type ConsentDoc } from "@/lib/services/backend";
import {
  CONSENTS_KEY,
  claimPendingRegistration,
  consentStatus,
  flushConsents,
  recordAccepted,
  shouldRecheck,
} from "@/lib/consents";
import ConsentChecklist from "./ConsentChecklist";
import { IconAlert, IconShieldCheck } from "../icons";

// Routes that stay usable without (re-)accepting: the documents themselves,
// the auth screens, SOS and the secure chat / call room.
const SKIP = ["/legal", "/login", "/register", "/reset-password", "/portal/client/sos", "/portal/chat"];
// Call overlays sit above the gate and must stay keyboard-usable.
const CALL_UI = ".callroom, .incall";
const FLUSH_TICK_MS = 60_000;

// Global re-consent gate for signed-in users: when a current legal document
// (new user on this device, or a new version) has no local acceptance record,
// a non-dismissable dialog asks for it. Also syncs pending accept POSTs in the
// background. Mounted in the locale layout so it covers every route, including
// shell-less ones. Tokenless (offline/demo) sessions are never gated.
export default function ConsentGate() {
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const token = session?.token ?? "";
  const id = session?.id ?? "";
  const phone = session?.phone ?? "";
  const serverAccepted = JSON.stringify(session?.acceptedConsents ?? []);
  const [gate, setGate] = useState<{ key: string; docs: ConsentDoc[]; updated: boolean } | null>(null);

  useEffect(() => {
    if (!ready || !token || !(id || phone)) return;
    let alive = true;
    const run = async (force: boolean) => {
      claimPendingRegistration(id, phone);
      let refs: AcceptedConsentRef[] = [];
      try {
        refs = JSON.parse(serverAccepted) as AcceptedConsentRef[];
      } catch {
        /* never */
      }
      if (refs.length) recordAccepted(id, phone, refs, { synced: true });
      void flushConsents(id, phone);
      if (!shouldRecheck(force)) return;
      try {
        const docs = currentConsents(await listLegalConsents());
        if (!alive) return;
        const s = consentStatus(docs, id, phone);
        setGate(s.missing.length ? { key: id || phone, docs: s.missing, updated: s.updated } : null);
      } catch {
        /* API unreachable → never block */
      }
    };
    void run(true);
    const onWake = () => {
      if (document.visibilityState === "visible") void run(false);
    };
    // Retries back off (up to an hour), so a tab that stays visible still
    // needs a periodic flush; it is a local read unless something is due.
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void flushConsents(id, phone);
    }, FLUSH_TICK_MS);
    // Accepted in another tab → drop what is now covered.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CONSENTS_KEY && e.key !== null) return;
      setGate((g) => {
        if (!g) return g;
        const s = consentStatus(g.docs, id, phone);
        if (!s.missing.length) return null;
        return s.missing.length === g.docs.length ? g : { ...g, docs: s.missing };
      });
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("storage", onStorage);
    };
  }, [ready, token, id, phone, serverAccepted]);

  const skip = SKIP.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // The key check stops a previous user's gate from flashing after an account switch.
  if (!ready || !token || !gate || gate.key !== (id || phone) || skip) return null;

  return (
    <ConsentGateDialog
      key={gate.docs.map((d) => d.id).join()}
      docs={gate.docs}
      updated={gate.updated}
      // Clients can still reach SOS; the gate returns when they leave it.
      sos={session?.role === "client"}
      onAccept={() => {
        recordAccepted(id, phone, gate.docs);
        setGate(null);
        // A failed POST keeps the local acceptance and is retried later.
        void flushConsents(id, phone);
      }}
      onLogout={logout}
    />
  );
}

function ConsentGateDialog({
  docs,
  updated,
  sos,
  onAccept,
  onLogout,
}: {
  docs: ConsentDoc[];
  updated: boolean;
  sos: boolean;
  onAccept: () => void;
  onLogout: () => void;
}) {
  const t = useTranslations("legal");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const boxRef = useRef<HTMLDivElement>(null);

  // Scroll lock, focus and keyboard containment while the gate is open.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const root = document.documentElement;
    root.classList.add("cgate-open");
    const prevFocus = document.activeElement;
    const focusables = () =>
      Array.from(
        box.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
        ),
      );
    (focusables()[0] ?? box).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest(CALL_UI)) return;
      // Esc must not reach modals underneath (they would close behind the gate).
      if (e.key === "Escape") {
        e.stopPropagation();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        e.preventDefault();
        box.focus();
      } else if (!box.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      root.classList.remove("cgate-open");
      if (prevFocus instanceof HTMLElement && prevFocus.isConnected) prevFocus.focus();
    };
  }, []);

  // No Esc, scrim click or close button: accept or log out (clients: or SOS).
  return (
    <div className="cgate" role="dialog" aria-modal="true" aria-labelledby="cgate-t">
      <div className="cgate__c" ref={boxRef} tabIndex={-1}>
        <span className="rf__ico rf__ico--brand">
          <IconShieldCheck />
        </span>
        <h2 id="cgate-t">{updated ? t("gate.titleUpdated") : t("gate.title")}</h2>
        <p>{t("gate.text")}</p>
        <ConsentChecklist
          items={docs}
          checked={agreed}
          onToggle={(slug, on) => setAgreed((a) => ({ ...a, [slug]: on }))}
        />
        <div className="cgate__actions">
          <button
            className="btn btn--grad btn--full"
            type="button"
            disabled={!docs.every((d) => agreed[d.slug])}
            onClick={onAccept}
          >
            {t("gate.accept")}
          </button>
          <button className="btn btn--ghost btn--full" type="button" onClick={onLogout}>
            {t("gate.logout")}
          </button>
          {sos ? (
            <Link href="/portal/client/sos" className="btn btn--full cgate__sos">
              <IconAlert />
              {t("gate.sos")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
