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
2. **Entre nas lives**: aba *Lives* → *Login das lives*. Abre uma janela do Chrome normal (ou do Edge, se não houver Chrome); entre na Twitch e na Kick e feche a janela. O app traz a sessão sozinho. (O Google recusa login dentro de aplicativos como este, por isso o login é feito no navegador.)
3. **Escolha uma área de caça** no mapa do jogo.
4. **Escolha as automações** na aba *Auto*. Numa instalação nova só vêm ligadas as que não gastam nem vendem nada (proteções, lives e Passe). Recompra, venda do Depot, pedras, Kick, melhor área e flip vêm **desligadas**: ligue as que quiser.

O jogo precisa estar **em português**: o app lê os textos da tela nesse idioma.

## O que ele faz

| Aba | O que tem |
|---|---|
| **Resumo** | Nível, XP por hora, previsão de nível, estoque em horas, bônus ativos, rank do PvP, consumo de CPU e memória |
| **Caça** | Estimativa de XP por hora de cada área liberada, teste real de uma área, troca de área, melhor equipe, evolução, Oferenda |
| **Mercado** | Venda das pedras que sobram e radar de flip no Mercado da Comunidade |
| **Lives** | Canais oficiais ao vivo, preferidos da Kick, pontos, resgate de bônus, abrir e fechar cada live |
| **Auto** | Interruptores das automações |
| **Histórico** | Tudo o que o app e as automações fizeram; clique numa entrada para ver o resumo |
| **Ajustes** | Tetos de estoque, regra do que fica na Coleção, limites de lives, orçamento do flip |

### Automações

- **Proteção contra parada**: personagem 5 minutos parado no Centro sem você pedir → cura a equipe e volta para a última área (só repõe o estoque se a Recompra estiver ligada).
- **Proteção das automações do jogo**: religa bola, poção, revive e volta à caça se desligarem. Só religa o que já viu ligado na sua conta: o que você nunca ligou continua desligado.
- **Recompra**: mantém poções, revives e Ultra Balls pelo consumo medido, até os tetos configurados. A poção acompanha o HP do pokémon: Hyper, Ultimate e, acima de 10.000 de HP, Golden.
- **Depot**: guarda na Coleção shiny, potência, qualidade ou nota altas e algumas reservas por espécie; vende o resto ao NPC, carta a carta e só as que acabou de conferir (nunca pelo "vender tudo").
- **Passe diário**: resgata a recompensa grátis.
- **Melhor área automática**: quando uma região libera, testa a melhor candidata por alguns minutos e só fica se medir mais XP.
- **Lives**: abre os canais oficiais que entram ao vivo e fecha os que saem. A lista de canais oficiais é lida do próprio jogo (as janelas *Bônus Twitch* e *Bônus na Kick*), então canal novo entra sozinho. Na Kick mantém só 2 abertas (veja abaixo).
- **Kick**: troca pontos de canal por horas de +15% de XP. Se um resgate falhar, o canal espera 30 minutos; só 4 falhas seguidas desligam a automação.
- **PvP**: confere se a busca do Ranqueado continua e religa a fila automática do jogo (recurso VIP) quando ela cai. Perder no PvP não custa XP, só PR. O app não mexe na sua equipe de PvP.
- **Pedras**: anuncia no mercado as que sobram.
- **Flip**: compra anúncios baratos e reanuncia. Usa seus Coins e pode dar prejuízo.

Vêm ligadas: as duas proteções, as lives e o Passe. As demais gastam Coins, vendem pokémon ou trocam pontos, e por isso vêm desligadas.

Cada ação ou automação que muda alguma coisa pede **duas confirmações na primeira vez**; depois de aceita, não pergunta mais. Em *Ajustes* há um botão para voltar a perguntar. Sair do app sempre pergunta.

### Kick: só 2 canais contam por vez

Pelo que foi medido em outubro de 2026, a Kick só soma pontos de canal em **2 lives ao mesmo tempo** por conta: com seis abertas, só duas subiam. Por isso o app mantém 2 lives da Kick abertas e fecha as demais.

