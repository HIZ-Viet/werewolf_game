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
let currentPhase = null;

// WebRTC設定
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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
const audioStatus = document.getElementById('audioStatus');
const muteBtn = document.getElementById('muteBtn');
const unmuteBtn = document.getElementById('unmuteBtn');
const enableAudioBtn = document.getElementById('enableAudioBtn');
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');
const dayTime = document.getElementById('dayTime');
const nightTime = document.getElementById('nightTime');
const updateSettingsBtn = document.getElementById('updateSettingsBtn');
const settingsUpdatedMsg = document.getElementById('settingsUpdatedMsg');

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

    // 新しいプレイヤーが参加した場合、WebRTC接続を確立
    if (data.player_id && data.player_id !== playerId && localStream) {
        createPeerConnection(data.player_id);
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
    
    // WebRTC接続のクリーンアップ
    if (data.player_id && peerConnections[data.player_id]) {
        const pc = peerConnections[data.player_id];
        pc.close();
        delete peerConnections[data.player_id];
        console.log('Closed WebRTC connection for player:', data.player_id);
        
        // プレイヤー専用の音声要素を削除
        const playerAudio = document.getElementById(`audio-${data.player_id}`);
        if (playerAudio) {
            playerAudio.remove();
        }
    }
    
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
// 投票フェーズ表示用エリア制御
const votePhaseArea = document.getElementById('votePhaseArea');
const votePhaseTitle = document.getElementById('votePhaseTitle');
const votePhaseTimerArea = document.getElementById('votePhaseTimerArea');
const votePhaseUI = document.getElementById('votePhaseUI');
const voteResultMsg = document.getElementById('voteResultMsg');
let votePhaseAreaTimer = null;
function showVotePhaseArea(remainSec, alivePlayers, runoffCandidates) {
    if (!votePhaseArea) return;
    votePhaseArea.style.display = '';
    votePhaseTitle.textContent = '投票フェーズ';
    voteResultMsg.textContent = '';
    showVotingButtons(alivePlayers, runoffCandidates);
    updateVotePhaseAreaTimer(remainSec);
}
function hideVotePhaseArea() {
    if (votePhaseArea) votePhaseArea.style.display = 'none';
    if (votePhaseAreaTimer) clearInterval(votePhaseAreaTimer);
    votePhaseUI.innerHTML = '';
    voteResultMsg.textContent = '';
}
function updateVotePhaseAreaTimer(sec) {
    if (votePhaseAreaTimer) clearInterval(votePhaseAreaTimer);
    let remain = sec;
    if (votePhaseTimerArea) votePhaseTimerArea.textContent = `残り ${formatTime(remain)}`;
    votePhaseAreaTimer = setInterval(() => {
        remain--;
        if (votePhaseTimerArea) votePhaseTimerArea.textContent = `残り ${formatTime(remain)}`;
        if (remain <= 0) {
            clearInterval(votePhaseAreaTimer);
        }
    }, 1000);
}
function showVotingButtons(alivePlayers, runoffCandidates) {
    votePhaseUI.innerHTML = '';
    let targetList = alivePlayers;
    if (runoffCandidates && Array.isArray(runoffCandidates) && runoffCandidates.length > 0) {
        targetList = runoffCandidates;
    }
    if (!targetList || !Array.isArray(targetList)) return;
    targetList.forEach(player => {
        if (player.id !== playerId) {
            const btn = document.createElement('button');
            btn.textContent = player.name;
            btn.onclick = () => {
                socket.emit('submit_vote', { room_id: roomId, target_id: player.id });
                votePhaseUI.innerHTML = '投票済み';
            };
            votePhaseUI.appendChild(btn);
        }
    });
}
// phase_changedで投票フェーズ表示
socket.on('phase_changed', data => {
    currentPhase = data.phase;
    phaseInfo.textContent = `フェーズ: ${data.phase}`;
    if (data.phase === 'voting') {
        showVotePhaseArea((data.voting_time || 60), data.alive_players || [], data.runoff_candidates || []);
    } else {
        hideVotePhaseArea();
    }
    if (data.phase === 'day') {
        const dayTimeSec = (data.day_time || 5) * 60;
        showDayPhaseArea(data.day_num || 1, dayTimeSec);
    } else {
        hideDayPhaseArea();
    }
    if (data.phase === 'night' && role !== '人狼') {
        setAudioMute(true);
    } else {
        setAudioMute(false);
    }
    // 生存者一覧更新
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
// 投票結果表示用
function showVoteResult(message) {
    if (!votePhaseUI) return;
    votePhaseUI.innerHTML = `<div style="font-size:1.5rem;margin:24px 0;">${message}</div>`;
}

// 投票結果受信時の処理
socket.on('voting_result', data => {
    if (!votePhaseArea) return;
    // 結果発表
    if (data.executed_players && data.executed_players.length > 0) {
        const executedNames = (data.executed_players_info || []).map(p => p.name).join('、');
        voteResultMsg.innerHTML = `今回処刑されるのは…<br><b>${executedNames}さん</b>です。`;
        votePhaseUI.innerHTML = '';
        setTimeout(() => { hideVotePhaseArea(); }, 10000);
        if (data.executed_players.includes(playerId)) {
            isDead = true;
            setAudioMute(true);
            showUnmuteButton();
            setTimeout(() => { alert('あなたは処刑されました。マイクは自動でミュートされました。'); }, 500);
        }
        if (data.alive_players) {
            updateAlivePlayers(data.alive_players.map(p => p.name));
        }
    } else if (data.runoff_candidates && data.runoff_candidates.length > 0) {
        const names = data.runoff_candidates.map(p => p.name).join('、');
        voteResultMsg.innerHTML = `同票のため決選投票を行います。<br>対象: <b>${names}さん</b>`;
        showVotingButtons([], data.runoff_candidates);
    } else {
        voteResultMsg.innerHTML = '本日は追放者なし';
        setTimeout(() => { hideVotePhaseArea(); }, 5000);
        if (data.alive_players) {
            updateAlivePlayers(data.alive_players.map(p => p.name));
        }
    }
});

// WebRTC音声通話（雛形）
async function startAudio() {
    try {
        updateAudioStatus('connecting', 'マイクにアクセス中...');
        addDebugLog('Requesting microphone access...');
        
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        addDebugLog('Microphone access granted', 'success');
        addDebugLog(`Local stream tracks: ${localStream.getTracks().map(t => `${t.kind}(enabled:${t.enabled})`).join(', ')}`);
        
        // マイクボタンの初期状態を設定
        if (muteBtn && unmuteBtn) {
            muteBtn.style.display = 'inline-block';
            unmuteBtn.style.display = 'none';
        }
        
        updateAudioStatus('connected', 'マイク接続済み - 他のプレイヤーを待機中');
        addDebugLog('Audio stream started successfully', 'success');
    } catch (e) {
        addDebugLog(`Microphone access error: ${e.name} - ${e.message}`, 'error');
        updateAudioStatus('error', 'マイクアクセスエラー - 受信のみ可能');
        
        // マイクアクセスが失敗しても、受信専用モードで動作
        localStream = null;
        
        if (e.name === 'NotAllowedError') {
            alert('マイクの利用が許可されていません。受信専用モードで動作します。\n\niPhoneの場合：\n1. 設定 > Safari > マイク > 許可\n2. または設定 > プライバシーとセキュリティ > マイク > Safari > 許可');
        } else if (e.name === 'NotFoundError') {
            alert('マイクが見つかりません。受信専用モードで動作します。');
        } else {
            alert('マイクの利用でエラーが発生しました。受信専用モードで動作します。\n' + (e && e.message ? e.message : e));
        }
    }
    
    // 既存のプレイヤーとの接続を確立（マイクアクセス成功/失敗に関係なく）
    if (roomId && playerId) {
        addDebugLog('Requesting room players for connection setup');
        // ルーム内の他のプレイヤーとの接続を確立
        socket.emit('get_room_players', { room_id: roomId });
    }
}
function setAudioMute(mute) {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !mute);
        
        // ボタンの表示を切り替え
        if (muteBtn && unmuteBtn) {
            if (mute) {
                muteBtn.style.display = 'none';
                unmuteBtn.style.display = 'inline-block';
            } else {
                muteBtn.style.display = 'inline-block';
                unmuteBtn.style.display = 'none';
            }
        }
    }
}

// マイクコントロールボタンのイベントリスナー
if (muteBtn) {
    muteBtn.onclick = () => {
        setAudioMute(true);
    };
}

if (unmuteBtn) {
    unmuteBtn.onclick = () => {
        setAudioMute(false);
    };
}

// 音声有効化ボタンのイベントリスナー
if (enableAudioBtn) {
    enableAudioBtn.onclick = async () => {
        try {
            // すべての音声要素を有効化
            const audioElements = document.querySelectorAll('audio');
            console.log('Found audio elements:', audioElements.length);
            
            for (const audio of audioElements) {
                console.log('Enabling audio element:', audio.id);
                audio.muted = false;
                audio.volume = 1.0;
                
                try {
                    // 音声要素の状態を確認
                    console.log('Audio element state before play:', {
                        id: audio.id,
                        srcObject: audio.srcObject,
                        muted: audio.muted,
                        volume: audio.volume,
                        paused: audio.paused,
                        readyState: audio.readyState
                    });
                    
                    await audio.play();
                    console.log('Audio play successful for:', audio.id);
                } catch (e) {
                    console.log('Audio play failed for element:', audio.id, e);
                    if (e.name === 'NotAllowedError') {
                        alert('音声再生の許可が必要です。ブラウザの設定で音声再生を許可してください。');
                    }
                }
            }
            
            enableAudioBtn.style.display = 'none';
            updateAudioStatus('connected', '音声再生有効');
        } catch (error) {
            console.error('Error enabling audio:', error);
            alert('音声の有効化に失敗しました。ページをタップしてから再度お試しください。');
        }
    };
}

// デバッグ用のテスト機能
function addDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'デバッグ情報';
    debugBtn.style.cssText = 'background-color: #9C27B0; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;';
    debugBtn.onclick = () => {
        console.log('=== DEBUG INFO ===');
        console.log('Local stream:', localStream);
        console.log('Local stream tracks:', localStream ? localStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
        })) : 'null');
        console.log('Peer connections:', Object.keys(peerConnections));
        console.log('Room ID:', roomId);
        console.log('Player ID:', playerId);
        console.log('Audio elements:', document.querySelectorAll('audio'));
        
        // 各音声要素の詳細情報
        document.querySelectorAll('audio').forEach((audio, index) => {
            console.log(`Audio element ${index}:`, {
                id: audio.id,
                srcObject: audio.srcObject,
                muted: audio.muted,
                volume: audio.volume,
                paused: audio.paused,
                readyState: audio.readyState,
                networkState: audio.networkState
            });
        });
        
        Object.keys(peerConnections).forEach(peerId => {
            const pc = peerConnections[peerId];
            console.log(`Peer ${peerId}:`, {
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
                localDescription: pc.localDescription ? pc.localDescription.type : 'null',
                remoteDescription: pc.remoteDescription ? pc.remoteDescription.type : 'null',
                localStream: pc.getSenders().map(s => s.track ? s.track.kind : 'null'),
                remoteStream: pc.getReceivers().map(r => r.track ? r.track.kind : 'null')
            });
        });
        
        // ICE候補キューの状態
        console.log('ICE candidate queue:', iceCandidateQueue);
        
        alert('デバッグ情報をコンソールに出力しました。F12キーで開発者ツールを開いて確認してください。');
    };
    
    if (audioSection) {
        audioSection.appendChild(debugBtn);
    }
}

