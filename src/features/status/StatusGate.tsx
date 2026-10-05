import type { ReactNode } from 'react';
import type { StatusResponse } from '../../../shared/api.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { Button, EmptyState, Note, Skeleton } from '../../components/ui/index.ts';
import { formatUpdated } from '../../lib/format.ts';
import { fetchStatus, selectStatus } from './statusSlice.ts';

/** "Updated <time>" for a view header's meta line. */
export function Updated({ data }: { data: StatusResponse }) {
  return (
    <>
      Updated <time dateTime={data.fetchedAt}>{formatUpdated(data.fetchedAt)}</time>
    </>
  );
}

/** Shown under the view header when the Worker served its last copy because GitHub did not answer. */
export function StaleNote({ data }: { data: StatusResponse }) {
  if (!data.stale) return null;
  return (
    <Note className="px-edge pt-4">GitHub did not answer, so this is the last copy we have.</Note>
  );
}

/** Loading skeletons shaped like the board, the error with a retry, or the view once data is there. */
export function StatusGate({ children }: { children: (data: StatusResponse) => ReactNode }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectStatus);

  if (data) return <>{children(data)}</>;

  if (status === 'error') {
    return (
      <div role="alert" className="px-edge py-6">
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
    );
  }

  return (
    <div role="status" aria-label="Loading" className="space-y-6 px-edge py-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
