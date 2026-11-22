-- Séries robustas: cópia compartilhada já nasce ligada à série; "esta e as próximas" no servidor; sem duplicadas.
create or replace function public.criar_compartilhada_rec(p_data date, p_hora time, p_titulo text, p_observacao text, p_duracao int,
  p_categoria uuid, p_subcategoria uuid, p_participantes uuid[], p_toda_familia boolean, p_rec uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_g uuid;
begin
  if not exists (select 1 from public.recorrencias where id = p_rec and criador = auth.uid() and ativo) then
    raise exception 'Série encerrada ou sem permissão.'; end if;
  v_g := public.criar_compartilhada(p_data, p_hora, p_titulo, p_observacao, p_duracao, p_categoria, p_subcategoria, p_participantes, p_toda_familia);
  update public.atividades set recorrencia_id = p_rec where grupo_id = v_g; -- mesma transação: nunca fica cópia solta
  return v_g;
end $$;
revoke execute on function public.criar_compartilhada_rec from public, anon;
grant execute on function public.criar_compartilhada_rec to authenticated;

create or replace function public.excluir_proximas(p_ativ uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare a public.atividades; r public.recorrencias; n int; v_parts uuid[];
begin
  select * into a from public.atividades where id = p_ativ and user_id = auth.uid();
  if a.id is null or a.recorrencia_id is null then raise exception 'Atividade não encontrada.'; end if;
  select * into r from public.recorrencias where id = a.recorrencia_id for update;
  if r.criador = auth.uid() then
    update public.recorrencias set ativo = false where id = r.id; -- encerra ANTES de apagar (para a geração)
    delete from public.atividades where recorrencia_id = r.id and data >= a.data and status_pessoal is null;
  else
    delete from public.atividades where recorrencia_id = r.id and user_id = auth.uid() and data >= a.data and status_pessoal is null;
    -- sai da série: extensões futuras não o recriam
    if coalesce((r.modelo->>'toda_familia')::boolean, false) then
      select array_agg(user_id) into v_parts from public.membros where familia_id = r.familia_id and user_id <> auth.uid();
    else
      select coalesce(array_agg(x), '{}') into v_parts from jsonb_array_elements_text(coalesce(r.modelo->'participantes', '[]')) x where x::uuid <> auth.uid();
    end if;
    update public.recorrencias set modelo = modelo || jsonb_build_object('toda_familia', false, 'participantes', to_jsonb(coalesce(v_parts, '{}'))) where id = r.id;
  end if;
  get diagnostics n = row_count;
  delete from public.atividade_grupos g where g.familia_id = r.familia_id and not exists (select 1 from public.atividades x where x.grupo_id = g.id);
  return n;
end $$;
revoke execute on function public.excluir_proximas from public, anon;
grant execute on function public.excluir_proximas to authenticated;

create unique index if not exists atividades_serie_unica on public.atividades (user_id, recorrencia_id, data, hora) where recorrencia_id is not null;
