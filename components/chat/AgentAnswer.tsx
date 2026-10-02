"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Source } from "@/lib/api";
import {
  classifyAgentAnswer,
  normUrl,
  parseAgentMarkdown,
  splitSourceTitle,
  type MdBlock,
} from "@/lib/agentAnswer";
import {
  IconAlert,
  IconArrowRight,
  IconExternal,
  IconFileText,
  IconInfo,
  IconRefresh,
  IconScale,
} from "../icons";

// A legal agent answer (md/FRONTEND_LEGAL_AGENT.md §2.2–§3). Everything is
// built as React elements from the parsed Markdown — no HTML string ever
// reaches the DOM, so there is nothing to sanitise and no raw HTML can slip
// through. Inline lex.uz links become citations numbered like the matching
// card in the sources block below.

type Props = {
  content: string;
  sources?: Source[];
  compact?: boolean;
  // Only the latest answer offers follow-up chips and retry.
  interactive?: boolean;
  onAsk?: (q: string) => void;
  onRetry?: () => void;
  documentHref?: string;
};

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
// Link, **bold**, `code`, *italic*, _italic_. The italic forms capture the
// character before them (no lookbehind: the build targets ES2017) so that
// snake_case or 2*3*4 never turn into emphasis.
const INLINE_RE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+?)\*\*|`([^`]+)`|(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])|(^|[^\w_])_([^_\s][^_]*?)_(?![\w_])/g;

export default function AgentAnswer({
  content,
  sources = [],
  compact = false,
  interactive = false,
  onAsk,
  onRetry,
  documentHref,
}: Props) {
  const t = useTranslations("agent");
  const blocks = useMemo(() => parseAgentMarkdown(content), [content]);
  const kind = useMemo(() => classifyAgentAnswer(content), [content]);
  const cited = useMemo(() => {
    const m = new Map<string, number>();
    sources.forEach((s, i) => {
      if (s.url && !m.has(normUrl(s.url))) m.set(normUrl(s.url), i + 1);
    });
    return m;
  }, [sources]);

  function inline(text: string, key = "i"): ReactNode[] {
    const out: ReactNode[] = [];
    let last = 0;
    let n = 0;
    // A fresh regex per call: inline() recurses, and a shared /g regex's
    // lastIndex would be reset under the outer loop.
    const re = new RegExp(INLINE_RE.source, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const pre = m[5] ?? m[7] ?? "";
      const at = m.index + pre.length;
      if (at > last) out.push(...lines(text.slice(last, at), `${key}t${n}`));
      const k = `${key}-${n++}`;
      if (m[1] !== undefined) {
        const url = m[2];
        if (!SAFE_URL.test(url)) out.push(<Fragment key={k}>{inline(m[1], k)}</Fragment>);
        else {
          const num = cited.get(normUrl(url));
          const law = /(^|\.)lex\.uz$/i.test(safeHost(url));
          out.push(
            <a
              key={k}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={law ? "acite" : "alink"}
              title={law ? t("openOnLex") : url}
            >
              {law ? <IconScale className="acite__ic" aria-hidden /> : null}
              <span>{inline(m[1], k)}</span>
              {num ? <sup className="acite__n">{num}</sup> : null}
            </a>,
          );
        }
      } else if (m[3] !== undefined) out.push(<strong key={k}>{inline(m[3], k)}</strong>);
      else if (m[4] !== undefined) out.push(<code key={k}>{m[4]}</code>);
      else out.push(<em key={k}>{inline((m[6] ?? m[8]) as string, k)}</em>);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(...lines(text.slice(last), `${key}e`));
    return out;
  }

  function block(b: MdBlock, i: number): ReactNode {
    switch (b.t) {
      case "lead":
        return (
          <div key={i} className="ag-lead">
            <span className="ag-lead__lbl">{b.label}</span>
            <p>{inline(b.text, `l${i}`)}</p>
          </div>
        );
      case "h":
        return <h4 key={i} className="ag-h">{inline(b.text, `h${i}`)}</h4>;
      case "p":
        return <p key={i} className="ag-p">{inline(b.text, `p${i}`)}</p>;
      case "quote":
        return <blockquote key={i} className="ag-q">{inline(b.text, `q${i}`)}</blockquote>;
      case "note":
        return (
          <div key={i} className="ag-note">
            <IconInfo aria-hidden />
            <span>{inline(b.text, `n${i}`)}</span>
          </div>
        );
      case "footer":
        return (
          <p key={i} className="ag-foot">
            <IconShieldIcon />
            <span>{inline(b.text, `f${i}`)}</span>
          </p>
        );
      case "followups":
        return (
          <div key={i} className="ag-fu">
            <div className="ag-fu__t">{b.title}</div>
            <div className="ag-fu__list">
              {b.items.map((q, j) =>
                interactive && onAsk ? (
                  <button key={j} type="button" className="ag-fu__chip" onClick={() => onAsk(q)}>
                    <span>{q}</span>
                    <IconArrowRight aria-hidden />
                  </button>
                ) : (
                  <span key={j} className="ag-fu__chip ag-fu__chip--off">{q}</span>
                ),
              )}
            </div>
          </div>
        );
      case "list": {
        const items = b.items.map((it, j) => (
          <li key={j}>
            {it.parts.map((p, k) =>
              p.kind === "quote" ? (
                <blockquote key={k} className="ag-q">{inline(p.text, `L${i}.${j}.${k}`)}</blockquote>
              ) : (
                <div key={k} className="ag-li">{inline(p.text, `L${i}.${j}.${k}`)}</div>
              ),
            )}
            {it.sub.length ? (
              <ul className="ag-list ag-list--sub">
                {it.sub.map((s, k) => <li key={k}><div className="ag-li">{inline(s, `S${i}.${j}.${k}`)}</div></li>)}
              </ul>
            ) : null}
          </li>
        ));
        return b.ordered ? (
          <ol key={i} className="ag-list ag-list--ol" start={b.start} style={{ counterReset: `ag ${b.start - 1}` }}>{items}</ol>
        ) : (
          <ul key={i} className="ag-list">{items}</ul>
        );
      }
    }
  }

  const checkedOnly = kind === "not_found";

  return (
    <div className={`ag${compact ? " ag--compact" : ""}`}>
      {kind === "lex_unavailable" || kind === "error" ? (
        <div className="ag-alert">
          <IconAlert aria-hidden />
          <div className="ag-alert__body">{blocks.map(block)}</div>
        </div>
      ) : kind === "not_found" ? (
        <div className="ag-alert ag-alert--muted">
          <IconInfo aria-hidden />
          <div className="ag-alert__body">{blocks.map(block)}</div>
        </div>
      ) : (
        blocks.map(block)
      )}

      {sources.length ? (
        <SourceList sources={sources} checkedOnly={checkedOnly} compact={compact} />
      ) : null}

      {interactive && onRetry && (kind === "lex_unavailable" || kind === "error") ? (
        <button type="button" className="ag-act" onClick={onRetry}>
          <IconRefresh aria-hidden />
          {t("retry")}
        </button>
      ) : null}
      {kind === "document_request" && documentHref ? (
        <Link href={documentHref} className="ag-act ag-act--pri">
          <IconFileText aria-hidden />
          {t("createDocRequest")}
        </Link>
      ) : null}
    </div>
  );
}

function SourceList({
  sources,
  checkedOnly,
  compact,
}: {
  sources: Source[];
  checkedOnly: boolean;
  compact: boolean;
}) {
  const t = useTranslations("agent");
  const LIMIT = compact ? 2 : 4;
  const [all, setAll] = useState(false);
  const shown = all ? sources : sources.slice(0, LIMIT);
  const rest = sources.length - shown.length;

  return (
    <section className="ag-src" aria-label={checkedOnly ? t("checkedDocs") : t("sources")}>
      <header className="ag-src__h">
        <span className="ag-src__ic"><IconScale aria-hidden /></span>
        <b>{checkedOnly ? t("checkedDocs") : t("sources")}</b>
        <span className="ag-src__cnt">{sources.length}</span>
        <span className="ag-src__via">lex.uz</span>
      </header>
      <ol className="ag-src__list">
        {shown.map((s, i) => (
          <SourceCard key={i} s={s} n={i + 1} />
        ))}
      </ol>
      {rest > 0 ? (
        <button type="button" className="ag-src__more" onClick={() => setAll(true)}>
          {t("moreSources", { count: rest })}
        </button>
      ) : null}
    </section>
  );
}

function SourceCard({ s, n }: { s: Source; n: number }) {
  const t = useTranslations("agent");
  const [open, setOpen] = useState(false);
  const { doc, article, heading } = splitSourceTitle(s.title || s.url || "");
  const snippet = (s.snippet || "").trim();
  const long = snippet.length > 220;
  const safe = s.url && SAFE_URL.test(s.url) ? s.url : "";

  const head = (
    <>
      <span className="ag-card__n">{n}</span>
      <span className="ag-card__ttl">
        <span className="ag-card__doc">{doc}</span>
        {article || heading ? (
          <span className="ag-card__art">
            {article ? <b>{article}</b> : null}
            {article && heading ? " · " : null}
            {heading}
          </span>
        ) : null}
      </span>
      {safe ? <IconExternal className="ag-card__ext" aria-hidden /> : null}
    </>
  );

  return (
    <li className="ag-card">
      {safe ? (
        <a className="ag-card__hd" href={safe} target="_blank" rel="noopener noreferrer" title={t("openOnLex")}>
          {head}
        </a>
      ) : (
        <div className="ag-card__hd">{head}</div>
      )}
      {snippet ? (
        <>
          <blockquote className={`ag-card__q${long && !open ? " ag-card__q--clip" : ""}`}>{snippet}</blockquote>
          {long ? (
            <button type="button" className="ag-card__tog" onClick={() => setOpen((v) => !v)}>
              {open ? t("showLess") : t("showMore")}
            </button>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function IconShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ag-foot__ic">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Soft line breaks inside a paragraph are real breaks in these answers.
function lines(s: string, key: string): ReactNode[] {
  const parts = s.split("\n");
  return parts.flatMap((p, i) => (i ? [<br key={`${key}b${i}`} />, p] : [p]));
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}
