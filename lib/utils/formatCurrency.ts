import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(value: number): string {
  return BRL_FORMATTER.format(value);
}

export function formatDateBR(dateStr: string): string {
  return format(new Date(`${dateStr}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR });
}
