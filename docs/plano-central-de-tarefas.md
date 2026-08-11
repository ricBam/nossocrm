# Plano técnico — Central de Tarefas (módulo dentro do CRM)

> Status: **plano para aprovação**. Nada deste documento foi implementado.
> Branch de trabalho: `feature/central-de-tarefas` (já existe e está em
> `origin`, criada a partir de `main` em 2026-08-10, sem alterações ainda).

## 0. Contexto e o que NÃO fazer

O fundador trouxe um prompt de referência de um app standalone chamado
"Central de Tarefas IA" (stack: TanStack Start, Vite 7, Supabase próprio,
sem Next.js, sem React Router). Esse prompt é usado **só como inspiração
de produto/UX/modelo de dados** — nada da infraestrutura dele entra no
CRM. O CRM é Next.js 16 (App Router) + Supabase (projeto `nossocrm`) e
tudo abaixo é desenhado para caber nesse stack, reaproveitando os padrões
já estabelecidos (ver `CLAUDE.md` do repo): TanStack Query com
`queryKeys` factory, Zod v4 (já é dependência), Zustand v5 (já usado só
para UI state efêmero, não para dados de servidor), `ToastContext`
(sistema de toast já existente — **não introduzir `sonner`**, o CRM não
usa), shadcn/ui não está confirmado como já instalado — o repo usa
componentes próprios em `components/ui/`, então novos componentes devem
seguir esse padrão existente, não trazer shadcn do zero.

## 1. O que já existe hoje no CRM (achados da investigação)

### 1.1 Tabela `activities` (schema_init, com colunas adicionadas depois)

```sql
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,               -- livre, sem enum/CHECK no banco
    date TIMESTAMPTZ NOT NULL,
    completed BOOLEAN DEFAULT false,  -- único "status" que existe hoje
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,      -- nullable
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL, -- nullable
    deleted_at TIMESTAMPTZ,           -- só usado por cascade de soft-delete
                                       -- de contato; delete manual é hard delete
    created_at TIMESTAMPTZ DEFAULT NOW(),
    owner_id UUID REFERENCES profiles(id),        -- responsável
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    client_company_id UUID,           -- adicionado depois
    participant_contact_ids UUID[]    -- adicionado depois (GIN index)
);
```

Achados relevantes:
- **`deal_id` e `contact_id` já são opcionais.** Ou seja, o conceito de
  "tarefa sem deal" (tarefa pessoal/solta) **já é possível no banco hoje**
  — só não é bem exposto na UI (o formulário atual sempre assume que a
  atividade nasce de um contexto de deal/contato).
- `type` é `TEXT` livre no banco, mas o app trata como union fechada no
  TypeScript: `'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'NOTE' |
  'STATUS_CHANGE'` (`types/types.ts`).
- Único campo de "status" é `completed: boolean`. **Não existe** hoje:
  status granular (inbox/todo/in_progress/done), prioridade, subtarefas,
  checklist, esfera do tempo (importante/urgente/circunstancial),
  posição para ordenação manual, "foco do dia".
- `owner_id` já modela "de quem é a tarefa" dentro da organização — é
  exatamente o campo que o prompt de referência queria resolver com
  `user_id`, mas aqui coexistindo com `organization_id` (o CRM é
  multi-tenant por organização, o app de referência era single-user).
- RLS é **por organização inteira** (`activities_org_isolate`, via
  `get_user_org_id()`), não por usuário — hoje qualquer membro da
  organização vê todas as atividades de todos. Isso é uma decisão de
  modelagem a confirmar com o fundador (ver seção 3).
- Delete é hard delete (`activitiesService.delete()` faz
  `.delete().eq('id', id)` de verdade); `deleted_at` só é setado pelo
  trigger de cascata quando um contato é soft-deletado.
- Tabela já está na publicação `supabase_realtime` — `useRealtimeSync
  ('activities')` já funciona hoje, então qualquer extensão dessa mesma
  tabela ganha Realtime de graça.
- `activitiesService.create/update` já tem um padrão defensivo de retry
  quando uma coluna nova ainda não existe no banco (`code === '42703'`) —
  útil de conhecer, mas não é para replicar em código novo (é uma muleta
  de quando uma migration ainda não tinha sido aplicada em produção).

### 1.2 Tabela `deal_activities` (migration `20260210100003`)

