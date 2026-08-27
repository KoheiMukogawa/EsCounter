# CLAUDE.md — ESM (ES Manager)

このファイルは Claude Code が自動で読み込むプロジェクト指針です。アーキテクチャが変わったら必ず更新してください。作業履歴は `PROGRESS.md` を参照。

## プロジェクト概要
ESM（ES Manager）= 就活のエントリーシート(ES)を一元管理する個人用Webアプリ。広告だらけで集中できない既存サービスへの不満から自作。利用者は作者本人＋弟（2026年前半に就活開始、実ユーザー）の2名。

## 北極星と設計原則（非交渉 — 新機能の採否はこれで判断）
北極星：**「就活のすべてを、集中を奪わずに、1つで。」** 拡張は手段、集中とシンプルが目的。

1. 集中できるUI（広告なし・余計なものを置かない）
2. データを失わない（クラウド＋ローカルバックアップ）
3. どんな端末でも開ける（マルチデバイス）
4. シンプル・余計な機能を作らない

核心の緊張：「1つで完結（拡張）」と「シンプル（抑制）」は引っ張り合う。放置すると本人が嫌った"集中を奪うアプリ"に化ける。新機能は必ずこう問う——**「就活ワークフローの実在する摩擦を消すか？ それとも機能のための機能か？」**。AIは“貼り付けた別機能”にせず、既存の素材庫・草案の導線に自然に溶け込ませる（足したと気づかないくらいに）。

## アーキテクチャ
- **フロント**：`index.html` 単一ファイルにHTML/CSS/JSを全内包（約2100行・バニラJS・ビルドツールなし）。`landing.html` は別のランディングページ。
- **ホスティング**：GitHub Pages、`main` ブランチから配信。本番 = https://koheimukogawa.github.io/ESM/ 。
  - ⚠️ GitHub Pages（無料プラン）は **publicリポジトリ必須**。非公開化するとサイトが落ちる（Firebase Hosting に移行する場合を除く）。
- **認証**：Firebase Auth（Googleログイン）。Firebaseプロジェクト = `escounter-d9db7`。
- **DB**：Firestore。データモデルは `users/{uid}` の **1ドキュメント**（companies→questions→drafts／companies→tasks＝期限つき作業 `{id,name,due,done}`／`c.collapsed`＝設問ツリーの開閉状態／`c.year`＝卒業年度 27|28（**任意**・未設定なら書き込まれない）と `activeYear`（同上）／materials＝素材庫: 自分史・ガクチカ・自己PR・志望動機の軸・その他）。草案 draft＝`{id,name,text,done,memo,chat[]}`（`chat` はAI相談の会話履歴 `{role,content}`）。ローカルに5世代バックアップ。
- **AIバックエンド**：Cloud Functions for Firebase（2nd gen / Node20）。関数 `ai`（asia-northeast1）が「Firebase IDトークン検証 → Claude API へ SSE ストリーミング中継」する**薄いプロキシ**。ソースは `functions/`。
  - URL: `https://asia-northeast1-escounter-d9db7.cloudfunctions.net/ai`（`index.html` の `AI_ENDPOINT` と一致）。
  - フロントの共通入口は `index.html` の `callAI({system, messages, maxTokens, onDelta})`。**全AI機能はここを通す。**
  - 既定モデル：`claude-opus-4-8`。

## セキュリティモデル（重要）
- **Claude APIキー（sk-ant-…）は本物の秘密** → Google Secret Manager に格納（`ANTHROPIC_API_KEY`）。フロントにもリポジトリにも**絶対に置かない**。新しいキー版を作ったら**再デプロイで反映**。
- **Firebaseの apiKey は秘密ではない**（公開してよい識別子）。`index.html` にあってOK。
- **アクセス制御**：`functions/index.js` の `ALLOWED_UIDS` で許可ユーザーを本人＋弟の2 UIDに限定。空にすると「ログインできる全員が作者の課金でClaudeを叩ける」ので注意。
- **CORS**：`https://koheimukogawa.github.io` ＋ `localhost:8000/5500` のみ許可。
- **Firestoreルール**：`users/{userId}` を `request.auth != null && request.auth.uid == userId` で本人のみ read/write（テストモードではない・安全）。コンソール管理（リポジトリ未管理）。将来サブコレクション化するならルール拡張が必要。

## 開発ワークフロー
- **ローカル確認**：`python3 -m http.server 8000 --directory <repo>` → http://localhost:8000/ 。:8000 はCORS許可済み。Firebase Auth は `localhost` を既定で許可ドメインとして扱う。
- **Functionsデプロイ**：`firebase deploy --only functions`（要 `firebase login`＋Blazeプラン）。
  - 初回や久々のデプロイで `iam.serviceaccounts.actAs` の **403** が出たら、IAM伝播待ちの一過性。**1〜2分待って再実行**で通る。
