"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-editor-panels.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import type { StudioVersion } from "@/lib/services/studio";
import { SxDrawer } from "../layout/Drawer";
import { SxGuideBody } from "../layout/Guide";
import { useStudioLabels } from "../useStudioLabels";
import { ctorGlyph } from "../icons";
import type { EditorState } from "./useEditorState";
import { VersionsTab } from "./drawer/VersionsTab";
import { CommentsTab } from "./drawer/CommentsTab";
import { FilesTab } from "./drawer/FilesTab";
import { StepsTab } from "./drawer/StepsTab";

export type EditorTab = "versions" | "comments" | "files" | "steps" | "guide";

export type DrawerTabsInput = { hasObject: boolean; fileRequired: boolean; tab: EditorTab };

export function drawerTabsOf({ hasObject, fileRequired, tab }: DrawerTabsInput): EditorTab[] {
  if (hasObject) return ["versions", "comments", "files", "steps", "guide"];
  if (fileRequired || tab === "files") return ["files", "guide"];
  return ["guide"];
}

export function activeDrawerTab(tabs: readonly EditorTab[], tab: EditorTab): EditorTab {
  return tabs.includes(tab) ? tab : tabs[0] ?? "guide";
}

const TAB_AI: Readonly<Record<EditorTab, string>> = {
  versions: "admin.studio.editor.side.versions",
  comments: "admin.studio.editor.side.comments",
  files: "admin.studio.editor.side.file",
  steps: "admin.studio.editor.side.steps",
  guide: "admin.studio.editor.side.guide",
};

export function EditorDrawer({
  st,
  open,
  tab,
  onTab,
  onClose,
  onPreview,
  onRollback,
}: {
  st: EditorState;
  open: boolean;
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
  onClose: () => void;
  onPreview: (v: StudioVersion) => void;
  onRollback: (v: StudioVersion) => void;
}): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const hasObject = st.mode === "object" && Boolean(st.detail);
  const tabs = drawerTabsOf({ hasObject, fileRequired: st.fileRequired, tab });
  const active = activeDrawerTab(tabs, tab);
  const guideOnly = tabs.length === 1;
  const ctorName = st.code ? labels.ctorName(st.code, st.ctor?.title) : "";
  const groupKey = st.ctor?.navigation?.groupKey;

  const guide = st.code ? <SxGuideBody code={st.code} /> : null;

  if (guideOnly) {
    return (
      <SxDrawer
        open={open}
        onClose={onClose}
        title={t("sx.guide.title")}
        description={
          ctorName ? (
            <span className="sx-guide__ctor">
              {ctorGlyph(st.code, groupKey, { size: 18 })}
              <span>{ctorName}</span>
            </span>
          ) : undefined
        }
        aiId="admin.studio.editor.drawer"
      >
        {open ? <div data-ai-id={TAB_AI.guide} data-ai-type="section" data-ai-label={t("sx.guide.title")}>{guide}</div> : null}
      </SxDrawer>
    );
  }

  const versions = st.detail?.versions.length ?? 0;
  const comments = st.comments.items?.length ?? 0;
  const steps = st.detail?.steps.length ?? 0;
  const fileMissing = st.fileRequired && !st.hasFile;

  const body = (key: EditorTab): ReactNode => {
    switch (key) {
      case "versions":
        return <VersionsTab st={st} onPreview={onPreview} onRollback={onRollback} />;
      case "comments":
        return <CommentsTab st={st} />;
      case "files":
        return <FilesTab st={st} />;
      case "steps":
        return <StepsTab st={st} />;
      default:
        return guide;
    }
  };

  const labelOf: Readonly<Record<EditorTab, string>> = {
    versions: t("sx.editor.tab.versions"),
    comments: t("sx.editor.tab.comments"),
    files: t("sx.editor.tab.files"),
    steps: t("sx.editor.tab.steps"),
    guide: t("sx.editor.tab.guide"),
  };

  const items: TabItem<EditorTab>[] = tabs.map((key) => ({
    key,
    label:
      key === "files" && fileMissing ? (
        <span className="sx-ed-tabl">
          {labelOf[key]}
          <span className="sx-ed-tabdot" aria-hidden="true" />
          <span className="sx-vh">{t("sx.editor.files.required")}</span>
        </span>
      ) : (
        labelOf[key]
      ),
    count: key === "versions" && versions ? versions : key === "comments" && comments ? comments : key === "steps" && steps && !st.direct ? steps : null,
    aiId: TAB_AI[key],
    aiLabel: labelOf[key],
    lazy: true,
    panel: open ? body(key) : null,
  }));

  return (
    <SxDrawer open={open} onClose={onClose} size="lg" title={t("sx.editor.drawer")} description={st.title || ctorName || undefined} aiId="admin.studio.editor.drawer">
      <Tabs<EditorTab>
        items={items}
        value={active}
        onChange={onTab}
        variant="line"
        label={t("sx.editor.drawer")}
        idPrefix="sx-ed-side"
        className="sx-tabs"
      />
    </SxDrawer>
  );
}
