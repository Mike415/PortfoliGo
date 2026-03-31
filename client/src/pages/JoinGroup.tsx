import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function JoinGroup() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [inviteCode, setInviteCode] = useState("");

  const joinMutation = trpc.group.join.useMutation({
    onSuccess: (data) => {
      toast.success(`Joined "${data.group.name}"!`);
      setLocation(`/group/${data.group.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="fixed inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.22 0.01 240 / 0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation(isAuthenticated ? "/" : "/login")} className="gap-2 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Join a Competition</h1>
          <p className="text-muted-foreground mt-2 text-sm">Enter the invite code shared by your group admin</p>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            {!isAuthenticated && (
              <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-center">
                <p className="text-muted-foreground">
                  You'll need to{" "}
                  <button className="text-primary hover:underline" onClick={() => setLocation("/login")}>
                    sign in
                  </button>{" "}
                  before joining
                </p>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isAuthenticated) {
                  setLocation("/login");
                  return;
                }
                joinMutation.mutate({ inviteCode });
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
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={joinMutation.isPending || !inviteCode}
              >
                {joinMutation.isPending ? "Joining..." : "Join Competition"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
