# CLOC-Tinder

App de matching entre quem precisa de ajuda e quem pode ajudar, exclusivo para
membros do grupo de WhatsApp **CLOC Brasil - Bate papo**. Cadastro com verificação
de número por código (OTP) via WhatsApp (uazapi) e painel de administração.

## Stack
- Node.js + Express + EJS
- Supabase (Postgres) via `@supabase/supabase-js`
- Sessão em cookie assinado (`cookie-session`) — pronto para serverless
- Deploy na Vercel (`vercel.json`), sync da lista do grupo via Vercel Cron

## Configuração

1. Crie o schema no Supabase: **Dashboard → SQL Editor**, cole o conteúdo de
   [`schema.sql`](./schema.sql) e rode.
2. Copie `.env.example` para `.env` e preencha (uazapi, Supabase, sessão).
3. Descubra o JID do grupo: `npm run wa:groups`.

```bash
npm install
npm start         # local em http://localhost:3001
```

## Variáveis de ambiente
Veja [`.env.example`](./.env.example). As principais:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UAZAPI_BASE_URL`, `UAZAPI_TOKEN`,
`UAZAPI_GROUP_JID`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`.

## Deploy na Vercel
1. Importe o repositório na Vercel.
2. Configure as variáveis de ambiente (as mesmas do `.env`).
3. O `vercel.json` já define o cron de sincronização (a cada 6h) em
   `/api/cron/sync`, protegido por `CRON_SECRET`.

## Admin
Super-admins são definidos por `ADMIN_EMAIL` / `ADMIN_PHONES` no ambiente e podem
promover outros usuários pelo painel em `/admin`.
