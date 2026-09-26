"""Contract tests for the external PR Forge CAS write lease.

These tests model the coordination invariant used by Work:
- only FREE is automatically acquirable;
- one lease generation protects one exact product write transaction;
- expiry revokes the holder but never authorizes automated takeover;
- release is conditional and is the only normal path back to FREE.
"""

import copy
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / ".github/roots/factory-pr-forge-lease.schema.json"


class Conflict(RuntimeError):
    pass


class NotAcquirable(RuntimeError):
    pass


class Store:
    def __init__(self):
        self.sha = 0
        self.value = {
            "version": 2,
            "resource": "roots-pr-forge",
            "state": "FREE",
            "generation": 0,
            "holder_task_id": None,
            "lease_token": None,
            "target_repository": None,
            "target_pr": None,
            "expected_head": None,
            "acquired_at": None,
            "expires_at": None,
            "released_at": None,
        }

    def read(self):
        return self.sha, copy.deepcopy(self.value)

    def cas(self, expected_sha, value):
        if expected_sha != self.sha:
            raise Conflict("stale content SHA")
        self.sha += 1
        self.value = copy.deepcopy(value)
        return self.sha


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def candidate(
    previous,
    holder,
    token,
    repository,
    pr,
    expected_head,
    now,
    ttl=timedelta(minutes=120),
):
    if previous["state"] != "FREE":
        raise NotAcquirable("only FREE may be acquired automatically")

    value = copy.deepcopy(previous)
    value.update(
        state="HELD",
        generation=previous["generation"] + 1,
        holder_task_id=holder,
        lease_token=token,
        target_repository=repository,
        target_pr=pr,
        expected_head=expected_head,
        acquired_at=iso(now),
        expires_at=iso(now + ttl),
        released_at=None,
    )
    return value


def fenced(
    store,
    fence_sha,
    holder,
    token,
    generation,
    repository,
    pr,
    expected_head,
    now,
):
    sha, value = store.read()
    return (
        sha == fence_sha
        and value["state"] == "HELD"
        and value["holder_task_id"] == holder
        and value["lease_token"] == token
        and value["generation"] == generation
        and value["target_repository"] == repository
        and value["target_pr"] == pr
        and value["expected_head"] == expected_head
        and parse(value["expires_at"]) > now
    )


def release(held, released_at):
    value = copy.deepcopy(held)
    value.update(
        state="FREE",
        holder_task_id=None,
        lease_token=None,
        target_repository=None,
        target_pr=None,
        expected_head=None,
        acquired_at=None,
        expires_at=None,
        released_at=iso(released_at),
    )
    return value


class LeaseTests(unittest.TestCase):
    def test_two_contenders_from_same_free_snapshot_have_one_winner(self):
        store = Store()
        observed_sha, observed = store.read()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        target_head = "a" * 40

        a = candidate(
            observed,
            "forge-event",
            "token-A-0123456789",
            "Leion-wp/product",
            10,
            target_head,
            now,
        )
        b = candidate(
            observed,
            "forge-reconcile",
            "token-B-0123456789",
            "Leion-wp/product",
            11,
            "b" * 40,
            now,
        )

        a_fence = store.cas(observed_sha, a)
        with self.assertRaises(Conflict):
            store.cas(observed_sha, b)

        self.assertTrue(
            fenced(
                store,
                a_fence,
                "forge-event",
                "token-A-0123456789",
                1,
                "Leion-wp/product",
                10,
                target_head,
                now + timedelta(minutes=1),
            )
        )

    def test_expired_held_is_fenced_and_not_automatically_acquirable(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha, free = store.read()
        held = candidate(
            free,
            "forge-event",
            "token-A-0123456789",
            "Leion-wp/product",
            10,
            "a" * 40,
            now,
            timedelta(minutes=1),
        )
        fence = store.cas(sha, held)
        later = now + timedelta(minutes=2)

        self.assertFalse(
            fenced(
                store,
                fence,
                "forge-event",
                "token-A-0123456789",
                1,
                "Leion-wp/product",
                10,
                "a" * 40,
                later,
            )
        )

        _, expired = store.read()
        with self.assertRaises(NotAcquirable):
            candidate(
                expired,
                "forge-reconcile",
                "token-B-0123456789",
                "Leion-wp/product",
                10,
                "a" * 40,
                later,
            )

    def test_lease_is_bound_to_exact_repository_pr_and_head(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha, free = store.read()
        held = candidate(
            free,
            "forge-event",
            "token-A-0123456789",
            "Leion-wp/product",
            10,
            "a" * 40,
            now,
        )
        fence = store.cas(sha, held)

        self.assertTrue(
            fenced(
                store,
                fence,
                "forge-event",
                "token-A-0123456789",
                1,
                "Leion-wp/product",
                10,
                "a" * 40,
                now + timedelta(minutes=1),
            )
        )
        self.assertFalse(
            fenced(
                store,
                fence,
                "forge-event",
                "token-A-0123456789",
                1,
                "Leion-wp/product",
                10,
                "b" * 40,
                now + timedelta(minutes=1),
            )
        )

    def test_release_is_conditional_and_next_generation_can_acquire(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha0, free = store.read()
        first = candidate(
            free,
            "forge-event",
            "token-A-0123456789",
            "Leion-wp/product",
            10,
            "a" * 40,
            now,
        )
        first_fence = store.cas(sha0, first)

        freed = release(first, now + timedelta(minutes=2))
        free_sha = store.cas(first_fence, freed)

        self.assertFalse(
            fenced(
                store,
                first_fence,
                "forge-event",
                "token-A-0123456789",
                1,
                "Leion-wp/product",
                10,
                "a" * 40,
                now + timedelta(minutes=3),
            )
        )

        _, free_state = store.read()
        second = candidate(
            free_state,
            "forge-reconcile",
            "token-B-0123456789",
            "Leion-wp/product",
            11,
            "b" * 40,
            now + timedelta(minutes=3),
        )
        second_fence = store.cas(free_sha, second)

        self.assertEqual(second["generation"], 2)
        self.assertNotEqual(first_fence, second_fence)
        self.assertTrue(
            fenced(
                store,
                second_fence,
                "forge-reconcile",
                "token-B-0123456789",
                2,
                "Leion-wp/product",
                11,
                "b" * 40,
                now + timedelta(minutes=4),
            )
        )

    def test_stale_release_cannot_clear_a_new_generation(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha0, free = store.read()
        first = candidate(
            free,
            "forge-event",
            "token-A-0123456789",
            "Leion-wp/product",
            10,
            "a" * 40,
            now,
        )
        first_fence = store.cas(sha0, first)
        free_sha = store.cas(first_fence, release(first, now + timedelta(minutes=1)))

        _, free_state = store.read()
        second = candidate(
            free_state,
            "forge-reconcile",
            "token-B-0123456789",
            "Leion-wp/product",
            11,
            "b" * 40,
            now + timedelta(minutes=2),
        )
        store.cas(free_sha, second)

        with self.assertRaises(Conflict):
            store.cas(first_fence, release(first, now + timedelta(minutes=3)))

    def test_schema_pins_v2_transaction_fields(self):
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["version"]["const"], 2)
        self.assertEqual(schema["properties"]["resource"]["const"], "roots-pr-forge")
        self.assertEqual(schema["properties"]["state"]["enum"], ["FREE", "HELD"])
        self.assertIn("target_repository", schema["required"])
        self.assertIn("target_pr", schema["required"])
        self.assertIn("expected_head", schema["required"])
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
