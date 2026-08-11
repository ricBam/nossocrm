import { beforeEach, describe, expect, it, vi } from 'vitest'

const activitiesQueryBuilder = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: { id: 'activity-1', title: 'Ligar para cliente', type: 'TASK' },
    error: null,
  })),
}

// Mock do client service-role usado pelas tools de IA (mesmo padrão de aiToolsRbac.test.ts).
const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'activities') return activitiesQueryBuilder
    throw new Error(`Unexpected table: ${table}`)
  }),
}

vi.mock('@/lib/supabase/staticAdminClient', () => ({
  createStaticAdminClient: () => supabaseMock,
}))

import { createCRMTools } from '@/lib/ai/tools'

beforeEach(() => {
  vi.clearAllMocks()
  activitiesQueryBuilder.insert.mockReturnThis()
  activitiesQueryBuilder.select.mockReturnThis()
})

describe('createTask (Central de Tarefas — campos novos)', () => {
  it('passa status/priority/timeSphere/isFocusToday/contactId para o insert quando fornecidos', async () => {
    const tools = createCRMTools(
      { organizationId: 'org-1' },
      'user-1'
    )

    const res = await tools.createTask.execute({
      title: 'Ligar para cliente',
      dealId: 'deal-1',
      contactId: 'contact-1',
      status: 'in_progress',
      priority: 'urgent',
      timeSphere: 'importante',
      isFocusToday: true,
    })

    expect(res).toMatchObject({ success: true })
    expect(activitiesQueryBuilder.insert).toHaveBeenCalledTimes(1)

    const payload = activitiesQueryBuilder.insert.mock.calls[0][0]
    expect(payload).toMatchObject({
      organization_id: 'org-1',
      title: 'Ligar para cliente',
      deal_id: 'deal-1',
      contact_id: 'contact-1',
      status: 'in_progress',
      priority: 'urgent',
      time_sphere: 'importante',
      is_focus_today: true,
    })
  })

  it('não inclui os campos novos no payload quando omitidos (deixa o banco aplicar os defaults)', async () => {
    const tools = createCRMTools(
      { organizationId: 'org-1' },
      'user-1'
    )

    const res = await tools.createTask.execute({
      title: 'Tarefa simples',
    })

    expect(res).toMatchObject({ success: true })

    const payload = activitiesQueryBuilder.insert.mock.calls[0][0]
    expect(payload).toMatchObject({
      organization_id: 'org-1',
      title: 'Tarefa simples',
      contact_id: null,
    })
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('priority')
    expect(payload).not.toHaveProperty('time_sphere')
    expect(payload).not.toHaveProperty('is_focus_today')
  })
})
