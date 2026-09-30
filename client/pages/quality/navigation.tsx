import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  LayoutDashboard,
  Grid2X2,
  BookOpen,
  Workflow,
  SlidersHorizontal,
  Plus,
  Layers3,
  History,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Project } from './types.js';
export function QualityNavigation({ onNavigate }: { onNavigate: () => void }) {
  const api = useApiClient();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const project = params.get('project') || '';
  const view = params.get('view') || 'overview';
  useEffect(() => {
    let active = true;
    void api
      .request<{ data: Project[] }>({ path: 'quality/projects' })
      .then((r) => {
        if (active) {
          setProjects(r.data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, revision]);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener('quality-projects-changed', refresh);
    window.addEventListener('quality-todo-changed', refresh);
    return () => {
      window.removeEventListener('quality-projects-changed', refresh);
      window.removeEventListener('quality-todo-changed', refresh);
    };
  }, []);
  // Open to-dos assigned to the signed-in user, shown beside the menu entry.
  const [openTodos, setOpenTodos] = useState(0);
  useEffect(() => {
    if (!project) return;
    let active = true;
    void api
      .request<{ data: { status: string }[] }>({
        path: 'quality/projects/' + project + '/work-items',
      })
      .then((r) => {
        if (active)
          setOpenTodos(
            Array.isArray(r.data)
              ? r.data.filter((i) => i.status === 'open').length
              : 0,
          );
      })
      .catch(() => {
        if (active) setOpenTodos(0);
      });
    return () => {
      active = false;
    };
  }, [api, project, revision, view]);
  const [, setParams] = useSearchParams();
  return (
    <div className='flex h-full flex-col gap-5'>
      <div className='space-y-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3'>
        <p className='flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
          <Layers3 className='size-4' />
          {t('qc.project')}
        </p>
        <Select
          items={projects.map((p) => ({ value: String(p.id), label: p.name }))}
          value={project}
          onValueChange={(v) => {
            if (v) {
              setParams({ project: v, view: 'overview' });
              onNavigate();
            }
          }}
        >
          <SelectTrigger
            className='h-auto min-h-10 w-full bg-background py-2'
            aria-label={t('qc.switchProject')}
          >
            <SelectValue placeholder={t('qc.selectProject')} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem value={String(p.id)} key={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {failed && (
          <Button
            variant='outline'
            size='sm'
            onClick={() => setRevision((v) => v + 1)}
          >
            {t('qc.retry')}
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          className='w-full justify-start text-muted-foreground'
          render={
            <Link
              to={
                '/quality?view=new-project' +
                (project ? '&project=' + project : '')
              }
            />
          }
          nativeButton={false}
          onClick={onNavigate}
        >
          <Plus />
          {t('qc.newProject')}
        </Button>
      </div>
      <p className='px-3 text-xs font-medium tracking-wider text-muted-foreground'>
        {t('qc.workspace')}
      </p>
      <div className='space-y-1'>
        {[
          ['overview', LayoutDashboard],
          ['coverage', Grid2X2],
          ['checks', BookOpen],
          ['runs', History],
          ['todo', Inbox],
          ['tasks', Workflow],
          ['configuration', SlidersHorizontal],
        ].map(([key, Icon]) => {
          const slug = String(key);
          const NavIcon = Icon as typeof LayoutDashboard;
          return (
            <Button
              key={slug}
              nativeButton={false}
              render={
                <Link to={'/quality?project=' + project + '&view=' + slug} />
              }
              variant='ghost'
              className={
                'h-11 w-full justify-start rounded-xl px-3 ' +
                (view === slug
                  ? 'bg-primary/10 font-semibold text-primary hover:bg-primary/15'
                  : 'text-muted-foreground')
              }
              onClick={onNavigate}
            >
              <NavIcon className='mr-1 size-4' />
              {t('qc.' + slug)}
              {slug === 'todo' && openTodos > 0 && (
                <span className='ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums'>
                  {openTodos}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <div className='mt-auto rounded-xl bg-sidebar-accent/50 p-4 text-xs leading-6 text-muted-foreground'>
        {t('qc.principle')}
      </div>
    </div>
  );
}
