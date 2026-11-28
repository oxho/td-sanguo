/** Wave HP scale. Wave 1 is the printed base (×1). Mirrors the v1.1 curve the PRD kept. */
export function waveHpScale(wave: number, growth = 1.15, mul = 1): number {
  const w = Math.max(1, Math.floor(wave));
  const curve = w <= 10 ? Math.pow(growth, w - 1) : Math.pow(growth, 9) * Math.pow(1.085, w - 10);
  return curve * mul;
}

/** Clear-wave munition. PRD: 30 × 1.12^波数, rounded. */
export function waveClearGold(wave: number): number {
  return Math.round(30 * Math.pow(1.12, wave));
}

/** Gate upgrade cost from the current level. */
export function gateUpgradeCost(level: number): number {
  return Math.round(150 * Math.pow(1.7, level - 1));
}

export function gateMaxHp(level: number): number {
  return 100 + 60 * (level - 1);
}

/** Branch skill damage scale. Cooldown does not change. */
export function skillScale(level: number): number {
  if (level >= 6) return 1.45;
  if (level >= 5) return 1.2;
  return 1;
}
