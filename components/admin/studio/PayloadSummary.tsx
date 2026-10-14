"use client";

import { useStudioHuman } from "./human";

type Value = Record<string, unknown>;

export function PayloadSummary({ payload, compact = false }: { payload: Value; compact?: boolean }) {
  const { t, fieldLabel, value: show } = useStudioHuman();
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined && value !== null);

  if (!entries.length) return <p className="stu-hint">{t("generic.noData")}</p>;

  return (
    <dl className={`stu-payload-summary${compact ? " stu-payload-summary--compact" : ""}`}>
      {entries.map(([key, value]) => {
        const label = fieldLabel(key);
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
                        {typeof item === "object" && item !== null ? <PayloadSummary payload={item as Value} compact /> : show(item)}
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
                show(value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
