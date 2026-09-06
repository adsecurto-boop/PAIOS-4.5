## 2025-03-09 - Modal Dialog Accessibility and Keyboard Navigation
**Learning:** Application overlay modals (`QuickCaptureModal`, `TaskModal`) lacked modal ARIA semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`) and keyboard `Escape` key listeners for dismissal, unlike `AuthModal`.
**Action:** When adding or updating overlay modal components, ensure `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, explicit `aria-label`s on icon buttons, and a `window` `keydown` listener for `Escape` key dismissal are included.
