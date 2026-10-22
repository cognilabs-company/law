"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-editor.css";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { layerCount } from "@/lib/layers";
import type { StudioVersion } from "@/lib/services/studio";
import type { SxTranslate } from "../contract";
import { SxPage } from "../layout/Page";
import { focusFieldPath } from "../schema/focus";
import { StatusRail } from "../StatusRail";
import type { SxNeed } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { ConflictDialog, EditorDialogs, confirmArchive, confirmCascade, confirmRestore, confirmWithdraw, type EditorDialog } from "./EditorDialogs";
import { EditorDrawer, type EditorTab } from "./EditorDrawer";
import { EditorForm } from "./EditorForm";
import { EditorActions, EditorBelow, EditorMeta, editorCrumbs, type EditorMenuKey } from "./EditorHeader";
import { ctxModeOf, isSaveShortcut } from "./model";
import { useEditorState, type EditorAlert, type EditorInit, type EditorState } from "./useEditorState";
import { useLeaveGuard, type LeaveGuard } from "./useLeaveGuard";
import { useCtorVisit } from "../home/ctorUsage";
import type { CategoryKind } from "../ctor/services";
import { CategoryKindBar, CategoryKindGate } from "../shared/CategoryKind";

export type EditorProps = { id: string; newCode: string; ctx: string; focus?: string; prefill?: Readonly<Record<string, string>>; categoryKind?: CategoryKind };

type DrawerState = { open: boolean; tab: EditorTab | null };

const NARROW_QUERY = "(max-width: 640px)";
const FILE_PATHS = new Set(["file", "@file"]);

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribeNarrow(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function narrowNow(): boolean {
  return canMatch() && window.matchMedia(NARROW_QUERY).matches;
}

const serverNarrow = () => false;

function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowNow, serverNarrow);
}

function needOf(init: EditorInit): SxNeed {
  if (init.id !== null) return "any";
  const mode = ctxModeOf(init.ctx ?? "");
  return mode === "view" || mode === "edit" ? "any" : "edit";
}

function objectHref(id: string, focus?: string): string {
  const base = `/admin/studio/o/${encodeURIComponent(id)}`;
  return focus ? `${base}?focus=${encodeURIComponent(focus)}` : base;
}

function hasObject(st: EditorState): boolean {
  return st.mode === "object" && !!st.detail;
}

function defaultTab(st: EditorState): EditorTab {
  if (!hasObject(st)) return "guide";
  return st.code === "K06" && st.payload.mode === "upload" ? "files" : "versions";
}

function pageTitle(st: EditorState, t: SxTranslate): string {
  if (st.title) return st.title;
  if (st.phase === "loading") return "";
  if (st.categoryKind) return t(st.categoryKind === "sub" ? "sx.k01kind.newSub" : "sx.k01kind.newRoot");
  if (st.phase === "not-found") return t("sx.editor.notFoundTitle");
  if (st.phase === "unknown-ctor") return t("sx.editor.unknownTitle");
  if (st.phase === "load-error") return t("sx.ui.errorTitle");
  return t("sx.editor.newRecord");
}

