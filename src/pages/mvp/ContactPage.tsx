import { FormEvent, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { submitContactMessage } from "@/services/contact";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      await submitContactMessage({ name, email, company, message });
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
      toast({ title: "Message received", description: "It landed in the Fuse ops queue." });
    } catch (error) {
      toast({
        title: "Contact failed",
        description: error instanceof Error ? error.message : "Could not send your message.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SiteShell>
      <section className="container grid gap-8 py-16 md:py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Contact</p>
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white md:text-6xl">
              Send a note straight into the ops queue.
            </h1>
          </div>
          <p className="text-base leading-7 text-slate-300">
            This form writes directly into Supabase so the inbound queue lives with the rest of the product ops data. Use it for support, template requests, or partnership conversations.
          </p>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">What to include</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>What you are trying to run or launch</li>
              <li>Where the current friction is happening</li>
              <li>What kind of response you need from ops</li>
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Name
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
              />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="contact-company" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Company or brand
            </Label>
            <Input
              id="contact-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
            />
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="contact-message" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Message
            </Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              rows={8}
              className="rounded-3xl border-white/10 bg-white/[0.03] text-white"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">Messages are stored in Supabase for direct review.</p>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-full bg-cyan-300 px-6 text-slate-950 hover:bg-cyan-200"
            >
              {loading ? "Sending..." : "Send message"}
            </Button>
          </div>
        </form>
      </section>
    </SiteShell>
  );
}
