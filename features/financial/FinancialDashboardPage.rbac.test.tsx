import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/query/hooks/useFinancialQuery', () => ({
  useFinancialLedger: () => ({ data: [], isLoading: false }),
  useFinancialBuckets: () => ({ data: [], isLoading: false }),
}))

vi.mock('./components/RevenueExpenseChart', () => ({ RevenueExpenseChart: () => <div /> }))
vi.mock('./components/ExpenseByCategoryChart', () => ({ ExpenseByCategoryChart: () => <div /> }))

import FinancialDashboardPage from './FinancialDashboardPage'
import { useAuth } from '@/context/AuthContext'

const useAuthMock = vi.mocked(useAuth)

describe('FinancialDashboardPage RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vendedor vê mensagem de acesso restrito, não o dashboard', () => {
    useAuthMock.mockReturnValue({ profile: { role: 'vendedor' }, loading: false } as any)

    render(<FinancialDashboardPage />)

    expect(screen.getByRole('heading', { name: /acesso restrito/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^financeiro$/i })).not.toBeInTheDocument()
  })

  it('admin vê o dashboard financeiro', () => {
    useAuthMock.mockReturnValue({ profile: { role: 'admin' }, loading: false } as any)

    render(<FinancialDashboardPage />)

    expect(screen.getByRole('heading', { name: /^financeiro$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /acesso restrito/i })).not.toBeInTheDocument()
  })
})
