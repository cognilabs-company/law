import { useTranslations } from "next-intl";
import ScrollCue from "@/components/ui/ScrollCue";

export default function ServicesCompare() {
  const t = useTranslations("servicesPage");
  const c = t.raw("compare") as {
    title: string;
    lead: string;
    headers: { feature: string; ai: string; lawyer: string };
    rows: { feature: string; ai: string; lawyer: string }[];
  };

  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <h2 className="h2">{c.title}</h2>
          <p className="lead">{c.lead}</p>
        </div>
        <ScrollCue className="ctable__wrap">
          <table className="ctable">
            <thead>
              <tr>
                <th>{c.headers.feature}</th>
                <th>{c.headers.ai}</th>
                <th>{c.headers.lawyer}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.feature}</td>
                  <td>{r.ai}</td>
                  <td>{r.lawyer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollCue>
      </div>
    </section>
  );
}
