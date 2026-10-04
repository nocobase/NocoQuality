import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { Archive, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Choice, Field, FormFrame } from './form.js';
import type {
  Check,
  Detail,
  Material,
  MaterialType,
  TestObject,
} from './types.js';
import { SectionTitle } from './ui.js';
import { useRequest } from './use-quality-data.js';
import { useSubmission } from './use-submission.js';

const CATEGORIES = [
  'feature',
  'installation',
  'deployment',
  'build',
  'upgrade',
  'testing',
  'business',
];
const MATERIAL_TYPES: MaterialType[] = ['skill', 'package', 'doc', 'other'];
const text = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';
// Rows keep a local key so editing one material does not remount the others.
type MaterialRow = Material & { rowKey: number };
let nextRowKey = 0;
const toRow = (m: Material): MaterialRow => ({ ...m, rowKey: nextRowKey++ });

// Renames a Check and records why it exists; its standard changes only through a new version.
export function CheckEditForm({
  detail,
  check,
  onCancel,
  onSaved,
}: {
  detail: Detail;
  check: Check;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  return (
    <FormFrame
      title={t('qc.editCheck')}
      onCancel={onCancel}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void submit(
          'quality/projects/' +
            detail.project.id +
            '/checks/' +
            check.id +
            '/update',
          {
            name: data.get('name'),
            source: text(data.get('source')).trim() || null,
          },
          onSaved,
        );
      }}
    >
      <Field
        name='name'
        label={t('qc.checkName')}
        defaultValue={check.name}
        maxLength={120}
      />
      <Field
        name='source'
        label={t('qc.source')}
        defaultValue={check.source ?? ''}
        multiline
        required={false}
      />
      <p className='text-xs leading-5 text-muted-foreground'>
        {t('qc.sourceHint')}
      </p>
    </FormFrame>
  );
}

// Edits an object's name, category, description and the materials behind it.
export function ObjectEditForm({
  detail,
  object,
  onCancel,
  onSaved,
}: {
  detail: Detail;
  object: TestObject;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [category, setCategory] = useState(object.category);
  const [materials, setMaterials] = useState<MaterialRow[]>(() =>
    (object.materials ?? []).map(toRow),
  );
  const update = (rowKey: number, value: Partial<Material>) =>
    setMaterials((rows) =>
      rows.map((row) => (row.rowKey === rowKey ? { ...row, ...value } : row)),
    );
  const typeItems = MATERIAL_TYPES.map((v) => ({
    value: v,
    label: t('qc.materialType.' + v),
  }));
  return (
    <FormFrame
      title={t('qc.edit-object')}
      onCancel={onCancel}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void submit(
          'quality/projects/' +
            detail.project.id +
            '/objects/' +
            object.id +
            '/update',
          {
            name: data.get('name'),
            category,
            description: text(data.get('description')),
            materials: materials
              .map(({ type, ref }) => ({ type, ref: ref.trim() }))
              .filter((m) => m.ref),
          },
          onSaved,
        );
      }}
    >
      <Field
        name='name'
        label={t('qc.name')}
        defaultValue={object.name}
        maxLength={120}
      />
      <Choice
        label={t('qc.categoryLabel')}
        value={category}
        onChange={setCategory}
        items={CATEGORIES.map((v) => ({
          value: v,
          label: t('qc.category.' + v),
        }))}
      />
      <Field
        name='description'
        label={t('qc.objectDescription')}
        defaultValue={object.description}
        multiline
        required={false}
      />
      <fieldset className='space-y-3'>
        <legend className='font-medium'>{t('qc.materials')}</legend>
        <p className='text-xs leading-5 text-muted-foreground'>
          {t('qc.materialsHint')}
        </p>
        {materials.map((m, i) => (
          <div key={m.rowKey} className='flex flex-wrap items-end gap-2'>
            <div className='w-36 space-y-1'>
              <Select
                value={m.type}
                items={typeItems}
                onValueChange={(v) => {
                  if (v) update(m.rowKey, { type: v });
                }}
              >
                <SelectTrigger
                  className='w-full bg-card'
                  aria-label={t('qc.materials') + ' ' + (i + 1)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              className='min-w-48 flex-1 bg-background'
              aria-label={t('qc.materialRef')}
              placeholder={t('qc.materialRef')}
              value={m.ref}
              maxLength={500}
              onChange={(e) => update(m.rowKey, { ref: e.target.value })}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label={t('qc.removeMaterial')}
              onClick={() =>
                setMaterials((rows) =>
                  rows.filter((row) => row.rowKey !== m.rowKey),
                )
              }
            >
              <X />
            </Button>
          </div>
        ))}
        {materials.length < 50 && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setMaterials((rows) => [
                ...rows,
                toRow({ type: 'skill', ref: '' }),
              ])
            }
          >
            <Plus />
            {t('qc.addMaterial')}
          </Button>
        )}
      </fieldset>
    </FormFrame>
  );
}

