"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { createSnippet, deleteSnippet, getSnippets, updateSnippet, useSnippet as markUsed, type Snippet } from "@/lib/services/lawyerDesktop";
import { IconAlert, IconCheck, IconCopy, IconEdit, IconFileText, IconFolder, IconInbox, IconPlus, IconStar, IconTrash } from "@/components/icons";
import { App, Btn, Check, Empty, Field, Input, Loading, Search, Sidebar, Tag, TextArea, Tool, Toolbar, useConfirm, useHost, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./snippets.css";

// Legal snippets (§14) as a desktop program — Notes on the Mac, a OneNote-
// like page list on Windows: folders on the side (all, favourites, each
// category), the snippets in the middle, the chosen one on the right to
// copy, edit or delete. Copying one tells the backend it was used, so the
// most used rise. LexGo's own snippets are read-only; passwords, codes,
// tokens and phone-like values are refused by the backend, and said so.

type Draft = { id: string; category: string; title: string; content: string; favorite: boolean };

export default function SnippetsApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.desk.snippets");
  const os = useOs();
  const { menu } = useHost();
  const [list, setList] = useState<Snippet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [sel, setSel] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [cats, setCats] = useState<string[]>([]);
  const [toast, say] = useToast();
  const [confirmNode, confirm] = useConfirm();
  const category = folder.startsWith("c:") ? folder.slice(2) : "";
  const favourite = folder === "fav";

  useEffect(() => {
    const c = new AbortController();
    const h = setTimeout(() => {
      getSnippets({ q: q.trim(), category, favorite: favourite }, c.signal)
        .then((l) => {
          if (c.signal.aborted) return;
          setList(l);
          setFailed(false);
          if (!category && !favourite && !q.trim()) setCats([...new Set(l.map((s) => s.category))].sort());
        })
        .catch(() => {
          if (c.signal.aborted) return;
          setList([]);
          setFailed(true);
        });
    }, 250);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [q, category, favourite, tick]);

  const cur = list?.find((s) => s.id === sel) ?? null;
  const catName = (c: string) => (t.has(`cat.${c}`) ? t(`cat.${c}`) : c);
  const sections: NavSection[] = [
    { id: "lib", title: os === "mac" ? t("library") : undefined, items: [
      { id: "all", label: t("all"), icon: <IconInbox /> },
      { id: "fav", label: t("favourites"), icon: <IconStar /> },
    ] },
    ...(cats.length ? [{ id: "cats", title: t("categories"), items: cats.map((c) => ({ id: `c:${c}`, label: catName(c), icon: <IconFolder /> })) }] : []),
  ];

  async function save() {
    if (!draft || !draft.title.trim() || !draft.content.trim()) return;
    setErr("");
    const body = { category: draft.category.trim() || "general", title: draft.title.trim(), content: draft.content, is_favorite: draft.favorite };
    try {
      if (draft.id) await updateSnippet(draft.id, body);
      else await createSnippet(body);
      setDraft(null);
      setTick((n) => n + 1);
      say(t("savedOk"));
    } catch (e) {
      setErr(e instanceof ApiError && e.code === "sensitive_snippet_blocked" ? t("sensitive") : t("saveError"));
    }
  }
  async function copy(s: Snippet) {
    try {
      await navigator.clipboard.writeText(s.content);
      say(t("copied"));
      markUsed(s.id).catch(() => undefined);
    } catch {
      say(t("copyError"), "err");
    }
  }
  async function remove(s: Snippet) {
    if (!(await confirm({ title: t("deleteAsk", { title: s.title }), ok: t("delete"), cancel: t("cancel"), danger: true }))) return;
    try {
      await deleteSnippet(s.id);
      setSel("");
      setTick((n) => n + 1);
    } catch {
      say(t("saveError"), "err");
    }
  }
  const edit = (s: Snippet) => setDraft({ id: s.id, category: s.category, title: s.title, content: s.content, favorite: s.favorite });
  const startNew = () => {
    setDraft({ id: "", category: category || "general", title: "", content: "", favorite: favourite });
    setSel("");
  };
  const rowMenu = (e: MouseEvent, s: Snippet) => {
    e.preventDefault();
    setSel(s.id);
    menu?.(e, s.title, [
      { id: "copy", label: t("copy"), icon: <IconCopy />, onSelect: () => void copy(s) },
      ...(s.personal
        ? [
            { id: "edit", label: t("edit"), icon: <IconEdit />, onSelect: () => edit(s) },
            { id: "del", label: t("delete"), icon: <IconTrash />, danger: true, onSelect: () => void remove(s) },
          ]
        : []),
    ]);
  };
  const title = folder === "all" ? t("all") : favourite ? t("favourites") : catName(category);

  return (
    <App name="snips" sidebar={<Sidebar label={t("title")} sections={sections} value={folder} onChange={(f) => (setFolder(f), setSel(""), setDraft(null))} />}>
      <Toolbar title={title} subtitle={list ? t("count", { n: list.length }) : undefined} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={t("search")} /> : undefined}>
        <Tool icon={<IconPlus />} label={t("new")} primary={os === "win"} onClick={startNew} />
        {cur ? <Tool icon={<IconCopy />} label={t("copy")} onClick={() => void copy(cur)} /> : null}
        {cur?.personal ? <Tool icon={<IconEdit />} label={t("edit")} onClick={() => edit(cur)} /> : null}
        {cur?.personal ? <Tool icon={<IconTrash />} label={t("delete")} onClick={() => void remove(cur)} /> : null}
      </Toolbar>
      <div className="dxp">
        <section className="dxp-list" aria-label={t("title")}>
          {os === "win" ? (
            <div className="dxp-q">
              <Search value={q} onChange={setQ} placeholder={t("search")} wide />
            </div>
          ) : null}
          <div className="dxp-scroll" role="listbox" aria-label={t("title")}>
            {list === null ? (
              <Loading label={t("loading")} />
            ) : failed ? (
              <Empty icon={<IconAlert />} title={t("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("retry")}</Btn>} />
            ) : !list.length ? (
              <Empty icon={<IconFileText />} title={t("empty")} action={<Btn icon={<IconPlus />} onClick={startNew}>{t("new")}</Btn>} />
            ) : (
              list.map((s) => (
                <div key={s.id} role="option" tabIndex={0} aria-selected={sel === s.id} className={`dxp-row${sel === s.id ? " is-on" : ""}`} onClick={() => (setSel(s.id), setDraft(null))} onDoubleClick={() => void copy(s)} onContextMenu={(e) => rowMenu(e, s)} onKeyDown={(e) => e.key === "Enter" && void copy(s)}>
                  <b>
                    {s.favorite ? <IconStar className="dxp-star" aria-hidden /> : null}
                    {s.title}
                  </b>
                  <small>
                    <em>{catName(s.category)}</em>
                    {s.content}
                  </small>
                </div>
              ))
            )}
          </div>
        </section>
        <article className="dxp-page">
          {draft ? (
            <form
              className="dxp-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <input className="dxp-form__title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("titlePh")} aria-label={t("titleLabel")} maxLength={120} autoFocus />
              <div className="dxp-form__row">
                <Field label={t("category")}>
                  <Input value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} placeholder={t("categoryPh")} ariaLabel={t("category")} maxLength={40} />
                </Field>
                <Check checked={draft.favorite} onChange={(v) => setDraft({ ...draft, favorite: v })} label={t("favourite")}>
                  {t("favourite")}
                </Check>
              </div>
              {cats.length ? (
                <div className="dxp-cats">
                  {cats.map((c) => (
                    <button key={c} type="button" className={draft.category === c ? "is-on" : ""} onClick={() => setDraft({ ...draft, category: c })}>
                      {catName(c)}
                    </button>
                  ))}
                </div>
              ) : null}
              <TextArea value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} placeholder={t("contentPh")} ariaLabel={t("content")} rows={12} maxLength={8000} />
              <p className="dxp-hint">{t("hint")}</p>
              {err ? (
                <p className="dxp-err" role="alert">
                  {err}
                </p>
              ) : null}
              <div className="dxp-form__acts">
                <Btn onClick={() => (setDraft(null), setErr(""))}>{t("cancel")}</Btn>
                <Btn kind="primary" type="submit" icon={<IconCheck />} disabled={!draft.title.trim() || !draft.content.trim()}>
                  {t("save")}
                </Btn>
              </div>
            </form>
          ) : cur ? (
            <>
              <header className="dxp-page__head">
                <h1>{cur.title}</h1>
                <p>
                  <Tag tone={cur.personal ? "accent" : "info"}>{cur.personal ? t("personal") : t("lexgo")}</Tag>
                  <span>{catName(cur.category)}</span>
                  {cur.uses ? <span>{t("uses", { n: cur.uses })}</span> : null}
                </p>
              </header>
              <pre className="dxp-text">{cur.content}</pre>
              <footer className="dxp-page__foot">
                <Btn kind="primary" icon={<IconCopy />} onClick={() => void copy(cur)}>
                  {t("copy")}
                </Btn>
              </footer>
            </>
          ) : (
            <Empty icon={<IconFileText />} title={t("pick")} />
          )}
        </article>
      </div>
      {confirmNode}
      {toast}
    </App>
  );
}
