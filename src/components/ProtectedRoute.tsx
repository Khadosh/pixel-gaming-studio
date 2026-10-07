import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="nube-cuerpo min-h-screen flex items-center justify-center bg-background text-primary">
        LOADING...
      </div>
    );
  }

  if (!user) {
    // Redirigir a login si no hay usuario
    return <Navigate to="/auth" replace />;
  }

  return children;
}
