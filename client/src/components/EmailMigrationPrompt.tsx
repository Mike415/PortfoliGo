import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { toast } from "sonner";

/**
 * Persistent bottom banner shown to users who signed up before email was required.
 * It cannot be dismissed — it disappears only when a valid email is saved.
 * Users whose email ends with "@portfoligo.local" are treated as missing an email.
 */
export function EmailMigrationPrompt() {
  const { user, isAuthenticated, refresh } = useAuth();
  const utils = trpc.useUtils();

  const isPlaceholder = user?.email?.endsWith("@portfoligo.local");
  const shouldShow = isAuthenticated && user && (!user.email || isPlaceholder);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const updateEmail = trpc.auth.updateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email saved — thanks!");
      utils.auth.me.invalidate();
      refresh?.();
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

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-md shadow-lg">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Mail className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Add your email</span>
          </div>
          <p className="text-xs text-muted-foreground sm:flex-1">
            Required for account recovery. Your email is never shared.
          </p>
          <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-64">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className={`h-8 text-sm ${error ? "border-destructive" : ""}`}
                autoComplete="email"
              />
              {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-8 shrink-0"
              disabled={!email.trim() || updateEmail.isPending}
            >
              {updateEmail.isPending ? "Saving..." : "Save"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
