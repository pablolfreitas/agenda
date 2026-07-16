import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import type { Task } from '../../utils/timeSlots';
import {
  CATEGORIES,
  WEEKDAY_LETTERS,
  findSlot,
  formatDisplayDate,
  getCategory,
  getLocalDateString,
  getWeekDays,
  getWeekStart,
  parseLocalDate,
  shiftDate,
  getTaskDurationMinutes,
} from '../../utils/timeSlots';
import { TaskFormInline } from '../TaskFormInline/TaskFormInline';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flower2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Timer,
  X,
} from 'lucide-react';
import './Dashboard.css';

interface DashboardProps {
  onSignOut: () => void;
  openCreateTrigger?: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function buildGoogleCalendarUrl(task: Task, date: string): string | null {
  const slot = findSlot(task.bloco_inicio_id);
  const endSlot = findSlot(task.bloco_inicio_id + task.quantidade_blocos - 1);
  if (!slot || !endSlot) return null;

  const formatDT = (dateStr: string, timeStr: string) =>
    `${dateStr.replace(/-/g, '')}T${timeStr.replace(/:/g, '')}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.titulo,
    dates: `${formatDT(date, slot.start)}/${formatDT(date, endSlot.end === '00:00' ? '23:59' : endSlot.end)}`,
    details: task.descricao || '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Traduz erros técnicos do banco em orientação amigável */
function friendlyDbError(msg: string): string {
  if (msg.includes('categoria') || msg.includes('serie_id')) {
    return 'O banco precisa ser atualizado: execute o arquivo migracao_v2.sql no SQL Editor do Supabase.';
  }
  return msg;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSignOut, openCreateTrigger }) => {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [weekTasks, setWeekTasks] = useState<Task[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [isAndroid] = useState(() => /android/i.test(navigator.userAgent));

  const defaultInitialSlot = 9;
  const isToday = selectedDate === getLocalDateString();
  const weekStart = getWeekStart(selectedDate);
  const weekDays = getWeekDays(selectedDate);

  const handleSelectDate = (date: string | ((prev: string) => string)) => {
    setExpandedId(null);
    setSelectedDate(date);
  };

  // ─────────────── Buscar tarefas da semana ───────────────
  const fetchWeek = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setFetchError(false);
    const days = getWeekDays(weekStart);
    const { data, error } = await supabase
      .from('tarefas')
      .select('*')
      .gte('data_agendamento', days[0])
      .lte('data_agendamento', days[6])
      .order('bloco_inicio_id', { ascending: true });

    if (error) {
      console.error('Erro ao buscar tarefas:', error.message);
      setFetchError(true);
      setWeekTasks([]);
    } else {
      setWeekTasks(data ?? []);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWeek();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchWeek]);

  // ─────────────── Formulário ───────────────
  const openCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  useEffect(() => {
    if (openCreateTrigger && openCreateTrigger > 0) {
      const timer = setTimeout(() => {
        openCreate();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [openCreateTrigger]);

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingTask(null);
  };

  // ─────────────── CRUD ───────────────
  const handleCreateTasks = async (taskList: Omit<Task, 'id' | 'usuario_id'>[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Sessão expirada. Entre novamente.');

    const rows = taskList.map((t) => ({ ...t, usuario_id: session.user.id }));
    const { error } = await supabase.from('tarefas').insert(rows);
    if (error) throw new Error(friendlyDbError(error.message));
    await fetchWeek();
  };

  const handleUpdateTask = async (id: string, taskData: Omit<Task, 'id' | 'usuario_id'>) => {
    const { error } = await supabase.from('tarefas').update(taskData).eq('id', id);
    if (error) throw new Error(friendlyDbError(error.message));
    await fetchWeek();
  };

  const handleToggleConcluida = async (task: Task) => {
    // Atualização otimista: a interface responde na hora
    setWeekTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, concluida: !t.concluida } : t))
    );
    const { error } = await supabase
      .from('tarefas')
      .update({ concluida: !task.concluida })
      .eq('id', task.id);
    if (error) fetchWeek(); // desfaz em caso de falha
  };

  const handleDeleteTask = async (task: Task) => {
    if (!task.id) return;
    if (!window.confirm('Deseja realmente excluir esta tarefa?')) return;

    if (
      task.serie_id &&
      window.confirm('Esta tarefa se repete. Excluir também as próximas repetições?')
    ) {
      const { error } = await supabase
        .from('tarefas')
        .delete()
        .eq('serie_id', task.serie_id)
        .gte('data_agendamento', task.data_agendamento);
      if (!error) await fetchWeek();
    } else {
      const { error } = await supabase.from('tarefas').delete().eq('id', task.id);
      if (!error) setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  // ─────────────── Derivados ───────────────
  const dayTasks = weekTasks.filter((t) => t.data_agendamento === selectedDate);
  const completedCount = dayTasks.filter((t) => t.concluida).length;
  const progressPct =
    dayTasks.length > 0 ? Math.round((completedCount / dayTasks.length) * 100) : 0;

  const weekDone = weekTasks.filter((t) => t.concluida).length;
  const weekPct =
    weekTasks.length > 0 ? Math.round((weekDone / weekTasks.length) * 100) : 0;

  const catStats = CATEGORIES.map((c) => {
    const inCat = weekTasks.filter((t) => (t.categoria ?? 'pessoal') === c.id);
    return { ...c, total: inCat.length, done: inCat.filter((t) => t.concluida).length };
  }).filter((c) => c.total > 0);

  const monthLabel = parseLocalDate(selectedDate).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const taskRows = dayTasks.map((task) => ({
    task,
    startSlot: findSlot(task.bloco_inicio_id),
    endSlot: findSlot(task.bloco_inicio_id + task.quantidade_blocos - 1),
  }));

  return (
    <div className="dashboard-container">
      <main className="main-content">
        {/* Header */}
        <header className="app-header">
          <div className="header-brand">
            {formOpen ? (
              <button className="btn-back" onClick={closeForm}>
                <ChevronLeft size={18} />
                Voltar
              </button>
            ) : (
              <span className="brand-mark">
                <Flower2 size={20} className="brand-flower" />
                Néctar
              </span>
            )}
          </div>
          <button className="btn-logout" onClick={onSignOut} title="Sair">
            <LogOut size={18} />
          </button>
        </header>

        {formOpen ? (
          /* ─── Página de criação / edição ─── */
          <div className="create-page card">
            <div className="create-header">
              <h2>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <p className="create-subtitle">{formatDisplayDate(selectedDate)}</p>
            </div>
            <TaskFormInline
              key={editingTask?.id ?? 'nova'}
              selectedDate={selectedDate}
              existingTasks={dayTasks}
              editingTask={editingTask}
              onCreate={async (list) => {
                await handleCreateTasks(list);
                closeForm();
              }}
              onUpdate={async (id, data) => {
                await handleUpdateTask(id, data);
                closeForm();
              }}
              onCancel={closeForm}
              defaultInitialSlot={defaultInitialSlot}
            />
          </div>
        ) : (
          /* ─── Layout principal ─── */
          <div className="day-layout">
            {/* Saudação */}
            <section className="greeting-block">
              <h1 className="greeting-title">{getGreeting()} ✿</h1>
              <p className="greeting-date">{formatDisplayDate(selectedDate)}</p>
            </section>

            {/* Visão da semana */}
            <div className="week-strip card">
              <div className="week-strip-header">
                <button
                  className="date-nav-arrow"
                  onClick={() => handleSelectDate((d) => shiftDate(d, -7))}
                  aria-label="Semana anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="week-strip-title">
                  <span className="week-month">{monthLabel}</span>
                  {!isToday && (
                    <button
                      className="btn-today-chip"
                      onClick={() => handleSelectDate(getLocalDateString())}
                    >
                      Voltar para hoje
                    </button>
                  )}
                </div>
                <button
                  className="date-nav-arrow"
                  onClick={() => handleSelectDate((d) => shiftDate(d, 7))}
                  aria-label="Próxima semana"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="week-days">
                {weekDays.map((iso, i) => {
                  const dTasks = weekTasks.filter((t) => t.data_agendamento === iso);
                  const allDone = dTasks.length > 0 && dTasks.every((t) => t.concluida);
                  const isSelected = iso === selectedDate;
                  const isTodayDay = iso === getLocalDateString();
                  return (
                    <button
                      key={iso}
                      className={[
                        'week-day',
                        isSelected ? 'selected' : '',
                        isTodayDay ? 'today' : '',
                      ].join(' ')}
                      onClick={() => handleSelectDate(iso)}
                      aria-label={formatDisplayDate(iso)}
                    >
                      <span className="week-day-letter">{WEEKDAY_LETTERS[i]}</span>
                      <span className="week-day-num">
                        {parseLocalDate(iso).getDate()}
                      </span>
                      <span
                        className={[
                          'week-day-dot',
                          dTasks.length > 0 ? 'visible' : '',
                          allDone ? 'done' : '',
                        ].join(' ')}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Progresso do dia */}
            {dayTasks.length > 0 && (
              <div className="progress-card card">
                <div className="progress-text">
                  <span className="progress-label">
                    {completedCount === dayTasks.length
                      ? 'Dia concluído, você arrasou! ✨'
                      : `${completedCount} de ${dayTasks.length} concluída${dayTasks.length > 1 ? 's' : ''}`}
                  </span>
                  <span className="progress-pct">{progressPct}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            {/* Timeline */}
            <section className="timeline card">
              <div className="timeline-header">
                <h2>Tarefas do dia</h2>
                <button className="btn-add" onClick={openCreate}>
                  <Plus size={16} />
                  Nova
                </button>
              </div>

              {loading ? (
                <div className="empty-state">
                  <div className="loading-dots" aria-label="Carregando">
                    <span /><span /><span />
                  </div>
                </div>
              ) : fetchError ? (
                <div className="empty-state">
                  <div className="empty-icon">🌧️</div>
                  <h4>Não foi possível carregar</h4>
                  <p>Verifique sua conexão e tente novamente.</p>
                  <button
                    className="btn-add-empty"
                    onClick={() => { setLoading(true); fetchWeek(); }}
                  >
                    Tentar de novo
                  </button>
                </div>
              ) : dayTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🌸</div>
                  <h4>Um dia em branco, cheio de possibilidades</h4>
                  <p>Reserve um tempinho para o que importa.</p>
                  <button className="btn-add-empty" onClick={openCreate}>
                    <Plus size={16} />
                    Planejar meu dia
                  </button>
                </div>
              ) : (
                <div className="timeline-list">
                  {taskRows.map(({ task, startSlot, endSlot }) => {
                    const gcalUrl = buildGoogleCalendarUrl(task, selectedDate);
                    const hasDetails = Boolean(task.descricao && task.descricao.trim());
                    const isExpanded = expandedId === task.id;
                    const cat = getCategory(task.categoria);
                    return (
                      <div key={task.id} className="timeline-row">
                        <div className="row-time">
                          <span className="time-start">{startSlot?.start ?? '--:--'}</span>
                          <span className="time-line" />
                          <span className="time-end">{endSlot?.end ?? '--:--'}</span>
                        </div>

                        <div
                          className={[
                            'task-card',
                            task.concluida ? 'completed' : '',
                            hasDetails ? 'clickable' : '',
                            isExpanded ? 'expanded' : '',
                          ].join(' ')}
                          style={{ borderLeftColor: task.concluida ? undefined : cat.color }}
                          onClick={() =>
                            hasDetails && setExpandedId(isExpanded ? null : task.id ?? null)
                          }
                          role={hasDetails ? 'button' : undefined}
                          aria-expanded={hasDetails ? isExpanded : undefined}
                        >
                          <button
                            className={`check-circle ${task.concluida ? 'checked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleConcluida(task);
                            }}
                            title={task.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
                            aria-pressed={task.concluida}
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>

                          <div className="task-info">
                            <span className="task-title">{task.titulo}</span>
                            <span className="task-meta">
                              <span className="task-duration">
                                <Clock size={11} />
                                {startSlot?.start} – {endSlot?.end}
                              </span>
                              <span
                                className="cat-badge"
                                style={{ background: cat.soft, color: cat.color }}
                              >
                                {cat.label}
                              </span>
                              {task.serie_id && (
                                <span className="serie-badge" title="Tarefa recorrente">
                                  ↻
                                </span>
                              )}
                            </span>
                            {hasDetails && (
                              <button
                                className="btn-details-hint"
                                onClick={(e) => { e.stopPropagation(); setDetailTask(task); }}
                              >
                                <ChevronDown size={13} />
                                ver anotação
                              </button>
                            )}
                          </div>

                          <div className="task-actions">
                            <button
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(task);
                              }}
                              title="Editar tarefa"
                            >
                              <Pencil size={16} />
                            </button>
                            {isAndroid && (
                              <button
                                className="btn-icon"
                                title={`Timer: ${getTaskDurationMinutes(task.bloco_inicio_id, task.quantidade_blocos)} min`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const sec = getTaskDurationMinutes(task.bloco_inicio_id, task.quantidade_blocos) * 60;
                                  window.location.href = `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${sec};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(task.titulo)};end`;
                                }}
                              >
                                <Timer size={16} />
                              </button>
                            )}
                            {gcalUrl && (
                              <a
                                href={gcalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-icon"
                                title="Adicionar ao Google Agenda"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CalendarPlus size={16} />
                              </a>
                            )}
                            <button
                              className="btn-icon btn-icon-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task);
                              }}
                              title="Excluir tarefa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Resumo da semana */}
            {weekTasks.length > 0 && (
              <section className="week-summary card">
                <div className="week-summary-header">
                  <h3>Resumo da semana</h3>
                  <span className="progress-pct">{weekPct}%</span>
                </div>
                <p className="week-summary-text">
                  {weekPct === 100
                    ? `Semana impecável: todas as ${weekTasks.length} tarefas concluídas! 🌟`
                    : `Você concluiu ${weekDone} de ${weekTasks.length} tarefa${weekTasks.length > 1 ? 's' : ''} esta semana.`}
                </p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${weekPct}%` }} />
                </div>
                {catStats.length > 0 && (
                  <div className="week-cat-stats">
                    {catStats.map((c) => (
                      <span
                        key={c.id}
                        className="cat-badge"
                        style={{ background: c.soft, color: c.color }}
                      >
                        {c.label}: {c.done}/{c.total}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Modal de detalhes da tarefa */}
      {detailTask && (
        <div className="detail-modal-overlay" onClick={() => setDetailTask(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <span
                className="cat-badge"
                style={{
                  background: getCategory(detailTask.categoria).soft,
                  color: getCategory(detailTask.categoria).color,
                }}
              >
                {getCategory(detailTask.categoria).label}
              </span>
              <button className="detail-modal-close" onClick={() => setDetailTask(null)}>
                <X size={18} />
              </button>
            </div>
            <h3 className="detail-modal-title">{detailTask.titulo}</h3>
            <p className="detail-modal-desc">{detailTask.descricao}</p>
          </div>
        </div>
      )}
    </div>
  );
};
