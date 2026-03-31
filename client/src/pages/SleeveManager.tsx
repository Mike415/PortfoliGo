import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatPct, formatQuantity, pnlClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, RefreshCw, TrendingUp, Wallet, Clock, ChevronUp, ChevronDown, Search } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type AssetType = "stock" | "etf" | "crypto";

const ASSET_BADGE: Record<AssetType, string> = {
  stock: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  etf: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  crypto: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export default function SleeveManager() {
  const { id: groupId, sleeveId } = useParams<{ id: string; sleeveId: string }>();
  const gId = parseInt(groupId || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [tradeOpen, setTradeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: sleeve, refetch } = trpc.portfolio.getMySleeve.useQuery(
    { groupId: gId },
    { enabled: !!gId }
  );

  const { data: trades } = trpc.portfolio.getTrades.useQuery(
    { groupId: gId, limit: 50 },
    { enabled: !!gId }
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

  if (!sleeve) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <TrendingUp className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  const totalPnl = sleeve.realizedPnl + sleeve.unrealizedPnl;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/group/${gId}`)} className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="font-semibold text-sm leading-none">
                {sleeve.name || `${user?.displayName || user?.username}'s Sleeve`}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sleeve.positions.length} position{sleeve.positions.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2 h-8">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Dialog open={tradeOpen} onOpenChange={setTradeOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 h-8">
                  <Plus className="w-3.5 h-3.5" />
                  Trade
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border/50">
                <DialogHeader>
                  <DialogTitle>Add Trade</DialogTitle>
                </DialogHeader>
                <TradeForm groupId={gId} cashBalance={sleeve.cashBalance} onSuccess={() => { setTradeOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Sleeve metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Value</p>
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
                {((sleeve.cashBalance / sleeve.allocatedCapital) * 100).toFixed(1)}% of sleeve
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

        <Tabs defaultValue="positions">
          <TabsList className="mb-4">
            <TabsTrigger value="positions">Positions ({sleeve.positions.length})</TabsTrigger>
            <TabsTrigger value="trades">Trade History</TabsTrigger>
          </TabsList>

          {/* POSITIONS */}
          <TabsContent value="positions">
            {sleeve.positions.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
                <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No positions yet. Add your first trade.</p>
                <Button onClick={() => setTradeOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Trade
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {sleeve.positions.map((pos) => (
                  <PositionRow key={pos.id} position={pos} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* TRADE HISTORY */}
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
        </Tabs>
      </main>
    </div>
  );
}

function PositionRow({ position }: { position: any }) {
  const assetBadgeClass = ASSET_BADGE[position.assetType as AssetType] || "";

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm font-mono">{position.ticker}</span>
          <Badge variant="outline" className={`text-xs ${assetBadgeClass}`}>{position.assetType}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatQuantity(position.quantity)} shares · avg {formatCurrency(position.avgCostBasis)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-bold font-mono text-sm">{formatCurrency(position.currentValue)}</p>
        <p className="text-xs text-muted-foreground font-mono">@ {formatCurrency(position.currentPrice)}</p>
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
  const isBuy = trade.side === "buy";
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border/30 bg-card/30 text-sm">
      <div className={`flex items-center gap-1 font-medium shrink-0 ${isBuy ? "text-[oklch(0.65_0.18_145)]" : "text-[oklch(0.60_0.22_25)]"}`}>
        {isBuy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {isBuy ? "BUY" : "SELL"}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-mono font-bold">{trade.ticker}</span>
        <span className="text-muted-foreground ml-2">{formatQuantity(trade.quantity)} @ {formatCurrency(trade.price)}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono font-medium">{formatCurrency(trade.totalValue)}</p>
        <p className="text-xs text-muted-foreground">
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
}: {
  onSelect: (result: SearchResult & { price?: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: results, isFetching } = trpc.pricing.search.useQuery(
    { query },
    { enabled: query.length >= 1, staleTime: 30_000 }
  );

  // Close dropdown on outside click
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
      onSelect(item);
      toast.info(`${item.ticker} selected — enter price manually`);
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

      {open && query.length >= 1 && (!results || results.length === 0) && !isFetching && (
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

function TradeForm({ groupId, cashBalance, onSuccess }: { groupId: number; cashBalance: number; onSuccess: () => void }) {
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    side: "buy" as "buy" | "sell",
    quantity: "",
    price: "",
    assetType: "stock" as AssetType,
  });
  const utils = trpc.useUtils();

  const tradeMutation = trpc.portfolio.addTrade.useMutation({
    onSuccess: () => {
      utils.portfolio.getMySleeve.invalidate();
      utils.portfolio.getTrades.invalidate();
      toast.success(`${form.side.toUpperCase()} ${form.ticker} executed`);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTickerSelect = useCallback(
    (result: SearchResult & { price?: number }) => {
      setForm((f) => ({
        ...f,
        ticker: result.ticker,
        name: result.name,
        assetType: result.assetType,
        price: result.price !== undefined ? result.price.toFixed(2) : f.price,
      }));
    },
    []
  );

  const totalValue = parseFloat(form.quantity || "0") * parseFloat(form.price || "0");

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
      {/* Ticker Search */}
      <div className="space-y-2">
        <Label>Search Ticker</Label>
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
      </div>

      {/* Side */}
      <div className="space-y-2">
        <Label>Side</Label>
        <Select value={form.side} onValueChange={(v) => setForm((f) => ({ ...f, side: v as "buy" | "sell" }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quantity + Price */}
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
          <Label>Price ($)</Label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="150.00"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            className="font-mono"
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
          {form.side === "buy" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash After</span>
              <span className={`font-mono font-medium ${cashBalance - totalValue < 0 ? "text-[oklch(0.60_0.22_25)]" : ""}`}>
                {formatCurrency(cashBalance - totalValue)}
              </span>
            </div>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={tradeMutation.isPending || !form.ticker || !form.quantity || !form.price}
      >
        {tradeMutation.isPending ? "Executing..." : `${form.side === "buy" ? "Buy" : "Sell"} ${form.ticker || "..."}`}
      </Button>
    </form>
  );
}
