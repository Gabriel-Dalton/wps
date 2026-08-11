# Screen Reader Accessibility Audit

Audit of every WPS web tool against the `screen-reader-testing` skill checklist
(VoiceOver / NVDA / JAWS navigation patterns), run against the local dev server.

## How it was run

```bash
cd .a11y-audit
npm install
npx playwright install chromium
BASE_URL=http://localhost:8759 node sr-audit.mjs
```

`sr-audit.mjs` visits all nine routes and, on each one, combines:

- **axe-core** (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`).
- **Accessibility-tree probes** that mirror the manual checklist: heading outline
  and level order, landmark coverage, skip link, unnamed interactive controls,
  live regions, table header association, dialog naming, positive `tabindex`,
  `aria-hidden` wrapping focusable elements.
- **A real keyboard walk** of the first 25 Tab stops, recording each stop's role,
  accessible name, and focus indicator.

Authenticated routes are reached via the existing `window.Playwright` test-auth
bypass in `AuthWrapper`, so the real tool UIs are audited rather than the
Keycloak login page.

## Results

| Route | Critical/serious before | after |
| --- | --- | --- |
| `/` | 0 | 0 |
| `/percentile-calculator` | 2 | 0 |
| `/hfi-calculator` | 0 | 0 |
| `/fire-behaviour-calculator` | 1 | 0 |
| `/auto-spatial-advisory` | 4 | 0 |
| `/morecast` | 2 | 0\* |
| `/insights` | 2 | 0 |
| `/fire-watch` | 2 | 0\* |
| `/weather-toolkit` | 2 | 0 |

Every route now has exactly one `h1`, a `main` landmark, and a sequential
heading outline.

\* MoreCast and Fire Watch still report two `color-contrast` hits each. Both come
from the MUI DataGrid **"MUI X Missing license key"** watermark that the dev
build overlays on the grid. That is not application markup and disappears in a
licensed build.

## Violations found and fixed

### 1. Unnamed icon buttons (critical, `button-name`) — 6 instances

`ASADatePicker`'s previous-day, next-day, and calendar buttons had no accessible
name. NVDA and VoiceOver announced them as bare "button", so a screen reader
user could reach the primary date control of three tools and not know what any
of the three buttons did. This one component is embedded in Auto Spatial
Advisory, SFMS Insights, and Weather Toolkit, so it accounted for six of the
eight critical failures on its own.

Fixed by giving each button an `aria-label` and marking the decorative SVGs
`aria-hidden`.

### 2. Unlabeled checkboxes (critical, `label`) — 3 instances

- The Auto Spatial Advisory map legend layer toggles ("Zone Unit Status",
  "HFI Potential") announced as just "checkbox". The visible text sat in a
  sibling `Typography`, never associated with the input.
- The FireCalc table's row-select and select-all checkboxes had the same problem.

Fixed with `slotProps={{ input: { 'aria-label': ... } }}`. Note that MUI v9
ignores the older `inputProps`, which is why a first attempt silently produced
no DOM change.

### 3. No level-1 heading on any tool (`page-has-heading-one`) — 8 routes

Only the landing page had an `h1`. On every other tool, opening the NVDA
elements list (`Insert+F7`) or the VoiceOver rotor produced an empty or
near-empty heading list, so there was no way to orient on the page.

Fixed by rendering the `GeneralHeader` title as an `h1` (with the UA heading
styles reset, so the appearance is unchanged), plus the equivalent in Fire
Watch's own `MenuHeader`.

### 4. No `main` landmark (`landmark-one-main`) — 6 routes

Landmark navigation (`D` in NVDA, the rotor's Landmarks category) could not
reach the primary content of ASA, FireCalc, MoreCast, SFMS Insights, Weather
Toolkit, or Fire Watch. Fixed by marking the primary content container as
`main`.

### 5. Skipped heading levels (`heading-order`) — 4 routes

MUI's `Typography variant` sets font size only, but was being used as if it set
semantics, emitting `h4`/`h5`/`h6` directly beneath the page `h1`. Heading
navigation therefore jumped levels. Fixed by setting `component` explicitly.

Two related cases:

- `InfoAccordion` rendered its title in a `Typography variant="h6"` *inside*
  the heading MUI's `Accordion` already generates, so the title was announced
  twice and produced an `h3 -> h6` jump. The inner element is now a `span` and
  the accordion's own heading level is set via `slotProps.heading`.
- Weather Toolkit's "Image not available" was an `h6`, putting a failure message
  into the heading outline. It is now a `p` with `role="status"`, so it is
  announced when a chart fails instead of polluting navigation.

### 6. Error text contrast and announcement (serious, `color-contrast`)

The theme error red `#FF3E34` measured 3.5:1 on white, below the 4.5:1 AA floor,
affecting both `ErrorMessage` and MUI's error-state form labels. Raised to the
BC Gov error red `#A2231D`.

`ErrorMessage` also had no live region, so a failure rendered silently. It now
carries `role="alert"`.

## Observations not fixed

These are recorded rather than changed, because they need product decisions:

- **No skip link on any page.** Each tool puts a nav landmark ahead of content,
  so keyboard and screen reader users tab through the header on every page. A
  "Skip to main content" link is the conventional fix and is now unblocked,
  since every page has a `main` to target.
- **Missing focus indicators.** The keyboard walk found many tab stops with
  `outline: none` and no visible replacement (23 of 25 stops on FireCalc). This
  is WCAG 2.4.7 and affects sighted keyboard users most.
- **`region` violations** (10 on ASA, 8 on SFMS Insights). Content sits outside
  any landmark. Largely resolved for the primary content by the `main` fix; the
  remainder are map and panel controls that would benefit from labelled
  `region`s.
- **HFI Calculator table has no `th`.** Data cells are announced without their
  column header, so a screen reader user in table navigation mode hears numbers
  with no indication of which metric they belong to.
- **No live regions for data loading.** None of the tools announce when a fetch
  starts or finishes, so a screen reader user gets no feedback that a date
  change did anything.
