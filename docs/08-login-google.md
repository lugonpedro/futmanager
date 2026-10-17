# Login com o Google

Desde 17/10/2026 a conta do jogo entra só com o Google. O link mágico por e-mail saiu.

## Por que o link no e-mail não funcionava no PWA

O login usa o fluxo PKCE do Supabase: quem pede o login guarda um código secreto no navegador e só esse mesmo navegador consegue trocar o link por uma sessão. Com o jogo instalado como PWA, o link do e-mail abre no navegador ou no app de e-mail, que não têm esse código, e o login falha. Com o Google, a ida e a volta acontecem dentro do próprio app: no iPhone a página do Google abre por cima do PWA, e no Android abre numa aba do Chrome que divide os dados com o app instalado.

## Passo a passo (uma vez)

Antes de começar, anote duas coisas:

- **Endereço do jogo**: o domínio onde o PWA está publicado, por exemplo `https://<endereço do jogo>`.
- **Ref do Supabase**: no painel do Supabase, Project Settings → General → Project ID. A URL de retorno do Google é `https://<ref>.supabase.co/auth/v1/callback`. Ela também aparece pronta para copiar no passo 3.

### 1. Tela de consentimento no Google Cloud

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto (por exemplo `futmanager`) ou escolha um existente.
2. Vá em **APIs e serviços → Tela de permissão OAuth** (no console novo, **Google Auth Platform**) e clique em **Começar**.
3. **Informações do app**: nome `futmanager` e o seu e-mail de suporte.
4. **Público**: escolha **Externo**.
5. **Dados de contato**: o seu e-mail. Aceite a política e crie.
6. Em **Acesso a dados** (ou Escopos), deixe só os básicos: `openid`, `.../auth/userinfo.email` e `.../auth/userinfo.profile`. Com só esses escopos o Google não pede verificação.
7. Em **Branding** → **Domínios autorizados**, acrescente o domínio do jogo (por exemplo `lugon.dev`) e o do Supabase, `<ref>.supabase.co`.
8. Em **Público**, clique em **Publicar app** para passar de "Teste" para "Em produção". Enquanto o app está em teste, só os e-mails cadastrados como usuários de teste conseguem entrar. Evite enviar um logotipo agora: com logotipo o Google pede a verificação da marca, que leva dias.

### 2. Cliente OAuth no Google Cloud

1. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth** (no console novo, **Google Auth Platform → Clientes → Criar cliente**).
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: `futmanager web`.
3. **Origens JavaScript autorizadas**:
   - `https://<endereço do jogo>`
   - `http://localhost:5173` (para testar no computador)
4. **URIs de redirecionamento autorizados**:
   - `https://<ref>.supabase.co/auth/v1/callback`
   - `http://127.0.0.1:54321/auth/v1/callback` (só se for usar `npx supabase start`)
5. Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta do cliente**.

O redirecionamento do Google vai sempre para o Supabase, não para o jogo. Quem manda o jogador de volta ao jogo é o Supabase, pelo passo 4.

### 3. Provedor Google no Supabase

1. No painel do Supabase, vá em **Authentication → Sign In / Providers → Google**.
2. Ligue **Enable Sign in with Google**.
3. Cole o **Client ID** e o **Client Secret** do passo 2.
4. Confira que a **Callback URL** mostrada ali é a mesma que você pôs no Google. Se for diferente (domínio próprio no Supabase, por exemplo), use a do Supabase também no Google.
5. Salve.

### 4. URLs de retorno no Supabase

Em **Authentication → URL Configuration**:

1. **Site URL**: `https://<endereço do jogo>`.
2. **Redirect URLs**, acrescente:
   - `https://<endereço do jogo>/conta` (é para onde o jogo volta depois do login)
   - `http://localhost:5173/conta` (testes no computador)
   - opcional, para as prévias da Vercel: `https://*-<seu-usuario>.vercel.app/conta`

Se a URL de volta não estiver nessa lista, o Supabase manda o jogador para o Site URL e ele não fica logado na tela de conta.

### 5. Testar

1. No computador, abra `https://<endereço do jogo>/conta`, clique em **Entrar com o Google** e confira que volta logado.
2. No celular, com o PWA instalado, faça o mesmo pelo ícone do app. Se o PWA já estava aberto, feche e abra de novo para ele pegar a versão nova.
3. Entre com o mesmo Google nos dois aparelhos e confira que a carreira na nuvem aparece nos dois.

### 6. Desligar o e-mail

Depois que o Google funcionar:

1. Em **Authentication → Sign In / Providers → Email**, desligue **Enable Email provider**. Assim ninguém cria conta nem entra por link de e-mail, mesmo chamando a API direto.
2. O SMTP do Resend com o domínio `lugon.dev` deixa de ser usado pelo login. Pode ficar configurado (não custa nada) ou sair em Authentication → Emails → SMTP Settings.

## Quem já tinha conta pelo e-mail

O Supabase junta as contas sozinho quando o e-mail é o mesmo: quem entrava pelo link com um Gmail (ou um e-mail do Google Workspace) entra com o Google e continua com o mesmo perfil, as mesmas carreiras na nuvem e o mesmo passe. Isso funciona porque o Google confirma o e-mail.

Quem usava um e-mail que não é conta do Google ganha uma conta nova ao entrar com o Google. As carreiras do aparelho continuam lá e sobem para a conta nova; as que só estavam na nuvem ficam na conta antiga. Para poucas pessoas, dá para mudar o e-mail da conta antiga para o do Google em Authentication → Users antes de a pessoa entrar.

## Se der errado

- **"Error 400: redirect_uri_mismatch"** no Google: a URI de redirecionamento do passo 2 não bate com a Callback URL do Supabase. Copie de novo, sem barra no fim.
- **"Acesso bloqueado: este app não foi verificado"** ou só você consegue entrar: o app está em "Teste". Publique no passo 1.8.
- **Volta para a página inicial e não fica logado**: falta `https://<endereço do jogo>/conta` nas Redirect URLs do passo 4.
- **"Unsupported provider: provider is not enabled"**: o provedor Google não foi salvo no passo 3.
- **No Android, o login termina numa aba do Chrome em vez do app**: feche a aba e abra o app; a sessão é a mesma, porque o PWA divide os dados com o Chrome.
