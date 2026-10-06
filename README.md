# PokéIdle Desk

Hub de mesa para o [PokéIdle](https://pokeidle.io): o jogo, as lives oficiais da Twitch e da Kick e as automações de rotina numa janela só, que pode ficar oculta ao lado do relógio.

Projeto de fã, sem vínculo com o PokéIdle, a Twitch ou a Kick. Os termos do jogo (seção 5, lidos em outubro de 2026) dizem que "Automações são permitidas, no jogo e no Mercado"; confira se isso continua valendo antes de usar.

## Baixar e abrir

**Sem instalar nada (Windows 10/11, 64 bits)**

1. Baixe o `.zip` da [última versão](../../releases/latest).
2. Extraia numa pasta qualquer e abra `PokeIdle Desk.exe`.

O Windows pode avisar que o aplicativo é de editor desconhecido, porque ele não é assinado.

**Pelo código-fonte**

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
git clone https://github.com/aKevu/pokeidle-desk.git
cd pokeidle-desk
npm install
npm start
```

No Windows, depois do `npm install`, também dá para abrir com dois cliques em `iniciar.bat`.

## Primeiros passos

1. **Entre no jogo** na aba PokéIdle, com a sua conta.
2. **Entre nas lives**: aba *Lives* → *Login das lives*. Abre uma janela do Chrome normal; entre na Twitch e na Kick e feche a janela. O app traz a sessão sozinho. (O Google recusa login dentro de aplicativos como este, por isso o login é feito no Chrome. É preciso ter o Chrome instalado.)
3. **Escolha uma área de caça** no mapa do jogo. A partir daí o app cuida da rotina.

## O que ele faz

| Aba | O que tem |
|---|---|
| **Resumo** | Nível, XP por hora, previsão de nível, estoque em horas, bônus ativos, consumo de CPU e memória |
| **Caça** | Estimativa de XP por hora de cada área liberada, teste real de uma área, troca de área, melhor equipe, evolução, Oferenda |
| **Mercado** | Venda das pedras que sobram e radar de flip no Mercado da Comunidade |
| **Lives** | Canais oficiais ao vivo, pontos da Kick, resgate de bônus, abrir e fechar cada live |
| **Auto** | Interruptores das automações |
| **Histórico** | Tudo o que o app e as automações fizeram; clique numa entrada para ver o resumo |
| **Ajustes** | Tetos de estoque, regra do que fica na Coleção, limites de lives, orçamento do flip |

### Automações

- **Proteção contra parada**: personagem 5 minutos parado no Centro sem você pedir → cura a equipe, repõe o estoque e volta para a última área.
- **Proteção das automações do jogo**: religa bola, poção, revive e volta à caça se desligarem.
- **Recompra**: mantém poções, revives e Ultra Balls pelo consumo medido, até os tetos configurados.
- **Depot**: guarda na Coleção shiny, potência, qualidade ou nota altas e algumas reservas por espécie; vende o resto ao NPC.
- **Passe diário**: resgata a recompensa grátis.
- **Melhor área automática**: quando uma região libera, testa a melhor candidata por alguns minutos e só fica se medir mais XP.
- **Lives**: abre os canais oficiais que entram ao vivo e fecha os que saem.
- **Kick**: troca pontos de canal por horas de +15% de XP.
- **Pedras**: anuncia no mercado as que sobram.
- **Flip** (desligado por padrão): compra anúncios baratos e reanuncia. Usa seus Coins e pode dar prejuízo.

Cada ação ou automação que muda alguma coisa pede **duas confirmações na primeira vez**; depois de aceita, não pergunta mais. Em *Ajustes* há um botão para voltar a perguntar. Sair do app sempre pergunta.

## Consumo

- O **X da janela** e o botão **Ocultar hub** somem com a janela; tudo continua rodando. Volte pelo ícone ao lado do relógio ou com **Ctrl+Alt+P**. Passar o mouse no ícone mostra o consumo; o botão direito detalha por aba.
- Com o hub oculto o jogo para de desenhar e a caça continua.
- Cada live aberta custa perto de 2,5% de uma CPU de 4 núcleos. Dá para limitar em *Ajustes* → *Lives*, mas menos lives é menos bônus.
- Fechar o app no meio de uma caça conta como derrota no jogo. Use *Ir ao Centro* antes de sair.

## Configuração

O que muda com frequência está na aba *Ajustes*. O arquivo `config.json` guarda o resto: a lista de canais oficiais (`twitch`, `kick`), o intervalo de checagem das lives (`pollMinutes`) e os valores padrão.

`"debugPort"` liga uma porta de controle local (só `127.0.0.1`) usada pelos scripts da pasta `tools/`. Vem desligada (`0`). Para ligar só na sua máquina, crie `config.user.json` com `{ "debugPort": 9333 }`.

## Onde ficam seus dados

Nada sai da sua máquina. Sessões de login, ajustes e histórico ficam em:

- versão baixada: `%APPDATA%\pokeidle-desk`
- pelo código-fonte: na própria pasta do projeto (`chrome-login/`, `settings.json`, `history.json`, `config.user.json`), todos fora do Git

## Limitações conhecidas

- Só foi usado no Windows.
- O app lê a tela do jogo. Uma atualização do PokéIdle que mude a interface pode quebrar uma rotina até o app ser ajustado; quando uma leitura falha, ele não age (por exemplo, não vende nada se não conseguir ler uma carta do Depot).
- A estimativa de áreas é um cálculo calibrado pelo ritmo atual. Use *Testar* para medir de verdade.
- Em áreas onde o dano não dá trégua, sair para o Centro usa "Desistir do Combate", que custa 10% do XP do nível.
- Ainda sem uso real: execução de um flip, evolução, Oferenda e o resgate do Passe pelo botão.

## Gerar a versão para distribuir

```bash
npm run dist
```

Cria `dist/PokeIdle Desk-win32-x64` e o `.zip` correspondente, sem nenhum dado pessoal.
