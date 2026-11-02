const INVALID = '[aria-invalid="true"], .opx-choice.has-error input:not([disabled]), .opx-sp.has-error input';

export function focusFirstError(root: HTMLElement | null): void {
  window.setTimeout(() => {
    const el = root?.querySelector<HTMLElement>(INVALID);
    if (!el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, 0);
}
