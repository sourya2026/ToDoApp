// =============================================================================
// Layout  -  the top bar and the page frame.
// =============================================================================
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/auth.jsx';
import { useAppData } from '../lib/appData.jsx';
import { initials } from '../lib/format.js';

function ProjectSelector() {
  const [params, setParams] = useSearchParams();
  const { projects } = useAppData();
  const current = params.get('project') || 'all';

  return (
    <label className="project-select">
      <span className="sr-only">Project</span>
      <select
        className="input"
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set('project', e.target.value);
          // Changing project resets paging-ish state but keeps filters, which
          // is what people expect when they switch context.
          setParams(next, { replace: false });
        }}
      >
        <option value="all">All my projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.active ? '' : ' (archived)'}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useSession();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="brand" onClick={() => navigate('/board')} title="Go to the board">
            <img className="brand-logo" src="/saka-logo.png" alt="SAKA" />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-name">To-Do Tracker</span>
          </button>
          <ProjectSelector />
        </div>

        <nav className="topnav" aria-label="Main">
          <NavLink to="/board" className={({ isActive }) => 'navlink' + (isActive ? ' navlink-active' : '')}>
            Board
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin/projects" className={({ isActive }) => 'navlink' + (isActive ? ' navlink-active' : '')}>
                Projects
              </NavLink>
              <NavLink to="/admin/employees" className={({ isActive }) => 'navlink' + (isActive ? ' navlink-active' : '')}>
                Employees
              </NavLink>
              <NavLink to="/admin/lists" className={({ isActive }) => 'navlink' + (isActive ? ' navlink-active' : '')}>
                Lists
              </NavLink>
              <NavLink to="/admin/audit" className={({ isActive }) => 'navlink' + (isActive ? ' navlink-active' : '')}>
                Audit
              </NavLink>
            </>
          )}
        </nav>

        <div className="topbar-right">
          <span className="who">
            <span className="avatar avatar-sm">{initials(user.name)}</span>
            <span className="who-text">
              <span className="who-name">{user.name}</span>
              <span className={'role-badge role-' + user.role.toLowerCase()}>{user.role}</span>
            </span>
          </span>
          <button type="button" className="btn btn-quiet" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
