import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowLeft,
  History,
  FolderOpen,
  Link2,
  Pencil,
  Layers3,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import type { Detail, Project } from './types.js';
import { activeApplicability } from './model.js';
import { Overview } from './overview.js';
import { Choice, Empty } from './form.js';
import { ArchivedCard, CheckEditForm, ObjectEditForm } from './definitions.js';
import { CheckConclusion, ReportText, SectionTitle } from './ui.js';
import { CheckSettings, RunList, RunView, WorkItemsView } from './runs.js';
import { useLatestRun } from './use-quality-data.js';
import { Coverage } from './coverage.js';
import { CheckList, DeleteCheck, InheritingObjects } from './checks.js';
import {
  DefinitionForm,
  ProjectForm,
  StandardForm,
  WorkItemForm,
} from './editors.js';
import { GroupTestingSwitch, ObjectTestingSwitch } from './definitions.js';

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
  const editingObject =
    view === 'edit-object'
      ? detail.objects.find((o) => String(o.id) === record)
      : undefined;
  const versions = check
    ? detail.standards
        .filter((s) => s.checkId === check.id)
        .sort((a, b) => b.version - a.version)
    : [];
  const standard =
    versions.find((s) => String(s.id) === params.get('standard')) ||
    versions[0];
  const title = t(
    'qc.' +
      (view === 'standard' ? 'standard' : view === 'tasks' ? 'todo' : view),
  );
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
        <Overview
          detail={detail}
          go={go}
          revision={revision}
          onChanged={refresh}
          onNotice={setNotice}
        />
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
          onChanged={refresh}
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
          onChanged={refresh}
          initialOnlyFailed={params.get('failed') === '1'}
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
      {/* "tasks" is the former name of everyone's to-dos; old links still land on the merged page. */}
      {(view === 'todo' || view === 'tasks') && (
        <WorkItemsView
          key={view + (params.get('scope') ?? '')}
          detail={detail}
          go={go}
          revision={revision}
          onChanged={refresh}
          defaultScope={
            view === 'tasks' || params.get('scope') === 'all' ? 'all' : 'mine'
          }
        />
      )}
      {view === 'new-work-item' && (
        <WorkItemForm
          detail={detail}
          onCancel={() => go('todo')}
          onSaved={() => saved(t('qc.saved'), 'todo', { scope: 'all' })}
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
                            <span className='flex min-w-0 items-center gap-1'>
                              <span
                                className={
                                  'min-w-0 truncate text-sm ' +
                                  (o.testingPaused
                                    ? 'text-muted-foreground'
                                    : '')
                                }
                                title={(o.materials ?? [])
                                  .map((m) => m.ref)
                                  .join('\n')}
                              >
                                {o.name}
                              </span>
                              {!!o.materials?.length && (
                                <Badge variant='secondary'>
                                  {o.materials.length}
                                </Badge>
                              )}
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('qc.editObject') + ' ' + o.name}
                                onClick={() =>
                                  go('edit-object', { record: String(o.id) })
                                }
                              >
                                <Pencil />
                              </Button>
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
          <ArchivedCard
            detail={detail}
            revision={revision}
            onRestored={() => saved(t('qc.restored'), 'configuration')}
          />
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
      {view === 'edit-check' && check && (
        <CheckEditForm
          key={check.id}
          detail={detail}
          check={check}
          onCancel={() => go('standard', { record: String(check.id) })}
          onSaved={() =>
            saved(t('qc.saved'), 'standard', { record: String(check.id) })
          }
        />
      )}
      {view === 'edit-object' && editingObject && (
        <ObjectEditForm
          key={editingObject.id}
          detail={detail}
          object={editingObject}
          onCancel={() => go('configuration')}
          onSaved={() => saved(t('qc.saved'), 'configuration')}
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
                onClick={() => go('edit-check', { record: String(check.id) })}
              >
                {t('qc.editCheck')}
              </Button>
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
                          (standard.judgeMode === 'human'
                            ? 'qc-tone-warn'
                            : 'qc-tone-muted')
                        }
                      >
                        {t(
                          'qc.checkKindName.' +
                            (standard.judgeMode === 'human'
                              ? 'human'
                              : 'automated'),
                        )}
                      </Badge>
                      {standard.judgeMode !== 'human' && (
                        <Badge
                          variant='outline'
                          className='qc-tone qc-tone-muted'
                          title={t('qc.judgeHint.' + standard.judgeMode)}
                        >
                          {t('qc.judgeLabel')} ·{' '}
                          {t('qc.judgeMode.' + standard.judgeMode)}
                        </Badge>
                      )}
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
                  {standard.command && (
                    <section className='grid gap-3 p-6 md:grid-cols-[2rem_1fr]'>
                      <span className='qc-icon-tile flex size-7 items-center justify-center rounded-lg font-mono text-xs'>
                        {standardFields.length + 1}
                      </span>
                      <div className='min-w-0'>
                        <h3 className='mb-2 font-semibold'>
                          {t('qc.command')}
                        </h3>
                        <code className='block rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all'>
                          {standard.command}
                        </code>
                      </div>
                    </section>
                  )}
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
              <Card className='qc-card'>
                <CardContent className='space-y-3 p-5'>
                  <SectionTitle
                    icon={<Link2 />}
                    title={t('qc.source')}
                    description={t('qc.sourceHint')}
                  />
                  {check.source ? (
                    <div className='text-sm text-muted-foreground'>
                      <ReportText text={check.source} />
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('qc.noSource')}
                    </p>
                  )}
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
                    <CheckConclusion
                      detail={detail}
                      check={check}
                      results={latest?.results}
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
