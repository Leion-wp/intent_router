# Leion Delivery Demo Script

## Demo Goal

Show that AI delivery work can be governed, repeatable, and reviewable instead of opaque.

## Demo Length

`10 to 15 minutes`

## Setup

- one repo ready locally
- one issue or PR with realistic context
- `Leion Delivery` workflow pack visible in the graph
- one approval point ready to demonstrate

## Flow

1. Start with the workflow graph, not with code generation.
2. Explain the three packaged flows:
   - `Issue -> PR`
   - `PR Review -> Fix / Improve`
   - `Release / QA / Security Gate`
3. Show where AI is used.
4. Show where human approval is required.
5. Run one workflow on a real repo.
6. Pause on the diff approval step and explain the governance rule.
7. Continue through validation, push, and PR or gate output.
8. Show the resulting run history and proof artifact.
9. Explain what becomes repeatable for the team after the pilot.
10. End on a narrow pilot scope and next step.

## Key Lines To Say

- "This is not an autonomous merge bot."
- "The workflow is reusable after the demo."
- "The approval point is explicit and visible."
- "We start local-first and add the control plane where it creates operational value."

## Proof To Capture After Every Demo

- graph screenshot
- approval screenshot
- run history export
- one objection and one answer
- one next step with owner and date
