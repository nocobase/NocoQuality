import { useTranslation } from '@nocobase/i18n/client';
import { Fragment, useState } from 'react';
import { ChevronRight, CirclePause, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Detail, RunDetail } from './types.js';
import {
  cellScore,
  testedApplicability,
  checksFor,
  effectiveCount,
} from './model.js';
import { Empty } from './form.js';
import { CellResultsSheet, ScoreChip } from './runs.js';
import { useLatestRun } from './use-quality-data.js';
// The quality matrix: objects by dimensions, each cell showing its latest run score or what is missing.

export function Coverage({
  detail,
  onCell,
  onCreate,
  onRun,
  onChanged,
  revision,
}: {
  detail: Detail;
  onCell: (o: number, d: number) => void;
  onCreate: () => void;
  onRun: (runId: number, objectId: number, dimensionId: number) => void;
  onChanged: () => void;
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
                    // A dimension without any Check yet stays visible but recedes, so it does not read as a gap in results.
                    return (
                      <TableHead
                        key={d.id}
                        className={
                          'min-w-36 ' +
                          (withChecks
                            ? ''
                            : 'font-normal text-muted-foreground')
                        }
                      >
                        {d.name}
                        <span
                          aria-hidden='true'
                          className='mt-0.5 block text-[11px] font-normal text-muted-foreground'
                        >
                          {withChecks
                            ? t('qc.objectsWithChecks', {
                                done: withChecks,
                                total: own.length,
                              })
                            : t('qc.noDimensionChecks')}
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
                              paused={o.testingPaused}
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
          onChanged={onChanged}
        />
      </CardContent>
    </Card>
  );
}
function MatrixCell({
  detail,
  paused,
  objectId,
  dimensionId,
  latest,
  onScore,
  onCell,
}: {
  detail: Detail;
  paused: boolean;
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
  // A paused object is left out of runs, so an older score would read as current; show no score for it.
  if (paused && applicable)
    return (
      <span className='block px-3 text-center text-xs text-muted-foreground/60'>
        <span aria-hidden='true'>—</span>
        <span className='sr-only'>{t('qc.paused')}</span>
      </span>
    );
  if (scored && latest)
    return (
      <button
        type='button'
        className={
          base +
          'qc-tone ' +
          (scored.total > scored.passed
            ? 'qc-tone-bad'
            : scored.pending
              ? 'qc-tone-warn'
              : !scored.complete
                ? 'qc-tone-muted'
                : 'qc-tone-good')
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
