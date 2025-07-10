# 人狼ゲーム (Werewolf Game)

リアルタイムで遊べる人狼ゲームのWebアプリケーションです。

## 機能

- リアルタイム通信によるゲーム進行
- 複数の役職（村人、人狼、占い師、騎士、霊媒師）
- ルーム作成・参加機能
- 投票システム
- 夜のアクション（襲撃、占い、守護、霊媒）

## 技術スタック

- **Backend**: FastAPI + Socket.IO
- **Frontend**: HTML + JavaScript
- **Deployment**: Render

## ローカルでの実行

### 前提条件

- Python 3.9以上
- pip

### セットアップ

1. リポジトリをクローン
```bash
git clone <your-repository-url>
cd werewolf_game
```

2. 仮想環境を作成・有効化
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

3. 依存関係をインストール
```bash
pip install -r requirements.txt
```

4. アプリケーションを起動
```bash
uvicorn main:app --reload
```

5. ブラウザで `http://localhost:8000` にアクセス

## デプロイ

このアプリケーションはRenderでデプロイされています。

### Renderでのデプロイ手順

1. GitHubにリポジトリをプッシュ
2. Renderで新しいWebサービスを作成
3. GitHubリポジトリを接続
4. 以下の設定を使用：
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## ゲームルール

### 役職

- **村人**: 人狼を見つけて処刑する
- **人狼**: 夜に村人を襲撃して勝利を目指す
- **占い師**: 夜に1人を選んで人狼かどうか占う
- **騎士**: 夜に1人を守って人狼の襲撃を防ぐ
- **霊媒師**: 朝に前夜の死亡者が人狼だったか分かる

### ゲーム進行

1. **準備フェーズ**: プレイヤーがルームに参加
2. **夜フェーズ**: 各役職が夜のアクションを実行
3. **昼フェーズ**: 全員で議論
4. **投票フェーズ**: 人狼だと思う人に投票
5. **結果発表**: 処刑されたプレイヤーの役職を公開

## ライセンス

MIT License
