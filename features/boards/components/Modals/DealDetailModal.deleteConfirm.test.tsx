import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DealDetailModal } from './DealDetailModal';

// Regression test for a real bug: the outer FocusTrap wrapping this modal
// (lib/a11y/components/FocusTrap.tsx, backed by focus-trap-react) used to
// stay active while the delete-confirmation dialog (ConfirmDialog, built on
// Radix AlertDialog) was open. Radix teleports that dialog's content via
// Portal to document.body — outside the FocusTrap's own DOM container — so
// the trap treated every click inside it as an "outside click" and silently
// swallowed it: the dialog rendered and its buttons showed hover states, but
// neither "Cancelar" nor "Excluir" did anything.
//
// Unlike DealDetailModal.test.tsx, this file deliberately does NOT mock
// `@/lib/a11y` — it needs the real FocusTrap (and real focus-trap-react +
// Radix AlertDialog) to exercise the actual browser-facing behavior.

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/hooks/useResponsiveMode', () => ({
  useResponsiveMode: () => ({ mode: 'desktop' }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', role: 'admin', email: 'test@example.com', organization_id: 'org-1' },
  }),
}));

const addToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: { enabled?: boolean }) => {
      if (options.enabled === false) {
        return {
          data: [{
            id: 'deal-1',
            title: 'Pequeno Chapéu',
            value: 1000,
            status: 'stage-1',
            boardId: 'board-1',
            contactId: 'contact-1',
            companyName: 'Moreira Comércio',
            contactName: 'Fulano',
            contactEmail: 'fulano@example.com',
            stageLabel: 'Novo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            probability: 50,
            priority: 'medium',
            owner: { name: 'Eu', avatar: '' },
            tags: [],
            items: [],
            customFields: {},
            isWon: false,
            isLost: false,
          }],
          isLoading: false,
        };
      }
      return { data: [], isLoading: false };
    },
  };
});

const deleteDealMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/query/hooks', () => ({
  useMoveDealSimple: () => ({ moveDeal: vi.fn() }),
  useContacts: () => ({ data: [], isLoading: false }),
  useActivities: () => ({ data: [], isLoading: false }),
  useBoards: () => ({ data: [], isLoading: false }),
  useLifecycleStages: () => ({ data: [], isLoading: false }),
  useUpdateDeal: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteDeal: () => ({ mutate: vi.fn(), mutateAsync: deleteDealMutateAsync, isPending: false }),
  useAddDealItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRemoveDealItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/query/hooks/useProductsQuery', () => ({
  useActiveProducts: () => ({ data: [] }),
}));

vi.mock('@/store/uiState', () => ({
  useUIState: () => ({ activeBoardId: 'board-1' }),
}));

vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initial: unknown) => [initial, vi.fn()],
}));

vi.mock('@/components/ui/LossReasonModal', () => ({
  LossReasonModal: () => null,
}));

vi.mock('../DealSheet', () => ({
  DealSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../StageProgressBar', () => ({
  StageProgressBar: () => null,
}));

vi.mock('@/features/activities/components/ActivityRow', () => ({
  ActivityRow: () => null,
}));

vi.mock('@/lib/ai/tasksClient', () => ({
  analyzeLead: vi.fn(),
  generateEmailDraft: vi.fn(),
  generateObjectionResponse: vi.fn(),
}));

vi.mock('@/features/deals/components/BriefingDrawer', () => ({
  BriefingDrawer: () => null,
}));

vi.mock('@/features/deals/components/AIExtractedFields', () => ({
  AIExtractedFields: () => null,
}));

describe('DealDetailModal — delete confirmation dialog', () => {
  beforeEach(() => {
    deleteDealMutateAsync.mockClear();
    addToast.mockClear();
  });

  it('clicking "Excluir" in the confirmation dialog actually deletes the deal and closes the modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DealDetailModal dealId="deal-1" isOpen={true} onClose={onClose} />);

    await user.click(screen.getByLabelText('Excluir negócio'));

    const confirmButton = await screen.findByRole('button', { name: 'Excluir' });
    await user.click(confirmButton);

    expect(deleteDealMutateAsync).toHaveBeenCalledWith('deal-1');
    expect(onClose).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('Negócio excluído com sucesso', 'success');
  });

  it('clicking "Cancelar" in the confirmation dialog closes it without deleting anything', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DealDetailModal dealId="deal-1" isOpen={true} onClose={onClose} />);

    await user.click(screen.getByLabelText('Excluir negócio'));
    await screen.findByRole('button', { name: 'Excluir' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(deleteDealMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Excluir Negócio')).not.toBeInTheDocument();
  });
});
