# Performance rules

Fixes of 2026-10-25 and the rules that keep them. Measure with
`scripts/perf-audit.mjs` against a production build (`next build && next start`):
it opens pages on a throttled phone and computer (slow 4G, 4× CPU) and reports
cold-visit bytes and paint times, scroll frames and how fast a nav click is
acknowledged. Guards: `tests/unit/perfBudget.test.ts`,
`tests/unit/navProgress.test.ts`, `tests/e2e/navigation-feedback.spec.ts` and
the `no-restricted-imports` rule in `eslint.config.mjs`.

## Every page

- **No message catalogue in the HTML.** The root layout passes
  `messages={null}`; `components/IntlProvider` loads the locale's messages as
  one content-hashed chunk, which the browser caches across visits. Passing
  `getMessages()` to a client provider puts ~1 MB (~300 KB gzip) into every
  page's HTML and again into the layout's RSC prefetch.
- **Nothing heavy on a static path from the root layout, `PortalShell`,
  `AdminShell` or `components/admin/Modal`.** three.js / the robot,
  LiveKit / `CallRoom` and similar load through `next/dynamic` or `import()`
  where they are shown. To ask whether a call room is open, import
  `isCallRoomMounted` from `lib/callEvents`, not from `CallRoom`.
- **Global observers stay cheap.** A `MutationObserver` on `document.body`
  looks only at the added nodes, and reads (`getBoundingClientRect`,
  `getComputedStyle`) are batched after the writes (`components/RevealOnScroll`).

## Navigation

- Import `Link` and `useRouter` from `@/i18n/navigation` (lint-enforced). They
  switch on `html[data-nav-pending]` at the click; `components/NavProgress`
  draws the bar from it.
- Every `layout.tsx` under `app/[locale]` has a `loading.tsx` beside it
  (`components/RouteLoading`). Without it a dynamic route keeps the old page on
  screen until the server answers.

## Animation and media

- A WebGL canvas pauses while the page scrolls (`frameloop="never"`) and mounts
  only where it is shown, after the page is idle. On a 2G/3G or data-saving
  connection the robot is its still picture.
- Large assets in `public/` are sized for how they are shown. The robot uses
  `lexgo-robot.web.glb` (1024² textures, only the clips production plays;
  rebuild with `scripts/optimize-robot-model.mjs`). The budget is 2.5 MB.