// デバッグログを画面に表示する機能
let debugLogs = [];
const maxLogs = 50;

function addDebugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    debugLogs.push({ message: logEntry, type });
    
    // 最大ログ数を超えたら古いログを削除
    if (debugLogs.length > maxLogs) {
        debugLogs.shift();
    }
    
    // 画面のログ表示を更新
    updateDebugDisplay();
    
    // コンソールにも出力
    console.log(logEntry);
}

function updateDebugDisplay() {
    let debugDisplay = document.getElementById('debug-display');
    if (!debugDisplay) {
        debugDisplay = document.createElement('div');
        debugDisplay.id = 'debug-display';
        debugDisplay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 400px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 5px;
            overflow-y: auto;
            z-index: 10000;
            display: none;
        `;
        document.body.appendChild(debugDisplay);
    }
    
    debugDisplay.innerHTML = debugLogs.map(log => 
        `<div style="color: ${log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#51cf66' : '#ffffff'}">${log.message}</div>`
    ).join('');
}

// デバッグ表示の切り替えボタン
function addDebugToggleButton() {
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'ログ表示';
    toggleBtn.style.cssText = 'background-color: #FF5722; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;';
    toggleBtn.onclick = () => {
        const debugDisplay = document.getElementById('debug-display');
        if (debugDisplay) {
            debugDisplay.style.display = debugDisplay.style.display === 'none' ? 'block' : 'none';
            toggleBtn.textContent = debugDisplay.style.display === 'none' ? 'ログ表示' : 'ログ非表示';
        }
    };
    
    if (audioSection) {
        audioSection.appendChild(toggleBtn);
    }
}

// 接続状態の更新
function updateAudioStatus(status, message) {
    if (audioStatus) {
        audioStatus.textContent = message || status;
        audioStatus.style.color = status === 'connected' ? '#4CAF50' : 
                                 status === 'connecting' ? '#FF9800' : '#f44336';
    }
}

// 役職に応じたチャットリンクを更新
function updateRoleChats(playerRole) {
    if (!roleChats) return;
    
    roleChats.innerHTML = '';
    
    // 昼フェーズかどうか
    const isDay = currentPhase === 'day';
    // 人狼
    if (playerRole === '人狼') {
        const werewolfChat = document.createElement('div');
        werewolfChat.innerHTML = `
            <button onclick="openRoleChat('werewolf')" style="width: 100%; margin: 5px 0; padding: 8px; background: #d32f2f; color: white; border: none; border-radius: 3px; cursor: pointer;" ${isDay ? '' : ''}>
                人狼グループチャット
            </button>
            <button onclick="openRoleChat('werewolf_vote')" style="width: 100%; margin: 5px 0; padding: 8px; background: #7b1fa2; color: white; border: none; border-radius: 3px; cursor: pointer;" disabled>
                殺害対象投票（夜のみ）
            </button>
        `;
        roleChats.appendChild(werewolfChat);
    }
    // 占い師
    if (playerRole === '占い師') {
        const seerChat = document.createElement('div');
        seerChat.innerHTML = `
            <button style="width: 100%; margin: 5px 0; padding: 8px; background: #1976d2; color: white; border: none; border-radius: 3px; cursor: not-allowed;" disabled>
                占い結果確認（夜のみ）
            </button>
        `;
        roleChats.appendChild(seerChat);
    }
    // 霊媒師
    if (playerRole === '霊媒師') {
        const mediumChat = document.createElement('div');
        mediumChat.innerHTML = `
            <button style="width: 100%; margin: 5px 0; padding: 8px; background: #388e3c; color: white; border: none; border-radius: 3px; cursor: not-allowed;" disabled>
                霊媒結果確認（夜のみ）
            </button>
        `;
        roleChats.appendChild(mediumChat);
    }
    // 騎士
    if (playerRole === '騎士') {
        const knightChat = document.createElement('div');
        knightChat.innerHTML = `
            <button onclick="openRoleChat('knight')" style="width: 100%; margin: 5px 0; padding: 8px; background: #f57c00; color: white; border: none; border-radius: 3px; cursor: pointer;" ${isDay ? '' : ''}>
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
    addDebugButton();
    addDebugToggleButton(); // デバッグ表示の切り替えボタンを追加
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

// 新しい昼フェーズ表示エリア制御
const dayPhaseArea = document.getElementById('dayPhaseArea');
const dayPhaseImg = document.getElementById('dayPhaseImg');
const dayPhaseLabel = document.getElementById('dayPhaseLabel');
const dayPhaseTimerArea = document.getElementById('dayPhaseTimerArea');
let dayPhaseAreaTimer = null;
function showDayPhaseArea(dayNum, remainSec) {
    if (!dayPhaseArea) return;
    dayPhaseArea.style.display = '';
    dayPhaseLabel.textContent = `${dayNum}日目 昼`;
    if (dayPhaseImg) dayPhaseImg.src = '/static/img/discussion.png';
    updateDayPhaseAreaTimer(remainSec);
}
function hideDayPhaseArea() {
    if (dayPhaseArea) dayPhaseArea.style.display = 'none';
    if (dayPhaseAreaTimer) clearInterval(dayPhaseAreaTimer);
}
function updateDayPhaseAreaTimer(sec) {
    if (dayPhaseAreaTimer) clearInterval(dayPhaseAreaTimer);
    let remain = sec;
    if (dayPhaseTimerArea) dayPhaseTimerArea.textContent = `残り ${formatTime(remain)}`;
    dayPhaseAreaTimer = setInterval(() => {
        remain--;
        if (dayPhaseTimerArea) dayPhaseTimerArea.textContent = `残り ${formatTime(remain)}`;
        if (remain <= 0) {
            clearInterval(dayPhaseAreaTimer);
            hideDayPhaseArea();
        }
    }, 1000);
}

// 投票フェーズ専用画面の投票ボタン生成
// 決選投票時はrunoff_candidatesのみ投票ボタンを表示
function showVotingUI_VotePhase(alivePlayers, runoffCandidates) {
    if (!votePhaseUI) return;
    votePhaseUI.innerHTML = '';
    let targetList = alivePlayers;
    if (runoffCandidates && Array.isArray(runoffCandidates) && runoffCandidates.length > 0) {
        targetList = runoffCandidates;
    }
    if (!targetList || !Array.isArray(targetList)) return;
    targetList.forEach(player => {
        if (player.id !== playerId) {
            const btn = document.createElement('button');
            btn.textContent = player.name;
            btn.onclick = () => {
                socket.emit('submit_vote', { room_id: roomId, target_id: player.id });
                votePhaseUI.innerHTML = '投票済み';
            };
            votePhaseUI.appendChild(btn);
        }
    });
}

if (updateSettingsBtn) {
    updateSettingsBtn.onclick = () => {
        const settings = {
            room_id: roomId,
            role_distribution: {
                '村人': parseInt(villagerCount.value),
                '人狼': parseInt(werewolfCount.value),
                '占い師': parseInt(seerCount.value),
                '騎士': parseInt(knightCount.value),
                '霊媒師': parseInt(mediumCount.value)
            },
            day_time: dayTime ? parseInt(dayTime.value) : 5,
            night_time: nightTime ? parseInt(nightTime.value) : 2
        };
        socket.emit('update_room_settings', settings);
    };
    socket.on('room_settings_updated', () => {
        if (settingsUpdatedMsg) {
            settingsUpdatedMsg.style.display = '';
            setTimeout(() => { settingsUpdatedMsg.style.display = 'none'; }, 2000);
        }
    });
} 

// WebRTC接続作成
async function createPeerConnection(peerId) {
    if (peerConnections[peerId]) {
        addDebugLog(`Connection already exists for: ${peerId}`);
        return; // 既に接続済み
    }

    addDebugLog(`Creating peer connection for: ${peerId}`);
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    // ローカルストリームを追加（存在する場合のみ）
    if (localStream) {
        addDebugLog(`Adding local stream tracks to peer connection for: ${peerId}`);
        localStream.getTracks().forEach(track => {
            addDebugLog(`Adding track: ${track.kind}, enabled: ${track.enabled}`);
            pc.addTrack(track, localStream);
        });
    } else {
        addDebugLog(`No local stream available - receive-only mode for: ${peerId}`);
    }

    // リモートストリームの処理
    pc.ontrack = (event) => {
        addDebugLog(`Received remote track from: ${peerId}, kind: ${event.track.kind}`, 'success');
        const remoteStream = event.streams[0];
        
        if (!remoteStream) {
            addDebugLog(`No remote stream received from: ${peerId}`, 'error');
            return;
        }
        
        addDebugLog(`Remote stream tracks: ${remoteStream.getTracks().map(t => `${t.kind}(enabled:${t.enabled})`).join(', ')}`);
        
        // プレイヤー専用の音声要素を作成
        let playerAudio = document.getElementById(`audio-${peerId}`);
        if (!playerAudio) {
            playerAudio = document.createElement('audio');
            playerAudio.id = `audio-${peerId}`;
            playerAudio.autoplay = true;
            playerAudio.playsinline = true;
            playerAudio.muted = false;
            playerAudio.volume = 1.0;
            playerAudio.controls = false;
            
            // 音声要素をページに追加
            if (audioSection) {
                audioSection.appendChild(playerAudio);
            }
            
            addDebugLog(`Created audio element for peer: ${peerId}`);
        }
        
        // ストリームを設定
        playerAudio.srcObject = remoteStream;
        addDebugLog(`Set srcObject for audio element: ${playerAudio.id}`);
        
        // 音声要素の状態を監視
        playerAudio.onloadedmetadata = () => {
            addDebugLog(`Audio metadata loaded for: ${peerId}`);
        };
        
        playerAudio.oncanplay = () => {
            addDebugLog(`Audio can play for: ${peerId}`);
        };
        
        playerAudio.onplay = () => {
            addDebugLog(`Audio started playing for: ${peerId}`, 'success');
        };
        
        playerAudio.onerror = (e) => {
            addDebugLog(`Audio error for: ${peerId} - ${e.message}`, 'error');
        };
        
        // 音声再生を試行
        const playPromise = playerAudio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                addDebugLog(`Audio play successful for: ${peerId}`, 'success');
                updateAudioStatus('connected', `音声通話接続済み (${Object.keys(peerConnections).length}人)`);
            }).catch(e => {
                addDebugLog(`Error playing remote audio for ${peerId}: ${e.message}`, 'error');
                if (e.name === 'NotAllowedError') {
                    updateAudioStatus('error', '音声再生の許可が必要です。「音声有効化」ボタンをタップしてください。');
                } else {
                    updateAudioStatus('error', `音声再生エラー: ${e.message}`);
                }
            });
        }
    };

    // ICE候補の処理
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            addDebugLog(`Sending ICE candidate to: ${peerId}`);
            socket.emit('ice_candidate', {
                room_id: roomId,
                target_id: peerId,
                candidate: event.candidate
            });
        } else {
            addDebugLog(`ICE gathering completed for: ${peerId}`);
        }
    };

    // 接続状態の監視
    pc.onconnectionstatechange = () => {
        addDebugLog(`Connection state with ${peerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
            addDebugLog(`✅ WebRTC connection established with ${peerId}`, 'success');
            updateAudioStatus('connected', `音声通話接続済み (${Object.keys(peerConnections).length}人)`);
        } else if (pc.connectionState === 'connecting') {
            addDebugLog(`🔄 Connecting to ${peerId}...`);
            updateAudioStatus('connecting', '音声通話接続中...');
        } else if (pc.connectionState === 'disconnected') {
            addDebugLog(`❌ Disconnected from ${peerId}`, 'error');
            updateAudioStatus('disconnected', '音声通話接続が切断されました');
        } else if (pc.connectionState === 'failed') {
            addDebugLog(`💥 Connection failed with ${peerId}`, 'error');
            updateAudioStatus('error', '音声通話接続に失敗しました');
        } else if (pc.connectionState === 'new') {
            addDebugLog(`🆕 New connection created with ${peerId}`);
        }
    };

    // ICE接続状態の監視
    pc.oniceconnectionstatechange = () => {
        addDebugLog(`ICE connection state with ${peerId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected') {
            addDebugLog(`✅ ICE connection established with ${peerId}`, 'success');
        } else if (pc.iceConnectionState === 'checking') {
            addDebugLog(`🔍 ICE checking with ${peerId}...`);
        } else if (pc.iceConnectionState === 'failed') {
            addDebugLog(`💥 ICE connection failed with ${peerId}`, 'error');
        }
    };

    // シグナリング状態の監視
    pc.onsignalingstatechange = () => {
        addDebugLog(`Signaling state with ${peerId}: ${pc.signalingState}`);
        if (pc.signalingState === 'stable') {
            addDebugLog(`✅ Signaling stable with ${peerId}`, 'success');
        }
    };

    // オファーを作成して送信（ローカルストリームがある場合のみ）
    if (localStream) {
        try {
            updateAudioStatus('connecting', '音声通話接続中...');
            addDebugLog(`Creating offer for: ${peerId}`);
            const offer = await pc.createOffer();
            addDebugLog(`Offer created for: ${peerId}`);
            await pc.setLocalDescription(offer);
            addDebugLog(`Local description set for: ${peerId}`);
            
            socket.emit('offer', {
                room_id: roomId,
                target_id: peerId,
                offer: offer
            });
            addDebugLog(`Offer sent to server for: ${peerId}`);
        } catch (error) {
            addDebugLog(`Error creating offer for ${peerId}: ${error.message}`, 'error');
            updateAudioStatus('error', '音声通話接続エラー');
        }
    } else {
        addDebugLog(`No local stream - waiting for incoming offer from: ${peerId}`);
        updateAudioStatus('connected', '受信専用モード - 他のプレイヤーからの接続を待機中');
    }
}

