"use client";

import { Bell, BrainCircuit, ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

interface TopNavProps {
  onLogoClick?: () => void;
}

function EidozLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke="url(#logoGradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="85 15"
        transform="rotate(-90 20 20)"
      />
      <defs>
        <linearGradient
          id="logoGradient"
          x1="20"
          y1="4"
          x2="20"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c9b896" />
          <stop offset="1" stopColor="#8a8279" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TopNav({ onLogoClick }: TopNavProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background border-b border-border/50">
      <div className="flex items-center justify-between h-full px-10">
        {/* Left: Logo and Brand */}
        <button
          onClick={onLogoClick}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <EidozLogo className="w-9 h-9" />
          <span className="text-foreground tracking-[0.3em] text-sm font-medium">
            EIDOZ
          </span>
        </button>

        {/* Right: Notification and Profile */}
        <div className="flex items-center gap-4">

          <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="w-5 h-5" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1 rounded-full hover:bg-secondary/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-card border-border"
            >
              <DropdownMenuItem
                className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary"
                onClick={() => router.push('/settings')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
