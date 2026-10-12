"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Dict } from "@/lib/http";

type Connector = { executeMethod?: (name: string, args: unknown[], cb?: (r: unknown) => void) => void; disconnect?: () => void };
type OoInstance = { destroyEditor?: () => void; createConnector?: () => Connector | null | undefined };
type DocsApi = { DocEditor: new (containerId: string, config: unknown) => OoInstance };

const LOAD_TIMEOUT_MS = 25000;
const PASTE_TIMEOUT_MS = 1500;

function docsApi(): DocsApi | undefined {
  return (window as unknown as { DocsAPI?: DocsApi }).DocsAPI;
}

let hostSeq = 0;

export type OoStatus = "off" | "loading" | "ready" | "error";

export function useOnlyOffice({
  hostRef,
  config,
  serverUrl,
  mountKey,
  onDocState,
  onDocError,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  config: Dict | null;
  serverUrl: string;
  mountKey: string;
  onDocState: (pending: boolean) => void;
  onDocError: () => void;
}): { status: OoStatus; insertText: (text: string) => Promise<boolean> } {
  const [readyKey, setReadyKey] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const editor = useRef<OoInstance | null>(null);
  const connector = useRef<Connector | null>(null);
  const onDocStateRef = useRef(onDocState);
  const onDocErrorRef = useRef(onDocError);
  const configRef = useRef(config);

  useEffect(() => {
    onDocStateRef.current = onDocState;
    onDocErrorRef.current = onDocError;
    configRef.current = config;
  });

  const active = Boolean(config && serverUrl && mountKey);

  useEffect(() => {
    const host = hostRef.current;
    const cfgBase = configRef.current;
    if (!host || !cfgBase || !serverUrl || !mountKey) return;
    let cancelled = false;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    hostSeq += 1;
    const placeholderId = `tpe-oo-${hostSeq}`;
    const fail = () => {
      if (!cancelled && !ready) setErrorKey(mountKey);
    };
    const markReady = () => {
      ready = true;
      if (timer) clearTimeout(timer);
      if (!cancelled) setReadyKey(mountKey);
    };
    const events = {
      ...((cfgBase.events && typeof cfgBase.events === "object" ? cfgBase.events : {}) as Dict),
      onAppReady: markReady,
      onDocumentReady: markReady,
      onDocumentStateChange: (ev: { data?: unknown }) => {
        if (!cancelled) onDocStateRef.current(Boolean(ev && ev.data));
      },
      onError: () => {
        if (cancelled) return;
        if (ready) onDocErrorRef.current();
        else fail();
      },
    };
    const cfg = { ...cfgBase, events };
    const init = () => {
      const api = docsApi();
      if (cancelled) return;
      if (!api) {
        fail();
        return;
      }
      try {
        const ph = document.createElement("div");
        ph.id = placeholderId;
        ph.className = "tpe-oo__ph";
        host.replaceChildren(ph);
        editor.current = new api.DocEditor(placeholderId, cfg);
      } catch {
        fail();
      }
    };
    timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    if (docsApi()) {
      init();
    } else {
      const src = `${serverUrl}/web-apps/apps/api/documents/api.js`;
      let script = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice-src="${src}"]`);
      if (script && script.dataset.failed === "1") {
        script.remove();
        script = null;
      }
      if (!script) {
        script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.onlyofficeSrc = src;
        document.body.appendChild(script);
      }
      const el = script;
      el.addEventListener("load", init, { once: true });
      el.addEventListener(
        "error",
        () => {
          el.dataset.failed = "1";
          fail();
        },
        { once: true },
      );
    }
    const ed = editor;
    const conn = connector;
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try {
        conn.current?.disconnect?.();
      } catch {}
      conn.current = null;
      try {
        ed.current?.destroyEditor?.();
      } catch {}
      ed.current = null;
      host.replaceChildren();
    };
  }, [hostRef, serverUrl, mountKey]);

  const insertText = useCallback((text: string) => {
    const ed = editor.current;
    if (!ed || typeof ed.createConnector !== "function") return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(ok);
      };
      timer = setTimeout(() => finish(false), PASTE_TIMEOUT_MS);
      try {
        if (!connector.current) connector.current = ed.createConnector?.() ?? null;
        const c = connector.current;
        if (!c || typeof c.executeMethod !== "function") {
          finish(false);
          return;
        }
        c.executeMethod("PasteText", [text], () => finish(true));
      } catch {
        connector.current = null;
        finish(false);
      }
    });
  }, []);

  const status: OoStatus = !active ? "off" : errorKey === mountKey ? "error" : readyKey === mountKey ? "ready" : "loading";
  return { status, insertText };
}
