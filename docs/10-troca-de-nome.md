# Troca de nome: futmanager → onzemestre (onzemestre.com)

A parte do código está no [PR #48](https://github.com/lugonpedro/futmanager/pull/48). O resto é configuração nos painéis, nesta ordem.

## 1. Vercel e DNS

1. Vercel → projeto → **Settings → Domains** → adicione `onzemestre.com` e `www.onzemestre.com`.
2. No registrador do domínio, crie os registros que a Vercel mostrar (em geral `A @ → 76.76.21.21` e `CNAME www → cname.vercel-dns.com`), ou aponte os nameservers para a Vercel.
3. Escolha `onzemestre.com` como domínio principal e deixe o antigo (o `*.vercel.app` ou o subdomínio do lugon.dev, se houver) redirecionando para ele com 308.
4. Opcional: renomeie o projeto na Vercel para `onzemestre`. Isso muda a URL `*.vercel.app`, então faça depois do passo 2 do Supabase.

## 2. Supabase Auth

**Authentication → URL Configuration**

- **Site URL**: `https://onzemestre.com`
- **Redirect URLs**: adicione `https://onzemestre.com/**` e `https://www.onzemestre.com/**`. Mantenha as antigas até a migração terminar e só então remova.

**Authentication → Emails → Templates**: os assuntos e o corpo dos e-mails de código (doc 08) dizem "futmanager". Troque para "onzemestre" em "Magic Link" e "Confirm signup".

**Authentication → Sign In / Providers → Google**: nada muda aqui; o callback continua sendo `https://<projeto>.supabase.co/auth/v1/callback`.

## 3. Google Cloud (OAuth)

APIs e serviços → **Credenciais** → o cliente OAuth do app:

- **Origens JavaScript autorizadas**: adicione `https://onzemestre.com` e `https://www.onzemestre.com`.
- **URIs de redirecionamento**: o do Supabase continua igual, não precisa mexer.

**Tela de consentimento OAuth**: troque o nome do app para "onzemestre", a página inicial para `https://onzemestre.com`, as URLs de privacidade e termos, e adicione `onzemestre.com` em **Domínios autorizados**. Mudar nome ou logo pode pedir nova verificação do Google.

## 4. Resend (só se quiser e-mail @onzemestre.com)

1. Resend → **Domains** → adicione `onzemestre.com` e crie no DNS os registros que ele pedir (SPF/MX e DKIM em `send.` e `resend._domainkey`). Espere ficar "Verified".
2. Supabase → **Authentication → Emails → SMTP Settings**: troque o remetente para algo como `nao-responda@onzemestre.com` e o nome do remetente para "onzemestre". A senha (API key do Resend) pode continuar a mesma.
3. Opcional: um registro DMARC (`_dmarc` TXT `v=DMARC1; p=none`) ajuda a não cair no spam.

Sem esse passo o login continua funcionando, só que os e-mails saem do lugon.dev.

## 5. Secrets das funções do Supabase

**Edge Functions → Secrets** (ou `supabase secrets set`):

- `SITE_URL` → `https://onzemestre.com`. É para onde o Stripe volta depois do pagamento do passe da fantasia.
- `VAPID_SUBJECT` → se for `mailto:...@lugon.dev`, pode trocar para um e-mail do novo domínio. Não é obrigatório.

As variáveis `VITE_*` da Vercel não citam o domínio e ficam como estão.

## 6. Stripe

Se o checkout mostra o nome da empresa, troque em **Settings → Business → Public details** (nome público e site). O webhook aponta para o Supabase, então não muda.

## 7. GitHub (opcional)

Renomear o repositório para `onzemestre` é seguro: o GitHub redireciona o nome antigo. Depois atualize o `CONTACT_URL` em `src/ui/contact.ts` e reconecte o repositório na Vercel se ela reclamar.

## O que fica com o nome antigo de propósito

As chaves do localStorage (`futmanager-*`), o banco do IndexedDB (`futmanager`) e o `formato: "futmanager-pacote"`. Trocar apagaria os saves e preferências de quem já joga e invalidaria pacotes exportados.

Atenção: o localStorage e o IndexedDB são por domínio. Quem joga hoje no endereço antigo não vai ver os saves locais em onzemestre.com. Quem tem conta recupera tudo pela nuvem ao entrar; quem joga só offline precisa entrar com uma conta no endereço antigo e sincronizar antes de mudar, porque o jogo não tem exportação de carreira.
