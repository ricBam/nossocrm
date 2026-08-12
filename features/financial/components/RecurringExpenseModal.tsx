import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SelectField, SubmitButton } from '@/components/ui/FormField';
import { financialRecurringExpenseFormSchema, type FinancialRecurringExpenseFormData } from '@/lib/validations/schemas';

const EXPENSE_CATEGORIES = ['Servidor', 'IA/Claude', 'Anúncios', 'Ferramentas', 'Outros'];

interface RecurringExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FinancialRecurringExpenseFormData) => void;
  isSubmitting?: boolean;
}

export const RecurringExpenseModal: React.FC<RecurringExpenseModalProps> = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
  const form = useForm<FinancialRecurringExpenseFormData>({
    // @ts-expect-error - zodResolver type variance with coerced number fields, safe at runtime
    resolver: zodResolver(financialRecurringExpenseFormSchema),
    defaultValues: { name: '', amount: 0, category: '', dayOfMonth: 1 },
  });
  const { register, handleSubmit, formState: { errors }, reset } = form;

  React.useEffect(() => {
    if (isOpen) reset({ name: '', amount: 0, category: '', dayOfMonth: 1 });
  }, [isOpen, reset]);

  const handleFormSubmit = (data: FinancialRecurringExpenseFormData) => {
    onSubmit(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova despesa recorrente">
      {/* @ts-expect-error - handleSubmit type variance with FinancialRecurringExpenseFormData, safe at runtime */}
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField label="Nome" placeholder="Ex: Assinatura Claude" required error={errors.name} registration={register('name')} />
        <InputField label="Valor mensal (R$)" type="number" step="0.01" min="0" required error={errors.amount} registration={register('amount')} />
        <SelectField label="Categoria" placeholder="Selecione..." required options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: c }))} error={errors.category} registration={register('category')} />
        <InputField label="Dia do mês da cobrança" type="number" min="1" max="28" hint="Entre 1 e 28, para evitar meses curtos." required error={errors.dayOfMonth} registration={register('dayOfMonth')} />
        <SubmitButton isLoading={isSubmitting}>Salvar despesa recorrente</SubmitButton>
      </ModalForm>
    </Modal>
  );
};

export default RecurringExpenseModal;
