const test = require('node:test');
const assert = require('node:assert/strict');

const { getRequiredEnv, getOptionalEnv, normalizeBotConfig } = require('../lib/config');

test('optional env values resolve with fallbacks', () => {
  assert.equal(getOptionalEnv('SNS_CORE_MISSING_VALUE', 'fallback'), 'fallback');
  process.env.SNS_CORE_PRESENT = 'hello';
  assert.equal(getOptionalEnv('SNS_CORE_PRESENT', 'fallback'), 'hello');
  delete process.env.SNS_CORE_PRESENT;
});

test('required env values fail fast when missing', () => {
  assert.throws(() => getRequiredEnv('SNS_CORE_MISSING_REQUIRED'), /SNS_CORE_MISSING_REQUIRED/);
});

test('bot configs are normalized consistently', () => {
  const config = normalizeBotConfig({ id: 'demo', enabled: undefined, cogs: undefined });
  assert.equal(config.id, 'demo');
  assert.equal(config.enabled, true);
  assert.deepEqual(config.cogs, []);
});
