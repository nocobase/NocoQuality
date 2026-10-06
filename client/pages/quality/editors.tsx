import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import type {
  Check,
  CheckScope,
  Detail,
  FixMode,
  JudgeMode,
  Project,
  Standard,
} from './types.js';
import { activeApplicability } from './model.js';
import { Choice, Field, FormFrame } from './form.js';
import { useSubmission } from './use-submission.js';
import { useUsers } from './use-quality-data.js';
// Create and edit forms for projects, objects, dimensions, to-dos and Check standards.

// One choice among a few options, each shown as a card with a short explanation.
function RadioCards<T extends string>({
  legend,
  value,
  onChange,
  items,
}: {
  legend: string;
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; hint: string }[];
}) {
  return (
    <fieldset className='space-y-3'>
      <legend className='mb-3 font-medium'>{legend}</legend>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as T)}
        className='grid gap-3 sm:grid-cols-2'
      >
        {items.map((item) => (
          <label
            key={item.value}
            className={
              'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ' +
              (value === item.value
                ? 'border-primary/50 bg-primary/5'
                : 'hover:bg-muted/50')
            }
          >
            <RadioGroupItem value={item.value} className='mt-0.5' />
            <span>
              <span className='block font-medium'>{item.label}</span>
              <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                {item.hint}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

export function ProjectForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (p: Project) => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  return (
    <PageContainer>
      <PageHeader
        title={t('qc.newProject')}
        description={t('qc.projectFormBody')}
      />
      <FormFrame
        title={t('qc.projectDefinition')}
        onCancel={onCancel}
        busy={busy}
        error={error}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void submit<Project>(
            'quality/projects',
            {
              name: data.get('name'),
              description: data.get('description'),
              dimensionName: data.get('dimensionName'),
            },
            onSaved,
          );
        }}
      >
        <Field name='name' label={t('qc.name')} maxLength={120} />
        <Field
          name='description'
          label={t('qc.description')}
          multiline
          required={false}
          maxLength={1000}
        />
        <Field
          name='dimensionName'
          label={t('qc.firstDimension')}
          maxLength={120}
        />
      </FormFrame>
    </PageContainer>
  );
}
export function DefinitionForm({
  kind,
  detail,
  onCancel,
  onSaved,
}: {
  kind: 'object' | 'dimension';
  detail: Detail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [category, setCategory] = useState('business');
  const items = kind === 'object' ? detail.dimensions : detail.objects;
  const [selected, setSelected] = useState(items.map((v) => v.id));
  return (
    <FormFrame
      title={t(kind === 'object' ? 'qc.newObject' : 'qc.newDimension')}
      disabled={kind === 'object' && !selected.length}
      onCancel={onCancel}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void submit(
          'quality/projects/' +
            detail.project.id +
            '/' +
            (kind === 'object' ? 'objects' : 'dimensions'),
          kind === 'object'
            ? { name: data.get('name'), category, dimensionIds: selected }
            : { name: data.get('name'), objectIds: selected },
          onSaved,
        );
      }}
    >
      <Field name='name' label={t('qc.name')} maxLength={120} />
      {kind === 'object' && (
        <Choice
          label={t('qc.categoryLabel')}
          value={category}
          onChange={setCategory}
          items={[
            'feature',
            'installation',
            'deployment',
            'build',
            'upgrade',
            'testing',
            'business',
          ].map((v) => ({
            value: v,
            label: t('qc.category.' + v),
          }))}
        />
      )}
      <fieldset className='space-y-3'>
        <legend className='mb-3 font-medium'>
          {t(
            kind === 'object'
              ? 'qc.applicableDimensions'
              : 'qc.applicableObjects',
          )}
        </legend>
        {items.map((item) => (
          <label
            className='flex items-center gap-3 rounded-lg border p-3 text-sm'
            key={item.id}
          >
            <Checkbox
              checked={selected.includes(item.id)}
              onCheckedChange={(checked) =>
                setSelected((v) =>
                  checked ? [...v, item.id] : v.filter((n) => n !== item.id),
                )
              }
            />
            {item.name}
          </label>
        ))}
      </fieldset>
      {kind === 'object' && !selected.length && (
        <p className='text-sm text-destructive'>{t('qc.needDimension')}</p>
      )}
    </FormFrame>
  );
}
// Files a to-do outside any run; the required context lets someone else take it over without asking.
export function WorkItemForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: Detail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const users = useUsers();
  const { submit, busy, error } = useSubmission();
  const [assignee, setAssignee] = useState('');
  const [objectId, setObjectId] = useState('');
  const assigneeValue = assignee || users[0]?.id || '';
  return (
    <FormFrame
      title={t('qc.newWorkItem')}
      busy={busy}
      error={error}
      disabled={!assigneeValue}
      onCancel={onCancel}
      onSubmit={(e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.currentTarget));
        const optional = (key: string) => {
          const value = v[key];
          return typeof value === 'string' && value.trim()
            ? value.trim()
            : null;
        };
        void submit(
          'quality/projects/' + detail.project.id + '/work-items',
          {
            title: v.title,
            assigneeId: assigneeValue,
            prUrl: optional('prUrl'),
            objectId: objectId ? Number(objectId) : null,
            problem: v.problem,
            scenario: v.scenario,
            actualExpected: optional('actualExpected'),
            evidence: v.evidence,
            impact: optional('impact'),
            handling: v.handling,
          },
          onSaved,
        );
      }}
    >
      <p className='rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground'>
        {t('qc.workFormHint')}
      </p>
      <Field name='title' label={t('qc.workTitle')} maxLength={300} />
      <div className='grid gap-4 sm:grid-cols-2'>
        <Choice
          label={t('qc.assignee')}
          value={assigneeValue}
          onChange={setAssignee}
          items={users.map((u) => ({ value: u.id, label: u.name }))}
        />
        <Choice
          label={t('qc.relatedObject')}
          value={objectId}
          onChange={setObjectId}
          items={[
            { value: '', label: t('qc.none') },
            ...detail.objects.map((o) => ({
              value: String(o.id),
              label: o.name,
            })),
          ]}
        />
      </div>
      <Field
        name='prUrl'
        label={t('qc.prUrl')}
        required={false}
        maxLength={500}
      />
      {(
        [
          ['problem', true],
          ['scenario', true],
          ['actualExpected', false],
          ['evidence', true],
          ['impact', false],
          ['handling', true],
        ] as const
      ).map(([key, required]) => (
        <Field
          key={key}
          name={key}
          label={t('qc.ctx.' + key)}
          multiline
          required={required}
          maxLength={20000}
        />
      ))}
    </FormFrame>
  );
}
export function StandardForm({
  initialObjectId = '',
  initialDimensionId = '',
  detail,
  check,
  standard,
  onCancel,
  onSaved,
}: {
  initialObjectId?: string;
  initialDimensionId?: string;
  detail: Detail;
  check?: Check;
  standard?: Standard;
  onCancel: () => void;
  onSaved: (c: Check) => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [objectId, setObjectId] = useState(
    String(check?.objectId || initialObjectId || detail.objects[0]?.id || ''),
  );
  const dimensions = detail.dimensions.filter((d) =>
    detail.applicability.some(
      (a) => a.objectId === Number(objectId) && a.dimensionId === d.id,
    ),
  );
  const [dimensionId, setDimensionId] = useState(
    String(
      check?.dimensionId ||
        (dimensions.some((d) => String(d.id) === initialDimensionId)
          ? initialDimensionId
          : '') ||
        dimensions[0]?.id ||
        '',
    ),
  );
  // A human Check is not run; an automated one says who judges it and how a failure is handled.
  const [human, setHuman] = useState(standard?.judgeMode === 'human');
  const [judgeMode, setJudgeMode] = useState<Exclude<JudgeMode, 'human'>>(
    standard && standard.judgeMode !== 'human' ? standard.judgeMode : 'agent',
  );
  const [fixMode, setFixMode] = useState<FixMode>(check?.fixMode ?? 'assign');
  const [judgeError, setJudgeError] = useState('');
  // Arriving from one matrix cell means an object-specific Check; otherwise start with the shared default.
  const [scope, setScope] = useState<CheckScope>(
    initialObjectId ? 'object' : 'shared',
  );
  const [sharedDimensionId, setSharedDimensionId] = useState(
    initialDimensionId || String(detail.dimensions[0]?.id || ''),
  );
  const shared = scope === 'shared';
  const sharedDimension = detail.dimensions.find(
    (d) => String(d.id) === sharedDimensionId,
  );
  return (
    <FormFrame
      title={t(check ? 'qc.newVersion' : 'qc.newCheck')}
      disabled={
        !check && (shared ? !sharedDimensionId : !objectId || !dimensionId)
      }
      extraError={judgeError}
      onCancel={onCancel}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const command =
          typeof values.command === 'string' ? values.command.trim() : '';
        if (!human && judgeMode === 'script' && !command) {
          setJudgeError(t('qc.commandRequired'));
          return;
        }
        setJudgeError('');
        const body = {
          definition: values.definition,
          preconditions: values.preconditions,
          steps: values.steps,
          passCriteria: values.passCriteria,
          evidence: values.evidence,
          judgeMode: human ? 'human' : judgeMode,
          command: (!human && judgeMode === 'script' && command) || null,
          ...(human ? {} : { fixMode }),
        };
        if (check && standard)
          void submit(
            'quality/projects/' +
              detail.project.id +
              '/checks/' +
              check.id +
              '/versions',
            { ...body, baseVersion: standard.version },
            () => onSaved(check),
          );
        else
          void submit<Check>(
            'quality/projects/' + detail.project.id + '/checks',
            shared
              ? {
                  ...body,
                  name: values.name,
                  source:
                    (typeof values.source === 'string'
                      ? values.source.trim()
                      : '') || null,
                  scope,
                  dimensionId: Number(sharedDimensionId),
                }
              : {
                  ...body,
                  name: values.name,
                  source:
                    (typeof values.source === 'string'
                      ? values.source.trim()
                      : '') || null,
                  scope,
                  objectId: Number(objectId),
                  dimensionId: Number(dimensionId),
                },
            onSaved,
          );
      }}
    >
      <RadioCards
        legend={t('qc.checkKind')}
        value={human ? 'human' : 'automated'}
        onChange={(v) => setHuman(v === 'human')}
        items={(['automated', 'human'] as const).map((v) => ({
          value: v,
          label: t('qc.checkKindName.' + v),
          hint: t('qc.checkKindHint.' + v),
        }))}
      />
      {!human && (
        <>
          <RadioCards
            legend={t('qc.judgeLabel')}
            value={judgeMode}
            onChange={setJudgeMode}
            items={(['script', 'session', 'agent'] as const).map((v) => ({
              value: v,
              label: t('qc.judgeMode.' + v),
              hint: t('qc.judgeHint.' + v),
            }))}
          />
          {judgeMode === 'script' && (
            <div className='space-y-2'>
              <Field
                name='command'
                label={t('qc.command')}
                defaultValue={standard?.command ?? ''}
                maxLength={2000}
              />
              <p className='text-xs text-muted-foreground'>
                {t('qc.commandHint')}
              </p>
            </div>
          )}
          <RadioCards
            legend={t('qc.fixModeLabel')}
            value={fixMode}
            onChange={setFixMode}
            items={(['pr', 'assign'] as const).map((v) => ({
              value: v,
              label: t('qc.fixMode.' + v),
              hint: t('qc.fixModeHint.' + v),
            }))}
          />
        </>
      )}
      {!check && (
        <>
          <RadioCards
            legend={t('qc.scope')}
            value={scope}
            onChange={setScope}
            items={(['shared', 'object'] as const).map((v) => ({
              value: v,
              label: t('qc.scopeName.' + v),
              hint: t('qc.scopeHint.' + v),
            }))}
          />
          <Field name='name' label={t('qc.checkName')} maxLength={120} />
          <div className='space-y-2'>
            <Field
              name='source'
              label={t('qc.source')}
              required={false}
              multiline
            />
            <p className='text-xs leading-5 text-muted-foreground'>
              {t('qc.sourceHint')}
            </p>
          </div>
          {shared ? (
            <div className='space-y-3'>
              <Choice
                label={t('qc.dimension')}
                value={sharedDimensionId}
                onChange={setSharedDimensionId}
                items={detail.dimensions.map((d) => ({
                  value: String(d.id),
                  label: d.name,
                }))}
              />
              {sharedDimension && (
                <p className='rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground'>
                  {t('qc.sharedReachHint', {
                    count: activeApplicability(detail).filter(
                      (a) => a.dimensionId === sharedDimension.id,
                    ).length,
                  })}
                </p>
              )}
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2'>
              <Choice
                label={t('qc.object')}
                value={objectId}
                onChange={(v) => {
                  setObjectId(v);
                  setDimensionId(
                    String(
                      detail.applicability.find((a) => a.objectId === Number(v))
                        ?.dimensionId || '',
                    ),
                  );
                }}
                items={detail.objects.map((o) => ({
                  value: String(o.id),
                  label: o.name,
                }))}
              />
              <Choice
                label={t('qc.dimension')}
                value={dimensionId}
                onChange={setDimensionId}
                items={dimensions.map((d) => ({
                  value: String(d.id),
                  label: d.name,
                }))}
              />
            </div>
          )}
        </>
      )}
      {check && (
        <p className='text-sm text-muted-foreground'>
          {check.name} · {t('qc.versionNote')}
        </p>
      )}
      {(
        [
          'definition',
          'preconditions',
          'steps',
          'passCriteria',
          'evidence',
        ] as const
      ).map((field) => (
        <Field
          key={field}
          name={field}
          label={t(
            human && field === 'steps' ? 'qc.stepsOptional' : 'qc.' + field,
          )}
          multiline
          required={!human || field !== 'steps'}
          defaultValue={standard?.[field] || ''}
        />
      ))}
      <p className='text-xs leading-6 text-muted-foreground'>
        {t('qc.stepsHint')}
      </p>
    </FormFrame>
  );
}
