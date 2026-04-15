import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatCurrency, formatPct, pnlClass } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Trophy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sideBadge(side: string) {
  const map: Record<string, { label: string; class: string }> = {
    buy:   { label: "BUY",   class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    sell:  { label: "SELL",  class: "bg-red-500/15 text-red-400 border-red-500/30" },
    short: { label: "SHORT", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    cover: { label: "COVER", class: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  };
  const s = map[side] ?? { label: side.toUpperCase(), class: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold border ${s.class}`}>
      {s.label}
    </span>
  );
}

// ─── Cash Adjustment Form ─────────────────────────────────────────────────────

function CashAdjustForm({
  groupId,
  sleeveId,
  displayName,
  currentCash,
  onSuccess,
}: {
  groupId: number;
  sleeveId: number;
  displayName: string;
  currentCash: number;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const utils = trpc.useUtils();
  const mutation = trpc.admin.adjustCash.useMutation({
    onSuccess: (data) => {
      toast.success(
        `${type === "add" ? "Added" : "Deducted"} ${formatCurrency(Math.abs(data.amount))} ${type === "add" ? "to" : "from"} ${displayName}'s sleeve`
      );
      setAmount("");
      setReason("");
      setOpen(false);
      utils.admin.getPlayers.invalidate({ groupId });
      utils.admin.getActivityLedger.invalidate({ groupId, sleeveId });
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    mutation.mutate({
      groupId,
      sleeveId,
      amount: type === "deduct" ? -parsed : parsed,
      reason: reason.trim(),
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
          <DollarSign className="w-3.5 h-3.5" />
          Adjust Cash
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/20 space-y-3">
          <p className="text-xs text-muted-foreground">
            Current cash: <span className="font-mono font-semibold text-foreground">{formatCurrency(currentCash)}</span>
          </p>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "add" | "deduct")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Cash</SelectItem>
                  <SelectItem value="deduct">Deduct Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea
              placeholder="e.g. Correction for missed dividend, bonus award..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs min-h-[60px] resize-none"
              maxLength={512}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={mutation.isPending}
              onClick={handleSubmit}
            >
              {type === "add" ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
              {mutation.isPending ? "Saving..." : `Confirm ${type === "add" ? "Addition" : "Deduction"}`}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Activity Ledger Panel ────────────────────────────────────────────────────

function LedgerPanel({ groupId, sleeveId }: { groupId: number; sleeveId: number }) {
  const [tab, setTab] = useState<"trades" | "awards" | "reallocations" | "cash">("trades");

  const { data, isLoading } = trpc.admin.getActivityLedger.useQuery(
    { groupId, sleeveId },
    { enabled: !!sleeveId }
  );

  type LedgerData = Exclude<typeof data, null | undefined | never[]>;
  const ledger = (Array.isArray(data) ? null : data) as LedgerData | null;

  const tabs = [
    { id: "trades" as const, label: "Trades", count: ledger?.trades?.length },
    { id: "awards" as const, label: "Challenge Awards", count: ledger?.awards?.length },
    { id: "reallocations" as const, label: "Reallocations", count: ledger?.reallocations?.length },
    { id: "cash" as const, label: "Cash Adjustments", count: ledger?.cashAdjustments?.length },
  ];

  return (
    <div className="mt-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/50 mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              tab === t.id
                ? "bg-card border border-b-card border-border/50 text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Trades */}
          {tab === "trades" && (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Ticker</TableHead>
                    <TableHead className="text-xs">Side</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Price</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Realized P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger?.trades?.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                        No trades yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger!.trades.map((t) => {
                      const pnl = parseFloat(t.realizedPnl ?? "0");
                      return (
                        <TableRow key={t.id} className="border-border/30 hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(t.executedAt)}</TableCell>
                          <TableCell className="text-xs font-mono font-semibold">{t.ticker}</TableCell>
                          <TableCell>{sideBadge(t.side)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{parseFloat(t.quantity).toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(parseFloat(t.price))}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(parseFloat(t.totalValue))}</TableCell>
                          <TableCell className={`text-xs text-right font-mono font-semibold ${pnlClass(pnl)}`}>
                            {pnl !== 0 ? (pnl > 0 ? "+" : "") + formatCurrency(pnl) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Awards */}
          {tab === "awards" && (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Challenge</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Rank</TableHead>
                    <TableHead className="text-xs text-right">Return / Points</TableHead>
                    <TableHead className="text-xs text-right">Bump Awarded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger?.awards?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                        No challenge entries yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger!.awards.map((a) => {
                      const bump = parseFloat(a.allocationBump ?? "0");
                      const ret = parseFloat(a.returnPct ?? "0");
                      return (
                        <TableRow key={a.entryId} className="border-border/30 hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(a.scoredAt)}</TableCell>
                          <TableCell className="text-xs font-medium">{a.challengeName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] capitalize">{a.challengeType}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {a.rank ? `#${a.rank}` : "—"}
                          </TableCell>
                          <TableCell className={`text-xs text-right font-mono font-semibold ${a.challengeType === "earnings" ? (ret >= 0 ? "text-emerald-400" : "text-red-400") : pnlClass(ret)}`}>
                            {a.challengeType === "earnings"
                              ? `${ret > 0 ? "+" : ""}${ret} pts`
                              : `${ret > 0 ? "+" : ""}${ret.toFixed(2)}%`}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">
                            {a.isWinner ? (
                              <span className="text-yellow-400 flex items-center justify-end gap-1">
                                <Trophy className="w-3 h-3" />
                                +{formatCurrency(bump)}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Reallocations */}
          {tab === "reallocations" && (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Rank</TableHead>
                    <TableHead className="text-xs text-right">Previous Alloc</TableHead>
                    <TableHead className="text-xs text-right">New Alloc</TableHead>
                    <TableHead className="text-xs text-right">Change</TableHead>
                    <TableHead className="text-xs text-right">Return at Time</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger?.reallocations?.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                        No reallocations yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger!.reallocations.map((r) => {
                      const change = parseFloat(r.changeAmount);
                      return (
                        <TableRow key={r.id} className="border-border/30 hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.executedAt)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">#{r.rank}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(parseFloat(r.previousAllocation))}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(parseFloat(r.newAllocation))}</TableCell>
                          <TableCell className={`text-xs text-right font-mono font-semibold ${pnlClass(change)}`}>
                            {change > 0 ? "+" : ""}{formatCurrency(change)}
                          </TableCell>
                          <TableCell className={`text-xs text-right font-mono ${pnlClass(parseFloat(r.returnPctAtTime))}`}>
                            {parseFloat(r.returnPctAtTime) > 0 ? "+" : ""}{parseFloat(r.returnPctAtTime).toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.notes || "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Cash Adjustments */}
          {tab === "cash" && (
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger?.cashAdjustments?.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                        No cash adjustments yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger!.cashAdjustments.map((c) => {
                      const amt = parseFloat(c.amount);
                      return (
                        <TableRow key={c.id} className="border-border/30 hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt)}</TableCell>
                          <TableCell className={`text-xs text-right font-mono font-semibold ${pnlClass(amt)}`}>
                            {amt > 0 ? "+" : ""}{formatCurrency(amt)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.reason}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminLedger() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedSleeveId, setSelectedSleeveId] = useState<number | null>(null);

  const { data: group } = trpc.group.get.useQuery({ groupId }, { enabled: !!groupId });
  const { data: players, isLoading: playersLoading } = trpc.admin.getPlayers.useQuery(
    { groupId },
    { enabled: !!groupId }
  );

  const isAdmin = group?.members?.find((m: any) => m.userId === user?.id)?.role === "admin";

  const selectedPlayer = players?.find((p) => p.id === selectedSleeveId);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Admin access required</p>
          <Button onClick={() => setLocation(`/group/${groupId}`)} variant="outline">Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center h-14 gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/group/${groupId}/admin`)} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-semibold text-sm leading-none">Players & Ledger</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{group?.name}</p>
          </div>
          <Badge variant="outline" className="ml-2 text-xs text-primary border-primary/30">Admin</Badge>
        </div>
      </header>

      <main className="container py-6 max-w-5xl space-y-6">
        {/* Players Grid */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Players
          </h2>
          {playersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {players?.map((p) => {
                const cash = parseFloat(p.cashBalance);
                const total = parseFloat(p.totalValue);
                const alloc = parseFloat(p.allocatedCapital);
                const ret = parseFloat(p.returnPct);
                const isSelected = selectedSleeveId === p.id;
                return (
                  <Card
                    key={p.id}
                    className={`border transition-all cursor-pointer ${isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card/80 hover:border-border"}`}
                    onClick={() => setSelectedSleeveId(isSelected ? null : p.id)}
                  >
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{p.displayName}</CardTitle>
                        <span className={`text-sm font-bold font-mono ${pnlClass(ret)}`}>
                          {ret > 0 ? "+" : ""}{ret.toFixed(2)}%
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Total Value</p>
                          <p className="font-mono font-semibold">{formatCurrency(total)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Cash</p>
                          <p className="font-mono font-semibold">{formatCurrency(cash)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Allocated</p>
                          <p className="font-mono font-semibold">{formatCurrency(alloc)}</p>
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <CashAdjustForm
                          groupId={groupId}
                          sleeveId={p.id}
                          displayName={p.displayName}
                          currentCash={cash}
                          onSuccess={() => setSelectedSleeveId(p.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Ledger */}
        {selectedSleeveId && selectedPlayer && (
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Activity Ledger — {selectedPlayer.displayName}</CardTitle>
              </div>
              <CardDescription>
                All trades, challenge awards, reallocation events, and cash adjustments for this sleeve.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LedgerPanel groupId={groupId} sleeveId={selectedSleeveId} />
            </CardContent>
          </Card>
        )}

        {!selectedSleeveId && !playersLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
            Click a player card above to view their full activity ledger.
          </div>
        )}
      </main>
    </div>
  );
}
