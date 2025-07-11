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
let myRoleInfo = null;
let dayPhaseTimer = null;
let isDead = false;

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
const dayTime = document.getElementById('dayTime');
const nightTime = document.getElementById('nightTime');

// 役職チャット用サイドバー（ゲーム開始後に表示）
let sidebar = document.getElementById('sidebar');
if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.style.position = 'fixed';
    sidebar.style.left = '0';
    sidebar.style.top = '0';
    sidebar.style.width = '200px';
    sidebar.style.height = '100%';
    sidebar.style.background = '#f0f0f0';
    sidebar.style.borderRight = '1px solid #ccc';
    sidebar.style.padding = '16px 8px';
    sidebar.style.overflowY = 'auto';
    sidebar.style.display = 'none'; // 初期は非表示
    sidebar.innerHTML = '<h3>役職チャット</h3><div id="roleChats"></div>';
    document.body.appendChild(sidebar);
}
const roleChats = document.getElementById('roleChats') || sidebar.querySelector('#roleChats');

// 役職設定UI要素
const villagerCount = document.getElementById('villagerCount');
const werewolfCount = document.getElementById('werewolfCount');
const seerCount = document.getElementById('seerCount');
const knightCount = document.getElementById('knightCount');
const mediumCount = document.getElementById('mediumCount');
const totalRoles = document.getElementById('totalRoles');
const roleExplanation = document.getElementById('roleExplanation');
const roleExplanationContent = document.getElementById('roleExplanationContent');
const readyBtn = document.getElementById('readyBtn');
const readyStatus = document.getElementById('readyStatus');

// 役職数の合計を計算
function updateTotalRoles() {
    const total = parseInt(villagerCount.value) + parseInt(werewolfCount.value) + 
                  parseInt(seerCount.value) + parseInt(knightCount.value) + parseInt(mediumCount.value);
    totalRoles.textContent = `合計: ${total}人`;
}

// 役職数変更時のイベントリスナー
[villagerCount, werewolfCount, seerCount, knightCount, mediumCount].forEach(input => {
    if (input) {
        input.addEventListener('input', updateTotalRoles);
    }
});

