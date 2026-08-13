'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  useFinancialBuckets,
  useCreateFinancialBucket,
  useArchiveFinancialBucket,
  useCreateBucketMovement,
} from '@/lib/query/hooks/useFinancialQuery';
import { Plus, Lock } from 'lucide-react';
import { BucketCard } from './components/BucketCard';
import { BucketFormModal } from './components/BucketFormModal';
import { BucketMovementModal } from './components/BucketMovementModal';
import { FinancialSubNav } from './components/FinancialSubNav';
import type { FinancialBucket } from '@/types';

const CofrinhosPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const { data: buckets = [], isLoading } = useFinancialBuckets();
  const createBucket = useCreateFinancialBucket();
  const archiveBucket = useArchiveFinancialBucket();
  const createMovement = useCreateBucketMovement();

  const [isBucketModalOpen, setIsBucketModalOpen] = React.useState(false);
  const [movementTarget, setMovementTarget] = React.useState<{ bucket: FinancialBucket; mode: 'deposit' | 'withdraw' } | null>(null);

  if (!authLoading && profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <Lock size={32} className="text-slate-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Acesso restrito</h1>
      </div>
    );
  }

  const handleCreateBucket = (data: Parameters<typeof createBucket.mutate>[0]) => {
    createBucket.mutate(data, {
      onSuccess: () => {
        addToast('Cofrinho criado', 'success');
        setIsBucketModalOpen(false);
      },
      onError: () => addToast('Erro ao criar cofrinho', 'error'),
    });
  };

  const handleArchive = (id: string) => {
    if (!window.confirm('Arquivar este cofrinho?')) return;
    archiveBucket.mutate(id, {
      onSuccess: () => addToast('Cofrinho arquivado', 'success'),
      onError: () => addToast('Erro ao arquivar cofrinho', 'error'),
    });
  };

  const handleMovement = (data: { amount: number; note?: string; date: string }) => {
    if (!movementTarget) return;
    createMovement.mutate({ bucketId: movementTarget.bucket.id, ...data }, {
      onSuccess: () => {
        addToast(movementTarget.mode === 'deposit' ? 'Aporte registrado' : 'Retirada registrada', 'success');
        setMovementTarget(null);
      },
      onError: () => addToast('Erro ao registrar movimento', 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">Cofrinhos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reservas de dinheiro com metas.</p>
        </div>
        <button
          onClick={() => setIsBucketModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg"
        >
          <Plus size={16} /> Novo cofrinho
        </button>
      </div>

      <FinancialSubNav />

      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!isLoading && buckets.length === 0 && <p className="text-sm text-slate-400">Nenhum cofrinho criado ainda.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {buckets.map(bucket => (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            onDeposit={() => setMovementTarget({ bucket, mode: 'deposit' })}
            onWithdraw={() => setMovementTarget({ bucket, mode: 'withdraw' })}
            onArchive={() => handleArchive(bucket.id)}
          />
        ))}
      </div>

      <BucketFormModal
        isOpen={isBucketModalOpen}
        onClose={() => setIsBucketModalOpen(false)}
        onSubmit={handleCreateBucket}
        isSubmitting={createBucket.isPending}
      />
      {movementTarget && (
        <BucketMovementModal
          isOpen={!!movementTarget}
          onClose={() => setMovementTarget(null)}
          mode={movementTarget.mode}
          bucketName={movementTarget.bucket.name}
          onSubmit={handleMovement}
          isSubmitting={createMovement.isPending}
        />
      )}
    </div>
  );
};

export default CofrinhosPage;
