import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import type { Issue } from "@paperclipai/shared";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Inbox,
  CalendarCheck,
  AlertCircle,
  Sun,
  ListTodo,
} from "lucide-react";

// ─── Date helpers ───────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? 6 : day - 1;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getDaysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const SHORT_MONTH = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

const DAY_NAMES_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function formatTimeShort(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Strip milliseconds so Zod z.string().datetime() always accepts it */
function toSafeISO(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";

// ─── Duration helpers (localStorage-backed) ─────────────────────────────────

const DURATION_KEY = "paperclip_planner_durations";
const DEFAULT_DURATION = 30; // minutes
const MIN_DURATION = 15;
const SNAP_MINUTES = 15;

function loadDurations(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DURATION_KEY) || "{}");
  } catch {
    return {};
  }
}

function getDuration(durations: Record<string, number>, id: string): number {
  return durations[id] || DEFAULT_DURATION;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56; // px per hour slot
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR + 1;
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
const MIN_TASK_HEIGHT = MIN_DURATION * PX_PER_MINUTE; // 14px for 15 min

// ─── Calendar Task (variable height + resize) ──────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-l-red-500 bg-red-500/8 dark:bg-red-500/15",
  high: "border-l-orange-500 bg-orange-500/8 dark:bg-orange-500/15",
  medium: "border-l-blue-500 bg-blue-500/8 dark:bg-blue-500/15",
  low: "border-l-gray-400 bg-gray-400/8 dark:bg-gray-400/15",
};

function CalendarTask({
  issue,
  durationMin,
  onResize,
  onDragTask,
}: {
  issue: Issue;
  durationMin: number;
  onResize: (issueId: string, newDuration: number) => void;
  onDragTask: (issueId: string) => void;
}) {
  const height = Math.max(MIN_TASK_HEIGHT, durationMin * PX_PER_MINUTE);
  const done = issue.status === "done" || issue.status === "cancelled";
  const resizing = useRef(false);
  const startY = useRef(0);
  const startDur = useRef(durationMin);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    startY.current = e.clientY;
    startDur.current = durationMin;

    function onMove(ev: MouseEvent) {
      if (!resizing.current) return;
      const dy = ev.clientY - startY.current;
      const deltaMins = dy / PX_PER_MINUTE;
      const raw = startDur.current + deltaMins;
      const snapped = Math.max(MIN_DURATION, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES);
      onResize(issue.id, snapped);
    }

    function onUp() {
      resizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const showDetails = height >= 28;
  const showTime = height >= 20;

  return (
    <div
      style={{ height }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-issue-id", issue.id);
        e.dataTransfer.setData("text/plain", issue.id);
        e.dataTransfer.effectAllowed = "move";
        onDragTask(issue.id);
      }}
      className={cn(
        "group relative rounded-md border-l-[3px] text-xs overflow-hidden select-none",
        "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS.medium,
        done && "opacity-50",
      )}
    >
      {/* Content */}
      <div className="px-1.5 py-0.5 min-w-0 h-full flex flex-col">
        <div className="flex items-center gap-1 min-w-0">
          <StatusIcon status={issue.status} className="h-3 w-3 shrink-0" />
          <Link
            to={`/issues/${issue.identifier ?? issue.id}`}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "truncate text-foreground font-medium no-underline hover:underline text-[11px] leading-tight",
              done && "line-through",
            )}
          >
            {issue.title}
          </Link>
        </div>
        {showTime && issue.scheduledAt && (
          <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
            {formatTimeShort(new Date(issue.scheduledAt))}
            {durationMin >= 30 && ` — ${durationMin} хв`}
          </span>
        )}
        {showDetails && issue.identifier && (
          <span className="text-[10px] text-muted-foreground font-mono mt-auto leading-none pb-0.5">
            {issue.identifier}
          </span>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize group-hover:bg-foreground/10 transition-colors z-20 flex items-center justify-center"
      >
        <div className="w-8 h-0.5 rounded-full bg-foreground/20 group-hover:bg-foreground/40" />
      </div>
    </div>
  );
}

// ─── Compact pill for month view ────────────────────────────────────────────

function MonthPill({ issue }: { issue: Issue }) {
  const done = issue.status === "done" || issue.status === "cancelled";
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-issue-id", issue.id);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
      }}
      className={cn(
        "rounded border-l-2 px-1 py-0.5 text-[10px] truncate cursor-grab",
        PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS.medium,
        done && "opacity-50 line-through",
      )}
    >
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="truncate text-foreground no-underline hover:underline font-medium"
      >
        {issue.title}
      </Link>
    </div>
  );
}