// ルーム作成
createRoomBtn.onclick = () => {
    const name = playerNameInput.value.trim();
    if (!name) return alert('名前を入力してください');
    socket.emit('create_room', {
        host_name: name,
        role_distribution: { '村人': 8, '人狼': 2, '占い師': 1, '騎士': 1, '霊媒師': 1 },
        discussion_time: 300,
        day_time: dayTime ? parseInt(dayTime.value) : 5,
        night_time: nightTime ? parseInt(nightTime.value) : 2
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
    
    // プレイヤーリストを更新
    if (data.players) {
        playerList.innerHTML = '参加者: ' + data.players.map(p => p.name).join(', ');
    }

    if (data.player_id && (!playerId || playerId === "")) {
        playerId = data.player_id;
    }

    // 1. ルーム入室時に自分の名前をmyNameに保存し、myNameAreaに表示。
    let myName = '';
    if (playerNameInput.value) myName = playerNameInput.value.trim();
    const myNameArea = document.getElementById('myNameArea');
    if (myNameArea) myNameArea.textContent = `あなた：${myName}`;

    // 2. 役職名・説明
    const sidebarRoleInfo = document.getElementById('sidebarRoleInfo');
    if (myRoleInfo) {
        updateSidebarRoleInfo(myRoleInfo.role, myRoleInfo.description);
    }

    // 3. 生存者一覧
    const alivePlayers = document.getElementById('alivePlayers');
    if (alivePlayers && data.players) {
        updateAlivePlayers(data.players.map(p => p.name));
    }
});

// プレイヤー退出
socket.on('player_left', data => {
    console.log('player_left event received:', data);
    
    // プレイヤーリストを更新
    if (data.players) {
        playerList.innerHTML = '参加者: ' + data.players.map(p => p.name).join(', ');
    }

    // 4. 生存者一覧
    const alivePlayers = document.getElementById('alivePlayers');
    if (alivePlayers && playerList.textContent) {
        const names = playerList.textContent.replace('参加者: ', '').split(',').map(s => s.trim()).filter(Boolean);
        updateAlivePlayers(names);
    }
});

// ゲームスタートボタンの処理
if (startGameBtn) {
    startGameBtn.onclick = () => {
        if (!isHost || !roomId) {
            alert('ゲームを開始できません');
            return;
        }
        
        // 役職設定を取得
        const roleDistribution = {
            '村人': parseInt(villagerCount.value),
            '人狼': parseInt(werewolfCount.value),
            '占い師': parseInt(seerCount.value),
            '騎士': parseInt(knightCount.value),
            '霊媒師': parseInt(mediumCount.value)
        };
        
        const totalRoleCount = Object.values(roleDistribution).reduce((a, b) => a + b, 0);
        
        // 最低人数チェック（クライアントサイド）
        if (totalRoleCount < 3) {
            alert('ゲームを開始するには最低3人必要です');
            return;
        }
        
        socket.emit('start_game', { 
            room_id: roomId,
            role_distribution: roleDistribution,
            day_time: dayTime ? parseInt(dayTime.value) : 5,
            night_time: nightTime ? parseInt(nightTime.value) : 2
        });
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
    // 役職説明フェーズなら必ず役職説明画面・サイドバーを表示
    if (data.phase === 'role_explanation') {
        // 役職情報がなければplayers配列から自分の情報を探す
        if (!myRoleInfo && data.players) {
            const me = data.players.find(p => p.id === playerId);
            if (me) {
                myRoleInfo = {
                    role: me.role,
                    description: '', // 必要ならクライアント側でROLE_DESCRIPTIONSを参照
                    partners: []
                };
            }
        }
        if (myRoleInfo) {
            if (roleExplanation && roleExplanationContent) {
                roleExplanationContent.innerHTML = `
                    <h3>${myRoleInfo.role}</h3>
                    <p>${myRoleInfo.description}</p>
                    ${myRoleInfo.partners && myRoleInfo.partners.length > 0 ? `<p><strong>相方:</strong> ${myRoleInfo.partners.join(', ')}</p>` : ''}
                `;
                roleExplanation.style.display = '';
                sidebar.style.display = '';
                document.getElementById('app').style.marginLeft = '220px';
                updateRoleChats(myRoleInfo.role);
            }
        }
    }

    if (!playerId && data.players) {
        const me = data.players.find(p => p.name === playerNameInput.value.trim());
        if (me) playerId = me.id;
    }
});

// 役職配布
socket.on('role_assigned', data => {
    myRoleInfo = data;
    role = data.role;
    
    // 役職説明画面を表示
    if (roleExplanation && roleExplanationContent) {
        roleExplanationContent.innerHTML = `
            <h3>${data.role}</h3>
            <p>${data.description}</p>
            ${data.partners && data.partners.length > 0 ? `<p><strong>相方:</strong> ${data.partners.join(', ')}</p>` : ''}
        `;
        roleExplanation.style.display = '';
        
        // 役職チャットサイドバーを表示
        sidebar.style.display = '';
        document.getElementById('app').style.marginLeft = '220px';
        
        // 役職に応じたチャットリンクを追加
        updateRoleChats(data.role);
    }
    
    // 従来の表示も更新
    roleInfo.textContent = `あなたの役職: ${data.role}\n${data.description}`;
    if (data.partners && data.partners.length > 0) {
        roleInfo.textContent += `\n相方: ${data.partners.join(', ')}`;
    }

    // 2. 役職名・説明
    updateSidebarRoleInfo(data.role, data.description);
    updateMyRoleArea(data.role);
});

// フェーズ変更
socket.on('phase_changed', data => {
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
    if (data.phase === 'voting') {
        showVotingUI();
    }
    if (data.phase === 'day') {
        const dayTimeSec = (data.day_time || 5) * 60;
        showDayPhaseTimer(dayTimeSec);
    }
    if (data.phase === 'night' && role !== '人狼') {
        setAudioMute(true);
    } else {
        setAudioMute(false);
    }

    // 4. 昼フェーズ専用画面
    const dayPhaseScreen = document.getElementById('dayPhaseScreen');
    const dayPhaseTitle = document.getElementById('dayPhaseTitle');
    const dayPhaseTimerElem = document.getElementById('dayPhaseTimer');

    if (data.phase === 'day') {
        showDayPhaseScreen(data.day_num || 1, (data.day_time || 5) * 60);
        updateSidebarRoleInfo(role, myRoleInfo ? myRoleInfo.description : '');
        updateMyRoleArea(role);
    } else {
        hideDayPhaseScreen();
    }
    if (data.phase === 'voting') {
        showVotePhaseScreen((data.voting_time || 60));
        updateSidebarRoleInfo(role, myRoleInfo ? myRoleInfo.description : '');
        updateMyRoleArea(role);
    } else {
        hideVotePhaseScreen();
    }
    // 生存者一覧更新（サーバーから生存者リストをもらうのが理想だが、現状はplayerListから取得）
    if (alivePlayers && playerList.textContent) {
        const names = playerList.textContent.replace('参加者: ', '').split(',').map(s => s.trim()).filter(Boolean);
        updateAlivePlayers(names);
    }
});

function showDayPhaseTimer(seconds) {
    if (dayPhaseTimer) clearInterval(dayPhaseTimer);
    let remain = seconds;
    phaseInfo.innerHTML = `フェーズ: 昼（残り <span id="dayTimer">${formatTime(remain)}</span>）`;
    dayPhaseTimer = setInterval(() => {
        remain--;
        const timerSpan = document.getElementById('dayTimer');
        if (timerSpan) timerSpan.textContent = formatTime(remain);
        if (remain <= 0) {
            clearInterval(dayPhaseTimer);
            // 投票UIはサーバーからphase_changed: votingが来たときに表示
        }
    }, 1000);
}
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

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
    if (data.executed_players && data.executed_players.length > 0) {
        if (data.executed_players.includes(playerId)) {
            isDead = true;
            setAudioMute(true);
            showUnmuteButton();
            alert('あなたは処刑されました。マイクは自動でミュートされました。');
        }
    }
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

// 役職に応じたチャットリンクを更新
function updateRoleChats(playerRole) {
    if (!roleChats) return;
    
    roleChats.innerHTML = '';
    
    // 人狼の場合
    if (playerRole === '人狼') {
        const werewolfChat = document.createElement('div');
        werewolfChat.innerHTML = `
            <button onclick="openRoleChat('werewolf')" style="width: 100%; margin: 5px 0; padding: 8px; background: #d32f2f; color: white; border: none; border-radius: 3px; cursor: pointer;">
                人狼グループチャット
            </button>
            <button onclick="openRoleChat('werewolf_vote')" style="width: 100%; margin: 5px 0; padding: 8px; background: #7b1fa2; color: white; border: none; border-radius: 3px; cursor: pointer;">
                殺害対象投票
            </button>
        `;
        roleChats.appendChild(werewolfChat);
    }
    
    // 占い師の場合
    if (playerRole === '占い師') {
        const seerChat = document.createElement('div');
        seerChat.innerHTML = `
            <button onclick="openRoleChat('seer')" style="width: 100%; margin: 5px 0; padding: 8px; background: #1976d2; color: white; border: none; border-radius: 3px; cursor: pointer;">
                占い結果確認
            </button>
        `;
        roleChats.appendChild(seerChat);
    }
    
    // 霊媒師の場合
    if (playerRole === '霊媒師') {
        const mediumChat = document.createElement('div');
        mediumChat.innerHTML = `
            <button onclick="openRoleChat('medium')" style="width: 100%; margin: 5px 0; padding: 8px; background: #388e3c; color: white; border: none; border-radius: 3px; cursor: pointer;">
                霊媒結果確認
            </button>
        `;
        roleChats.appendChild(mediumChat);
    }
    
    // 騎士の場合
    if (playerRole === '騎士') {
        const knightChat = document.createElement('div');
        knightChat.innerHTML = `
            <button onclick="openRoleChat('knight')" style="width: 100%; margin: 5px 0; padding: 8px; background: #f57c00; color: white; border: none; border-radius: 3px; cursor: pointer;">
                守護対象選択
            </button>
        `;
        roleChats.appendChild(knightChat);
    }
}

// 役職チャットを開く
function openRoleChat(chatType) {
    // この機能は後で実装
    alert(`${chatType} チャットを開きます（機能は後で実装予定）`);
}

function showVotingUI() {
    if (!voteSection) return;
    voteSection.style.display = '';
    voteButtons.innerHTML = '';
    // 仮実装: プレイヤーリストから生存者のみ投票ボタンを生成
    const names = playerList.textContent.replace('参加者: ', '').split(',').map(s => s.trim());
    names.forEach(name => {
        if (name && name !== playerNameInput.value.trim()) {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.onclick = () => {
                socket.emit('submit_vote', { room_id: roomId, target_name: name });
                voteButtons.innerHTML = '投票済み';
            };
            voteButtons.appendChild(btn);
        }
    });
}

function showUnmuteButton() {
    let btn = document.getElementById('unmuteBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'unmuteBtn';
        btn.textContent = 'マイク解除';
        btn.onclick = () => setAudioMute(false);
        audioSection.appendChild(btn);
    }
}

// 準備完了ボタンの処理
if (readyBtn) {
    readyBtn.onclick = () => {
        socket.emit('player_ready', { room_id: roomId });
        readyBtn.disabled = true;
        readyBtn.textContent = '準備完了済み';
    };
}

// 準備完了状況の更新
socket.on('ready_status', data => {
    if (readyStatus) {
        readyStatus.innerHTML = `
            <p>準備完了: ${data.ready_count} / ${data.total_count}</p>
            <p>待機中: ${data.waiting_players.join(', ')}</p>
        `;
    }
});

// 全員準備完了でゲーム開始
socket.on('all_ready', data => {
    if (roleExplanation) {
        roleExplanation.style.display = 'none';
    }
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
});

// ページロード時に音声取得
window.onload = () => {
    startAudio();
}; 

// 2. 役職名・説明
function updateSidebarRoleInfo(role, description) {
    if (sidebarRoleInfo) sidebarRoleInfo.innerHTML = `<b>${role || ''}</b><br><span style='font-size:13px;'>${description || ''}</span>`;
}

// 3. 生存者一覧
function updateAlivePlayers(aliveList) {
    if (alivePlayers) alivePlayers.innerHTML = aliveList.map(n => `<div>${n}</div>`).join('');
}

// 1. サイドバー役職名
const myRoleArea = document.getElementById('myRoleArea');
function updateMyRoleArea(role) {
    if (myRoleArea) myRoleArea.textContent = role ? `役職：${role}` : '';
}

// 2. 昼フェーズカウントダウン
function showDayPhaseScreen(dayNum, remainSec) {
    if (!dayPhaseScreen) return;
    dayPhaseScreen.style.display = 'flex';
    dayPhaseTitle.textContent = `${dayNum}日目 昼`;
    updateDayPhaseTimer(remainSec);
    gameSection.style.display = 'none';
    sidebar.style.display = '';
}
function updateDayPhaseTimer(sec) {
    if (dayPhaseTimer) clearInterval(dayPhaseTimer);
    let remain = sec;
    if (dayPhaseTimerElem) dayPhaseTimerElem.textContent = `残り ${formatTime(remain)}`;
    dayPhaseTimer = setInterval(() => {
        remain--;
        if (dayPhaseTimerElem) dayPhaseTimerElem.textContent = `残り ${formatTime(remain)}`;
        if (remain <= 0) {
            clearInterval(dayPhaseTimer);
            hideDayPhaseScreen();
        }
    }, 1000);
}

// 3. 投票フェーズ専用画面
const votePhaseScreen = document.getElementById('votePhaseScreen');
const votePhaseTimerElem = document.getElementById('votePhaseTimer');
const votePhaseUI = document.getElementById('votePhaseUI');
let votePhaseTimer = null;
function showVotePhaseScreen(remainSec) {
    if (!votePhaseScreen) return;
    votePhaseScreen.style.display = 'flex';
    sidebar.style.display = '';
    updateVotePhaseTimer(remainSec);
    showVotingUI(votePhaseUI);
    gameSection.style.display = 'none';
}
function hideVotePhaseScreen() {
    if (votePhaseScreen) votePhaseScreen.style.display = 'none';
    gameSection.style.display = '';
}
function updateVotePhaseTimer(sec) {
    if (votePhaseTimer) clearInterval(votePhaseTimer);
    let remain = sec;
    if (votePhaseTimerElem) votePhaseTimerElem.textContent = `残り ${formatTime(remain)}`;
    votePhaseTimer = setInterval(() => {
        remain--;
        if (votePhaseTimerElem) votePhaseTimerElem.textContent = `残り ${formatTime(remain)}`;
        if (remain <= 0) {
            clearInterval(votePhaseTimer);
            hideVotePhaseScreen();
        }
    }, 1000);
}

// phase_changed修正
socket.on('phase_changed', data => {
    if (data.phase === 'day') {
        showDayPhaseScreen(data.day_num || 1, (data.day_time || 5) * 60);
        updateSidebarRoleInfo(role, myRoleInfo ? myRoleInfo.description : '');
        updateMyRoleArea(role);
    } else {
        hideDayPhaseScreen();
    }
    if (data.phase === 'voting') {
        showVotePhaseScreen((data.voting_time || 60));
        updateSidebarRoleInfo(role, myRoleInfo ? myRoleInfo.description : '');
        updateMyRoleArea(role);
    } else {
        hideVotePhaseScreen();
    }
    // ...生存者一覧更新など既存の処理...
});

socket.on('role_assigned', data => {
    myRoleInfo = data;
    role = data.role;
    updateSidebarRoleInfo(data.role, data.description);
    updateMyRoleArea(data.role);
    // ...既存の処理...
});

// 4. 昼フェーズ専用画面
function showDayPhaseScreen(dayNum, remainSec) {
    if (!dayPhaseScreen) return;
    dayPhaseScreen.style.display = 'flex';
    dayPhaseTitle.textContent = `${dayNum}日目 昼`;
    updateDayPhaseTimer(remainSec);
    gameSection.style.display = 'none';
}
function hideDayPhaseScreen() {
    if (dayPhaseScreen) dayPhaseScreen.style.display = 'none';
    gameSection.style.display = '';
}
function updateDayPhaseTimer(sec) {
    if (dayPhaseTimer) clearInterval(dayPhaseTimer);
    let remain = sec;
    dayPhaseTimer = setInterval(() => {
        if (dayPhaseTimer) {
            remain--;
            if (dayPhaseTimerElem) dayPhaseTimerElem.textContent = `残り ${formatTime(remain)}`;
            if (remain <= 0) {
                clearInterval(dayPhaseTimer);
                hideDayPhaseScreen();
            }
        }
    }, 1000);
} 