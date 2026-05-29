"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { SettingsModal } from "./settings-modal";
import { NotificationBell } from "./notification-bell";

interface TopNavProps {
  onLogoClick?: () => void;
  onStartTour?: () => void;
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

export function TopNav({ onLogoClick, onStartTour }: TopNavProps) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(user?.is_anonymous ?? false);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleUpgrade = async () => {
    const supabase = createClient();
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <>
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

          {/* Guest upgrade notice */}
          {isAnonymous && (
            <button
              onClick={handleUpgrade}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{
                background: 'rgba(201,184,150,0.08)',
                border: '1px solid rgba(201,184,150,0.25)',
                color: '#c9b896',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,184,150,0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(201,184,150,0.08)')}
            >
              <span>Guest mode</span>
              <span style={{ color: 'rgba(201,184,150,0.6)' }}>·</span>
              <span>Save data →</span>
            </button>
          )}

          {onStartTour && (
            <button
              onClick={onStartTour}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: 'rgba(201,184,150,0.06)', border: '1px solid rgba(201,184,150,0.2)', color: 'rgba(201,184,150,0.7)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,184,150,0.12)'; e.currentTarget.style.color = '#c9b896' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,184,150,0.06)'; e.currentTarget.style.color = 'rgba(201,184,150,0.7)' }}
            >
              Take a tour
            </button>
          )}

          <NotificationBell />

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
              {isAnonymous && (
                <>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-secondary focus:bg-secondary"
                    style={{ color: '#c9b896' }}
                    onClick={handleUpgrade}
                  >
                    <User className="w-4 h-4 mr-2" />
                    Connect Google
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border" />
                </>
              )}
              <DropdownMenuItem
                className="cursor-pointer text-foreground hover:bg-secondary focus:bg-secondary"
                onClick={() => setShowSettings(true)}
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
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
