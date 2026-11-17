import type { EquipmentId, Exercise, ExerciseKind, MuscleId } from '../shared/schema';

type Opts = { kind?: ExerciseKind; uni?: boolean; sec?: MuscleId[]; step?: number };
type Seed = [name: string, muscle: MuscleId, equipment: EquipmentId, opts?: Opts];

const BW: Opts = { kind: 'corpo_libero' };
const TIME: Opts = { kind: 'tempo' };

const LIST: Seed[] = [
  // Petto
  ['Panca piana', 'petto', 'bilanciere', { sec: ['tricipiti', 'spalle'] }],
  ['Panca inclinata', 'petto', 'bilanciere', { sec: ['spalle', 'tricipiti'] }],
  ['Panca declinata', 'petto', 'bilanciere', { sec: ['tricipiti'] }],
  ['Panca piana con manubri', 'petto', 'manubri', { sec: ['tricipiti', 'spalle'] }],
  ['Panca inclinata con manubri', 'petto', 'manubri', { sec: ['spalle', 'tricipiti'] }],
  ['Croci con manubri', 'petto', 'manubri'],
  ['Croci ai cavi', 'petto', 'cavi'],
  ['Croci ai cavi dal basso', 'petto', 'cavi'],
  ['Chest press', 'petto', 'macchina', { sec: ['tricipiti'] }],
  ['Pectoral machine', 'petto', 'macchina'],
  ['Panca al multipower', 'petto', 'multipower', { sec: ['tricipiti', 'spalle'] }],
  ['Piegamenti sulle braccia', 'petto', 'corpo_libero', { ...BW, sec: ['tricipiti', 'spalle'] }],
  ['Dip alle parallele', 'petto', 'corpo_libero', { ...BW, sec: ['tricipiti', 'spalle'] }],
  ['Pullover con manubrio', 'petto', 'manubri', { sec: ['schiena'] }],

  // Schiena
  ['Trazioni alla sbarra', 'schiena', 'corpo_libero', { ...BW, sec: ['bicipiti'] }],
  ['Trazioni presa supina', 'schiena', 'corpo_libero', { ...BW, sec: ['bicipiti'] }],
  ['Lat machine', 'schiena', 'macchina', { sec: ['bicipiti'] }],
  ['Lat machine presa stretta', 'schiena', 'macchina', { sec: ['bicipiti'] }],
  ['Rematore con bilanciere', 'schiena', 'bilanciere', { sec: ['bicipiti', 'trapezi'] }],
  ['Rematore con manubrio', 'schiena', 'manubri', { uni: true, sec: ['bicipiti'] }],
  ['Pulley basso', 'schiena', 'cavi', { sec: ['bicipiti', 'trapezi'] }],
  ['Rematore T-bar', 'schiena', 'bilanciere', { sec: ['bicipiti', 'trapezi'] }],
  ['Row machine', 'schiena', 'macchina', { sec: ['bicipiti'] }],
  ['Pulldown a braccia tese', 'schiena', 'cavi'],
  ['Stacco da terra', 'schiena', 'bilanciere', { sec: ['femorali', 'glutei', 'trapezi'], step: 5 }],
  ['Iperestensioni', 'schiena', 'corpo_libero', { ...BW, sec: ['glutei', 'femorali'] }],
  ['Good morning', 'schiena', 'bilanciere', { sec: ['femorali', 'glutei'] }],

  // Spalle
  ['Military press', 'spalle', 'bilanciere', { sec: ['tricipiti'] }],
  ['Lento avanti con manubri', 'spalle', 'manubri', { sec: ['tricipiti'] }],
  ['Arnold press', 'spalle', 'manubri', { sec: ['tricipiti'] }],
  ['Shoulder press', 'spalle', 'macchina', { sec: ['tricipiti'] }],
  ['Alzate laterali', 'spalle', 'manubri', { step: 1 }],
  ['Alzate laterali ai cavi', 'spalle', 'cavi', { uni: true }],
  ['Alzate frontali', 'spalle', 'manubri', { step: 1 }],
  ['Alzate a 90°', 'spalle', 'manubri', { step: 1 }],
  ['Reverse fly alla macchina', 'spalle', 'macchina'],
  ['Face pull', 'spalle', 'cavi', { sec: ['trapezi'] }],
  ['Tirate al mento', 'spalle', 'bilanciere', { sec: ['trapezi'] }],

  // Trapezi
  ['Scrollate con bilanciere', 'trapezi', 'bilanciere', { step: 5 }],
  ['Scrollate con manubri', 'trapezi', 'manubri'],

  // Bicipiti
  ['Curl con bilanciere', 'bicipiti', 'bilanciere', { sec: ['avambracci'] }],
  ['Curl con bilanciere EZ', 'bicipiti', 'bilanciere', { sec: ['avambracci'] }],
  ['Curl con manubri', 'bicipiti', 'manubri', { step: 1 }],
  ['Curl a martello', 'bicipiti', 'manubri', { sec: ['avambracci'], step: 1 }],
  ['Curl su panca inclinata', 'bicipiti', 'manubri', { step: 1 }],
  ['Curl alla panca Scott', 'bicipiti', 'bilanciere'],
  ['Curl di concentrazione', 'bicipiti', 'manubri', { uni: true, step: 1 }],
  ['Curl ai cavi', 'bicipiti', 'cavi'],
  ['Curl alla macchina', 'bicipiti', 'macchina'],

  // Tricipiti
  ['Push down ai cavi', 'tricipiti', 'cavi'],
  ['Push down con corda', 'tricipiti', 'cavi'],
  ['French press', 'tricipiti', 'bilanciere'],
  ['Estensioni sopra la testa', 'tricipiti', 'manubri'],
  ['Estensioni sopra la testa ai cavi', 'tricipiti', 'cavi'],
  ['Panca presa stretta', 'tricipiti', 'bilanciere', { sec: ['petto'] }],
  ['Kickback', 'tricipiti', 'manubri', { uni: true, step: 1 }],
  ['Dip tra due panche', 'tricipiti', 'corpo_libero', BW],
  ['Dip machine', 'tricipiti', 'macchina'],

  // Avambracci
  ['Curl dei polsi', 'avambracci', 'bilanciere'],
  ['Curl inverso', 'avambracci', 'bilanciere', { sec: ['bicipiti'] }],
  ['Farmer walk', 'avambracci', 'manubri', { ...TIME, sec: ['trapezi'] }],
  ['Sospensione alla sbarra', 'avambracci', 'corpo_libero', TIME],

  // Addome
  ['Crunch', 'addome', 'corpo_libero', BW],
  ['Crunch inverso', 'addome', 'corpo_libero', BW],
  ['Crunch ai cavi', 'addome', 'cavi'],
  ['Crunch alla macchina', 'addome', 'macchina'],
  ['Plank', 'addome', 'corpo_libero', TIME],
  ['Plank laterale', 'addome', 'corpo_libero', { ...TIME, uni: true }],
  ['Sollevamento gambe alla sbarra', 'addome', 'corpo_libero', BW],
  ['Sollevamento ginocchia alle parallele', 'addome', 'corpo_libero', BW],
  ['Russian twist', 'addome', 'corpo_libero', BW],
  ['Ab wheel', 'addome', 'altro', BW],
  ['Mountain climber', 'addome', 'corpo_libero', TIME],
  ['Hollow hold', 'addome', 'corpo_libero', TIME],

  // Quadricipiti
  ['Squat', 'quadricipiti', 'bilanciere', { sec: ['glutei', 'femorali'], step: 5 }],
  ['Front squat', 'quadricipiti', 'bilanciere', { sec: ['glutei'] }],
  ['Squat al multipower', 'quadricipiti', 'multipower', { sec: ['glutei'] }],
  ['Goblet squat', 'quadricipiti', 'kettlebell', { sec: ['glutei'] }],
  ['Leg press', 'quadricipiti', 'macchina', { sec: ['glutei'], step: 10 }],
  ['Hack squat', 'quadricipiti', 'macchina', { sec: ['glutei'], step: 5 }],
  ['Leg extension', 'quadricipiti', 'macchina'],
  ['Affondi con manubri', 'quadricipiti', 'manubri', { sec: ['glutei'] }],
  ['Affondi in camminata', 'quadricipiti', 'manubri', { sec: ['glutei'] }],
  ['Squat bulgaro', 'quadricipiti', 'manubri', { uni: true, sec: ['glutei'] }],
  ['Step up', 'quadricipiti', 'manubri', { uni: true, sec: ['glutei'] }],
  ['Pistol squat', 'quadricipiti', 'corpo_libero', { ...BW, uni: true }],
  ['Sedia al muro', 'quadricipiti', 'corpo_libero', TIME],

  // Femorali
  ['Stacco rumeno', 'femorali', 'bilanciere', { sec: ['glutei', 'schiena'], step: 5 }],
  ['Stacco rumeno con manubri', 'femorali', 'manubri', { sec: ['glutei'] }],
  ['Stacco a gambe tese', 'femorali', 'bilanciere', { sec: ['glutei', 'schiena'] }],
  ['Leg curl sdraiato', 'femorali', 'macchina'],
  ['Leg curl seduto', 'femorali', 'macchina'],
  ['Nordic curl', 'femorali', 'corpo_libero', BW],

  // Glutei
  ['Hip thrust', 'glutei', 'bilanciere', { sec: ['femorali'], step: 5 }],
  ['Ponte glutei', 'glutei', 'corpo_libero', BW],
  ['Slanci ai cavi', 'glutei', 'cavi', { uni: true }],
  ['Abductor machine', 'glutei', 'macchina'],
  ['Adductor machine', 'glutei', 'macchina'],
  ['Stacco sumo', 'glutei', 'bilanciere', { sec: ['quadricipiti', 'femorali'], step: 5 }],
  ['Swing con kettlebell', 'glutei', 'kettlebell', { sec: ['femorali'] }],

  // Polpacci
  ['Calf in piedi', 'polpacci', 'macchina'],
  ['Calf seduto', 'polpacci', 'macchina'],
  ['Calf alla leg press', 'polpacci', 'macchina', { step: 10 }],
  ['Calf con manubrio', 'polpacci', 'manubri', { uni: true }],
];

const DEFAULT_STEP: Record<EquipmentId, number> = {
  bilanciere: 2.5,
  multipower: 2.5,
  manubri: 2,
  kettlebell: 4,
  macchina: 5,
  cavi: 2.5,
  corpo_libero: 2.5,
  elastici: 1,
  altro: 1,
};

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const defaultStep = (equipment: EquipmentId) => DEFAULT_STEP[equipment] ?? 2.5;

/** Esercizi precaricati, con ID stabili così non vengono mai duplicati. */
export function seedExercises(): Exercise[] {
  return LIST.map(([name, muscle, equipment, o = {}]) => ({
    id: `base-${slug(name)}`,
    updated_at: 1,
    deleted: false,
    name,
    muscle,
    secondary: o.sec ?? [],
    equipment,
    kind: o.kind ?? 'pesi',
    unilateral: o.uni ?? false,
    load_unit: 'kg',
    step: o.step ?? defaultStep(equipment),
    notch_kg: null,
    notes: '',
    photo_id: null,
    custom: false,
  }));
}
