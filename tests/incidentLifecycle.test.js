const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INCIDENT_STATES,
  normalizeIncidentState,
  isValidTransition,
  buildIncidentSummary,
} = require('../lib/incidentLifecycle');

test('incident states are normalized to the canonical set', () => {
  assert.equal(normalizeIncidentState('OPEN'), 'open');
  assert.equal(normalizeIncidentState('assigned'), 'assigned');
  assert.equal(normalizeIncidentState('unknown-state'), 'open');
  assert.ok(INCIDENT_STATES.includes('open'));
});

test('valid lifecycle transitions enforce the expected path', () => {
  assert.equal(isValidTransition('open', 'assigned'), true);
  assert.equal(isValidTransition('assigned', 'resolved'), true);
  assert.equal(isValidTransition('resolved', 'open'), false);
  assert.equal(isValidTransition('open', 'closed'), false);
});

test('incident summaries include the core audit fields', () => {
  const summary = buildIncidentSummary({
    id: 'INC-1001',
    title: 'Webhook spike',
    severity: 'high',
    status: 'assigned',
    owner: 'ops-team',
    guildId: 'guild-42',
    reason: 'Repeated failed sign-ins',
  });

  assert.deepEqual(summary, {
    id: 'INC-1001',
    title: 'Webhook spike',
    severity: 'high',
    status: 'assigned',
    owner: 'ops-team',
    guildId: 'guild-42',
    reason: 'Repeated failed sign-ins',
  });
});
