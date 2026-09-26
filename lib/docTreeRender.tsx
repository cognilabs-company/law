import { createElement, type ElementType, type ReactNode } from "react";
import { VOID_TAGS, type DocTree } from "@/lib/docTemplate";

// Renders a parsed DOCX (lib/docxParse's docxToTree) as read-only markup —
// shared by every "show the clean template inline, no download" surface
// (DocTemplateViewer's modal, the full-page no-download document view).
// A clean-source-file has no {{field}}/{field} markers left to bind to (the
// backend already replaces them with literal "________ (label)" text), so
// every node here is plain text/paragraph structure, not an interactive
// token — unlike DocPaper's live fill pane.
export function renderDocTree(tree: DocTree[]): ReactNode {
  let seq = 0;
  const render = (n: DocTree): ReactNode => {
    const key = seq++;
    if (n.k === "text") return <span key={key}>{n.v}</span>;
    if (n.k === "tok") return <span key={key}>{`________ (${n.name})`}</span>;
    // createElement, not JSX, for a dynamic tag — see DocPaper.tsx's own
    // identical comment: @react-three/fiber's global JSX.IntrinsicElements
    // augmentation collapses <Tag> to `never` here too.
    const Tag = n.tag as ElementType;
    // A void tag (a <col> carrying a table column's width, a <br>) must be
    // created with no children argument at all — not even an empty array.
    if (VOID_TAGS.has(n.tag)) return createElement(Tag, { key, style: n.style, ...n.attrs });
    return createElement(Tag, { key, style: n.style, ...n.attrs }, n.children.map(render));
  };
  return tree.map(render);
}
