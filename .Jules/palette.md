## 2026-01-22 - ActionNode Form Accessibility
**Learning:** The `ActionNode` component generates multiple inputs dynamically from a configuration object but failed to assign unique IDs or associate labels, making screen readers announce them as generic text inputs.
**Action:** When mapping over configuration arrays to generate inputs, always combine the parent component's unique ID (e.g., node ID) with the property name to generate stable, unique IDs for `htmlFor` association.
