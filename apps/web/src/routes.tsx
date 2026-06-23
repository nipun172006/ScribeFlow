import { lazy, Suspense, type ComponentType } from "react";
import type { RouteObject } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoadingState } from "./components/LoadingState";

// Route-level code splitting: each page ships in its own chunk and loads on
// demand, keeping the initial bundle (shell + dashboard) small.
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const NewMeetingPage = lazy(() =>
  import("./pages/NewMeetingPage").then((m) => ({ default: m.NewMeetingPage })),
);
const ProcessingPage = lazy(() =>
  import("./pages/ProcessingPage").then((m) => ({ default: m.ProcessingPage })),
);
const MeetingDetailPage = lazy(() =>
  import("./pages/MeetingDetailPage").then((m) => ({ default: m.MeetingDetailPage })),
);
const ArchivePage = lazy(() =>
  import("./pages/ArchivePage").then((m) => ({ default: m.ArchivePage })),
);
const GlobalSearchPage = lazy(() =>
  import("./pages/GlobalSearchPage").then((m) => ({ default: m.GlobalSearchPage })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

function withSuspense(Component: ComponentType) {
  return (
    <Suspense
      fallback={
        <div className="py-10">
          <LoadingState label="Loading page" />
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: withSuspense(DashboardPage) },
      { path: "meetings/new", element: withSuspense(NewMeetingPage) },
      { path: "meetings/:meetingId/processing", element: withSuspense(ProcessingPage) },
      { path: "meetings/:meetingId", element: withSuspense(MeetingDetailPage) },
      { path: "archive", element: withSuspense(ArchivePage) },
      { path: "search", element: withSuspense(GlobalSearchPage) },
      { path: "analytics", element: withSuspense(AnalyticsPage) },
      { path: "*", element: withSuspense(NotFoundPage) },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
