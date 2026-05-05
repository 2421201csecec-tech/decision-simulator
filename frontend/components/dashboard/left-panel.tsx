"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GroupedThreads, ThreadRecord } from "@/lib/api/threads";

interface NavItem {
  label: string;
  active?: boolean;
  indent?: boolean;
  subtitle?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface LeftPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  groupedThreads: GroupedThreads;
  selectedThreadId?: string | null;
  onSelectThread?: (thread: ThreadRecord) => void;
  onFailureAnalysis?: (thread: ThreadRecord) => void;
}

function toNavSections(grouped: GroupedThreads, selectedThreadId?: string | null): NavSection[] {
  const mapItem = (thread: ThreadRecord): NavItem => ({
    label: thread.title,
    active: selectedThreadId === thread.id,
    subtitle: thread.parentThreadId ? "(revision)" : undefined,
  });

  return [
    {
      title: "Active Decisions",
      items: grouped.active.map(mapItem),
    },
    {
      title: "Revisions",
      items: grouped.revisions.map(mapItem),
    },
    {
      title: "Failure Analysis",
      items: grouped.failureAnalysis.map(mapItem),
    },
    {
      title: "Decision History",
      items: grouped.history.map(mapItem),
    },
  ];
}

export function LeftPanel({
  isCollapsed,
  onToggleCollapse,
  groupedThreads,
  selectedThreadId,
  onSelectThread,
  onFailureAnalysis,
}: LeftPanelProps) {
  const navigationData = toNavSections(groupedThreads, selectedThreadId);
  const sectionByTitle: Record<string, ThreadRecord[]> = {
    "Active Decisions": groupedThreads.active,
    Revisions: groupedThreads.revisions,
    "Failure Analysis": groupedThreads.failureAnalysis,
    "Decision History": groupedThreads.history,
  };

  if (isCollapsed) {
    return (
      <aside className="w-10 h-full flex flex-col items-center pt-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-card"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 h-full bg-card rounded-2xl border border-border/50 p-5 overflow-y-auto relative">
      {/* Collapse button */}
      <button
        onClick={onToggleCollapse}
        className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <h2 className="text-sm text-muted-foreground mb-4 tracking-wide">Sources</h2>

      <nav className="space-y-6">
        {navigationData.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title && (
              <h3 className="text-xs text-muted-foreground/70 mb-2 border-b border-border/30 pb-2">
                {section.title}
              </h3>
            )}
            {section.items.length > 0 && (
              <ul className="space-y-1">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {section.title === "Failure Analysis" ? (
                      <button
                        onClick={() => {
                          const thread = sectionByTitle[section.title]?.[itemIndex];
                          if (thread) onFailureAnalysis?.(thread);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors",
                          item.active
                            ? "text-foreground font-medium bg-secondary/30"
                            : "text-foreground/80 hover:bg-secondary/50"
                        )}
                      >
                        <span>{item.label}</span>
                      </button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors group flex items-center justify-between",
                              item.active
                                ? "text-foreground font-medium bg-secondary/30"
                                : "text-foreground/80 hover:bg-secondary/50"
                            )}
                          >
                            <span className="flex-1">{item.label}</span>
                            <MoreVertical className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem
                            onClick={() => {
                              const thread = sectionByTitle[section.title]?.[itemIndex];
                              if (thread) onSelectThread?.(thread);
                            }}
                          >
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const thread = sectionByTitle[section.title]?.[itemIndex];
                              if (thread) onFailureAnalysis?.(thread);
                            }}
                          >
                            Failure Analysis
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
