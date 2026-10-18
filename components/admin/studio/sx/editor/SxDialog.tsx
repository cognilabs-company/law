"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-editor-panels.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import Modal, { type ModalInitialFocus } from "@/components/admin/Modal";
import { SxIconScope, CircleAlertIcon, glyph } from "../icons";

export type SxDialogErrorText = { title: string; text: string } | null;

export function SxDialogError({ error, id }: { error: SxDialogErrorText; id?: string }): ReactElement | null {
  if (!error) return null;
  return (
    <div className="sx-dlg__err" role="alert" id={id}>
      {glyph(CircleAlertIcon, { size: 18, className: "sx-dlg__erricon" })}
      <div className="sx-dlg__errbody">
        <p className="sx-dlg__errtitle">{error.title}</p>
        {error.text ? <p className="sx-dlg__errtext">{error.text}</p> : null}
      </div>
    </div>
  );
}

export type SxDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  dirty?: boolean;
  size?: "sm" | "md";
  initialFocus?: ModalInitialFocus;
  aiId: string;
  children: ReactNode;
};

export function SxDialog({ open, onClose, title, description, footer, busy = false, dirty = false, size = "md", initialFocus, aiId, children }: SxDialogProps): ReactElement {
  const t = useTranslations("studio");
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      variant="dialog"
      open={open}
      onClose={close}
      title={title}
      description={description ? <SxIconScope>{description}</SxIconScope> : undefined}
      footer={
        footer ? (
          <SxIconScope>
            <div className="sx-dlg__acts">{footer}</div>
          </SxIconScope>
        ) : undefined
      }
      busy={busy}
      dirty={dirty && !busy}
      size={size}
      initialFocus={initialFocus}
      aiId={aiId}
      closeLabel={t("sx.ui.close")}
    >
      <SxIconScope>
        <div className="sx-pop sx-dw sx-dlg" data-size={size} aria-busy={busy || undefined}>
          {children}
        </div>
      </SxIconScope>
    </Modal>
  );
}
