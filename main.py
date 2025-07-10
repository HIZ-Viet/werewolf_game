from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import socketio
import uvicorn
import json
import random
import uuid
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from enum import Enum

# FastAPIアプリケーション
app = FastAPI(title="人狼ゲーム", version="1.0.0")

# Socket.IOサーバー
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins="*"
)

# Socket.IOアプリケーション
socket_app = socketio.ASGIApp(sio, app)

# 静的ファイルとテンプレート
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ゲーム状態管理
class GamePhase(Enum):
    WAITING = "waiting"
    NIGHT = "night"
    DAY = "day"
    VOTING = "voting"
    GAME_OVER = "game_over"

class Role(Enum):
    VILLAGER = "村人"
    WEREWOLF = "人狼"
    SEER = "占い師"
    KNIGHT = "騎士"
    MEDIUM = "霊媒師"

@dataclass
class Player:
    id: str
    name: str
    role: Optional[Role] = None
    is_alive: bool = True
    is_muted: bool = False
    vote_target: Optional[str] = None
    night_action_target: Optional[str] = None
    room_id: Optional[str] = None

@dataclass
class GameRoom:
    id: str
    host_id: str
    players: Dict[str, Player]
    role_distribution: Dict[str, int]
    votes: Dict[str, str]
    night_actions: Dict[str, str]
    game_log: List[str]
    phase: GamePhase = GamePhase.WAITING
    max_players: int = 15
    discussion_time: int = 300  # 5分

# ゲームデータ
rooms: Dict[str, GameRoom] = {}
players_by_socket: Dict[str, str] = {}  # socket_id -> player_id

# 役職説明
ROLE_DESCRIPTIONS = {
    Role.VILLAGER: "村人です。人狼を見つけて処刑しましょう。",
    Role.WEREWOLF: "人狼です。夜に村人を襲撃して勝利を目指しましょう。",
    Role.SEER: "占い師です。夜に1人を選んで人狼かどうか占えます。",
    Role.KNIGHT: "騎士です。夜に1人を守って人狼の襲撃を防ぎます。",
    Role.MEDIUM: "霊媒師です。朝に前夜の死亡者が人狼だったか分かります。"
}

# ルート
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Socket.IOイベント
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    if sid in players_by_socket:
        player_id = players_by_socket[sid]
        # プレイヤーをルームから削除
        for room in rooms.values():
            if player_id in room.players:
                del room.players[player_id]
                await sio.emit('player_left', {'player_id': player_id}, room=room.id)
                break
        del players_by_socket[sid]

@sio.event
async def create_room(sid, data):
    """ルーム作成"""
    room_id = str(uuid.uuid4())[:8]
    player_id = str(uuid.uuid4())
    
    player = Player(
        id=player_id,
        name=data['host_name'],
        room_id=room_id
    )
    
    room = GameRoom(
        id=room_id,
        host_id=player_id,
        players={player_id: player},
        role_distribution=data.get('role_distribution', {
            '村人': 8,
            '人狼': 2,
            '占い師': 1,
            '騎士': 1,
            '霊媒師': 1
        }),
        discussion_time=data.get('discussion_time', 300),
        votes={},
        night_actions={},
        game_log=[]
    )
    
    rooms[room_id] = room
    players_by_socket[sid] = player_id
    
    await sio.emit('room_created', {
        'room_id': room_id,
        'player_id': player_id
    }, room=sid)
    
    print(f"Room created: {room_id} by {data['host_name']}")

@sio.event
async def join_room(sid, data):
    """ルーム参加"""
    room_id = data['room_id']
    player_name = data['player_name']
    
    if room_id not in rooms:
        await sio.emit('error', {'message': 'ルームが見つかりません'}, room=sid)
        return
    
    room = rooms[room_id]
    if len(room.players) >= room.max_players:
        await sio.emit('error', {'message': 'ルームが満員です'}, room=sid)
        return
    
    player_id = str(uuid.uuid4())
    player = Player(
        id=player_id,
        name=player_name,
        room_id=room_id
    )
    
    room.players[player_id] = player
    players_by_socket[sid] = player_id
    
    await sio.emit('player_joined', {
        'player_id': player_id,
        'player_name': player_name,
        'players': [{'id': p.id, 'name': p.name} for p in room.players.values()]
    }, room=room_id)
    
    print(f"Player {player_name} joined room {room_id}")

