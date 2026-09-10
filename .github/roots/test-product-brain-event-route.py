from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'


class ProductBrainEventRouteTests(unittest.TestCase):
    def test_receiver_routes_persisted_proposal_directly_to_product_brain(self):
        workflow = yaml.safe_load((WORKFLOWS / 'factory-fleet-events.yml').read_text())
        options = workflow['on']['workflow_dispatch']['inputs']['event_type']['options']
        self.assertIn('factory-product-proposal', options)
        steps = workflow['jobs']['route']['steps']
        step = next(item for item in steps if item.get('name') == 'Run Product Brain on persisted proposal')
        self.assertEqual(step['if'], "env.EVENT_TYPE == 'factory-product-proposal'")
        self.assertIn('gh workflow run factory-product-brain.yml', step['run'])
        self.assertIn('--ref Android', step['run'])
        self.assertIn('-f execute=true', step['run'])
        self.assertNotIn('factory-fleet-scheduler.yml', step['run'])

    def test_receiver_concurrency_is_isolated_by_managed_repository(self):
        workflow = yaml.safe_load((WORKFLOWS / 'factory-fleet-events.yml').read_text())
        concurrency = workflow['concurrency']
        group = concurrency['group']
        self.assertNotEqual(group, 'factory-fleet-events')
        self.assertIn('github.event.client_payload.repository', group)
        self.assertIn('inputs.repository', group)
        self.assertFalse(concurrency['cancel-in-progress'])

    def test_relay_template_exposes_product_proposal_event(self):
        relay = yaml.safe_load((ROOT / '.github/roots/fleet/product-event-relay.yml').read_text())
        options = relay['on']['workflow_dispatch']['inputs']['event_type']['options']
        self.assertIn('factory-product-proposal', options)
        classifier = relay['jobs']['relay']['steps'][0]['run']
        self.assertIn("event_type='factory-product-proposal'", classifier)
        self.assertIn('factory:brain-proposal', classifier)


if __name__ == '__main__':
    unittest.main(verbosity=2)
