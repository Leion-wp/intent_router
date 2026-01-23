## 2026-01-22 - ActionNode Form Accessibility
**Learning:** The `ActionNode` component generates multiple inputs dynamically from a configuration object but failed to assign unique IDs or associate labels, making screen readers announce them as generic text inputs.
**Action:** When mapping over configuration arrays to generate inputs, always combine the parent component's unique ID (e.g., node ID) with the property name to generate stable, unique IDs for `htmlFor` association.

## 2024-05-22 - Sidebar Draggable Items Accessibility
**Learning:** Draggable `div` elements are invisible to keyboard users and lack native interactive states when styled inline.
**Action:** Always use CSS classes instead of inline styles for interactive elements to enable `:hover`/`:focus` states, and ensure `tabIndex="0"` + `aria-label` are present for keyboard discovery.
## 2026-02-04 - Draggable Item Accessibility
**Learning:** Draggable elements (`draggable="true"`) are not natively focusable or interactive for keyboard users, leaving them inaccessible unless `tabIndex="0"` is explicitly added.
**Action:** Always add `tabIndex="0"` and an informative `aria-label` to draggable items to ensure keyboard users can at least perceive them, even if drag-and-drop itself requires mouse.
