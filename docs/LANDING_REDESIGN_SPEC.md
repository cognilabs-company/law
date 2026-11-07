# LexGo landing: build spec

## Rules learned in production (these override anything below)

The first version froze the browser ("page not responding") in production. On this site every forced style recalculation is slow, because `app/globals.css` is 1.75 MB. So:

1. Never use ScrollTrigger's `pin`. Hold sections with `motion/hold.ts` (CSS sticky inside a track).
2. Never tween `clipPath` with GSAP. Use `clipTween` and `insetClip` from `motion/clip.ts`.
3. No SplitText anywhere. `data-lh-lines` now simply rises the whole heading.
4. Never call `ScrollTrigger.refresh()` from a section. `LandingMotion.tsx` owns it.
5. Tween only transforms, opacity and CSS custom properties, in the same unit at both ends. Never tween `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size` or mixed units such as `"5vh"`: GSAP converts units by inserting a probe element and forcing a layout.
6. No layout reads (`getBoundingClientRect`, `offsetHeight`, `getComputedStyle`) inside `onUpdate`, tickers or scroll handlers. Measure once, and again on ScrollTrigger's `refresh` event.
7. No new `backdrop-filter`, and no animated `filter` on large areas.
8. Motion setup is split per section so the page stays responsive. Keep each section's setup small.

The owner loves the animations as they are. Keep them: fix defects, do not redesign or remove effects.

Project root: `C:\Users\karim\OneDrive\Desktop\LexGo\law`. Next.js 16 App Router, next-intl, GSAP 3.15 (ScrollTrigger and SplitText included free). Read `node_modules/next/dist/docs/` before using a Next API you are unsure of (`priority` on next/image is deprecated: use `fetchPriority="high"`).

Goal, in the owner's words: a landing page that astonishes. Premium, creative, editorial, heavily animated. Colours blue, white and black. It must keep its full quality on ANY device: never tune for one screen.

Visual reference (read this image first): `C:\Users\karim\AppData\Local\Temp\claude\d21f454033f4dc45\7086f690-c17b-460f-832d-8f010015883d\scratchpad\reference.png`. What to take from it: a full-bleed motion photograph with huge thin display type running behind the subject, tiny micro labels, glass cards anchored to the photo with a hairline, a second fold on light grey with a rotated notched photo card sitting between giant two-tone words, a circular badge, a notched text card, round prev/next buttons, then a large white rounded panel with a horizontal gallery of notched photo cards carrying glass captions. Copy its level and devices, not its content.

## Foundation that already exists (read before writing)

- `components/landing/landing.css`: tokens and helpers. `--lh-u` fluid unit, `--lh-gutter`, `--lh-max`, `--lh-sec`, colours `--lh-cobalt --lh-azure --lh-navy --lh-black`, theme-aware `--lh-bg --lh-card --lh-text --lh-mute --lh-line --lh-mist --lh-accent`, radii `--lh-r-s/m/l`, `--lh-ease`, fonts `--lh-sans --lh-serif`. Helpers: `.lh-wrap .lh-sec .lh-dark .lh-kicker .lh-h2 .lh-h3 .lh-lead em.lh-accent .lh-btn(.lh-btn--white/--blue/--ghost/--glass) .lh-round(.lh-round--solid) .lh-glass .lh-photo .lh-grain`.
- `components/landing/LandingDefs.tsx`: clip paths `#lh-clip-card` (4:5, stepped notch top right) and `#lh-clip-portrait` (3:4, notches top right and bottom left).
- `components/landing/LandingMotion.tsx` + `motion/common.ts`: one gsap.context. Declarative attributes: `data-lh-rise`, `data-lh-rise-group`, `data-lh-lines` (static h2/h3 only), `data-lh-reveal`, `data-lh-parallax="12"`, `data-lh-cursor="drag|link"` with `data-lh-cursor-label`.
- `motion/types.ts`: `MotionApi { gsap, ScrollTrigger, SplitText, root, finePointer, onCleanup }`. Each section with motion fills in its own `motion/<name>.ts` exporting `<name>Motion(api)`. They run under `prefers-reduced-motion: no-preference` only.
- `components/landing/images.ts`: `IMG.<key>` gives `{src,width,height}` with real pixel sizes.
- `app/[locale]/page.tsx`: already composes every section. Do not edit it.
- Messages namespace `landing` in `messages/{uz,ru,en}.json`. Its source is `C:\Users\karim\AppData\Local\Temp\claude\d21f454033f4dc45\7086f690-c17b-460f-832d-8f010015883d\scratchpad\landing-messages.json`.

