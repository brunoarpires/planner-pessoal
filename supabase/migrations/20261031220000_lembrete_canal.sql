-- Canal do lembrete por atividade: celular (push), email, ambos, nenhum. Pessoal de cada cópia.
alter table public.atividades add column if not exists lembrete_canal text not null default 'ambos'
  check (lembrete_canal in ('celular','email','ambos','nenhum'));

-- Mudar o canal reenvia o evento ao Google (lembretes do Google Agenda: email/popup).
create or replace function public.marcar_sync_google() returns trigger language plpgsql as $$
begin
  if (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.feito, coalesce(new.status_pessoal, ''), new.duracao_min, new.lembrete_canal)
     is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.feito, coalesce(old.status_pessoal, ''), old.duracao_min, old.lembrete_canal) then
    new.google_sync_pendente := true;
  end if;
  return new;
end $$;
