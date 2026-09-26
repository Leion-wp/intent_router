"""Contract tests for the external PR Forge CAS lease.

These tests model the GitHub Contents API contract used by Work:
an update is accepted only for the exact content SHA read by the writer.
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


class Store:
    def __init__(self):
        self.sha = 0
        self.value = {
            "version": 1,
            "resource": "roots-pr-forge",
            "state": "FREE",
            "generation": 0,
            "holder_task_id": None,
            "lease_token": None,
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


def candidate(previous, holder, token, now, ttl=timedelta(minutes=120)):
    value = copy.deepcopy(previous)
    value.update(
        state="HELD",
        generation=previous["generation"] + 1,
        holder_task_id=holder,
        lease_token=token,
        acquired_at=iso(now),
        expires_at=iso(now + ttl),
        released_at=None,
    )
    return value


def fenced(store, fence_sha, holder, token, generation, now):
    sha, value = store.read()
    return (
        sha == fence_sha
        and value["state"] == "HELD"
        and value["holder_task_id"] == holder
        and value["lease_token"] == token
        and value["generation"] == generation
        and parse(value["expires_at"]) > now
    )


class LeaseTests(unittest.TestCase):
    def test_two_contenders_from_same_snapshot_have_one_winner(self):
        store = Store()
        observed_sha, observed = store.read()
        a = candidate(observed, "forge-event", "token-A-0123456789", datetime(2026, 9, 26, tzinfo=timezone.utc))
        b = candidate(observed, "forge-reconcile", "token-B-0123456789", datetime(2026, 9, 26, tzinfo=timezone.utc))

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
                datetime(2026, 9, 26, 0, 1, tzinfo=timezone.utc),
            )
        )

    def test_expired_holder_is_fenced_even_before_takeover(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha, current = store.read()
        held = candidate(current, "forge-event", "token-A-0123456789", now, timedelta(minutes=1))
        fence = store.cas(sha, held)

        self.assertFalse(
            fenced(
                store,
                fence,
                "forge-event",
                "token-A-0123456789",
                1,
                now + timedelta(minutes=2),
            )
        )

    def test_takeover_changes_generation_and_fences_stale_holder(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha0, free = store.read()
        first = candidate(free, "forge-event", "token-A-0123456789", now, timedelta(minutes=1))
        first_fence = store.cas(sha0, first)

        sha1, expired = store.read()
        second = candidate(
            expired,
            "forge-reconcile",
            "token-B-0123456789",
            now + timedelta(minutes=2),
        )
        second_fence = store.cas(sha1, second)

        self.assertEqual(second["generation"], 2)
        self.assertNotEqual(first_fence, second_fence)
        self.assertFalse(
            fenced(
                store,
                first_fence,
                "forge-event",
                "token-A-0123456789",
                1,
                now + timedelta(minutes=2),
            )
        )
        self.assertTrue(
            fenced(
                store,
                second_fence,
                "forge-reconcile",
                "token-B-0123456789",
                2,
                now + timedelta(minutes=3),
            )
        )

    def test_release_is_conditional_and_removes_write_authority(self):
        store = Store()
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sha, free = store.read()
        held = candidate(free, "forge-event", "token-A-0123456789", now)
        fence = store.cas(sha, held)

        released = copy.deepcopy(held)
        released.update(
            state="FREE",
            holder_task_id=None,
            lease_token=None,
            acquired_at=None,
            expires_at=None,
            released_at=iso(now + timedelta(minutes=3)),
        )
        store.cas(fence, released)

        self.assertFalse(
            fenced(
                store,
                fence,
                "forge-event",
                "token-A-0123456789",
                1,
                now + timedelta(minutes=4),
            )
        )

    def test_schema_pins_resource_and_states(self):
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["version"]["const"], 1)
        self.assertEqual(schema["properties"]["resource"]["const"], "roots-pr-forge")
        self.assertEqual(schema["properties"]["state"]["enum"], ["FREE", "HELD"])
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
