import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Users, MessageSquare, LogOut } from "lucide-react";

export const Route = createFileRoute("/admin")({ ssr: false, component: AdminLayout });

function AdminLayout() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role === "client") navigate({ to: "/dashboard" });
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "trainer")
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;

  const links = [
    { to: "/admin/clients", label: "Mis Clientes", icon: Users },
    { to: "/admin/recommendations", label: "Recomendaciones", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/admin/clients"><Logo className="h-16 w-auto" /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">Panel del Preparador</span>
            <ThemeToggle />
            <button onClick={() => signOut().then(() => navigate({ to: "/" }))} className="btn-secondary text-sm">
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-2">
          <div className="flex gap-1 pb-2">
            {links.map((l) => {
              const active = path.startsWith(l.to);
              return (
                <Link key={l.to} to={l.to} className={`flex min-h-12 items-center whitespace-nowrap rounded-md px-4 text-sm font-medium ${active ? "bg-gold text-background" : "text-muted-foreground hover:text-gold"}`}>
                  <l.icon className="mr-2 h-4 w-4" />{l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>
    </div>
  );
}