@sio.event
async def start_game(sid, data):
    """ゲーム開始"""
    room_id = data['room_id']
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if len(room.players) < 3:
        await sio.emit('error', {'message': '最低3人必要です'}, room=room_id)
        return
    
    # 役職をランダムに配布
    await assign_roles(room)
    
    # ゲーム開始
    room.phase = GamePhase.NIGHT
    await sio.emit('game_started', {
        'phase': room.phase.value,
        'players': [{'id': p.id, 'name': p.name, 'role': p.role.value if p.role is not None else None} for p in room.players.values()]
    }, room=room_id)
    
    print(f"Game started in room {room_id}")

async def assign_roles(room: GameRoom):
    """役職をランダムに配布"""
    players = list(room.players.values())
    random.shuffle(players)
    
    role_list = []
    for role_name, count in room.role_distribution.items():
        for _ in range(count):
            role_list.append(role_name)
    
    # プレイヤー数に合わせて調整
    while len(role_list) < len(players):
        role_list.append('村人')
    role_list = role_list[:len(players)]
    random.shuffle(role_list)
    
    # 役職を割り当て
    for i, player in enumerate(players):
        role_name = role_list[i]
        if role_name == '村人':
            player.role = Role.VILLAGER
        elif role_name == '人狼':
            player.role = Role.WEREWOLF
        elif role_name == '占い師':
            player.role = Role.SEER
        elif role_name == '騎士':
            player.role = Role.KNIGHT
        elif role_name == '霊媒師':
            player.role = Role.MEDIUM
    
    # 各プレイヤーに役職を通知
    for player in players:
        if player.role is not None:
            await sio.emit('role_assigned', {
                'role': player.role.value,
                'description': ROLE_DESCRIPTIONS[player.role],
                'partners': [p.name for p in players if p.role == Role.WEREWOLF and p.id != player.id] if player.role == Role.WEREWOLF else []
            }, room=player.id)

@sio.event
async def submit_vote(sid, data):
    """投票提出"""
    room_id = data['room_id']
    target_id = data['target_id']
    
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if sid not in players_by_socket:
        return
    
    player_id = players_by_socket[sid]
    if player_id not in room.players:
        return
    
    player = room.players[player_id]
    if not player.is_alive:
        return
    
    room.votes[player_id] = target_id
    player.vote_target = target_id
    
    await sio.emit('vote_submitted', {
        'player_id': player_id,
        'target_id': target_id
    }, room=room_id)
    
    # 全員投票済みかチェック
    alive_players = [p for p in room.players.values() if p.is_alive]
    if len(room.votes) >= len(alive_players):
        await process_voting(room)

async def process_voting(room: GameRoom):
    """投票処理"""
    vote_counts = {}
    for target_id in room.votes.values():
        vote_counts[target_id] = vote_counts.get(target_id, 0) + 1
    
    # 最多票のプレイヤーを処刑
    max_votes = max(vote_counts.values())
    executed_players = [player_id for player_id, votes in vote_counts.items() if votes == max_votes]
    
    for player_id in executed_players:
        room.players[player_id].is_alive = False
        room.game_log.append(f"{room.players[player_id].name}が処刑されました")
    
    await sio.emit('voting_result', {
        'executed_players': executed_players,
        'vote_counts': vote_counts
    }, room=room.id)
    
    # 勝敗判定
    await check_game_end(room)

async def check_game_end(room: GameRoom):
    """勝敗判定"""
    alive_players = [p for p in room.players.values() if p.is_alive]
    werewolves = [p for p in alive_players if p.role == Role.WEREWOLF]
    villagers = [p for p in alive_players if p.role != Role.WEREWOLF]
    
    winner = None
    if len(werewolves) == 0:
        winner = "村人"
    elif len(werewolves) >= len(villagers):
        winner = "人狼"
    
    if winner:
        room.phase = GamePhase.GAME_OVER
        await sio.emit('game_over', {
            'winner': winner,
            'alive_players': [{'id': p.id, 'name': p.name, 'role': p.role.value if p.role is not None else None} for p in alive_players]
        }, room=room.id)
    else:
        # 次の夜フェーズへ
        room.phase = GamePhase.NIGHT
        await sio.emit('phase_changed', {
            'phase': room.phase.value
        }, room=room.id)

