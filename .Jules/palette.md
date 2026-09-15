## 2025-05-18 - Responsive Header Buttons Missing ARIA Labels on Mobile
**Learning:** Responsive buttons that hide their text label on smaller viewports (`hidden sm:inline`) become icon-only controls for mobile screen reader users if `aria-label` is not explicitly set.
**Action:** Always include an explicit `aria-label` on buttons whose text label is conditionally hidden with responsive utility classes.

## 2025-05-19 - Interactive Div Containers Lack Keyboard Accessibility
**Learning:** Interactive floating player elements using `div` with `onClick` are inaccessible to keyboard and screen-reader users unless given `role="button"`, `tabIndex={0}`, keyboard event handlers (`Enter`/`Space`), and an explicit `aria-label`.
**Action:** Always convert interactive `div` elements with `onClick` into accessible controls with `role="button"`, `tabIndex={0}`, `onKeyDown` listeners, and focus-visible indicators.
