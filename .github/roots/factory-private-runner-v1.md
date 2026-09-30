# Roots private Actions runner policy v1

## Goal

Private managed repositories must not depend on GitHub-hosted Actions minutes for nominal factory progress.

The canonical runner profile is `private_ephemeral` in
`.github/roots/factory-private-runner-policy-v1.json`.

## Security boundary

Product PRs may contain untrusted generated code. A persistent workstation runner is therefore not an acceptable nominal executor.

The `roots-private-ci` label is reserved for an isolated Linux x64 self-hosted runner that:

1. is registered as ephemeral / one-job;
2. starts from a disposable VM or container image;
3. is destroyed after the job;
4. has no user home, SSH keys, cloud credentials or Docker socket inherited from the host;
5. exposes only the GitHub job token and workflow-declared secrets required by that one job;
6. never shares a filesystem with a later job.

`factory-ci` and `factory-product-event-relay` intentionally use the same runner profile because the first executes PR code while the second can hold the cross-repository relay secret. Re-use across those jobs would create a credential-exfiltration path.

## Cost policy

For private managed repositories there is no automatic fallback to a GitHub-hosted runner. Exhausting hosted minutes must not silently switch the factory into a paid path or create repeated pre-runner failures.

The public `intent_router` control plane may continue to use standard GitHub-hosted runners.

## Bootstrap

`.github/roots/run-one-private-actions-runner.sh` registers one ephemeral runner from an explicit short-lived registration token.

The token is supplied at runtime only. No credential value is committed or logged.

The host is still responsible for providing a disposable execution environment. Deleting the runner work directory after a job is not a substitute for VM/container isolation.
