alter table public.execution_steps
  drop constraint if exists execution_steps_node_id_fkey;

alter table public.execution_steps
  add constraint execution_steps_node_id_fkey
  foreign key (node_id)
  references public.nodes(id)
  on delete set null;
