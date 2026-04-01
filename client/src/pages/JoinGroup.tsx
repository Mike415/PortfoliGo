import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Users, TrendingUp, Lock, User, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function formatCurrency(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function intervalLabel(interval: string) {
  if (interval === "1week") return "Every week";
  if (interval === "2weeks") return "Every 2 weeks";
  if (interval === "1month") return "Every month";
  if (interval === "3months") return "Every 3 months";
  if (interval === "6months") return "Every 6 months";
  return "Every year";
}

export default function JoinGroup() {
  const [, setLocation] = useLocation();
  const params = useParams<{ code?: string }>();
  const { isAuthenticated, user } = useAuth();

  const [inviteCode, setInviteCode] = useState(params.code?.toUpperCase() ?? "");
  const [confirmedCode, setConfirmedCode] = useState(params.code?.toUpperCase() ?? "");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [step, setStep] = useState<"enter-code" | "preview">(
    params.code ? "preview" : "enter-code"
  );

  const previewQuery = trpc.group.preview.useQuery(
    { inviteCode: confirmedCode },
    { enabled: !!confirmedCode && step === "preview", retry: false }
  );

  const utils = trpc.useUtils();
  const registerMutation = trpc.auth.register.useMutation();
  const joinMutation = trpc.group.join.useMutation({
    onSuccess: (data) => {
      toast.success(`You are in! Welcome to "${data.group.name}"`);
      utils.group.list.invalidate();
      setLocation(`/group/${data.group.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (params.code) {
      const upper = params.code.toUpperCase();
      setInviteCode(upper);
      setConfirmedCode(upper);
      setStep("preview");
    }
  }, [params.code]);

  async function handleRegisterAndJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!previewQuery.data) return;
    try {
      await registerMutation.mutateAsync({ username, displayName, passcode });
      await joinMutation.mutateAsync({ inviteCode: confirmedCode });
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    }
  }

  const group = previewQuery.data;
  const isBusy = registerMutation.isPending || joinMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="fixed inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              step === "preview" && !params.code
                ? setStep("enter-code")
                : setLocation(isAuthenticated ? "/" : "/login")
            }
            className="gap-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        {step === "enter-code" && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Join a Competition</h1>
              <p className="text-muted-foreground mt-2 text-sm">Enter the invite code shared by your group admin</p>
            </div>
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inviteCode) return;
                    setConfirmedCode(inviteCode.toUpperCase());
                    setStep("preview");
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="invite-code">Invite Code</Label>
                    <Input
                      id="invite-code"
                      placeholder="e.g. ABC12345"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="font-mono text-center text-lg tracking-widest"
                      maxLength={10}
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={!inviteCode}>
                    Look Up Competition
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {step === "preview" && (
          <>
            {previewQuery.isLoading && (
              <div className="text-center py-12 text-muted-foreground">Loading competition details...</div>
            )}
            {previewQuery.isError && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="pt-6 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
                  <p className="font-medium">Invalid invite code</p>
                  <p className="text-sm text-muted-foreground">Double-check the code and try again.</p>
                  <Button variant="outline" onClick={() => setStep("enter-code")}>Try Again</Button>
                </CardContent>
              </Card>
            )}
            {group && (
              <>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
                    <TrendingUp className="w-7 h-7 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold">{group.name}</h1>
                  {group.description && (
                    <p className="text-muted-foreground mt-1 text-sm">{group.description}</p>
                  )}
                </div>
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm mb-4">
                  <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Your Sleeve</p>
                        <p className="font-bold text-primary">{formatCurrency(group.sleeveSize)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Spots</p>
                        <p className="font-bold">{group.currentMembers}/{group.maxParticipants}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Reallocation</p>
                        <p className="font-bold text-xs">{intervalLabel(group.reallocationInterval)}</p>
                      </div>
                    </div>
                    {group.isFull && (
                      <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs text-center">
                        This competition is full
                      </div>
                    )}
                  </CardContent>
                </Card>
                {isAuthenticated ? (
                  <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        Signed in as{" "}
                        <span className="font-medium text-foreground">
                          {user?.displayName || user?.username}
                        </span>
                      </div>
                      <Button
                        className="w-full"
                        disabled={group.isFull || isBusy}
                        onClick={() => joinMutation.mutate({ inviteCode: confirmedCode })}
                      >
                        {isBusy ? "Joining..." : `Join ${group.name}`}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground mb-4">
                        Create an account to join - it only takes a moment.
                      </p>
                      <form onSubmit={handleRegisterAndJoin} className="space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor="jg-username">Username</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="jg-username"
                              placeholder="pick-a-username"
                              className="pl-9"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              autoComplete="username"
                              required
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Letters, numbers, underscores, hyphens only</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="jg-displayname">
                            Display Name <span className="text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id="jg-displayname"
                            placeholder="Your Name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="jg-passcode">Passcode</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="jg-passcode"
                              type={showPasscode ? "text" : "password"}
                              placeholder="Min 4 characters"
                              className="pl-9 pr-10"
                              value={passcode}
                              onChange={(e) => setPasscode(e.target.value)}
                              autoComplete="new-password"
                              required
                              minLength={4}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPasscode((v) => !v)}
                            >
                              {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <Separator />
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={group.isFull || isBusy || !username || !passcode}
                        >
                          {isBusy ? "Setting up your account..." : `Create Account & Join ${group.name}`}
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                          Already have an account?{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setLocation(`/login?next=/join/${confirmedCode}`)}
                          >
                            Sign in
                          </button>
                        </p>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
