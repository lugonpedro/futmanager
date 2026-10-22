# Como pôr no ar

Passo a passo do que fica fora do código: Vercel, Supabase e Mercado Pago. Junta as partes de configuração dos antigos planos 05, 08, 10, 11 e 14, conferidas na `main` em 22/10/2026. O site publica sozinho na Vercel a cada merge na `main`; o resto se faz uma vez, e de novo só quando algo abaixo pedir.

## 1. Site (Vercel)

- Domínio principal `onzemestre.com` (e `www`), com os endereços antigos redirecionando com 308.
- Variáveis de ambiente do build:
  ```
  VITE_SUPABASE_URL=https://<ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=<chave anon ou publishable>
  VITE_VAPID_PUBLIC_KEY=<chave pública VAPID>   # sem ela, os avisos não aparecem
  ```
- Sem as variáveis do Supabase o jogo roda só offline: sem conta, nuvem nem salas.
- O que fica com o nome antigo de propósito: as chaves do localStorage (`futmanager-*`), o banco do IndexedDB (`futmanager`) e o `formato: "futmanager-pacote"`. Trocar apagaria os saves e invalidaria pacotes exportados.

## 2. Supabase: banco e segredos

1. Aplicar as migrações: `npx supabase link` e `npx supabase db push`.
2. Guardar no Vault, pelo SQL Editor, o endereço do projeto e um segredo compartilhado. Os agendamentos do `pg_cron` e os gatilhos das salas chamam as funções com eles. O nome `fantasy_cron_secret` ficou da fantasia e continua em uso.
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<um segredo longo>', 'fantasy_cron_secret');
   ```
3. Segredos das funções:
   ```sh
   supabase secrets set FANTASY_CRON_SECRET=<o mesmo segredo do Vault> \
     MP_ACCESS_TOKEN=<token do Mercado Pago> MP_WEBHOOK_SECRET=<assinatura do webhook> \
     SITE_URL=https://onzemestre.com \
     VAPID_PUBLIC_KEY=<chave pública> VAPID_PRIVATE_KEY=<chave privada> VAPID_SUBJECT=mailto:<seu e-mail>
   ```
   O par VAPID sai de `npx web-push generate-vapid-keys`; a chave privada fica só no Supabase.

## 3. Supabase: funções

```sh
supabase functions deploy room-draft room-round room-market room-notify pass mercadopago-webhook
```

| Função                | O que faz                                                   | Publicar de novo quando                    |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `room-draft`          | Monta o mundo da sala e abre as cartas do draft             | Mudar o motor, os pacotes ou o draft       |
| `room-round`          | Joga as rodadas das salas e confere as escalações           | Mudar o motor da partida ou a liga da sala |
| `room-market`         | Aplica trocas aceitas e dispensas                           | Mudar o motor ou o mercado da sala         |
| `room-notify`         | Manda os avisos por Web Push                                | Mudar os textos ou o envio                 |
| `pass`                | Abre o pagamento do passe no Mercado Pago                   | Mudar preço ou checkout                    |
| `mercadopago-webhook` | Confirma o pagamento na API do Mercado Pago e grava o passe | Mudar a confirmação                        |

As funções importam o motor de `src/engine`, então um PR que mexe no motor só vale nas salas depois de publicar `room-draft`, `room-round` e `room-market`. Salas já criadas guardam os jogadores do dia em que foram criadas.

## 4. Login por código no e-mail

O login usa um código de 6 dígitos em vez do link mágico, porque o link abre fora do PWA e o fluxo PKCE falha. O e-mail sai pelo SMTP do Resend (em **Authentication → Emails → SMTP Settings**).

Em **Authentication → Emails → Templates**, os modelos **Magic Link** (quem já tem conta) e **Confirm signup** (quem entra pela primeira vez) precisam mostrar `{{ .Token }}` e não o `{{ .ConfirmationURL }}`. Assunto sugerido: `Seu código de acesso ao onzemestre: {{ .Token }}`.

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

Em **Authentication → Sign In / Providers → Email**: Email OTP Length `6` e Email OTP Expiration `3600`. Em **URL Configuration**, Site URL `https://onzemestre.com` e `https://onzemestre.com/**` nas Redirect URLs.

Se der errado:

- **O e-mail chega só com o link**: o modelo daquele caso (Magic Link ou Confirm signup) não foi trocado.
- **"Token has expired or is invalid"**: passou de 1 hora ou foi pedido outro código depois.
- **"you can only request this after N seconds"**: o Supabase limita um envio por minuto para o mesmo e-mail.

Para testar no computador, `npx supabase start` sobe tudo em Docker, e os e-mails aparecem no Mailpit em `http://127.0.0.1:54324`.

## 5. Mercado Pago (passe)

Escolhido porque aceita conta no CPF e cobra 0,99% no Pix (uns R$ 0,05 num passe de R$ 5,00). O preço fica só em `PASS_PRICE_CENTS` (`src/cloud/mercadopago.ts`), e a duração em `PASS_DAYS`.

1. Na conta do Mercado Pago, cadastrar uma **chave Pix**; sem ela o Pix não aparece no checkout.
2. Em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app), criar uma aplicação **Checkout Pro** e copiar o Access Token (`TEST-...` para testar, `APP_USR-...` em produção).
3. Em Webhooks, cadastrar `https://<ref>.supabase.co/functions/v1/mercadopago-webhook` com o evento **Pagamentos** e copiar a assinatura secreta. Fazer isso no modo de teste e no de produção.
4. Guardar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` (passo 2.3) e publicar `pass` e `mercadopago-webhook`.
5. Testar com um comprador e cartões de teste do Mercado Pago, e depois trocar para o token de produção.

**Passe de cortesia** de 30 dias, somado ao fim do passe atual (SQL Editor):

```sql
select public.grant_pass(u.id, 'cortesia', 'cortesia-' || u.id || '-' || now()::date, 0, 30)
from auth.users u where u.email = '<e-mail>';
```

**Passe vitalício**:

```sql
insert into public.passes (user_id, provider, payment_id, amount_cents, starts_at, ends_at)
select u.id, 'cortesia', 'vitalicio-' || u.id, 0, now(), 'infinity'
from auth.users u where u.email = '<e-mail>'
on conflict do nothing;
```

Para tirar: `delete from passes where payment_id = 'vitalicio-<id da conta>';`. **Reembolso** é à mão: devolver no painel do Mercado Pago e apagar a linha do pagamento em `passes`.

## 6. Avisos (Web Push)

- Precisam da chave pública no site (`VITE_VAPID_PUBLIC_KEY`) e das três chaves VAPID no Supabase (passo 2.3).
- No iPhone e iPad, o Safari só entrega notificação com o jogo adicionado à tela de início (iOS 16.4 ou mais novo).
- Inscrições que o serviço de push diz que acabaram são apagadas sozinhas.
