-- Duração mínima de 1 minuto
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid = 'public.atividades'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%duracao_min%' loop
    execute format('alter table public.atividades drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.atividades add constraint atividades_duracao_min_check check (duracao_min between 1 and 1440);
