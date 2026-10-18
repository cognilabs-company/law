"use client";

import "./sx-ctorpage.css";
import type { ReactElement, ReactNode } from "react";
import { ctorGlyph } from "../icons";

export type CtorEmptyProps = { code: string; group?: string; title: string; text?: string; action?: ReactNode };

export function CtorEmpty({ code, group, title, text, action }: CtorEmptyProps): ReactElement {
  return (
    <div className="sx-cp-empty" role="status">
      <span className="sx-cp-empty__art" aria-hidden="true">
        <i className="sx-cp-empty__ring" data-n="3" />
        <i className="sx-cp-empty__ring" data-n="2" />
        <i className="sx-cp-empty__ring" data-n="1" />
        <span className="sx-cp-squircle" data-size="lg">
          {ctorGlyph(code, group, { size: 30 })}
        </span>
      </span>
      <p className="sx-cp-empty__title">{title}</p>
      {text ? <p className="sx-cp-empty__text">{text}</p> : null}
      {action ? <div className="sx-cp-empty__action">{action}</div> : null}
    </div>
  );
}
