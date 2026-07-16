export interface TimeSlot {
  id: number;
  label: string;
  start: string;
  end: string;
  durationMin: number;
}

export interface Task {
  id?: string;
  usuario_id?: string;
  data_agendamento: string; // YYYY-MM-DD
  bloco_inicio_id: number; // 1 a 42
  quantidade_blocos: number;
  titulo: string;
  descricao?: string;
  concluida: boolean;
  categoria?: string;      // id em CATEGORIES (padrão: 'pessoal')
  serie_id?: string | null; // agrupa repetições de uma tarefa recorrente
  criado_em?: string;
}

// ────────────────────────────────────────────────────────────
// Geração dos 42 blocos assimétricos do dia
// (madrugada 60min · manhã 15/30min · almoço 15min ·
//  tarde 30min · transição 15min · noite 75min)
// ────────────────────────────────────────────────────────────

interface SlotRange {
  fromMin: number;
  toMin: number;
  stepMin: number;
}

const SLOT_RANGES: SlotRange[] = [
  { fromMin: 0 * 60, toMin: 8 * 60, stepMin: 60 },   // Madrugada
  { fromMin: 8 * 60, toMin: 9 * 60, stepMin: 15 },   // Início da manhã
  { fromMin: 9 * 60, toMin: 12 * 60, stepMin: 30 },  // Manhã
  { fromMin: 12 * 60, toMin: 14 * 60, stepMin: 15 }, // Almoço
  { fromMin: 14 * 60, toMin: 18 * 60, stepMin: 30 }, // Tarde
  { fromMin: 18 * 60, toMin: 19 * 60, stepMin: 15 }, // Transição
  { fromMin: 19 * 60, toMin: 24 * 60, stepMin: 75 }, // Noite
];

function minutesToHHMM(totalMin: number, normalizeMidnight = true): string {
  const h = Math.floor(totalMin / 60) % (normalizeMidnight ? 24 : 25);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const TIME_SLOTS: TimeSlot[] = (() => {
  const slots: TimeSlot[] = [];
  let id = 1;
  for (const range of SLOT_RANGES) {
    for (let start = range.fromMin; start < range.toMin; start += range.stepMin) {
      const end = start + range.stepMin;
      slots.push({
        id: id++,
        label: `${minutesToHHMM(start)} - ${end === 24 * 60 ? '24:00' : minutesToHHMM(end)}`,
        start: minutesToHHMM(start),
        end: minutesToHHMM(end), // 24:00 é normalizado para 00:00
        durationMin: range.stepMin,
      });
    }
  }
  return slots;
})();

export const LAST_SLOT_ID = TIME_SLOTS[TIME_SLOTS.length - 1].id;

export function findSlot(id: number): TimeSlot | undefined {
  return TIME_SLOTS.find((s) => s.id === id);
}

// Slots ocupados por uma tarefa
export function getOccupiedSlots(startSlotId: number, duration: number): number[] {
  const slots: number[] = [];
  for (let i = 0; i < duration; i++) {
    const sId = startSlotId + i;
    if (sId <= LAST_SLOT_ID) slots.push(sId);
  }
  return slots;
}

// Validação anticonflito
export function hasConflict(
  newStartSlot: number,
  newDuration: number,
  existingTasks: Task[],
  excludeTaskId?: string
): boolean {
  const newSlots = new Set(getOccupiedSlots(newStartSlot, newDuration));
  for (const task of existingTasks) {
    if (excludeTaskId && task.id === excludeTaskId) continue;
    const occupied = getOccupiedSlots(task.bloco_inicio_id, task.quantidade_blocos);
    if (occupied.some((slot) => newSlots.has(slot))) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────
// Helpers de data (sempre no fuso horário LOCAL do usuário —
// evita o bug clássico do toISOString() pular um dia)
// ────────────────────────────────────────────────────────────

export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte 'YYYY-MM-DD' em Date ao meio-dia local (imune a fuso/DST) */
export function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Ex.: "sábado, 12 de julho" */
export function formatDisplayDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function shiftDate(iso: string, deltaDays: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + deltaDays);
  return getLocalDateString(d);
}

// ────────────────────────────────────────────────────────────
// Categorias
// ────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  label: string;
  color: string;
  soft: string;
}

export const CATEGORIES: Category[] = [
  { id: 'pessoal',  label: 'Pessoal',  color: '#c2688c', soft: '#f8e4ec' },
  { id: 'trabalho', label: 'Trabalho', color: '#a583c9', soft: '#f0e8f8' },
  { id: 'saude',    label: 'Saúde',    color: '#6fae7f', soft: '#e6f3e9' },
  { id: 'casa',     label: 'Casa',     color: '#c9a24b', soft: '#f8efdd' },
  { id: 'estudos',  label: 'Estudos',  color: '#7a9ec9', soft: '#e7eef7' },
];

export function getCategory(id?: string | null): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

// ────────────────────────────────────────────────────────────
// Recorrência
// ────────────────────────────────────────────────────────────

export type Recurrence = 'nenhuma' | 'diaria' | 'semanal';

export const RECURRENCE_OPTIONS: { id: Recurrence; label: string; hint: string }[] = [
  { id: 'nenhuma', label: 'Não repetir', hint: '' },
  { id: 'diaria',  label: 'Todos os dias', hint: 'pelos próximos 30 dias' },
  { id: 'semanal', label: 'Toda semana', hint: 'pelas próximas 12 semanas' },
];

/** Gera as datas de uma série recorrente (inclui a data inicial) */
export function getRecurrenceDates(startIso: string, recurrence: Recurrence): string[] {
  if (recurrence === 'diaria') {
    return Array.from({ length: 30 }, (_, i) => shiftDate(startIso, i));
  }
  if (recurrence === 'semanal') {
    return Array.from({ length: 12 }, (_, i) => shiftDate(startIso, i * 7));
  }
  return [startIso];
}

// ────────────────────────────────────────────────────────────
// Semana (segunda a domingo)
// ────────────────────────────────────────────────────────────

export const WEEKDAY_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // seg..dom

export function getWeekStart(iso: string): string {
  const d = parseLocalDate(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return getLocalDateString(d);
}

export function getWeekDays(iso: string): string[] {
  const start = getWeekStart(iso);
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}
