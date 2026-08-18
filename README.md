# Chat Livre — Salas com voz e compartilhamento de tela

Site de salas de bate-papo em tempo real com:
- 💬 Chat de texto por sala
- 🎤 Voz (microfone) via WebRTC
- 🖥️ Compartilhamento de tela via WebRTC
- 👥 Lista de participantes e salas ativas ao vivo

## Como funciona
- **Servidor** (Node.js + Express + Socket.io): gerencia as salas e faz a
  "apresentação" entre os navegadores (sinalização WebRTC). As mensagens de
  texto passam pelo servidor; **áudio e tela vão direto entre os navegadores**
  (peer-to-peer), sem passar pelo servidor.
- **Cliente** (HTML/CSS/JS puro): interface do site.

## Rodando localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18+).

```bash
cd chat-livre
npm install
npm start
```

Acesse **http://localhost:3000** no navegador. Para testar com outra pessoa
na mesma rede, use o IP da sua máquina, ex: `http://192.168.0.10:3000`
(pode ser necessário liberar a porta 3000 no firewall).

## Publicando na internet (para qualquer pessoa acessar)

Como é um servidor Node.js, você precisa de uma hospedagem que rode Node
continuamente (não funciona em hospedagem de site estático). Opções fáceis
e com plano gratuito:

- **Render.com** — crie um "Web Service", conecte o repositório, comando de
  start `npm start`.
- **Railway.app** — similar ao Render, deploy automático a partir do GitHub.
- **Fly.io** ou uma **VPS própria** (mais controle, exige configurar HTTPS).

⚠️ Importante: em produção, use sempre **HTTPS**. Navegadores só liberam
acesso a microfone e compartilhamento de tela em páginas seguras (https://)
ou em localhost.

## Limitações desta versão (e como evoluir)

- **Conexão "mesh"**: cada participante se conecta diretamente aos outros.
  Funciona bem para salas pequenas (até ~6-8 pessoas simultâneas com voz/tela).
  Para salas maiores, o ideal é usar um SFU (ex: mediasoup, LiveKit, Janus).
- **TURN server**: o projeto usa apenas um servidor STUN público do Google.
  Em redes com firewall/NAT restritivo, a conexão de voz/tela pode falhar.
  Para maior confiabilidade, adicione um servidor TURN (ex: Twilio TURN,
  coturn próprio) no arquivo `public/app.js`, na constante `ICE_SERVERS`.
- **Sem persistência**: mensagens e salas existem só enquanto o servidor
  está rodando (em memória). Reiniciar o servidor limpa tudo.
- **Sem autenticação**: qualquer pessoa com o link pode entrar em qualquer
  sala digitando o nome dela — são salas "livres", como pedido.

## Estrutura de arquivos

```
chat-livre/
├── server.js          # servidor Express + Socket.io
├── package.json
└── public/
    ├── index.html      # interface
    ├── style.css        # estilo
    └── app.js           # lógica do chat + WebRTC
```
