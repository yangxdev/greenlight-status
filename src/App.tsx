import { useEffect } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from './app/hooks.ts';
import { DEFAULT_SOURCE_REPO, SITE_REPO } from './app/site.ts';
import { SiteFooter, SiteHeader } from './components/shell/index.ts';
import { Note } from './components/ui/index.ts';
import Overview from './features/status/Overview.tsx';
import { fetchStatus, selectStatus } from './features/status/statusSlice.ts';

const NAV = [
  { href: '/', label: 'overview' },
  { href: '/ideas', label: 'ideas' },
];

/** Header, footer and the one status fetch, shared by both screens. */
function Layout() {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const { data } = useAppSelector(selectStatus);
  const sourceRepo = data?.sourceRepo ?? DEFAULT_SOURCE_REPO;

  useEffect(() => {
    void dispatch(fetchStatus());
  }, [dispatch]);

  return (
    <div className="min-h-dvh">
      <SiteHeader nav={NAV} current={pathname === '/ideas' ? '/ideas' : '/'} />
      <main>
        <Outlet />
      </main>
      <SiteFooter
        links={[
          { href: `https://github.com/${SITE_REPO}`, label: 'source' },
          { href: `https://github.com/${sourceRepo}`, label: 'greenlight' },
          { href: `https://github.com/${sourceRepo}#readme`, label: 'readme' },
        ]}
      >
        <Note>This page is read from GitHub and cached for ten minutes. Nothing is stored.</Note>
      </SiteFooter>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="*" element={<Overview />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
