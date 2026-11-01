import { useTranslations } from "next-intl";
import ScrollCue from "@/components/ui/ScrollCue";

export default function SubscriptionExtras() {
  const t = useTranslations("subscription");
  const c = t.raw("compare") as {
    title: string;
    headers: { feature: string; standard: string; premium: string };
    rows: { feature: string; standard: string; premium: string }[];
  };

  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <h2 className="h2">{c.title}</h2>
        </div>
        <ScrollCue className="ctable__wrap">
          <table className="ctable">
            <thead>
              <tr>
                <th>{c.headers.feature}</th>
                <th>{c.headers.standard}</th>
                <th>{c.headers.premium}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.feature}</td>
                  <td>{r.standard}</td>
                  <td>{r.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollCue>
        {/* No subscriber quotes: the ones here were written for the page, not
            given by real subscribers, so they are not shown. */}
      </div>
    </section>
  );
}
