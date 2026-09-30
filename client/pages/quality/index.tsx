import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ChevronRight,
  CirclePause,
  History,
  FolderOpen,
  Layers3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Empty as EmptyRoot,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import type {
  Check,
  CheckScope,
  Detail,
  Project,
  Result,
  RunDetail,
  Standard,
  TestObject,
} from './types.js';
import {
  activeApplicability,
  cellScore,
  testedApplicability,
  checksFor,
  effectiveCount,
  inheritingObjects,
  isExcluded,
} from './model.js';
import { Overview } from './overview.js';
import { ReportText, SectionTitle, StatusBadge } from './ui.js';
import { useSubmission } from './use-submission.js';
import {
  CellResultsSheet,
  CheckSettings,
  RunList,
  RunView,
  ScoreChip,
  WorkItemsView,
} from './runs.js';
import { useLatestRun, useUsers } from './use-quality-data.js';

function Choice({
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
function Field({
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
function Empty({
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

export default function QualityPage() {
  const api = useApiClient();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const view = params.get('view') || 'overview';
  const record = params.get('record') || '';
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadFailure, setLoadFailure] = useState<{
    project: string;
    status: number;
  } | null>(null);
  const loadError = loadFailure?.project === projectId ? loadFailure.status : 0;
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const headingRef = useRef<HTMLDivElement>(null);
  const go = (next: string, extra: Record<string, string> = {}) =>
    setParams({
      ...(projectId ? { project: projectId } : {}),
      view: next,
      ...extra,
    });
  useEffect(() => {
    let current = true;
    void api
      .request<{ data: Project[] }>({ path: 'quality/projects' })
      .then((r) => {
        if (current) setProjects(r.data);
      })
      .catch((e) => {
        if (current)
          setLoadFailure({
            project: projectId,
            status: e instanceof ApiClientError ? e.status : 500,
          });
      });
    return () => {
      current = false;
    };
  }, [api, revision, projectId]);
  useEffect(() => {
    if (projects?.length && !projectId && view !== 'new-project')
      setParams(
        { project: String(projects[0].id), view: 'overview' },
        { replace: true },
      );
  }, [projects, projectId, view, setParams]);
  useEffect(() => {
    if (!projectId) return;
    let current = true;

    void api
      .request<{ data: Detail }>({ path: 'quality/projects/' + projectId })
      .then((r) => {
        if (current) {
          setDetail(r.data);
          setLoadFailure(null);
        }
      })
      .catch((e) => {
        if (current)
          setLoadFailure({
            project: projectId,
            status: e instanceof ApiClientError ? e.status : 500,
          });
      });
    return () => {
      current = false;
    };
  }, [api, projectId, revision]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [view, record, projectId, detail?.project.id]);
  const refresh = () => setRevision((v) => v + 1);
  const latest = useLatestRun(Number(projectId) || 0, revision);
  const saved = (
    message: string,
    next: string,
    extra: Record<string, string> = {},
  ) => {
    setNotice(message);
    setRevision((v) => v + 1);
    go(next, extra);
    window.dispatchEvent(new Event('quality-projects-changed'));
  };
  if (loadError)
    return (
      <PageContainer>
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              loadError === 403
                ? 'qc.forbidden'
                : loadError === 404
                  ? 'qc.missing'
                  : 'qc.loadError',
            )}
          </AlertDescription>
        </Alert>
        {loadError >= 500 ? (
          <Button
            onClick={() => {
              setLoadFailure(null);
              setRevision((v) => v + 1);
            }}
          >
            {t('qc.retry')}
          </Button>
        ) : (
          <Button onClick={() => setParams({ view: 'overview' })}>
            {t('qc.backProjects')}
          </Button>
        )}
      </PageContainer>
    );
  if (!projects)
    return (
      <PageContainer>
        <Skeleton
          role='status'
          aria-label={t('status.loading')}
          className='h-10 w-64'
        />
        <Skeleton className='h-44 w-full' />
        <Skeleton className='h-72 w-full' />
      </PageContainer>
    );
  if (view === 'new-project')
    return (
      <ProjectForm
        onCancel={() => go('overview')}
        onSaved={(p) => {
          setNotice(t('qc.saved'));
          setRevision((v) => v + 1);
          setParams({ project: String(p.id), view: 'overview' });
          window.dispatchEvent(new Event('quality-projects-changed'));
        }}
      />
    );
  if (!projects.length)
    return (
      <PageContainer>
        <PageHeader title={t('qc.brand')} />
        <Empty
          title={t('qc.noProjects')}
          description={t('qc.startProject')}
          action={
            <Button onClick={() => go('new-project')}>
              <Plus />
              {t('qc.newProject')}
            </Button>
          }
        />
      </PageContainer>
    );
  if (!detail || String(detail.project.id) !== projectId)
    return (
      <PageContainer>
        <Skeleton
          role='status'
          aria-label={t('status.loading')}
          className='h-10 w-64'
        />
        <Skeleton className='h-44 w-full' />
        <Skeleton className='h-72 w-full' />
      </PageContainer>
    );
  const check = detail.checks.find((c) => String(c.id) === record);
  const versions = check
    ? detail.standards
        .filter((s) => s.checkId === check.id)
        .sort((a, b) => b.version - a.version)
    : [];
  const standard =
    versions.find((s) => String(s.id) === params.get('standard')) ||
    versions[0];
  const title = t('qc.' + (view === 'standard' ? 'standard' : view));
  const primary =
    view === 'checks' ? (
      <Button
        onClick={() =>
          go('new-check', {
            object: params.get('object') || '',
            dimension: params.get('dimension') || '',
          })
        }
        disabled={!detail.applicability.length}
        title={!detail.applicability.length ? t('qc.needObject') : undefined}
      >
        <Plus />
        {t('qc.newCheck')}
      </Button>
    ) : view === 'coverage' ? (
      <Button onClick={() => go('new-object')}>
        <Plus />
        {t('qc.newObject')}
      </Button>
    ) : view === 'configuration' ? (
      <Button onClick={() => go('new-dimension')}>
        <Plus />
        {t('qc.newDimension')}
      </Button>
    ) : null;
  const standardFields = [
    'definition',
    'preconditions',
    'steps',
    'passCriteria',
    'evidence',
  ] as const;
  return (
    <PageContainer>
      <div ref={headingRef} tabIndex={-1} className='outline-none'>
        <PageHeader
          title={title}
          description={detail.project.name + ' · ' + t('qc.projectData')}
          actions={primary}
        />
      </div>
      {notice && (
        <div
          role='status'
          className='rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm'
        >
          {notice}
        </div>
      )}
      {view === 'overview' && (
        <Overview detail={detail} go={go} revision={revision} />
      )}
      {view === 'coverage' && (
        <Coverage
          detail={detail}
          revision={revision}
          onRun={(runId, o, d) =>
            go('run', {
              record: String(runId),
              object: String(o),
              dimension: String(d),
            })
          }
          onCell={(objectId, dimensionId) =>
            go('checks', {
              object: String(objectId),
              dimension: String(dimensionId),
            })
          }
          onCreate={() => go('new-object')}
        />
      )}
      {view === 'runs' && (
        <RunList detail={detail} go={go} revision={revision} />
      )}
      {view === 'run' && (
        <RunView
          key={record}
          detail={detail}
          runId={record}
          go={go}
          revision={revision}
          initialCell={
            params.get('object') && params.get('dimension')
              ? {
                  o: Number(params.get('object')),
                  d: Number(params.get('dimension')),
                }
              : null
          }
        />
      )}
      {(view === 'todo' || view === 'tasks') && (
        <WorkItemsView
          key={view}
          detail={detail}
          go={go}
          revision={revision}
          onChanged={refresh}
          defaultScope={view === 'todo' ? 'mine' : 'all'}
        />
      )}
      {view === 'new-work-item' && (
        <WorkItemForm
          detail={detail}
          onCancel={() => go('tasks')}
          onSaved={() => saved(t('qc.saved'), 'tasks')}
        />
      )}
      {view === 'checks' && (
        <CheckList
          key={projectId + params.get('object') + params.get('dimension')}
          detail={detail}
          objectFilter={params.get('object') || ''}
          dimensionFilter={params.get('dimension') || ''}
          onClear={() => go('checks')}
          onChanged={refresh}
          latest={latest}
          onOpen={(c) => go('standard', { record: String(c.id) })}
          onCreate={() =>
            go(detail.applicability.length ? 'new-check' : 'configuration', {
              object: params.get('object') || '',
              dimension: params.get('dimension') || '',
            })
          }
        />
      )}
      {view === 'configuration' && (
        <div className='grid items-start gap-6 xl:grid-cols-5'>
          <Card className='qc-card xl:col-span-3'>
            <CardContent className='space-y-5 p-6'>
              <SectionTitle
                icon={<FolderOpen />}
                title={t('qc.objects')}
                description={t('qc.objectTestingHint')}
                action={
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => go('new-object')}
                  >
                    <Plus />
                    {t('qc.newObject')}
                  </Button>
                }
              />
              {Array.from(new Set(detail.objects.map((o) => o.category))).map(
                (group) => {
                  const rows = detail.objects.filter(
                    (o) => o.category === group,
                  );
                  return (
                    <section
                      key={group}
                      className='space-y-3 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0'
                    >
                      <div className='flex flex-wrap items-center justify-between gap-3'>
                        <h3 className='flex items-center gap-2 text-base font-semibold text-foreground'>
                          {t('qc.category.' + group)}
                          <Badge variant='secondary'>{rows.length}</Badge>
                        </h3>
                        <GroupTestingSwitch
                          detail={detail}
                          objects={rows}
                          label={t('qc.category.' + group)}
                          onChanged={refresh}
                        />
                      </div>
                      <ul className='grid gap-2 sm:grid-cols-2'>
                        {rows.map((o) => (
                          <li
                            key={o.id}
                            className={
                              'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ' +
                              (o.testingPaused
                                ? 'bg-muted/50'
                                : 'bg-background')
                            }
                          >
                            <span
                              className={
                                'min-w-0 truncate text-sm ' +
                                (o.testingPaused ? 'text-muted-foreground' : '')
                              }
                            >
                              {o.name}
                            </span>
                            <ObjectTestingSwitch
                              detail={detail}
                              object={o}
                              onChanged={refresh}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                },
              )}
              {!detail.objects.length && (
                <p className='text-sm text-muted-foreground'>
                  {t('qc.noObjects')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className='qc-card xl:col-span-2'>
            <CardContent className='space-y-5 p-6'>
              <SectionTitle
                icon={<Layers3 />}
                title={t('qc.dimensions')}
                description={t('qc.applicabilityNote')}
              />
              <ol className='space-y-2'>
                {detail.dimensions.map((d, i) => (
                  <li
                    key={d.id}
                    className='flex items-center gap-3 rounded-xl border p-3'
                  >
                    <span className='qc-icon-tile flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm'>
                      {i + 1}
                    </span>
                    <span className='flex-1'>
                      <span className='block font-medium'>{d.name}</span>
                      <span className='text-xs text-muted-foreground'>
                        {t('qc.sharedCount', {
                          count: detail.checks.filter(
                            (c) =>
                              c.scope === 'shared' && c.dimensionId === d.id,
                          ).length,
                        })}
                      </span>
                    </span>
                    <Badge variant='outline'>
                      {
                        activeApplicability(detail).filter(
                          (a) => a.dimensionId === d.id,
                        ).length
                      }{' '}
                      {t('qc.objects')}
                    </Badge>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}
      {(view === 'new-object' || view === 'new-dimension') && (
        <DefinitionForm
          key={view + projectId}
          kind={view === 'new-object' ? 'object' : 'dimension'}
          detail={detail}
          onCancel={() => go('configuration')}
          onSaved={() => saved(t('qc.saved'), 'configuration')}
        />
      )}
      {(view === 'new-check' || view === 'edit-standard') &&
        (view === 'new-check' || (check && standard)) && (
          <StandardForm
            initialObjectId={params.get('object') || ''}
            initialDimensionId={params.get('dimension') || ''}
            key={view + projectId + record}
            detail={detail}
            check={view === 'edit-standard' ? check : undefined}
            standard={view === 'edit-standard' ? standard : undefined}
            onCancel={() =>
              go(
                check ? 'standard' : 'checks',
                check ? { record: String(check.id) } : {},
              )
            }
            onSaved={(c) =>
              saved(t('qc.saved'), 'standard', { record: String(c.id) })
            }
          />
        )}
      {view === 'standard' && check && standard && (
        <>
          <div className='flex flex-wrap gap-3'>
            <Button variant='outline' onClick={() => go('checks')}>
              <ArrowLeft />
              {t('qc.backChecks')}
            </Button>
            <div className='ml-auto flex flex-wrap gap-3'>
              <DeleteCheck
                detail={detail}
                check={check}
                onDeleted={() => saved(t('qc.deleted'), 'checks')}
              />
              <Button
                variant='outline'
                onClick={() =>
                  go('edit-standard', { record: String(check.id) })
                }
              >
                {t('qc.newVersion')}
              </Button>
            </div>
          </div>
          <div className='grid items-start gap-6 xl:grid-cols-3'>
            <Card className='qc-card xl:col-span-2'>
              <CardContent className='p-0'>
                <div className='qc-hero relative overflow-hidden rounded-t-xl border-b p-6'>
                  <div className='relative z-10'>
                    <div className='mb-3 flex flex-wrap gap-2'>
                      <Badge
                        variant='outline'
                        className='qc-tone qc-tone-primary'
                      >
                        {t('qc.standardVersion')} v{standard.version}
                      </Badge>
                      <Badge
                        variant='outline'
                        className={
                          'qc-tone ' +
                          (standard.humanReview
                            ? 'qc-tone-warn'
                            : 'qc-tone-muted')
                        }
                      >
                        {t(
                          standard.humanReview
                            ? 'qc.humanRequired'
                            : 'qc.humanOptional',
                        )}
                      </Badge>
                    </div>
                    <h2 className='text-2xl font-semibold tracking-tight'>
                      {check.name}
                    </h2>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      {check.scope === 'shared'
                        ? t('qc.scopeName.shared')
                        : detail.objects.find((o) => o.id === check.objectId)
                            ?.name}{' '}
                      /{' '}
                      {
                        detail.dimensions.find(
                          (d) => d.id === check.dimensionId,
                        )?.name
                      }
                    </p>
                  </div>
                </div>
                <div className='divide-y'>
                  {standardFields.map((field, i) => (
                    <section
                      key={field}
                      className='grid gap-3 p-6 md:grid-cols-[2rem_1fr]'
                    >
                      <span className='qc-icon-tile flex size-7 items-center justify-center rounded-lg font-mono text-xs'>
                        {i + 1}
                      </span>
                      <div className='min-w-0'>
                        <h3 className='mb-2 font-semibold'>
                          {t('qc.' + field)}
                        </h3>
                        <div className='text-muted-foreground'>
                          <ReportText text={standard[field]} />
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className='space-y-5 xl:sticky xl:top-4'>
              <Card className='qc-card'>
                <CardContent className='space-y-4 p-5'>
                  <Choice
                    label={t('qc.standardVersion')}
                    value={String(standard.id)}
                    items={versions.map((v) => ({
                      value: String(v.id),
                      label: 'v' + v.version,
                    }))}
                    onChange={(v) => go('standard', { record, standard: v })}
                  />
                  <p className='text-xs leading-6 text-muted-foreground'>
                    {t('qc.versionNote')}
                  </p>
                </CardContent>
              </Card>
              <CheckSettings
                key={check.id + check.fixMode + (check.assigneeId ?? '')}
                detail={detail}
                check={check}
                onChanged={refresh}
              />
              {check.scope === 'shared' && (
                <InheritingObjects
                  detail={detail}
                  check={check}
                  onChanged={refresh}
                  latest={latest}
                />
              )}
              {check.scope !== 'shared' && (
                <Card className='qc-card'>
                  <CardContent className='space-y-3 p-5'>
                    <SectionTitle
                      icon={<History />}
                      title={t('qc.latestResult')}
                      description={latest?.run.key ?? t('qc.latestRunEmpty')}
                    />
                    <StatusBadge
                      kind='result'
                      value={latestConclusion(latest?.results, check.id)}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
      {(view === 'standard' || view === 'edit-standard') &&
        (!check || !standard) && (
          <Empty
            title={t('qc.missing')}
            description={t('qc.backChecks')}
            action={
              <Button onClick={() => go('checks')}>{t('qc.backChecks')}</Button>
            }
          />
        )}
    </PageContainer>
  );
}

function Coverage({
  detail,
  onCell,
  onCreate,
  onRun,
  revision,
}: {
  detail: Detail;
  onCell: (o: number, d: number) => void;
  onCreate: () => void;
  onRun: (runId: number, objectId: number, dimensionId: number) => void;
  revision: number;
}) {
  const { t } = useTranslation();
  const latest = useLatestRun(detail.project.id, revision);
  // Clicking a score opens that cell's results here instead of leaving the matrix.
  const [cell, setCell] = useState<{ o: number; d: number } | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const objects = detail.objects.filter(
    (o) =>
      (category === 'all' || o.category === category) &&
      o.name.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = Array.from(new Set(objects.map((o) => o.category))).map(
    (c) => [c, objects.filter((o) => o.category === c)] as const,
  );
  const cells = testedApplicability(detail);
  const categoryItems = [
    { value: 'all', label: t('qc.allCategories') },
    ...Array.from(new Set(detail.objects.map((o) => o.category))).map((v) => ({
      value: v,
      label:
        t('qc.category.' + v) +
        ' · ' +
        detail.objects.filter((o) => o.category === v).length,
    })),
  ];
  return (
    <Card className='qc-card overflow-hidden'>
      <CardContent className='space-y-5 p-5'>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='relative w-full sm:max-w-xs'>
            <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='bg-background pl-9'
              aria-label={t('qc.searchObjects')}
              placeholder={t('qc.searchObjects')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={category}
            items={categoryItems}
            onValueChange={(v) => {
              if (v !== null) setCategory(v);
            }}
          >
            <SelectTrigger
              className='min-w-40 bg-card'
              aria-label={t('qc.categoryLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className='ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground'>
            <span className='flex items-center gap-1.5'>
              <span className='qc-dot qc-tone-primary' />
              {t('qc.legend.defined')}
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='inline-block size-1.5 rounded-full bg-muted-foreground/30' />
              {t('qc.noChecksCell')}
            </span>
          </div>
        </div>
        {objects.length ? (
          <div className='overflow-x-auto rounded-xl border'>
            <Table className='qc-matrix'>
              <TableHeader>
                <TableRow className='bg-muted/50 hover:bg-muted/50'>
                  <TableHead className='min-w-36 bg-muted/50! sm:min-w-52'>
                    {t('qc.object')}
                    <span className='ml-2 font-normal text-muted-foreground'>
                      {objects.length}
                    </span>
                  </TableHead>
                  {detail.dimensions.map((d) => {
                    const own = cells.filter((a) => a.dimensionId === d.id);
                    const withChecks = own.filter(
                      (a) => effectiveCount(detail, a.objectId, d.id) > 0,
                    ).length;
                    return (
                      <TableHead key={d.id} className='min-w-36'>
                        {d.name}
                        <span
                          aria-hidden='true'
                          className='mt-0.5 block text-[11px] font-normal text-muted-foreground'
                        >
                          {t('qc.objectsWithChecks', {
                            done: withChecks,
                            total: own.length,
                          })}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(([group, rows]) => (
                  <Fragment key={group}>
                    {groups.length > 1 && (
                      <TableRow className='hover:bg-transparent'>
                        <TableCell
                          colSpan={detail.dimensions.length + 1}
                          className='bg-muted/30! py-2 text-xs font-semibold tracking-wide text-muted-foreground'
                        >
                          {t('qc.category.' + group)} · {rows.length}
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((o) => (
                      <TableRow
                        key={o.id}
                        className={o.testingPaused ? 'opacity-55' : ''}
                      >
                        <TableCell className='min-w-36 sm:min-w-52'>
                          <p className='font-medium'>{o.name}</p>
                          {o.testingPaused && (
                            <Badge
                              variant='outline'
                              className='qc-tone qc-tone-muted mt-1'
                              title={o.pausedReason || undefined}
                            >
                              <CirclePause />
                              {t('qc.paused')}
                            </Badge>
                          )}
                        </TableCell>
                        {detail.dimensions.map((d) => (
                          <TableCell key={d.id} className='min-w-36 p-1.5'>
                            <MatrixCell
                              detail={detail}
                              objectId={o.id}
                              dimensionId={d.id}
                              latest={latest}
                              onScore={() => setCell({ o: o.id, d: d.id })}
                              onCell={() => onCell(o.id, d.id)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty
            title={t(search ? 'qc.noMatches' : 'qc.noObjects')}
            description={t(search ? 'qc.tryFilter' : 'qc.startObject')}
            action={
              <Button onClick={search ? () => setSearch('') : onCreate}>
                {t(search ? 'qc.clearFilters' : 'qc.newObject')}
              </Button>
            }
          />
        )}
        <p className='text-xs leading-6 text-muted-foreground'>
          {t('qc.coverageLegend')}
        </p>
        <CellResultsSheet
          detail={detail}
          data={latest}
          cell={cell}
          onClose={() => setCell(null)}
          onOpenRun={
            latest && cell
              ? () => onRun(latest.run.id, cell.o, cell.d)
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
function MatrixCell({
  detail,
  objectId,
  dimensionId,
  latest,
  onScore,
  onCell,
}: {
  detail: Detail;
  objectId: number;
  dimensionId: number;
  latest?: RunDetail;
  onScore: () => void;
  onCell: () => void;
}) {
  const { t } = useTranslation();
  const scored = latest
    ? cellScore(detail, latest.results, objectId, dimensionId)
    : null;
  const applicable = detail.applicability.some(
    (a) => a.objectId === objectId && a.dimensionId === dimensionId,
  );
  const { enabledShared, own } = checksFor(detail, objectId, dimensionId);
  const count = enabledShared.length + own.length;
  const breakdown = t('qc.cellBreakdown', {
    shared: enabledShared.length,
    own: own.length,
  });
  const base =
    'group flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ';
  if (scored && latest)
    return (
      <button
        type='button'
        className={
          base +
          'qc-tone ' +
          (!scored.complete
            ? 'qc-tone-muted'
            : scored.passed === scored.total
              ? 'qc-tone-good'
              : 'qc-tone-bad')
        }
        title={latest.run.key}
        onClick={onScore}
      >
        <ScoreChip {...scored} />
        <ChevronRight className='size-3' />
      </button>
    );
  if (!applicable)
    return (
      <span className='block px-3 text-center text-xs text-muted-foreground/60'>
        <span aria-hidden='true'>—</span>
        <span className='sr-only'>{t('qc.notApplicable')}</span>
      </span>
    );
  return count ? (
    <button
      type='button'
      className={base + 'qc-tone qc-tone-primary text-xs'}
      onClick={onCell}
      title={breakdown}
    >
      <span>
        <span className='font-medium'>{count} Check</span>
        <span className='block opacity-75'>{t('qc.notRun')}</span>
      </span>
      <ChevronRight className='size-3' />
    </button>
  ) : (
    <button
      type='button'
      className={
        base +
        'justify-center border-transparent text-xs text-muted-foreground hover:border-dashed hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:text-primary'
      }
      onClick={onCell}
    >
      <span
        aria-hidden='true'
        className='size-1.5 rounded-full bg-muted-foreground/30 group-hover:hidden group-focus-visible:hidden'
      />
      <span className='sr-only items-center gap-1 group-hover:not-sr-only group-hover:flex group-focus-visible:not-sr-only group-focus-visible:flex'>
        <Plus className='size-3' />
        {t('qc.defineCheck')}
      </span>
    </button>
  );
}
// The latest run's conclusion for a Check (on one object, or across all its objects).
function latestConclusion(
  results: readonly Result[] | undefined,
  checkId: number,
  objectId?: number,
) {
  const rows = (results ?? []).filter(
    (r) =>
      r.checkId === checkId &&
      (objectId === undefined || r.objectId === objectId),
  );
  if (!rows.length) return 'not_run';
  return rows.some((r) => r.conclusion === 'failed') ? 'failed' : 'passed';
}
function latestVersion(detail: Detail, checkId: number) {
  return Math.max(
    ...detail.standards
      .filter((s) => s.checkId === checkId)
      .map((s) => s.version),
  );
}
// Turns one shared Check off or on for one object; the Check keeps applying to the rest of its dimension.
// Includes or pauses every object in one category with a single switch; on only when all of them are included.
function GroupTestingSwitch({
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
function ObjectTestingSwitch({
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
function ExclusionSwitch({
  detail,
  check,
  objectId,
  onChanged,
}: {
  detail: Detail;
  check: Check;
  objectId: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const enabled = !isExcluded(detail, check.id, objectId);
  const object = detail.objects.find((o) => o.id === objectId);
  return (
    <span className='inline-flex items-center gap-2'>
      <Switch
        checked={enabled}
        disabled={busy}
        aria-label={t('qc.enabledFor', { name: object?.name || '' })}
        onCheckedChange={(next) =>
          void submit(
            'quality/projects/' +
              detail.project.id +
              '/checks/' +
              check.id +
              '/exclusions',
            { objectId, enabled: next },
            onChanged,
          )
        }
      />
      <span
        className={
          'text-xs ' + (enabled ? 'text-foreground' : 'text-muted-foreground')
        }
      >
        {t(enabled ? 'qc.enabled' : 'qc.disabled')}
      </span>
      {error && <span className='text-xs text-destructive'>{error}</span>}
    </span>
  );
}
function CheckList({
  detail,
  objectFilter,
  dimensionFilter,
  onClear,
  onOpen,
  onCreate,
  onChanged,
  latest,
}: {
  detail: Detail;
  objectFilter: string;
  dimensionFilter: string;
  onClear: () => void;
  onOpen: (c: Check) => void;
  onCreate: () => void;
  onChanged: () => void;
  latest?: RunDetail;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const objectId = objectFilter ? Number(objectFilter) : undefined;
  const objectDimensions = new Set(
    activeApplicability(detail)
      .filter((a) => a.objectId === objectId)
      .map((a) => a.dimensionId),
  );
  const matches = (c: Check) =>
    (!dimensionFilter || String(c.dimensionId) === dimensionFilter) &&
    c.name.toLowerCase().includes(search.toLowerCase());
  const shared = detail.checks.filter(
    (c) =>
      c.scope === 'shared' &&
      matches(c) &&
      (objectId === undefined || objectDimensions.has(c.dimensionId)),
  );
  const own = detail.checks.filter(
    (c) =>
      c.scope !== 'shared' &&
      matches(c) &&
      (objectId === undefined || c.objectId === objectId),
  );
  const dimensionName = (id: number) =>
    detail.dimensions.find((d) => d.id === id)?.name;
  const nameCell = (c: Check) => (
    <TableCell>
      <Button
        variant='link'
        className='h-auto max-w-sm whitespace-normal px-0 text-left'
        onClick={() => onOpen(c)}
      >
        {c.name}
      </Button>
    </TableCell>
  );
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative w-full sm:max-w-xs'>
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            aria-label={t('qc.searchChecks')}
            placeholder={t('qc.searchChecks')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='bg-card pl-9'
          />
        </div>
        {objectFilter && (
          <Badge variant='outline' className='qc-tone qc-tone-primary'>
            <FolderOpen />
            {detail.objects.find((o) => String(o.id) === objectFilter)?.name}
          </Badge>
        )}
        {dimensionFilter && (
          <Badge variant='outline' className='qc-tone qc-tone-primary'>
            <Layers3 />
            {dimensionName(Number(dimensionFilter))}
          </Badge>
        )}
        {(objectFilter || dimensionFilter || search) && (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setSearch('');
              onClear();
            }}
          >
            {t('qc.clearFilters')}
          </Button>
        )}
      </div>
      {!shared.length && !own.length ? (
        <Card className='qc-card'>
          <CardContent>
            <Empty
              title={t(detail.checks.length ? 'qc.noMatches' : 'qc.noChecks')}
              description={t(
                detail.checks.length ? 'qc.tryFilter' : 'qc.startCheck',
              )}
              action={<Button onClick={onCreate}>{t('qc.newCheck')}</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className='qc-card overflow-hidden'>
            <CardContent className='space-y-4 p-5'>
              <SectionTitle
                icon={<Layers3 />}
                title={t('qc.sharedChecks') + ' · ' + shared.length}
                description={t(
                  objectId === undefined
                    ? 'qc.sharedChecksBody'
                    : 'qc.sharedChecksObjectBody',
                )}
              />
              {shared.length ? (
                <div className='overflow-x-auto rounded-xl border'>
                  <Table>
                    <TableHeader>
                      <TableRow className='bg-muted/50 hover:bg-muted/50'>
                        <TableHead>{t('qc.check')}</TableHead>
                        <TableHead>{t('qc.dimension')}</TableHead>
                        <TableHead>
                          {t(
                            objectId === undefined
                              ? 'qc.reach'
                              : 'qc.forThisObject',
                          )}
                        </TableHead>
                        <TableHead>{t('qc.standardVersion')}</TableHead>
                        <TableHead>{t('qc.conclusion')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shared.map((c) => {
                        const reach = inheritingObjects(detail, c);
                        const on = reach.filter(
                          (o) =>
                            !o.testingPaused && !isExcluded(detail, c.id, o.id),
                        ).length;
                        return (
                          <TableRow key={c.id}>
                            {nameCell(c)}
                            <TableCell>
                              {dimensionName(c.dimensionId)}
                            </TableCell>
                            <TableCell>
                              {objectId === undefined ? (
                                <span className='text-sm tabular-nums'>
                                  {t('qc.reachCount', {
                                    on,
                                    total: reach.length,
                                  })}
                                </span>
                              ) : (
                                <ExclusionSwitch
                                  detail={detail}
                                  check={c}
                                  objectId={objectId}
                                  onChanged={onChanged}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              v{latestVersion(detail, c.id)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                kind='result'
                                value={latestConclusion(
                                  latest?.results,
                                  c.id,
                                  objectId,
                                )}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
                  {t('qc.noSharedChecks')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className='qc-card overflow-hidden'>
            <CardContent className='space-y-4 p-5'>
              <SectionTitle
                icon={<FolderOpen />}
                title={t('qc.ownChecks') + ' · ' + own.length}
                description={t('qc.ownChecksBody')}
              />
              {own.length ? (
                <div className='overflow-x-auto rounded-xl border'>
                  <Table>
                    <TableHeader>
                      <TableRow className='bg-muted/50 hover:bg-muted/50'>
                        {[
                          'check',
                          'object',
                          'dimension',
                          'standardVersion',
                          'conclusion',
                        ].map((k) => (
                          <TableHead key={k}>{t('qc.' + k)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {own.map((c) => (
                        <TableRow key={c.id}>
                          {nameCell(c)}
                          <TableCell>
                            {
                              detail.objects.find((o) => o.id === c.objectId)
                                ?.name
                            }
                          </TableCell>
                          <TableCell>{dimensionName(c.dimensionId)}</TableCell>
                          <TableCell>v{latestVersion(detail, c.id)}</TableCell>
                          <TableCell>
                            <StatusBadge
                              kind='result'
                              value={latestConclusion(latest?.results, c.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
                  {t('qc.noOwnChecks')}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DeleteCheck({
  detail,
  check,
  onDeleted,
}: {
  detail: Detail;
  check: Check;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <AlertDialogTrigger render={<Button variant='destructive' />}>
        <Trash2 data-icon='inline-start' />
        {t('qc.deleteCheck')}
      </AlertDialogTrigger>
      <AlertDialogContent size='sm'>
        <AlertDialogHeader>
          <AlertDialogMedia className='bg-destructive/10 text-destructive dark:bg-destructive/20'>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t('qc.deleteCheckTitle', { name: check.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('qc.deleteCheckBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t('qc.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={busy}
            onClick={() =>
              void submit(
                'quality/projects/' +
                  detail.project.id +
                  '/checks/' +
                  check.id +
                  '/archive',
                {},
                () => {
                  setOpen(false);
                  onDeleted();
                },
              )
            }
          >
            {t(busy ? 'qc.deleting' : 'qc.deleteCheck')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
function FormFrame({
  title,
  onCancel,
  busy,
  error,
  children,
  onSubmit,
  disabled = false,
}: {
  title: string;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
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
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
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
function ProjectForm({
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
function DefinitionForm({
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
function WorkItemForm({
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
function StandardForm({
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
  const [humanReview, setHumanReview] = useState(standard?.humanReview ?? true);
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
      onCancel={onCancel}
      busy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const body = {
          definition: values.definition,
          preconditions: values.preconditions,
          steps: values.steps,
          passCriteria: values.passCriteria,
          evidence: values.evidence,
          humanReview,
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
                  scope,
                  dimensionId: Number(sharedDimensionId),
                }
              : {
                  ...body,
                  name: values.name,
                  scope,
                  objectId: Number(objectId),
                  dimensionId: Number(dimensionId),
                },
            onSaved,
          );
      }}
    >
      {!check && (
        <>
          <fieldset className='space-y-3'>
            <legend className='mb-3 font-medium'>{t('qc.scope')}</legend>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as CheckScope)}
              className='grid gap-3 sm:grid-cols-2'
            >
              {(['shared', 'object'] as const).map((v) => (
                <label
                  key={v}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ' +
                    (scope === v
                      ? 'border-primary/50 bg-primary/5'
                      : 'hover:bg-muted/50')
                  }
                >
                  <RadioGroupItem value={v} className='mt-0.5' />
                  <span>
                    <span className='block font-medium'>
                      {t('qc.scopeName.' + v)}
                    </span>
                    <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                      {t('qc.scopeHint.' + v)}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <Field name='name' label={t('qc.checkName')} maxLength={120} />
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
          label={t('qc.' + field)}
          multiline
          defaultValue={standard?.[field] || ''}
        />
      ))}
      <label className='flex items-center gap-3 text-sm'>
        <Checkbox checked={humanReview} onCheckedChange={setHumanReview} />
        {t('qc.humanRequired')}
      </label>
      <p className='text-xs leading-6 text-muted-foreground'>
        {t('qc.stepsHint')}
      </p>
    </FormFrame>
  );
}
function InheritingObjects({
  detail,
  check,
  onChanged,
  latest,
}: {
  detail: Detail;
  check: Check;
  onChanged: () => void;
  latest?: RunDetail;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const reach = inheritingObjects(detail, check);
  const on = reach.filter(
    (o) => !o.testingPaused && !isExcluded(detail, check.id, o.id),
  ).length;
  const rows = reach.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Card className='qc-card'>
      <CardContent className='space-y-4 p-5'>
        <SectionTitle
          icon={<Layers3 />}
          title={t('qc.inheriting')}
          description={t('qc.reachCount', { on, total: reach.length })}
        />
        <Input
          aria-label={t('qc.searchObjects')}
          placeholder={t('qc.searchObjects')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='bg-background'
        />
        <ul className='max-h-[26rem] divide-y overflow-y-auto rounded-xl border'>
          {rows.map((o) => {
            const enabled = !isExcluded(detail, check.id, o.id);
            return (
              <li
                key={o.id}
                className={
                  'flex items-center gap-3 px-3 py-2.5 ' +
                  (enabled ? '' : 'bg-muted/40')
                }
              >
                <span className='min-w-0 flex-1'>
                  <span
                    className={
                      'block truncate text-sm ' +
                      (enabled ? 'font-medium' : 'text-muted-foreground')
                    }
                  >
                    {o.name}
                  </span>
                  {enabled && (
                    <span className='mt-1 block'>
                      <StatusBadge
                        kind='result'
                        value={latestConclusion(
                          latest?.results,
                          check.id,
                          o.id,
                        )}
                      />
                    </span>
                  )}
                </span>
                <ExclusionSwitch
                  detail={detail}
                  check={check}
                  objectId={o.id}
                  onChanged={onChanged}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
