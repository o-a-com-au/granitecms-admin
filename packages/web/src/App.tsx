import { type RouteObject } from 'react-router';
import { LoginPage } from './pages/LoginPage.tsx';
import { HomeRedirect } from './pages/HomeRedirect.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ContentBrowserPage } from './pages/ContentBrowserPage.tsx';
import { MenusPage } from './pages/MenusPage.tsx';
import { MediaLibraryPage } from './pages/MediaLibraryPage.tsx';
import { RedirectsPage } from './pages/RedirectsPage.tsx';
import { MenuEditorPage } from './pages/MenuEditorPage.tsx';
import { PageEditorPage } from './pages/PageEditorPage.tsx';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { RequireDeveloper } from './auth/RequireDeveloper.tsx';
import { AppShell } from './layout/AppShell.tsx';

// A plain RouteObject[] (not <Routes>/<Route> JSX) - the data router
// mode createBrowserRouter/RouterProvider requires, so useBlocker
// (guarding navigation away from a page with unpublished changes) is
// available at all; the declarative <BrowserRouter> this replaced
// never provides the DataRouterContext useBlocker needs, and throws
// if a component under it calls that hook. No route here has a
// loader/action - this is a structural rewrite of the same tree, not
// an adoption of data-router data fetching.
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomeRedirect /> },
          {
            element: <RequireDeveloper />,
            children: [{ path: '/settings', element: <SettingsPage /> }],
          },
          { path: '/sites/:siteId/content', element: <ContentBrowserPage /> },
          { path: '/sites/:siteId/menus', element: <MenusPage /> },
          { path: '/sites/:siteId/media', element: <MediaLibraryPage /> },
          { path: '/sites/:siteId/redirects', element: <RedirectsPage /> },
          { path: '/sites/:siteId/menus/edit', element: <MenuEditorPage /> },
          { path: '/sites/:siteId/editor', element: <PageEditorPage /> },
        ],
      },
    ],
  },
];
