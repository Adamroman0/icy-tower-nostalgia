(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TowerCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getReachablePlatformX(previous, gap, platformWidth, worldWidth, random = Math.random) {
    const horizontalReach = clamp(55 + gap * 0.9, 90, 180);
    const minX = Math.max(0, previous.x - horizontalReach);
    const maxX = Math.min(worldWidth - platformWidth, previous.x + horizontalReach);
    return minX + random() * Math.max(0, maxX - minX);
  }

  function parseLeaderboard(serialized) {
    if (!serialized) return [];
    try {
      const entries = JSON.parse(serialized);
      if (!Array.isArray(entries)) return [];
      return entries
        .filter(entry => entry && Number.isFinite(entry.score) && entry.score >= 0 && typeof entry.date === 'string')
        .map(entry => ({ score: Math.floor(entry.score), date: entry.date.slice(0, 30) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (_) {
      return [];
    }
  }

  function getMomentumJump(speed, baseForce, maxForce, threshold, maxSpeed) {
    const ratio = clamp((Math.abs(speed) - threshold) / (maxSpeed - threshold), 0, 1);
    return {
      force: baseForce + (maxForce - baseForce) * ratio,
      isHighJump: ratio > 0,
      power: ratio
    };
  }

  return { clamp, getReachablePlatformX, parseLeaderboard, getMomentumJump };
}));
