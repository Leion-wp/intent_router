#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest

MODULE_PATH = pathlib.Path(__file__).with_name("factory_planning_identity.py")
spec = importlib.util.spec_from_file_location("factory_planning_identity", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class PlanningIdentityTests(unittest.TestCase):
    def _comments_file(self, comments):
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        json.dump(comments, handle)
        handle.close()
        self.addCleanup(lambda: pathlib.Path(handle.name).unlink(missing_ok=True))
        return handle.name

    def _body(self, issue_number):
        key = module.Key("Leion-wp/product", "fixed-roadmap-v1", "m2", "task-a")
        return module.emit_binding(key, issue_number)

    def test_untrusted_spoof_is_ignored(self):
        path = self._comments_file([
            {"user": {"login": "Leion-wp"}, "body": self._body(999)},
            {"user": {"login": "github-actions[bot]"}, "body": self._body(42)},
        ])
        key = module.Key("Leion-wp/product", "fixed-roadmap-v1", "m2", "task-a")
        self.assertEqual(module.resolve(module.load_bindings(path), key), 42)

    def test_only_untrusted_spoof_has_no_authority(self):
        path = self._comments_file([
            {"user": {"login": "Leion-wp"}, "body": self._body(999)},
        ])
        key = module.Key("Leion-wp/product", "fixed-roadmap-v1", "m2", "task-a")
        self.assertIsNone(module.resolve(module.load_bindings(path), key))

    def test_identical_trusted_replays_are_idempotent(self):
        body = self._body(42)
        path = self._comments_file([
            {"user": {"login": "github-actions[bot]"}, "body": body},
            {"user": {"login": "github-actions[bot]"}, "body": body},
        ])
        key = module.Key("Leion-wp/product", "fixed-roadmap-v1", "m2", "task-a")
        self.assertEqual(module.resolve(module.load_bindings(path), key), 42)

    def test_conflicting_trusted_bindings_fail_closed(self):
        path = self._comments_file([
            {"user": {"login": "github-actions[bot]"}, "body": self._body(42)},
            {"user": {"login": "github-actions[bot]"}, "body": self._body(43)},
        ])
        key = module.Key("Leion-wp/product", "fixed-roadmap-v1", "m2", "task-a")
        with self.assertRaises(module.LedgerError):
            module.resolve(module.load_bindings(path), key)

    def test_malformed_trusted_binding_fails_closed(self):
        path = self._comments_file([
            {"user": {"login": "github-actions[bot]"}, "body": f"{module.MARKER}\n```json\n{{bad json}}\n```"},
        ])
        with self.assertRaises(module.LedgerError):
            module.load_bindings(path)


if __name__ == "__main__":
    unittest.main()
