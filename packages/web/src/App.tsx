import { Navigate, type RouteObject } from 'react-router';
import { LoginPage } from './pages/LoginPage.tsx';
import { SignupPage } from './pages/SignupPage.tsx';
import { ClaimInvitePage } from './pages/ClaimInvitePage.tsx';
import { HomeRedirect } from './pages/HomeRedirect.tsx';
import { OnboardingPage } from './pages/OnboardingPage.tsx';
import { SettingsLayout } from './pages/settings/SettingsLayout.tsx';
import { PersonalDetailsPage } from './pages/settings/PersonalDetailsPage.tsx';
import { PasswordSecurityPage } from './pages/settings/PasswordSecurityPage.tsx';
import { SubscriptionPage } from './pages/settings/SubscriptionPage.tsx';
import { ManageSitesPage } from './pages/settings/ManageSitesPage.tsx';
import { ManageSitePage } from './pages/settings/ManageSitePage.tsx';
import { PagesHubPage } from './pages/PagesHubPage.tsx';
import { MediaLibraryPage } from './pages/MediaLibraryPage.tsx';
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
  { path: '/signup', element: <SignupPage /> },
  { path: '/invite/:code', element: <ClaimInvitePage /> },
  // docs/design/Settings - *.png replaced the previously-separate
  // /account and /subscription pages with sections of the one unified
  // /settings shell - these two redirects keep any already-memorised
  // link (e.g. one sent out in an old invite/notification email)
  // landing somewhere real rather than 404ing.
  { path: '/account', element: <Navigate to="/settings/personal" replace /> },
  { path: '/subscription', element: <Navigate to="/settings/subscription" replace /> },
  {
    element: <RequireAuth />,
    children: [
      // A standalone full-screen view, not nested under AppShell - no
      // topbar/icon rail/shared preview at all (docs/design's own
      // Settings mockup shows a bare dark screen with just its own
      // small logo mark and a close button, requested directly). Still
      // under RequireAuth (siteId-agnostic auth still applies), just a
      // sibling of AppShell's own subtree rather than a child of it.
      {
        path: '/settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="/settings/personal" replace /> },
          { path: 'personal', element: <PersonalDetailsPage /> },
          { path: 'password', element: <PasswordSecurityPage /> },
          { path: 'subscription', element: <SubscriptionPage /> },
          {
            element: <RequireDeveloper />,
            children: [
              { path: 'sites', element: <ManageSitesPage /> },
              { path: 'sites/:siteId', element: <ManageSitePage /> },
            ],
          },
        ],
      },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomeRedirect /> },
          {
            element: <RequireDeveloper />,
            children: [{ path: '/onboarding', element: <OnboardingPage /> }],
          },
          { path: '/sites/:siteId/content', element: <PagesHubPage /> },
          { path: '/sites/:siteId/media', element: <MediaLibraryPage /> },
          { path: '/sites/:siteId/menus/edit', element: <MenuEditorPage /> },
          { path: '/sites/:siteId/editor', element: <PageEditorPage /> },
        ],
      },
    ],
  },
];
