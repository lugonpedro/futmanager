# Um "Brasfoot" no browser: viabilidade, features, stack e monetização

## 1. É possível?

Sim, e é um dos tipos de jogo que mais combinam com o browser. O Brasfoot é basicamente telas de tabela, formulários e uma simulação de partida em texto. Não tem física, nem gráfico 3D, nem tempo real. Tudo isso roda tranquilo em qualquer navegador, inclusive no celular.

O trabalho difícil não é técnico, é de **design e balanceamento**: o motor de simulação de partida, a economia (salários, bilheteria, transferências) e a IA dos outros clubes.

Ponto de atenção legal: o Brasfoot original vinha com times fictícios e a comunidade fazia "patches" com nomes reais. Usar nomes de jogadores, escudos e marcas reais sem licença dá problema. O caminho seguro é o mesmo do Brasfoot: dados fictícios + editor para o jogador personalizar.

## 2. Principais features do Brasfoot (por volta de 2010)

Jogo em Java para desktop, criado por Renato Albuquerque, distribuído grátis com versão "registrada" paga.

**Carreira e clubes**

- Escolher um time entre várias ligas de vários países, com divisões e acesso/rebaixamento
- Começar em time pequeno, receber propostas de outros clubes e ser demitido por mau desempenho
- Convite para treinar seleções
- Carreira de muitas temporadas seguidas

**Elenco e jogadores**

- Jogadores com posição, força/nível, idade e características (cabeceio, drible, velocidade, etc.)
- Escalação e táticas (4-4-2, 4-3-3, 3-5-2...) e postura do time
- Lesões, cartões e suspensões, cansaço
- Evolução e declínio dos jogadores com a idade, aposentadoria, jogadores das categorias de base

**Mercado**

- Compra, venda e empréstimo de jogadores, lista de transferências
- Negociação de salários e contratos, propostas de outros clubes pelos seus jogadores

**Finanças e clube**

- Caixa do clube, salários, bilheteria e preço do ingresso
- Ampliação do estádio, patrocínio

**Competições**

- Campeonatos nacionais por divisão, copas nacionais, competições continentais (tipo Libertadores) e mundial
- Tabela de classificação, artilharia, calendário

**Partida**

- Simulação "ao vivo" em texto, minuto a minuto, com placar de outros jogos rodando ao mesmo tempo
- Substituições e mudança de tática durante o jogo

**Extras**

- Vários jogadores humanos no mesmo computador (cada um com seu time)
- Editor de times/jogadores, que gerou toda a cultura de patches da comunidade
- Salvar e carregar carreira

**Versão registrada vs grátis**: a versão grátis tinha limitações (por exemplo, restrições em ligas e recursos); o registro pago, renovado periodicamente, liberava tudo.

## 3. Stack: React ou engine de jogo?

**Recomendação: React (web stack), não engine de jogo.**

Motivo: 95% do jogo é UI de dados (tabelas, listas, formulários, menus). Engines como Unity, Godot ou Phaser são ótimas para coisas que se mexem na tela, mas são ruins para fazer tabelas, formulários e telas responsivas, e exportar Unity para web gera um download pesado. Football Manager e Brasfoot são, no fundo, "aplicativos de planilha com alma".

Stack sugerida:

| Camada                       | Escolha                                                          | Por quê                                                            |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Linguagem                    | TypeScript                                                       | Tipagem ajuda muito numa simulação com muitas regras               |
| UI                           | React + Vite                                                     | Rápido, enorme ecossistema                                         |
| Estilo/componentes           | Tailwind + shadcn/ui (ou similar)                                | Tabelas e telas prontas, visual moderno                            |
| Estado                       | Zustand                                                          | Simples para o estado do jogo                                      |
| Simulação                    | Módulo TypeScript puro, rodando num Web Worker                   | Simular uma rodada inteira não trava a tela; testável isoladamente |
| Save                         | IndexedDB (via Dexie) no navegador                               | Jogo funciona offline, sem custo de servidor                       |
| Distribuição                 | PWA (instala no celular/PC) e, depois, Tauri/Electron para Steam | Um código só para web, mobile e desktop                            |
| Backend (só quando precisar) | Supabase ou similar                                              | Login, compras, save na nuvem                                      |

Se quiser uma partida com bolinhas se mexendo num campo 2D (estilo "modo 2D"), dá para usar um `<canvas>` ou PixiJS só nessa tela, dentro do React. Não precisa de engine para o resto.

Arquitetura chave: separar o **motor do jogo** (regras, simulação, economia, IA, puro TypeScript, sem UI) da **interface**. Isso deixa o motor testável, permite rodar milhares de temporadas automáticas para balancear e facilita um modo online no futuro.

Primeiro corte (MVP) sugerido: 1 país com 2 divisões fictícias, elenco, escalação, simulação em texto, mercado simples, finanças básicas, várias temporadas e save local.

## 4. Como vender

Opções, da mais simples à mais trabalhosa:

1. **Freemium com pagamento único (recomendado para começar)**. Jogo grátis no browser com limitação (ex.: só 1 país, ou limite de temporadas) e um "desbloqueio completo" pago uma vez (algo entre R$ 20 e R$ 40). É o modelo mais próximo do registro do Brasfoot, que o público já conhece, e o mais simples de implementar.
2. **Assinatura** (ex.: R$ 5 a R$ 10/mês). Só faz sentido se houver algo contínuo para entregar: save na nuvem, atualizações de elenco por temporada, ligas online entre amigos. Exige backend e conteúdo constante.
3. **Steam / lojas de app**. Empacotar a versão web (Tauri/Electron na Steam, PWA/Capacitor no celular) e vender com preço fixo. Dá visibilidade, mas a loja fica com ~30%.
4. **Anúncios** na versão grátis. Rendem pouco para esse tipo de jogo e irritam; melhor evitar ou deixar só como complemento.

Pagamento no Brasil: Pix é essencial. Mercado Pago, Stripe (já aceita Pix) ou Lemon Squeezy/Paddle (que cuidam de impostos internacionais) resolvem o checkout. O desbloqueio fica atrelado a uma conta (login simples), não a uma chave no navegador, para não ser burlado trivialmente.

Caminho sugerido: lançar grátis no browser para ganhar público, cobrar pagamento único pelo jogo completo, e só pensar em assinatura quando existir modo online ou save na nuvem que justifique.
