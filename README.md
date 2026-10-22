# onzemestre

Jogo de gerenciamento de futebol no browser, inspirado no Brasfoot. Nome provisório.

## Documentação

- [O jogo hoje](docs/18-o-jogo-hoje.md): o que a Carreira, o Draft com amigos e a plataforma fazem hoje
- [Ideias para o futuro](docs/19-ideias.md): o que ainda não existe, o que está em discussão e o que já foi descartado

Os planos antigos (00 a 17) saíram do repositório; estão no histórico do git e na pasta `pesquisa/` do projeto.

## Rodando

Requer Node 22+.

```bash
npm install
npm run dev        # servidor local
npm test           # testes do motor (Vitest)
npm run lint       # Oxlint
npm run format     # Prettier
npm run build      # build de produção em dist/
npm run balance -- 50   # simula 50 temporadas e mostra se o mundo se mantém equilibrado
```

## Estrutura

```
docs/          documentação do projeto
src/engine/    motor do jogo em TypeScript puro (sem React), testável
  season/      calendário, tabela, artilharia, acesso e rebaixamento
src/store/     estado da carreira (Zustand)
src/db/        saves no IndexedDB (Dexie), um slot por carreira
src/worker/    Web Worker que simula rodadas sem travar a tela
src/cloud/     conta e save na nuvem (Supabase), opcionais
src/ui/        telas e componentes React
supabase/      tabelas, regras de acesso e funções do servidor
```

## Times de verdade: editor e pacotes de dados

O jogo vem só com times e jogadores fictícios. Quem quiser outros nomes monta um **pacote de dados** no Editor de times (menu principal) ou numa planilha, e escolhe "Usar pacote" no Novo jogo. O pacote fica só no navegador de quem o criou; o projeto não hospeda nem distribui pacotes. Escudos e imagens não são aceitos.

A planilha (`.csv`, separada por `;` ou `,`) tem uma linha por jogador:

```
ordem;clube;sigla;cidade;cor1;cor2;jogador;posicao;idade;overall
1;Clube Exemplo;CEX;Cidade;#c8102e;#000000;Fulano;G;30;80
;;;;;;Beltrano;Z;;
```

`ordem` é a posição do clube na força do mundo (1 a 20 na Série A, 21 a 40 na Série B); uma linha sem os campos do clube continua o clube de cima. Só `clube` e `jogador` são obrigatórios; o que faltar é gerado. O Editor também exporta e importa o mesmo pacote em JSON. Para montar um pacote com elencos reais, o Editor traz um prompt pronto para colar num assistente de IA com busca na internet: ele pede fontes e manda deixar de fora o que não for confirmado (`src/ui/aiPackPrompt.ts`). Veja o aviso legal em `/aviso-legal`.

## Contas e save na nuvem

