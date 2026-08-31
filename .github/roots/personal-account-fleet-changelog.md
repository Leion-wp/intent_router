# Personal-account fleet patch notes

Runtime evidence from the first bootstrap exposed two independent assumptions:

1. repository creation incorrectly targeted the organization endpoint;
2. issue creation sent `labels` as a scalar instead of the array required by GitHub's API.

Both are corrected in this branch. The bootstrap remains idempotent and reuses an already-created target repository and milestone on rerun.
