# AGENTS

- Recipe-driven templates (e.g. Hat Brand Film) keep pure planning in _shared/<recipe>-*.ts with node tests under tests/<recipe>/; the executor only calls them when a template opts in, so legacy templates stay untouched.
- Production graph backend is the one in supabase/config.toml (deployed by GitHub Actions); the workspace SQL backend lacks graph tables, so never seed or verify graph templates through workspace SQL — use the admin seed function on production. Why: the two backends diverged.
