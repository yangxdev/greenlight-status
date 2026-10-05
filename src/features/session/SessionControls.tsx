import { useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { Button, buttonClass } from '../../components/ui/index.ts';
import { selectMe, signOut } from './sessionSlice.ts';

/** Sign in with GitHub, or who is signed in and a way out. Nothing when the dashboard has no sign-in set up. */
export function SessionControls() {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const { pathname } = useLocation();
  if (!me.signInAvailable) return null;
  if (!me.login) {
    return (
      <a
        href={`/api/auth/login?return=${encodeURIComponent(pathname)}`}
        className={buttonClass('ghost', 'sm')}
      >
        Sign in
      </a>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <span className="hidden font-mono text-note text-muted sm:inline">{me.login}</span>
      <Button size="sm" onClick={() => void dispatch(signOut())}>
        Sign out
      </Button>
    </span>
  );
}
