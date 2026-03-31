import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatPct, pnlClass, rankBadgeClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, ArrowLeft, RefreshCw, Trophy, Wallet,
  BarChart2, Settings, Plus, ChevronUp, ChevronDown, Minus
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

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
                {leaderboard.entries.length} managers · {formatCurrency(leaderboard.startingCapital, true)} portfolio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            sub={leaderboard.group?.reallocationInterval === "6months" ? "Every 6 months" : "Annually"}
            subClass="text-muted-foreground"
          />
        </div>

        <Tabs defaultValue="leaderboard">
          <TabsList className="mb-4">
            <TabsTrigger value="leaderboard" className="gap-2">
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="my-sleeve" className="gap-2">
              <Wallet className="w-3.5 h-3.5" />
              My Sleeve
            </TabsTrigger>
          </TabsList>

          {/* LEADERBOARD TAB */}
          <TabsContent value="leaderboard">
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
