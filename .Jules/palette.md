## 2026-01-22 - ActionNode Form Accessibility
**Learning:** The `ActionNode` component generates multiple inputs dynamically from a configuration object but failed to assign unique IDs or associate labels, making screen readers announce them as generic text inputs.
**Action:** When mapping over configuration arrays to generate inputs, always combine the parent component's unique ID (e.g., node ID) with the property name to generate stable, unique IDs for `htmlFor` association.

## 2024-05-22 - Sidebar Draggable Items Accessibility
**Learning:** Draggable `div` elements are invisible to keyboard users and lack native interactive states when styled inline.
**Action:** Always use CSS classes instead of inline styles for interactive elements to enable `:hover`/`:focus` states, and ensure `tabIndex="0"` + `aria-label` are present for keyboard discovery.
## 2026-02-04 - Draggable Item Accessibility
**Learning:** Draggable elements (`draggable="true"`) are not natively focusable or interactive for keyboard users, leaving them inaccessible unless `tabIndex="0"` is explicitly added.
**Action:** Always add `tabIndex="0"` and an informative `aria-label` to draggable items to ensure keyboard users can at least perceive them, even if drag-and-drop itself requires mouse.

## 2026-01-25 - Accessible Tab Navigation
**Learning:** Replaced non-interactive `div` tabs with `button` elements using `role="tab"` and `aria-selected` to ensure keyboard accessibility and screen reader support. Inline styles were replaced with a reusable `.sidebar-tab` class for better state management (`:hover`, `:focus-visible`).
**Action:** When implementing tab interfaces, always use `role="tablist"` container with `role="tab"` buttons and proper `aria-controls`/`aria-labelledby` associations, and avoid inline styles for interactive states.

## 2026-02-05 - Nested Interactive Elements in Lists
**Learning:** The History list implementation uses a `div` with `onClick` as a row container which also contains a nested "Restore" `<button>`. This creates a trap for converting the container to a semantic `<button>` or `<a>` tag, as nested interactive elements are invalid HTML.
**Action:** For list items with primary and secondary actions, avoid making the entire row a button. Instead, separate the layout into distinct interactive zones (e.g., "Select" button + "Restore" button) to maintain semantic validity and keyboard navigability.
