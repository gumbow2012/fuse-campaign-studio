/**
 * CONTACT MESSAGES — admin-only inbox for customer contact-form submissions.
 * Reads/updates public.contact_messages via the authed admin client (RLS enforced).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mail, Send } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import EmailComposerDialog, { type EmailComposerTarget } from "@/components/admin/EmailComposerDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


export type ContactMessageRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

const NY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatEastern(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${NY_FORMATTER.format(date)} ET`;
}

function mailtoLink(row: ContactMessageRow) {
  const body = `Hi ${row.name},\n\n`;
  return `mailto:${row.email}?subject=${encodeURIComponent("Re: FUSE")}&body=${encodeURIComponent(body)}`;
}

export default function AdminMessages() {
  const queryClient = useQueryClient();
  const [newOnly, setNewOnly] = useState(false);

  const messagesQuery = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, company, message, status, created_at, reviewed_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as ContactMessageRow[];
    },
  });

  const markReviewed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked reviewed");
      void queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-contact-messages-unread"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update that message");
    },
  });

  const rows = messagesQuery.data ?? [];
  const newCount = useMemo(() => rows.filter((row) => row.status === "new").length, [rows]);
  const visibleRows = newOnly ? rows.filter((row) => row.status === "new") : rows;

  return (
    <SiteShell>
      <PageMeta
        title="Messages · FUSE Admin"
        description="Customer contact-form submissions."
        path="/admin/messages"
        noindex
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black uppercase tracking-tight text-foreground">Messages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact messages — {newCount} new of {rows.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={newOnly ? "outline" : "default"} onClick={() => setNewOnly(false)}>
              All
            </Button>
            <Button size="sm" variant={newOnly ? "default" : "outline"} onClick={() => setNewOnly(true)}>
              New only
            </Button>
          </div>
        </header>

        {messagesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </div>
        ) : messagesQuery.isError ? (
          <p className="text-sm text-destructive">
            {messagesQuery.error instanceof Error ? messagesQuery.error.message : "Could not load messages."}
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-3">
            {visibleRows.map((row) => {
              const isNew = row.status === "new";
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{row.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {row.email}
                        {row.company ? ` · ${row.company}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatEastern(row.created_at)}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em]",
                        isNew
                          ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40"
                          : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      {isNew ? "New" : "Reviewed"}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{row.message}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a href={mailtoLink(row)}>
                        <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Reply
                      </a>
                    </Button>
                    {isNew ? (
                      <Button
                        size="sm"
                        onClick={() => markReviewed.mutate(row.id)}
                        disabled={markReviewed.isPending && markReviewed.variables === row.id}
                      >
                        {markReviewed.isPending && markReviewed.variables === row.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Mark reviewed
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
