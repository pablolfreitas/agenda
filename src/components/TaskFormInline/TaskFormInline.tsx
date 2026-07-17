import React, { useState, useEffect } from 'react';
import {
  TIME_SLOTS,
  CATEGORIES,
  RECURRENCE_OPTIONS,
  findSlot,
  getOccupiedSlots,
  getRecurrenceDates,
  hasConflict,
} from '../../utils/timeSlots';
import type { Task, Recurrence } from '../../utils/timeSlots';
import { supabase } from '../../services/supabaseClient';
import { financeService } from '../../services/financeService';

interface TaskFormInlineProps {
  selectedDate: string;
  existingTasks: Task[];
  /** Quando presente, o formulário edita esta tarefa em vez de criar */
  editingTask?: Task | null;
  onCreate: (tasks: Omit<Task, 'id' | 'usuario_id'>[]) => Promise<void>;
  onUpdate: (id: string, task: Omit<Task, 'id' | 'usuario_id'>) => Promise<void>;
  onCancel: () => void;
  defaultInitialSlot: number;
}

export const TaskFormInline: React.FC<TaskFormInlineProps> = ({
  selectedDate,
  existingTasks,
  editingTask = null,
  onCreate,
  onUpdate,
  onCancel,
  defaultInitialSlot,
}) => {
  const isEditing = Boolean(editingTask?.id);
  const [definirHorario, setDefinirHorario] = useState(
    editingTask ? editingTask.bloco_inicio_id !== 0 : true
  );

  interface ConnectionFriend {
    id: string;
    email: string;
  }

  const [activeFriends, setActiveFriends] = useState<ConnectionFriend[]>([]);
  const [agendaDestino, setAgendaDestino] = useState<'minha' | string>('minha');

  interface ConexaoDb {
    id: string;
    solicitante_id: string;
    solicitante_email: string;
    receptor_email: string;
    receptor_id: string | null;
    status: 'pendente' | 'aceito' | 'bloqueado';
  }

  useEffect(() => {
    const fetchFriends = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const currentId = session.user.id;

      const list = (await financeService.getConexoes()) as ConexaoDb[];
      const accepted = list.filter((c) => c.status === 'aceito');
      const friends: ConnectionFriend[] = accepted.map((c) => {
        const isSol = c.solicitante_id === currentId;
        return {
          id: isSol ? c.receptor_id || '' : c.solicitante_id,
          email: isSol ? c.receptor_email : c.solicitante_email
        };
      }).filter(f => f.id !== '');

      setActiveFriends(friends);
    };

    fetchFriends();
  }, []);

  const [titulo, setTitulo] = useState(editingTask?.titulo ?? '');
  const [descricao, setDescricao] = useState(editingTask?.descricao ?? '');
  const [categoria, setCategoria] = useState(editingTask?.categoria ?? 'pessoal');
  const [recorrencia, setRecorrencia] = useState<Recurrence>('nenhuma');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mapa de slots ocupados (ignora a própria tarefa ao editar)
  const occupiedSlotsMap = new Set<number>();
  existingTasks.forEach((t) => {
    if (isEditing && t.id === editingTask?.id) return;
    getOccupiedSlots(t.bloco_inicio_id, t.quantidade_blocos).forEach((s) =>
      occupiedSlotsMap.add(s)
    );
  });

  const freeStartSlots = TIME_SLOTS.filter((s) => !occupiedSlotsMap.has(s.id));
  const dayIsFull = freeStartSlots.length === 0;

  // Slot inicial: da tarefa em edição, do padrão se livre, ou o primeiro livre
  const fallbackFreeSlot = freeStartSlots[0] ?? TIME_SLOTS[0];
  const requestedInitialSlot = isEditing && editingTask!.bloco_inicio_id !== 0
    ? findSlot(editingTask!.bloco_inicio_id)
    : TIME_SLOTS.find((s) => s.id === defaultInitialSlot);
  const initialStartSlot =
    requestedInitialSlot && !occupiedSlotsMap.has(requestedInitialSlot.id)
      ? requestedInitialSlot
      : fallbackFreeSlot;
  const initialEndSlot = isEditing && editingTask!.bloco_inicio_id !== 0
    ? findSlot(editingTask!.bloco_inicio_id + editingTask!.quantidade_blocos - 1) ??
      initialStartSlot
    : initialStartSlot;

  const [startHour, setStartHour] = useState(initialStartSlot.start.split(':')[0]);
  const [startMinute, setStartMinute] = useState(initialStartSlot.start.split(':')[1]);
  const [endHour, setEndHour] = useState(initialEndSlot.end.split(':')[0]);
  const [endMinute, setEndMinute] = useState(initialEndSlot.end.split(':')[1]);

  // Slot de início correspondente à seleção atual
  const matchedStartSlot =
    TIME_SLOTS.find((s) => s.start === `${startHour}:${startMinute}`) || initialStartSlot;
  const blocoInicioId = matchedStartSlot.id;

  // Slots de fim válidos (fim >= início)
  const allowedEndSlots = TIME_SLOTS.filter((s) => s.id >= blocoInicioId);

  const isEndValid = allowedEndSlots.some((s) => s.end === `${endHour}:${endMinute}`);
  const activeEndHour = isEndValid ? endHour : allowedEndSlots[0].end.split(':')[0];
  const activeEndMinute = isEndValid ? endMinute : allowedEndSlots[0].end.split(':')[1];

  const matchedEndSlot =
    allowedEndSlots.find((s) => s.end === `${activeEndHour}:${activeEndMinute}`) ||
    allowedEndSlots[0];
  const quantidadeBlocos = matchedEndSlot.id - blocoInicioId + 1;

  // Todos os blocos entre início e fim precisam estar livres
  const isEndSlotFreeFor = (startSlotId: number, endSlotId: number) => {
    for (let id = startSlotId; id <= endSlotId; id++) {
      if (occupiedSlotsMap.has(id)) return false;
    }
    return true;
  };
  const isEndSlotFree = (endSlotId: number) => isEndSlotFreeFor(blocoInicioId, endSlotId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanTitle = titulo.trim();
    if (!cleanTitle) {
      setErrorMsg('Dê um nome à sua tarefa.');
      return;
    }

    if (definirHorario && hasConflict(blocoInicioId, quantidadeBlocos, existingTasks, editingTask?.id)) {
      setErrorMsg('Esse horário já está reservado. Escolha outro intervalo.');
      return;
    }

    const base: Omit<Task, 'id' | 'usuario_id'> = {
      data_agendamento: selectedDate,
      bloco_inicio_id: definirHorario ? blocoInicioId : 0,
      quantidade_blocos: definirHorario ? quantidadeBlocos : 1,
      titulo: cleanTitle,
      descricao: descricao.trim(),
      concluida: editingTask?.concluida ?? false,
      categoria,
      serie_id: editingTask?.serie_id ?? null,
    };

    setLoading(true);
    try {
      if (agendaDestino === 'minha') {
        if (isEditing && editingTask?.id) {
          await onUpdate(editingTask.id, base);
        } else if (recorrencia === 'nenhuma') {
          await onCreate([base]);
        } else {
          const serieId = crypto.randomUUID();
          const dates = getRecurrenceDates(selectedDate, recorrencia);
          await onCreate(
            dates.map((d) => ({ ...base, data_agendamento: d, serie_id: serieId }))
          );
        }
      } else {
        if (isEditing) {
          throw new Error('Não é possível mover tarefas existentes para a agenda de amigos.');
        }
        if (recorrencia !== 'nenhuma') {
          throw new Error('Não é possível definir recorrência para lembretes enviados.');
        }
        const res = await financeService.criarTarefaCompartilhada(
          agendaDestino,
          selectedDate,
          base.bloco_inicio_id,
          base.quantidade_blocos,
          base.titulo,
          base.descricao || '',
          base.categoria || 'pessoal'
        );
        if (!res.ok) {
          throw new Error(res.erro || 'Erro ao enviar lembrete.');
        }
        alert('Lembrete enviado com sucesso para a agenda do seu amigo!');
        onCancel();
      }
      setTitulo('');
      setDescricao('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar tarefa.');
    } finally {
      setLoading(false);
    }
  };

  // Listas de horas/minutos livres para início
  const startHoursList = Array.from(
    new Set(freeStartSlots.map((s) => s.start.split(':')[0]))
  ).sort();

  const startMinutesList = freeStartSlots
    .filter((s) => s.start.startsWith(`${startHour}:`))
    .map((s) => s.start.split(':')[1]);

  // Listas de horas/minutos livres para fim
  const freeAllowedEndSlots = allowedEndSlots.filter((s) => isEndSlotFree(s.id));

  const endHoursList = Array.from(
    new Set(freeAllowedEndSlots.map((s) => s.end.split(':')[0]))
  ).sort();

  const endMinutesList = freeAllowedEndSlots
    .filter((s) => s.end.startsWith(`${activeEndHour}:`))
    .map((s) => s.end.split(':')[1]);

  const adjustEndForStart = (hour: string, min: string) => {
    const nextStartSlot =
      TIME_SLOTS.find((s) => s.start === `${hour}:${min}`) || initialStartSlot;
    const nextAllowedEnd = TIME_SLOTS.filter(
      (s) => s.id >= nextStartSlot.id && isEndSlotFreeFor(nextStartSlot.id, s.id)
    );
    if (nextAllowedEnd.length === 0) return;
    const endStillValid = nextAllowedEnd.some(
      (s) => s.end === `${activeEndHour}:${activeEndMinute}`
    );
    if (!endStillValid) {
      setEndHour(nextAllowedEnd[0].end.split(':')[0]);
      setEndMinute(nextAllowedEnd[0].end.split(':')[1]);
    }
  };

  const handleStartHourChange = (hour: string) => {
    const availableMins = freeStartSlots
      .filter((s) => s.start.startsWith(`${hour}:`))
      .map((s) => s.start.split(':')[1]);
    if (availableMins.length === 0) return;

    const nextMin = availableMins.includes(startMinute) ? startMinute : availableMins[0];
    setStartHour(hour);
    setStartMinute(nextMin);
    adjustEndForStart(hour, nextMin);
  };

  const handleStartMinuteChange = (min: string) => {
    setStartMinute(min);
    adjustEndForStart(startHour, min);
  };

  const handleEndHourChange = (hour: string) => {
    const availableMins = freeAllowedEndSlots
      .filter((s) => s.end.startsWith(`${hour}:`))
      .map((s) => s.end.split(':')[1]);
    if (availableMins.length === 0) return;

    setEndHour(hour);
    setEndMinute(availableMins.includes(activeEndMinute) ? activeEndMinute : availableMins[0]);
  };

  if (dayIsFull && !isEditing) {
    return (
      <div className="day-full-notice">
        <div className="empty-icon">🌷</div>
        <h4>Seu dia já está completo</h4>
        <p>Todos os horários deste dia estão preenchidos. Que organização!</p>
        <button type="button" onClick={onCancel} className="btn-cancel">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="inline-form">
      {/* Título */}
      <div className="form-group">
        <label htmlFor="inline-titulo">O que você vai fazer?</label>
        <input
          id="inline-titulo"
          type="text"
          required
          maxLength={120}
          placeholder="Ex: Aula de pilates, reunião, café com a Ana..."
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
      </div>

      {/* Onde salvar esta tarefa? (Apenas ao criar) */}
      {!isEditing && activeFriends.length > 0 && (
        <div className="form-group">
          <label htmlFor="inline-destino">Onde salvar esta tarefa?</label>
          <select
            id="inline-destino"
            value={agendaDestino}
            onChange={(e) => setAgendaDestino(e.target.value)}
            className="time-select"
            style={{ width: '100%' }}
          >
            <option value="minha">Minha Agenda</option>
            {activeFriends.map((f) => (
              <option key={f.id} value={f.id}>
                Agenda de: {f.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Categoria */}
      <div className="form-group">
        <label>Categoria</label>
        <div className="chip-row">
          {CATEGORIES.map((c) => {
            const active = categoria === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`chip ${active ? 'active' : ''}`}
                style={
                  active
                    ? { background: c.soft, borderColor: c.color, color: c.color }
                    : undefined
                }
                onClick={() => setCategoria(c.id)}
              >
                <span className="chip-dot" style={{ background: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Descrição */}
      <div className="form-group">
        <label htmlFor="inline-desc">Alguma anotação? (opcional)</label>
        <textarea
          id="inline-desc"
          placeholder="Detalhes, endereço, lembrete pessoal..."
          maxLength={500}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      {/* Opção de horário */}
      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={!definirHorario}
            onChange={(e) => setDefinirHorario(!e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            Tarefa do dia (sem horário específico)
          </span>
        </label>
      </div>

      {/* Horários */}
      {definirHorario && (
        <div className="form-row">
          <div className="form-group">
            <label>Começa às</label>
            <div className="time-select-pair">
              <select
                value={startHour}
                onChange={(e) => handleStartHourChange(e.target.value)}
                className="time-select"
                aria-label="Hora de início"
              >
                {startHoursList.map((h) => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
              <span className="time-separator">:</span>
              <select
                value={startMinute}
                onChange={(e) => handleStartMinuteChange(e.target.value)}
                className="time-select"
                aria-label="Minuto de início"
              >
                {startMinutesList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Termina às</label>
            <div className="time-select-pair">
              <select
                value={activeEndHour}
                onChange={(e) => handleEndHourChange(e.target.value)}
                className="time-select"
                aria-label="Hora de fim"
              >
                {endHoursList.map((h) => (
                  <option key={h} value={h}>
                    {h === '00' ? '00h (meia-noite)' : `${h}h`}
                  </option>
                ))}
              </select>
              <span className="time-separator">:</span>
              <select
                value={activeEndMinute}
                onChange={(e) => setEndMinute(e.target.value)}
                className="time-select"
                aria-label="Minuto de fim"
              >
                {endMinutesList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Preview do horário */}
      {definirHorario && (
        <div className="time-preview">
          <span className="time-preview-range">
            {startHour}:{startMinute} → {activeEndHour}:{activeEndMinute}
          </span>
          <span className="time-preview-duration">
            {(() => {
              const toMin = (h: string, m: string) => Number(h) * 60 + Number(m);
              const startMin = toMin(startHour, startMinute);
              let endMin = toMin(activeEndHour, activeEndMinute);
              if (endMin <= startMin) endMin += 24 * 60;
              const total = endMin - startMin;
              if (total < 60) return `${total} min`;
              const h = Math.floor(total / 60);
              const m = total % 60;
              return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
            })()}
          </span>
        </div>
      )}

      {/* Recorrência (apenas ao criar) */}
      {!isEditing && (
        <div className="form-group">
          <label>Repetir</label>
          <div className="chip-row">
            {RECURRENCE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip ${recorrencia === opt.id ? 'active accent' : ''}`}
                onClick={() => setRecorrencia(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {recorrencia !== 'nenhuma' && (
            <p className="field-hint">
              Será criada no mesmo horário{' '}
              {RECURRENCE_OPTIONS.find((o) => o.id === recorrencia)?.hint}.
            </p>
          )}
        </div>
      )}


      {errorMsg && <div className="message error">{errorMsg}</div>}

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-cancel">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="btn-submit">
          {loading ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar tarefa'}
        </button>
      </div>
    </form>
  );
};