A conta é opcional: sem ela o jogo roda inteiro offline, como antes. Com ela, as carreiras sincronizam entre aparelhos. O servidor é um projeto do [Supabase](https://supabase.com), e o jogo só mostra a conta quando estas variáveis existem no build (em `.env.local` ou nas variáveis de ambiente da Vercel):

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon ou publishable>
```

Para montar o servidor:

1. Crie um projeto no Supabase e rode `supabase/migrations/*.sql` no SQL Editor (ou `npx supabase link` e `npx supabase db push`).
2. Em Authentication > URL Configuration, use o endereço do jogo como Site URL e acrescente `https://<seu-dominio>/conta` (e as prévias da Vercel, se quiser) em Redirect URLs.
3. O login é por um código de 6 dígitos no e-mail (veja "Login por código" abaixo).

Para testar no próprio computador, `npx supabase start` sobe tudo em Docker; os e-mails com o código aparecem no Mailpit em `http://127.0.0.1:54324`.

Cada carreira vai para a nuvem compactada (cerca de 150 KB). A conta grátis guarda uma carreira na nuvem; as outras ficam só no aparelho. Quem pagar vai guardar até 5: o número de cada conta fica na tabela `entitlements`, que só o servidor altera (ainda não há venda de espaço extra). Quando a mesma carreira foi jogada em dois aparelhos desde a última sincronização, o jogo pergunta qual fica e sugere a mais recente.

O motor nunca usa `Math.random`: toda aleatoriedade passa por `src/engine/rng.ts`, com semente, para que mundos e partidas sejam reproduzíveis.

## Ligar o servidor (uma vez por projeto)

Os passos abaixo vieram dos planos antigos e só precisam ser feitos uma vez, ou de novo quando o PR disser.

### Login por código

O link mágico não funciona no PWA (o fluxo PKCE guarda o segredo num navegador e o link abre em outro), por isso o login é por código.

1. Em Authentication > Emails > Templates, troque os modelos **Magic Link** (quem já tem conta) e **Confirm signup** (conta nova): o corpo mostra `{{ .Token }}` e não leva `{{ .ConfirmationURL }}`. Assuntos sugeridos: `Seu código de acesso ao onzemestre: {{ .Token }}` e `Bem-vindo ao onzemestre! Seu código: {{ .Token }}`.
2. Em Authentication > Sign In / Providers > Email: **Email OTP Length** `6` e **Email OTP Expiration** `3600`.
3. O SMTP é o do Resend (Authentication > Emails > SMTP Settings). O Supabase deixa pedir um código por minuto para o mesmo e-mail.

### Funções e segredos

```sh
supabase db push
supabase functions deploy room-draft room-round room-market room-notify pass mercadopago-webhook
```

- `room-draft`, `room-round` e `room-market` rodam o motor. Publique de novo sempre que um PR mudar `src/engine` de um jeito que afete as salas.
- No Vault (SQL Editor), uma vez: `select vault.create_secret('https://<ref>.supabase.co', 'project_url');` e `select vault.create_secret('<segredo longo>', 'fantasy_cron_secret');`. Dê o mesmo segredo às funções com `supabase secrets set FANTASY_CRON_SECRET=<segredo>`. O nome ficou da fantasia, mas é o que as salas usam para chamar as funções.

### Pagamento (Mercado Pago)

1. Na conta do Mercado Pago (pode ser no CPF), cadastre uma chave Pix; sem ela o Pix não aparece no checkout.
2. Em Suas integrações, crie uma aplicação **Checkout Pro**, copie o Access Token e cadastre o webhook `https://<ref>.supabase.co/functions/v1/mercadopago-webhook` com o evento **Pagamentos**, guardando a assinatura secreta.
3. `supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... SITE_URL=https://onzemestre.com`
4. Teste com as credenciais de teste (`TEST-...`) e os cartões de teste; depois troque para as de produção (`APP_USR-...`) e cadastre o webhook também em produção.

O preço fica só em `PASS_PRICE_CENTS`. Reembolso é à mão: devolver no painel do Mercado Pago e apagar a linha do pagamento em `passes`.

Passe de cortesia de 30 dias, somado ao fim do passe atual:

```sql
select public.grant_pass(u.id, 'cortesia', 'cortesia-' || u.id || '-' || now()::date, 0, 30)
from auth.users u where u.email = '<e-mail>';
```

Passe vitalício (para tirar, apague a linha com `payment_id = 'vitalicio-<id da conta>'`):

```sql
insert into public.passes (user_id, provider, payment_id, amount_cents, starts_at, ends_at)
select u.id, 'cortesia', 'vitalicio-' || u.id, 0, now(), 'infinity'
from auth.users u where u.email = '<e-mail>'
on conflict do nothing;
```

### Avisos por notificação

1. Gere as chaves VAPID: `npx web-push generate-vapid-keys`.
2. `supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<seu e-mail>`
3. Ponha `VITE_VAPID_PUBLIC_KEY=<pública>` nas variáveis da Vercel e publique de novo. Sem ela os avisos não aparecem.
4. No iPhone e no iPad, o Safari só entrega notificações com o jogo adicionado à tela de início (iOS 16.4 ou mais novo).

### Nome antigo

O jogo se chamava futmanager. Ficam com esse nome de propósito as chaves `futmanager-*` do localStorage, o banco `futmanager` do IndexedDB e o formato `futmanager-pacote`: trocar apagaria saves e invalidaria pacotes exportados.
