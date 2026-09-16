'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MessageSquare, User, CheckCircle, MoreVertical, LinkIcon, Trash2, RotateCcw, Search, ArrowLeft, Info, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ConversationList } from './components/ConversationList';
import { MessageThread } from './components/MessageThread';
import { MessageInput } from './components/MessageInput';
import { ContactPanel } from './components/ContactPanel';
import { ContactLinkModal } from './components/Modals/ContactLinkModal';
import { ChannelIndicator } from './components/ChannelIndicator';
import { WindowExpiryBadge } from './components/WindowExpiryBadge';
import { MessageSearchBar } from './components/MessageSearchBar';
import { AssignmentDropdown } from './components/AssignmentDropdown';
import {
  useConversation,
  useMarkConversationRead,
  useResolveConversation,
  useReopenConversation,
  useDeleteConversation,
  addPendingDeletion,
  removePendingDeletion,
} from '@/lib/query/hooks/useConversationsQuery';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Modal } from '@/components/ui/Modal';
import { FullscreenSheet } from '@/components/ui/FullscreenSheet';
import { useRealtimeSyncMessaging } from '@/lib/realtime/useRealtimeSync';
import { queryKeys } from '@/lib/query';
import { useContactPresence } from '@/lib/messaging/hooks/useContactPresence';
import type { ConversationView } from '@/lib/messaging/types';

interface MessagingPageProps {
  initialConversationId?: string;
}

