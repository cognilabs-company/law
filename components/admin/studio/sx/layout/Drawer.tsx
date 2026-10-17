"use client";

import "../sx-core.css";
import "../sx-layout.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import Modal, { type ModalInitialFocus } from "@/components/admin/Modal";
import { SxIconScope } from "../icons";

export type SxDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: "md" | "lg";
  footer?: ReactNode;
  busy?: boolean;
  dirty?: boolean;
  initialFocus?: ModalInitialFocus;
  aiId?: string;
  children: ReactNode;
};

export function SxDrawer({ open, onClose, title, description, size = "md", footer, busy, dirty, initialFocus, aiId, children }: SxDrawerProps): ReactElement {
  const t = useTranslations("studio");
  return (
    <Modal
      variant="drawer"
      open={open}
      onClose={onClose}
      title={title}
      description={description ? <SxIconScope>{description}</SxIconScope> : undefined}
      footer={footer ? <SxIconScope>{footer}</SxIconScope> : undefined}
      busy={busy}
      dirty={dirty}
      initialFocus={initialFocus}
      aiId={aiId}
      closeLabel={t("sx.ui.close")}
    >
      <SxIconScope>
        <div className="sx-pop sx-dw" data-size={size}>
          {children}
        </div>
      </SxIconScope>
    </Modal>
  );
}
