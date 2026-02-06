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
**Learning:** The History list implementation uses a `div` with `onClick` as a row container which also contains a nested "Restore" `<button>`. Converting this to a semantic `<button>` is invalid HTML (nested buttons).
**Action:** Use `role="listitem"` with `tabIndex="0"` and `onKeyDown` for the container. Crucially, in the `onKeyDown` handler, check `e.target === e.currentTarget` to prevent the container's action from firing when the user interacts with the nested secondary button.

## 2026-02-05 - List Semantics
**Learning:** Visual lists created with flexbox `div`s often lack the semantic `role="list"` and `role="listitem"` structure, making them appear as unstructured text to screen readers.
**Action:** Always wrap lists of items in a container with `role="list"` (if not using `<ul>`/`<ol>`) to communicate the number of items and list structure to assistive technology.
