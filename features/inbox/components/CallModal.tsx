import React, { useState, useEffect } from 'react';
import { X, Phone, PhoneOff, Check, XCircle, Voicemail, Clock, FileText, Copy, ExternalLink } from 'lucide-react';
import { normalizePhoneE164 } from '@/lib/phone';

interface CallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CallLogData) => void;
    contactName: string;
    contactPhone: string;
    suggestedTitle?: string;
}

export interface CallLogData {
    outcome: 'connected' | 'no_answer' | 'voicemail' | 'busy';
    duration: number; // in seconds
    notes: string;
    title: string;
}

/**
 * Componente React `CallModal`.
 *
 * @param {CallModalProps} {
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
} - Parâmetro `{
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const CallModal: React.FC<CallModalProps> = ({
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
}) => {
    const [openedAt, setOpenedAt] = useState<Date | null>(null);
    const [dialerOpenedAt, setDialerOpenedAt] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [outcome, setOutcome] = useState<CallLogData['outcome'] | null>(null);
    const [notes, setNotes] = useState('');
    const [title, setTitle] = useState(suggestedTitle);
    const [copied, setCopied] = useState(false);

    const phone = normalizePhoneE164(contactPhone);

    // Reset state when opening the modal (so it behaves like a fresh log each time).
    useEffect(() => {
        if (!isOpen) return;

        setOpenedAt(new Date());
        setDialerOpenedAt(null);
        setElapsedTime(0);
        setOutcome(null);
        setNotes('');
        setTitle(suggestedTitle);
        setCopied(false);
    }, [isOpen, suggestedTitle]);

    // Timer effect: without WebRTC we don't know call lifecycle, so we start counting only
    // after the user explicitly opens the OS dialer.
    useEffect(() => {
        if (!isOpen) return;
        if (!dialerOpenedAt) return;

        const interval = setInterval(() => {
            setElapsedTime(Math.floor((new Date().getTime() - dialerOpenedAt.getTime()) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen, dialerOpenedAt]);

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSave = () => {
        if (!outcome) return;

        onSave({
            outcome,
            duration: elapsedTime,
            notes,
            title
        });
        onClose();
    };

    const handleDiscard = () => {
        onClose();
    };

    const handleCopyPhone = async () => {
        if (!phone) return;
        try {
            await navigator.clipboard.writeText(phone);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    const handleOpenPhoneApp = () => {
        if (!phone) return;
        if (!dialerOpenedAt) {
            setDialerOpenedAt(new Date());
        }
        // Explicit user action: open the OS dialer/app.
        window.open(`tel:${phone}`, '_self');
    };

    if (!isOpen) return null;

    const outcomeOptions = [
        { id: 'connected', label: 'Atendeu', icon: Check, color: 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30' },
        { id: 'no_answer', label: 'Não atendeu', icon: XCircle, color: 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30' },
        { id: 'voicemail', label: 'Caixa postal', icon: Voicemail, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30' },
        { id: 'busy', label: 'Ocupado', icon: PhoneOff, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30 hover:bg-slate-500/30' },
    ] as const;

    return (
        <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center pt-[var(--app-safe-area-top,0px)] pb-[var(--app-safe-area-bottom,0px)]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDiscard} />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[90dvh] flex flex-col">
                {/* Header */}
                <div className="bg-linear-to-r from-yellow-500/10 to-orange-500/10 p-4 border-b border-slate-700/50 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-yellow-500/20 rounded-xl">
                                <Phone size={20} className="text-yellow-400" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-semibold text-white truncate">{contactName}</h3>
                                <div className="mt-0.5 flex items-center gap-2">
                                    <p className="text-xs text-slate-400">{phone || ''}</p>
                                    {phone && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleCopyPhone}
                                                className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                                title={copied ? 'Copiado' : 'Copiar número'}
                                                aria-label={copied ? 'Copiado' : 'Copiar número'}
                                            >
                                                <Copy size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleOpenPhoneApp}
                                                className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                                title="Abrir no discador"
                                                aria-label="Abrir no discador"
                                            >
                                                <ExternalLink size={12} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleDiscard}
                            className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                            aria-label="Fechar"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Timer */}
                <div className="flex items-center justify-center py-4 sm:py-6 px-4 bg-slate-800/50 shrink-0">
                    <div className="flex flex-col items-center gap-2 px-6 py-3 bg-slate-900 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-3">
                            <Clock size={18} className="text-yellow-400" />
                            <span className="text-2xl font-mono font-bold text-white tracking-wider">
                                {formatTime(dialerOpenedAt ? elapsedTime : 0)}
                            </span>
                        </div>
                        <div className="text-[11px] text-slate-400 text-center">
                            {!phone ? (
                                'Sem número de telefone para discar.'
                            ) : dialerOpenedAt ? (
                                'Tempo desde abrir o discador (a chamada acontece fora do CRM).'
                            ) : (
                                'Abra o discador para iniciar a contagem.'
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto">
                    {/* Outcome Selection */}
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                            Resultado da ligação
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {outcomeOptions.map(({ id, label, icon: Icon, color }) => (
                                <button
                                    key={id}
                                    onClick={() => setOutcome(id)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-sm font-medium ${outcome === id
                                            ? color + ' ring-2 ring-current'
                                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600'
                                        }`}
                                >
                                    <Icon size={16} />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">
                            Título da atividade
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 text-sm"
                            placeholder="Ex: Ligação de follow-up"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FileText size={12} />
                            Notas da ligação
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="O que foi discutido? Próximos passos?"
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 text-sm resize-y min-h-40 max-h-[40vh]"
                            rows={6}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700/50 flex flex-col sm:flex-row gap-2 shrink-0">
                    <button
                        onClick={handleDiscard}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        Descartar
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyPhone}
                        disabled={!phone}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title={copied ? 'Copiado' : 'Copiar número'}
                    >
                        <Copy size={16} />
                        {copied ? 'Copiado' : 'Copiar número'}
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenPhoneApp}
                        disabled={!phone}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title="Abrir no discador"
                    >
                        <ExternalLink size={16} />
                        Abrir no discador
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!outcome}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Check size={16} />
                        Salvar Log
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CallModal;
