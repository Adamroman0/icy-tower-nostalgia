'use strict';

const assert = require('node:assert/strict');
const core = require('./game-core.js');

const x = core.getReachablePlatformX({ x: 100 }, 100, 70, 420, () => 1);
assert.ok(x <= 280, 'generated platform stays within a reachable horizontal range');
assert.equal(core.parseLeaderboard('{bad json').length, 0);
assert.deepEqual(core.parseLeaderboard('[{"score":12.8,"date":"Jul 10"},{"score":"bad","date":"x"}]'), [
  { score: 12, date: 'Jul 10' }
]);
assert.equal(core.getMomentumJump(2, -10.5, -15.5, 4.2, 7.2).isHighJump, false);
assert.equal(core.getMomentumJump(7.2, -10.5, -15.5, 4.2, 7.2).force, -15.5);

console.log('game-core tests passed');
