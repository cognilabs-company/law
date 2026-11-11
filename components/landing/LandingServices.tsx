import type { CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import LandingGallery from "./LandingGallery";
import "./css/services.css";

type Card = { title: string; text: string; price: string; unit: string };

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </svg>
);

export default function LandingServices() {
  const t = useTranslations("landing.services");
  const page = useTranslations("servicesPage");
  const mani = useTranslations("landing.manifesto");

  const consultation = page.raw("consultation.cards") as Card[];
  const docPrep = page.raw("docPrep.cards") as Card[];
  const docReview = page.raw("docReview.cards") as Card[];

  const items = [
    { img: IMG.svcExpress, ...consultation[0] },
    { img: IMG.svcVideo, ...consultation[1] },
    { img: IMG.svcContract, ...docPrep[0] },
    { img: IMG.svcReview, ...docReview[2], title: t("reviewTitle"), text: t("reviewText") },
  ];

  const kicker = t("kicker");
  const words = t("title").trim().split(" ");
  const lastWord = words.pop();

  return (
    <section className="lh-svc" id="xizmatlar">
      <div className="lh-svc__panel" style={{ "--chars": kicker.length } as CSSProperties}>
        <LandingGallery
          labelledBy="lh-svc-title"
          count={items.length}
          dragLabel={t("drag")}
          prevLabel={mani("prev")}
          nextLabel={mani("next")}
          behind={
            <div className="lh-svc__ghost" aria-hidden="true">
              {kicker}
            </div>
          }
          side={
            <div className="lh-svc__side">
              <div className="lh-svc__top">
                <div className="lh-photo lh-svc__thumb" data-lh-reveal data-lh-parallax="10">
                  <Image src={IMG.problemStorm.src} width={IMG.problemStorm.width} height={IMG.problemStorm.height} alt="" sizes="(max-width: 900px) 34vw, 14vw" />
                </div>
                <span className="lh-kicker">{kicker}</span>
              </div>
              <div className="lh-svc__copy">
                <h2 className="lh-svc__title" id="lh-svc-title" data-lh-lines>
                  {words.join(" ")} <em className="lh-accent">{lastWord}</em>
                </h2>
                <p className="lh-lead lh-svc__lead" data-lh-rise>
                  {t("lead")}
                </p>
                <div className="lh-svc__all" data-lh-rise>
                  <Link href="/services" className="lh-btn lh-btn--blue">
                    {t("all")}
                    <Arrow />
                  </Link>
                </div>
              </div>
            </div>
          }
        >
          <ul className="lh-svc__row">
            {items.map((item, i) => (
              <li key={item.img.src}>
                <Link href="/services" className="lh-svc__card" draggable={false}>
                  <div className="lh-svc__frame">
                    <div className="lh-svc__drift">
                      <Image
                        src={item.img.src}
                        fill
                        alt=""
                        quality={90}
                        draggable={false}
                        sizes="(max-width: 640px) 94vw, (max-width: 900px) 56vw, 38vw"
                      />
                    </div>
                    <div className="lh-glass lh-svc__cap">
                      <h3 className="lh-svc__name">{item.title}</h3>
                      <p className="lh-svc__text">{item.text}</p>
                      <p className="lh-svc__price">
                        {t.rich("price", {
                          price: item.price,
                          b: (chunks) => <b>{chunks}</b>,
                          u: (chunks) => <span>{chunks}</span>,
                        })}
                      </p>
                    </div>
                  </div>
                  {/* These two sit in the card's stepped notch, outside its clip. */}
                  <span className="lh-svc__no" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="lh-svc__go" aria-hidden="true">
                    <Arrow />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </LandingGallery>
      </div>
    </section>
  );
}
