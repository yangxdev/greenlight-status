import { useEffect } from 'react';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from './app/hooks.ts';
import { DEFAULT_SOURCE_REPO, SITE_REPO } from './app/site.ts';
import { AppFooter, AppHeader, AppShell } from './components/shell/index.ts';
import Board from './features/board/Board.tsx';
import Ideas from './features/ideas/Ideas.tsx';
import Project from './features/project/Project.tsx';
import { fetchMe } from './features/session/sessionSlice.ts';
import { SessionControls } from './features/session/SessionControls.tsx';
import { fetchStatus, selectStatus } from './features/status/statusSlice.ts';

const NAV = [
  { href: '/', label: 'pipeline' },
  { href: '/ideas', label: 'ideas' },
];

/** The bar, the footer strip, and the two fetches every screen shares: the board document and who is signed in. */
function Layout() {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const { data } = useAppSelector(selectStatus);
  const sourceRepo = data?.sourceRepo ?? DEFAULT_SOURCE_REPO;

  useEffect(() => {
    void dispatch(fetchStatus());
    void dispatch(fetchMe());
  }, [dispatch]);

  return (
    <AppShell
      header={
        <AppHeader
          nav={NAV}
          current={pathname === '/ideas' ? '/ideas' : '/'}
          actions={<SessionControls />}
          renderLink={(item, props) => (
            <Link to={item.href} {...props}>
              {item.label}
            </Link>
          )}
        />
      }
      footer={
        <AppFooter
          links={[
            { href: `https://github.com/${SITE_REPO}`, label: 'source' },
            { href: `https://github.com/${sourceRepo}`, label: 'greenlight' },
          ]}
        >
          Read from GitHub, cached for five minutes. Only the pipeline’s owner can sign in and act.
        </AppFooter>
      }
    >
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Board />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="p/:number" element={<Project />} />
          <Route path="*" element={<Board />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
