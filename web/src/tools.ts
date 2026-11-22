/** Calcoli degli strumenti, separati dall'interfaccia per poterli verificare. */

/** Dischi per lato, dal più pesante, per avvicinarsi il più possibile al peso richiesto. */
export function platesPerSide(target: number, bar: number, plates: number[]): { side: number[]; total: number } {
  let rest = Math.max(0, (target - bar) / 2);
  const side: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rest >= p - 1e-9) {
      side.push(p);
      rest = Math.round((rest - p) * 1000) / 1000;
    }
  }
  return { side, total: bar + 2 * side.reduce((a, b) => a + b, 0) };
}

/** Massimale stimato: media di Epley e Brzycki (Brzycki non vale oltre 36 ripetizioni). */
export function estimateMax(load: number, reps: number): { max: number; epley: number; brzycki: number } {
  const epley = reps <= 1 ? load : load * (1 + reps / 30);
  const brzycki = reps <= 1 ? load : reps < 37 ? (load * 36) / (37 - reps) : 0;
  return { max: brzycki ? (epley + brzycki) / 2 : epley, epley, brzycki };
}

/** Carico per un dato numero di ripetizioni partendo dal massimale (Epley inversa). */
export const loadForReps = (max: number, reps: number) => (reps <= 1 ? max : max / (1 + reps / 30));
