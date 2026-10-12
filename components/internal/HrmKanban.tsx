"use client";

import { useState, type ReactNode } from "react";

export type KanbanColumn = { key: string; label: string; tone?: "info" | "ok" | "warn" | "err" | "gray" };

// A board of columns. A card is dragged to another column to move it (the
// parent decides what a move means and may refuse it); the same move is also
// offered from the card's own drawer, so the board never depends on a mouse.
export default function HrmKanban<T>({
  columns,
  items,
  columnOf,
  idOf,
  renderCard,
  onMove,
  onOpen,
  emptyText,
}: {
  columns: KanbanColumn[];
  items: T[];
  columnOf: (item: T) => string;
  idOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onMove?: (item: T, to: string) => void;
  onOpen?: (item: T) => void;
  emptyText: string;
}) {
  const [drag, setDrag] = useState("");
  const [over, setOver] = useState("");
  return (
    <div className="hrm-kb" role="list">
      {columns.map((col) => {
        const cards = items.filter((x) => columnOf(x) === col.key);
        return (
          <section
            key={col.key}
            className={`hrm-kb__col hrm-kb__col--${col.tone ?? "gray"}${over === col.key ? " is-over" : ""}`}
            role="listitem"
            aria-label={col.label}
            onDragOver={(e) => {
              if (!onMove || !drag) return;
              e.preventDefault();
              if (over !== col.key) setOver(col.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver("");
            }}
            onDrop={(e) => {
              e.preventDefault();
              const item = items.find((x) => idOf(x) === drag);
              setOver("");
              setDrag("");
              if (item && onMove && columnOf(item) !== col.key) onMove(item, col.key);
            }}
          >
            <header className="hrm-kb__h">
              <i aria-hidden />
              <b>{col.label}</b>
              <span>{cards.length}</span>
            </header>
            <div className="hrm-kb__list">
              {cards.length ? (
                cards.map((item) => (
                  <article
                    key={idOf(item)}
                    className={`hrm-kb__card${drag === idOf(item) ? " is-drag" : ""}`}
                    draggable={!!onMove}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", idOf(item));
                      setDrag(idOf(item));
                    }}
                    onDragEnd={() => {
                      setDrag("");
                      setOver("");
                    }}
                    tabIndex={onOpen ? 0 : undefined}
                    onClick={() => onOpen?.(item)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen?.(item)}
                  >
                    {renderCard(item)}
                  </article>
                ))
              ) : (
                <p className="hrm-kb__none">{emptyText}</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
