# Planner Pessoal

App (PWA, com foco no celular) de **planejamento diário em família**: atividades do dia, checklist, pontuação, recorrências, convites, lembretes e sincronização com o Google Agenda.

React 19 + TypeScript + Vite + Tailwind · Supabase (login, Postgres com RLS, Edge Functions) · Google Agenda · Web Push · e-mail (Resend) · pg_cron.

## Funções

- Cada pessoa tem seu login e configura **início do dia**, **quantas horas tem o dia** e o **horário de fim do dia** (obrigatório).
- Atividade: título, horário, duração, categoria, **observação**, **feito / não feito**, **status pessoal** (😄 Fiz bem · 😐 Fiz parcialmente · 😞 Não fiz) + comentário.
- Uma atividade está "checada" quando recebe o status pessoal. Um dia está 100% quando todas estão checadas.
- **Não dá para criar atividades em dias passados**; pendências de checklist não bloqueiam o planejamento.
- **Checklist:** pode marcar ou corrigir em hoje e em dias anteriores. Pendência após o fim do dia só gera aviso (não bloqueia o app).
- **Pontuação:** 10 pts por atividade feita, 0 se não feita, +5 se "Fiz bem". Resumo mensal e **ranking mensal da família**.
- **Recorrências** (diária, semanal, etc.), com opção de série **sem data de término**, e edição/exclusão de **"só esta"** ou **"esta e as próximas"**. Ocorrências já marcadas como feitas não são apagadas.
- **Atividades compartilhadas** com toda a família ou com pessoas convidadas; participantes podem editar detalhes quando a regra permitir.
- **Convite** por código/link para entrar na família.
- **Lembretes** por Web Push e/ou e-mail (Edge Function `lembretes` + pg_cron).
- **Sincronização com o Google Agenda** (Edge Function `google-sync`).

## Como rodar localmente

Precisa do [Node.js](https://nodejs.org) 20 ou superior e de um projeto [Supabase](https://supabase.com) próprio.

```bash
cp .env.example .env   # preencha com a URL e a chave anon do seu projeto
npm install
npm run dev            # http://localhost:5173
npm test               # testes das regras de pontuação, recorrência e bloqueio
npm run build
```

Sem as variáveis `VITE_SUPABASE_*` o app não conecta ao backend (não há modo 100% offline neste projeto).

## Configuração (passo a passo)

### 1. Supabase

1. Crie um projeto (região São Paulo) em [supabase.com](https://supabase.com).
2. **SQL Editor:** rode, **na ordem**, todos os arquivos de [`supabase/migrations/`](supabase/migrations).
3. **Authentication → URL Configuration:** Site URL = URL do app na Vercel; adicione também em Redirect URLs (e `http://localhost:5173`).
4. **Project Settings → API:** copie a URL e a chave `anon` para `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (veja [`.env.example`](.env.example)). **Nunca** use a `service_role` no front-end.
5. Para quem cria conta por e-mail poder conectar o Google depois: **Authentication → Sign In / Providers → "Allow manual linking"** ligado.

### 2. Google Cloud (login com Google + Agenda)

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto.
2. **APIs e serviços → Biblioteca** → ative **Google Calendar API**.
3. **Tela de consentimento OAuth** → tipo *Externo*; adicione o escopo `.../auth/calendar.events`. Em modo "Teste", só os **usuários de teste** conseguem entrar — e o Google pede para reconectar a cada 7 dias.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**
   - Origens JavaScript: a URL do app na Vercel (e `http://localhost:5173` se for o caso).
   - URI de redirecionamento: `https://SEU-PROJETO.supabase.co/auth/v1/callback`
5. No Supabase: **Authentication → Providers → Google** → ative e cole *Client ID* e *Client Secret*.

### 3. Notificações no celular (Web Push)

1. Gere as chaves: `npx web-push generate-vapid-keys`
2. Pública → `VITE_VAPID_PUBLIC_KEY` (Vercel / `.env`). Pública + privada → secrets da Edge Function (abaixo).
3. Cada pessoa abre o app → **Ajustes → Ativar notificações neste aparelho**.

### 4. E-mail (Resend)

1. Crie conta em [resend.com](https://resend.com), verifique um domínio (ou use `onboarding@resend.dev` só para testes) e gere uma API key.

### 5. Edge Functions + agendamento (pg_cron)

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO
npx supabase secrets set CRON_SECRET=um-segredo-longo VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:voce@email.com RESEND_API_KEY=re_xxxxxxxx \
  EMAIL_FROM="Planner <planner@seudominio.com>" APP_URL=https://seu-app.vercel.app \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
npx supabase functions deploy lembretes --no-verify-jwt
npx supabase functions deploy google-sync --no-verify-jwt
```

Os mesmos valores também podem ir para a tabela `config_privada` (chaves `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `VAPID_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`).

Depois rode [`supabase/cron.sql`](supabase/cron.sql) no SQL Editor (troque `SEU-PROJETO` e `CRON_SECRET`). A cada 5 min a função avisa X min antes de cada atividade e 30 min antes / no horário de fim do dia, se o checklist estiver incompleto.

O `cron.sql` publicado aqui usa só **placeholders**. Não cole tokens reais no Git.

Para o `google-sync` em intervalo diferente, agende outro job no `pg_cron` apontando para `/functions/v1/google-sync` com o mesmo `CRON_SECRET`.

### 6. Vercel

Importe o repositório, framework Vite, e cadastre `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY`.

## Sincronização com o Google Agenda

- No login/conexão com Google o app pede acesso offline; o *refresh token* fica no servidor (`google_tokens`, sem acesso pelo app).
- A Edge Function `google-sync` (pelo pg_cron, ao abrir o app e logo após cada edição) envia atividades novas/alteradas/feitas para a agenda, apaga as excluídas e traz os eventos de hoje até +14 dias.

## Limitações conhecidas

- **iPhone:** Web Push só funciona no iOS 16.4+ e **com o app adicionado à Tela de Início** (Compartilhar → Adicionar à Tela de Início).
- Enquanto o app do Google Cloud estiver em modo **Teste**, o Google invalida o acesso a cada 7 dias (aparece "Reconectar" em Ajustes). Publicar o app ("Em produção") remove isso.
- Horários seguem o fuso configurado (padrão `America/Sao_Paulo`). Pendências de checklist não travam o app.

## Estrutura

```
src/regras.ts                 regras puras (pontos, aviso de pendência, criação, ranking, recorrência)
src/App.tsx                   sessão, abas e aviso não bloqueante
src/pages/                    Login, EntrarFamilia, Dia, Mes (resumo + ranking), Ajustes
src/components/               AtividadeItem, NovaAtividade, AvisoPendencias, recorrência, convite
src/google.ts                 OAuth Google + Calendar API
src/push.ts                   inscrição Web Push
public/push-sw.js             handler de push do service worker
supabase/migrations/          tabelas, RLS, triggers e RPCs
supabase/functions/lembretes  Edge Function (push + e-mail)
supabase/functions/google-sync  Edge Function (Agenda)
supabase/cron.sql             agendamento pg_cron (placeholders)
scripts/test-regras.mjs       testes
```

## Licença

[MIT](LICENSE)
