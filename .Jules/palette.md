## 2025-05-18 - Responsive Header Buttons Missing ARIA Labels on Mobile
**Learning:** Responsive buttons that hide their text label on smaller viewports (`hidden sm:inline`) become icon-only controls for mobile screen reader users if `aria-label` is not explicitly set.
**Action:** Always include an explicit `aria-label` on buttons whose text label is conditionally hidden with responsive utility classes.

## 2025-05-19 - Accessible Toggle and Selection Buttons in Form Modals
**Learning:** Form modal single-select categories and toggle buttons require `aria-pressed` attributes and dynamic `aria-label` updates so screen readers announce active selection states.
**Action:** Always add `aria-pressed` to custom pill buttons and toggle switches, and link form labels to inputs with `htmlFor` and `id`.
