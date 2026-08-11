import { ActivityPriority, ActivityStatus, TimeSphere } from '@/types';

/**
 * Opções/labels compartilhados entre `ActivityFormModal`, `ActivityDetailModal`
 * e a visão Kanban (Central de Tarefas) — extraído para evitar 3 cópias da
 * mesma lista de status/prioridade/Tríade do Tempo (cada componente tinha
 * sua própria antes desta extração).
 */

export const STATUS_OPTIONS: { value: ActivityStatus; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
];

export const PRIORITY_OPTIONS: { value: ActivityPriority; label: string }[] = [
  { value: 'none', label: 'Sem prioridade' },
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export const TIME_SPHERE_OPTIONS: { value: TimeSphere | ''; label: string }[] = [
  { value: '', label: 'Nenhuma' },
  { value: 'importante', label: 'Importante' },
  { value: 'urgente', label: 'Urgente' },
  { value: 'circunstancial', label: 'Circunstancial' },
];

const buildLabelMap = <T extends string>(options: { value: T; label: string }[]) =>
  new Map(options.map((opt) => [opt.value, opt.label]));

const STATUS_LABEL_MAP = buildLabelMap(STATUS_OPTIONS);
const PRIORITY_LABEL_MAP = buildLabelMap(PRIORITY_OPTIONS);
const TIME_SPHERE_LABEL_MAP = buildLabelMap(
  TIME_SPHERE_OPTIONS.filter((opt) => opt.value !== '') as { value: TimeSphere; label: string }[]
);

export const getStatusLabel = (status?: ActivityStatus): string =>
  (status && STATUS_LABEL_MAP.get(status)) || STATUS_LABEL_MAP.get('todo') || 'A fazer';

export const getPriorityLabel = (priority?: ActivityPriority): string =>
  (priority && PRIORITY_LABEL_MAP.get(priority)) || PRIORITY_LABEL_MAP.get('none') || 'Sem prioridade';

export const getTimeSphereLabel = (timeSphere?: TimeSphere): string | undefined =>
  timeSphere ? TIME_SPHERE_LABEL_MAP.get(timeSphere) : undefined;

/** Colunas do Kanban por status (Central de Tarefas, Fase 2 antecipada). */
export const KANBAN_COLUMNS: { key: ActivityStatus; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'todo', label: 'A Fazer' },
  { key: 'in_progress', label: 'Em Andamento' },
  { key: 'done', label: 'Concluído' },
];
