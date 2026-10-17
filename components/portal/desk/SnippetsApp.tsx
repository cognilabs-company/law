"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { createSnippet, deleteSnippet, getSnippets, updateSnippet, useSnippet as markUsed, type Snippet } from "@/lib/services/lawyerDesktop";
import { IconCheck, IconCopy, IconPlus, IconSearch, IconStar, IconTrash } from "@/components/icons";

type Draft = { id: string; category: string; title: string; content: string; favorite: boolean };
const BLANK: Draft = { id: "", category: "general", title: "", content: "", favorite: false };

// Legal snippets (§14), as a notes app: the list on the left (search,
// category, favourites), the snippet on the right. Copying one puts it on
// the clipboard and tells the backend it was used, so the most used rise.
// LexGo's own snippets can be read and copied; only personal ones are
// edited or deleted. Passwords, codes, tokens and phone-like values are
// refused by the backend, and said so.
export default function SnippetsApp() {
  const t = useTranslations("portal.desk.snippets");
  const [list, setList] = useState<Snippet[] | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [favourite, setFavourite] = useState(false);
  const [sel, setSel] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    const h = setTimeout(() => {
      getSnippets({ q: q.trim(), category, favorite: favourite }, c.signal)
        .then((l) => {
          if (c.signal.aborted) return;
          setList(l);
          setErr("");
        })
        .catch(() => {
          if (c.signal.aborted) return;
          setList([]);
          setErr(t("loadError"));
        });
    }, 250);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [q, category, favourite, tick, t]);

  const cur = list?.find((s) => s.id === sel) ?? null;
  const cats = [...new Set((list ?? []).map((s) => s.category))].sort();

  const reason = (e: unknown) => (e instanceof ApiError && e.code === "sensitive_snippet_blocked" ? t("sensitive") : t("saveError"));
  async function save() {
    if (!draft || !draft.title.trim() || !draft.content.trim()) return;
    setErr("");
    const body = { category: draft.category.trim() || "general", title: draft.title.trim(), content: draft.content, is_favorite: draft.favorite };
    try {
      if (draft.id) await updateSnippet(draft.id, body);
      else await createSnippet(body);
      setDraft(null);
      setTick((n) => n + 1);
    } catch (e) {
      setErr(reason(e));
    }
  }
  async function copy(s: Snippet) {
    try {
      await navigator.clipboard.writeText(s.content);
      setCopied(s.id);
      setTimeout(() => setCopied(""), 1600);
      markUsed(s.id).catch(() => undefined);
    } catch {
      setErr(t("copyError"));
    }
  }
  async function remove(s: Snippet) {
    try {
      await deleteSnippet(s.id);
      setSel("");
      setTick((n) => n + 1);
    } catch {
      setErr(t("saveError"));
    }
  }

  return (
    <div className="wd-snip">
      <aside className="wd-snip__side">
        <div className="wd-snip__q">
          <IconSearch aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} maxLength={80} />
        </div>
        <div className="wd-snip__filters">
          <button type="button" className={!category && !favourite ? "is-on" : ""} onClick={() => (setCategory(""), setFavourite(false))}>
            {t("all")}
          </button>
          <button type="button" className={favourite ? "is-on" : ""} aria-pressed={favourite} onClick={() => setFavourite((v) => !v)}>
            <IconStar aria-hidden />
            {t("favourites")}
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className={category === c ? "is-on" : ""} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {t.has(`cat.${c}`) ? t(`cat.${c}`) : c}
            </button>
          ))}
        </div>
        <button type="button" className="wd-snip__new" onClick={() => (setDraft({ ...BLANK, category: category || "general" }), setSel(""))}>
          <IconPlus aria-hidden />
          {t("new")}
        </button>
        <ul className="wd-snip__list" aria-label={t("title")}>
          {list === null ? <li className="wd-snip__none">{t("loading")}</li> : list.length ? null : <li className="wd-snip__none">{t("empty")}</li>}
          {(list ?? []).map((s) => (
            <li key={s.id}>
              <button type="button" className={sel === s.id ? "is-on" : ""} aria-current={sel === s.id || undefined} onClick={() => (setSel(s.id), setDraft(null))}>
                <b>
                  {s.favorite ? <IconStar aria-hidden /> : null}
                  {s.title}
                </b>
                <small>{s.content}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="wd-snip__main">
        {err ? <p className="wd-snip__err" role="alert">{err}</p> : null}
        {draft ? (
          <form
            className="wd-snip__form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("titlePh")} aria-label={t("titleLabel")} maxLength={120} required autoFocus />
            <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder={t("categoryPh")} aria-label={t("category")} maxLength={40} list="wd-snip-cats" />
            <datalist id="wd-snip-cats">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder={t("contentPh")} aria-label={t("content")} rows={12} maxLength={8000} required />
            <label className="wd-snip__fav">
              <input type="checkbox" checked={draft.favorite} onChange={(e) => setDraft({ ...draft, favorite: e.target.checked })} />
              {t("favourite")}
            </label>
            <p className="wd-snip__hint">{t("hint")}</p>
            <div className="wd-snip__acts">
              <button type="button" className="btn btn--line btn--sm" onClick={() => setDraft(null)}>
                {t("cancel")}
              </button>
              <button type="submit" className="btn btn--pri btn--sm" disabled={!draft.title.trim() || !draft.content.trim()}>
                <IconCheck aria-hidden />
                {t("save")}
              </button>
            </div>
          </form>
        ) : cur ? (
          <article className="wd-snip__view">
            <header>
              <div>
                <h2>{cur.title}</h2>
                <small>
                  {t.has(`cat.${cur.category}`) ? t(`cat.${cur.category}`) : cur.category} · {cur.personal ? t("personal") : t("lexgo")}
                  {cur.uses ? ` · ${t("uses", { n: cur.uses })}` : ""}
                </small>
              </div>
              <span>
                <button type="button" className="btn btn--pri btn--sm" onClick={() => void copy(cur)}>
                  {copied === cur.id ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
                  {copied === cur.id ? t("copied") : t("copy")}
                </button>
                {cur.personal ? (
                  <>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setDraft({ id: cur.id, category: cur.category, title: cur.title, content: cur.content, favorite: cur.favorite })}>
                      {t("edit")}
                    </button>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => void remove(cur)} aria-label={t("delete")} title={t("delete")}>
                      <IconTrash aria-hidden />
                    </button>
                  </>
                ) : null}
              </span>
            </header>
            <pre>{cur.content}</pre>
          </article>
        ) : (
          <p className="wd-snip__pick">{t("pick")}</p>
        )}
      </section>
    </div>
  );
}
