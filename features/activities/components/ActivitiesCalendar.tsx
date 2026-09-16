import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Phone, Users, Mail, CheckSquare } from 'lucide-react';
import { Activity, Deal } from '@/types';
import { useIsBelowMd } from '../hooks/useIsBelowMd';

interface ActivitiesCalendarProps {
    activities: Activity[];
    deals: Deal[];
    currentDate: Date;
    setCurrentDate: (date: Date) => void;
    /** Abre a visualização somente leitura ao clicar num evento (Pedido do fundador, 2026-08-11). */
    onView: (activity: Activity) => void;
}

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9); // 9:00 to 18:00
const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cor sólida do ícone por tipo na lista do dia (mobile). */
const MOBILE_ICON_BG: Partial<Record<Activity['type'], string>> = {
    CALL: 'bg-blue-500',
    MEETING: 'bg-purple-500',
    EMAIL: 'bg-green-500',
    TASK: 'bg-orange-500',
};

/**
 * Componente React `ActivitiesCalendar`.
 *
 * @param {ActivitiesCalendarProps} {
    activities,
    deals,
    currentDate,
    setCurrentDate
} - Parâmetro `{
    activities,
    deals,
    currentDate,
    setCurrentDate
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesCalendar: React.FC<ActivitiesCalendarProps> = ({
    activities,
    deals,
    currentDate,
    setCurrentDate,
    onView,
}) => {
    const getWeekStart = (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    };

    const weekStart = getWeekStart(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        return date;
    });

    const prevWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const nextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const isBelowMd = useIsBelowMd();
    // Mobile (< md): dia da semana selecionado na faixa de dias (0 = Dom).
    const [selectedWeekday, setSelectedWeekday] = useState(() => currentDate.getDay());

    const goToToday = () => {
        const today = new Date();
        setCurrentDate(today);
        setSelectedWeekday(today.getDay());
    };

    const getActivityIcon = (type: Activity['type']) => {
        switch (type) {
            case 'CALL': return <Phone size={14} className="text-white" />;
            case 'MEETING': return <Users size={14} className="text-white" />;
            case 'EMAIL': return <Mail size={14} className="text-white" />;
            case 'TASK': return <CheckSquare size={14} className="text-white" />;
        }
    };

    const getActivityGradient = (type: Activity['type']) => {
        switch (type) {
            case 'CALL': return 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/70 border-blue-400';
            case 'MEETING': return 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 border-purple-400';
            case 'EMAIL': return 'bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/50 hover:shadow-green-500/70 border-green-400';
            case 'TASK': return 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/50 hover:shadow-orange-500/70 border-orange-400';
        }
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isOverdue = (activity: Activity) => {
        return new Date(activity.date) < new Date() && !activity.completed;
    };

    // Performance: grid chama `getActivitiesForDateTime` muitas vezes.
    // Indexamos atividades por (YYYY-MM-DD|hour) uma vez para evitar filters repetidos.
    const activitiesByDayHour = useMemo(() => {
        const map = new Map<string, Activity[]>();
        for (const a of activities) {
            const d = new Date(a.date);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${d.getHours()}`;
            const list = map.get(key);
            if (list) list.push(a);
            else map.set(key, [a]);
        }
        return map;
    }, [activities]);

    // Performance: evitar `deals.find` em hover/tooltips.
    const dealTitleById = useMemo(() => {
        const map = new Map<string, string>();
        for (const d of deals) map.set(d.id, d.title);
        return map;
    }, [deals]);

    // Mobile: atividades do dia inteiro (não só 9h–18h da grade), ordenadas por horário.
    const activitiesByDay = useMemo(() => {
        const map = new Map<string, Activity[]>();
        for (const a of activities) {
            const d = new Date(a.date);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const list = map.get(key);
            if (list) list.push(a);
            else map.set(key, [a]);
        }
        for (const list of map.values()) {
            list.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
        }
        return map;
    }, [activities]);

    const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    return (
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-xl">
            {/* Header */}
            <div className="p-3 md:p-6 border-b border-slate-200 dark:border-white/10 flex flex-wrap gap-2 justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50">
                <div className="flex min-w-0 items-center gap-2 md:gap-4">
                    <h2 className="font-bold text-lg md:text-2xl text-slate-900 dark:text-white font-display capitalize md:normal-case">
                        {weekStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button
                        onClick={goToToday}
                        className="px-3 md:px-4 py-2 text-sm font-bold bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 hover:scale-105"
                    >
                        <CalendarIcon size={14} />
                        Hoje
                    </button>
                </div>
                <div className="flex gap-1 md:gap-2">
                    <button onClick={prevWeek} aria-label="Semana anterior" className="p-2.5 md:p-3 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-110">
                        <ChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
                    </button>
                    <button onClick={nextWeek} aria-label="Próxima semana" className="p-2.5 md:p-3 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-110">
                        <ChevronRight size={20} className="text-slate-600 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            {/*
              Grid template: coluna de hora tem largura fixa pequena (só precisa
              caber "9:00") e as 7 colunas de dia dividem o restante igualmente.
              Antes usava `grid-cols-8` (8 colunas iguais), o que dava à coluna de
              hora o mesmo espaço de uma coluna de dia inteira — desperdiçando
              espaço horizontal e deixando as colunas de dia mais estreitas do
              que precisavam ser. `overflow-x-auto` (não `overflow-auto`) evita
              scroll vertical interno desnecessário; o `min-w` cai para o mínimo
              que ainda mantém as colunas legíveis em telas bem estreitas.
            */}
            {isBelowMd ? (
                <div>
                    {/* Mobile: faixa de dias da semana + lista do dia selecionado */}
                    <div className="grid grid-cols-7 gap-1 p-2 border-b border-slate-200 dark:border-white/10" role="group" aria-label="Dias da semana">
                        {weekDays.map((date, i) => {
                            const isSelected = selectedWeekday === i;
                            const hasActivities = (activitiesByDay.get(dayKey(date))?.length ?? 0) > 0;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setSelectedWeekday(i)}
                                    aria-pressed={isSelected}
                                    aria-label={date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    className={`flex flex-col items-center rounded-xl py-2 transition-colors ${isSelected
                                        ? 'bg-primary-600 text-white'
                                        : isToday(date)
                                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                                            : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                >
                                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{DAYS_OF_WEEK[date.getDay()]}</span>
                                    <span className="text-base font-black font-display leading-tight">{date.getDate()}</span>
                                    <span
                                        aria-hidden="true"
                                        className={`mt-0.5 h-1 w-1 rounded-full ${hasActivities ? (isSelected ? 'bg-white' : 'bg-primary-500') : 'bg-transparent'}`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {(() => {
                        const selectedDate = weekDays[selectedWeekday] ?? weekDays[0];
                        const dayActivities = activitiesByDay.get(dayKey(selectedDate)) ?? [];
                        if (dayActivities.length === 0) {
                            return (
                                <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                                    Nenhuma atividade neste dia.
                                </p>
                            );
                        }
                        return (
                            <ul className="space-y-2 p-3">
                                {dayActivities.map(activity => (
                                    <li key={activity.id}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => onView(activity)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    onView(activity);
                                                }
                                            }}
                                            className={`flex items-start gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card p-3 cursor-pointer ${activity.completed ? 'opacity-60' : ''}`}
                                        >
                                            <div className={`shrink-0 rounded-lg p-1.5 ${MOBILE_ICON_BG[activity.type] ?? 'bg-slate-500'}`}>
                                                {getActivityIcon(activity.type)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                                    {new Date(activity.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    {isOverdue(activity) && (
                                                        <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded-full">
                                                            ATRASADO
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`break-words font-semibold text-slate-900 dark:text-white ${activity.completed ? 'line-through' : ''}`}>
                                                    {activity.title}
                                                </div>
                                                {activity.dealId && dealTitleById.get(activity.dealId) && (
                                                    <div className="truncate text-xs text-primary-600 dark:text-primary-400">
                                                        {dealTitleById.get(activity.dealId)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        );
                    })()}
                </div>
            ) : (
            <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                    {/* Day Headers */}
                    <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200 dark:border-white/10 sticky top-0 bg-white dark:bg-dark-card z-10 shadow-sm">
                        <div className="p-3 text-xs font-bold text-slate-500 uppercase bg-slate-50 dark:bg-white/5"></div>
                        {weekDays.map((date, i) => (
                            <div
                                key={i}
                                className={`p-4 text-center border-l border-slate-200 dark:border-white/10 transition-all ${isToday(date)
                                        ? 'bg-gradient-to-b from-primary-50 to-primary-100 dark:from-primary-500/20 dark:to-primary-500/10'
                                        : 'bg-slate-50 dark:bg-white/5'
                                    }`}
                            >
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    {DAYS_OF_WEEK[date.getDay()]}
                                </div>
                                <div className={`text-2xl font-black mt-1 font-display ${isToday(date)
                                        ? 'text-primary-600 dark:text-primary-400'
                                        : 'text-slate-900 dark:text-white'
                                    }`}>
                                    {date.getDate()}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Time Slots */}
                    {HOURS.map(hour => (
                        <div key={hour} className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200 dark:border-white/5">
                            <div className="p-3 text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 text-right pr-4">
                                {hour}:00
                            </div>
                            {weekDays.map((date, i) => {
                                const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}|${hour}`;
                                const hourActivities = activitiesByDayHour.get(key) ?? [];
                                return (
                                    <div
                                        key={i}
                                        className={`min-h-[70px] p-2 border-l border-slate-200 dark:border-white/10 transition-colors ${isToday(date)
                                                ? 'bg-primary-50/20 dark:bg-primary-500/5'
                                                : ''
                                            }`}
                                    >
                                        <div className="space-y-2">
                                            {hourActivities.map(activity => (
                                                <div
                                                    key={activity.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onView(activity)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            onView(activity);
                                                        }
                                                    }}
                                                    className={`
                                                        group relative
                                                        text-xs p-3 rounded-xl border-2
                                                        ${getActivityGradient(activity.type)}
                                                        ${activity.completed ? 'opacity-50 saturate-50' : ''}
                                                        ${isOverdue(activity) && !activity.completed ? 'ring-2 ring-red-500 ring-offset-2 dark:ring-offset-slate-900' : ''}
                                                        transition-all duration-300
                                                        hover:scale-105 hover:-translate-y-1
                                                        cursor-pointer
                                                        overflow-hidden
                                                    `}
                                                    title={`${activity.title} - ${activity.dealId ? (dealTitleById.get(activity.dealId) ?? '') : ''}`}
                                                >
                                                    {/* Shine effect on hover */}
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>

                                                    <div className="relative z-10">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="p-1 bg-white/20 rounded-md">
                                                                {getActivityIcon(activity.type)}
                                                            </div>
                                                            <span className="font-black text-white text-sm">
                                                                {new Date(activity.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <div className={`font-bold text-white leading-tight ${activity.completed ? 'line-through' : ''}`}>
                                                            {activity.title}
                                                        </div>

                                                        {/* Hover Expanded Info */}
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 mt-2 pt-2 border-t border-white/20">
                                                            <p className="text-xs text-white/90 leading-relaxed">
                                                                {activity.description}
                                                            </p>
                                                            <p className="text-xs text-white/80 mt-1 font-medium">
                                                                📎 {activity.dealId ? (dealTitleById.get(activity.dealId) ?? 'Sem deal vinculado') : 'Sem deal vinculado'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            )}
        </div>
    );
};
