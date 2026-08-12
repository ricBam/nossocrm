import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { financialBucketFormSchema, type FinancialBucketFormData } from '@/lib/validations/schemas';

interface BucketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FinancialBucketFormData) => void;
  isSubmitting?: boolean;
}

const DEFAULT_COLOR = '#6366F1';

export const BucketFormModal: React.FC<BucketFormModalProps> = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
  const form = useForm<FinancialBucketFormData>({
    // @ts-expect-error - zodResolver type variance with coerced number fields, safe at runtime
    resolver: zodResolver(financialBucketFormSchema),
    defaultValues: { name: '', goalAmount: undefined, color: DEFAULT_COLOR },
  });
  const { register, handleSubmit, formState: { errors }, reset } = form;

  React.useEffect(() => {
    if (isOpen) reset({ name: '', goalAmount: undefined, color: DEFAULT_COLOR });
  }, [isOpen, reset]);

  const handleFormSubmit = (data: FinancialBucketFormData) => {
    onSubmit(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo cofrinho">
      {/* @ts-expect-error - handleSubmit type variance with FinancialBucketFormData, safe at runtime */}
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField label="Nome" placeholder="Ex: Notebook novo" required error={errors.name} registration={register('name')} />
        <InputField label="Meta (R$, opcional)" type="number" step="0.01" min="0" hint="Deixe em branco para um cofrinho sem meta fixa." error={errors.goalAmount} registration={register('goalAmount')} />
        <InputField label="Cor" type="color" required error={errors.color} registration={register('color')} />
        <SubmitButton isLoading={isSubmitting}>Criar cofrinho</SubmitButton>
      </ModalForm>
    </Modal>
  );
};

export default BucketFormModal;
