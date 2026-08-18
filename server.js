const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Estrutura em memória: { nomeDaSala: { socketId: { name } } }
const rooms = {};

function getRoomList() {
  return Object.entries(rooms).map(([room, users]) => ({
    room,
    count: Object.keys(users).length
  }));
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let userName = null;

  // Envia lista de salas ativas assim que alguém conecta
  socket.emit('room-list', getRoomList());

  socket.on('list-rooms', () => {
    socket.emit('room-list', getRoomList());
  });

  socket.on('join-room', ({ room, name }) => {
    if (!room || !room.trim()) return;
    room = room.trim().slice(0, 60);
    userName = (name || 'Anônimo').trim().slice(0, 30) || 'Anônimo';
    currentRoom = room;

    socket.join(room);
    if (!rooms[room]) rooms[room] = {};
    rooms[room][socket.id] = { name: userName };

    // Avisa aos outros da sala que alguém entrou
    socket.to(room).emit('user-joined', { id: socket.id, name: userName });

    // Envia ao novo usuário a lista de quem já está na sala
    const others = Object.entries(rooms[room])
      .filter(([id]) => id !== socket.id)
      .map(([id, u]) => ({ id, name: u.name }));
    socket.emit('room-users', others);

    io.emit('room-list', getRoomList());

    io.to(room).emit('system-message', `${userName} entrou na sala.`);
  });

  socket.on('chat-message', ({ message }) => {
    if (!currentRoom || !message) return;
    io.to(currentRoom).emit('chat-message', {
      id: socket.id,
      name: userName,
      message: String(message).slice(0, 2000),
      time: Date.now()
    });
  });

  // Repassa sinalização WebRTC (offer/answer/ice candidates) diretamente ao destinatário
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('screen-share-status', ({ sharing }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('screen-share-status', { id: socket.id, sharing });
  });

  socket.on('mic-status', ({ on }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('mic-status', { id: socket.id, on });
  });

  socket.on('leave-room', () => leaveCurrentRoom());

  socket.on('disconnect', () => leaveCurrentRoom());

  function leaveCurrentRoom() {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom][socket.id]) {
      delete rooms[currentRoom][socket.id];
      socket.to(currentRoom).emit('user-left', { id: socket.id });
      socket.to(currentRoom).emit('system-message', `${userName} saiu da sala.`);
      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
      }
      socket.leave(currentRoom);
      io.emit('room-list', getRoomList());
      currentRoom = null;
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
