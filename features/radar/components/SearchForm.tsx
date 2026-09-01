'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CostEstimate, isSearchAllowed } from './CostEstimate';
import type { BudgetSnapshot, RadarSearchVars } from '@/lib/query/hooks/useRadarQuery';

/**
 * Quantidades oferecidas na tela: 10 a 100, de 10 em 10.
 *
 * A rota aceita a partir de 1, para permitir teste barato em desenvolvimento,
 * mas a tela não oferece valores menores — abaixo de 10 a busca não rende uma
 * fila de leitura útil. A 100 lugares o custo é de cerca de US$ 0,40.
 */
const RESULT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Nichos do ICP oferecidos como atalho. O campo aceita texto livre. */
const NICHOS_ICP = [
    'clínica odontológica',
    'clínica de estética',
    'pet shop',
    'oficina mecânica',
    'academia',
    'salão de beleza',
    'escritório de contabilidade',
    'imobiliária',
];

export interface SearchFilters {
    semSite: boolean;
    semRedeSocial: boolean;
    notaMin: number | null;
    notaMax: number | null;
    minAvaliacoes: number | null;
    ordenarPor: 'avaliacoes' | 'nota' | 'score';
}

/**
 * Formulário de busca.
 *
 * ⚠️ Nada aqui dispara rede. O estado é local e só o clique em Buscar chama
 * `onSubmit`. Buscar enquanto digita queimaria o teto do mês em minutos.
 */
export function SearchForm({
    budget,
    isSearching,
    filters,
    onFiltersChange,
    onSubmit,
}: {
    budget: BudgetSnapshot | undefined;
    isSearching: boolean;
    filters: SearchFilters;
    onFiltersChange: (f: SearchFilters) => void;
    onSubmit: (vars: RadarSearchVars) => void;
}) {
    const [nicho, setNicho] = useState('');
    const [cidade, setCidade] = useState('');
    const [uf, setUf] = useState('RJ');
    const [maxResults, setMaxResults] = useState(RESULT_OPTIONS[0]);
    const [withContacts, setWithContacts] = useState(false);

    const camposOk = nicho.trim().length > 0 && cidade.trim().length > 0 && uf.trim().length === 2;
    const dentroDoTeto = isSearchAllowed(maxResults, withContacts, budget);
    const podeBuscar = camposOk && dentroDoTeto && !isSearching;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                if (!podeBuscar) return;
                onSubmit({ nicho: nicho.trim(), cidade: cidade.trim(), uf: uf.trim().toUpperCase(), maxResults, withContacts });
            }}
        >
            <div className="space-y-1">
                <Label htmlFor="radar-nicho">Nicho</Label>
                <Input
                    id="radar-nicho"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    placeholder="clínica odontológica"
                    list="radar-nichos-icp"
                />
                <datalist id="radar-nichos-icp">
                    {NICHOS_ICP.map((n) => (
                        <option key={n} value={n} />
                    ))}
                </datalist>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="radar-cidade">Cidade</Label>
                    <Input id="radar-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Resende" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="radar-uf">UF</Label>
                    <Input id="radar-uf" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} />
                </div>
            </div>

            <div className="space-y-1">
                <Label htmlFor="radar-max">Máximo de resultados</Label>
                <select
                    id="radar-max"
                    className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                >
                    {RESULT_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center justify-between">
                <Label htmlFor="radar-contatos" className="text-sm font-normal">
                    Enriquecer contatos pelo site (+US$ 0,002 por empresa)
                </Label>
                <Switch id="radar-contatos" checked={withContacts} onCheckedChange={setWithContacts} />
            </div>

            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-xs text-slate-500 dark:text-slate-400">
                    Filtros de descoberta — ordenam a fila de leitura, não qualificam
                </legend>
                <div className="flex items-center justify-between">
                    <Label htmlFor="radar-sem-site" className="text-sm font-normal">Sem site</Label>
                    <Switch
                        id="radar-sem-site"
                        checked={filters.semSite}
                        onCheckedChange={(v) => onFiltersChange({ ...filters, semSite: v })}
                    />
                </div>
                <div className="flex items-center justify-between">
                    <Label htmlFor="radar-sem-social" className="text-sm font-normal">Sem rede social</Label>
                    <Switch
                        id="radar-sem-social"
                        checked={filters.semRedeSocial}
                        onCheckedChange={(v) => onFiltersChange({ ...filters, semRedeSocial: v })}
                    />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                        <Label htmlFor="radar-nota-min" className="text-xs">Nota mín.</Label>
                        <Input
                            id="radar-nota-min" type="number" step="0.1" min={0} max={5}
                            value={filters.notaMin ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, notaMin: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="radar-nota-max" className="text-xs">Nota máx.</Label>
                        <Input
                            id="radar-nota-max" type="number" step="0.1" min={0} max={5}
                            value={filters.notaMax ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, notaMax: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="radar-min-aval" className="text-xs">Mín. aval.</Label>
                        <Input
                            id="radar-min-aval" type="number" min={0}
                            value={filters.minAvaliacoes ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, minAvaliacoes: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="radar-ordem" className="text-xs">Ordenar por</Label>
                    <select
                        id="radar-ordem"
                        className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                        value={filters.ordenarPor}
                        onChange={(e) => onFiltersChange({ ...filters, ordenarPor: e.target.value as SearchFilters['ordenarPor'] })}
                    >
                        <option value="score">Score</option>
                        <option value="avaliacoes">Número de avaliações</option>
                        <option value="nota">Nota</option>
                    </select>
                </div>
            </fieldset>

            <CostEstimate maxResults={maxResults} withContacts={withContacts} budget={budget} />

            <Button type="submit" disabled={!podeBuscar} className="w-full">
                {isSearching ? 'Buscando…' : 'Buscar'}
            </Button>
        </form>
    );
}
