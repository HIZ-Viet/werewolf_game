// Socket.IOクライアント
const socket = io(window.location.origin, {
  path: "/socket.io/",
  transports: ["websocket", "polling"]
});
let localStream = null;
let peerConnections = {};
let roomId = null;
let playerId = null;
let role = null;

// UI要素
const entrySection = document.getElementById('entry-section');
const gameSection = document.getElementById('game-section');
const playerNameInput = document.getElementById('playerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const roomInfo = document.getElementById('roomInfo');
const phaseInfo = document.getElementById('phaseInfo');
const roleInfo = document.getElementById('roleInfo');
const playerList = document.getElementById('playerList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const voteSection = document.getElementById('voteSection');
const voteButtons = document.getElementById('voteButtons');
const audioSection = document.getElementById('audioSection');
const remoteAudio = document.getElementById('remoteAudio');

// サイドバー生成（なければ追加）
let sidebar = document.getElementById('sidebar');
if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.style.position = 'fixed';
    sidebar.style.left = '0';
    sidebar.style.top = '0';
    sidebar.style.width = '180px';
    sidebar.style.height = '100%';
    sidebar.style.background = '#f0f0f0';
    sidebar.style.borderRight = '1px solid #ccc';
    sidebar.style.padding = '16px 8px';
    sidebar.style.overflowY = 'auto';
    sidebar.innerHTML = '<h3>参加者</h3><div id="sidebarPlayers"></div>';
    document.body.appendChild(sidebar);
    // メイン画面を右にずらす
    document.getElementById('app').style.marginLeft = '200px';
}
const sidebarPlayers = document.getElementById('sidebarPlayers') || sidebar.querySelector('#sidebarPlayers');

// ルーム作成
createRoomBtn.onclick = () => {
    const name = playerNameInput.value.trim();
    if (!name) return alert('名前を入力してください');
    socket.emit('create_room', {
        host_name: name,
        role_distribution: { '村人': 8, '人狼': 2, '占い師': 1, '騎士': 1, '霊媒師': 1 },
        discussion_time: 300
    });
};

// ルーム参加
joinRoomBtn.onclick = () => {
    const name = playerNameInput.value.trim();
    const rid = roomIdInput.value.trim();
    if (!name || !rid) return alert('名前とルームIDを入力');
    socket.emit('join_room', { room_id: rid, player_name: name });
};

// ルーム作成完了
socket.on('room_created', data => {
    roomId = data.room_id;
    playerId = data.player_id;
    entrySection.style.display = 'none';
    gameSection.style.display = '';
    roomInfo.textContent = `ルームID: ${roomId}`;
});

// ルーム参加完了
socket.on('player_joined', data => {
    // サーバーから返されたroom_idとplayer_idで上書き
    roomId = data.room_id || roomId;
    if (!playerId) {
        playerId = data.player_id;
        entrySection.style.display = 'none';
        gameSection.style.display = '';
        roomInfo.textContent = `ルームID: ${roomId}`;
    }
    // サイドバーに参加者を縦並びで表示
    if (sidebarPlayers) {
        sidebarPlayers.innerHTML = '';
        data.players.forEach(p => {
            const div = document.createElement('div');
            div.textContent = p.name;
            div.style.padding = '4px 0';
            sidebarPlayers.appendChild(div);
        });
    }
    playerList.innerHTML = '参加者: ' + data.players.map(p => p.name).join(', ');
});

// ゲーム開始
// (ホストが開始ボタンを押すUIは省略、サーバー側でstart_gameをemit)
socket.on('game_started', data => {
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
    // 投票UIや役職UIの初期化
});

// 役職配布
socket.on('role_assigned', data => {
    role = data.role;
    roleInfo.textContent = `あなたの役職: ${data.role}\n${data.description}`;
    if (data.partners && data.partners.length > 0) {
        roleInfo.textContent += `\n相方: ${data.partners.join(', ')}`;
    }
});

// フェーズ変更
socket.on('phase_changed', data => {
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
    // 音声ミュート制御など
    if (data.phase === 'night' && role !== '人狼') {
        setAudioMute(true);
    } else {
        setAudioMute(false);
    }
});

// チャット
sendChatBtn.onclick = () => {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('send_message', { room_id: roomId, message: msg });
    chatInput.value = '';
};
socket.on('chat_message', data => {
    const div = document.createElement('div');
    div.textContent = `${data.player_name}: ${data.message}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// 投票UI
socket.on('vote_submitted', data => {
    // 投票状況の更新
});
socket.on('voting_result', data => {
    // 投票結果の表示
});

// WebRTC音声通話（雛形）
async function startAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // ここで各peerに音声を送信するWebRTCロジックを追加
    } catch (e) {
        alert('マイクの利用が許可されていません');
    }
}
function setAudioMute(mute) {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !mute);
    }
}

// ページロード時に音声取得
window.onload = () => {
    startAudio();
}; 