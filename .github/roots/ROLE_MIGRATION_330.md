# Repository role migration (#330)

`managed repository != generated commercial product`.

The control-plane now requires every managed repository profile to declare exactly one semantic `repository_role`:

- `factory_control_plane`
- `factory_substrate`
- `generated_product`
- `internal_tool`

New micro-SaaS repositories created by the bootstrap workflow are `generated_product`.

`Leion-wp/micro-saas-boilerplate` must be migrated separately to `factory_substrate` together with its role-aware `.factory/product-state.json`. Until that migration lands, Product Brain planning for that repository fails closed while ordinary execution of the already-open milestone can continue.

This migration does not relax production, credential, spend, workflow, or branch-governance gates.
