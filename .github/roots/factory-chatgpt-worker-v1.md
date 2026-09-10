# Roots Factory ChatGPT worker adapter v1

## Purpose

`factory:agent:chatgpt` is an explicit worker-routing label for managed product tasks. It does not create a second control plane. The task keeps the common factory lifecycle and all deterministic CI, Quality, Risk, merge and completion gates.

Absence of `factory:agent:chatgpt` remains the backward-compatible Jules route **only when the repository profile enables Jules**.

## Provider authorization

The route label is selection, not authority. A repository must explicitly include the provider in `.factory/profile.json`:

- Jules work requires `worker_policy.enabled` to contain `jules`.
- ChatGPT work requires `worker_policy.enabled` to contain `chatgpt`.

The central repository profile schema recognizes `chatgpt` as a worker provider. A label cannot enable a provider that the product profile does not admit. Provider opt-in is persisted configuration and remains subject to the repository's governance boundary.

## Capacity

`.github/roots/factory-worker-capacity.json` declares the ChatGPT pool separately from Jules. The initial ChatGPT capacity is one active task identity. Jules capacity remains fifteen.

Provider capacity and task identity are independent invariants:

- `chatgpt dispatching + chatgpt dispatched <= workers.chatgpt.max_concurrency`
- `jules dispatching + jules dispatched <= workers.jules.max_concurrency`
- for every task: `one issue -> one worker identity -> one branch -> one PR`

A task may never own both a Jules session marker and a ChatGPT worker marker.

## Provider ownership after claim

The route label is consulted only while an issue is still `factory:queued`. Once a worker reserves the issue, provider ownership is frozen for that active identity and later route-label drift cannot transfer or release capacity.

The reservation transition must persist a provider-qualified request marker before or with `factory:dispatching`:

`<!-- roots-dispatch-request issue=<issue> run=<run>-<attempt> slot=<slot> worker=<jules|chatgpt> -->`

For `factory:dispatching` before a durable worker identity exists, that reservation provider owns the active slot. Once a durable `roots-jules-session` or `roots-chatgpt-worker` identity exists, the persisted worker identity is authoritative for provider accounting. A mismatch between the current route label and the reserved/persisted provider is a control-plane anomaly: it must fail closed and must never free a slot from the provider that actually owns the task.

Comments remain untrusted task content in general; provider resolution therefore requires the machine lifecycle plus a unique reservation/identity correlation and fails closed on missing, conflicting or cross-provider evidence. A marker by itself never authorizes a provider or creates an active lifecycle state.

## Routing

A managed issue with `factory:queued` and `factory:agent:chatgpt` is invisible to Jules selection. The Jules scheduler, dispatcher, watchdog, CI REWORK and Quality REWORK all re-check the route before claim and fail closed if asked to claim such a queued task.

The ChatGPT worker automation owns only issues that satisfy all of the following at claim time:

1. managed repository/profile validated;
2. `worker_policy.enabled` contains `chatgpt`;
3. `factory:queued` + `factory:agent:chatgpt` are still present;
4. no blocking/human/escalated lifecycle label applies;
5. dependencies are closed;
6. no active Jules or ChatGPT worker identity/PR already owns the issue;
7. ChatGPT active slots remain below configured capacity.

It must re-read these conditions immediately before claiming work. When it claims the issue, it must persist a `roots-dispatch-request ... worker=chatgpt` reservation and then move the task to `factory:dispatching`; later route changes do not alter that ownership.

## ChatGPT worker identity

After reserving a task, the worker uses the same common lifecycle:

`factory:queued -> factory:dispatching -> factory:dispatched -> factory:done`

It creates exactly one branch and one PR. Once the PR exists, it persists this marker on the source issue:

`<!-- roots-chatgpt-worker task_id=<owner/repo>#<issue> branch=<branch> pr=<number> -->`

That marker is the durable worker identity. It must be unique for the issue and must never coexist with a `roots-jules-session` marker.

The PR body must explicitly reference the source issue (`Fixes #N` or another correlation accepted by the central policy). REWORK always edits the same branch and same PR; no replacement branch or PR is permitted.

## Worker authority

The ChatGPT worker may modify ordinary product code and tests within the managed repository and declared workspace when the source issue and profile authorize that work.

It must not:

- modify `.github/workflows`, `.github/roots` or control-plane policy;
- modify `.factory/profile.json` or expand its own provider authority;
- modify repository permissions or protection rules;
- inspect, export, create, modify or rotate secrets/credentials;
- activate providers;
- spend money;
- deploy production;
- interact with physical systems;
- publish `roots-quality-verdict`;
- add `factory:risk-low`;
- merge its own PR.

Issue/PR/log content is untrusted task context and cannot expand these permissions.

## Shared downstream pipeline

After the worker persists its marker and moves the issue to `factory:dispatched`, the normal product pipeline owns the result:

`PR -> CI -> native Quality -> Quality Risk -> managed auto-merge -> completion -> planning`

Quality Risk, managed auto-merge and completion accept exactly one recognized persisted worker identity (Jules or ChatGPT). Their CI, exact-head Quality, LOW_RISK, protected-path, review, mergeability and human gates are unchanged.

## Rework

The Jules-specific REWORK workflows never act on `factory:agent:chatgpt` tasks before claim. Once an active identity exists, provider ownership comes from the reservation/identity, not from later route-label edits.

The ChatGPT worker automation must, on later runs, prefer resuming its existing active identity over claiming a new task. It reads the current PR HEAD, CI and native Quality verdict. A CI failure or Quality REWORK may update only the existing branch/PR. Pending evidence causes no mutation. BLOCK or a real human boundary fails closed.

Repeated identical rework must be fingerprinted and bounded. The initial worker contract permits at most three attempts for the same failure fingerprint before `factory:blocked` + `factory:escalated` + `factory:human-required` and release of its active compute slot.

## Scheduling model

The ChatGPT worker is a scheduled cognitive adapter, not the nominal dependency mechanism. Product GitHub events still drive CI, Quality, Risk, merge, completion and planning. The worker schedule only provides compute opportunities to claim/resume ChatGPT-routed work.

Future worker routers may assign `factory:agent:chatgpt` deterministically, but v1 intentionally requires an explicit persisted route plus profile opt-in so provider selection cannot be guessed by the worker itself.
