# 11 · Trocar o Stripe por um gateway que aceite CPF

17/10/2026. O checkout do passe da temporada parou porque o Stripe passou a pedir um CNPJ. Este plano compara gateways que aceitam conta de pessoa física (CPF), recomenda um e lista o que muda no código.

## Resumo

**Recomendação: Mercado Pago, com o Checkout Pro** (página de pagamento hospedada por eles, como o Stripe Checkout).

- Aceita conta com CPF e não cobra mensalidade.
- Pix custa 0,99% e cai na hora. Num passe de R$ 5,00, isso dá **cerca de R$ 0,05**, contra R$ 1,99 no Asaas.
- Cartão custa de 3,98% (dinheiro em 30 dias) a 4,98% (na hora), ou seja, de R$ 0,20 a R$ 0,25 por passe.
- O fluxo é igual ao de hoje: a função cria a cobrança, o navegador vai para a página do Mercado Pago, volta para `SITE_URL` e um webhook libera o passe. A troca fica restrita a duas funções, um helper e alguns textos.

## Comparação

Valores para um passe de R$ 5,00, tirados das tabelas públicas de outubro de 2026. Confira na conta antes de ligar, porque as taxas mudam e algumas são promocionais.

| Gateway                 | Conta com CPF                                          | Pix                                     | Cartão à vista                                      | Custo por passe                     | Checkout hospedado + API                           |
| ----------------------- | ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| **Mercado Pago**        | Sim                                                    | 0,99%, na hora                          | 4,98% na hora · 4,49% em 14 dias · 3,98% em 30 dias | Pix ≈ R$ 0,05 · cartão R$ 0,20–0,25 | Sim (Checkout Pro, preferências, webhook assinado) |
| **Asaas**               | Sim (há tabela própria para PF)                        | R$ 1,99 (R$ 0,99 nos 3 primeiros meses) | R$ 0,49 + 2,99% (R$ 0,49 + 1,99% na promoção)       | Pix R$ 1,99 · cartão ≈ R$ 0,64      | Sim (cobranças, link de pagamento, webhook)        |
| **PagBank (PagSeguro)** | Provável, mas a página não confirma para vendas online | Não publica a taxa online               | Depende do plano de recebimento                     | Não dá para calcular sem a conta    | Sim (Checkout API com redirecionamento e webhook)  |
| **AbacatePay**          | **Não**: exige CNPJ para liberar transações            | Taxa fixa por Pix                       | Não informado                                       | —                                   | Sim, mas fora pelo CNPJ                            |

Como a taxa fixa pesa muito num valor pequeno, o Asaas cobraria cerca de 40% do passe no Pix. O Mercado Pago cobra em porcentagem, e é o mais barato nesse valor. A AbacatePay seria boa (documentação e foco em Pix), mas fica de fora enquanto pedir CNPJ.

Outros nomes que aparecem em conversas de desenvolvedores (Iugu, Pagar.me, Cielo, Vindi, Efí) costumam atender só empresa, ou não deu para confirmar CPF. Ficaram fora.

### Pontos de atenção com o Mercado Pago

- **Pix no Checkout Pro**: só aparece se a conta tiver uma chave Pix cadastrada. Há relatos antigos de problema na volta depois do Pix. Testar no sandbox antes de abrir para todo mundo.
- **Pagamento pendente**: um Pix pode voltar como `pending` e ser aprovado segundos depois. O passe só sai quando o webhook vê `approved`, como hoje.
- **Webhook sem o status**: a notificação traz só o id do pagamento. A função precisa consultar `GET /v1/payments/{id}` com o token. Isso é bom, porque a resposta vem direto da API do Mercado Pago e confirma o pagamento mesmo que alguém forje a notificação.
- **Dinheiro na conta de PF**: o que entra é renda da pessoa física e vai na declaração do IR. Quando o volume crescer, abrir um MEI resolve e o Mercado Pago aceita migrar. (Isso é uma inferência, não orientação contábil.)

## O que muda no código

Hoje o Stripe aparece em sete lugares. Nada disso mexe no `GameState`, então não precisa subir `SAVE_VERSION`.