// ─── Task sidebar item ──────────────────────────────────────────────────────

function SidebarTask({ issue }: { issue: Issue }) {
  const done = issue.status === "done" || issue.status === "cancelled";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-issue-id", issue.id);
        e.dataTransfer.setData("text/plain", issue.id); // fallback for all browsers
        e.dataTransfer.effectAllowed = "move";
        const el = e.currentTarget;
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
      }}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50 cursor-grab active:cursor-grabbing",
        done && "opacity-50",
      )}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      <StatusIcon status={issue.status} className="h-3.5 w-3.5 shrink-0" />
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className={cn("truncate text-foreground no-underline hover:underline", done && "line-through")}
      >
        {issue.title}
      </Link>
      <PriorityIcon priority={issue.priority} className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
    </div>
  );
}

// ─── Day column (used in day & week view) ───────────────────────────────────

function DayColumn({
  date,
  issues,
  durations,
  showHeader = false,
  isToday = false,
  onDrop,
  onResize,
}: {
  date: Date;
  issues: Issue[];
  durations: Record<string, number>;
  showHeader?: boolean;
  isToday?: boolean;
  onDrop?: (issueId: string, date: Date) => void;
  onResize: (issueId: string, duration: number) => void;
}) {
  const [dragOverY, setDragOverY] = useState<number | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  // Position tasks absolutely by their scheduledAt time
  const positionedTasks = useMemo(() => {
    return issues
      .filter((i) => i.scheduledAt)
      .map((issue) => {
        const d = new Date(issue.scheduledAt!);
        const minutesSinceStart = (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes();
        const top = minutesSinceStart * PX_PER_MINUTE;
        const dur = getDuration(durations, issue.id);
        const height = Math.max(MIN_TASK_HEIGHT, dur * PX_PER_MINUTE);
        return { issue, top, height, duration: dur };
      })
      .sort((a, b) => a.top - b.top);
  }, [issues, durations]);

  // Current time indicator
  const now = new Date();
  const showNowLine = isToday;
  const nowMinutes = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
  const nowOffset = nowMinutes * PX_PER_MINUTE;

  // Calculate snapped time from Y position
  function yToTime(y: number): Date {
    const totalMinutes = y / PX_PER_MINUTE + DAY_START_HOUR * 60;
    const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const hours = Math.floor(snapped / 60);
    const minutes = snapped % 60;
    const target = new Date(date);
    target.setHours(
      Math.max(DAY_START_HOUR, Math.min(DAY_END_HOUR, hours)),
      minutes, 0, 0,
    );
    return target;
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (columnRef.current) {
      const rect = columnRef.current.getBoundingClientRect();
      setDragOverY(e.clientY - rect.top);
    }
  }

  function handleDragLeave() {
    setDragOverY(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverY(null);
    const issueId = e.dataTransfer.getData("application/x-issue-id") || e.dataTransfer.getData("text/plain");
    if (!issueId || !onDrop || !columnRef.current) return;
    const rect = columnRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const target = yToTime(y);
    onDrop(issueId, target);
  }

  // Snap indicator position
  const snapIndicatorTop = dragOverY !== null
    ? (() => {
        const totalMinutes = dragOverY / PX_PER_MINUTE + DAY_START_HOUR * 60;
        const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        return ((snapped - DAY_START_HOUR * 60) * PX_PER_MINUTE);
      })()
    : null;

  return (
    <div className="flex flex-col min-w-0 flex-1">
      {showHeader && (
        <div
          className={cn(
            "text-center py-2 text-xs font-medium border-b border-border sticky top-0 bg-background z-10",
            isToday && "text-blue-600 dark:text-blue-400",
          )}
        >
          <div className="text-[10px] uppercase text-muted-foreground">
            {DAY_NAMES_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1]}
          </div>
          <div
            className={cn(
              "text-lg leading-tight",
              isToday &&
                "bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto",
            )}
          >
            {date.getDate()}
          </div>
        </div>
      )}

      {/* The time grid + tasks */}
      <div
        ref={columnRef}
        className="relative"
        style={{ height: TOTAL_HEIGHT }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hour lines */}
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-b border-border/50"
            style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          />
        ))}

        {/* Drop indicator */}
        {snapIndicatorTop !== null && snapIndicatorTop >= 0 && snapIndicatorTop <= TOTAL_HEIGHT && (
          <div
            className="absolute left-0 right-0 z-30 pointer-events-none"
            style={{ top: snapIndicatorTop }}
          >
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-blue-500 -ml-1" />
              <div className="flex-1 h-[2px] bg-blue-500/60 border-dashed" />
            </div>
          </div>
        )}

        {/* Tasks */}
        {positionedTasks.map(({ issue, top, height, duration }) => (
          <div
            key={issue.id}
            className="absolute left-1 right-1 z-10"
            style={{ top, height }}
          >
            <CalendarTask
              issue={issue}
              durationMin={duration}
              onResize={onResize}
              onDragTask={() => {}}
            />
          </div>
        ))}

        {/* Current time indicator */}
        {showNowLine && nowOffset > 0 && nowOffset < TOTAL_HEIGHT && (
          <div
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{ top: nowOffset }}
          >
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-[2px] bg-red-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Month grid ─────────────────────────────────────────────────────────────

function MonthGrid({
  date,
  issues,
  onSelectDay,
  onDrop,
}: {
  date: Date;
  issues: Issue[];
  onSelectDay: (d: Date) => void;
  onDrop?: (issueId: string, date: Date) => void;
}) {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(date);
  const daysCount = getDaysInMonth(date);
  const firstDayOfWeek = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1;

  const issuesByDay = useMemo(() => {
    const map: Record<number, Issue[]> = {};
    for (const issue of issues) {
      if (!issue.scheduledAt) continue;
      const d = new Date(issue.scheduledAt);
      if (d.getMonth() !== date.getMonth() || d.getFullYear() !== date.getFullYear()) continue;
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push(issue);
    }
    return map;
  }, [issues, date]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDropOnDay(e: React.DragEvent, day: number) {
    e.preventDefault();
    const issueId = e.dataTransfer.getData("application/x-issue-id") || e.dataTransfer.getData("text/plain");
    if (!issueId || !onDrop) return;
    const target = new Date(date.getFullYear(), date.getMonth(), day, 9, 0, 0, 0);
    onDrop(issueId, target);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_NAMES_SHORT.map((name) => (
          <div key={name} className="text-center py-2 text-xs font-medium text-muted-foreground">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: "calc(100% - 36px)" }}>
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="border-b border-r border-border/50 bg-muted/20" />;
          }
          const cellDate = new Date(date.getFullYear(), date.getMonth(), day);
          const isToday = isSameDay(cellDate, today);
          const dayIssues = issuesByDay[day] ?? [];

          return (
            <div
              key={day}
              className={cn(
                "border-b border-r border-border/50 p-1 cursor-pointer hover:bg-accent/30 transition-colors min-h-[80px]",
                isToday && "bg-blue-500/5",
              )}
              onClick={() => onSelectDay(cellDate)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnDay(e, day)}
            >
              <div
                className={cn(
                  "text-xs font-medium mb-1",
                  isToday ? "text-blue-600 dark:text-blue-400 font-bold" : "text-muted-foreground",
                )}
              >
                {day === 1 ? `${day} ${SHORT_MONTH[date.getMonth()]}` : day}
              </div>
              <div className="space-y-0.5">
                {dayIssues.slice(0, 3).map((issue) => (
                  <MonthPill key={issue.id} issue={issue} />
                ))}
                {dayIssues.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayIssues.length - 3} ще
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Planner Component ─────────────────────────────────────────────────

export function Planner() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);

  // Duration state (localStorage-backed)
  const [durations, setDurations] = useState<Record<string, number>>(loadDurations);

  const handleResize = useCallback((issueId: string, newDuration: number) => {
    setDurations((prev) => {
      const next = { ...prev, [issueId]: newDuration };
      try { localStorage.setItem(DURATION_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Local schedule overrides — tasks stay on calendar immediately on drop,
  // even before the server confirms. Cleared per-issue once server responds.
  const [localSchedule, setLocalSchedule] = useState<Record<string, string>>({});

  useEffect(() => {
    setBreadcrumbs([{ label: "Планувальник" }]);
  }, [setBreadcrumbs]);

  // Fetch all issues for the company
  const { data: allIssues, isLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Merge server data with local schedule overrides
  const issues = useMemo(() => {
    const base = allIssues ?? [];
    if (Object.keys(localSchedule).length === 0) return base;
    return base.map((issue) => {
      const localAt = localSchedule[issue.id];
      return localAt ? { ...issue, scheduledAt: localAt as unknown as Date } : issue;
    });
  }, [allIssues, localSchedule]);

  // ─── Mutation for updating scheduledAt ────────────────────────────────
  // Local state is the source of truth for display. Server sync is best-effort.

  const updateMutation = useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      issuesApi.update(id, { scheduledAt }),
    onSuccess: (updatedIssue, { id }) => {
      // Server confirmed — move from local override to server cache
      setLocalSchedule((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (updatedIssue) {
        queryClient.setQueryData<Issue[]>(
          queryKeys.issues.list(selectedCompanyId!),
          (old) => old?.map((i) => (i.id === updatedIssue.id ? updatedIssue : i)) ?? [],
        );
      }
    },
    onError: (err: unknown, { id }) => {
      // Server failed — keep local override so task stays visible.
      // Log for debugging only.
      console.error("[Planner] scheduledAt sync failed for", id, err);
    },
  });

  const handleDrop = useCallback(
    (issueId: string, date: Date) => {
      const iso = toSafeISO(date);
      // 1. Update local display immediately (never rolls back)
      setLocalSchedule((prev) => ({ ...prev, [issueId]: iso }));
      // 2. Fire server sync in background
      updateMutation.mutate({ id: issueId, scheduledAt: iso });
    },
    [updateMutation],
  );

  // ─── Categorize issues ─────────────────────────────────────────────────

  const activeIssues = useMemo(
    () => issues.filter((i) => !["done", "cancelled"].includes(i.status)),
    [issues],
  );

  const todayIssues = useMemo(
    () =>
      activeIssues.filter((i) => {
        if (!i.scheduledAt) return false;
        return isSameDay(new Date(i.scheduledAt), today);
      }),
    [activeIssues, today],
  );

  const overdueIssues = useMemo(
    () =>
      activeIssues.filter((i) => {
        if (!i.scheduledAt) return false;
        const d = startOfDay(new Date(i.scheduledAt));
        return d < today;
      }),
    [activeIssues, today],
  );

  const unscheduledIssues = useMemo(
    () => activeIssues.filter((i) => !i.scheduledAt),
    [activeIssues],
  );

  const upcomingIssues = useMemo(
    () =>
      activeIssues
        .filter((i) => {
          if (!i.scheduledAt) return false;
          const d = startOfDay(new Date(i.scheduledAt));
          return d > today;
        })
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    [activeIssues, today],
  );

  // ─── Issues for calendar view ─────────────────────────────────────────

  const viewIssues = useMemo(() => {
    const scheduled = issues.filter((i) => i.scheduledAt);
    if (viewMode === "day") {
      return scheduled.filter((i) => isSameDay(new Date(i.scheduledAt!), selectedDate));
    }
    if (viewMode === "week") {
      const ws = startOfWeek(selectedDate);
      const we = addDays(ws, 7);
      return scheduled.filter((i) => {
        const d = new Date(i.scheduledAt!);
        return d >= ws && d < we;
      });
    }
    const ms = startOfMonth(selectedDate);
    const me = endOfMonth(selectedDate);
    return scheduled.filter((i) => {
      const d = new Date(i.scheduledAt!);
      return d >= ms && d <= me;
    });
  }, [issues, viewMode, selectedDate]);

  // ─── Navigation ───────────────────────────────────────────────────────

  function navigatePrev() {
    if (viewMode === "day") setSelectedDate((d) => addDays(d, -1));
    else if (viewMode === "week") setSelectedDate((d) => addDays(d, -7));
    else setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function navigateNext() {
    if (viewMode === "day") setSelectedDate((d) => addDays(d, 1));
    else if (viewMode === "week") setSelectedDate((d) => addDays(d, 7));
    else setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function goToToday() {
    setSelectedDate(startOfDay(new Date()));
  }

  // Scroll to current time on mount
  useEffect(() => {
    if (viewMode !== "month" && scrollRef.current) {
      const now = new Date();
      const offset = (now.getHours() - DAY_START_HOUR - 1) * HOUR_HEIGHT;
      if (offset > 0) {
        scrollRef.current.scrollTop = offset;
      }
    }
  }, [viewMode, selectedDate]);

  // ─── Header label ─────────────────────────────────────────────────────

  const headerLabel = useMemo(() => {
    if (viewMode === "day") {
      const isToday2 = isSameDay(selectedDate, today);
      const d = selectedDate;
      const label = `${d.getDate()} ${SHORT_MONTH[d.getMonth()]} ${d.getFullYear()}`;
      return isToday2 ? `Сьогодні — ${label}` : label;
    }
    if (viewMode === "week") {
      const ws = startOfWeek(selectedDate);
      const we = addDays(ws, 6);
      return `${ws.getDate()} ${SHORT_MONTH[ws.getMonth()]} — ${we.getDate()} ${SHORT_MONTH[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  }, [viewMode, selectedDate, today]);

  // ─── Render ───────────────────────────────────────────────────────────

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message="Оберіть компанію для перегляду планувальника." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ─── Left task sidebar ──────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0 bg-background">
        <div className="px-3 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Задачі
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide">
          {/* Overdue */}
          {overdueIssues.length > 0 && (
            <div className="px-2 py-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                Прострочені ({overdueIssues.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {overdueIssues.map((issue) => (
                  <SidebarTask key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Today */}
          <div className="px-2 py-2">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
              <Sun className="h-3 w-3" />
              Сьогодні ({todayIssues.length})
            </div>
            <div className="mt-1 space-y-0.5">
              {todayIssues.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">Немає задач на сьогодні</p>
              ) : (
                todayIssues.map((issue) => (
                  <SidebarTask key={issue.id} issue={issue} />
                ))
              )}
            </div>
          </div>

          {/* Upcoming */}
          {upcomingIssues.length > 0 && (
            <div className="px-2 py-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarCheck className="h-3 w-3" />
                Заплановані ({upcomingIssues.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {upcomingIssues.slice(0, 15).map((issue) => (
                  <SidebarTask key={issue.id} issue={issue} />
                ))}
                {upcomingIssues.length > 15 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    +{upcomingIssues.length - 15} ще
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Unscheduled */}
          {unscheduledIssues.length > 0 && (
            <div className="px-2 py-2 border-t border-border">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Inbox className="h-3 w-3" />
                Без дати ({unscheduledIssues.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {unscheduledIssues.map((issue) => (
                  <SidebarTask key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main calendar area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-background">
          <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  viewMode === mode
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {mode === "day" ? "День" : mode === "week" ? "Тиждень" : "Місяць"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={navigatePrev}
              className="p-1 rounded hover:bg-accent/50 text-muted-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToToday}
              className="px-2 py-1 rounded text-xs font-medium hover:bg-accent/50 text-muted-foreground transition-colors"
            >
              Сьогодні
            </button>
            <button
              onClick={navigateNext}
              className="p-1 rounded hover:bg-accent/50 text-muted-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="text-sm font-semibold text-foreground">{headerLabel}</h2>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {overdueIssues.length > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {overdueIssues.length} прострочених
              </span>
            )}
            <span>{todayIssues.length} на сьогодні</span>
            <span>{activeIssues.length} всього активних</span>
          </div>
        </div>

        {/* Calendar body */}
        {viewMode === "month" ? (
          <MonthGrid
            date={selectedDate}
            issues={viewIssues}
            onSelectDay={(d) => {
              setSelectedDate(d);
              setViewMode("day");
            }}
            onDrop={handleDrop}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto" ref={scrollRef}>
            <div className="flex min-h-0">
              {/* Time gutter */}
              <div className="w-12 shrink-0">
                {viewMode === "week" && (
                  <div className="h-[52px] border-b border-border" />
                )}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-muted-foreground text-right pr-2 relative"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    <span className="-mt-[7px] block">{formatHour(DAY_START_HOUR + i)}</span>
                  </div>
                ))}
              </div>

              {viewMode === "day" ? (
                <DayColumn
                  date={selectedDate}
                  issues={viewIssues}
                  durations={durations}
                  isToday={isSameDay(selectedDate, today)}
                  onDrop={handleDrop}
                  onResize={handleResize}
                />
              ) : (
                <>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(startOfWeek(selectedDate), i);
                    const dayIssues = viewIssues.filter(
                      (issue) => issue.scheduledAt && isSameDay(new Date(issue.scheduledAt), d),
                    );
                    return (
                      <DayColumn
                        key={i}
                        date={d}
                        issues={dayIssues}
                        durations={durations}
                        showHeader
                        isToday={isSameDay(d, today)}
                        onDrop={handleDrop}
                        onResize={handleResize}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