## Visual check tool

A dev server runs on http://localhost:3000 with hot reload (the tool finds it by itself; the owner is watching this same page live). Check your work with real pixels, and read the PNG:

```
node "C:/Users/karim/AppData/Local/Temp/claude/d21f454033f4dc45/7086f690-c17b-460f-832d-8f010015883d/scratchpad/scripts/shot.mjs" --sizes 1440x900,390x844 --at ".lh-hero" --out "C:/Users/karim/AppData/Local/Temp/claude/d21f454033f4dc45/7086f690-c17b-460f-832d-8f010015883d/scratchpad/shots/hero"
```
Options are documented at the top of that script (`--progress`, `--offset`, `--dark`, `--reduced`, `--full`, `--mouse`, `--path /ru`). It reports horizontal overflow and page errors. Do not start another server. If the page shows a compile error caused by another section being edited at this moment, wait a minute and retry.

Every section MUST be checked at least at: 360x740, 390x844, 820x1180, 1366x768, 1440x900, 2560x1440, 3840x2160, in `--path /uz` and in `--path /ru` (longest strings), and once with `--dark`. Look at the images critically: clipped text, collisions, empty dead areas, weak hierarchy, things that look like a template. Fix and re-check. Do not stop at "it works"; stop when a demanding art director would accept it.

## Fluid rules (the owner insists on these)

- No layout may assume a device. Prefer `clamp()`, `calc(var(--lh-u) * N)`, container queries (`container-type:inline-size` with `@container`), `svh`, `cqw`, `min()/max()`. Use `@media (max-aspect-ratio: 1/1)` for portrait composition. A width media query is acceptable only for the 760px tab bar clearance.
- Type and spacing must scale all the way to 3840px wide: use `--lh-u` multiples or `clamp()` with a top limit written in `--lh-u`, not in px. Nothing may look tiny on 4K or cramped on 360.
- Short laptops (1366x768, 1280x720) and ultrawide (3440x1440) must compose well: limit by height with `svh` where the layout depends on height.
- Touch devices must get the full design; hover effects only ever add to it.
- At 760px wide and below a fixed tab bar covers the bottom ~90px: keep CTAs clear with `calc(90px + env(safe-area-inset-bottom))`. The top 70px belongs to the nav bar.

## Hard rules (each one was measured; breaking it breaks the app or a test)

