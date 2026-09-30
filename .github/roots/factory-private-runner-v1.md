# Roots private Actions runner policy v1

## Goal

Private factory repositories must not depend on GitHub-hosted Actions minutes
for nominal progress, and privileged relay credentials must never share an
execution class with untrusted pull-request code.

The canonical policy is:

`.github/roots/factory-private-runner-policy-v1.json`

## Runner classes

### `roots-private-ci`

Profile: `private_untrusted_ephemeral`.

Used by product CI and memory validation. These jobs may execute untrusted or
mutable repository content and therefore **must not receive cross-repository
relay credentials**.

Every registration is one-job / ephemeral and must start inside a disposable
Linux x64 VM or container. The environment is destroyed after the job.

### `roots-private-control`

Profile: `private_control_ephemeral`.

Used by the product event relay. This class may receive the narrowly scoped
`FACTORY_EVENT_TOKEN`, but it must never check out or execute product PR code.

It is also one-job / ephemeral and uses a separate runner label so GitHub cannot
schedule an untrusted CI job onto a privileged control instance.

### Public control plane

`intent_router` remains on GitHub-hosted `ubuntu-latest` runners.

## Absolute trust invariant

No private runner profile may have both:

- `may_execute_untrusted_pr_code=true`; and
- `may_hold_cross_repo_relay_secret=true`.

The policy schema and contract tests enforce this invariant.

A persistent developer workstation is not an acceptable nominal runner for
either private class. A temporary work directory on a persistent host is not
isolation.

## Cost policy

There is no automatic fallback from either private class to GitHub-hosted
compute. If local capacity is absent, the job remains queued rather than
silently consuming private hosted minutes or paid capacity.

Superseded product CI runs are cancelled per PR so only the latest head should
consume local compute.

## Host-side token broker

The durable administrative credential stays only on the trusted provisioner
host.

Use `.github/roots/mint-private-runner-registration.py` to mint a short-lived
repository registration token into a mode-0600 file:

```bash
export ROOTS_RUNNER_ADMIN_TOKEN='<stored only on the provisioner>'
python .github/roots/mint-private-runner-registration.py \
  --repository Leion-wp/micro-saas-boilerplate \
  --output /secure-tmp/roots-runner-token
```

The fine-grained credential is restricted to the repositories listed in
`managed_private_repositories` and needs repository Administration write for
runner registration. Never inject `ROOTS_RUNNER_ADMIN_TOKEN` into a job
environment.

Pass only the short-lived registration token file into the disposable runner.

## One-shot bootstrap

`.github/roots/run-one-private-actions-runner.sh` registers exactly one
ephemeral runner. Choose the class explicitly:

```bash
ROOTS_RUNNER_REPOSITORY=Leion-wp/micro-saas-boilerplate \
ROOTS_RUNNER_LABEL=roots-private-ci \
ROOTS_RUNNER_REGISTRATION_TOKEN_FILE=/run/secrets/runner-token \
.github/roots/run-one-private-actions-runner.sh
```

For the privileged relay instance, use `ROOTS_RUNNER_LABEL=roots-private-control`.

The bootstrap accepts only those two canonical labels, consumes and deletes the
short-lived token file before the runner starts, verifies the pinned runner
archive SHA-256, registers with `--ephemeral --disableupdate`, and cleans its
temporary runner directory on exit. The surrounding VM/container must still be
destroyed by the host after the job.

## Runner release pin

The canonical Linux x64 runner release is stored in
`.github/roots/factory-private-runner-version-v1.json`.

`factory-private-runner-version-watch.yml` compares the pin against GitHub's
latest public runner release. A newer release warns initially and becomes a
failing control-plane check after 21 days, leaving margin before GitHub's
30-day update enforcement window.
