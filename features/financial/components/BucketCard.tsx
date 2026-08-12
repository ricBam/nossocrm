import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, Archive } from 'lucide-react';
import { formatBRL } from '@/lib/utils/formatCurrency';
import type { FinancialBucket } from '@/types';

interface BucketCardProps {
  bucket: FinancialBucket;
  onDeposit: () => void;
  onWithdraw: () => void;
  onArchive: () => void;
}

export const BucketCard: React.FC<BucketCardProps> = ({ bucket, onDeposit, onWithdraw, onArchive }) => {
  const progress = bucket.goalAmount && bucket.goalAmount > 0
    ? Math.min(100, (bucket.balance / bucket.goalAmount) * 100)
    : null;

  return (
    <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{bucket.name}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white font-display">{formatBRL(bucket.balance)}</p>
        </div>
        <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: bucket.color }} aria-hidden="true" />
      </div>

      {progress !== null && (
        <div>
          <div className="h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: bucket.color }} />
          </div>
          <p className="text-xs text-slate-500 mt-1">Meta: {formatBRL(bucket.goalAmount!)}</p>
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button onClick={onDeposit} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-success-text bg-success-bg rounded-lg">
          <ArrowUpCircle size={14} /> Aporte
        </button>
        <button onClick={onWithdraw} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-error-text bg-error-bg rounded-lg">
          <ArrowDownCircle size={14} /> Retirar
        </button>
        <button onClick={onArchive} className="px-2 text-slate-400 hover:text-slate-600" aria-label="Arquivar cofrinho">
          <Archive size={14} />
        </button>
      </div>
    </div>
  );
};

export default BucketCard;
