# Dispatch acknowledgement contract

The normal dispatch path owns its acknowledgement transition.

After `factory-cross-repo-dispatch` successfully persists the Jules session marker, it must transition the source issue from `factory:dispatching` to `factory:dispatched` and verify the resulting labels before completing successfully.

Scheduler reconciliation remains a crash-recovery safety net; a healthy dispatch must not require a later scheduler tick to reach `factory:dispatched`.
