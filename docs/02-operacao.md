# Operação do servidor

Como montar e manter a parte online (Supabase, Mercado Pago, avisos e domínio). Junta os passos "para ligar" que estavam espalhados nos planos 05, 08, 10, 11, 13 e 14. Para rodar o jogo localmente e o formato dos pacotes, veja o [README](../README.md).

## Supabase

### Uma vez por projeto

1. Aplicar as migrações: `npx supabase link` e `npx supabase db push` (ou rodar `supabase/migrations/*.sql` no SQL Editor, em ordem).
2. Guardar no Vault o endereço do projeto e um segredo compartilhado, usados pelo `pg_cron` e pelos gatilhos que chamam as funções:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<um segredo longo>', 'fantasy_cron_secret');
   ```
   O nome `fantasy_cron_secret` ficou da fantasia; as funções das salas usam o mesmo.
3. Segredos das funções:
   ```sh
   supabase secrets set FANTASY_CRON_SECRET=<o mesmo segredo> SITE_URL=https://onzemestre.com \
     MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... \
     VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:<e-mail>
   ```
4. Publicar as funções: `supabase functions deploy room-draft room-round room-market room-notify pass mercadopago-webhook`.
5. Variáveis do site (Vercel e `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY`. Sem as duas primeiras o jogo esconde a conta; sem a terceira, os avisos.

### A cada mudança no motor

As salas rodam o motor no servidor. Quando um PR mexe em `src/engine` (partida, escalação, funções, estilos, regras da sala), publicar de novo `room-draft`, `room-round` e `room-market`. Salas que já existem guardam os jogadores do dia em que foram criadas; regras novas valem a partir da próxima rodada jogada.

### Funções

| Função                | O que faz                                                                |
| --------------------- | ------------------------------------------------------------------------ |
| `room-draft`          | Cria o mundo da sala e abre as cartas do draft                           |
| `room-round`          | Joga a rodada, grava resultados e replays (chamada pelo último "Pronto") |
| `room-market`         | Aplica trocas aceitas e dispensas                                        |
| `room-notify`         | Manda os avisos por push, chamada pelos gatilhos do banco via `pg_net`   |
| `pass`                | Abre o pagamento do passe no Mercado Pago                                |
| `mercadopago-webhook` | Confere o pagamento na API e grava o passe (`grant_pass`, 30 dias)       |

O `pg_cron` faz o tique do draft a cada 30 segundos (`draft_tick_all`) repete a chamada da rodada nas salas em que todos estão prontos e a última tentativa falhou, e todo dia às 4h de Brasília apaga as salas paradas na espera há mais de 8 dias.

## Login por código

O login é por um código de 6 dígitos no e-mail, porque o link mágico não funciona no PWA (o fluxo PKCE precisa do mesmo navegador). O e-mail sai pelo SMTP do Resend.

Em **Authentication → Emails → Templates**, os modelos **Magic Link** (quem já tem conta) e **Confirm signup** (conta nova) precisam mostrar `{{ .Token }}` e não o `{{ .ConfirmationURL }}`. Exemplo do Magic Link:

Assunto: `Seu código de acesso ao onzemestre: {{ .Token }}`

```html
<div
  style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #111"
>
  <h2 style="margin: 0 0 12px">onzemestre</h2>
  <p>Use este código para entrar no jogo:</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 16px 0">
    {{ .Token }}
  </p>
  <p style="color: #555; font-size: 14px">
    O código vale por 1 hora. Se não foi você que pediu, ignore este e-mail.
  </p>
</div>
```

Em **Authentication → Sign In / Providers → Email**: Email OTP Length `6`, Email OTP Expiration `3600`.

Se der errado:

- **E-mail só com o link**: o modelo daquele caso (conta nova ou existente) não foi trocado.
- **"Token has expired or is invalid"**: passou de 1 hora ou foi pedido outro código depois.
- **"you can only request this after N seconds"**: o Supabase limita um envio por minuto por e-mail.
- **E-mail não chega**: conferir o SMTP em **Authentication → Emails → SMTP Settings** e os envios no painel do Resend.

## Mercado Pago (passe)

Escolhido por aceitar conta no CPF (o Stripe passou a pedir CNPJ). Pix custa 0,99%; cartão, de 3,98% a 4,98%.

1. Na conta do Mercado Pago, cadastrar uma **chave Pix** (sem ela o Pix não aparece no checkout).
2. Em Suas integrações, criar uma aplicação **Checkout Pro** e copiar o Access Token.
3. Em Webhooks, cadastrar `https://<ref>.supabase.co/functions/v1/mercadopago-webhook` com o evento **Pagamentos** e copiar a assinatura secreta.
4. Guardar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` (passo 3 do Supabase) e publicar `pass` e `mercadopago-webhook`.
5. Testar com comprador e cartões de teste; depois trocar para o token de produção (`APP_USR-...`) e cadastrar o webhook também em produção.

O preço fica em `PASS_PRICE_CENTS` e a duração em `PASS_DAYS` (`src/cloud/mercadopago.ts`). Passes antigos com `provider = 'stripe'` continuam valendo.

### Passe de cortesia e vitalício

No SQL Editor, trocando `<e-mail>`:

```sql
-- 30 dias, somados ao fim do passe atual
select public.grant_pass(u.id, 'cortesia', 'cortesia-' || u.id || '-' || now()::date, 0, 30)
from auth.users u where u.email = '<e-mail>';

-- vitalício
insert into public.passes (user_id, provider, payment_id, amount_cents, starts_at, ends_at)
select u.id, 'cortesia', 'vitalicio-' || u.id, 0, now(), 'infinity'
from auth.users u where u.email = '<e-mail>'
on conflict do nothing;
```

Tirar o vitalício: `delete from passes where payment_id = 'vitalicio-' || '<id da conta>';`.

**Reembolso**: devolver o pagamento no painel do Mercado Pago e apagar a linha dele em `passes`.

## Avisos por push

1. Gerar as chaves: `npx web-push generate-vapid-keys`. A privada fica só no Supabase.
2. Guardar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no Supabase e `VITE_VAPID_PUBLIC_KEY` na Vercel.
3. No iPhone e iPad, o Safari só entrega notificações com o jogo adicionado à tela de início (iOS 16.4 ou mais novo).

As mensagens são criptografadas e assinadas só com WebCrypto (`src/cloud/webpush.ts`); inscrições que o serviço de push dá como encerradas são apagadas.

## Domínio

O jogo está em `onzemestre.com` (Vercel), com o Supabase Auth apontando para ele (Site URL e Redirect URLs `https://onzemestre.com/**`). Ficaram com o nome antigo **de propósito**: as chaves do localStorage (`futmanager-*`), o banco do IndexedDB (`futmanager`) e o `formato: "futmanager-pacote"` dos pacotes. Trocar apagaria os saves de quem joga e invalidaria pacotes exportados.
