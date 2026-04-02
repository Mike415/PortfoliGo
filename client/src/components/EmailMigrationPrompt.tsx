import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DISMISSED_KEY = "portfoligo_email_prompt_dismissed";

export function EmailMigrationPrompt() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // Only show if authenticated, email is missing, and user hasn't dismissed
  const isDismissed = localStorage.getItem(DISMISSED_KEY) === "true";
  const shouldShow = isAuthenticated && user && !user.email && !isDismissed;

  const [open, setOpen] = useState(!!shouldShow);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const updateEmail = trpc.auth.updateEmail.useMutation({
    onSuccess: () => {
      toast.success("Email saved — thanks!");
      utils.auth.me.invalidate();
      setOpen(false);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    updateEmail.mutate({ email: email.trim() });
  }

  if (!shouldShow) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your email</DialogTitle>
          <DialogDescription>
            Add an email address to your account for future account recovery. This is optional — you can always skip it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="migration-email">Email address</Label>
            <Input
              id="migration-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              autoFocus
              autoComplete="email"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={!email.trim() || updateEmail.isPending}
            >
              {updateEmail.isPending ? "Saving..." : "Save Email"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDismiss}
              className="flex-1"
            >
              Skip for now
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
