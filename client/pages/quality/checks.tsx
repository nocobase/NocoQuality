import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { FolderOpen, Layers3, Search, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Check, Detail, RunDetail } from './types.js';
import { activeApplicability, inheritingObjects, isExcluded } from './model.js';
import { Empty } from './form.js';
import { SectionTitle, StatusBadge } from './ui.js';
import { useSubmission } from './use-submission.js';
import { latestConclusion, latestVersion } from './model.js';
// The Check library: shared and object Checks, per-object switches and deletion.

// Turns one shared Check off or on for one object; the Check keeps applying to the rest of its dimension.
export function ExclusionSwitch({
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
export function CheckList({
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

export function DeleteCheck({
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
export function InheritingObjects({
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
