const INCIDENT_STATES = ['open', 'assigned', 'investigating', 'monitoring', 'resolved', 'closed'];

function normalizeIncidentState(value) {
  const state = String(value ?? '').trim().toLowerCase();
  if (INCIDENT_STATES.includes(state)) return state;
  if (state === 'acknowledged') return 'assigned';
  if (state === 'active') return 'open';
  if (state === 'done') return 'resolved';
  return 'open';
}

function isValidTransition(from, to) {
  const current = normalizeIncidentState(from);
  const next = normalizeIncidentState(to);

  const allowed = {
    open: ['assigned', 'investigating', 'monitoring'],
    assigned: ['investigating', 'monitoring', 'resolved'],
    investigating: ['monitoring', 'resolved'],
    monitoring: ['resolved'],
    resolved: ['closed'],
    closed: [],
  };

  return allowed[current]?.includes(next) === true;
}

function buildIncidentSummary(incident = {}) {
  return {
    id: incident.id,
    title: incident.title,
    severity: incident.severity,
    status: normalizeIncidentState(incident.status),
    owner: incident.owner,
    guildId: incident.guildId,
    reason: incident.reason,
  };
}

module.exports = {
  INCIDENT_STATES,
  normalizeIncidentState,
  isValidTransition,
  buildIncidentSummary,
};
