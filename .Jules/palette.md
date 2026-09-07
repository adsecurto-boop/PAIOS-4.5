## 2025-05-18 - Responsive Header Buttons Missing ARIA Labels on Mobile
**Learning:** Responsive buttons that hide their text label on smaller viewports (`hidden sm:inline`) become icon-only controls for mobile screen reader users if `aria-label` is not explicitly set.
**Action:** Always include an explicit `aria-label` on buttons whose text label is conditionally hidden with responsive utility classes.
