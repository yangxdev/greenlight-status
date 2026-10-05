import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { NewChange } from '../../../shared/api.ts';
import { useAppDispatch } from '../../app/hooks.ts';
import { Button, Checkbox, Drawer, Field, Note, TextArea } from '../../components/ui/index.ts';
import { messageOf } from '../../lib/api.ts';
import { createChange } from './projectSlice.ts';

const EMPTY: NewChange = { title: '', change: '', why: '', keep: '', approve: false };

/**
 * Ask for a change to a live product: the Change form's fields, filed as a sub-issue of the product's idea issue. The
 * Architect turns it into a change spec of at most five tasks once it is approved.
 */
export function ChangeDrawer({
  open,
  onClose,
  parent,
  product,
}: {
  open: boolean;
  onClose: () => void;
  parent: number;
  product: string;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [change, setChange] = useState<NewChange>(EMPTY);
  const [missing, setMissing] = useState<{ title?: string; change?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const gaps = {
      ...(change.title.trim() ? null : { title: 'Give it a short title.' }),
      ...(change.change.trim() ? null : { change: 'Say what should change.' }),
    };
    setMissing(gaps);
    if (Object.keys(gaps).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await dispatch(createChange({ parent, change })).unwrap();
      setChange(EMPTY);
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
      eyebrow={`Change to ${product}`}
      title="Request a change"
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" form="new-change" disabled={busy}>
            {busy ? 'Filing…' : change.approve ? 'File and approve' : 'File change'}
          </Button>
        </>
      }
    >
      <form id="new-change" noValidate onSubmit={(e) => void submit(e)} className="space-y-5">
        <Field
          label="Title"
          value={change.title}
          maxLength={80}
          onChange={(e) => setChange((c) => ({ ...c, title: e.target.value }))}
          error={missing.title}
          hint="One line, e.g. “Move to the app layout”."
        />
        <TextArea
          label="What should change"
          value={change.change}
          onChange={(e) => setChange((c) => ({ ...c, change: e.target.value }))}
          error={missing.change}
          hint="What a user should see or be able to do afterwards."
        />
        <TextArea
          label="Why"
          rows={3}
          value={change.why}
          onChange={(e) => setChange((c) => ({ ...c, why: e.target.value }))}
          hint="Optional. The problem it solves, or the evidence."
        />
        <TextArea
          label="Must not change"
          rows={3}
          value={change.keep}
          onChange={(e) => setChange((c) => ({ ...c, keep: e.target.value }))}
          hint="Optional. What has to keep working exactly as it does."
        />
        <label className="flex items-start gap-3 border-t border-line pt-5 text-small text-ink">
          <Checkbox
            checked={change.approve}
            onChange={(e) => setChange((c) => ({ ...c, approve: e.target.checked }))}
          />
          <span>
            Approve it now
            <span className="mt-0.5 block text-note text-muted">
              The Architect writes the change spec right away. The product stays live while it is
              built.
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <Note>Filed as you on GitHub, labelled change, as a sub-issue of #{parent}.</Note>
      </form>
    </Drawer>
  );
}
