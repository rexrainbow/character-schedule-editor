// Seeded editor simulation only; runtime implementations may use their own RNG.
export function seededRandom(seed = '1') {
  let state = 2166136261;
  for (const char of String(seed)) { state ^= char.codePointAt(0); state = Math.imul(state, 16777619) >>> 0; }
  function uint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return (value ^ value >>> 14) >>> 0;
  }
  return () => ((uint32() >>> 5) * 67108864 + (uint32() >>> 6)) / 9007199254740992;
}
export function randomOffset(amplitude, integerOnly, random) {
  if (!Number.isFinite(amplitude) || amplitude < 0) throw new Error('invalidRandomAmplitude');
  if (amplitude === 0) return 0;
  if (!integerOnly) return (random() * 2 - 1) * amplitude;
  const bound = Math.floor(amplitude), count = 2 * bound + 1;
  if (!Number.isSafeInteger(count)) throw new Error('randomAmplitudeTooLarge');
  if (bound === 0) return 0;
  // Reject the incomplete final bucket so each integer has equal probability.
  const space = 9007199254740992, limit = space - space % count;
  let draw;
  do { draw = Math.floor(random() * space); } while (draw >= limit);
  return draw % count - bound;
}
