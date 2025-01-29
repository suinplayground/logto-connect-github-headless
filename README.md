# Logto Social Identity Linking

このアプリケーションは、LogtoアカウントとGitHubアカウントのリンク機能を提供します。

## 前提条件

- Docker と Docker Compose
- Bun.js
- Git
- GitHub アカウント

## セットアップ手順

### 1. GitHub App の作成

GitHub App を作成して、必要な認証情報を取得します。

#### オプション1: GitHub App Creator（オンライン）を使用

1. 以下のURLにアクセスします：

```
https://github-app-creator.vercel.app/?appName=logto-test&url=http://localhost:3000&callbackUrl1=http://localhost:3001/callback/github&callbackUrl2=http://localhost:3000/step3
```

#### オプション2: GitHub App Creator（ローカル）を使用

1. [GitHub App Creator](https://github.com/suin/github-app-creator) をダウンロードしてローカルで実行
2. 以下のURLにアクセス：

```
http://localhost:3000?appName=logto-test&url=http://localhost:3000&callbackUrl1=http://localhost:3001/callback/github&callbackUrl2=http://localhost:3000/step3
```

#### 共通の手順

1. フォームの「Organization」フィールドに、GitHub App を作成したい Organization を指定
2. 「Submit」をクリックし、GitHub の認証ページでログイン
3. GitHub App の作成を完了
4. 表示された認証情報を `.env` ファイルに設定：

```env
GITHUB_APP_CLIENT_ID=<表示されたClient ID>
GITHUB_APP_CLIENT_SECRET=<表示されたClient Secret>
```

### 2. アプリケーションの起動

1. Docker コンテナを起動：

```bash
docker-compose up -d
```

2. `.env` ファイルに以下の設定が存在することを確認：

```env
ADMIN_TENANT_SECRET=<シークレット値>
DEFAULT_TENANT_SECRET=<シークレット値>
```

3. サーバーを起動：

```bash
bun app.ts
```

## アプリケーションの使用

1. ブラウザで http://localhost:3000 にアクセス
2. 「Sign In」をクリック
3. 以下の認証情報でログイン：
   - ユーザー名: `test`
   - パスワード: `test`
4. 「Menu」→「Start To Link GitHub Account」を選択
5. 画面の指示に従って GitHub アカウントのリンク処理を完了

## トラブルシューティング

### アプリケーションのリセット

すべてのデータをリセットする場合：

```bash
docker compose down
```

### よくある問題

- **GitHub App の認証エラー**: `.env` ファイルの Client ID と Client Secret が正しく設定されているか確認
- **アプリケーションにアクセスできない**: Docker コンテナが正常に起動しているか確認
- **ログインできない**: デフォルトの認証情報（test/test）が正しく入力されているか確認

### ログの確認

問題が発生した場合は、以下のコマンドでログを確認できます：

```bash
docker compose logs
```
