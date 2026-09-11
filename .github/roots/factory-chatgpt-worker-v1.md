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

The route label is consulted only while an issue is still `factory:queued`. Once a worker claims the issue, provider ownership is frozen for that active identity and later route-label drift cannot transfer or release capacity.

The machine reservation state is a dedicated provider ownership label declared by the central capacity contract:

- `factory:worker:jules`
- `factory:worker:chatgpt`

The claim transition adds exactly one matching ownership label together with `factory:dispatching`. The ownership labels are mutually exclusive. A queued issue must not carry either ownership label.

For `factory:dispatching` before a durable worker identity exists, the ownership label is authoritative for provider capacity. Once a durable `roots-jules-session` or `roots-chatgpt-worker` identity exists, the persisted worker identity is authoritative and must agree with any retained ownership label. A mismatch between the current route label and active ownership is a control-plane anomaly: it must fail closed for new claims and must never free a slot from the provider that actually owns the task.

A provider-qualified request marker may still be written for audit trace:

`<!-- roots-dispatch-request issue=<issue> run=<run>-<attempt> slot=<slot> worker=<jules|chatgpt> -->`

That comment is **audit trace only**. Issue/PR/comment/log content is untrusted and never authorizes provider ownership. The marker cannot claim a queued issue, transfer a slot or override the ownership label/durable worker identity.

## Routing

A managed issue with `factory:queued` and `factory:agent:chatgpt` is invisible to Jules selection. The Jules scheduler validates the route immediately before claim. Once a task is active, dispatcher, watchdog and rework ownership come from machine ownership/durable worker identity rather than from later route-label edits.

The ChatGPT worker automation owns only issues that satisfy all of the following at claim time:

1. managed repository/profile validated;
2. `worker_policy.enabled` contains `chatgpt`;
3. `factory:queued` + `factory:agent:chatgpt` are still present;
4. neither `factory:worker:jules` nor `factory:worker:chatgpt` is present;
5. no blocking/human/escalated lifecycle label applies;
6. dependencies are closed;
7. no active Jules or ChatGPT worker identity/PR already owns the issue;
8. ChatGPT active slots remain below configured capacity.

It must re-read these conditions immediately before claiming work. A claim atomically removes `factory:queued` and adds `factory:dispatching` + `factory:worker:chatgpt`. It may write `roots-dispatch-request ... worker=chatgpt` as non-authoritative audit trace. Later route changes do not alter that ownership.

If a claim fails before a durable ChatGPT worker identity exists and the task is safely returned to `factory:queued`, the ChatGPT ownership label must be removed in the same recovery transition. A queued task with a retained ownership label fails closed rather than being reassigned.

## ChatGPT worker identity

After reserving a task, the worker uses the same common lifecycle:

`factory:queued -> factory:dispatching -> factory:dispatched -> factory:done`

It creates exactly one branch and one PR. Once the PR exists, it persists this marker on the source issue:

`<!-- roots-chatgpt-worker task_id=<owner/repo>#<issue> branch=<branch> pr=<number> -->`

That marker is the durable worker identity. It must be unique for the issue and must never coexist with a `roots-jules-session` marker. Any retained `factory:worker:chatgpt` label must agree with this identity.

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

Jules-specific REWORK acts only on a durable Jules identity. A later `factory:agent:chatgpt` route-label edit cannot steal that identity or suppress its same-session rework. Conversely, a durable ChatGPT identity must never enter Jules rework merely because its route label was removed.

The ChatGPT worker automation must, on later runs, prefer resuming its existing active identity over claiming a new task. It reads the current PR HEAD, CI and native Quality verdict. A CI failure or Quality REWORK may update only the existing branch/PR. Pending evidence causes no mutation. BLOCK or a real human boundary fails closed.

Repeated identical rework must be fingerprinted and bounded. The initial worker contract permits at most three attempts for the same failure fingerprint before `factory:blocked` + `factory:escalated` + `factory:human-required` and release of its active compute slot.

## Scheduling model

The ChatGPT worker is a scheduled cognitive adapter, not the nominal dependency mechanism. Product GitHub events still drive CI, Quality, Risk, merge, completion and planning. The worker schedule only provides compute opportunities to claim/resume ChatGPT-routed work.

Future worker routers may assign `factory:agent:chatgpt` deterministically, but v1 intentionally requires an explicit persisted route plus profile opt-in so provider selection cannot be guessed by the worker itself.
