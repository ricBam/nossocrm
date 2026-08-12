import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { financialBucketMovementFormSchema, type FinancialBucketMovementFormData } from '@/lib/validations/schemas';

interface BucketMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'deposit' | 'withdraw';
  bucketName: string;
  onSubmit: (data: FinancialBucketMovementFormData) => void;
  isSubmitting?: boolean;
}

export const BucketMovementModal: React.FC<BucketMovementModalProps> = ({ isOpen, onClose, mode, bucketName, onSubmit, isSubmitting }) => {
  const form = useForm<FinancialBucketMovementFormData>({
    // @ts-expect-error - zodResolver type variance with coerced number fields, safe at runtime
    resolver: zodResolver(financialBucketMovementFormSchema),
    defaultValues: { amount: 0, note: '', date: new Date().toISOString().slice(0, 10) },
  });
  const { register, handleSubmit, formState: { errors }, reset } = form;

  React.useEffect(() => {
    if (isOpen) reset({ amount: 0, note: '', date: new Date().toISOString().slice(0, 10) });
  }, [isOpen, reset]);

  const handleFormSubmit = (data: FinancialBucketMovementFormData) => {
    onSubmit({ ...data, amount: mode === 'withdraw' ? -Math.abs(data.amount) : Math.abs(data.amount) });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${mode === 'deposit' ? 'Aporte em' : 'Retirar de'} "${bucketName}"`}>
      {/* @ts-expect-error - handleSubmit type variance with FinancialBucketMovementFormData, safe at runtime */}
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField label="Valor (R$)" type="number" step="0.01" min="0.01" required error={errors.amount} registration={register('amount')} />
        <InputField label="Nota (opcional)" placeholder="Ex: Reforço do mês" error={errors.note} registration={register('note')} />
        <InputField label="Data" type="date" required error={errors.date} registration={register('date')} />
        <SubmitButton isLoading={isSubmitting} variant={mode === 'withdraw' ? 'danger' : 'primary'}>
          {mode === 'deposit' ? 'Confirmar aporte' : 'Confirmar retirada'}
        </SubmitButton>
      </ModalForm>
    </Modal>
  );
};

export default BucketMovementModal;
