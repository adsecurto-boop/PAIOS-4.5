## 2025-05-18 - Responsive Header Buttons Missing ARIA Labels on Mobile
**Learning:** Responsive buttons that hide their text label on smaller viewports (`hidden sm:inline`) become icon-only controls for mobile screen reader users if `aria-label` is not explicitly set.
**Action:** Always include an explicit `aria-label` on buttons whose text label is conditionally hidden with responsive utility classes.

## 2025-05-19 - Modal Icon Toggles Require Expressive ARIA Labels and Pressed States
**Learning:** Icon-only toggle buttons in modal forms (e.g. Pin Priority) are unannounced or confusing to screen readers without both `aria-label` and `aria-pressed`.
**Action:** Always pair `aria-label` with `aria-pressed={booleanState}` on icon-only toggle controls.
