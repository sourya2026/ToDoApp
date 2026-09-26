// =============================================================================
// Routes.
//
// Every record URL in this file is also declared in lib/entityRoutes.js, which
// is what RecordLink builds links from - the two must stay in step.
// =============================================================================
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/auth.jsx';
import { AppDataProvider, useAppData } from './lib/appData.jsx';
import { ToastProvider } from './components/ui.jsx';
import { Skeleton, PanelError } from './components/PanelStates.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import ProjectsAdmin from './pages/admin/ProjectsAdmin.jsx';
import EmployeesAdmin from './pages/admin/EmployeesAdmin.jsx';
import ListsAdmin from './pages/admin/ListsAdmin.jsx';
import AuditPage from './pages/admin/AuditPage.jsx';

/** Signed-in only. Remembers where the user was heading. */
function RequireAuth({ children }) {
  const { user, checking } = useSession();
  const location = useLocation();
  if (checking) return <div className="boot"><Skeleton rows={3} label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Admin-only. Employees are sent back to the board rather than shown a 403. */
function RequireAdmin({ children }) {
  const { isAdmin } = useSession();
  return isAdmin ? children : <Navigate to="/board" replace />;
}

/** Holds the screens until the reference data they all depend on has loaded. */
function DataGate({ children }) {
  const { status, message, requestId, reload } = useAppData();
  if (status === 'loading') return <div className="boot"><Skeleton rows={4} label="Loading" /></div>;
  if (status === 'error') {
    return <div className="boot"><PanelError message={message} requestId={requestId} onRetry={reload} /></div>;
  }
  return children;
}

function AuthedApp() {
  const { user } = useSession();
  return (
    <AppDataProvider enabled={Boolean(user)}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth><DataGate><Layout /></DataGate></RequireAuth>}>
          <Route path="/board" element={<BoardPage />} />
          {/* The detail panel has its own URL: it loads directly and can be shared. */}
          <Route path="/items/:itemId" element={<BoardPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />

          <Route path="/admin/projects" element={<RequireAdmin><ProjectsAdmin /></RequireAdmin>} />
          <Route path="/admin/employees" element={<RequireAdmin><EmployeesAdmin /></RequireAdmin>} />
          <Route path="/admin/lists" element={<RequireAdmin><ListsAdmin /></RequireAdmin>} />
          <Route path="/admin/audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
        </Route>

        <Route path="/" element={<Navigate to="/board" replace />} />
        {/* Unknown URL: send people somewhere useful rather than a blank page. */}
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Routes>
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <AuthedApp />
      </ToastProvider>
    </SessionProvider>
  );
}
