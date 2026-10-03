import type { CriticRun, StatusResponse, WatchEntry } from '../../../shared/api.ts';
import { Accent, Hero, Section } from '../../components/shell/index.ts';
import {
  chipClass,
  EmptyState,
  linkClass,
  monoClass,
  Note,
  RuledItem,
  RuledList,
} from '../../components/ui/index.ts';
import { cn } from '../../lib/cn.ts';
import { selectFiled } from './statusSlice.ts';
import { StatusGate, StatusNotes } from './StatusNotes.tsx';

function RunBlock({ run, threshold }: { run: CriticRun; threshold: number }) {
  return (
    <div className="mt-10 first:mt-6">
      <h3 className="font-mono text-label uppercase text-muted tnum">
        <a href={run.url} target="_blank" rel="noopener" className={linkClass}>
          <time dateTime={run.date}>{run.date}</time>
        </a>
      </h3>
      <RuledList className="mt-4">
        {run.rows.map((row) => {
          const filed = selectFiled(row, threshold);
          return (
            <RuledItem
              key={row.name}
              meta={<span className={cn(monoClass, filed && 'text-brand')}>{row.total}/20</span>}
              aside={filed ? <span className={chipClass}>filed</span> : undefined}
            >
              <h4 className="text-h3 font-semibold text-ink">
                <a href={run.url} target="_blank" rel="noopener" className={linkClass}>
                  {row.name}
                </a>
              </h4>
              <p className={cn(monoClass, 'mt-2 text-small text-muted')}>
                Pain {row.pain} · Competition {row.competition} · MVP {row.mvp} · Reach {row.reach}
              </p>
              {row.verdict ? (
                <p className="mt-2 max-w-prose text-small text-muted">{row.verdict}</p>
              ) : null}
            </RuledItem>
          );
        })}
      </RuledList>
    </div>
  );
}

function WatchRow({ entry, url }: { entry: WatchEntry; url: string }) {
  return (
    <RuledItem
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
      <h4 className="text-h3 font-semibold text-ink">
        <a href={url} target="_blank" rel="noopener" className={linkClass}>
          {entry.name}
        </a>
      </h4>
      {entry.lastEvidence ? (
        <p className="mt-2 max-w-prose text-small text-muted">{entry.lastEvidence}</p>
      ) : null}
      {entry.needs ? (
        <p className="mt-2 max-w-prose text-small text-muted">Needs: {entry.needs}</p>
      ) : null}
    </RuledItem>
  );
}

function IdeasSections({ data }: { data: StatusResponse }) {
  return (
    <>
      <Section
        id="scored"
        index="01"
        label="Scored"
        title="Every card the Critic scored, newest run first"
      >
        <Note>Cards with a total of {data.filedThreshold} or more are filed as issues.</Note>
        {data.runs.length > 0 ? (
          data.runs.map((run) => (
            <RunBlock key={run.file} run={run} threshold={data.filedThreshold} />
          ))
        ) : (
          <div className="mt-6">
            <EmptyState
              title="No Ideas run yet"
              body="Scored cards appear here once the Critic has run."
            />
          </div>
        )}
      </Section>
      <Section
        id="watchlist"
        index="02"
        label="Watchlist"
        title="Near misses and what each still needs"
        tone="zone"
      >
        {data.watchlist.length > 0 ? (
          <RuledList>
            {data.watchlist.map((entry) => (
              <WatchRow key={entry.name} entry={entry} url={data.watchlistUrl} />
            ))}
          </RuledList>
        ) : (
          <EmptyState title="The watchlist is empty" body="Near misses are listed here." />
        )}
      </Section>
    </>
  );
}

export default function Ideas() {
  return (
    <>
      <Hero
        title={
          <>
            Every idea, <Accent>scored</Accent>.
          </>
        }
        lede="Each card gets four scores out of five: pain, competition, MVP and reach. The total decides whether it is filed."
        footnote={<StatusNotes />}
      />
      <StatusGate label="Scored">{(data) => <IdeasSections data={data} />}</StatusGate>
    </>
  );
}
