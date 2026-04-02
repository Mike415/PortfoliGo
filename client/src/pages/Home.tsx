import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Plus, Users, ArrowRight, Trophy, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrency, formatPct } from "@/lib/format";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: groups, isLoading: groupsLoading } = trpc.group.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <TrendingUp className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div
          className="fixed inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="text-center relative z-10 max-w-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">PortfoliGo</h1>
          <p className="text-muted-foreground text-lg mb-2">Compete with friends on a $1M notional portfolio.</p>
          <p className="text-muted-foreground text-sm mb-8">Each manager gets a $200K sleeve. Best performers grow their allocation. Worst performers shrink. Just like a pod shop.</p>
          <div className="flex gap-3 justify-center">
            <Button size="lg" onClick={() => setLocation("/login")}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => setLocation("/join")}>
              Join with Invite Code
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-semibold tracking-tight">PortfoliGo</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.displayName || user?.username}
            </span>
            {user?.role === "admin" && (
              <Badge variant="outline" className="text-primary border-primary/30 text-xs">Admin</Badge>
            )}
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.displayName || user?.username}
          </h2>
          <p className="text-muted-foreground mt-1">Your active competitions</p>
        </div>

        {/* Groups grid */}
        {groupsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : groups && groups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} userId={user!.id} onOpen={() => setLocation(`/group/${group.id}`)} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-border/50 rounded-xl mb-8">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No active competitions yet</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setLocation("/create-group")} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Competition
              </Button>
              <Button variant="outline" onClick={() => setLocation("/join")}>
                Join with Invite Code
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {groups && groups.length > 0 && (
          <div className="flex gap-3">
            <Button onClick={() => setLocation("/create-group")} className="gap-2">
              <Plus className="w-4 h-4" />
              New Competition
            </Button>
            <Button variant="outline" onClick={() => setLocation("/join")}>
              Join with Invite Code
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function GroupCard({ group, userId, onOpen }: { group: any; userId: number; onOpen: () => void }) {
  const statusColors = {
    active: "text-green-400 bg-green-400/10 border-green-400/20",
    paused: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    completed: "text-muted-foreground bg-muted/10 border-border",
  };

  const pnlClass = (val: number | null) =>
    val == null ? "" : val > 0 ? "text-[oklch(0.65_0.18_145)]" : val < 0 ? "text-[oklch(0.60_0.22_25)]" : "text-muted-foreground";

  return (
    <Card
      className="border-border/50 bg-card/80 hover:bg-card transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-semibold leading-tight">{group.name}</CardTitle>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ml-2 ${statusColors[group.status as keyof typeof statusColors] || statusColors.active}`}
          >
            {group.status}
          </Badge>
        </div>
        {group.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{group.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm mb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{group.currentMembers ?? 0} / {group.maxParticipants} managers</span>
          </div>
          {group.myRank && (
            <div className="flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-yellow-400">#{group.myRank}</span>
            </div>
          )}
        </div>
        {group.myReturnPct != null && (
          <div className="mb-3 pb-3 border-b border-border/50">
            <p className="text-xs text-muted-foreground mb-0.5">Your Performance</p>
            <p className={`text-sm font-mono font-bold ${pnlClass(group.myReturnPct)}`}>
              {formatPct(group.myReturnPct)} return
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Total Capital</p>
            <p className="font-mono font-medium">{formatCurrency(parseFloat(group.totalCapital))}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reallocation</p>
            <p className="font-medium">{
              group.reallocationInterval === "1week" ? "Every week" :
              group.reallocationInterval === "2weeks" ? "Every 2 weeks" :
              group.reallocationInterval === "1month" ? "Every month" :
              group.reallocationInterval === "3months" ? "Every 3mo" :
              group.reallocationInterval === "6months" ? "Every 6mo" : "Annually"
            }</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