// Deleted objects and Checks, each with a restore button; restoring an object leaves its Checks archived.
export function ArchivedCard({
  detail,
  revision,
  onRestored,
}: {
  detail: Detail;
  revision: number;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const archived = useRequest<{ objects: TestObject[]; checks: Check[] }>(
    'quality/projects/' + detail.project.id + '/archived',
    revision,
  ).data;
  const objects = archived?.objects ?? [];
  const checks = archived?.checks ?? [];
  const activeObjects = new Set(detail.objects.map((o) => o.id));
  const restore = (path: string) =>
    void submit(
      'quality/projects/' + detail.project.id + path,
      {},
      onRestored,
      { OBJECT_ARCHIVED: 'qc.objectArchivedFirst' },
    );
  return (
    <Card className='qc-card xl:col-span-5'>
      <CardContent className='space-y-4 p-6'>
        <SectionTitle
          icon={<Archive />}
          title={t('qc.archived')}
          description={t('qc.archivedHint')}
        />
        {error && <p className='text-sm text-destructive'>{error}</p>}
        {objects.length || checks.length ? (
          <ul className='divide-y rounded-xl border'>
            {objects.map((o) => (
              <li
                key={'o' + o.id}
                className='flex items-center justify-between gap-3 px-4 py-2.5'
              >
                <span className='min-w-0 truncate text-sm'>
                  <span className='text-muted-foreground'>
                    {t('qc.object')} ·{' '}
                  </span>
                  {o.name}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() => restore('/objects/' + o.id + '/restore')}
                >
                  <Undo2 />
                  {t('qc.restore')}
                </Button>
              </li>
            ))}
            {checks.map((c) => {
              const blocked =
                c.scope === 'object' &&
                c.objectId !== null &&
                !activeObjects.has(c.objectId);
              return (
                <li
                  key={'c' + c.id}
                  className='flex items-center justify-between gap-3 px-4 py-2.5'
                >
                  <span className='min-w-0 truncate text-sm'>
                    <span className='text-muted-foreground'>Check · </span>
                    {c.name}
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || blocked}
                    title={blocked ? t('qc.objectArchivedFirst') : undefined}
                    onClick={() => restore('/checks/' + c.id + '/restore')}
                  >
                    <Undo2 />
                    {t('qc.restore')}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>{t('qc.noArchived')}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Includes or pauses every object in one category with a single switch; on only when all of them are included.
export function GroupTestingSwitch({
  detail,
  objects,
  label,
  onChanged,
}: {
  detail: Detail;
  objects: TestObject[];
  label: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const on = objects.filter((o) => !o.testingPaused).length;
  return (
    <span className='inline-flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5'>
      {error && <span className='text-xs text-destructive'>{error}</span>}
      <span className='text-xs tabular-nums text-muted-foreground'>
        {t('qc.groupTesting', { on, total: objects.length })}
      </span>
      <Switch
        checked={on === objects.length}
        disabled={busy}
        aria-label={t('qc.groupTestingToggle', { name: label })}
        onCheckedChange={(next) =>
          void submit(
            'quality/projects/' + detail.project.id + '/objects/testing',
            { objectIds: objects.map((o) => o.id), enabled: next },
            onChanged,
          )
        }
      />
    </span>
  );
}
// Includes an object in full runs or leaves it out while its feature is still being developed.
export function ObjectTestingSwitch({
  detail,
  object,
  onChanged,
}: {
  detail: Detail;
  object: TestObject;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const enabled = !object.testingPaused;
  return (
    <span className='inline-flex shrink-0 items-center gap-2'>
      {error && <span className='text-xs text-destructive'>{error}</span>}
      <span
        className={
          'text-xs ' + (enabled ? 'text-foreground' : 'text-muted-foreground')
        }
      >
        {t(enabled ? 'qc.testing' : 'qc.paused')}
      </span>
      <Switch
        checked={enabled}
        disabled={busy}
        aria-label={t('qc.includeInTesting', { name: object.name })}
        onCheckedChange={(next) =>
          void submit(
            'quality/projects/' +
              detail.project.id +
              '/objects/' +
              object.id +
              '/testing',
            { enabled: next },
            onChanged,
          )
        }
      />
    </span>
  );
}