```sql
CREATE TABLE public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

É **log de auditoria do agente de IA**, não algo que o usuário edita.
Confirmado por uso: só é lido/escrito em `lib/ai/agent/agent.service.ts`,
`lib/ai/agent/stage-evaluator.ts`, `lib/ai/agent/secure-tools.ts`,
`lib/ai/agent/hitl-stage-advance.ts`, `app/api/cron/daily-briefing/
route.ts` e no webhook do Meta. Nenhuma tela de CRUD, nenhum hook de
mutation de usuário. **Não é candidata a virar a base da Central de
Tarefas** — é uma tabela de propósito diferente (histórico de ações da
IA em um deal), deve continuar existindo como está.

### 1.3 UI existente (`features/activities/`)

Já existe uma tela `/activities` (`app/(protected)/activities/page.tsx`
→ `ActivitiesPage.tsx`) com:
- Alternância **Lista / Calendário** (`viewMode`), já usando o mesmo
  padrão de toggle que o prompt de referência pede para outras views.
- Filtros por tipo e por data (`overdue` / `today` / `upcoming`),
  inclusive com deep-link `?filter=` vindo do Inbox — equivalente
  simplificado ao que seriam as rotas `/hoje`, `/proximos` do prompt.
- `BulkActionsToolbar` com ações em lote — "concluir todas" funciona de
  verdade, "adiar todas" é um stub que só mostra toast (não persiste
  nada). Achado a corrigir ou substituir na Fase 2/3.
- Toggle de conclusão, edição, exclusão, tudo via
  `lib/query/hooks/useActivitiesQuery.ts` — já segue exatamente o padrão
  de `queryKeys` + optimistic update que o resto do CRM usa
  (`queryKeys.activities.lists()`, `queryKeys.activities.byDeal()`).
- Navegação: item de sidebar `/activities` já existe (`components/
  Layout.tsx`), ícone `CheckSquare`, label "Atividades".

**Conclusão da investigação**: a base certa para a Central de Tarefas é
**estender a tabela e a feature `activities` já existentes**, não criar
um domínio novo do zero. O trabalho de reaproveitamento (RLS, Realtime,
query keys, padrão de service, item de sidebar) já está feito e testado
em produção — jogar isso fora para criar `tasks`/`checklist_items` do
zero replicaria esforço sem necessidade real.

## 2. Decisão de modelagem proposta

**Estender `activities`, não criar tabelas `tasks` novas.**

### 2.1 Colunas novas em `activities`

```sql
-- Enums novos (nomenclatura em inglês para consistência com o resto do schema,
-- que já usa enums em inglês em outras tabelas — ex: task_status/task_priority
-- do prompt de referência adaptados 1:1, só sem o nome de tabela "task_*")
CREATE TYPE public.activity_status AS ENUM ('inbox', 'todo', 'in_progress', 'done');
CREATE TYPE public.activity_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');
CREATE TYPE public.time_sphere AS ENUM ('importante', 'urgente', 'circunstancial');

ALTER TABLE public.activities
  ADD COLUMN status activity_status NOT NULL DEFAULT 'todo',
  -- 'todo' como default (não 'inbox') para não quebrar as ~N atividades
  -- existentes: elas já têm due date e dono, não fazem sentido "na caixa
  -- de entrada" retroativamente. Registros novos criados sem due date
  -- podem setar 'inbox' explicitamente na tela de criação rápida.
  ADD COLUMN priority activity_priority NOT NULL DEFAULT 'none',
  ADD COLUMN time_sphere time_sphere,             -- nullable, opcional
  ADD COLUMN is_focus_today BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN parent_activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  ADD COLUMN position DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN start_date DATE;               -- 'date' já existe e vira o "due"

CREATE INDEX idx_activities_parent_activity_id ON public.activities (parent_activity_id);
CREATE INDEX idx_activities_status ON public.activities (organization_id, status);
```

Notas de migração:
- `completed BOOLEAN` **continua existindo** (não remover — é usado em
  ~10 lugares do código hoje). Vira campo derivado/sincronizado:
  `completed = (status = 'done')`, mantido em sincronia por um trigger
  simples nos dois sentidos (ou, mais simples ainda, só escrito por uma
  função de update central — decidir na hora de implementar; recomendo
  trigger, porque `deal_activities`/webhooks/IA podem, no futuro, tocar
  `completed` diretamente e não vale confiar que todo caminho vai lembrar
  de manter os dois campos manualmente em sincronia).
- Nenhuma coluna existente é removida ou tem seu tipo alterado — só
  adições. Migration é aditiva e retrocompatível com o código atual em
  produção (`main`), que ignora colunas que não conhece.
- `type` continua `TEXT` livre — não vale a pena forçar um enum agora
  (mexeria em `deals.nextActivity.type`, `ParsedActionType` da IA, e nos
  outros ~15 pontos que já tratam isso como union do TypeScript sem
  problema).

### 2.2 Tabela nova: `activity_checklist_items`

Não existe equivalente hoje (nem em `activities`, nem em
`deal_activities`). É a única peça genuinamente nova do modelo de dados.

```sql
CREATE TABLE public.activity_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_checklist_items_activity_id
  ON public.activity_checklist_items (activity_id);

