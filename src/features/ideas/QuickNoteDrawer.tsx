import { useState, type FormEvent } from 'react';
import type { NewIdeaResponse, NewNote, NoteKind } from '../../../shared/api.ts';
import { useAppDispatch } from '../../app/hooks.ts';
import { Button, Drawer, Note, Segmented, TextArea, linkClass } from '../../components/ui/index.ts';
import { messageOf } from '../../lib/api.ts';
import { createNote } from '../project/projectSlice.ts';

const EMPTY: NewNote = { kind: 'Idea', note: '', links: '' };

const KINDS = [
  { value: 'Idea', label: 'Idea' },
  { value: 'Evidence', label: 'Evidence' },
] as const;

const NEXT: Record<NoteKind, string> = {
  Idea: 'The Scribe turns it into an idea card in about a minute.',
  Evidence: 'Added to the field notes in about a minute.',
};

/** A note the owner jots down: filed as an issue, which the Scribe turns into an idea card or field notes. */
export function QuickNoteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<NewNote>(EMPTY);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<{ kind: NoteKind; issue: NewIdeaResponse } | null>(null);

  const close = () => {
    setFiled(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.note.trim()) {
      setMissing('Write the note first.');
      return;
    }
    setMissing(null);
    setBusy(true);
    setError(null);
    try {
      const issue = await dispatch(createNote(draft)).unwrap();
      setFiled({ kind: draft.kind, issue });
      setDraft(EMPTY);
    } catch (e) {
      setError(messageOf(e, 'GitHub did not take it. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      eyebrow="Quick note"
      title="Jot it down"
      footer={
        filed ? (
          <>
            <Button size="sm" onClick={() => setFiled(null)}>
              Write another
            </Button>
            <Button size="sm" onClick={close}>
              Close
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" form="quick-note" disabled={busy}>
              {busy ? 'Filing…' : 'File note'}
            </Button>
          </>
        )
      }
    >
      {filed ? (
        <div role="status" className="space-y-3 text-body text-ink">
          <p>{NEXT[filed.kind]}</p>
          <p>
            <a
              href={filed.issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Issue #{filed.issue.number}
            </a>
          </p>
        </div>
      ) : (
        <form id="quick-note" noValidate onSubmit={(e) => void submit(e)} className="space-y-5">
          <Segmented
            label="Kind"
            options={KINDS}
            value={draft.kind}
            onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
          />
          <TextArea
            label="Note"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            error={missing ?? undefined}
            hint="Idea: the problem and what you'd build. Evidence: what someone said, quoted, and who they are."
          />
          <TextArea
            label="Links"
            rows={3}
            value={draft.links}
            onChange={(e) => setDraft((d) => ({ ...d, links: e.target.value }))}
            hint="One per line. The thread or post itself."
          />
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          <Note>Filed as you on GitHub, labelled note.</Note>
        </form>
      )}
    </Drawer>
  );
}
