# Personal-account fleet support status

This patch removes the false assumption that `Leion-wp` is a GitHub organization.

Covered paths:

- bootstrap repository creation uses the authenticated-user endpoint;
- fleet inventory and Projects v2 use user ownership;
- fleet repository creation uses the authenticated-user endpoint;
- fleet scheduler discovers repositories owned by the authenticated user;
- Jules fleet rework scans the same owned repository set;
- the fleet schema carries explicit `owner` and `owner_type` fields;
- bootstrap issue labels are sent as an array to GitHub's Issues API.

The control-plane continues to use repository-scoped `Leion-wp/<repo>` paths and preserves all existing human gates.
