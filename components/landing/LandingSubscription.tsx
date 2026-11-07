import Image from "next/image";
import { useTranslations } from "next-intl";
import SubscriptionSection from "@/components/sections/SubscriptionSection";
import { IMG } from "./images";
import "./css/subscription.css";

export default function LandingSubscription() {
  const t = useTranslations("subscription");
  const kicker = t("kicker");
  const title = t("title");

  // The last word takes the serif accent, a nod to the "Go" in the wordmark.
  const words = title.split(" ");
  const lastWord = words.pop();
  const longest = Math.max(...kicker.split(" ").map((w) => w.length));

  const photo = {
    src: IMG.subFamily.src,
    fill: true,
    sizes: "100vw",
    quality: 90,
  } as const;

  return (
    <div className="lh-sub">
      {/* Isolates the photo's silhouettes, so the giant line can pass behind the
          family and the window frame without a separate cut-out image. */}
      <svg className="lh-sub__defs" aria-hidden="true" focusable="false">
        <filter id="lh-sub-silhouette" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0 0 8 0 -3  0 0 8 0 -3  0 0 8 0 -3  0 0 0 1 0" />
        </filter>
      </svg>

      {/* The track gives the band its scroll distance; motion/hold.ts sets its height. */}
      <div className="lh-sub__track">
      <div className="lh-sub__pin">
        <div className="lh-sub__frame lh-dark lh-grain">
          <div className="lh-sub__media">
            <Image className="lh-sub__photo" alt="" {...photo} />
            <div className="lh-sub__behind" aria-hidden="true">
              <div
                className="lh-sub__ghost"
                style={{ ["--chars" as string]: kicker.length, ["--word" as string]: longest }}
              >
                {kicker}
              </div>
              <Image className="lh-sub__matte" alt="" {...photo} />
            </div>
          </div>
          <div className="lh-sub__scrim" aria-hidden="true" />
          <div className="lh-sub__copy">
            <span className="lh-kicker lh-sub__kicker">{kicker}</span>
            <h2 className="lh-sub__title">
              {words.join(" ")} <em className="lh-accent">{lastWord}</em>
            </h2>
            <p className="lh-lead lh-sub__lead">{t("lead")}</p>
          </div>
        </div>
      </div>
      </div>

      <SubscriptionSection />
    </div>
  );
}
