import { useTranslation } from '@nocobase/i18n/client';
import type { FormEvent, ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty as EmptyRoot,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// Form building blocks shared by the quality workspace's create and edit views.
export function Choice({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Select
        value={value}
        items={items}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger className='w-full bg-card' aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function Field({
  name,
  label,
  defaultValue = '',
  multiline = false,
  required = true,
  maxLength = 10000,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={name}>
        {label}
        {required && <span aria-hidden='true'> *</span>}
      </Label>
      {multiline ? (
        <Textarea
          id={name}
          name={name}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          rows={4}
          className='bg-background'
        />
      ) : (
        <Input
          id={name}
          name={name}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          className='bg-background'
        />
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyRoot className='py-12'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </EmptyRoot>
  );
}

export function FormFrame({
  title,
  onCancel,
  busy,
  error,
  children,
  onSubmit,
  disabled = false,
  extraError = '',
}: {
  title: string;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  // A check the form makes before submitting, shown with the server's error.
  extraError?: string;
  error: string;
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className='qc-card mx-auto max-w-3xl'>
      <CardContent className='p-6'>
        <form onSubmit={onSubmit} className='space-y-6'>
          <h2 className='text-lg font-semibold'>{title}</h2>
          {(extraError || error) && (
            <Alert variant='destructive'>
              <AlertDescription>{extraError || error}</AlertDescription>
            </Alert>
          )}
          {children}
          <div className='flex justify-end gap-3 border-t pt-5'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onCancel}
            >
              {t('qc.cancel')}
            </Button>
            <Button type='submit' disabled={busy || disabled}>
              {t(busy ? 'qc.saving' : 'qc.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
