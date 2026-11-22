-- Só dias PASSADOS (antes de hoje) com pendências bloqueiam o planejamento.
create or replace function public.validar_atividade() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date; v_pend date;
begin
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = new.user_id;
  v_hoje := coalesce(v_hoje, current_date);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.familia_id := (select familia_id from public.membros where user_id = new.user_id);
    if new.data < v_hoje then raise exception 'Não é possível criar atividades em dias passados.'; end if;
    if not (current_setting('planner.compartilhar', true) = '1' and new.user_id is distinct from auth.uid()) then
      select min(data) into v_pend from public.atividades where user_id = new.user_id and data < v_hoje and status_pessoal is null;
      if v_pend is not null then
        raise exception 'Feche 100%% do checklist de % antes de planejar novos dias.', to_char(v_pend, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if new.user_id <> old.user_id or new.data <> old.data and new.data < v_hoje then raise exception 'Alteração não permitida.'; end if;
  end if;
  return new;
end $$;

