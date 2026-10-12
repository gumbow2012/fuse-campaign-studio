import { Link } from "react-router-dom";
import { Shirt, Sparkles } from "lucide-react";
import PageMeta from "@/components/mvp/PageMeta";
import MaddenAIShell, { MADDENAI } from "@/components/maddenai/MaddenAIShell";
import { useAuth } from "@/contexts/AuthContext";

const TOOLS = [
  {
    to: "/maddenai/create",
    icon: Sparkles,
    name: "Create",
    body: "Images and videos from a prompt or your own photos. Pick the model, see the credit cost before you generate.",
  },
  {
    to: "/maddenai/outfit-swap",
    icon: Shirt,
    name: "Outfit Swap",
    body: "Upload a clip and your clothing. Restyle the frames you choose, then rebuild the same video in the new outfit.",
  },
];

export default function MaddenAIHome() {
  const { user } = useAuth();
  return (
    <MaddenAIShell>
      <PageMeta title="MADDENAI" description="Generate images and video, and swap outfits in any clip." path="/maddenai" />
      <section className="mx-auto max-w-[1100px] px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: MADDENAI.accent }}>● Rec</p>
        <h1 className="mt-4 text-balance text-5xl leading-[0.95] sm:text-7xl" style={{ fontFamily: "Archivo, system-ui, sans-serif", fontWeight: 800 }}>
          Shoot without a set.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/65">
          MADDENAI makes images and video from a prompt or a photo, and puts your clothes on the people in any clip.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={user ? "/maddenai/create" : "/auth"} className="rounded-full px-6 py-3 font-semibold text-white" style={{ background: MADDENAI.accent }}>
            {user ? "Start creating" : "Sign in to start"}
          </Link>
          <Link to="/maddenai/outfit-swap" className="rounded-full border border-white/20 px-6 py-3 font-semibold text-white/85 hover:border-white/50">
            Try Outfit Swap
          </Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1100px] gap-4 px-4 pb-24 sm:grid-cols-2 sm:px-6">
        {TOOLS.map(({ to, icon: Icon, name, body }) => (
          <Link key={to} to={to} className="group rounded-2xl border border-white/10 p-6 transition-colors hover:border-white/30" style={{ background: "#141417" }}>
            <Icon size={22} style={{ color: MADDENAI.accent }} />
            <h2 className="mt-4 text-xl font-semibold">{name}</h2>
            <p className="mt-2 text-sm text-white/60">{body}</p>
            <span className="mt-5 inline-block text-sm font-semibold text-white/80 group-hover:text-white">Open {name} →</span>
          </Link>
        ))}
        <p className="text-sm text-white/45 sm:col-span-2">Uses the credits on your account. Every generation shows its cost first, and failed generations are refunded.</p>
      </section>
    </MaddenAIShell>
  );
}
