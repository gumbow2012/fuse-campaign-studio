/**
 * EMAIL COMPOSER — admin-only composer that sends through the admin-send-email
 * edge function (Resend, verified fuse-us.com sender). Replies route to Kade.
 */

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";

export type EmailComposerTarget = {
  to: string;
  subject?: string;
  body?: string;
};

type Props = {
  open: boolean;
  target: EmailComposerTarget | null;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
};

export default function EmailComposerDialog({ open, target, onOpenChange, onSent }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTo(target.to ?? "");
      setSubject(target.subject ?? "");
      setBody(target.body ?? "");
    }
  }, [open, target]);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("To, subject and message are all required");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-send-email", {
        body: { to: to.trim(), subject: subject.trim(), body },
      });
      if (error) {
        const details =
          error instanceof FunctionsHttpError ? await error.context.text() : error.message;
        throw new Error(details || "Send failed");
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Email sent to ${to.trim()}`);
      onOpenChange(false);
      onSent?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!sending ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email via FUSE</DialogTitle>
          <DialogDescription>
            Sends from the verified FUSE domain. Replies go to kade@maddenmedia.ai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">To</label>
            <Input value={to} onChange={(event) => setTo(event.target.value)} type="email" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Subject
            </label>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Message
            </label>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