1. Prefix every class with `lh-`. Never use on new markup: `.card .head .stat .stats .step .plan .wcard .fstep .phone .dash .rvx .qtile .appcta .advcard .ticker .quotes .portal .plogin .rf .auth .opx .lxai--full .wrap .sec .grid .lead .kick .dark .tight`. RevealOnScroll and tests key on them. Scope all CSS under `.lhome`.
2. Exactly one `.hero`, one `.hero__tags`, one `<footer>`, one `<main>`, one `<h1>` on the page. The first `.flow` in DOM order must stay LawyersSection's and be present at load without the API. Never mount a section on scroll.
3. Inside the hero use `<b>`/`<em>` for headline parts, never `<span>`: `.hero h1 span` paints transparent gradient text and vanishes when transformed. Override `.hero`'s padding and `overflow:hidden` (use `overflow:clip`).
4. Never pin a top-level `<section>` or anything rendered conditionally. Pin an always-present inner wrapper. Use `pinSpacing` defaults. No `snap`.
5. Never put `isolation:isolate` on `.lhome`. Landing z-indexes stay below 80 (tab bar is 80, FilterBar sheet is 90). `.lh-dark` already isolates photo sections.
6. Give every image a fixed box (aspect-ratio or fill in a sized parent). Use `next/image` from `next/image` with a literal `alt=""` for decorative photos (a test requires a literal alt attribute on every tag), `sizes` accurate to the layout, `quality={90}` for hero and large photos, default otherwise. Hero images get `fetchPriority="high"` and no lazy loading. No `?v=` in paths.
7. Text React can change must never be split or animated by replacing its nodes: prices, counts, tabs, filter labels, Finder, Subscription. `data-lh-lines` only on static headings. Never put SplitText on `<p>`, `<div>` or `<span>` hosts with default aria (use `aria:"none"` plus your own a11y if you must).
8. No `useSearchParams`, `useUrlTab`, `cookies()`, `headers()` in the home tree: they would kill static rendering.
9. No GSAP globals (`gsap.defaults`, `gsap.config`, `ticker.lagSmoothing`, `ScrollTrigger.defaults`). Settings live on each tween. Import nothing from gsap at module top level in section components: GSAP comes through `MotionApi`.
10. The first screen animates with CSS keyframes at paint, not GSAP (hydration waits on a large message chunk). GSAP is only for scroll and pointer. The resting CSS is always the finished state: complete and legible with no JS and under reduced motion. Never hide content in CSS waiting for JS.
11. Use `Link` from `@/i18n/navigation`, never `next/link`. No `useRouter` from `next/navigation`.
12. All UI text comes from messages through `useTranslations`. Never hard-code a string, and never add invented numbers. Reuse existing keys where this spec says so. If you truly need a new string, list it in your report with uz, ru and en text; do not edit messages files yourself.
13. Content rules: no counters, testimonials, quotes, logos, "24/7", "certified", uptime, "trained on Uzbek law", "14 regions", "5 minutes", "most popular", or outcomes such as winning. Do not use these keys, which carry banned claims: `home.hero.subtitle`, `home.benefits.*`, `home.finalCta.title`, `home.problem.lead`, `aiPage.title`, `warranty.lead`. Use the `landing.*` versions.
14. Photos of people are unnamed atmosphere: `alt=""`, never a name, title, city, quote, rating, badge or "our lawyers" caption, never beside lawyer cards or numbers. Captions describe services, not persons.
15. Contrast: text on photos needs a scrim giving at least 4.5:1 in both themes; dark or photo sections use `--focus:#6EA8FF` (`.lh-dark` sets it). Light sections must work in dark theme through the tokens. Every interactive element keeps a visible `:focus-visible` ring, needs an accessible name, and a heading order of h1 then h2 then h3.
16. No horizontal page overflow at any size. Decorative overflow must be clipped by its section.
17. Do not edit shared files: `components/sections/*`, `app/globals.css`, `components/Navbar.tsx`, `components/Footer.tsx`, `messages/*`. Another session works in this tree, so touch only your own files listed in your task. Do not run git commands that change anything. Do not run `npm run build` or a second dev server.
18. In reused sections (Finder, LawyersSection, SubscriptionSection, FaqSection, ChatWidget), restyle only through scoped CSS under your `lh-` wrapper; GSAP must never target their elements. Beware inline `style={{background:"var(--b50)"}}` on their `.sec`: override with `!important` inside your scope. No `backdrop-filter` on `.advcard`.

## Art direction

Type: Inter Tight at `--lh-sans`, weight 400 to 500, tight tracking, huge sizes, tight leading. Accent words in `em.lh-accent` (Playfair italic, azure), a nod to the serif "Go" in the wordmark. Micro labels are small, quiet and precise. Light sections sit on `--lh-bg`, panels on `--lh-card` with `--lh-r-l` radii and no heavy shadows. Motion is confident and physical: `expo.out`, long durations, scrubbed depth, nothing bouncy. No emoji, no stock gradients, no generic cards with icon-title-text in a row of three.

## Sections

