# ESM (ES Manager)

就活のエントリーシート(ES)管理は既存サービスだと広告や通知に集中を奪われる。自分がそれで消耗した反動で、広告なし・機能を絞った個人用のES管理アプリを自作した。

- **稼働中**: https://koheimukogawa.github.io/ESM/ — 作者本人と弟の2名が実際の就活で使用中（デモやモックではない）
- **フロント**: `index.html` 1ファイル（約2200行、バニラJS、ビルドツールなし）
- **認証/DB**: Firebase Auth（Googleログイン）＋ Firestore。データは `users/{uid}` の1ドキュメントに集約
- **AI添削**: Cloud Functions が Firebase IDトークンを検証し、Claude API へ SSE でストリーミング中継する薄いプロキシ

設計判断は下の「設計判断」に、意図的に採らなかった案とあわせてまとめている。

## アーキテクチャ

```
ブラウザ (index.html)
  ├─ Firebase Auth (Google ログイン)
  ├─ Firestore ── users/{uid} の1ドキュメント
  │     companies[]（設問→草案の階層）/ materials[]（自分史・ガクチカ等）/ guidelines / aiUsage
  └─ fetch → Cloud Functions `ai` (asia-northeast1)
                ├─ Firebase IDトークン検証
                ├─ UID allowlist（本人＋弟）
                └─ Claude API（Secret Manager の鍵）→ SSEで中継
```

- ホスティングは GitHub Pages（`main` ブランチから配信）。無料プランは public リポジトリが前提で、非公開化するとサイトが落ちる。
- ローカルには直近5世代のバックアップを `localStorage` に保持し、クラウド保存とは別系統でデータ消失に備えている。

## 設計判断

### 1. なぜビルドツールを入れず単一 HTML にしたか

`index.html` に HTML/CSS/JS を全内包し、React/Vue + Vite のような構成は採らなかった。北極星は「集中を奪わない」こと自体がプロダクトの価値であり、開発体験も同じ理由でシンプルに保ちたかった。ビルドパイプラインの保守（依存更新、ビルド設定、CI）は、利用者2名の個人開発が背負うコストとして見合わない。ファイルを開くだけでローカル確認でき（`python3 -m http.server` で十分）、GitHub Pages へのデプロイもコミットするだけで完結する。捨てた案はモダンフロントエンド構成一式（バンドラ・フレームワーク導入）で、2200行規模のアプリではオーバーヘッドがメリットを上回ると判断した。

### 2. なぜ Firestore を `users/{uid}` の1ドキュメントに集約したか

`index.html` の Firestore 呼び出しは実装全体でこの2箇所だけ（`db.collection('users').doc(uid).set(payload)` と `.get()`）。ログイン後の初期ロードは `loadFromCloud()` が1回の `get()` で完結し、以降の保存はすべて `scheduleSave()` が1.5秒デバウンスした上で `saveToCloud()` が `companies`（企業→設問→草案の階層全体）・`materials`・`guidelines`・`aiUsage` などを丸ごと1回の `set()` にまとめて書き込む。これを `companies/{id}` や `questions/{id}` のようにサブコレクション化していたら、階層の深いネストのどこか一箇所を変更するたびに複数ドキュメントへの書き込みが必要になり、一部だけ成功して残りが失敗する部分書き込みの不整合が起こりうる。1ドキュメントの `set()` はFirestore上アトミックなので、この種の不整合が構造的に発生しない。加えて読み書きの回数そのものが最小化される（セッションあたり読み込み1回・保存は最大でも1.5秒に1回）ため、Firestoreの無料枠に対しても余裕がある。捨てた案はコレクション/サブコレクションへの分割で、企業数・設問数がユーザーあたり数十〜百程度に収まる規模では、分割によるクエリ効率化のメリットが複雑さに見合わないと判断した。

### 3. なぜ Claude API を直接叩かず Cloud Functions を挟んだか

`functions/index.js` の関数 `ai` は、Firebase IDトークンを `admin.auth().verifyIdToken()` で検証し、さらに `ALLOWED_UIDS`（本人＋弟の2 UID）に一致する場合だけ Claude API へリクエストを中継する。Claude の APIキー（`sk-ant-…`）は Google Secret Manager にのみ存在し、`process.env.ANTHROPIC_API_KEY` として関数内で参照されるだけで、クライアントにもリポジトリにも一切置かれない。フロントから直接 Anthropic API を叩く案は採らなかった。ブラウザの JS にAPIキーを埋め込めば誰でも抜き取れてしまい、作者の課金枠を他人が消費できてしまうため、これは選択肢にすらならない。Cloud Functions を挟むことで「秘密鍵の非公開」「本人確認（IDトークン）」「利用者の限定（UID allowlist）」の3段の防御を、フロントのコードを一切変えずに実現している。

## Firebase の Web API キーについて

`index.html` に Firebase の `apiKey`（`AIzaSy...`）が直書きされているが、これは Firebase の仕様上正しい。この `apiKey` はプロジェクトを識別するためのものであり、秘密情報ではない（公開してよい値として Firebase 公式ドキュメントでも明記されている）。実際のアクセス制御は、Firestore 側は本リポジトリの `firestore.rules`（`request.auth.uid == userId` で本人のみ read/write）、AI機能側は `functions/index.js` の IDトークン検証と UID allowlist が担っている。秘密として守るべきなのは Claude API キーの方で、それは前述のとおり Secret Manager にのみ置かれている。

## Firestore セキュリティルール

`firestore.rules` は本番（プロジェクト `escounter-d9db7`）に反映済みのルールを、Firebase の `firebase_get_security_rules`（読み取り専用）で取得してこのリポジトリに同期したもの。デプロイ済みの内容そのものであり、コンソール管理から離れてバージョン管理下に置いた。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 開発の背景

もともと Firestore ルールと `functions/` のシークレットはコンソール管理で、リポジトリには含まれていなかった。北極星（「就活のすべてを、集中を奪わずに、1つで。」）と設計原則の詳細は `CLAUDE.md` を参照。
