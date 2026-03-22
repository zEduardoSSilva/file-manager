import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: string[] }) {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-lg font-semibold">Verificando autenticação e acessos...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 animate-in fade-in zoom-in duration-300">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldAlert className="size-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground whitespace-pre-line max-w-sm">
          Você não possui as permissões necessárias para acessar este módulo.
          {'\n'}Seu perfil atual: <span className="font-semibold uppercase">{userRole}</span>
        </p>
      </div>
    );
  }

  return <Outlet />;
}
