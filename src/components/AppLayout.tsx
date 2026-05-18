import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isCheckinRoute = location.pathname === "/checkin";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground animate-pulse font-serif text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="relative flex min-h-screen w-full overflow-x-clip bg-transparent">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-[-5rem] top-20 h-80 w-80 rounded-full bg-sun/40 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-sage/25 blur-3xl" />
      </div>
      <AppSidebar />
      <main className="relative z-10 flex-1 lg:pl-[21rem]">
        <div className={`mx-auto px-4 py-10 sm:px-6 lg:px-16 lg:py-14 ${isCheckinRoute ? "max-w-[96rem]" : "max-w-5xl"}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
