import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, TrendingUp } from "lucide-react";
import { toast } from "sonner";

/**
 * Full-screen blocking page shown to users whose email is a placeholder
 * (ends with @portfoligo.local). They cannot proceed until they save a real email.
 */
export default function AddEmail() {
  const [, setLocation] = useLocation();
  const { refresh } = useAuth();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const updateEmail = trpc.auth.updateEmail.useMutation({
    onSuccess: async () => {
      toast.success("Email saved — welcome!");
      await utils.auth.me.invalidate();
      refresh?.();
      setLocation("/");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    updateEmail.mutate({ email: email.trim() });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">One more step</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Add your email to continue using PortfoliGo
          </p>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Add your email address
            </CardTitle>
            <CardDescription>
              We now require an email for every account. It's used for account recovery and is never shared.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className={`pl-9 ${error ? "border-destructive" : ""}`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!email.trim() || updateEmail.isPending}
              >
                {updateEmail.isPending ? "Saving..." : "Save & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
