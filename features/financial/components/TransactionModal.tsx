import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SelectField, SubmitButton } from '@/components/ui/FormField';
import { financialTransactionFormSchema, type FinancialTransactionFormData } from '@/lib/validations/schemas';

const EXPENSE_CATEGORIES = ['Servidor', 'IA/Claude', 'Anúncios', 'Ferramentas', 'Outros'];
const REVENUE_CATEGORIES = ['Vendas (fora do CRM)', 'Outros'];
const CUSTOM_CATEGORY_VALUE = '__custom__';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FinancialTransactionFormData) => void;
  isSubmitting?: boolean;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
  const [useCustomCategory, setUseCustomCategory] = React.useState(false);
  const form = useForm<FinancialTransactionFormData>({
    // @ts-expect-error - zodResolver type variance with coerced number fields, safe at runtime
    resolver: zodResolver(financialTransactionFormSchema),
    defaultValues: {
      type: 'despesa',
      description: '',
      amount: 0,
      category: '',
      date: new Date().toISOString().slice(0, 10),
    },
  });

  const { register, handleSubmit, watch, formState: { errors }, reset } = form;
  const type = watch('type');
  const categoryOptions = (type === 'receita' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map(c => ({ value: c, label: c }));

  React.useEffect(() => {
    if (isOpen) {
      reset({ type: 'despesa', description: '', amount: 0, category: '', date: new Date().toISOString().slice(0, 10) });
      setUseCustomCategory(false);
    }
  }, [isOpen, reset]);

  const handleFormSubmit = (data: FinancialTransactionFormData) => {
    onSubmit(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo lançamento">
      {/* @ts-expect-error - handleSubmit type variance with FinancialTransactionFormData, safe at runtime */}
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          {(['despesa', 'receita'] as const).map(t => (
            <label key={t} className={`flex-1 text-center py-2 text-sm font-bold cursor-pointer ${watch('type') === t ? (t === 'receita' ? 'bg-success-bg text-success-text' : 'bg-error-bg text-error-text') : 'text-slate-500'}`}>
              <input type="radio" value={t} {...register('type')} className="sr-only" />
              {t === 'receita' ? 'Receita' : 'Despesa'}
            </label>
          ))}
        </div>

        <InputField label="Descrição" placeholder="Ex: Hospedagem do servidor" required error={errors.description} registration={register('description')} />
        <InputField label="Valor (R$)" type="number" step="0.01" min="0" required error={errors.amount} registration={register('amount')} />

        {!useCustomCategory ? (
          <SelectField
            label="Categoria"
            placeholder="Selecione..."
            required
            options={[...categoryOptions, { value: CUSTOM_CATEGORY_VALUE, label: 'Outra (digitar)' }]}
            error={errors.category}
            {...register('category')}
            onChange={e => {
              if (e.target.value === CUSTOM_CATEGORY_VALUE) {
                setUseCustomCategory(true);
                form.setValue('category', '');
              } else {
                form.setValue('category', e.target.value);
              }
            }}
          />
        ) : (
          <InputField label="Categoria" placeholder="Digite a categoria" required error={errors.category} registration={register('category')} />
        )}

        <InputField label="Data" type="date" required error={errors.date} registration={register('date')} />

        <SubmitButton isLoading={isSubmitting}>Salvar lançamento</SubmitButton>
      </ModalForm>
    </Modal>
  );
};

export default TransactionModal;
