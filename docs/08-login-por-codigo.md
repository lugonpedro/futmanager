# Login por código no e-mail

Desde 17/10/2026 a conta entra com um código de 6 dígitos que chega no e-mail, no lugar do link mágico. Tudo continua só no Supabase, com o SMTP do Resend que já estava configurado.

## Por que o link não funcionava no PWA

O login usa o fluxo PKCE do Supabase: quem pede o login guarda um segredo no navegador, e só esse mesmo navegador consegue trocar o link por uma sessão. Com o jogo instalado como PWA, o link do e-mail abre no navegador ou no app de e-mail, que não têm o segredo, e o login falha. Com o código, o jogador digita os números dentro do próprio PWA, e o login termina ali.

## Como fica a tela de conta

1. O jogador digita o e-mail e toca em **Enviar código de acesso**.
2. Chega um e-mail com o código. No celular, o teclado costuma sugerir o código sozinho. A tela lembra de olhar o spam e a lixeira se o e-mail não aparecer.
3. O jogador digita o código e toca em **Entrar**.
4. Dá para pedir outro código ou trocar de e-mail na mesma tela.

Quem já tinha conta continua com a mesma conta, porque o e-mail é o mesmo.

## Passo a passo no Supabase (uma vez)

### 1. Pôr o código nos modelos de e-mail

Os modelos padrão do Supabase mandam só o link. Em **Authentication → Emails → Templates**, troque dois modelos:

- **Magic Link**: é o que chega para quem já tem conta.
- **Confirm signup**: é o que chega para quem entra pela primeira vez.

Nos dois, o que importa é a variável `{{ .Token }}`, que vira o código. Tire o `{{ .ConfirmationURL }}`: o link continuaria falhando no PWA e confundiria o jogador.

**Magic Link**

Assunto: `Seu código de acesso ao futmanager: {{ .Token }}`

```html
<div
  style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #111"
>
  <h2 style="margin: 0 0 12px">futmanager</h2>
  <p>Use este código para entrar no jogo:</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 16px 0">
    {{ .Token }}
  </p>
  <p style="color: #555; font-size: 14px">
    O código vale por 1 hora. Se não foi você que pediu, ignore este e-mail.
  </p>
</div>
```

**Confirm signup**

Assunto: `Bem-vindo ao futmanager! Seu código: {{ .Token }}`

```html
<div
  style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #111"
>
  <h2 style="margin: 0 0 12px">Bem-vindo ao futmanager</h2>
  <p>Use este código para criar sua conta e entrar no jogo:</p>
  <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 16px 0">
    {{ .Token }}
  </p>
  <p style="color: #555; font-size: 14px">
    O código vale por 1 hora. Se não foi você que pediu, ignore este e-mail.
  </p>
</div>
```

Salve os dois modelos.

### 2. Conferir o tamanho e a validade do código

Em **Authentication → Sign In / Providers → Email**:

- **Email OTP Length**: `6`. A tela aceita de 6 a 10 dígitos, mas o texto do jogo fala em 6.
- **Email OTP Expiration**: `3600` segundos (1 hora) está bom.
- **Enable Email provider** continua ligado.

### 3. Testar

1. No computador, abra `/conta`, peça o código, digite e confira que entrou.
2. No celular, com o PWA instalado, faça o mesmo pelo ícone do app. Se o app já estava aberto, feche e abra de novo para ele pegar a versão nova.
3. Teste também com um e-mail que ainda não tem conta, para conferir o modelo **Confirm signup**.

Não precisa mexer em **URL Configuration**: o código não usa redirecionamento.

## Se der errado

- **O e-mail chega só com o link, sem números**: o modelo daquele caso não foi trocado. Quem já tem conta recebe o **Magic Link**, e quem é novo recebe o **Confirm signup**.
- **"Token has expired or is invalid"**: o código passou de 1 hora ou foi pedido outro depois dele. Vale só o último código enviado.
- **"For security purposes, you can only request this after N seconds"**: o Supabase limita um envio por minuto para o mesmo e-mail. É só esperar.
- **O e-mail não chega**: confira o SMTP em **Authentication → Emails → SMTP Settings** e os envios no painel do Resend.
