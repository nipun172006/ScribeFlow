import type { RouteObject } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ArchivePage } from "./pages/ArchivePage";
import { DashboardPage } from "./pages/DashboardPage";
import { GlobalSearchPage } from "./pages/GlobalSearchPage";
import { MeetingDetailPage } from "./pages/MeetingDetailPage";
import { NewMeetingPage } from "./pages/NewMeetingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProcessingPage } from "./pages/ProcessingPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "meetings/new", element: <NewMeetingPage /> },
      { path: "meetings/:meetingId/processing", element: <ProcessingPage /> },
      { path: "meetings/:meetingId", element: <MeetingDetailPage /> },
      { path: "archive", element: <ArchivePage /> },
      { path: "search", element: <GlobalSearchPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
