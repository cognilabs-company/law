"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { saveAsk } from "@/lib/askHandoff";

type Example = { label: string; q: string };

type Props = {
  action: string;
  label: string;
  placeholder: string;
  send: string;
  examplesLabel: string;
  examples: Example[];
  lawyers: string;
  icon: ReactNode;
  arrow: ReactNode;
};

export default function LandingHeroAsk({ action, label, placeholder, send, examplesLabel, examples, lawyers, icon, arrow }: Props) {
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const pin = field.current?.closest(".lh-hero__pin");
    if (!pin) return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) root.dataset.lhHero = "";
        else delete root.dataset.lhHero;
      },
      { threshold: [0, 0.35, 0.7] },
    );
    io.observe(pin);
    return () => {
      io.disconnect();
      delete root.dataset.lhHero;
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = value.trim();
    if (!question) {
      field.current?.focus();
      return;
    }
    if (saveAsk(question)) router.push("/chat");
    else router.push({ pathname: "/chat", query: { q: question } });
  };

  const pick = (question: string) => {
    setValue(question);
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) field.current?.focus();
  };

  return (
    <div className="lh-hero__act">
      <form className="lh-hero__ask" action={action} method="get" onSubmit={submit}>
        <span className="lh-hero__ask-ic" aria-hidden="true">
          {icon}
        </span>
        <label className="sr-only" htmlFor="lh-ask">
          {label}
        </label>
        <input
          ref={field}
          id="lh-ask"
          className="lh-hero__ask-in"
          name="q"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={2000}
          aria-describedby="lh-ask-note"
        />
        <button type="submit" className="lh-btn lh-btn--blue lh-hero__ask-go">
          <span className="lh-hero__ask-go-t">{send}</span>
          {arrow}
        </button>
      </form>
      <ul className="lh-hero__ex" aria-label={examplesLabel}>
        {examples.map((example) => (
          <li key={example.label}>
            <button type="button" className="lh-hero__chip" onClick={() => pick(example.q)}>
              {example.label}
            </button>
          </li>
        ))}
        <li className="lh-hero__ex-alt">
          <Link href="/lawyers" className="lh-hero__alt">
            {lawyers}
            {arrow}
          </Link>
        </li>
      </ul>
    </div>
  );
}
