import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Heart,
  BookOpen,
  Calendar,
  Users,
  Gift,
  BookHeart,
  MessageCircle,
  ClipboardList,
  LogOut,
  Sparkles,
} from "lucide-react";

const userNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Check-in", url: "/checkin", icon: Heart },
  { title: "Journal", url: "/journal", icon: BookOpen },
  { title: "Appointments", url: "/appointments", icon: Calendar },
  { title: "CHW Support", url: "/directory", icon: Users },
  { title: "Care Chat", url: "/care-chat", icon: ClipboardList },
  { title: "Community", url: "/community", icon: MessageCircle },
  { title: "Resources", url: "/resources", icon: BookHeart },
  { title: "Rewards", url: "/rewards", icon: Gift },
  { title: "AI Companion", url: "/ai-chat", icon: Sparkles },
];

const chwNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Appointments", url: "/appointments", icon: Calendar },
  { title: "Caseload", url: "/caseload", icon: ClipboardList },
  { title: "Directory", url: "/directory", icon: Users },
  { title: "Care Chat", url: "/care-chat", icon: MessageCircle },
  { title: "Community", url: "/community", icon: MessageCircle },
  { title: "Resources", url: "/resources", icon: BookHeart },
  { title: "AI Companion", url: "/ai-chat", icon: Sparkles },
];

export function AppSidebar() {
  const { user, logout, isUser } = useAuth();
  const navItems = isUser ? userNav : chwNav;

  return (
    <aside className="glass-surface relative z-20 m-4 flex w-[calc(100%-2rem)] shrink-0 flex-col rounded-[2rem] border-white/60 px-6 py-8 md:w-72 lg:fixed lg:left-4 lg:top-4 lg:m-0 lg:h-[calc(100vh-2rem)]">
      <div className="mb-8 px-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Calm care
        </div>
      </div>

      <div className="mb-10 px-4">
        <div className="font-serif text-3xl tracking-tight text-foreground">AfyaMind</div>
        <p className="mt-2 text-sm text-muted-foreground">Soft support, grounded check-ins, and guided next steps.</p>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/dashboard"}
            className="nav-item"
            activeClassName="nav-item-active"
          >
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 border-t border-white/60 px-4 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/75 text-sm font-medium text-foreground shadow-[0_10px_24px_rgba(61,121,89,0.12)]">
            {user?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate capitalize">
              {isUser ? "Patient" : "Health Worker"}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
