import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatPct, pnlClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, ArrowLeft, RefreshCw, Trophy, Wallet,
  BarChart2, Settings, ChevronUp, ChevronDown, Minus, Clock
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Distinct colors for up to 10 participants
const SLEEVE_COLORS = [
  "oklch(0.65 0.18 250)",  // blue
  "oklch(0.65 0.18 145)",  // green
  "oklch(0.65 0.22 25)",   // red/orange
  "oklch(0.65 0.18 300)",  // purple
  "oklch(0.65 0.18 60)",   // yellow
  "oklch(0.65 0.18 200)",  // cyan
  "oklch(0.65 0.22 350)",  // pink
  "oklch(0.65 0.18 170)",  // teal
  "oklch(0.65 0.18 330)",  // magenta
  "oklch(0.65 0.18 90)",   // lime
];

function reallocationLabel(interval: string) {
  if (interval === "3months") return "Every 3 months";
  if (interval === "6months") return "Every 6 months";
  return "Annually";
}

export default function GroupDashboard() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: leaderboard, isLoading, refetch } = trpc.portfolio.getLeaderboard.useQuery(
    { groupId },
    { enabled: !!groupId, refetchInterval: 60_000 }
  );

  const { data: group } = trpc.group.get.useQuery(
    { groupId },
    { enabled: !!groupId }
  );

  const { data: leaderboardSnapshots } = trpc.portfolio.getLeaderboardSnapshots.useQuery(
    { groupId, limit: 90 },
    { enabled: !!groupId }
  );

  const refreshAllMutation = trpc.portfolio.refreshAllPrices.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Prices refreshed");
      setRefreshing(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setRefreshing(true);
    refreshAllMutation.mutate({ groupId });
  };

  // Build multi-line chart data from leaderboard snapshots
  const { chartData, chartConfig } = useMemo(() => {
    const series = leaderboardSnapshots?.series;
    if (!series || series.length === 0) {
      return { chartData: [], chartConfig: {} as ChartConfig };
    }

    // Collect all unique dates across all series
    // Each date string is "YYYY-MM-DD" (ISO format from backend) — sort chronologically
    const dateSet = new Set<string>();
    series.forEach((s: { sleeveId: number; displayName: string; isMe: boolean; data: { date: string; totalValue: number }[] }) => {
      s.data.forEach((d: { date: string; totalValue: number }) => dateSet.add(d.date));
    });
    const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

    // Build a map: date -> sleeveId -> totalValue
    const valueMap = new Map<string, Map<number, number>>();
    series.forEach((s: { sleeveId: number; displayName: string; isMe: boolean; data: { date: string; totalValue: number }[] }) => {
      s.data.forEach((d: { date: string; totalValue: number }) => {
        if (!valueMap.has(d.date)) valueMap.set(d.date, new Map());
        valueMap.get(d.date)!.set(s.sleeveId, d.totalValue);
      });
    });

    const data = sortedDates.map((date) => {
      const row: Record<string, string | number> = { date };
      series.forEach((s: { sleeveId: number }) => {
        const v = valueMap.get(date)?.get(s.sleeveId);
        if (v !== undefined) row[`sleeve_${s.sleeveId}`] = v;
      });
      return row;
    });

    const config: ChartConfig = {};
    series.forEach((s: { sleeveId: number; displayName: string }, i: number) => {
      config[`sleeve_${s.sleeveId}`] = {
        label: s.displayName,
        color: SLEEVE_COLORS[i % SLEEVE_COLORS.length],
      };
    });

    return { chartData: data, chartConfig: config };
  }, [leaderboardSnapshots]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <TrendingUp className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Group not found or access denied</p>
          <Button onClick={() => setLocation("/")} variant="outline">Go Home</Button>
        </div>
      </div>
    );
  }

  const myEntry = leaderboard.entries.find((e) => e.isMe);
  const isAdmin = group?.members?.find((m: any) => m.userId === user?.id)?.role === "admin";

  // Format last-refreshed timestamp
  const lastRefreshed: Date | null = leaderboard.lastRefreshed
    ? new Date(leaderboard.lastRefreshed)
    : null;

  const lastRefreshedLabel = lastRefreshed
    ? (() => {
        const diffMs = Date.now() - lastRefreshed.getTime();
        const diffMin = Math.floor(diffMs / 60_000);
        if (diffMin < 1) return "just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return lastRefreshed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })()
    : "never";

  const reallocationInterval = leaderboard.group?.reallocationInterval || "6months";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="font-semibold text-sm leading-none">{leaderboard.group?.name || "Group"}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {leaderboard.entries.length} manager{leaderboard.entries.length !== 1 ? "s" : ""} · {formatCurrency(leaderboard.group ? parseFloat(leaderboard.group.totalCapital) : leaderboard.startingCapital, true)} portfolio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Last refreshed badge */}
            {lastRefreshed && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground border border-border/40 rounded-md px-2 py-1">
                <Clock className="w-3 h-3" />
                <span>Prices: {lastRefreshedLabel}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/group/${groupId}/admin`)}
                className="gap-2 h-8"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Portfolio summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard
            label="Portfolio Value"
            value={formatCurrency(leaderboard.totalPortfolioValue, true)}
            sub={formatPct(leaderboard.portfolioReturnPct) + " total return"}
            subClass={pnlClass(leaderboard.portfolioReturnPct)}
          />
          <SummaryCard
            label="My Sleeve Value"
            value={myEntry ? formatCurrency(myEntry.totalValue, true) : "—"}
            sub={myEntry ? formatPct(myEntry.returnPct) : "—"}
            subClass={myEntry ? pnlClass(myEntry.returnPct) : "text-muted-foreground"}
          />
          <SummaryCard
            label="My Rank"
            value={myEntry ? `#${myEntry.rank}` : "—"}
            sub={`of ${leaderboard.entries.length} managers`}
            subClass="text-muted-foreground"
          />
          <SummaryCard
            label="Next Reallocation"
            value={leaderboard.group?.nextReallocationDate
              ? new Date(leaderboard.group.nextReallocationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not set"}
            sub={reallocationLabel(reallocationInterval)}
            subClass="text-muted-foreground"
          />
        </div>

        <Tabs defaultValue="leaderboard">
          <TabsList className="mb-4">
            <TabsTrigger value="leaderboard" className="gap-2">
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="chart" className="gap-2">
              <BarChart2 className="w-3.5 h-3.5" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="my-sleeve" className="gap-2">
              <Wallet className="w-3.5 h-3.5" />
              My Sleeve
            </TabsTrigger>
          </TabsList>

          {/* LEADERBOARD TAB */}
          <TabsContent value="leaderboard">
            {/* Mobile last-refreshed badge */}
            {lastRefreshed && (
              <div className="sm:hidden flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                <Clock className="w-3 h-3" />
                <span>Prices last updated: {lastRefreshedLabel}</span>
              </div>
            )}
            <div className="space-y-2">
              {leaderboard.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.sleeveId}
                  entry={entry}
                  total={leaderboard.entries.length}
                  onOpenSleeve={() => setLocation(`/group/${groupId}/sleeve/${entry.sleeveId}`)}
                />
              ))}
            </div>
          </TabsContent>

          {/* PERFORMANCE CHART TAB */}
          <TabsContent value="chart">
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Portfolio Value Over Time</CardTitle>
                  <span className="text-xs text-muted-foreground">All managers · last 90 days</span>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                    <RefreshCw className="w-5 h-5" />
                    <p>No snapshot data yet.</p>
                    <p className="text-xs">Click Refresh to record the first data point for all sleeves.</p>
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[280px] w-full">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.3)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        width={48}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => [
                              <span key="val" className="font-mono font-bold">{formatCurrency(Number(value))}</span>,
                              chartConfig[name as string]?.label || name,
                            ]}
                            labelFormatter={(label) => label}
                          />
                        }
                      />
                      <Legend
                        formatter={(value) => chartConfig[value]?.label || value}
                        wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                      />
                      {Object.keys(chartConfig).map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={SLEEVE_COLORS[i % SLEEVE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MY SLEEVE TAB */}
          <TabsContent value="my-sleeve">
            {myEntry ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Your sleeve allocation</p>
                    <p className="text-2xl font-bold font-mono">{formatCurrency(myEntry.allocatedCapital)}</p>
                  </div>
                  <Button
                    onClick={() => setLocation(`/group/${groupId}/sleeve/${myEntry.sleeveId}`)}
                    className="gap-2"
                  >
                    <BarChart2 className="w-4 h-4" />
                    Manage Sleeve
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard label="Cash" value={formatCurrency(myEntry.cashBalance)} />
                  <MetricCard label="Positions" value={formatCurrency(myEntry.positionsValue)} />
                  <MetricCard label="Unrealized P&L" value={formatCurrency(myEntry.unrealizedPnl)} valueClass={pnlClass(myEntry.unrealizedPnl)} />
                  <MetricCard label="Realized P&L" value={formatCurrency(myEntry.realizedPnl)} valueClass={pnlClass(myEntry.realizedPnl)} />
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No sleeve found. Make sure you've joined this group.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, sub, subClass }: { label: string; value: string; sub: string; subClass: string }) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-lg font-bold font-mono leading-none">{value}</p>
        <p className={`text-xs mt-1.5 font-mono ${subClass}`}>{sub}</p>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-base font-bold font-mono ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function LeaderboardRow({ entry, total, onOpenSleeve }: { entry: any; total: number; onOpenSleeve: () => void }) {
  const isFirst = entry.rank === 1;
  const isLast = entry.rank === total;
  const returnIsPositive = entry.returnPct > 0;
  const returnIsNegative = entry.returnPct < 0;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-accent/30 ${
        entry.isMe ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card/50"
      }`}
      onClick={onOpenSleeve}
    >
      {/* Rank */}
      <div className="w-8 text-center shrink-0">
        {isFirst ? (
          <Trophy className="w-5 h-5 text-yellow-400 mx-auto" />
        ) : (
          <span className={`text-lg font-bold ${isLast ? "text-red-400" : "text-muted-foreground"}`}>
            {entry.rank}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{entry.displayName}</p>
          {entry.isMe && <Badge variant="outline" className="text-xs text-primary border-primary/30">You</Badge>}
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          Alloc: {formatCurrency(entry.allocatedCapital, true)}
        </p>
      </div>

      {/* Values */}
      <div className="text-right shrink-0">
        <p className="font-bold font-mono text-sm">{formatCurrency(entry.totalValue, true)}</p>
        <div className={`flex items-center justify-end gap-1 text-xs font-mono ${pnlClass(entry.returnPct)}`}>
          {returnIsPositive ? <ChevronUp className="w-3 h-3" /> : returnIsNegative ? <ChevronDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {formatPct(entry.returnPct)}
        </div>
      </div>

      {/* P&L */}
      <div className="text-right shrink-0 hidden md:block">
        <p className={`text-sm font-mono font-medium ${pnlClass(entry.unrealizedPnl + entry.realizedPnl)}`}>
          {formatCurrency(entry.unrealizedPnl + entry.realizedPnl, true)}
        </p>
        <p className="text-xs text-muted-foreground">Total P&L</p>
      </div>
    </div>
  );
}