function EditorScreen({ init }: { init: EditorInit }): ReactElement {
  const t = useTranslations("studio");
  const tr: SxTranslate = (key, values) => t(key, values);
  const labels = useStudioLabels();
  const router = useRouter();
  const narrow = useNarrow();
  const guardRef = useRef<LeaveGuard | null>(null);
  const [dialog, setDialog] = useState<EditorDialog>(null);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, tab: null });

  const st = useEditorState(init, {
    lockLive: true,
    reviewEdit: true,
    onCreated: async (d) => {
      await guardRef.current?.release();
      router.replace(objectHref(d.id));
    },
    onRedirect: (objectId) => router.replace(objectHref(objectId)),
    onFocusFail: (path) => {
      if (FILE_PATHS.has(path)) setDrawer({ open: true, tab: "files" });
    },
  });
  useCtorVisit(st.code, init.id ? "editor" : "create");

  const guard = useLeaveGuard(st.changed && !st.readOnly, {
    title: t("sx.editor.leave.title"),
    text: t("sx.editor.leave.text"),
    confirmLabel: t("sx.editor.leave.confirm"),
    cancelLabel: t("sx.editor.leave.stay"),
  });

  useEffect(() => {
    guardRef.current = guard;
  });

  const openDrawer = (tab: EditorTab) => setDrawer({ open: true, tab });

  const closeDialog = () => {
    setDialog(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const page = document.querySelector<HTMLElement>(".sx-page");
        const active = document.activeElement;
        if (!page || (active && active !== document.body && page.contains(active))) return;
        if (active && active !== document.body && active.closest("[role=dialog]")) return;
        const target = page.querySelector<HTMLElement>(".sx-ed__primary") ?? page.querySelector<HTMLElement>('[data-ai-id="admin.studio.editor.menu"]');
        target?.focus({ preventScroll: true });
      }),
    );
  };

  const onSave = async () => {
    if (st.cascadeWarning && !(await confirmCascade(st.cascadeWarning, tr))) return;
    await st.save();
  };

  const startSubmit = async () => {
    if (await st.prepareSubmit()) setDialog({ kind: "submit" });
  };

  const onPrimary = () => {
    switch (st.primary) {
      case "saveSubmit":
      case "submit":
      case "publishDirect":
        void startSubmit();
        return;
      case "publish":
        setDialog({ kind: "publish" });
        return;
      case "openReview":
        guard.go("/admin/studio/approvals");
        return;
      case "edit":
        guard.go(st.editHref);
        return;
      case "save":
        void onSave();
        return;
      case "restore":
        void confirmRestore(st, tr);
        return;
      default:
        return;
    }
  };

  const onMenu = (item: EditorMenuKey) => {
    switch (item) {
      case "save":
        void onSave();
        return;
      case "saveNote":
        setDialog({ kind: "saveNote" });
        return;
      case "versions":
      case "comments":
      case "files":
      case "steps":
      case "guide":
        openDrawer(item);
        return;
      case "clone":
        if (st.mode === "object") setDialog({ kind: "clone", newVersion: false });
        else guard.go(st.cloneHref());
        return;
      case "newVersion":
        setDialog({ kind: "clone", newVersion: true });
        return;
      case "archive":
        void confirmArchive(st, tr);
        return;
      case "withdraw":
        void confirmWithdraw(st, tr);
        return;
      case "restore":
        void confirmRestore(st, tr);
        return;
    }
  };

  const onCloned = (id: string, newVersion: boolean) => {
    const focus = newVersion ? st.layout.newVersion?.focus : (st.model?.titleField ?? undefined);
    guard.go(objectHref(id, focus || undefined));
  };

  const onAlertAction = (kind: NonNullable<EditorAlert>["kind"]) => {
    if (kind === "remote") st.loadRemote();
    else if (kind === "file") {
      if (!focusFieldPath(st.idPrefix, "file")) openDrawer("files");
    }
    else if (kind === "locked") void confirmWithdraw(st, tr);
  };

  const onPick = (path: string) => {
    if (!focusFieldPath(st.idPrefix, path) && FILE_PATHS.has(path)) openDrawer("files");
  };

  const keyRef = useRef({ armed: false, allowed: false, save: onSave });
  useEffect(() => {
    keyRef.current = {
      armed: st.can.save,
      allowed: st.can.save && st.busy === "" && !(st.mode === "object" && !st.dirty),
      save: onSave,
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e)) return;
      const k = keyRef.current;
      if (!k.armed) return;
      e.preventDefault();
      if (!k.allowed || e.repeat || layerCount("overlay") > 0) return;
      void k.save();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const focusPath = init.focus ?? "";
  const focusReady = st.phase === "ready" && !!st.model && !st.schemaFailed && !st.blocked;
  const focusedRef = useRef(false);
  const idPrefix = st.idPrefix;
  useEffect(() => {
    if (!focusPath || !focusReady || focusedRef.current) return;
    const frame = requestAnimationFrame(() => {
      focusedRef.current = true;
      focusFieldPath(idPrefix, focusPath);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, focusReady, idPrefix]);

  const ready = st.phase === "ready";
  const railMode = st.mode === "object" || st.mode === "create" || st.mode === "clone";
  const tab = drawer.tab ?? defaultTab(st);

  return (
    <SxPage
      layout="record"
      look="neon"
      aiId="admin.studio.editor"
      title={pageTitle(st, tr)}
      crumbs={editorCrumbs(st, labels)}
      need={needOf(init)}
      meta={ready ? <EditorMeta st={st} /> : undefined}
      statusWhenStuck={ready && railMode && !st.blocked ? <StatusRail status={st.status} direct={st.direct} variant="compact" /> : undefined}
      actions={ready ? <EditorActions st={st} narrow={narrow} onSave={() => void onSave()} onPrimary={onPrimary} onMenu={onMenu} /> : undefined}
      below={
        <>
          {st.categoryKind ? <CategoryKindBar kind={st.categoryKind} base={newCategoryBase(init.ctx ?? "")} /> : null}
          <EditorBelow st={st} narrow={narrow} onAlertAction={onAlertAction} />
        </>
      }
    >
      <EditorForm st={st} onPick={onPick} />
      <EditorDrawer
        st={st}
        open={drawer.open}
        tab={tab}
        onTab={(next) => setDrawer({ open: true, tab: next })}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        onPreview={(version: StudioVersion) => setDialog({ kind: "preview", version })}
        onRollback={(version: StudioVersion) => setDialog({ kind: "rollback", version })}
      />
      <EditorDialogs
        st={st}
        dialog={dialog}
        onClose={closeDialog}
        onCloned={onCloned}
        onRollback={(version: StudioVersion) => setDialog({ kind: "rollback", version })}
      />
      <ConflictDialog st={st} />
    </SxPage>
  );
}

// The plain "new category" link, before a kind is chosen.
const newCategoryBase = (ctx: string): string => `/admin/studio/o/new?new=K01${ctx ? `&ctx=${encodeURIComponent(ctx)}` : ""}`;

export function Editor({ id, newCode, ctx, focus, prefill, categoryKind }: EditorProps): ReactElement {
  const labels = useStudioLabels();
  const category = !!newCode && newCode.toUpperCase() === "K01" && (ctxModeOf(ctx) === "" || ctxModeOf(ctx) === "create");
  if (category && !categoryKind) return <CategoryKindGate base={newCategoryBase(ctx)} listHref="/admin/studio/c/K01" listLabel={labels.ctorName("K01")} />;
  const kind = category ? categoryKind : undefined;
  const init: EditorInit = newCode ? { code: newCode, id: null, ctx, focus, initialPayload: prefill ? { ...prefill } : undefined, categoryKind: kind } : { code: "", id, focus };
  return <EditorScreen key={newCode ? `new:${newCode}:${ctx}:${kind ?? ""}:${prefill ? JSON.stringify(prefill) : ""}` : `id:${id}`} init={init} />;
}
