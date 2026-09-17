# Personal-account fleet invariant

The current Roots fleet owner is the GitHub user account `Leion-wp`, not a GitHub organization.

Account-wide control-plane workflows must therefore:

- authenticate `FLEET_GITHUB_TOKEN` with `GET /user` and require login `Leion-wp`;
- create repositories with `POST /user/repos`;
- discover owned repositories with `GET /user/repos?affiliation=owner` and filter `.owner.login == Leion-wp`;
- query Projects v2 through GraphQL `user(login:)`, not `organization(login:)`;
- continue to address repository-scoped resources as `repos/Leion-wp/<repo>/...`;
- never infer organization semantics from `github.repository_owner` alone.

The fleet schema retains an explicit `owner_type` so a future migration to an organization is a deliberate control-plane change rather than an implicit assumption.
