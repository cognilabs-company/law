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
    sizes: "(max-aspect-ratio: 1/1) 178vh, 100vw",
    quality: 90,
    placeholder: "blur",
    blurDataURL: IMG.subFamily.blur,
  } as const;

  return (
    <div className="lh-sub">
      {/* The track gives the band its scroll distance; motion/hold.ts sets its height. */}
      <div className="lh-sub__track">
      <div className="lh-sub__pin">
        <div className="lh-sub__frame lh-dark lh-grain">
          <div className="lh-sub__media">
            <Image className="lh-sub__photo" alt="" {...photo} />
            <div
              className="lh-sub__ghost"
              aria-hidden="true"
              style={{ ["--chars" as string]: kicker.length, ["--word" as string]: longest }}
            >
              {kicker}
            </div>
            <Image className="lh-sub__front" alt="" src={IMG.subFamilyFront.src} fill sizes={photo.sizes} quality={85} />
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
