# Select open issues that the completion reconciler may inspect.
# Dispatched tasks remain eligible. A completely unlabeled issue is also eligible
# so a human quality reconciliation cannot make an already-delivered task invisible.
# Any explicit control-plane state remains authoritative and blocks this fallback.
.[]
| select(
    ([.labels[].name] | index("factory:dispatched")) != null
    or (.labels | length) == 0
  )
| select(([.labels[].name] | index("factory:blocked")) == null)
| select(([.labels[].name] | index("factory:human-required")) == null)
| select(([.labels[].name] | index("factory:stalled")) == null)
| select(([.labels[].name] | index("factory:escalated")) == null)
| select(([.labels[].name] | index("factory:done")) == null)
| .number
