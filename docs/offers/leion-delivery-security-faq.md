# Leion Delivery Security FAQ

## Does Leion Delivery let an agent merge code on its own?

No by default.

- human approval stays explicit on sensitive steps
- merge remains optional
- risky actions stay visible in the workflow

## Where does code execution happen?

V1 is local-first.

- execution happens in VS Code or in a lightweight runner under customer control
- the control plane stores metadata, history, policy, and webhook routing
- V1 does not require broad remote cloud code execution

## Do you store source code?

The default posture should be minimal storage.

- store run metadata, approvals, logs, and selected artifacts
- avoid broad source snapshot storage unless the customer explicitly needs it
- keep approval and audit evidence first-class

## How are LLM credentials handled?

Default rule: `BYO AI keys`.

- do not absorb unlimited LLM cost in V1
- keep the provider boundary explicit
- support secret metadata and rotation over time

## How do approvals work?

- approvals stay visible in the workflow graph
- review steps remain explicit before code is applied or promoted
- policy packs can warn or block based on configured rules

## Is this a replacement for GitHub review?

No.

It packages repeatable delivery workflows around existing GitHub and repo practices. It does not remove the need for engineering judgment.
