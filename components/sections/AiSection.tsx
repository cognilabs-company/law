import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ChatWidget from "../chat/ChatWidget";
import { IconInfo } from "../icons";

export default function AiSection() {
  const t = useTranslations("aiPage");
  const cta = useTranslations("cta");
  const features = t.raw("features") as string[];

  return (
    <section className="sec dark" id="ai">
      <div className="wrap">
        <div className="split">
          {/* rvx opts this column into the shared reveal. Without it the phone
              mock on the right faded in while the whole left column was already
              sitting there — one half of a two-column section animating and the
              other not is the most visible break in the page's sequence. */}
          <div className="rvx">
            <span className="kick">{t("kicker")}</span>
            <h2 className="h2" style={{ color: "#fff" }}>
              {t("title")}
            </h2>
            <p className="lead">{t("lead")}</p>
            <ul className="checks">
              {features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <div className="info" style={{ marginTop: 26 }}>
              <IconInfo />
              <span>{t("info")}</span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 26,
              }}
            >
              <Link href="/chat" className="btn btn--grad">
                {cta("tryFree")}
              </Link>
              <Link href="/subscription" className="btn btn--glass">
                {cta("subscriptionPrices")}
              </Link>
            </div>
          </div>

          <div className="phone">
            <div className="phone__s">
              <span className="phone__n" />
              <div className="phone__status">
                <span>9:41</span>
                <span className="phone__status-i">
                  <svg viewBox="0 0 18 12" width="17" height="11">
                    <rect x="0" y="8" width="3" height="4" rx="1" />
                    <rect x="5" y="5" width="3" height="7" rx="1" />
                    <rect x="10" y="2" width="3" height="10" rx="1" />
                    <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.45" />
                  </svg>
                  <svg viewBox="0 0 16 12" width="15" height="11">
                    <path d="M8 10.6a1 1 0 100-2 1 1 0 000 2zM8 7c1.3 0 2.5.5 3.4 1.4l1.1-1.1A6.4 6.4 0 008 5.4 6.4 6.4 0 003.5 7.3l1.1 1.1A4.8 4.8 0 018 7zM8 3.4c2.2 0 4.3.9 5.8 2.4l1.1-1.1A9.6 9.6 0 008 1.8 9.6 9.6 0 001.1 4.7l1.1 1.1A8 8 0 018 3.4z" />
                  </svg>
                  <svg viewBox="0 0 26 12" width="24" height="11">
                    <rect x="1" y="1" width="21" height="10" rx="3" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
                    <rect x="2.5" y="2.5" width="15" height="7" rx="1.5" />
                    <rect x="23.5" y="4" width="2" height="4" rx="1" opacity="0.6" />
                  </svg>
                </span>
              </div>
              <ChatWidget variant="phone" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
