# Completion planning handoff regression

The completion reconciler must request `factory-autonomous-planning.yml` before its direct scheduler wake-up. The planner remains the sole owner of milestone closure and next-roadmap materialization. `.github/roots/test-completion-planning-handoff.py` guards the workflow edge without duplicating the planner's GitHub API model inside the execution-fleet harness.