### 1. LandingHero (`css/hero.css`, `motion/hero.ts`)
`<section class="hero lh-hero" id="top">` holding an always-present `.lh-hero__pin` (100svh, min-height to fit content).
Layers bottom to top: `IMG.heroPlate` cover; `.lh-grain`; a top scrim for the nav (white nav text must stay readable); `b.lh-hero__big` (z1); reflection and `IMG.heroSubject` (z2, the woman cut-out, aspect from IMG); CSS flying paper sheets (z3, a few elements: white, slightly translucent gradient with motion streak, CSS keyframes, some behind and some in front); `em.lh-hero__small`, lead, CTAs, tags, glass cards (z4).
H1: `<h1><b class="lh-hero__big">{big}</b> <em class="lh-hero__small">{small}</em></h1>`. The h1 must not create a stacking context so the woman passes between its two parts.
- Big line: uppercase, weight 400, tracking about -.06em, line-height .86, white at about 92% with a soft vertical gradient on the `b` itself, spanning the whole width edge to edge behind her head, as in the reference. Pass `style={{"--chars": big.length, "--word": longestWordLength}}` and size with CSS (`min(calc(100cqw / (var(--chars) * .62)), 34svh)`), then refine: `motion/hero.ts` must also fit it exactly to the container width with a ResizeObserver and after `document.fonts.ready` by setting `--lh-fit` (must also run with reduced motion off only; CSS alone must already be good). In portrait the big line wraps to one word per line and fits the longest word.
- Small line: bottom left, big serif italic or Inter Tight at `--lh-u` multiples, translucent white gradient like "GAME ON, PLAY HARD" in the reference.
- Woman: right of centre in landscape, feet on the floor around the horizon near 75% of the plate height, head overlapping the big line. Portrait: centred, bleeding slightly off both sides, feet above the small line and CTAs. Add a mirrored, blurred, faded copy under her feet for the glossy floor plus a soft contact shadow, so she stands in the scene.
- `.lh-hero__lead` + two CTAs (`/chat` primary white, `/lawyers` glass) from `landing.hero`.
- `ul.hero__tags` with the three `home.hero.tags` as micro labels spread across the width under the big line (as the reference's three small names), wrapping gracefully on narrow screens.
- Glass card A with a hairline and a pulsing dot anchored on the folder she carries: thumbnail `IMG.trustSteps`, `lawyersCardTitle`, `lawyersCardText`, links to `/lawyers`. Glass card B bottom right: huge `aiCardValue`, `aiCardTitle`, `aiCardText`, thumbnail `IMG.aiThemis`, links to `/chat`. On narrow screens they stack or hide the hairline gracefully; they must not cover her face.
- Paint-time CSS entrance: plate scale 1.12 to 1; big line rises from a clip; woman runs in from the left with a skew and blur settling; small line, cards and tags follow in order. All with `animation-fill-mode: both`, flattened automatically by the site's reduced motion CSS.
- `motion/hero.ts`: pointer parallax with `gsap.quickTo` on fine pointers (plate, big line, woman and cards at different depths). Scroll: pin `.lh-hero__pin` for about 70svh and scrub: woman moves forward and scales up, big line slides left and fades, small line and cards lift away, plate zooms, and the pin wrapper's `clip-path` closes to `inset(3% 3% 5% 3% round 2.5rem)` so the hero becomes a card over the next section. Papers keep drifting.

### 2. LandingFinder (`css/finder.css`)
`<section class="lh-finder" id="finder">` on `--lh-bg`. Kicker and title from `landing.finder`, then the existing `<Finder />` from `@/components/sections/Finder` (client, keep all behaviour). Pull it up over the hero's end so the panel overlaps the transition. Restyle scoped: larger radius, tabs and fields in the new type, dark theme safe. Its select popups portal to body, so no transforms problem.

### 3. LandingManifesto (`css/manifesto.css`, `motion/manifesto.ts`, client for slide state)
The reference's second fold. `<section class="lh-mani" id="nega">`. Top row: circular white badge left (`badgeValue` huge, `badgeText` small); stepped notched text card right (`noteNo` large, `noteTitle`, `noteText`).
Centre: `h2.lh-mani__type` with four words `w1 w2 w3 w4` in two lines, at about 10.5cqw, with the rotated card over the middle so letters pass behind it. Reading order must make sense in the DOM. Colours interleaved: w1 and w4 mist, w2 and w3 text colour; scrub mist words toward the text colour as the section crosses the viewport.
Card: `clip-path:url(#lh-clip-portrait)`, aspect 3/4, width `min(33cqw, 66svh)`, rotated about -9deg, scrubbing to +5deg with a small rise. Three slides crossfade with a slight scale: `IMG.trustSteps`, `IMG.trustWoman`, `IMG.svcContract`, each with a glass caption from `landing.manifesto.slides` (service, never a person). Dots on the card. Round prev and next buttons below it, outlined and solid, with `prev`/`next` aria-labels. No autoplay.
Portrait or narrow container: line one above the card, line two below, card overlapping both a little.

### 4. LandingProblem (`css/problem.css`, `motion/problem.ts`)
`<section class="lh-prob lh-dark" id="muammo">`. Intro block: `home.problem.kicker`, and `home.problem.title` as a giant h2 whose words brighten from dim to white on scrub (split only this static h2).
Then `.lh-prob__stage` (always present inner wrapper, the thing that is pinned) with four scenes from `home.problem.items`: `IMG.problemMaze`, `IMG.problemDoors`, `IMG.problemTorn`, `IMG.problemStorm`. Each scene: full-bleed photo with a focal `object-position` so the key subject survives any aspect ratio (maze: tiny figure about 63% 65%; doors: centre; torn: centre; storm: centre), scrim, `01/04` counter, large h3, small text.
Default CSS is a plain vertical stack of full-height scenes (this is what reduced motion gets). `motion/problem.ts` adds a class that stacks them absolutely, pins the stage and scrubs through about 100svh per scene. Each entry has a transition taken from its metaphor: doors open from the light slit `inset(0 50% 0 50%)` to full; torn enters through a diagonal tear `polygon(...)` widening to full; storm from `circle(0% at 50% 58%)` to full; maze scales from 1.3. Image counter-scales inside, the previous text lifts out, new lines rise. A thin vertical progress rail shows the position.

### 5. LandingBand (`css/band.css`, `motion/band.ts`)
`<section class="lh-band" aria-hidden="true">`, the turn from problem to solution. Cobalt background, one huge line of `landing.band` words repeated, separated by an azure serif-italic mark, drifting horizontally and reacting to scroll velocity (speed and a slight skew, using `ScrollTrigger.getVelocity`). Static under reduced motion. Never class names `.ticker` or `.marquee`.

### 6. LandingAi (`css/ai.css`, `motion/ai.ts`)
`<section class="lh-ai lh-dark" id="ai">`, pure black so `IMG.aiThemis` melts into it (the image has a black background). Giant statue bleeding off the left, drifting on scrub. A canvas of azure particles continues the statue's dissolving particles out to the right: plain 2D canvas, about 90 particles, DPR capped at 1.5, runs only while visible through IntersectionObserver and tab visible, stopped in cleanup, none under reduced motion.
Copy from `landing.ai`, features from `aiPage.features` as a numbered editorial list with hairlines, `aiPage.info`, CTAs `cta.tryFree` to `/chat` and `cta.subscriptionPrices` to `/subscription`.
A real phone with the live `<ChatWidget variant="phone" />` (`@/components/chat/ChatWidget`), built with the existing `.phone`, `.phone__s`, `.phone__n`, `.phone__status` markup copied from `components/sections/AiSection.tsx` (needs the bounded flex column). Wrap it in `.lh-ai__device` and apply pointer tilt and scroll drift only to that wrapper. It keeps its AiLabel. Compose as a poster: statue left, title large across, phone overlapping on the right. Portrait: title, statue, then phone.

### 7. LandingStages (`css/stages.css`, `motion/stages.ts`)
`<section class="lh-stages" id="bosqich">`. Keys: `stages.kicker`, `stages.title`, `stages.lead`, and `enums.stages.<key>.{code,name,desc}` for `preInvestigation, investigation, firstInstance, appeal, cassation`. Show as a staircase that climbs from bottom left to top right, like the marble steps of a courthouse: an `ol` of five steps, each higher than the last, with hairline treads, large stage names and the code as a micro label. On scrub the steps rise into place one after another while a glowing azure dot climbs the treads. Link `cta.viewPackages` to `/services`. Narrow container: a vertical ascent with a rail. Static reduced-motion state is the finished staircase.

### 8. LandingServices (`css/services.css`, `motion/services.ts`)
`<section class="lh-svc" id="xizmatlar">`. The reference's white rounded panel: `--lh-card`, `--lh-r-l`. Left: small rounded thumbnail (`IMG.problemStorm` or `IMG.svcExpress`), large h2 `landing.services.title`, lead, `landing.services.all` link to `/services`. Right, bleeding off the panel's edge: horizontal native-scroll gallery (`overflow-x:auto`, `scroll-snap`, pointer drag on fine pointers, focusable, hidden scrollbar, `data-lh-cursor="drag"` with `landing.services.drag` as label) of notched cards, `clip-path:url(#lh-clip-card)`, aspect 4/5: `IMG.svcExpress` with `servicesPage.consultation.cards[0]`, `IMG.svcVideo` with `.cards[1]`, `IMG.svcContract` with `servicesPage.docPrep.cards[0]`, `IMG.svcReview` with `landing.services.reviewTitle`, `reviewText` and price and unit of `servicesPage.docReview.cards[2]`. Each card is a `Link` to `/services` with a glass caption (title, short text, price with unit). Staggered offsets in the row, images drift inside on horizontal scroll. Entry: the row slides in from the right on scrub. Narrow: panel text first, full-width gallery below.

### 9. LandingBenefits (`css/benefits.css`, `motion/benefits.ts`)
`<section class="lh-ben lh-dark" id="afzallik">` on deep cobalt to navy, with `landing.benefits`. A bento of six glass tiles of different sizes, not a uniform grid, each with its big 3D glass icon spilling out of the tile: `IMG.iconAnswer, iconVerified, iconShield, iconFolders, iconScale, iconGlobe` in that order. Icons float gently and react to scroll; on fine pointers tiles tilt in 3D toward the pointer. CTAs from `home.funnelCta` to `/chat` and `/lawyers`. Stagger in with depth.

### 10. LandingLawyers (`css/lawyers.css`)
Wrapper `<div class="lh-lawyers">` around the existing `<LawyersSection />` (`@/components/sections/LawyersSection`, default props). Keep all behaviour including `.flow`. Scoped restyle so it belongs to the new design: big type for its head, cards with `--lh-r-m`, clean hairlines, new button look, `.flow` as a refined numbered strip. Test the filter sheet at 390x844. No GSAP on its elements.

### 11. LandingWarranty (`css/warranty.css`, `motion/warranty.ts`)
`<section class="lh-war lh-dark" id="kafolat">` deep navy. Centre: `IMG.warrantyShield` large with an azure glow, depth parallax, slow rotation by pointer. Around it the four `warranty.cards` as glass panels (no `.wcard` class), flying into their orbit positions on scrub. `landing.warranty.kicker/title`, lead from `marketplace.orderDetail.warranty.lead`, `landing.warranty.note`, links: `landing.warranty.policy` to `/legal/payment-refund-warranty`, `cta.learnMore` to `/warranty`. Narrow: shield on top, panels stacked.

### 12. LandingSubscription (`css/subscription.css`, `motion/subscription.ts`)
Wrapper `<div class="lh-sub">`. Top: full-width rounded `IMG.subFamily` band that opens from a small rounded window to full width on scrub, with `subscription.kicker`, `subscription.title`, `subscription.lead` over it (scrim). Below it the existing `<SubscriptionSection />` with its own `.head` hidden in scope (display:none) and its plans restyled: refined plan panels, hairlines, big price type, term switch as a pill, in both themes. Never animate its elements with GSAP.

### 13. LandingFaq (`css/faq.css`)
Wrapper `<div class="lh-faq">` around `<FaqSection />`. Scoped: two columns on wide containers with the title large and sticky-free on the left and the accordion on the right, large question type, hairlines, a clean plus marker. One column when narrow.

### 14. LandingFinalCta (`css/finalCta.css`, `motion/finalCta.ts`)
`<section class="lh-final lh-dark">`. Full-bleed `IMG.ctaColumns`, opening on scrub from a rounded inset to full bleed, image drifting. Giant h2 `landing.finalCta.title`, lead, kicker, CTAs from `home.funnelCta` (`/chat` white, `/lawyers` glass), magnetic on fine pointers. `landing.finalCta.photoNote` as quiet fine print at the bottom. Flows directly into the site footer, which you may tune from this CSS file with `body:has(.lhome) .ftr` if needed.

## Report back

State what you built, the viewports you actually checked with what you saw, anything left imperfect, and any new message strings you need. Be honest about what you did not verify.
