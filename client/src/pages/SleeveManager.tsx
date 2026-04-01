import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatPct, formatQuantity, pnlClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Plus, RefreshCw, TrendingUp, Wallet, Clock,
  ChevronUp, ChevronDown, Search, TrendingDown, BarChart2, Eye
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

type AssetType = "stock" | "etf" | "crypto";
type TradeSide = "buy" | "sell" | "short" | "cover";

const ASSET_BADGE: Record<AssetType, string> = {
  stock: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  etf: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  crypto: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

const equityChartConfig: ChartConfig = {
  totalValue: {
    label: "Portfolio Value",
    color: "oklch(0.65 0.18 250)",
  },
};

export default function SleeveManager() {
  const { id: groupId, sleeveId } = useParams<{ id: string; sleeveId: string }>();
  const gId = parseInt(groupId || "0");
  const sId = parseInt(sleeveId || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [tradeOpen, setTradeOpen] = useState(false);
  const [prefillPosition, setPrefillPosition] = useState<null | { ticker: string; assetType: AssetType; price: number; isShort: boolean }>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load the sleeve by its ID (any member can view any sleeve)
  const { data: sleeve, refetch, isLoading } = trpc.portfolio.getSleeveById.useQuery(
    { sleeveId: sId, groupId: gId },
    { enabled: !!sId && !!gId }
  );

  const { data: trades } = trpc.portfolio.getTrades.useQuery(
    { groupId: gId, limit: 50 },
    { enabled: !!gId && !!sleeve?.isOwner }
  );

  const { data: snapshots } = trpc.portfolio.getSnapshots.useQuery(
    { groupId: gId, limit: 90, sleeveId: sId || undefined },
    { enabled: !!gId && !!sId }
  );

  const refreshMutation = trpc.portfolio.refreshPrices.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success(`Refreshed ${data.updated} positions`);
      setRefreshing(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setRefreshing(true);
    refreshMutation.mutate({ groupId: gId });
  };

  const handlePositionClick = (pos: any) => {
    if (!sleeve?.isOwner) return;
    setPrefillPosition({
      ticker: pos.ticker,
      assetType: pos.assetType as AssetType,
      price: pos.currentPrice,
      isShort: pos.isShort,
    });
    setTradeOpen(true);
  };

  const handleTradeDialogClose = (open: boolean) => {
    setTradeOpen(open);
    if (!open) setPrefillPosition(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <TrendingUp className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!sleeve) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Sleeve not found or access denied.</p>
          <Button onClick={() => setLocation(`/group/${gId}`)} variant="outline">Back to Leaderboard</Button>
        </div>
      </div>
    );
  }

  const totalPnl = sleeve.realizedPnl + sleeve.unrealizedPnl;
  const isOwner = sleeve.isOwner;

  // Prepare chart data
  const chartData = snapshots && snapshots.length > 0
    ? snapshots.map((s) => ({
        date: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        totalValue: parseFloat(String(s.totalValue)),
      }))
    : [{ date: "Now", totalValue: sleeve.totalValue }];

  const chartMin = chartData.length > 1
    ? Math.min(...chartData.map((d) => d.totalValue)) * 0.995
    : sleeve.allocatedCapital * 0.97;
  const chartMax = chartData.length > 1
    ? Math.max(...chartData.map((d) => d.totalValue)) * 1.005
    : sleeve.totalValue * 1.03;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/group/${gId}`)} className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-sm leading-none">
                  {isOwner
                    ? (sleeve.name || `${user?.displayName || user?.username}'s Sleeve`)
                    : `${sleeve.ownerDisplayName}'s Sleeve`}
                </h1>
                {!isOwner && (
                  <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                    <Eye className="w-2.5 h-2.5" />
                    View only
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sleeve.positions.length} position{sleeve.positions.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2 h-8">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <Button size="sm" className="gap-2 h-8" onClick={() => { setPrefillPosition(null); setTradeOpen(true); }}>
                  <Plus className="w-3.5 h-3.5" />
                  Trade
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Trade Dialog */}
      {isOwner && (
        <Dialog open={tradeOpen} onOpenChange={handleTradeDialogClose}>
          <DialogContent className="bg-card border-border/50">
            <DialogHeader>
              <DialogTitle>{prefillPosition ? `Trade ${prefillPosition.ticker}` : "Add Trade"}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                {prefillPosition
                  ? `Current price: ${formatCurrency(prefillPosition.price)} · ${prefillPosition.isShort ? "Short position" : "Long position"}`
                  : "Search for a ticker and execute a trade at the live market price."}
              </DialogDescription>
            </DialogHeader>
            <TradeForm
              groupId={gId}
              cashBalance={sleeve.cashBalance}
              prefill={prefillPosition}
              onSuccess={() => { handleTradeDialogClose(false); refetch(); }}
            />
          </DialogContent>
        </Dialog>
      )}

      <main className="container py-6">
        {/* Sleeve metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground">Total Value</p>
                {(() => {
                  const extPos = sleeve.positions.find(
                    (p: any) => p.priceSource === "pre" || p.priceSource === "post"
                  );
                  if (!extPos) return null;
                  const isPre = extPos.priceSource === "pre";
                  return (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm leading-none ${
                        isPre
                          ? "bg-sky-400/15 text-sky-400 border border-sky-400/30"
                          : "bg-violet-400/15 text-violet-400 border border-violet-400/30"
                      }`}
                      title={isPre ? "Priced using pre-market data" : "Priced using after-hours data"}
                    >
                      {isPre ? "PRE" : "AH"}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xl font-bold font-mono">{formatCurrency(sleeve.totalValue)}</p>
              <p className={`text-xs font-mono mt-1 ${pnlClass(sleeve.returnPct)}`}>
                {formatPct(sleeve.returnPct)} return
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Cash Available</p>
              <p className="text-xl font-bold font-mono">{formatCurrency(sleeve.cashBalance)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {sleeve.totalValue > 0 ? ((sleeve.cashBalance / sleeve.totalValue) * 100).toFixed(1) : "100.0"}% of portfolio
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
              <p className={`text-xl font-bold font-mono ${pnlClass(sleeve.unrealizedPnl)}`}>
                {formatCurrency(sleeve.unrealizedPnl)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Open positions</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Realized P&L</p>
              <p className={`text-xl font-bold font-mono ${pnlClass(sleeve.realizedPnl)}`}>
                {formatCurrency(sleeve.realizedPnl)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Closed trades</p>
            </CardContent>
          </Card>
        </div>

        {/* Equity Curve */}
        <Card className="border-border/50 bg-card/80 mb-6">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Portfolio Value History</CardTitle>
              </div>
              <span className={`text-xs font-mono font-medium ${pnlClass(totalPnl)}`}>
                {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)} total P&L
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {chartData.length <= 1 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh prices to start recording your equity curve
              </div>
            ) : (
              <ChartContainer config={equityChartConfig} className="h-[180px] w-full">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.3)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[chartMin, chartMax]}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [
                          <span key="val" className="font-mono font-bold">{formatCurrency(Number(value))}</span>,
                          "Value",
                        ]}
                        labelFormatter={(label) => label}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="totalValue"
                    stroke="oklch(0.65 0.18 250)"
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="positions">
          <TabsList className="mb-4">
            <TabsTrigger value="positions">Positions ({sleeve.positions.length})</TabsTrigger>
            {isOwner && <TabsTrigger value="trades">Trade History</TabsTrigger>}
          </TabsList>

          {/* POSITIONS */}
          <TabsContent value="positions">
            {sleeve.positions.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
                <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No positions yet.{isOwner ? " Add your first trade." : ""}</p>
                {isOwner && (
                  <Button onClick={() => { setPrefillPosition(null); setTradeOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Trade
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {sleeve.positions.map((pos) => (
                  <PositionRow
                    key={pos.id}
                    position={pos}
                    isOwner={isOwner}
                    onClick={() => handlePositionClick(pos)}
                  />
                ))}
              </div>
            )}
            {isOwner && sleeve.positions.length > 0 && (
              <div className="mt-3 text-center">
                <p className="text-xs text-muted-foreground">Click any position to trade it</p>
              </div>
            )}
          </TabsContent>

          {/* TRADE HISTORY — only visible to owner */}
          {isOwner && (
            <TabsContent value="trades">
              {!trades || trades.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>No trades yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {trades.map((trade) => (
                    <TradeRow key={trade.id} trade={trade} />
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function PositionRow({ position, isOwner, onClick }: { position: any; isOwner: boolean; onClick: () => void }) {
  const assetBadgeClass = ASSET_BADGE[position.assetType as AssetType] || "";
  const isShort = position.isShort;
  const priceSource = position.priceSource as "regular" | "pre" | "post" | undefined;
  const isExtended = priceSource === "pre" || priceSource === "post";

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
        isOwner ? "cursor-pointer" : ""
      } ${
        isShort
          ? "border-orange-400/20 bg-orange-400/5 hover:bg-orange-400/10"
          : "border-border/50 bg-card/50 hover:bg-card/80"
      }`}
      onClick={isOwner ? onClick : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm font-mono">{position.ticker}</span>
          <Badge variant="outline" className={`text-xs ${assetBadgeClass}`}>{position.assetType}</Badge>
          {isShort && (
            <Badge variant="outline" className="text-xs text-orange-400 bg-orange-400/10 border-orange-400/20 gap-1">
              <TrendingDown className="w-2.5 h-2.5" />
              SHORT
            </Badge>
          )}
          {isExtended && (
            <Badge
              variant="outline"
              className={`text-xs gap-1 ${
                priceSource === "pre"
                  ? "text-sky-400 bg-sky-400/10 border-sky-400/20"
                  : "text-violet-400 bg-violet-400/10 border-violet-400/20"
              }`}
              title={priceSource === "pre" ? "Pre-market price" : "After-hours price"}
            >
              {priceSource === "pre" ? "PRE" : "AH"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatQuantity(position.quantity)} shares · {isShort ? "short @ " : "avg "}{formatCurrency(position.avgCostBasis)}
        </p>
      </div>
      <div className="text-right">
        {/* Short currentValue is stored as negative (liability) — display absolute value */}
        <p className="font-bold font-mono text-sm">{formatCurrency(Math.abs(position.currentValue))}</p>
        <p className={`text-xs font-mono ${
          isExtended ? (priceSource === "pre" ? "text-sky-400" : "text-violet-400") : "text-muted-foreground"
        }`}>@ {formatCurrency(position.currentPrice)}{isExtended ? " *" : ""}</p>
      </div>
      <div className="text-right hidden md:block">
        <p className={`font-mono text-sm font-medium ${pnlClass(position.unrealizedPnl)}`}>
          {formatCurrency(position.unrealizedPnl)}
        </p>
        <p className={`text-xs font-mono ${pnlClass(position.unrealizedPnlPct)}`}>
          {formatPct(position.unrealizedPnlPct)}
        </p>
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: any }) {
  const sideColors: Record<string, string> = {
    buy: "text-[oklch(0.65_0.18_145)]",
    sell: "text-[oklch(0.60_0.22_25)]",
    short: "text-orange-400",
    cover: "text-sky-400",
  };
  const sideIcons: Record<string, React.ReactNode> = {
    buy: <ChevronUp className="w-4 h-4" />,
    sell: <ChevronDown className="w-4 h-4" />,
    short: <TrendingDown className="w-4 h-4" />,
    cover: <TrendingUp className="w-4 h-4" />,
  };

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border/30 bg-card/30 text-sm">
      <div className={`flex items-center gap-1 font-medium shrink-0 ${sideColors[trade.side] || "text-muted-foreground"}`}>
        {sideIcons[trade.side]}
        {trade.side.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-mono font-bold">{trade.ticker}</span>
        <span className="text-muted-foreground ml-2">{formatQuantity(trade.quantity)} @ {formatCurrency(trade.price)}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono text-xs text-muted-foreground">
          {new Date(trade.executedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>
    </div>
  );
}

// ─── Ticker Search Autocomplete ───────────────────────────────────────────────

type SearchResult = { ticker: string; name: string; assetType: AssetType };

function TickerSearch({
  onSelect,
  defaultValue,
}: {
  onSelect: (result: SearchResult & { price: number }) => void;
  defaultValue?: string;
}) {
  const [query, setQuery] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: results, isFetching } = trpc.pricing.search.useQuery(
    { query },
    { enabled: query.length >= 1 && !defaultValue, staleTime: 30_000 }
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
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
      toast.success(`${item.ticker} — ${formatCurrency(quote.price)}`);
    } catch {
      toast.error(`Could not fetch live price for ${item.ticker}. Try again.`);
    } finally {
      setResolving(false);
    }
  }, [utils, onSelect]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search ticker or company name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => query.length >= 1 && setOpen(true)}
          className="font-mono pl-9 pr-8"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          readOnly={!!defaultValue}
        />
        {(isFetching || resolving) && (
          <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && !defaultValue && results && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-lg border border-border/60 bg-card shadow-xl overflow-hidden"
        >
          {results.map((item) => (
            <button
              key={item.ticker}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item as SearchResult);
              }}
            >
              <span className="font-mono font-bold text-sm w-24 shrink-0">{item.ticker}</span>
              <span className="text-sm text-muted-foreground truncate flex-1">{item.name}</span>
              <Badge
                variant="outline"
                className={`text-xs shrink-0 ${ASSET_BADGE[item.assetType as AssetType] || ""}`}
              >
                {item.assetType}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {open && !defaultValue && query.length >= 1 && (!results || results.length === 0) && !isFetching && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-lg border border-border/60 bg-card shadow-xl p-3 text-sm text-muted-foreground"
        >
          No results for "{query}" — try an exact ticker symbol (e.g. AAPL, BTC-USD)
        </div>
      )}
    </div>
  );
}

// ─── Trade Form ───────────────────────────────────────────────────────────────

function TradeForm({
  groupId,
  cashBalance,
  prefill,
  onSuccess,
}: {
  groupId: number;
  cashBalance: number;
  prefill: null | { ticker: string; assetType: AssetType; price: number; isShort: boolean };
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    ticker: prefill?.ticker || "",
    name: "",
    side: (prefill?.isShort ? "short" : "buy") as TradeSide,
    quantity: "",
    price: prefill?.price ? prefill.price.toFixed(2) : "",
    assetType: (prefill?.assetType || "stock") as AssetType,
    isShort: prefill?.isShort || false,
  });
  const utils = trpc.useUtils();

  const handleShortToggle = (checked: boolean) => {
    setForm((f) => ({
      ...f,
      isShort: checked,
      side: checked ? "short" : "buy",
    }));
  };

  const tradeMutation = trpc.portfolio.addTrade.useMutation({
    onSuccess: () => {
      utils.portfolio.getSleeveById.invalidate();
      utils.portfolio.getTrades.invalidate();
      utils.portfolio.getSnapshots.invalidate();
      toast.success(`${form.side.toUpperCase()} ${form.ticker} executed`);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTickerSelect = useCallback(
    (result: SearchResult & { price: number }) => {
      setForm((f) => ({
        ...f,
        ticker: result.ticker,
        name: result.name,
        assetType: result.assetType,
        price: result.price.toFixed(2),
      }));
    },
    []
  );

  const isShortMode = form.isShort;
  const totalValue = parseFloat(form.quantity || "0") * parseFloat(form.price || "0");

  const sideOptions: { value: TradeSide; label: string }[] = isShortMode
    ? [
        { value: "short", label: "Short (Open)" },
        { value: "cover", label: "Cover (Close)" },
      ]
    : [
        { value: "buy", label: "Buy (Long)" },
        { value: "sell", label: "Sell" },
      ];

  const canSubmit = form.ticker && form.quantity && form.price && parseFloat(form.price) > 0 && !tradeMutation.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        tradeMutation.mutate({
          groupId,
          ticker: form.ticker.toUpperCase(),
          side: form.side,
          quantity: parseFloat(form.quantity),
          price: parseFloat(form.price),
          assetType: form.assetType,
        });
      }}
      className="space-y-4"
    >
      {/* Ticker Search — locked if pre-filled from position click */}
      <div className="space-y-2">
        <Label>Ticker</Label>
        {prefill ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/50 bg-muted/30">
            <span className="font-mono font-bold text-sm">{prefill.ticker}</span>
            <Badge variant="outline" className={`text-xs ${ASSET_BADGE[prefill.assetType]}`}>{prefill.assetType}</Badge>
            <span className="text-xs text-muted-foreground ml-auto">Live price: {formatCurrency(prefill.price)}</span>
          </div>
        ) : (
          <>
            <TickerSearch onSelect={handleTickerSelect} />
            {form.ticker && (
              <div className="flex items-center gap-2 px-1 pt-0.5">
                <span className="font-mono font-bold text-sm">{form.ticker}</span>
                {form.name && <span className="text-xs text-muted-foreground truncate flex-1">{form.name}</span>}
                <Badge variant="outline" className={`text-xs shrink-0 ${ASSET_BADGE[form.assetType]}`}>
                  {form.assetType}
                </Badge>
              </div>
            )}
          </>
        )}
      </div>

      {/* Short toggle — hidden if pre-filled (side is already set) */}
      {!prefill && (
        <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
          <div className="flex items-center gap-2">
            <TrendingDown className={`w-4 h-4 ${isShortMode ? "text-orange-400" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium">Short Selling</p>
              <p className="text-xs text-muted-foreground">Profit when price falls</p>
            </div>
          </div>
          <Switch
            checked={isShortMode}
            onCheckedChange={handleShortToggle}
            className="data-[state=checked]:bg-orange-500"
          />
        </div>
      )}

      {/* Side */}
      <div className="space-y-2">
        <Label>Action</Label>
        <Select
          value={form.side}
          onValueChange={(v) => setForm((f) => ({ ...f, side: v as TradeSide }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sideOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quantity + Price (price is read-only — always from live quote) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="100"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            Price
            {form.price && <span className="text-xs text-muted-foreground font-normal">(live quote)</span>}
          </Label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="Select a ticker first"
            value={form.price}
            readOnly
            className="font-mono bg-muted/30 cursor-not-allowed"
          />
        </div>
      </div>

      {/* Summary */}
      {totalValue > 0 && (
        <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trade Value</span>
            <span className="font-mono font-medium">{formatCurrency(totalValue)}</span>
          </div>
          {(form.side === "buy" || form.side === "cover") && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash After</span>
              <span className={`font-mono font-medium ${cashBalance - totalValue < 0 ? "text-[oklch(0.60_0.22_25)]" : ""}`}>
                {formatCurrency(cashBalance - totalValue)}
              </span>
            </div>
          )}
          {form.side === "short" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash After (proceeds)</span>
              <span className="font-mono font-medium text-orange-400">
                {formatCurrency(cashBalance + totalValue)}
              </span>
            </div>
          )}
          {isShortMode && (
            <p className="text-xs text-orange-400/80 mt-1">
              Short positions profit when the price falls below your entry.
            </p>
          )}
        </div>
      )}

      {!form.price && form.ticker && (
        <p className="text-xs text-amber-400/80 text-center">
          Waiting for live price — select a ticker from the search dropdown.
        </p>
      )}

      <Button
        type="submit"
        className={`w-full ${isShortMode ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
        disabled={!canSubmit}
      >
        {tradeMutation.isPending
          ? "Executing..."
          : `${form.side.charAt(0).toUpperCase() + form.side.slice(1)} ${form.ticker || "..."}`}
      </Button>
    </form>
  );
}
