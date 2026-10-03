import { useAppSelector } from '../../app/hooks.ts';
import { Accent, Hero, Section } from '../../components/shell/index.ts';
import {
  CellGrid,
  chipClass,
  DetailList,
  EmptyState,
  linkClass,
  monoClass,
  RuledItem,
  RuledList,
  Stat,
} from '../../components/ui/index.ts';
import { selectLatestRun, selectStateCounts } from './statusSlice.ts';
import { StatusGate, StatusNotes } from './StatusNotes.tsx';

function PipelineSection() {
  const counts = useAppSelector(selectStateCounts);
  return (
    <Section id="pipeline" index="01" label="Pipeline" title="One count per state">
      <CellGrid columns={4}>
        {counts.map(({ state, count }) => (
          <Stat key={state} value={count} caption={state} />
        ))}
      </CellGrid>
    </Section>
  );
}

function LatestRunSection() {
  const run = useAppSelector(selectLatestRun);
  return (
    <Section
      id="latest-run"
      index="02"
      label="Latest run"
      title="The newest Ideas run in numbers"
      tone="zone"
    >
      {run ? (
        <DetailList
          onZone
          items={[
            {
              label: 'Date',
              value: (
                <a
                  href={run.url}
                  target="_blank"
                  rel="noopener"
                  className={`${linkClass} ${monoClass}`}
                >
                  <time dateTime={run.date}>{run.date}</time>
                </a>
              ),
            },
            { label: 'Scored', value: <span className={monoClass}>{run.scored}</span> },
            {
              label: 'Filed',
              value: <span className={`${monoClass} text-brand`}>{run.filed}</span>,
            },
            { label: 'Rejected', value: <span className={monoClass}>{run.rejected}</span> },
          ]}
        />
      ) : (
        <EmptyState
          title="No Ideas run yet"
          body="Scored cards appear here once the Critic has run."
        />
      )}
    </Section>
  );
}

export default function Overview() {
  return (
    <>
      <Hero
        title={
          <>
            What the pipeline did, in <Accent>public</Accent>.
          </>
        }
        lede="Greenlight scores product ideas, files the best and rejects the rest. This page shows what it did, and which products are live."
        footnote={<StatusNotes />}
      />
      <StatusGate label="Pipeline">
        {(data) => (
          <>
            <PipelineSection />
            <LatestRunSection />
            <Section id="live" index="03" label="Live" title="Products that shipped">
              {data.live.length > 0 ? (
                <RuledList>
                  {data.live.map((product) => (
                    <RuledItem
                      key={product.issue}
                      meta={<span className={monoClass}>#{product.issue}</span>}
                      aside={
                        product.verdict ? (
                          <span className={chipClass}>{product.verdict}</span>
                        ) : undefined
                      }
                    >
                      <h3 className="text-h3 font-semibold text-ink">
                        <a
                          href={product.liveUrl ?? product.issueUrl}
                          target="_blank"
                          rel="noopener"
                          className={linkClass}
                        >
                          {product.name}
                        </a>
                      </h3>
                      {product.reason ? (
                        <p className="mt-2 max-w-prose text-small text-muted">{product.reason}</p>
                      ) : null}
                    </RuledItem>
                  ))}
                </RuledList>
              ) : (
                <EmptyState
                  title="Nothing live yet"
                  body="Products appear here once the pipeline ships them."
                />
              )}
            </Section>
          </>
        )}
      </StatusGate>
    </>
  );
}
