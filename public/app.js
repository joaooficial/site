const socket = io();

// ---------- Estado ----------
let myId = null;
let myName = '';
let myRoom = '';
let micStream = null;
let screenStream = null;
let micOn = false;
let sharingScreen = false;

// peers[remoteId] = { pc: RTCPeerConnection, name, sharing }
const peers = {};

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// ---------- Elementos ----------
const lobby = document.getElementById('lobby');
const roomScreen = document.getElementById('roomScreen');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomListEl = document.getElementById('roomList');

const roomTitle = document.getElementById('roomTitle');
const roomCount = document.getElementById('roomCount');
const userList = document.getElementById('userList');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const micBtn = document.getElementById('micBtn');
const shareBtn = document.getElementById('shareBtn');
const leaveBtn = document.getElementById('leaveBtn');
const screenGrid = document.getElementById('screenGrid');

// ---------- Lobby ----------
socket.on('room-list', (rooms) => {
  roomListEl.innerHTML = '';
  if (!rooms.length) {
    roomListEl.innerHTML = '<li class="empty">Nenhuma sala ativa ainda.</li>';
    return;
  }
  rooms.forEach(({ room, count }) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(room)}</span><span>${count} online</span>`;
    li.onclick = () => { roomInput.value = room; };
    roomListEl.appendChild(li);
  });
});

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Anônimo';
  const room = roomInput.value.trim();
  if (!room) { roomInput.focus(); return; }
  myName = name;
  myRoom = room;
  enterRoom();
};

[nameInput, roomInput].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });
});

function enterRoom() {
  lobby.classList.add('hidden');
  roomScreen.classList.remove('hidden');
  roomTitle.textContent = '# ' + myRoom;
  socket.emit('join-room', { room: myRoom, name: myName });
  addSystemMessage(`Você entrou na sala "${myRoom}".`);
}

// ---------- Participantes ----------
socket.on('room-users', (others) => {
  others.forEach(u => addPeer(u.id, u.name, false));
  renderUserList();
});

socket.on('user-joined', ({ id, name }) => {
  addPeer(id, name, true); // nós iniciamos a conexão com quem chega depois de nós
  addSystemMessage(`${name} entrou na sala.`);
  renderUserList();
});

socket.on('user-left', ({ id }) => {
  removePeer(id);
  renderUserList();
});

socket.on('system-message', (text) => addSystemMessage(text));

socket.io.on('open', () => { myId = socket.id; });
socket.on('connect', () => { myId = socket.id; });

function renderUserList() {
  userList.innerHTML = '';
  const meLi = document.createElement('li');
  meLi.innerHTML = `<span class="dot"></span><span>${escapeHtml(myName)} (você)</span>`;
  userList.appendChild(meLi);

  Object.entries(peers).forEach(([id, p]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span><span>${escapeHtml(p.name)}</span><span class="tag">${p.sharing ? '🖥️' : ''}</span>`;
    userList.appendChild(li);
  });
  roomCount.textContent = `${Object.keys(peers).length + 1} online`;
}

// ---------- Chat de texto ----------
chatForm.onsubmit = (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  socket.emit('chat-message', { message });
  chatInput.value = '';
};