- **シークレット設定**：`firebase functions:secrets:set ANTHROPIC_API_KEY`。**対話式なので実ターミナルで**（`!`経由や非対話シェルは「Cannot run in non-interactive mode」で失敗）。値は**1行・余分な改行や“…”を含めない**（混入すると `not a legal HTTP header value` で失敗する）。
- **git**：remoteはHTTPS。push は classic PAT 認証で**実ターミナルから** `git push`。`main` が本番なので **push＝本番反映** に直結する点に注意。
- **コスト**：Opus 4.8 = 入力$5/出力$25 per 1M tokens。個人利用なら1操作あたり数円〜。Anthropicのクレジットは前払い（Firebaseの課金とは別アカウント・別請求）。

## コーディング規約
- 既存スタイルに合わせる：バニラHTML/CSS/JS、ビルド工程なし、`index.html` 1ファイル主義。フロントにフレームワークやnpm依存を足さない。
- UI文言・コメントは日本語。
- 余計な抽象化・機能追加をしない（設計原則4）。AI機能は `callAI()` に集約し、既存の草案編集／素材庫の導線に溶け込ませる。

## 段階計画（現在地）
- **Phase 0（プロキシ疎通）= ✅ 完了**（2026-06-20）。
- **Phase 1（③添削＋空からの下書き）= ✅ 完了**（2026-06-21）。草案バーの ✨ ボタン（`refineDraft()`）：空→素材庫をもとに下書き生成／文章あり→推敲して新草案（元は残す）。表示は中身で「✨下書き／✨添削」自動切替。
- **Phase 2 ①「自分史チャット（対話モード）」= ✅ 完了**（2026-06-21）。草案編集カードにインラインの「💬 AIと相談」。会話は草案ごとに保存（`d.chat`）。`sendChat()`＝往復、`applyChat()`＝会話を踏まえ完成稿を草案に反映。systemに「添削ガイドライン」注入用フックをコメントで用意。
- **(a)「Claudeに教える」育てるガイドライン = ✅ 完了**（2026-06-21）。`guidelines`(Firestore) を全AI機能の system に `guidelineBlock()` で注入。あわせて 添削の変更点メモ／Claudeブランディング・文言最小化／Clawd マスコット（3mf解析で12×8ドット再現）／使用量チップ（`aiUsage`）も追加。
- **Phase 2 ②（切り口提案・軽量版）= ✅**（2026-06-21）：「切り口」ボタン→Claudeが書く方向性を3つチャット提案→会話で育てる（"3案フル生成"は廃止＝草案を散らかさない）。あわせて：ヘッダをアカウント(アバター)メニューに集約（📚素材庫/📝Claudeへの指示/使い方）／ガイドを「📝 Claudeへの指示」に簡素化／複製ボタン廃止。
- **自分史インタビュー（最小版）= ✅**（2026-06-22）：素材庫の「💬 対話で自分史を作る」→Claudeが問答で引き出し→「素材庫に保存」で `materials` に {cat:'自分史'} を生成（`ivChat` で会話保持・接地）。素材庫が空のとき初回誘導（強制しない）。王道「①素材を貯める」をAIが支援。
- **期限つき作業＋選考順ソート = ✅**（2026-08-21）：企業に `tasks[]`（期限つき作業）を追加し、企業ツリーを `nextDue()` 由来の「次にやることが近い順」に並べ替え。ES提出済みでも未完了作業があれば沈まない。面接など固定日時・通知・カレンダービューは非目標（spec 参照）。
- **年度タブ（27卒/28卒）= ✅**（2026-08-28）：同じアカウントで2周分の就活をする人向けに、サイドバーを年度で絞り込む。**使わない人には何も起きない**（年度を持つ企業が2年度そろうまでタブは出ず、`c.year`/`activeYear` も保存されない）。年度未設定の企業は先頭年度（27卒）に属するものとして扱い、データは書き換えない。検索は年度を横断する。
- **次の候補**：(c) Phase 3 ④企業提案（Web検索で根拠付け・"参考提案"に留める。LLM記憶だけの断定は知識カットオフ＆ハルシネーションで危険）／自分史インタビューの「ガクチカ版」。
- 詳細な作業履歴は `PROGRESS.md`。

## 環境メモ
- **2026-07-05**: WSLホームディレクトリ整理により、作業コピーの場所が `~/ESM` → `~/projects/ESM` に移動（リポジトリ内容・リモートは変更なし）。
