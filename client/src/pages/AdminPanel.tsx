import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatPct, pnlClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Trophy, AlertTriangle, ChevronUp, ChevronDown, Clock, Settings, Trash2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminPanel() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const { data: preview, isLoading: previewLoading } = trpc.admin.previewReallocation.useQuery(
    { groupId },
    { enabled: !!groupId }
  );

  const { data: history } = trpc.admin.getReallocationHistory.useQuery(
    { groupId },
    { enabled: !!groupId }
  );

  const { data: group } = trpc.group.get.useQuery(
    { groupId },
    { enabled: !!groupId }
  );

  const executeMutation = trpc.admin.executeReallocation.useMutation({
    onSuccess: () => {
      toast.success("Reallocation executed successfully!");
      setConfirming(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirming(false);
    },
  });

  const deleteMutation = trpc.group.delete.useMutation({
    onSuccess: () => {
      toast.success("Competition deleted");
      setLocation("/");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const isAdmin = group?.members?.find((m: any) => m.userId === user?.id)?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Admin access required</p>
          <Button onClick={() => setLocation(`/group/${groupId}`)} variant="outline">Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center h-14 gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/group/${groupId}`)} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-semibold text-sm leading-none">Admin Panel</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{group?.name}</p>
          </div>
          <Badge variant="outline" className="ml-2 text-xs text-primary border-primary/30">Admin</Badge>
        </div>
      </header>

      <main className="container py-6 max-w-3xl space-y-6">
        {/* Group info */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Group Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {group && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Invite Code</p>
                  <p className="font-mono font-bold text-primary">{group.inviteCode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Reallocation</p>
                  <p className="font-medium">{group.reallocationInterval === "3months" ? "Every 3 months" : group.reallocationInterval === "6months" ? "Every 6 months" : "Annually"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Transfer %</p>
                  <p className="font-mono font-bold">{group.reallocationPercent}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Next Reallocation</p>
                  <p className="font-medium text-xs">
                    {group.nextReallocationDate
                      ? new Date(group.nextReallocationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "Not set"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reallocation Preview */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <CardTitle className="text-base">Reallocation Preview</CardTitle>
            </div>
            <CardDescription>
              Based on current P&L rankings. Bottom performer loses {group?.reallocationPercent}% of their sleeve to the top performer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : preview ? (
              <>
                <div className="space-y-2 mb-4">
                  {preview.changes.map((change: any) => (
                    <ReallocationRow key={change.sleeveId} change={change} total={preview.changes.length} />
                  ))}
                </div>

                <div className="rounded-lg bg-muted/30 p-3 text-sm mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Transfer Amount</span>
                    <span className="font-mono font-bold text-primary">{formatCurrency(preview.transferAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium text-red-400">{preview.loser?.displayName}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">To</span>
                    <span className="font-medium text-green-400">{preview.winner?.displayName}</span>
                  </div>
                </div>

                {!confirming ? (
                  <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={() => setConfirming(true)}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Execute Reallocation
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-center">
                      <p className="font-medium text-destructive">Are you sure?</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        This will permanently transfer {formatCurrency(preview.transferAmount)} from {preview.loser?.displayName} to {preview.winner?.displayName}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => executeMutation.mutate({ groupId })}
                        disabled={executeMutation.isPending}
                      >
                        {executeMutation.isPending ? "Executing..." : "Confirm"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">
                Need at least 2 participants with positions to preview reallocation
              </p>
            )}
          </CardContent>
        </Card>

        {/* Reallocation History */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Reallocation History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!history || history.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No reallocations yet</p>
            ) : (
              <div className="space-y-3">
                {history.map((event: any) => (
                  <div key={event.id} className="rounded-lg border border-border/50 p-3 text-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Reallocation #{event.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.executedAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric"
                        })}
                      </span>
                    </div>
                    {event.changes && event.changes.map((c: any) => (
                      <div key={c.id} className="flex justify-between text-xs text-muted-foreground">
                        <span>Rank #{c.rank}</span>
                        <span className={parseFloat(c.changeAmount) >= 0 ? "text-green-400" : "text-red-400"}>
                          {parseFloat(c.changeAmount) >= 0 ? "+" : ""}{formatCurrency(parseFloat(c.changeAmount))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone — Delete Competition */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            </div>
            <CardDescription>
              Permanently delete this competition and all associated data — sleeves, positions, trades, and snapshots. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={deleteMutation.isPending}>
                  <Trash2 className="w-4 h-4" />
                  Delete Competition
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-destructive/30">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{group?.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the competition and all associated data including sleeves, positions, trades, and price history. This action <strong>cannot be undone</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ groupId })}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Yes, delete everything"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ReallocationRow({ change, total }: { change: any; total: number }) {
  const isWinner = change.rank === 1;
  const isLoser = change.rank === total;
  const hasChange = change.changeAmount !== 0;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isWinner ? "border-green-400/20 bg-green-400/5" :
      isLoser ? "border-red-400/20 bg-red-400/5" :
      "border-border/30 bg-card/30"
    }`}>
      <div className="w-6 text-center text-xs font-bold text-muted-foreground">
        #{change.rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{change.displayName}</p>
        <p className={`text-xs font-mono ${pnlClass(change.returnPct)}`}>
          {formatPct(change.returnPct)} return
        </p>
      </div>
      <div className="text-right text-sm">
        <p className="font-mono text-muted-foreground line-through text-xs">
          {formatCurrency(change.previousAllocation, true)}
        </p>
        <p className="font-mono font-bold">{formatCurrency(change.newAllocation, true)}</p>
      </div>
      {hasChange && (
        <div className={`text-xs font-mono font-bold shrink-0 flex items-center gap-0.5 ${change.changeAmount > 0 ? "text-green-400" : "text-red-400"}`}>
          {change.changeAmount > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {change.changeAmount > 0 ? "+" : ""}{formatCurrency(change.changeAmount, true)}
        </div>
      )}
    </div>
  );
}