Na aba *Lives* você marca os seus canais **preferidos**. Ficam abertas as preferidas que estiverem ao vivo, na ordem em que você marcou. Se uma preferida estiver offline, a vaga vai para a próxima; se não houver preferida ao vivo, entra outro canal oficial que esteja ao vivo, de modo que as 2 vagas fiquem sempre ocupadas enquanto houver live. A Twitch não tem esse limite.

### Quando o app não reconhece o jogo

Se o jogo estiver em outro idioma, ou se uma atualização mudar a tela a ponto de o app não conseguir ler a ficha do treinador, o estoque ou os controles de caça, **todas as automações que agem no jogo ficam travadas** e um alerta vermelho no topo do painel diz o motivo. Nada é comprado nem vendido nesse estado.

O app foi feito e testado numa única conta, com VIP e nível alto. Em conta sem VIP ou de nível baixo ele mostra um aviso no *Resumo*; confira os tetos e a reserva de Coins em *Ajustes* antes de ligar a recompra.

### Versão nova

O app consulta a página de versões deste repositório ao abrir e a cada 6 horas. Havendo versão mais nova, aparece um aviso verde no topo do painel; clicar abre a página de download. Ele não baixa nem instala nada sozinho.

## Consumo

- O **X da janela** e o botão **Ocultar hub** somem com a janela; tudo continua rodando. Volte pelo ícone ao lado do relógio ou com **Ctrl+Alt+P**. Passar o mouse no ícone mostra o consumo; o botão direito detalha por aba.
- Com o hub oculto o jogo para de desenhar e a caça continua.
- As lives da Kick tocam em 160p por padrão (*Ajustes* → *Lives*); a Twitch, em 160p sempre.
- Cada live aberta custa perto de 2% de uma CPU de 4 núcleos. Na Twitch dá para limitar em *Ajustes* → *Lives*, mas menos lives é menos bônus.
- Fechar o app no meio de uma caça conta como derrota no jogo. Use *Ir ao Centro* antes de sair.

## Configuração

O que muda com frequência está na aba *Ajustes*. O arquivo `config.json` guarda o resto: o intervalo de checagem das lives (`pollMinutes`), os valores padrão e uma lista inicial de canais oficiais (`twitch`, `kick`), usada só até o app ler a lista do jogo pela primeira vez.

`"debugPort"` liga uma porta de controle local (só `127.0.0.1`) usada pelos scripts da pasta `tools/`. Vem desligada (`0`). Para ligar só na sua máquina, crie `config.user.json` com `{ "debugPort": 9333 }` — na versão baixada, dentro de `%APPDATA%pokeidle-desk`; pelo código-fonte, na pasta do projeto. Na versão baixada o `config.json` fica embutido no programa: o que você pode mudar é o que está na aba *Ajustes*.

## Onde ficam seus dados

O app não envia seus dados a lugar nenhum. Além do jogo e das lives que ele abre, a única consulta que faz é a de versão nova, ao GitHub. Sessões de login, ajustes e histórico ficam em:

- versão baixada: `%APPDATA%\pokeidle-desk`
- pelo código-fonte: na própria pasta do projeto (`chrome-login/`, `settings.json`, `history.json`, `config.user.json`), todos fora do Git

## Limitações conhecidas

- Só foi usado no Windows, e numa única conta (VIP, nível alto, jogo em português).
- O app lê a tela do jogo. Uma atualização do PokéIdle que mude a interface pode quebrar uma rotina até o app ser ajustado; quando uma leitura falha, ele não age (por exemplo, não vende nada se não conseguir ler uma carta do Depot).
- A estimativa de áreas é um cálculo calibrado pelo ritmo atual. Use *Testar* para medir de verdade.
- Links e janelas que saem do jogo, da Twitch, da Kick ou do Discord abrem no seu navegador, não dentro do app.
- A Kick precisa estar em português para o app ler os pontos e resgatar.
- Em áreas onde o dano não dá trégua, sair para o Centro usa "Desistir do Combate", que custa 10% do XP do nível.
- Ainda sem uso real: execução de um flip, evolução, Oferenda e o resgate do Passe pelo botão.

## Gerar a versão para distribuir

```bash
npm run dist
```

Cria `dist/PokeIdle Desk-win32-x64` e o `.zip` correspondente, sem nenhum dado pessoal.