socket.on('chat-message', ({ id, name, message }) => {
  const mine = id === myId;
  const div = document.createElement('div');
  div.className = 'msg ' + (mine ? 'mine' : 'theirs');
  div.innerHTML = `<div class="author">${escapeHtml(name)}</div>${escapeHtml(message)}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------- Microfone ----------
micBtn.onclick = async () => {
  if (!micOn) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micOn = true;
      micBtn.classList.add('active');
      Object.values(peers).forEach(p => addTrackToPeer(p, micStream.getAudioTracks()[0], micStream));
      socket.emit('mic-status', { on: true });
    } catch (err) {
      alert('Não foi possível acessar o microfone: ' + err.message);
    }
  } else {
    micOn = false;
    micBtn.classList.remove('active');
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      Object.values(peers).forEach(p => removeTrackFromPeer(p, 'audio'));
    }
    socket.emit('mic-status', { on: false });
  }
};

// ---------- Compartilhamento de tela ----------
shareBtn.onclick = async () => {
  if (!sharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      sharingScreen = true;
      shareBtn.classList.add('active');
      showLocalScreenTile(screenStream);

      const track = screenStream.getVideoTracks()[0];
      Object.values(peers).forEach(p => addTrackToPeer(p, track, screenStream));
      socket.emit('screen-share-status', { sharing: true });

      track.onended = () => stopScreenShare();
    } catch (err) {
      // usuário cancelou o seletor de tela
    }
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  sharingScreen = false;
  shareBtn.classList.remove('active');
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    Object.values(peers).forEach(p => removeTrackFromPeer(p, 'video'));
  }
  removeScreenTile('me');
  socket.emit('screen-share-status', { sharing: false });
}

socket.on('screen-share-status', ({ id, sharing }) => {
  if (peers[id]) {
    peers[id].sharing = sharing;
    if (!sharing) removeScreenTile(id);
    renderUserList();
  }
});

// ---------- WebRTC ----------
function addPeer(id, name, initiator) {
  if (peers[id]) return;
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[id] = { pc, name, sharing: false };

  if (micOn && micStream) {
    micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
  }
  if (sharingScreen && screenStream) {
    screenStream.getTracks().forEach(t => pc.addTrack(t, screenStream));
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('signal', { to: id, data: { type: 'ice', candidate: e.candidate } });
    }
  };

  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') {
      playRemoteAudio(id, e.streams[0]);
    } else if (e.track.kind === 'video') {
      showRemoteScreenTile(id, name, e.streams[0]);
    }
  };

  if (initiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { type: 'offer', sdp: pc.localDescription } });
      } catch (err) { console.error(err); }
    };
  }
}

function removePeer(id) {
  const p = peers[id];
  if (!p) return;
  p.pc.close();
  delete peers[id];
  removeScreenTile(id);
  const audioEl = document.getElementById('audio-' + id);
  if (audioEl) audioEl.remove();
}

function addTrackToPeer(p, track, stream) {
  if (!track) return;
  const sender = p.pc.getSenders().find(s => s.track && s.track.kind === track.kind);
  if (sender) {
    sender.replaceTrack(track);
  } else {
    p.pc.addTrack(track, stream);
  }
}

function removeTrackFromPeer(p, kind) {
  const sender = p.pc.getSenders().find(s => s.track && s.track.kind === kind);
  if (sender) p.pc.removeTrack(sender);
}

socket.on('signal', async ({ from, data }) => {
  let p = peers[from];
  if (!p) {
    addPeer(from, 'Participante', false);
    p = peers[from];
  }
  const pc = p.pc;

  if (data.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', { to: from, data: { type: 'answer', sdp: pc.localDescription } });
  } else if (data.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if (data.type === 'ice') {
    try { await pc.addIceCandidate(data.candidate); } catch (err) { /* ignore */ }
  }
});

// ---------- Áudio remoto ----------
function playRemoteAudio(id, stream) {
  let audioEl = document.getElementById('audio-' + id);
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'audio-' + id;
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
}

// ---------- Tiles de tela ----------
function showLocalScreenTile(stream) {
  removeScreenTile('me');
  const tile = document.createElement('div');
  tile.className = 'screen-tile';
  tile.id = 'screen-me';
  tile.innerHTML = `<video autoplay muted playsinline></video><div class="label">Você (compartilhando)</div>`;
  tile.querySelector('video').srcObject = stream;
  screenGrid.appendChild(tile);
}

function showRemoteScreenTile(id, name, stream) {
  removeScreenTile(id);
  const tile = document.createElement('div');
  tile.className = 'screen-tile';
  tile.id = 'screen-' + id;
  tile.innerHTML = `<video autoplay playsinline></video><div class="label">${escapeHtml(name)}</div>`;
  tile.querySelector('video').srcObject = stream;
  screenGrid.appendChild(tile);
}

function removeScreenTile(id) {
  const tile = document.getElementById('screen-' + id);
  if (tile) tile.remove();
}

// ---------- Sair ----------
leaveBtn.onclick = () => {
  socket.emit('leave-room');
  Object.keys(peers).forEach(removePeer);
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  micOn = false; sharingScreen = false;
  micBtn.classList.remove('active');
  shareBtn.classList.remove('active');
  chatMessages.innerHTML = '';
  screenGrid.innerHTML = '';
  roomScreen.classList.add('hidden');
  lobby.classList.remove('hidden');
};

// ---------- Utils ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
