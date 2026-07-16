import { Link, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";

export default function App() {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith("/aula/");
  const [scanning, setScanning] = useState(false);

  const rescan = async () => {
    setScanning(true);
    try {
      await fetch("/api/scan", { method: "POST" });
      window.location.reload();
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className={isPlayer ? "app app-player" : "app"}>
      {!isPlayer && (
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="brand-icon">🎨</span> Art School
          </Link>
          <button className="btn-ghost" onClick={rescan} disabled={scanning}>
            {scanning ? "Escaneando..." : "⟳ Reescanear"}
          </button>
        </header>
      )}
      <Outlet />
    </div>
  );
}
