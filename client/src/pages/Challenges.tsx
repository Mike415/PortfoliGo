import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Trophy,
  Plus,
  Target,
  Zap,
  Clock,
  CheckCircle,
  Trash2,
  Medal,
  Eye,
  EyeOff,
  Users,
  Search,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  BarChart2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChallengeStatus = "upcoming" | "picking" | "active" | "scoring" | "completed";

interface EntryRow {
  id: number;
  sleeveId: number;
  userId: number;
  displayName: string;
  isMe: boolean;
  ticker: string | null;
  assetName: string | null;
  entryPrice: string | null;
  exitPrice: string | null;
  returnPct: string | null;
  rank: number | null;
  isWinner: number;
  startValue: string | null;
  currentValue: string | null;
  enteredAt: Date | string | null;
}

interface EarningsPickRow {
  id: number;
  challengeId: number;
  sleeveId: number;
  userId: number;
  ticker: string | null;
  assetName: string | null;
  direction: "up" | "down" | null;
  prevClose: string | null;
  openPrice: string | null;
  result: "pending" | "correct" | "wrong";
  points: number;
  displayName: string;
  isMe: boolean;
  createdAt: Date | string;
  scoredAt: Date | string | null;
}

interface ChallengeListItem {
  id: number;
  name: string;
  description: string | null;
  type: "conviction" | "sprint" | "earnings";
  startDate: Date | string;
  pickWindowEnd: Date | string | null;
  endDate: Date | string;
  allocationBump: string;
  recurring: number;
  recurringInterval: "weekly" | "monthly" | null;
  status: string;
  liveStatus: ChallengeStatus;
  picksHidden: boolean;
  myEntry: null | EntryRow;
  entries: EntryRow[];
  entryCount: number;
  myEarningsPicks: EarningsPickRow[];
  allEarningsPicks: EarningsPickRow[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ChallengeStatus }) {
  const map: Record<ChallengeStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    upcoming:  { label: "Upcoming",          variant: "secondary" },
    picking:   { label: "Pick Window Open",  variant: "default"   },
    active:    { label: "Active",            variant: "default"   },
    scoring:   { label: "Ready to Score",    variant: "outline"   },
    completed: { label: "Completed",         variant: "secondary" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Podium medal helper ───────────────────────────────────────────────────────

function RankMedal({ rank }: { rank: number | null }) {
  if (rank === 1) return <span className="text-yellow-400 font-bold">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-bold">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold">🥉</span>;
  if (rank !== null) return <span className="text-muted-foreground text-xs font-medium">#{rank}</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

// ─── Competitor leaderboard table ─────────────────────────────────────────────

function CompetitorTable({
  challenge,
  entries,
}: {
  challenge: ChallengeListItem;
  entries: EntryRow[];
}) {
  const { liveStatus, picksHidden, type } = challenge;
  const isConviction = type === "conviction";
  const isCompleted = liveStatus === "completed";
  const isActive = liveStatus === "active" || liveStatus === "scoring";

  // During pick window: just show a "X submitted" count, no names/tickers
  if (liveStatus === "picking") {
    const submittedCount = entries.length;
    return (
      <div className="rounded-md bg-muted/30 border border-border/40 px-4 py-3 flex items-center gap-3 text-sm">
        <EyeOff className="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium">Picks are sealed until the pick window closes</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {submittedCount === 0
              ? "No picks submitted yet"
              : `${submittedCount} ${submittedCount === 1 ? "manager has" : "managers have"} submitted — picks revealed when window closes`}
          </p>
        </div>
      </div>
    );
  }

  // Upcoming: no entries yet
  if (liveStatus === "upcoming") {
    return (
      <div className="rounded-md bg-muted/20 border border-border/30 px-4 py-3 flex items-center gap-3 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" />
        <span>Challenge hasn't started yet</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md bg-muted/20 border border-border/30 px-4 py-3 text-sm text-muted-foreground text-center">
        No entries yet
      </div>
    );
  }

  // Active / scoring / completed: show full leaderboard
  // For sprint: compute live return % from startValue + currentValue
  const rows = entries.map((e) => {
    let liveReturn: number | null = null;
    if (isConviction) {
      liveReturn = e.returnPct !== null ? parseFloat(e.returnPct) : null;
    } else {
      // Sprint: use scored returnPct if available, else compute from currentValue
      if (e.returnPct !== null) {
        liveReturn = parseFloat(e.returnPct);
      } else if (e.startValue && e.currentValue) {
        const sv = parseFloat(e.startValue);
        const cv = parseFloat(e.currentValue);
        liveReturn = sv > 0 ? ((cv - sv) / sv) * 100 : null;
      }
    }
    return { ...e, liveReturn };
  });

  // Sort by liveReturn desc (nulls last) if not already ranked
  const sorted = [...rows].sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.liveReturn !== null && b.liveReturn !== null) return b.liveReturn - a.liveReturn;
    if (a.liveReturn !== null) return -1;
    if (b.liveReturn !== null) return 1;
    return 0;
  });

  return (
    <div className="rounded-md border border-border/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
            <th className="text-left px-3 py-2 w-8">#</th>
            <th className="text-left px-3 py-2">Manager</th>
            {isConviction && <th className="text-left px-3 py-2">Pick</th>}
            {isConviction && <th className="text-right px-3 py-2">Entry $</th>}
            {isConviction && <th className="text-right px-3 py-2">Exit $</th>}
            {!isConviction && <th className="text-right px-3 py-2">Start Value</th>}
            {!isConviction && <th className="text-right px-3 py-2">Current</th>}
            <th className="text-right px-3 py-2">Return</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const displayRank = row.rank ?? idx + 1;
            const isWinner = row.isWinner === 1;
            return (
              <tr
                key={row.id}
                className={`border-t border-border/30 transition-colors ${
                  row.isMe ? "bg-primary/5" : isWinner && isCompleted ? "bg-yellow-500/5" : "hover:bg-muted/20"
                }`}
              >
                <td className="px-3 py-2.5">
                  <RankMedal rank={isCompleted || liveStatus === "scoring" ? row.rank : displayRank} />
                </td>
                <td className="px-3 py-2.5">
                  <span className={`font-medium ${row.isMe ? "text-primary" : ""}`}>
                    {row.displayName}
                    {row.isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                  </span>
                </td>
                {isConviction && (
                  <td className="px-3 py-2.5">
                    {row.ticker ? (
                      <span className="font-mono font-semibold">{row.ticker}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Hidden</span>
                    )}
                  </td>
                )}
                {isConviction && (
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {row.entryPrice ? `$${parseFloat(row.entryPrice).toFixed(2)}` : "—"}
                  </td>
                )}
                {isConviction && (
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {row.exitPrice ? `$${parseFloat(row.exitPrice).toFixed(2)}` : "—"}
                  </td>
                )}
                {!isConviction && (
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {row.startValue ? `$${parseFloat(row.startValue).toLocaleString()}` : "—"}
                  </td>
                )}
                {!isConviction && (
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {row.currentValue ? `$${parseFloat(row.currentValue).toLocaleString()}` : "—"}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right">
                  {row.liveReturn !== null ? (
                    <span
                      className={`font-mono font-semibold text-sm ${
                        row.liveReturn >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {row.liveReturn >= 0 ? "+" : ""}
                      {row.liveReturn.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Ticker autocomplete (same pattern as SleeveManager) ────────────────────

type AssetType = "stock" | "etf" | "crypto";
type SearchResult = { ticker: string; name: string; assetType: AssetType };

const ASSET_BADGE: Record<AssetType, string> = {
  stock:  "text-blue-400 border-blue-400/30",
  etf:    "text-purple-400 border-purple-400/30",
  crypto: "text-yellow-400 border-yellow-400/30",
};

function TickerSearch({
  onSelect,
  onReset,
  locked,
}: {
  onSelect: (result: SearchResult & { price: number }) => void;
  onReset: () => void;
  locked: (SearchResult & { price: number }) | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: results, isFetching } = trpc.pricing.search.useQuery(
    { query },
    { enabled: query.length >= 1 && !locked, staleTime: 30_000 }
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback(async (item: SearchResult) => {
    setOpen(false);
    setQuery(item.ticker);
    setResolving(true);
    try {
      const quote = await utils.pricing.getQuote.fetch({ ticker: item.ticker });
      onSelect({ ...item, price: quote.price, assetType: quote.assetType as AssetType });
    } catch {
      toast.error(`Could not fetch live price for ${item.ticker}. Try again.`);
      setQuery("");
    } finally {
      setResolving(false);
    }
  }, [utils, onSelect]);

  if (locked) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <span className="font-mono font-bold text-sm flex-1">{locked.ticker}</span>
        <span className="text-xs text-muted-foreground truncate">{locked.name}</span>
        <Badge variant="outline" className={`text-xs shrink-0 ${ASSET_BADGE[locked.assetType]}`}>
          {locked.assetType}
        </Badge>
        <span className="font-mono text-sm font-semibold text-green-400">
          ${locked.price.toFixed(2)}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Change ticker"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search ticker or company name..."
          value={query}
          onChange={(e) => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => query.length >= 1 && setOpen(true)}
          className="font-mono pl-9 pr-8"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {(isFetching || resolving) && (
          <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && results && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-lg border border-border/60 bg-card shadow-xl overflow-hidden"
        >
          {results.map((item) => (
            <button
              key={item.ticker}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item as SearchResult); }}
            >
              <span className="font-mono font-bold text-sm w-24 shrink-0">{item.ticker}</span>
              <span className="text-sm text-muted-foreground truncate flex-1">{item.name}</span>
              <Badge variant="outline" className={`text-xs shrink-0 ${ASSET_BADGE[item.assetType as AssetType] || ""}` }>
                {item.assetType}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 1 && (!results || results.length === 0) && !isFetching && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-lg border border-border/60 bg-card shadow-xl p-3 text-sm text-muted-foreground"
        >
          No results for "{query}" — try an exact ticker (e.g. AAPL, BTC-USD)
        </div>
      )}
    </div>
  );
}

// ─── Challenge card ───────────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  isAdmin,
  groupId,
  onRefresh,
}: {
  challenge: ChallengeListItem;
  isAdmin: boolean;
  groupId: number;
  onRefresh: () => void;
}) {
  const [selectedPick, setSelectedPick] = useState<(SearchResult & { price: number }) | null>(null);
  const [pickDialogOpen, setPickDialogOpen] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);

  const enterConviction = trpc.challenges.enterConviction.useMutation({
    onSuccess: (data) => {
      toast.success(`Pick submitted: ${data.ticker} @ $${data.entryPrice?.toFixed(2) ?? "N/A"}`);
      setPickDialogOpen(false);
      setSelectedPick(null);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePick = trpc.challenges.deletePick.useMutation({
    onSuccess: () => {
      toast.success("Pick removed — you can now submit a new one");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const enrollSprint = trpc.challenges.enrollSprint.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.enrolled} manager(s) enrolled in sprint`);
      setEnrollDialogOpen(false);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const score = trpc.challenges.score.useMutation({
    onSuccess: (data) => {
      if (data.winner) {
        toast.success(`Challenge scored! Winner gets +$${data.winner.bump.toLocaleString()} allocation bump`);
      } else {
        toast.success("Challenge scored — no entries to award");
      }
      setScoreDialogOpen(false);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteChallenge = trpc.challenges.delete.useMutation({
    onSuccess: () => {
      toast.success("Challenge deleted");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const bump = parseFloat(challenge.allocationBump);
  const endDate = new Date(challenge.endDate);
  const startDate = new Date(challenge.startDate);
  const pickEnd = challenge.pickWindowEnd ? new Date(challenge.pickWindowEnd) : null;

  const typeIcon = challenge.type === "conviction"
    ? <Target className="h-4 w-4 text-blue-400" />
    : <Zap className="h-4 w-4 text-yellow-400" />;
  const typeLabel = challenge.type === "conviction" ? "Conviction Play" : "Sprint";

  return (
    <Card className="border border-border/50 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {typeIcon}
            <CardTitle className="text-base truncate">{challenge.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={challenge.liveStatus} />
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete challenge?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{challenge.name}" and all entries. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteChallenge.mutate({ challengeId: challenge.id })}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-1">
          <span className="flex items-center gap-1">{typeIcon} {typeLabel}</span>
          {challenge.recurring === 1 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Recurring {challenge.recurringInterval}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Trophy className="h-3 w-3 text-yellow-500" />
            +${bump.toLocaleString()} bump
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {challenge.entryCount} {challenge.entryCount === 1 ? "entry" : "entries"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {challenge.description && (
          <p className="text-sm text-muted-foreground">{challenge.description}</p>
        )}

        {/* Timeline */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground block">Start</span>
            <p className="font-medium">{startDate.toLocaleDateString()}</p>
          </div>
          {challenge.type === "conviction" && pickEnd && (
            <div>
              <span className="text-muted-foreground block">Pick deadline</span>
              <p className="font-medium">{pickEnd.toLocaleDateString()}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground block">End</span>
            <p className="font-medium">{endDate.toLocaleDateString()}</p>
          </div>
        </div>

        {/* My entry status (own pick confirmation) */}
        {challenge.myEntry && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center gap-2">
            {challenge.myEntry.isWinner === 1 ? (
              <Medal className="h-4 w-4 text-yellow-400" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            <span>
              {challenge.type === "conviction" && challenge.myEntry.ticker
                ? `Your pick: ${challenge.myEntry.ticker}`
                : challenge.type === "conviction"
                ? "Your pick: submitted ✓"
                : "Enrolled"}
              {challenge.myEntry.returnPct !== null && challenge.myEntry.returnPct !== undefined
                ? ` · ${parseFloat(challenge.myEntry.returnPct) >= 0 ? "+" : ""}${parseFloat(challenge.myEntry.returnPct).toFixed(2)}%`
                : ""}
              {challenge.myEntry.rank !== null && challenge.myEntry.rank !== undefined
                ? ` · Rank #${challenge.myEntry.rank}`
                : ""}
              {challenge.myEntry.isWinner === 1 ? " 🏆 Winner!" : ""}
            </span>
          </div>
        )}

        {/* ── Competitor leaderboard ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {challenge.liveStatus === "picking" ? (
              <><EyeOff className="h-3 w-3" /> Picks Sealed</>
            ) : (
              <><Eye className="h-3 w-3" /> Leaderboard</>
            )}
          </div>
          <CompetitorTable challenge={challenge} entries={challenge.entries} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Conviction: submit pick during pick window */}
          {challenge.type === "conviction" && challenge.liveStatus === "picking" && !challenge.myEntry && (
            <Dialog open={pickDialogOpen} onOpenChange={(o) => { setPickDialogOpen(o); if (!o) setSelectedPick(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Target className="h-3.5 w-3.5" /> Submit Pick
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Your Conviction Pick</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Choose ONE ticker you believe will have the highest return by{" "}
                    {endDate.toLocaleDateString()}. Your entry price will be the live market price at
                    submission. <strong>Your pick is hidden from competitors until the pick window closes.</strong>
                  </p>
                  <div className="space-y-1.5">
                    <Label>Search Ticker</Label>
                    <TickerSearch
                      locked={selectedPick}
                      onSelect={(r) => setSelectedPick(r)}
                      onReset={() => setSelectedPick(null)}
                    />
                  </div>
                  {selectedPick && (
                    <div className="rounded-md bg-muted/30 border border-border/40 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Entry price: </span>
                      <span className="font-mono font-semibold text-green-400">${selectedPick.price.toFixed(2)}</span>
                      <span className="text-muted-foreground ml-2 text-xs">(live market price at submission)</span>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={!selectedPick || enterConviction.isPending}
                    onClick={() =>
                      selectedPick &&
                      enterConviction.mutate({ challengeId: challenge.id, ticker: selectedPick.ticker })
                    }
                  >
                    {enterConviction.isPending ? "Submitting..." : "Lock In Pick"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Conviction: change pick during pick window (delete + reopen) */}
          {challenge.type === "conviction" && challenge.liveStatus === "picking" && challenge.myEntry && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Change Pick
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Change your pick?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your current pick will be removed and you can submit a new one. You can only do this
                    before the pick window closes on{" "}
                    {pickEnd ? pickEnd.toLocaleString() : endDate.toLocaleDateString()}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Current Pick</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deletePick.mutate({ challengeId: challenge.id })}
                    disabled={deletePick.isPending}
                  >
                    {deletePick.isPending ? "Removing..." : "Remove & Re-pick"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Sprint: admin enrolls all managers */}
          {challenge.type === "sprint" && isAdmin && challenge.liveStatus === "active" && (
            <AlertDialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Zap className="h-3.5 w-3.5" /> Enroll All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enroll all managers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will record each manager's current sleeve value as their sprint starting point.
                    Do this at the start of the sprint period.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => enrollSprint.mutate({ challengeId: challenge.id })}>
                    Enroll All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Admin: score & award */}
          {isAdmin && (challenge.liveStatus === "scoring" || challenge.liveStatus === "active") && (
            <AlertDialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Score & Award
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Score this challenge?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will fetch live prices, rank all entries, mark the winner, and award a{" "}
                    <strong>+${bump.toLocaleString()}</strong> allocation bump to the winner's sleeve.
                    {challenge.recurring === 1 && " A new challenge will be created automatically."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => score.mutate({ challengeId: challenge.id })}>
                    Score & Award Bump
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create Challenge Form ────────────────────────────────────────────────────

function CreateChallengeDialog({ groupId, onCreated }: { groupId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"conviction" | "sprint">("sprint");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [pickWindowEnd, setPickWindowEnd] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allocationBump, setAllocationBump] = useState("5000");
  const [recurring, setRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"weekly" | "monthly">("weekly");

  const create = trpc.challenges.create.useMutation({
    onSuccess: () => {
      toast.success("Challenge created!");
      setOpen(false);
      resetForm();
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setName("");
    setDescription("");
    setStartDate("");
    setPickWindowEnd("");
    setEndDate("");
    setAllocationBump("5000");
    setRecurring(false);
    setRecurringInterval("weekly");
    setType("sprint");
  }

  function handleSubmit() {
    if (!name.trim() || !startDate || !endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (type === "conviction" && !pickWindowEnd) {
      toast.error("Conviction challenges require a pick deadline");
      return;
    }
    create.mutate({
      groupId,
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      startDate,
      pickWindowEnd: type === "conviction" ? pickWindowEnd : undefined,
      endDate,
      allocationBump: parseFloat(allocationBump) || 5000,
      recurring,
      recurringInterval: recurring ? recurringInterval : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Challenge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Mini-Competition</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("sprint")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                type === "sprint"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm mb-1">
                <Zap className="h-4 w-4 text-yellow-500" /> Sprint
              </div>
              <p className="text-xs text-muted-foreground">Best portfolio return over a period wins</p>
            </button>
            <button
              type="button"
              onClick={() => setType("conviction")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                type === "conviction"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm mb-1">
                <Target className="h-4 w-4 text-blue-500" /> Conviction Play
              </div>
              <p className="text-xs text-muted-foreground">Each manager picks one ticker; highest gain wins</p>
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label>
              Challenge Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder={type === "conviction" ? "e.g. Q2 Conviction Play" : "e.g. April Sprint"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>
              Description{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              placeholder="Any special rules or context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {type === "conviction" && (
              <div className="space-y-1.5">
                <Label>
                  Pick Deadline <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={pickWindowEnd}
                  onChange={(e) => setPickWindowEnd(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Allocation bump */}
          <div className="space-y-1.5">
            <Label>Allocation Bump ($) for Winner</Label>
            <Input
              type="number"
              min="0"
              step="1000"
              value={allocationBump}
              onChange={(e) => setAllocationBump(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Added to the winner's sleeve allocation (in-kind, no forced liquidation).
            </p>
          </div>

          {/* Recurring */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div>
              <p className="text-sm font-medium">Recurring</p>
              <p className="text-xs text-muted-foreground">
                Auto-create next challenge after scoring
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {recurring && (
            <div className="space-y-1.5">
              <Label>Recurrence Interval</Label>
              <Select
                value={recurringInterval}
                onValueChange={(v) => setRecurringInterval(v as "weekly" | "monthly")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create Challenge"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Challenges() {
  const { id: groupId } = useParams<{ id: string }>();
  const gid = parseInt(groupId ?? "0");
  const { user } = useAuth();

  const { data: group } = trpc.group.get.useQuery(
    { groupId: gid },
    { enabled: !!gid && !!user }
  );
  const isAdmin =
    (group as any)?.members?.find((m: any) => m.userId === user?.id)?.role === "admin";

  const { data: challengeList, refetch } = trpc.challenges.list.useQuery(
    { groupId: gid },
    { enabled: !!gid && !!user }
  );

  const active   = challengeList?.filter((c) => ["picking", "active", "scoring"].includes(c.liveStatus)) ?? [];
  const upcoming = challengeList?.filter((c) => c.liveStatus === "upcoming") ?? [];
  const completed = challengeList?.filter((c) => c.liveStatus === "completed") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mini-Competitions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Short-term challenges with allocation bumps for the winner
          </p>
        </div>
        {isAdmin && <CreateChallengeDialog groupId={gid} onCreated={() => refetch()} />}
      </div>

      {/* Active & Scoring */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Active
          </h3>
          {active.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c as unknown as ChallengeListItem}
              isAdmin={!!isAdmin}
              groupId={gid}
              onRefresh={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Upcoming
          </h3>
          {upcoming.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c as unknown as ChallengeListItem}
              isAdmin={!!isAdmin}
              groupId={gid}
              onRefresh={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Completed
          </h3>
          {completed.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c as unknown as ChallengeListItem}
              isAdmin={!!isAdmin}
              groupId={gid}
              onRefresh={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!challengeList?.length && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground font-medium">No challenges yet</p>
          {isAdmin ? (
            <p className="text-sm text-muted-foreground mt-1">
              Create a Conviction Play or Sprint to keep managers engaged.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Your admin hasn't created any challenges yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
