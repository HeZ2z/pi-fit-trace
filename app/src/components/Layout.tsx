import { NavLink, Outlet } from "react-router-dom";

const navLinks = [
  { to: "/", label: "History" },
  { to: "/workout/new", label: "Log Workout" },
  { to: "/analysis", label: "Analysis" },
  { to: "/plan", label: "Plan" },
];

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">pi-fit-trace</span>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {navLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