ALTER TABLE public.activity_checklist_items ENABLE ROW LEVEL SECURITY;
-- Mesma política de isolamento por organização usada em `activities`
-- (reusar get_user_org_id(), não reinventar).
```

`tags`/`task_tags` do prompt de referência **ficam de fora do primeiro
corte** — o CRM já tem `tags: string[]` dentro do próprio `Deal`
(campo simples, sem tabela de junção) e não há sinal de necessidade real
de tags específicas de tarefa ainda. Proponho revisitar só se o fundador
pedir depois de usar o módulo básico.

`attachments` do prompt de referência: **fora de escopo do primeiro
corte também** — o CRM não tem hoje upload de arquivo em atividades, e
isso puxa Supabase Storage + UI de upload, que é uma feature própria.
Não é algo que dá para encaixar "de brinde" numa Fase 1.

### 2.3 Tarefa pessoal vs. compartilhada na organização (decisão a levar ao fundador)

Hoje o CRM inteiro é organization-wide: RLS de `activities` é por
`organization_id`, sem filtro por `owner_id`. Ou seja, hoje **todo mundo
na organização já vê todas as atividades de todos** — não existe conceito
de "minhas tarefas privadas" tecnicamente isolado por RLS.

Para a Central de Tarefas, recomendo **não mudar RLS agora** (continuar
compartilhado por organização, filtrando por `owner_id = auth.uid()` só
na camada de UI/query, não no banco) pelos motivos:
- É consistente com o resto do CRM (deals, contatos — nada é privado por
  usuário no schema atual).
- Hoje a R.A.F.O. é fundador solo — não há ganho real de RLS por usuário
  ainda, e adicionar isolamento por linha é mais superfície de bug (dois
  sistemas de RLS diferentes dentro da mesma tabela: um por org, outro
  por dono) para um problema que não existe na prática agora.
- As views "Minhas tarefas hoje" / "Minha Inbox" filtram por
  `owner_id = profile.id` no client, igual o resto do app já faz em
  vários lugares (ex: filtros de responsável em deals).

Se o fundador contratar mais gente e quiser tarefas realmente privadas
depois, isso vira uma migration de RLS separada — não bloqueia o corte
atual.

## 3. Telas / views propostas e onde entram na navegação

O item de sidebar `/activities` (ícone `CheckSquare`, label "Atividades")
já existe e **absorve o módulo inteiro** — não crio um item novo de
sidebar. Dentro de `/activities`, o `viewMode` que hoje é só
`'list' | 'calendar'` vira uma barra de sub-abas (padrão parecido com o
que `ActivitiesHeader` já faz para alternar list/calendar):

| View do prompt de referência | Vira, dentro de `/activities` | Fase |
|---|---|---|
| Hoje | Aba "Hoje" (`due date = hoje OU is_focus_today`, exclui `done`) | 1 |
| Caixa de entrada (Inbox) | Aba "Inbox" (`status = 'inbox'`) | 1 |
| Todas as tarefas | Aba "Todas" (o `viewMode: 'list'` atual, estendido com toggle "mostrar concluídas") | 1 |
| Próximos 7 dias | Aba "Próximos 7 dias" | 2 |
| Calendário | `viewMode: 'calendar'` atual, mantido como está | 1 (já existe) |
| Kanban | Aba "Kanban", 4 colunas = `activity_status` | 2 |
| Tríade do Tempo | Aba "Tríade", 3 colunas = `time_sphere` | 3 |
| Matriz de Eisenhower | **Fundida com a Tríade** — não vira aba separada. O prompt de referência já tinha as duas (Tríade por `time_sphere` e Eisenhower por `is_important × is_urgent`) meio redundantes; a Tríade sozinha cobre o mesmo raciocínio com um campo em vez de dois booleans. Proponho não trazer `is_important`/`is_urgent` como colunas — só `time_sphere`. | — |
| Dashboard/Produtividade | Aba "Dashboard" (cards de contagem + gráfico via `recharts`, já é dependência do repo) | 3 |

Não crio rotas novas em `app/` (`/hoje`, `/kanban` etc. como páginas
separadas) — tudo fica como estado de UI (`viewMode`) dentro da página
`/activities` existente, com o filtro refletido na URL via query string
(`?view=hoje`, mesmo padrão que já existe hoje com `?filter=overdue`).
Isso evita multiplicar App Router routes para o que é, na prática, o
mesmo dado com filtros diferentes — e mantém o deep-link que o Inbox já
usa funcionando sem mudança.

`ActivityFormModal`/`ActivityFormModalV2` (já existem, dois modais —
vale checar na implementação qual é o vigente e aposentar o outro) viram
a base do `TaskDrawer` do prompt de referência: adicionar campos de
status, prioridade, esfera do tempo, subtarefas (lista de atividades
filhas via `parent_activity_id`) e checklist.

## 4. Tradução de stack (confirmado por leitura direta do repo)

| Peça do prompt de referência | Já existe no CRM? | Decisão |
|---|---|---|
| TanStack Query | Sim (`package.json`, `lib/query/`) | Reusar `queryKeys.activities` (estender com `checklist(activityId)`, `subtasks(parentId)` etc. no mesmo factory `createExtendedQueryKeys`) |
| Zod | Sim, `zod@^4.3.6` | Usar para validação de formulário novo (status/prioridade/esfera) |
| shadcn/ui | **Não confirmado como instalado** — repo usa `components/ui/` próprio | Seguir os componentes já existentes em `components/ui/` (Popover, Modal, etc. — checar o que já existe antes de criar um novo) |
| sonner (toast) | **Não usado** — o CRM tem `context/ToastContext.tsx` próprio (`useToast().showToast(msg, type)`) | Usar `ToastContext`, não introduzir `sonner` |
| Zustand | Sim, `zustand@^5.0.12`, usado só para **UI state efêmero** (`lib/stores/index.ts`: sidebar, modais, drafts de formulário) | Só usar Zustand para estado de UI do módulo (ex: aba ativa, se persistir localmente) — dados de tarefa em si continuam 100% TanStack Query, nunca duplicados em Zustand (mesma separação que o resto do app já respeita) |
| Drag-and-drop (para Kanban) | **Sem lib dedicada** — o Kanban de `deals` já existente (`features/boards/components/Kanban/`) usa HTML5 drag/drop nativo (`draggable`, `onDragStart`), sem `@dnd-kit`/`react-beautiful-dnd` | Reusar o mesmo padrão nativo para o Kanban de tarefas — não adicionar dependência nova |
| Gráfico simples (Dashboard) | `recharts@^3.8.1` já é dependência | Reusar, sem lib nova |
| Realtime | `useRealtimeSync('activities')` já ativo | Nenhuma mudança necessária — `activity_checklist_items` pode ganhar realtime próprio depois se fizer falta, não é crítico no primeiro corte |

Nenhuma dependência nova precisa ser adicionada para as Fases 1-3 abaixo.
Isso também significa que não há decisão de "ferramenta paga nova" a
escalar aqui — é só extensão de código sobre stack já aprovada.

## 5. Fases de entrega propostas

### Fase 1 (primeiro corte)
- Migration: colunas novas em `activities` (status, priority, time_sphere,
  is_focus_today, parent_activity_id, position, start_date) + tabela
  `activity_checklist_items` + trigger de sincronia `completed`↔`status`.
- Extensão de `activitiesService`/`useActivitiesQuery.ts` para os campos
  novos, seguindo o padrão de retry defensivo já existente até a
  migration estar aplicada em produção (mesma técnica do `client_company_id`).
- Abas "Todas" (evolução da lista atual), "Hoje", "Inbox" dentro de
  `/activities`.
- `TaskDrawer`/evolução do `ActivityFormModal` com status, prioridade,
  esfera do tempo e checklist (CRUD simples, sem reorder ainda).
- Corrigir o stub de "adiar todas" no `BulkActionsToolbar` (achado nesta
  investigação) para persistir de verdade, já que estará mexendo na
  mesma área.

### Fase 2
- Aba "Kanban" (4 colunas por `status`, drag-and-drop nativo).
- Aba "Próximos 7 dias".
- Subtarefas visíveis/editáveis no `TaskDrawer` (via `parent_activity_id`).
- Reorder de checklist e de tarefas dentro de uma coluna (usa a coluna
  `position`, já criada na Fase 1).

### Fase 3
- Aba "Tríade do Tempo" (3 colunas por `time_sphere`).
- Aba "Dashboard" (cards de contagem + gráfico de conclusões dos últimos
  7 dias via `recharts`).
- "Foco de hoje" (`is_focus_today`) como recurso de destaque na aba
  "Hoje".

Fora de escopo de qualquer fase, por enquanto: `tags`/`task_tags`
dedicadas a tarefa, anexos/`attachments`, atalhos de teclado globais (N,
/, Esc) do prompt de referência — nenhum deles tem pedido explícito do
fundador ainda e todos são incrementais, não bloqueiam o valor central do
módulo.

## 6. Pendências para a aprovação do fundador

1. Confirmar a decisão da seção 2.3 (tarefas continuam organization-wide
   por RLS, "minhas tarefas" é só filtro de UI) — ou se ele quer RLS por
   usuário desde já.
2. Confirmar que a Matriz de Eisenhower do prompt de referência pode ser
   descartada em favor só da Tríade do Tempo (seção 3).
3. Aprovar o corte de fases (1/2/3) proposto na seção 5, incluindo o
   default `status = 'todo'` para atividades já existentes.
4. Aprovar que nenhuma dependência nova (`sonner`, `@dnd-kit`, shadcn do
   zero) será introduzida — tudo reaproveita o que o CRM já usa.
