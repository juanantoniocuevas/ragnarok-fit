import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

// El registro público está cerrado: las cuentas de clientes las crea
// el dueño o un preparador desde el panel de administración.
export const Route = createFileRoute("/signup")({
  ssr: false,
  component: SignupClosedPage,
});

function SignupClosedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo className="h-32 w-auto md:h-40" />
        </Link>
        <div className="surface-card p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Las cuentas las crea tu preparador</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Para unirte a Ragnarok Fit, habla con tu preparador. Él te entregará tu usuario y contraseña para ingresar.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-flex">Ir a ingresar</Link>
        </div>
      </div>
    </div>
  );
}
