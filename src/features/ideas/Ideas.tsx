import { useState } from 'react';
import type { CriticRun, StatusResponse, WatchEntry } from '../../../shared/api.ts';
import { ViewHeader } from '../../components/shell/index.ts';
import {
  EmptyState,
  Note,
  RuledItem,
  RuledList,
  Segmented,
  chipClass,
  linkClass,
  monoClass,
} from '../../components/ui/index.ts';
import { cn } from '../../lib/cn.ts';
import { StaleNote, StatusGate, Updated } from '../status/StatusGate.tsx';
import { selectFiled } from '../status/statusSlice.ts';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function RunBlock({ run, threshold }: { run: CriticRun; threshold: number }) {
  return (
    <section aria-label={`Run of ${run.date}`} className="space-y-3">
      <h2 className="font-mono text-label uppercase text-muted tnum">
        <a href={run.url} {...external} className={linkClass}>
          <time dateTime={run.date}>{run.date}</time>
        </a>
      </h2>
      <RuledList>
        {run.rows.map((row) => {
          const filed = selectFiled(row, threshold);
          return (
            <RuledItem
              key={row.name}
              className="py-4 sm:py-4"
              meta={<span className={cn(monoClass, filed && 'text-brand')}>{row.total}/20</span>}
              aside={filed ? <span className={chipClass}>filed</span> : undefined}
            >
              <h3 className="font-semibold text-ink">
                <a href={run.url} {...external} className={linkClass}>
                  {row.name}
                </a>
              </h3>
              <p className={cn(monoClass, 'mt-1 text-small text-muted')}>
                Pain {row.pain} · Competition {row.competition} · MVP {row.mvp} · Reach {row.reach}
              </p>
              {row.verdict ? (
                <p className="mt-1 max-w-prose text-small text-muted">{row.verdict}</p>
              ) : null}
            </RuledItem>
          );
        })}
      </RuledList>
    </section>
  );
}

function WatchRow({ entry, url }: { entry: WatchEntry; url: string }) {
  return (
    <RuledItem
      className="py-4 sm:py-4"
      meta={
        <>
          {entry.bestScore !== null ? <p className={monoClass}>{entry.bestScore}/20</p> : null}
          {entry.bestScoreDate ? (
            <p>
              <time dateTime={entry.bestScoreDate}>{entry.bestScoreDate}</time>
            </p>
          ) : null}
        </>
      }
    >
      <h3 className="font-semibold text-ink">
        <a href={url} {...external} className={linkClass}>
          {entry.name}
        </a>
      </h3>
      {entry.lastEvidence ? (
        <p className="mt-1 max-w-prose text-small text-muted">{entry.lastEvidence}</p>
      ) : null}
      {entry.needs ? (
        <p className="mt-1 max-w-prose text-small text-muted">Needs: {entry.needs}</p>
      ) : null}
    </RuledItem>
  );
}

type Tab = 'scored' | 'watchlist';

function IdeasView({ data }: { data: StatusResponse }) {
  const [tab, setTab] = useState<Tab>('scored');
  const scored = data.runs.reduce((n, run) => n + run.rows.length, 0);
  return (
    <>
      <ViewHeader
        title="Ideas"
        meta={
          <span className="tnum">
            {scored} cards scored in {data.runs.length} {data.runs.length === 1 ? 'run' : 'runs'}
            {' · '}
            <Updated data={data} />
          </span>
        }
        toolbar={
          <Segmented
            label="Show"
            options={[
              { value: 'scored', label: 'Scored', count: scored },
              { value: 'watchlist', label: 'Watchlist', count: data.watchlist.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        }
      />
      <StaleNote data={data} />
      <div className="space-y-8 px-edge py-6">
        {tab === 'scored' ? (
          <>
            <Note>
              Four scores out of five each. Cards with a total of {data.filedThreshold} or more are
              filed as issues.
            </Note>
            {data.runs.length > 0 ? (
              data.runs.map((run) => (
                <RunBlock key={run.file} run={run} threshold={data.filedThreshold} />
              ))
            ) : (
              <EmptyState
                title="No Ideas run yet"
                body="Scored cards appear here once the Critic has run."
              />
            )}
          </>
        ) : data.watchlist.length > 0 ? (
          <>
            <Note>Near misses: cards that scored 11 to 13, and what each still needs.</Note>
            <RuledList>
              {data.watchlist.map((entry) => (
                <WatchRow key={entry.name} entry={entry} url={data.watchlistUrl} />
              ))}
            </RuledList>
          </>
        ) : (
          <EmptyState title="The watchlist is empty" body="Near misses are listed here." />
        )}
      </div>
    </>
  );
}

export default function Ideas() {
  return <StatusGate>{(data) => <IdeasView data={data} />}</StatusGate>;
}