export function MessagingPage({ initialConversationId }: MessagingPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('id');
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { getPresence } = useContactPresence();

  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    initialConversationId || conversationIdParam || undefined
  );
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<import('@/lib/messaging/types').MessagingMessage | null>(null);

  // Subscribe to realtime updates
  useRealtimeSyncMessaging();

  // Fetch selected conversation details
  const { data: selectedConversation, isLoading: isConversationLoading } = useConversation(selectedConversationId);

  // Mutations
  const { mutate: markAsRead } = useMarkConversationRead();
  const { mutate: resolveConversation } = useResolveConversation();
  const { mutate: reopenConversation } = useReopenConversation();
  const { mutate: deleteConversation, isPending: isDeleting } = useDeleteConversation();

  // Handle delete conversation
  const handleDeleteConversation = useCallback(() => {
    if (!selectedConversationId) return;

    const idToDelete = selectedConversationId;
    // Mark as pending deletion BEFORE any state updates so the select filter in
    // useConversations immediately starts filtering this ID. This prevents stale
    // refetches (e.g. from markAsRead.onSettled) from re-adding the conversation
    // to the list while the delete mutation is in-flight.
    addPendingDeletion(idToDelete);
    // Safety fallback: if the realtime DELETE event never arrives (network issue, etc.),
    // ensure the guard is eventually cleared so the pending-deletion filter doesn't persist.
    setTimeout(() => removePendingDeletion(idToDelete), 10_000);
    // Clear selection immediately so useConversation becomes disabled (enabled: false)
    // before invalidation or realtime events trigger a refetch of the deleted conversation
    setSelectedConversationId(undefined);
    setShowDeleteConfirm(false);
    router.push('/messaging', { scroll: false });

    // Cancel in-flight refetches so they don't overwrite the optimistic removal below
    queryClient.cancelQueries({ queryKey: queryKeys.messagingConversations.all });

    // Optimistically remove from list cache immediately
    queryClient.setQueriesData(
      { queryKey: queryKeys.messagingConversations.all },
      (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as ConversationView[]).filter((conv) => conv.id !== idToDelete);
      }
    );

    deleteConversation(idToDelete);
  }, [selectedConversationId, deleteConversation, router, queryClient]);

  // Clear URL if conversation was deleted or not found
  useEffect(() => {
    if (selectedConversationId && selectedConversation === null && !isConversationLoading) {
      setSelectedConversationId(undefined);
      router.replace('/messaging', { scroll: false });
    }
  }, [selectedConversationId, selectedConversation, isConversationLoading, router]);

  // Mark as read when opening a conversation
  useEffect(() => {
    if (selectedConversationId && selectedConversation && selectedConversation.unreadCount > 0) {
      markAsRead(selectedConversationId);
    }
  }, [selectedConversationId, selectedConversation, markAsRead]);


  // Keep selection in sync with the `?id=` param so browser back/forward
  // (e.g. the Android back gesture on mobile) returns to the list.
  // Adjusting state during render avoids an extra effect pass.
  const [prevConversationIdParam, setPrevConversationIdParam] = useState(conversationIdParam);
  if (conversationIdParam !== prevConversationIdParam) {
    setPrevConversationIdParam(conversationIdParam);
    setSelectedConversationId(conversationIdParam || undefined);
    setShowSearch(false);
    setIsContactSheetOpen(false);
  }

  // Whether the current selection added a history entry we can pop on "Voltar".
  const pushedSelectionRef = useRef(false);
  // Set when "Buscar mensagens" is picked from the overflow menu, so the menu
  // does not steal focus back from the search input when it closes.
  const focusSearchOnCloseRef = useRef(false);

  // Update URL when conversation changes
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setShowSearch(false);
    pushedSelectionRef.current = true;
    router.push(`/messaging?id=${id}`, { scroll: false });
  }, [router]);

  // Mobile back: return to the conversation list
  const handleBackToList = useCallback(() => {
    setShowSearch(false);
    setIsContactSheetOpen(false);
    if (pushedSelectionRef.current) {
      pushedSelectionRef.current = false;
      router.back();
      return;
    }
    setSelectedConversationId(undefined);
    router.replace('/messaging', { scroll: false });
  }, [router]);

  // Link conversation to contact
  const handleLinkContact = useCallback(async (contactId: string) => {
    if (!selectedConversationId) return;

    const { error } = await supabase
      .from('messaging_conversations')
      .update({ contact_id: contactId })
      .eq('id', selectedConversationId);

    if (error) throw error;

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({
      queryKey: queryKeys.messagingConversations.all,
    });
  }, [selectedConversationId, queryClient]);

  // Create contact and link
  const handleCreateContact = useCallback(async (params: { name: string; phone?: string }) => {
    if (!profile?.organization_id) throw new Error('Organization not found');

    const { data: contact, error: createError } = await supabase
      .from('contacts')
      .insert({
        name: params.name,
        phone: params.phone,
        organization_id: profile.organization_id,
      })
      .select('id')
      .single();

    if (createError) throw createError;
    return contact.id;
  }, [profile?.organization_id]);

  // View contact in CRM
  const handleViewContact = useCallback((contactId: string) => {
    router.push(`/contacts?id=${contactId}`);
  }, [router]);

  // View deals for contact
  const handleViewDeals = useCallback((contactId: string) => {
    router.push(`/boards?contact=${contactId}`);
  }, [router]);

  return (
    <div className="h-full flex pb-[calc(var(--app-bottom-nav-height,0px)+var(--app-safe-area-bottom,0px))]">
      {/* Conversation List — on mobile it is hidden while a conversation is open */}
      <div
        className={cn(
          'w-full md:w-80 flex-shrink-0 min-h-0',
          selectedConversationId && 'hidden md:block'
        )}
      >
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          getPresence={getPresence}
        />
      </div>

      {/* Message Thread — on mobile it is only shown when a conversation is selected */}
      <div
        className={cn(
          'flex-1 min-w-0 min-h-0 flex-col bg-slate-50 dark:bg-slate-900/50',
          selectedConversationId ? 'flex' : 'hidden md:flex'
        )}
      >
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="h-16 px-2 md:px-4 flex items-center gap-2 md:gap-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={handleBackToList}
                aria-label="Voltar"
                title="Voltar"
                className="md:hidden flex-shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="relative flex-shrink-0">
                {sanitizeUrl(selectedConversation.externalContactAvatar) ? (
                  <img
                    src={sanitizeUrl(selectedConversation.externalContactAvatar)}
                    alt={selectedConversation.externalContactName || 'Contato'}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5">
                  <ChannelIndicator type={selectedConversation.channelType} size="sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-900 dark:text-white truncate">
                  {selectedConversation.contactName || selectedConversation.externalContactName || 'Contato desconhecido'}
                </h2>
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {selectedConversation.channelName}
                  </p>
                  <WindowExpiryBadge
                    windowExpiresAt={selectedConversation.windowExpiresAt}
                    variant="inline"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                <AssignmentDropdown
                  conversationId={selectedConversation.id}
                  assignedUserId={selectedConversation.assignedUserId}
                />
                <button
                  type="button"
                  onClick={() => setShowSearch((v) => !v)}
                  className={cn(
                    'hidden md:inline-flex p-2 rounded-lg transition-colors',
                    showSearch
                      ? 'text-primary-500 bg-primary-50 dark:bg-primary-500/10'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  )}
                  title="Buscar mensagens"
                >
                  <Search className="w-5 h-5" />
                </button>
                {selectedConversation.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => resolveConversation(selectedConversation.id)}
                    className="hidden md:inline-flex p-2 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                    title="Marcar como resolvida"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                )}
                {!selectedConversation.contactId && (
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(true)}
                    className="hidden md:inline-flex p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
                    title="Vincular contato"
                  >
                    <LinkIcon className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="hidden md:inline-flex p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Excluir conversa"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                {/* Contact details — the side panel is only a column on xl+ */}
                <button
                  type="button"
                  onClick={() => setIsContactSheetOpen(true)}
                  className="xl:hidden p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  title="Dados do contato"
                  aria-label="Dados do contato"
                >
                  <Info className="w-5 h-5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                      aria-label="Mais ações"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48"
                    onCloseAutoFocus={(e) => {
                      // Let the search input keep focus when opened from this menu
                      if (focusSearchOnCloseRef.current) {
                        focusSearchOnCloseRef.current = false;
                        e.preventDefault();
                      }
                    }}
                  >
                    {/* Mobile-only: actions that are icon buttons on md+ */}
                    <DropdownMenuItem
                      onClick={() => {
                        focusSearchOnCloseRef.current = !showSearch;
                        setShowSearch((v) => !v);
                      }}
                      className="gap-2 md:hidden"
                    >
                      <Search className="w-4 h-4" />
                      {showSearch ? 'Fechar busca' : 'Buscar mensagens'}
                    </DropdownMenuItem>
                    {selectedConversation.status === 'open' && (
                      <DropdownMenuItem
                        onClick={() => resolveConversation(selectedConversation.id)}
                        className="gap-2 md:hidden"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Marcar como resolvida
                      </DropdownMenuItem>
                    )}
                    {!selectedConversation.contactId && (
                      <DropdownMenuItem
                        onClick={() => setIsLinkModalOpen(true)}
                        className="gap-2 md:hidden"
                      >
                        <LinkIcon className="w-4 h-4" />
                        Vincular contato
                      </DropdownMenuItem>
                    )}
                    {selectedConversation.status === 'resolved' && (
                      <DropdownMenuItem
                        onClick={() => reopenConversation(selectedConversation.id)}
                        className="gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reabrir conversa
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteConfirm(true)}
                      className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir conversa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Search Bar */}
            {showSearch && (
              <MessageSearchBar
                conversationId={selectedConversation.id}
                onClose={() => setShowSearch(false)}
              />
            )}

            {/* Messages */}
            <MessageThread
              conversationId={selectedConversation.id}
              presenceStatus={selectedConversation.contactId ? getPresence(selectedConversation.contactId) : undefined}
              onReply={setReplyToMessage}
            />

            {/* Input */}
            <MessageInput
              conversation={selectedConversation}
              replyTo={replyToMessage}
              onCancelReply={() => setReplyToMessage(null)}
            />
          </>
        ) : selectedConversationId && isConversationLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando conversa" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">Selecione uma conversa</p>
            <p className="text-sm">Escolha uma conversa da lista para visualizar</p>
          </div>
        )}
      </div>

      {/* Contact Panel — column on xl+ */}
      <div className="hidden xl:block w-80 border-l border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex-shrink-0">
        <ContactPanel
          conversation={selectedConversation}
          isLoading={isConversationLoading && !!selectedConversationId}
          onLinkContact={() => setIsLinkModalOpen(true)}
          onViewContact={handleViewContact}
          onViewDeals={handleViewDeals}
        />
      </div>

      {/* Contact Panel — fullscreen sheet below xl */}
      <FullscreenSheet
        isOpen={isContactSheetOpen && !!selectedConversationId}
        onClose={() => setIsContactSheetOpen(false)}
        title="Dados do contato"
      >
        <div className="-mx-4 -my-4">
          <ContactPanel
            conversation={selectedConversation}
            isLoading={isConversationLoading && !!selectedConversationId}
            onLinkContact={() => {
              setIsContactSheetOpen(false);
              setIsLinkModalOpen(true);
            }}
            onViewContact={handleViewContact}
            onViewDeals={handleViewDeals}
          />
        </div>
      </FullscreenSheet>

      {/* Contact Link Modal */}
      <ContactLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onLinkContact={handleLinkContact}
        onCreateContact={handleCreateContact}
        currentContactId={selectedConversation?.contactId}
        suggestedPhone={selectedConversation?.contactPhone || undefined}
        suggestedName={selectedConversation?.externalContactName || undefined}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Excluir conversa"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            Tem certeza que deseja excluir esta conversa? Todas as mensagens serão perdidas permanentemente.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
