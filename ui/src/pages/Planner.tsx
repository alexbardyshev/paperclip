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
  const diff = day === 0 ? 6 : day - 1; // Monday = start
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

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";

// ─── Task pill on the calendar ──────────────────────────────────────────────

function TaskPill({
  issue,
  compact = false,
}: {
  issue: Issue;
  compact?: boolean;
}) {
  const priorityColors: Record<string, string> = {
    critical: "border-l-red-500 bg-red-500/8 dark:bg-red-500/15",
    high: "border-l-orange-500 bg-orange-500/8 dark:bg-orange-500/15",
    medium: "border-l-blue-500 bg-blue-500/8 dark:bg-blue-500/15",
    low: "border-l-gray-400 bg-gray-400/8 dark:bg-gray-400/15",
  };

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
        "group block rounded-md border-l-[3px] px-2 py-1 text-xs transition-all hover:shadow-sm cursor-grab active:cursor-grabbing",
        priorityColors[issue.priority] ?? priorityColors.medium,
        done && "opacity-50 line-through",
        compact ? "py-0.5" : "py-1.5",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <StatusIcon status={issue.status} className="h-3 w-3 shrink-0" />
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          draggable={false}
          className="truncate text-foreground font-medium no-underline hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {issue.title}
        </Link>
        {issue.scheduledAt && !compact && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatTimeShort(new Date(issue.scheduledAt))}
          </span>
        )}
      </div>
      {!compact && issue.identifier && (
        <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
          {issue.identifier}
        </span>
      )}
    </div>
  );
}

// ─── Task sidebar item ──────────────────────────────────────────────────────

function SidebarTask({
  issue,
  onSchedule,
}: {
  issue: Issue;
  onSchedule?: (issueId: string, date: Date) => void;
}) {
  const done = issue.status === "done" || issue.status === "cancelled";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-issue-id", issue.id);
        e.dataTransfer.effectAllowed = "move";
        // Set drag image
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

const HOUR_HEIGHT = 56; // px per hour slot
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;

function DayColumn({
  date,
  issues,
  showHeader = false,
  isToday = false,
  onDrop,
}: {
  date: Date;
  issues: Issue[];
  showHeader?: boolean;
  isToday?: boolean;
  onDrop?: (issueId: string, date: Date) => void;
}) {
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  // Group issues by hour
  const issuesByHour = useMemo(() => {
    const map: Record<number, Issue[]> = {};
    const unscheduledTime: Issue[] = [];
    for (const issue of issues) {
      if (!issue.scheduledAt) {
        unscheduledTime.push(issue);
        continue;
      }
      const d = new Date(issue.scheduledAt);
      const h = d.getHours();
      if (!map[h]) map[h] = [];
      map[h].push(issue);
    }
    // Put tasks with no time at 9am
    if (unscheduledTime.length > 0) {
      if (!map[9]) map[9] = [];
      map[9].push(...unscheduledTime);
    }
    return map;
  }, [issues]);

  // Current time indicator
  const now = new Date();
  const showNowLine = isToday;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowOffset = ((nowMinutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;

  function handleDragOver(e: React.DragEvent, hour: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverHour(hour);
  }

  function handleDragLeave() {
    setDragOverHour(null);
  }

  function handleDrop(e: React.DragEvent, hour: number) {
    e.preventDefault();
    setDragOverHour(null);
    const issueId = e.dataTransfer.getData("application/x-issue-id");
    if (!issueId || !onDrop) return;
    const target = new Date(date);
    target.setHours(hour, 0, 0, 0);
    onDrop(issueId, target);
  }

  return (
    <div className="flex flex-col min-w-0 flex-1" onDragLeave={handleDragLeave}>
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
      <div className="relative">
        {hours.map((h) => (
          <div
            key={h}
            className={cn(
              "border-b border-border/50 relative transition-colors",
              dragOverHour === h && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/30",
            )}
            style={{ height: HOUR_HEIGHT }}
            onDragOver={(e) => handleDragOver(e, h)}
            onDrop={(e) => handleDrop(e, h)}
          >
            {issuesByHour[h]?.map((issue) => (
              <div key={issue.id} className="absolute inset-x-1 z-10" style={{ top: 2 }}>
                <TaskPill issue={issue} compact />
              </div>
            ))}
          </div>
        ))}
        {/* Current time indicator */}
        {showNowLine && nowOffset > 0 && nowOffset < (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT && (
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

// ─── Time gutter ────────────────────────────────────────────────────────────

function TimeGutter() {
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  return (
    <div className="w-12 shrink-0 border-r border-border">
      <div className="h-[calc(theme(spacing.2)*2+theme(fontSize.lg)+theme(fontSize.xs)+theme(lineHeight.tight)*2)] border-b border-border" />
      {hours.map((h) => (
        <div
          key={h}
          className="text-[10px] text-muted-foreground text-right pr-2 -mt-[7px] relative"
          style={{ height: HOUR_HEIGHT }}
        >
          {formatHour(h)}
        </div>
      ))}
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

  // Group issues by day-of-month
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
    const issueId = e.dataTransfer.getData("application/x-issue-id");
    if (!issueId || !onDrop) return;
    const target = new Date(date.getFullYear(), date.getMonth(), day, 9, 0, 0, 0);
    onDrop(issueId, target);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_NAMES_SHORT.map((name) => (
          <div key={name} className="text-center py-2 text-xs font-medium text-muted-foreground">
            {name}
          </div>
        ))}
      </div>
      {/* Grid */}
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
                  isToday
                    ? "text-blue-600 dark:text-blue-400 font-bold"
                    : "text-muted-foreground",
                )}
              >
                {day === 1 ? `${day} ${SHORT_MONTH[date.getMonth()]}` : day}
              </div>
              <div className="space-y-0.5">
                {dayIssues.slice(0, 3).map((issue) => (
                  <TaskPill key={issue.id} issue={issue} compact />
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

  useEffect(() => {
    setBreadcrumbs([{ label: "Планувальник" }]);
  }, [setBreadcrumbs]);

  // Fetch all issues for the company
  const { data: allIssues, isLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const issues = allIssues ?? [];

  // Mutation for updating scheduledAt
  const updateMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      issuesApi.update(id, { scheduledAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  const handleDrop = useCallback(
    (issueId: string, date: Date) => {
      updateMutation.mutate({ id: issueId, scheduledAt: date.toISOString() });
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
    // month
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

  // Scroll to current time on mount (day/week view)
  useEffect(() => {
    if (viewMode !== "month" && scrollRef.current) {
      const now = new Date();
      const offset = ((now.getHours() - DAY_START_HOUR - 1) * HOUR_HEIGHT);
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
          {/* View mode toggle */}
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

          {/* Navigation */}
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

          {/* Header label */}
          <h2 className="text-sm font-semibold text-foreground">{headerLabel}</h2>

          {/* Stats */}
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
                {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => (
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
                  isToday={isSameDay(selectedDate, today)}
                  onDrop={handleDrop}
                />
              ) : (
                /* Week view: 7 day columns */
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
                        showHeader
                        isToday={isSameDay(d, today)}
                        onDrop={handleDrop}
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
