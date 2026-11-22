-- Mover atividade de data: nunca para antes de hoje; ocorrência de recorrência movida vira exceção.
alter table public.atividades add column if not exists data_movida boolean not null default false;
create or replace function public.mover_data() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.data is distinct from old.data then
    if new.data < v_hoje and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'A nova data não pode ser anterior a hoje (%).', to_char(v_hoje, 'DD/MM/YYYY');
    end if;
    if new.recorrencia_id is not null then new.data_movida := true; end if;
  end if;
  return new;
end $$;
drop trigger if exists a00_mover_data on public.atividades;
create trigger a00_mover_data before update of data on public.atividades for each row execute function public.mover_data();