@sio.event
async def submit_night_action(sid, data):
    """夜の行動提出"""
    room_id = data['room_id']
    target_id = data['target_id']
    action_type = data['action_type']
    
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if sid not in players_by_socket:
        return
    
    player_id = players_by_socket[sid]
    if player_id not in room.players:
        return
    
    player = room.players[player_id]
    if not player.is_alive:
        return
    
    room.night_actions[player_id] = target_id
    player.night_action_target = target_id
    
    await sio.emit('night_action_submitted', {
        'player_id': player_id,
        'action_type': action_type,
        'target_id': target_id
    }, room=room_id)
    
    # 全員行動済みかチェック
    alive_players = [p for p in room.players.values() if p.is_alive]
    if len(room.night_actions) >= len(alive_players):
        await process_night_actions(room)

async def process_night_actions(room: GameRoom):
    """夜の行動処理"""
    # 人狼の襲撃
    werewolves = [p for p in room.players.values() if p.role == Role.WEREWOLF and p.is_alive]
    if werewolves:
        # 人狼の投票で襲撃対象を決定
        werewolf_votes = {}
        for player_id, target_id in room.night_actions.items():
            if room.players[player_id].role == Role.WEREWOLF:
                werewolf_votes[target_id] = werewolf_votes.get(target_id, 0) + 1
        
        if werewolf_votes:
            max_votes = max(werewolf_votes.values())
            attack_targets = [player_id for player_id, votes in werewolf_votes.items() if votes == max_votes]
            
            # 騎士の守りを考慮
            knights = [p for p in room.players.values() if p.role == Role.KNIGHT and p.is_alive]
            protected_players = [p.night_action_target for p in knights if p.night_action_target]
            
            for target_id in attack_targets:
                if target_id not in protected_players:
                    room.players[target_id].is_alive = False
                    room.game_log.append(f"{room.players[target_id].name}が人狼に襲撃されました")
    
    # 朝フェーズへ
    room.phase = GamePhase.DAY
    await sio.emit('phase_changed', {
        'phase': room.phase.value,
        'game_log': room.game_log[-5:]  # 最新5件
    }, room=room.id)

@sio.event
async def send_message(sid, data):
    """チャットメッセージ送信"""
    room_id = data['room_id']
    message = data['message']
    chat_type = data.get('chat_type', 'general')
    
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if sid not in players_by_socket:
        return
    
    player_id = players_by_socket[sid]
    if player_id not in room.players:
        return
    
    player = room.players[player_id]
    
    message_data = {
        'player_id': player_id,
        'player_name': player.name,
        'message': message,
        'chat_type': chat_type,
        'timestamp': str(uuid.uuid4())
    }
    
    # チャットタイプに応じて送信先を決定
    if chat_type == 'werewolf' and player.role == Role.WEREWOLF:
        werewolf_room = f"{room_id}_werewolf"
        await sio.emit('chat_message', message_data, room=werewolf_room)
    elif chat_type == 'dead':
        dead_room = f"{room_id}_dead"
        await sio.emit('chat_message', message_data, room=dead_room)
    else:
        await sio.emit('chat_message', message_data, room=room_id)

@sio.event
async def join_chat_room(sid, data):
    """チャットルーム参加"""
    room_id = data['room_id']
    chat_type = data['chat_type']
    
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if sid not in players_by_socket:
        return
    
    player_id = players_by_socket[sid]
    if player_id not in room.players:
        return
    
    player = room.players[player_id]
    
    # チャットルームに参加
    chat_room = f"{room_id}_{chat_type}"
    await sio.emit('joined_chat_room', {
        'chat_type': chat_type,
        'player_id': player_id
    }, room=sid)

if __name__ == "__main__":
    uvicorn.run(
        "main:socket_app",
        host="0.0.0.0",
        port=8000
    ) 