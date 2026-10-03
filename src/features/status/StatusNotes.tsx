import type { ReactNode } from 'react';
import type { StatusResponse } from '../../../shared/api.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { Section as RailSection } from '../../components/shell/index.ts';
import { Button, EmptyState, Note, Skeleton } from '../../components/ui/index.ts';
import { formatUpdated } from '../../lib/format.ts';
import { fetchStatus, selectStatus } from './statusSlice.ts';

/** "Updated <time>", plus the stale note when GitHub did not answer. Renders nothing before data arrives. */
export function StatusNotes() {
  const { data } = useAppSelector(selectStatus);
  if (!data) return null;
  return (
    <>
      <Note>
        Updated <time dateTime={data.fetchedAt}>{formatUpdated(data.fetchedAt)}</time>
      </Note>
      {data.stale ? <Note>GitHub did not answer, so this is the last copy we have.</Note> : null}
    </>
  );
}

interface StatusGateProps {
  /** Rail label and title for the placeholder sections shown while loading or after an error. */
  label: string;
  children: (data: StatusResponse) => ReactNode;
}

/** Loading skeletons, the error state with a retry, or the screen's sections once data is there. */
export function StatusGate({ label, children }: StatusGateProps) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectStatus);

  if (data) return <>{children(data)}</>;

  if (status === 'error') {
    return (
      <RailSection id="status" index="01" label={label}>
        <div role="alert">
          <EmptyState
            title="Could not load the pipeline"
            body={error ?? 'Something went wrong.'}
            action={
              <Button
                onClick={() => {
                  void dispatch(fetchStatus());
                }}
              >
                Try again
              </Button>
            }
          />
        </div>
      </RailSection>
    );
  }

  return (
    <RailSection id="status" index="01" label={label}>
      <div role="status" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-2/3" />
      </div>
    </RailSection>
  );
}
