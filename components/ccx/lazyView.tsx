"use client";

import { useEffect, useState, type ComponentType } from "react";
import ViewLoading from "./ViewLoading";

type Mod<P> = { default: ComponentType<P> };

export function lazyView<P extends object = object>(load: () => Promise<Mod<P>>, Fallback: ComponentType = ViewLoading) {
  let ready: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;

  const preload = () => {
    pending ??= load().then(
      (m) => {
        ready = m.default;
        return m.default;
      },
      (err: unknown) => {
        pending = null;
        throw err;
      },
    );
    return pending;
  };

  function LazyView(props: P) {
    const [state, setState] = useState<{ comp: ComponentType<P> | null; err: unknown }>(() => ({ comp: ready, err: null }));
    const Comp = state.comp;
    useEffect(() => {
      if (Comp) return;
      let live = true;
      preload().then(
        (c) => {
          if (live) setState({ comp: c, err: null });
        },
        (err: unknown) => {
          if (live) setState({ comp: null, err });
        },
      );
      return () => {
        live = false;
      };
    }, [Comp]);
    if (state.err) throw state.err;
    return Comp ? <Comp {...props} /> : <Fallback />;
  }

  return { View: LazyView, preload };
}
