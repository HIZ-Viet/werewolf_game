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
let isHost = false;

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
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');

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
    console.log('room_created event received:', data);
    roomId = data.room_id;
    playerId = data.player_id;
    isHost = true; // ルーム作成者はホスト
    // 画面切り替えはplayer_joinedイベントで行う
});

// ルーム参加完了
socket.on('player_joined', data => {
    console.log('player_joined event received:', data);
    
    // ルームIDとプレイヤーIDを設定
    if (data.room_id) {
        roomId = data.room_id;
    }
    
    // ゲーム画面がまだ表示されていない場合、画面を切り替え
    if (entrySection.style.display !== 'none' && roomId) {
        entrySection.style.display = 'none';
        gameSection.style.display = '';
        roomInfo.textContent = `ルームID: ${roomId}`;
        
        // ホストの場合、ゲームスタートボタンを表示
        if (isHost && hostControls) {
            hostControls.style.display = '';
        }
    }
    
    // サイドバーに参加者を縦並びで表示
    if (sidebarPlayers && data.players) {
        sidebarPlayers.innerHTML = '';
        data.players.forEach(p => {
            const div = document.createElement('div');
            div.textContent = p.name;
            div.style.padding = '4px 0';
            div.style.borderBottom = '1px solid #ddd';
            sidebarPlayers.appendChild(div);
        });
    }
    
    // プレイヤーリストを更新
    if (data.players) {
        playerList.innerHTML = '参加者: ' + data.players.map(p => p.name).join(', ');
    }
});

// プレイヤー退出
socket.on('player_left', data => {
    console.log('player_left event received:', data);
    
    // サイドバーに参加者を縦並びで表示
    if (sidebarPlayers && data.players) {
        sidebarPlayers.innerHTML = '';
        data.players.forEach(p => {
            const div = document.createElement('div');
            div.textContent = p.name;
            div.style.padding = '4px 0';
            div.style.borderBottom = '1px solid #ddd';
            sidebarPlayers.appendChild(div);
        });
    }
    
    // プレイヤーリストを更新
    if (data.players) {
        playerList.innerHTML = '参加者: ' + data.players.map(p => p.name).join(', ');
    }
});

// ゲームスタートボタンの処理
if (startGameBtn) {
    startGameBtn.onclick = () => {
        if (!isHost || !roomId) {
            alert('ゲームを開始できません');
            return;
        }
        
        // 最低人数チェック（クライアントサイド）
        const playerCount = sidebarPlayers ? sidebarPlayers.children.length : 0;
        if (playerCount < 3) {
            alert('ゲームを開始するには最低3人必要です');
            return;
        }
        
        socket.emit('start_game', { room_id: roomId });
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'ゲーム開始中...';
    };
}

// ゲーム開始
socket.on('game_started', data => {
    console.log('game_started event received:', data);
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
    
    // ゲームスタートボタンを非表示
    if (hostControls) {
        hostControls.style.display = 'none';
    }
    
    // 投票UIや役職UIの初期化
    if (voteSection) {
        voteSection.style.display = '';
    }
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

// エラーハンドリング
socket.on('error', data => {
    console.error('Server error:', data);
    alert(data.message || 'エラーが発生しました');
    
    // ゲームスタートボタンを再有効化
    if (startGameBtn && startGameBtn.disabled) {
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'ゲーム開始';
    }
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