// オファー受信時の処理
socket.on('offer', async (data) => {
    const { from_id, offer } = data;
    console.log('Received offer from:', from_id, 'offer:', offer);
    
    if (!peerConnections[from_id]) {
        console.log('Creating new peer connection for incoming offer from:', from_id);
        await createPeerConnection(from_id);
    }
    
    const pc = peerConnections[from_id];
    
    try {
        console.log('Setting remote description for:', from_id);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Creating answer for:', from_id);
        const answer = await pc.createAnswer();
        console.log('Answer created:', answer);
        await pc.setLocalDescription(answer);
        console.log('Local description set for answer');
        
        // キューされたICE候補を処理
        await processQueuedIceCandidates(from_id);
        
        socket.emit('answer', {
            room_id: roomId,
            target_id: from_id,
            answer: answer
        });
        console.log('Answer sent to server');
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

// アンサー受信時の処理
socket.on('answer', async (data) => {
    const { from_id, answer } = data;
    console.log('Received answer from:', from_id, 'answer:', answer);
    
    const pc = peerConnections[from_id];
    if (pc) {
        try {
            console.log('Setting remote description for answer from:', from_id);
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Remote description set for answer');
            
            // キューされたICE候補を処理
            await processQueuedIceCandidates(from_id);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    } else {
        console.error('No peer connection found for answer from:', from_id);
    }
});

// ICE候補のキュー（リモートディスクリプションが設定されるまで待機）
const iceCandidateQueue = {};

// ICE候補受信時の処理
socket.on('ice_candidate', async (data) => {
    const { from_id, candidate } = data;
    console.log('Received ICE candidate from:', from_id, 'candidate:', candidate);
    
    const pc = peerConnections[from_id];
    if (pc) {
        // リモートディスクリプションが設定されているかチェック
        if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
                console.log('Adding ICE candidate for:', from_id);
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE candidate added successfully');
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        } else {
            // キューに追加
            console.log('Queuing ICE candidate for:', from_id, '- waiting for remote description');
            if (!iceCandidateQueue[from_id]) {
                iceCandidateQueue[from_id] = [];
            }
            iceCandidateQueue[from_id].push(candidate);
        }
    } else {
        console.error('No peer connection found for ICE candidate from:', from_id);
    }
});

// キューされたICE候補を処理する関数
async function processQueuedIceCandidates(peerId) {
    const pc = peerConnections[peerId];
    if (!pc || !iceCandidateQueue[peerId]) return;
    
    console.log('Processing queued ICE candidates for:', peerId);
    const candidates = iceCandidateQueue[peerId];
    iceCandidateQueue[peerId] = [];
    
    for (const candidate of candidates) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Queued ICE candidate added successfully for:', peerId);
        } catch (error) {
            console.error('Error adding queued ICE candidate:', error);
        }
    }
}

// ルーム内プレイヤー取得時の処理
socket.on('room_players', (data) => {
    const { players } = data;
    console.log('Received room players:', players);
    if (players && Array.isArray(players)) {
        console.log('Setting up connections with', players.length, 'players');
        players.forEach(peerId => {
            if (peerId !== playerId && localStream) {
                console.log('Creating connection with player:', peerId);
                createPeerConnection(peerId);
            } else if (peerId === playerId) {
                console.log('Skipping self connection for:', peerId);
            } else if (!localStream) {
                console.error('Cannot create connection - local stream not available');
            }
        });
    } else {
        console.log('No players to connect with or invalid data:', data);
    }
}); 