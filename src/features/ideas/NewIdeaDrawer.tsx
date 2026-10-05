import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { NewIdea } from '../../../shared/api.ts';
import { useAppDispatch } from '../../app/hooks.ts';
import { Button, Checkbox, Drawer, Field, Note, TextArea } from '../../components/ui/index.ts';
import { createIdea } from '../project/projectSlice.ts';
import { messageOf } from '../../lib/api.ts';
import { repoSlug } from './slug.ts';

const EMPTY: NewIdea = {
  title: '',
  problem: '',
  users: '',
  mvp: '',
  competition: '',
  signals: '',
  nongoals: '',
  approve: false,
};

/**
 * The Idea form, without leaving the board: the same fields GitHub's form has (the Architect reads both alike), the
 * repo name it will become, and the option to approve it in the same step.
 */
export function NewIdeaDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [idea, setIdea] = useState<NewIdea>(EMPTY);
  const [missing, setMissing] = useState<Partial<Record<keyof NewIdea, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof NewIdea) => (value: string) => setIdea((i) => ({ ...i, [key]: value }));
  const slug = repoSlug(idea.title);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const required = {
      title: 'Give it a name.',
      problem: 'Say who hurts and how.',
      users: 'Name the first users.',
      mvp: 'List the smallest thing that proves it.',
    } as const;
    const gaps = Object.fromEntries(
      Object.entries(required).filter(([key]) => !idea[key as keyof typeof required].trim()),
    );
    setMissing(gaps);
    if (Object.keys(gaps).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await dispatch(createIdea(idea)).unwrap();
      setIdea(EMPTY);
      onClose();
      void navigate(`/p/${created.number}`);
    } catch (e) {
      setError(messageOf(e, 'GitHub did not take it. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="New idea"
      title="Write an idea card"
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" form="new-idea" disabled={busy}>
            {busy ? 'Filing…' : idea.approve ? 'File and approve' : 'File idea'}
          </Button>
        </>
      }
    >
      <form id="new-idea" noValidate onSubmit={(e) => void submit(e)} className="space-y-5">
        <Field
          label="Name"
          value={idea.title}
          maxLength={60}
          onChange={(e) => set('title')(e.target.value)}
          error={missing.title}
          hint={
            slug ? `Becomes the product repo: ${slug}` : 'Short: it becomes the product repo name.'
          }
        />
        <TextArea
          label="Problem"
          value={idea.problem}
          onChange={(e) => set('problem')(e.target.value)}
          error={missing.problem}
          hint="Who hurts, how, how often. Link the evidence."
        />
        <Field
          label="Target users"
          value={idea.users}
          onChange={(e) => set('users')(e.target.value)}
          error={missing.users}
          hint="The first 100 users, and where they hang out."
        />
        <TextArea
          label="MVP in one day"
          value={idea.mvp}
          onChange={(e) => set('mvp')(e.target.value)}
          error={missing.mvp}
          placeholder={'- Upload a glossary per client\n- Paste text, highlight its terms'}
          hint="3–6 lines starting with “- ”."
        />
        <TextArea
          label="Existing alternatives"
          rows={3}
          value={idea.competition}
          onChange={(e) => set('competition')(e.target.value)}
          hint="Optional. What people use today and why it falls short."
        />
        <TextArea
          label="Signals / sources"
          rows={3}
          value={idea.signals}
          onChange={(e) => set('signals')(e.target.value)}
          hint="Optional. Links that inspired it."
        />
        <TextArea
          label="Explicit non-goals"
          rows={3}
          value={idea.nongoals}
          onChange={(e) => set('nongoals')(e.target.value)}
          hint="Optional. What v1 must not do."
        />
        <label className="flex items-start gap-3 border-t border-line pt-5 text-small text-ink">
          <Checkbox
            checked={idea.approve}
            onChange={(e) => setIdea((i) => ({ ...i, approve: e.target.checked }))}
          />
          <span>
            Approve it now
            <span className="mt-0.5 block text-note text-muted">
              The Architect starts on the blueprint right away. Leave it off to read it again first.
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <Note>Filed as you on GitHub, labelled idea, exactly like the Idea form.</Note>
      </form>
    </Drawer>
  );
}
