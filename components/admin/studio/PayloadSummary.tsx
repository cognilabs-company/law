"use client";

import { humanize } from "@/lib/labels";
import { useStudioText } from "./bits";

type Value = Record<string, unknown>;

function textOf(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

export function PayloadSummary({ payload, compact = false }: { payload: Value; compact?: boolean }) {
  const { t } = useStudioText();
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined && value !== null);

  if (!entries.length) return <p className="stu-hint">{t("generic.noData")}</p>;

  return (
    <dl className={`stu-payload-summary${compact ? " stu-payload-summary--compact" : ""}`}>
      {entries.map(([key, value]) => {
        const label = t.has(`field.${key}`) ? t(`field.${key}`) : humanize(key);
        const list = Array.isArray(value) ? value : null;
        const object = value && typeof value === "object" && !Array.isArray(value) ? (value as Value) : null;
        return (
          <div className="stu-payload-summary__row" key={key}>
            <dt>{label}</dt>
            <dd>
              {list ? (
                list.length ? (
                  <ul className="stu-payload-summary__list">
                    {list.slice(0, 8).map((item, index) => (
                      <li key={`${key}-${index}`}>
                        {typeof item === "object" && item !== null ? <PayloadSummary payload={item as Value} compact /> : textOf(item)}
                      </li>
                    ))}
                    {list.length > 8 ? <li className="stu-payload-summary__muted">{t("generic.moreItems", { n: list.length - 8 })}</li> : null}
                  </ul>
                ) : (
                  <span className="stu-payload-summary__muted">{t("generic.noItems")}</span>
                )
              ) : object ? (
                <PayloadSummary payload={object} compact />
              ) : (
                textOf(value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
