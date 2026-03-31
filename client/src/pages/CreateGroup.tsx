import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, TrendingUp, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

export default function CreateGroup() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    name: "",
    description: "",
    totalCapital: 1000000,
    maxParticipants: 5,
    reallocationInterval: "6months" as "3months" | "6months" | "12months",
    reallocationPercent: 5,
  });
  const [created, setCreated] = useState<{ id: number; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = trpc.group.create.useMutation({
    onSuccess: (data) => {
      setCreated({ id: data!.id, inviteCode: data!.inviteCode });
      toast.success("Competition created!");
    },
    onError: (err) => toast.error(err.message),
  });

  const sleeveSize = form.totalCapital / form.maxParticipants;

  const copyInviteCode = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Invite code copied!");
  };

  if (created) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="text-center pb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Competition Created!</CardTitle>
              <CardDescription>Share the invite code with your participants</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Invite Code</p>
                <p className="text-3xl font-bold font-mono tracking-widest text-primary">{created.inviteCode}</p>
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={copyInviteCode}>
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Invite Code"}
              </Button>
              <Button className="w-full" onClick={() => setLocation(`/group/${created.id}`)}>
                Open Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center h-14 gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-semibold text-sm">Create Competition</h1>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
          className="space-y-6"
        >
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Competition Name</Label>
                <Input
                  placeholder="e.g. Q1 2025 Pod Shop"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="Any rules or notes for participants..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Capital Structure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Total Portfolio Capital</Label>
                  <span className="font-mono text-sm text-primary">{formatCurrency(form.totalCapital)}</span>
                </div>
                <Slider
                  min={100000}
                  max={10000000}
                  step={100000}
                  value={[form.totalCapital]}
                  onValueChange={([v]) => setForm((f) => ({ ...f, totalCapital: v }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$100K</span><span>$10M</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Number of Managers</Label>
                  <span className="font-mono text-sm text-primary">{form.maxParticipants}</span>
                </div>
                <Slider
                  min={2}
                  max={20}
                  step={1}
                  value={[form.maxParticipants]}
                  onValueChange={([v]) => setForm((f) => ({ ...f, maxParticipants: v }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>2</span><span>20</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sleeve size per manager</span>
                  <span className="font-mono font-bold text-primary">{formatCurrency(sleeveSize)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Reallocation Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Reallocation Interval</Label>
                <Select
                  value={form.reallocationInterval}
                  onValueChange={(v) => setForm((f) => ({ ...f, reallocationInterval: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3months">Every 3 Months</SelectItem>
                    <SelectItem value="6months">Every 6 Months</SelectItem>
                    <SelectItem value="12months">Annually (12 Months)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Risk Budget Transfer %</Label>
                  <span className="font-mono text-sm text-primary">{form.reallocationPercent}%</span>
                </div>
                <Slider
                  min={1}
                  max={25}
                  step={1}
                  value={[form.reallocationPercent]}
                  onValueChange={([v]) => setForm((f) => ({ ...f, reallocationPercent: v }))}
                />
                <p className="text-xs text-muted-foreground">
                  Bottom performer loses {form.reallocationPercent}% of their sleeve ({formatCurrency(sleeveSize * form.reallocationPercent / 100)}) to the top performer
                </p>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" size="lg" disabled={createMutation.isPending || !form.name}>
            {createMutation.isPending ? "Creating..." : "Create Competition"}
          </Button>
        </form>
      </main>
    </div>
  );
}
