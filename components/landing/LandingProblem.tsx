import { Fragment } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { IMG } from "./images";
import "./css/problem.css";

type Item = { title: string; text: string };

// Object-position doubles as the zoom origin: the point named here sits at the
// same spot of the frame at every aspect ratio, so the subject always survives.
const SCENES = [
  { key: "maze", img: IMG.problemMaze, focus: "63% 65%" },
  { key: "doors", img: IMG.problemDoors, focus: "50% 50%" },
  { key: "torn", img: IMG.problemTorn, focus: "50% 50%" },
  { key: "storm", img: IMG.problemStorm, focus: "50% 50%" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Words in their own masks, written by the server: nothing is split at runtime. */
function Words({ words }: { words: string[] }) {
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className="lh-prob__w">
            <span className="lh-prob__wi">{word}</span>
          </span>{" "}
        </Fragment>
      ))}
    </>
  );
}

export default function LandingProblem() {
  const t = useTranslations("home.problem");
  const items = t.raw("items") as Item[];
  const titleWords = t("title").split(/\s+/);
  const lastWord = titleWords.length - 1;

  return (
    <section className="lh-prob lh-dark" id="muammo">
      <div className="lh-prob__intro">
        <p className="lh-kicker">{t("kicker")}</p>
        <h2 className="lh-prob__title">
          {titleWords.map((word, i) => (
            <Fragment key={i}>
              {i === lastWord ? (
                <em className="lh-accent lh-prob__tw">{word}</em>
              ) : (
                <span className="lh-prob__tw">{word}</span>
              )}{" "}
            </Fragment>
          ))}
        </h2>
      </div>

      <div className="lh-prob__stage">
        {SCENES.map((scene, i) => {
          const item = items[i];
          const words = item.title.split(/\s+/);
          const half = Math.floor(words.length / 2);
          return (
            <article key={scene.key} className={`lh-prob__scene lh-prob__scene--${scene.key}`}>
              <div className="lh-prob__media">
                <Image
                  src={scene.img.src}
                  alt=""
                  fill
                  quality={90}
                  sizes="100vw"
                  style={{ objectPosition: scene.focus, transformOrigin: scene.focus }}
                />
              </div>
              <div className="lh-prob__scrim" />
              <div className="lh-prob__veil" />
              <div className="lh-prob__copy">
                <p className="lh-prob__count">
                  <b>{pad(i + 1)}</b>
                  <span>/{pad(SCENES.length)}</span>
                </p>
                {/* The storm's title breaks in two around the figure: its own metaphor. */}
                {scene.key === "storm" ? (
                  <h3 className="lh-prob__h3 lh-prob__h3--split">
                    <span className="lh-prob__half">
                      <Words words={words.slice(0, half)} />
                    </span>{" "}
                    <span className="lh-prob__half">
                      <Words words={words.slice(half)} />
                    </span>
                  </h3>
                ) : (
                  <h3 className="lh-prob__h3">
                    <Words words={words} />
                  </h3>
                )}
                <p className="lh-prob__text">{item.text}</p>
              </div>
            </article>
          );
        })}

        {/* Decoration for the scrubbed version only; hidden in the resting stack. */}
        <div className="lh-prob__slit" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="lh-prob__rail" aria-hidden="true">
          <i className="lh-prob__fill" />
          {SCENES.map((scene) => (
            <b key={scene.key} />
          ))}
        </div>
      </div>
    </section>
  );
}
