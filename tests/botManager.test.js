const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldStartBot } = require('../lib/botManager');

test('bots can be disabled in config', () => {
  assert.equal(shouldStartBot({ id: 'core', enabled: true }), true);
  assert.equal(shouldStartBot({ id: 'extra', enabled: false }), false);
  assert.equal(shouldStartBot({ id: 'default' }), true);
});
