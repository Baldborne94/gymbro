import Anthropic from '@anthropic-ai/sdk';
import type { BodyMeasurement, Exercise, Routine, RoutineDay, RoutineExercise, Setting, Workout, WorkoutSet } from '../shared/schema';
import { liveRows } from './db';

export const coachEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export type CoachMode = 'progressione' | 'stalli' | 'scheda';
export interface CoachRequest {
  mode: CoachMode;
  goal?: string;
  days?: number;
  minutes?: number;
  notes?: string;
}

export interface ProposedRoutine {
  name: string;
  weeks: number;
  notes: string;
  days: {
    name: string;
    exercises: { exercise_id: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; load: number | null; superset_next: boolean; notes: string }[];
  }[];
}

export class CoachError extends Error {}

const SYSTEM = `Sei il coach di forza dentro GymBro, l'app personale di allenamento di un solo utente.
Ragioni solo sui dati che ricevi: storico delle sessioni, scheda attiva e misure. Non inventare sessioni o numeri che non ci sono; se i dati sono pochi, dillo.
Sei prudente: progressioni graduali, tecnica prima del carico. Non dai consigli medici: per dolori o infortuni rimanda a un professionista.
Scrivi in italiano, dai del tu, pesi in kg con la virgola decimale. Vai dritto al punto, senza premesse e senza riassunti finali.
Formato del testo: titoli su una riga propria preceduti da "## ", elenchi con "- ", grassetto con **doppio asterisco** solo per i numeri chiave. Niente tabelle.`;

const fmtSet = (s: WorkoutSet, ex: Exercise | undefined) =>
  ex?.kind === 'tempo' ? `${s.seconds ?? 0}s`
  : `${s.load ?? 0}${ex?.load_unit === 'tacche' ? 't' : ''}×${s.reps ?? 0}${s.kind !== 'normale' ? `(${s.kind})` : ''}${s.rpe ? `@${s.rpe}` : ''}`;

/** Riassunto compatto dei dati dell'utente da passare al modello. */
function buildContext(withLibrary: boolean): string {
  const exercises = liveRows<Exercise>('exercises');
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const parts: string[] = [`Data di oggi: ${new Date().toISOString().slice(0, 10)}`];

  const routine = liveRows<Routine>('routines').find((r) => r.status === 'attiva');
  if (routine) {
    const days = liveRows<RoutineDay>('routine_days').filter((d) => d.routine_id === routine.id).sort((a, b) => a.position - b.position);
    const items = liveRows<RoutineExercise>('routine_exercises').filter((i) => i.routine_id === routine.id);
    parts.push(
      `## Scheda attiva: ${routine.name} (inizio ${routine.start_date ?? '?'}, ${routine.weeks ?? '?'} settimane)`,
      ...days.map((d) => `${d.name}: ` + items.filter((i) => i.day_id === d.id).sort((a, b) => a.position - b.position)
        .map((i) => `${exMap.get(i.exercise_id)?.name ?? i.exercise_id} ${i.sets}×${i.reps_min}-${i.reps_max}${i.load ? ` @${i.load}` : ''}`).join('; ')),
    );
  } else {
    parts.push('## Scheda attiva: nessuna');
  }

  const workouts = liveRows<Workout>('workouts').filter((w) => w.finished_at).sort((a, b) => a.started_at - b.started_at);
  const since = Date.now() - 84 * 86_400_000;
  const recent = new Map(workouts.filter((w) => w.started_at >= since).map((w) => [w.id, w]));
  const byExercise = new Map<string, Map<string, WorkoutSet[]>>();
  for (const s of liveRows<WorkoutSet>('sets')) {
    if (!s.done || s.kind === 'riscaldamento' || !recent.has(s.workout_id)) continue;
    const sessions = byExercise.get(s.exercise_id) ?? new Map<string, WorkoutSet[]>();
    sessions.set(s.workout_id, [...(sessions.get(s.workout_id) ?? []), s]);
    byExercise.set(s.exercise_id, sessions);
  }
  parts.push(`## Storico delle ultime 12 settimane (${recent.size} sessioni; formato carico×ripetizioni, @ = RPE)`);
  if (!byExercise.size) parts.push('Nessuna sessione registrata.');
  for (const [exerciseId, sessions] of byExercise) {
    const ex = exMap.get(exerciseId);
    const lines = [...sessions]
      .sort((a, b) => recent.get(a[0])!.started_at - recent.get(b[0])!.started_at)
      .slice(-10)
      .map(([wid, sets]) => `${recent.get(wid)!.date}: ${sets.sort((a, b) => a.position - b.position).map((s) => fmtSet(s, ex)).join(' ')}`);
    parts.push(`${ex?.name ?? exerciseId} [${ex?.muscle ?? '?'}, passo ${ex?.step ?? '?'}]\n  ${lines.join('\n  ')}`);
  }

  const weights = liveRows<BodyMeasurement>('body_measurements').filter((b) => b.weight).sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length) parts.push(`## Peso corporeo: ${weights.slice(-5).map((b) => `${b.date} ${b.weight} kg`).join(', ')}`);
  const goal = liveRows<Setting>('settings').find((s) => s.id === 'weekly_goal')?.value;
  if (goal) parts.push(`## Obiettivo: ${goal} sessioni a settimana`);

  if (withLibrary) {
    parts.push(
      '## Libreria esercizi (id | nome | gruppo | attrezzo | tipo)',
      ...exercises.map((e) => `${e.id} | ${e.name} | ${e.muscle} | ${e.equipment} | ${e.kind}`),
    );
  }
  return parts.join('\n');
}

const ROUTINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'weeks', 'notes', 'days'],
  properties: {
    name: { type: 'string' },
    weeks: { type: 'integer' },
    notes: { type: 'string', description: 'Logica della scheda e come progredire, in tre o quattro frasi.' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'exercises'],
        properties: {
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exercise_id', 'sets', 'reps_min', 'reps_max', 'rest_sec', 'load', 'superset_next', 'notes'],
              properties: {
                exercise_id: { type: 'string', description: 'Un id preso dalla libreria esercizi.' },
                sets: { type: 'integer' },
                reps_min: { type: 'integer', description: 'Ripetizioni minime; secondi per gli esercizi a tempo.' },
                reps_max: { type: 'integer' },
                rest_sec: { type: 'integer' },
                load: { type: ['number', 'null'], description: 'Carico di partenza in kg se lo storico lo permette, altrimenti null.' },
                superset_next: { type: 'boolean' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

function prompt(req: CoachRequest): string {
  if (req.mode === 'progressione') {
    return 'Per ogni esercizio della scheda attiva che ha storico, proponi il carico e le ripetizioni da puntare nella prossima sessione, con una riga di motivazione. Raggruppa per giorno della scheda. Se non c’è una scheda attiva, usa gli esercizi allenati più di recente.';
  }
  if (req.mode === 'stalli') {
    return 'Individua gli esercizi fermi o in calo (nessun progresso di carico o ripetizioni nelle ultime tre o più sessioni). Per ognuno indica da quando è fermo, la causa più probabile che i dati suggeriscono e una sola azione concreta. Chiudi con gli esercizi che invece stanno andando bene, in una riga.';
  }
  return [
    'Crea una nuova scheda di allenamento usando solo esercizi della libreria (campo exercise_id).',
    `Obiettivo: ${req.goal?.trim() || 'forma generale'}.`,
    `Giorni a settimana: ${req.days ?? 3}. Durata di ogni sessione: circa ${req.minutes ?? 60} minuti.`,
    req.notes?.trim() ? `Indicazioni dell'utente: ${req.notes.trim()}` : '',
    'Tieni conto dello storico per i carichi di partenza e per bilanciare i gruppi muscolari. Usa i superset solo se aiutano a rispettare la durata.',
  ].filter(Boolean).join('\n');
}

/** Interroga Claude. Per la modalità "scheda" restituisce una scheda strutturata e già validata. */
export async function askCoach(req: CoachRequest): Promise<{ text?: string; routine?: ProposedRoutine }> {
  const client = new Anthropic();
  const wantsRoutine = req.mode === 'scheda';
  try {
    // In streaming, per non incappare nei timeout sulle risposte lunghe.
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      // Se il modello principale declina la richiesta, l'API riprova da sola su un modello di riserva.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        ...(wantsRoutine ? { format: { type: 'json_schema' as const, schema: ROUTINE_SCHEMA } } : {}),
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${buildContext(wantsRoutine)}\n\n---\n${prompt(req)}` }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new CoachError('Il coach non può rispondere a questa richiesta.');
    if (message.stop_reason === 'max_tokens') throw new CoachError('La risposta era troppo lunga ed è stata interrotta. Riprova.');
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (!wantsRoutine) return { text };

    const ids = new Set(liveRows<Exercise>('exercises').map((e) => e.id));
    const parsed = JSON.parse(text) as ProposedRoutine;
    const days = (parsed.days ?? [])
      .map((d) => ({ ...d, exercises: (d.exercises ?? []).filter((e) => ids.has(e.exercise_id)) }))
      .filter((d) => d.exercises.length);
    if (!days.length) throw new CoachError('La scheda proposta non conteneva esercizi validi. Riprova.');
    return { routine: { ...parsed, days } };
  } catch (err) {
    if (err instanceof CoachError) throw err;
    if (err instanceof SyntaxError) throw new CoachError('La scheda proposta non era leggibile. Riprova.');
    if (err instanceof Anthropic.AuthenticationError) throw new CoachError('La chiave API di Anthropic non è valida: controlla ANTHROPIC_API_KEY.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new CoachError('La chiave API non ha accesso a questo modello.');
    if (err instanceof Anthropic.RateLimitError) throw new CoachError('Troppe richieste in poco tempo. Riprova tra qualche minuto.');
    if (err instanceof Anthropic.APIConnectionError) throw new CoachError('Il server non riesce a raggiungere Anthropic: controlla la connessione a internet del NAS.');
    if (err instanceof Anthropic.APIError) throw new CoachError(`Errore dell'API di Anthropic (${err.status ?? '?'}). Riprova più tardi.`);
    throw err;
  }
}
