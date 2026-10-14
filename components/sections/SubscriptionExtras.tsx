import { useTranslations } from "next-intl";
import ScrollCue from "@/components/ui/ScrollCue";
import { initials } from "@/lib/lawyers";

export default function SubscriptionExtras() {
  const t = useTranslations("subscription");
  const c = t.raw("compare") as {
    title: string;
    headers: { feature: string; standard: string; premium: string };
    rows: { feature: string; standard: string; premium: string }[];
  };
  const testimonials = t.raw("testimonials") as {
    text: string;
    name: string;
    role: string;
  }[];

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

        <div className="head" style={{ marginTop: 44 }}>
          <h2 className="h2">{t("testimonialsTitle")}</h2>
        </div>
        <div className="quotes">
          {testimonials.map((q, i) => (
            <div className="qcard" key={i}>
              <p>“{q.text}”</p>
              <div className="qcard__a">
                <span className="qcard__av">{initials(q.name)}</span>
                <div>
                  <b>{q.name}</b>
                  <span>{q.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
