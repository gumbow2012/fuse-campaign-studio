import SiteShell from "@/components/mvp/SiteShell";

export default function CinemaStudio() {
  return (
    <SiteShell>
      <section className="container py-16">
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">FUSE Cinema</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Cinema Studio foundation is in place. Director controls arrive in the next release.
        </p>
      </section>
    </SiteShell>
  );
}