| Arquivo                                      | Hoje                                                              | Depois                                                                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cloud/stripe.ts` (+ `stripe.test.ts`)   | Assinatura do webhook, formulário do Checkout e leitura do evento | Vira `src/cloud/mercadopago.ts`, com testes: `passPreference()` monta a preferência, `verifyMercadoPagoSignature()` confere o `x-signature` e `passPayment()` lê o pagamento consultado |
| `supabase/functions/fantasy-pass/index.ts`   | `POST api.stripe.com/v1/checkout/sessions`, devolve `session.url` | `POST api.mercadopago.com/checkout/preferences`, devolve `init_point`. As checagens de conta, temporada e passe já comprado ficam iguais                                                |
| `supabase/functions/stripe-webhook/`         | Recebe o evento do Stripe e grava o passe                         | Nova `mercadopago-webhook`: confere a assinatura, consulta o pagamento e grava com `provider: 'mercadopago'`. A do Stripe sai depois da troca                                           |
| `supabase/config.toml`                       | `[functions.stripe-webhook] verify_jwt = false`                   | Mesmo bloco para `mercadopago-webhook`                                                                                                                                                  |
| Nova migração                                | `provider in ('stripe', 'cortesia')`                              | Acrescenta `'mercadopago'`. As linhas antigas de `stripe` continuam valendo                                                                                                             |
| `src/cloud/pass.ts`                          | Preço em dois lugares (`PASS_PRICE` e o preço no Stripe)          | O preço vai na própria preferência; a função lê de um único lugar (`PASS_PRICE_CENTS`) e a tela continua mostrando `PASS_PRICE`                                                         |
| `FantasyPassScreen.tsx`, `PrivacyScreen.tsx` | "página do Stripe", "passam pelo Stripe"                          | Trocar por Mercado Pago. Na volta, tratar `?pagamento=pendente` com "esperando a confirmação do Pix"                                                                                    |
| `docs/05-online.md`                          | "Para ligar no Stripe (uma vez)"                                  | Novo passo a passo do Mercado Pago, e reembolso pelo painel dele                                                                                                                        |

### Como fica cada peça

**Criar a cobrança** (`fantasy-pass`):

```json
POST https://api.mercadopago.com/checkout/preferences
Authorization: Bearer <MP_ACCESS_TOKEN>
X-Idempotency-Key: <user_id>-<season_id>
{
  "items": [{ "title": "Passe da temporada", "quantity": 1, "currency_id": "BRL", "unit_price": 5 }],
  "external_reference": "<user_id>:<season_id>",
  "metadata": { "user_id": "...", "season_id": 1 },
  "payer": { "email": "<e-mail da conta>" },
  "back_urls": {
    "success": "<SITE_URL>/fantasia/passe?pagamento=ok",
    "pending": "<SITE_URL>/fantasia/passe?pagamento=pendente",
    "failure": "<SITE_URL>/fantasia/passe"
  },
  "auto_return": "approved",
  "notification_url": "https://<ref>.supabase.co/functions/v1/mercadopago-webhook",
  "payment_methods": { "excluded_payment_types": [{ "id": "ticket" }], "installments": 1 }
}
```

Boleto fica de fora (demora até 3 dias e custa R$ 3,49) e o cartão só à vista.

**Liberar o passe** (`mercadopago-webhook`):

1. Conferir o cabeçalho `x-signature` (`ts=...,v1=...`): HMAC-SHA256, com o segredo do webhook, de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. É quase o mesmo código de `verifyStripeSignature`, só muda o texto assinado. Confirmar o formato exato na documentação na hora de implementar.
2. Se `type` for `payment`, consultar `GET /v1/payments/<data.id>`.
3. Se `status === 'approved'`, gravar `fantasy_passes` com `user_id` e `season_id` do `external_reference`, `payment_id` = id do pagamento e `amount_cents` = `transaction_amount × 100`. O `upsert` com `ignoreDuplicates` continua cobrindo notificações repetidas.
4. Responder 200 em até 22 segundos; com erro, devolver 500 para o Mercado Pago tentar de novo.

**Segredos no Supabase**: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PASS_PRICE_CENTS=500` e `SITE_URL=https://onzemestre.com`. Depois da troca, apagar os `STRIPE_*`.

## Passo a passo

1. **Conta**: criar ou usar a conta do Mercado Pago no CPF, cadastrar uma chave Pix e criar uma aplicação em Suas integrações (Checkout Pro) para pegar as credenciais de teste e produção.
2. **Código** (um PR): helper e testes, as duas funções, migração, `config.toml`, textos e `docs/05-online.md`. Rodar `lint`, `format:check`, `test` e `build`.
3. **Sandbox**: com usuários de teste do Mercado Pago, comprar com cartão de teste e com Pix; conferir que o passe aparece, que notificação repetida não duplica e que pagamento recusado não libera nada.
4. **Produção**: trocar para as credenciais de produção, cadastrar o webhook (evento Pagamentos) e fazer uma compra real de R$ 5,00 com reembolso pelo painel.
5. **Limpeza**: apagar a função `stripe-webhook` e os segredos do Stripe. A tabela continua aceitando `provider = 'stripe'` para os passes já vendidos.

## Fontes

- Mercado Pago, taxas do checkout online: https://www.mercadopago.com.br/ferramentas-para-vender/check-out
- Mercado Pago, aceita CPF: https://calculadoradetaxas.com.br/mercado-pago/
- Mercado Pago, notificações e webhooks: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
- Asaas, preços e taxas: https://www.asaas.com/precos-e-taxas
- PagBank, link e Checkout API: https://blog.pagbank.com.br/link-de-pagamento-pagbank
- AbacatePay exige CNPJ e outras opções discutidas por desenvolvedores: https://www.tabnews.com.br/Yagasaki/alternativa-a-stripe
