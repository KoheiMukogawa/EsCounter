# モバイルレイアウト対応 — 設計

日付：2026-09-01
対象：`index.html`（アプリ本体）。`landing.html` は対象外（別途モバイル対応済み）。

## 目的

スマホでESMを開いたときに、レイアウトが破綻せず・指で操作でき・入力のたびに画面が勝手に拡大しない状態にする。

用途は **確認中心＋軽い手直し** と定める：
- 移動中に「次にやること」と締切を見る
- ES本文を読み返す
- 期限つき作業を ✓ する／提出済み・選考結果・落選段階を記録する

本格的な執筆とAI相談はPCで行う前提とし、スマホでの執筆最適化は**非目標**とする。

## 非目標

- スマホでの長文執筆に向けたエディタ最適化
- AI相談・自分史インタビューのモバイル専用UI（破綻しない範囲に留める）
- タブレット専用レイアウト
- ネイティブアプリ／PWA化・オフライン対応
- `landing.html` の変更

## 現状の問題（375px幅で実測）

1. **ヘッダーが溢れる。** ロゴ＋検索＋ズーム＋テーマ＋同期＋使用量＋アバターで約425px＋検索欄。
2. **サイドバーと本文が両方狭い。** `.app-body` が `display:flex` で `.sidebar`(≤640pxで180px) と `.main-content` を横並べ。本文の実効幅は `main-content` 24px ＋ `q-header`/`q-textarea` 22px を引いて **283px**。
3. **入力のたびにiOSが勝手に拡大する。** `font-size` 16px未満の入力欄にフォーカスすると iOS Safari がズームし、戻らない。`.search-input`(12px) `.q-title-input`(15px) `.q-limit-input`(12px) `.q-textarea`(14px×ズーム) `.modal-input`(13px) `.draft-name`(12px) が該当。
4. **`100vh` で下端が切れる。** URLバーの分だけ `100vh` が可視領域より大きい。`#appScreen{height:100vh}`、`#addCompanyModal{max-height:85vh}`、`#ivModal`・`.material-modal{height:80vh}`。
5. **hover依存でタッチ端末から触れない要素がある（実バグ）。**
   - `.btn-copy`（本文コピー）は `opacity:0` ＋ `:hover` → タッチ端末では永久に出ない。
   - `.ctree-close`（企業の×）も同様 → スマホでは企業を削除できない。
6. **タップ領域が小さい。** `.btn-draft` 約24px、`.year-tab` 約18px。
7. **モーダルがキーボードに隠れる。** 中央寄せカードのため、ソフトキーボードが出ると入力欄が隠れる。
8. **企業モーダルの作業行が潰れる。** `.task-due{flex:0 0 140px}` を引くと名前欄が約150pxしか残らない。

## 全体方針

**ブレークポイントは既存の 640px 1本だけを使う。** 641〜768pxでは現在の220pxサイドバー構成がまだ成立するため、2本目を足さない（設計原則4：余計な抽象化をしない）。

例外は `@media(hover:none)` の1箇所のみ。これは画面幅ではなく入力方式の判定であり、幅のブレークポイントとは別の軸なので併存させる。

---

## 1. サイドバー → ドロワー

≤640px でサイドバーを左からのオーバーレイに切り替える。

- `.sidebar` を `position:fixed; top:0; bottom:0; left:0; z-index:300; width:min(300px,84vw)`
- 既定は `transform:translateX(-100%)` で退避、`transition:transform .22s ease`
- `body.drawer-open .sidebar{transform:none}`
- バックドロップを1枚追加。`#appScreen` 直下の `.app-body` の直前に `<div class="drawer-backdrop" id="drawerBackdrop"></div>` を置く（`position:fixed; inset:0; z-index:299`、`≤640px` かつ `body.drawer-open` のときだけ `display:block`）
- ヘッダー先頭に ☰ ボタンを追加（≤640px のみ表示）
- 既存の `@media(max-width:640px){.sidebar{width:180px;}}` は不要になるので削除する

### 状態

`document.body` の `drawer-open` クラス1つ。JSは `setDrawer(v)` 1関数のみ。
新しいグローバル変数や画面状態の概念は増やさない。

### 開閉のルール

| きっかけ | 動作 | 理由 |
|---|---|---|
| ☰ をタップ | トグル | |
| バックドロップをタップ | 閉じる | |
| Esc キー | 閉じる | |
| **企業**を選ぶ | **閉じない** | 企業を選ぶと設問が展開されるので、続けて設問を選ばせる |
| **設問**を選ぶ | **閉じる** | ここで初めて本文へ移る |
| 「＋ 設問を追加」 | **閉じる** | 追加した設問が選択されるため |
| 起動時（モバイル） | **開く** | 「確認中心」＝開いたら一覧が見える |

「モバイルか」の判定は `window.matchMedia('(max-width:640px)').matches`。CSSと同じ640pxを使い、二重管理にしない。

### 副次的な利点

`company-bar`（提出済み／通過・結果待ち・落選／落ちた段階＋メモ）はサイドバー下部にあるため、ドロワーを開くと**企業ツリーと選考状況が一画面に揃う**。確認中心の用途に合う。

---

## 2. ヘッダー

2段組みにすると高さを食うので、1行のまま中身を削って収める。

| 要素 | ≤640px | 理由 |
|---|---|---|
| ☰ | 追加 | ドロワー開閉 |
| ロゴ | `ES Manager` → `ESM`（95px→30px） | |
| 検索 | 残す（`flex:1` で約200px） | 確認中心の主要導線 |
| ズーム `#zoomCtrl` | 隠す | 執筆用。PCで使える |
| 使用量チップ `.usage-chip` | 隠す | 参考情報。PCで見られる |
| 同期ステータス | ドットのみ（ラベルを隠す） | 設計原則2「データを失わない」上、同期の生死は見えるべき |
| テーマトグル | 残す（62px→48px） | 屋外／夜で実際に切り替える |
| アバター | 残す | 素材庫・Claudeへの指示・使い方・ログアウトの唯一の入口 |

合計 約142px ＋ 検索 → 375pxに収まる。

ロゴ短縮のため、既存のインライン `<span>` 群のうち `anager` の部分を `<span class="logo-long">` で包み、≤640px で `display:none` にする。

検索候補 `.search-results` は `.search-wrap`(max 260px) 内の絶対配置なのでモバイルでは細い。≤640px で `position:fixed; left:8px; right:8px; top:48px` にして画面幅いっぱいに出す。

---

## 3. 本文・エディタ

### 3.1 iOSの自動ズーム対策（最優先）

≤640px で以下を `font-size:16px` にする：`.search-input` `.q-title-input` `.q-limit-input` `.modal-input` `.draft-name` `.cbar-memo`（`.cbar-memo` は対応済み）。

`.q-textarea` はPCのズーム設定 `--textarea-zoom` を持ち込むため、単純な16px指定では**PC側でズームを縮めているとモバイルでも16pxを下回る**。よって：

```css
.q-textarea{font-size:max(16px, calc(14px * var(--textarea-zoom,1)));}
```

### 3.2 `dvh`

`height:100vh; height:100dvh;` の順で併記する（非対応ブラウザは前者を使う）。対象：`#appScreen` `#addCompanyModal`(`max-height`) `#ivModal` `.material-modal`。

### 3.3 余白

≤640px で `.main-content` 24px→`12px 8px`、`.q-header`／`.q-textarea`／`.draft-bar`／`.q-toolbar` の左右 22px→14px。本文の実効幅が 283px → **331px** になる。

### 3.4 hover依存（`@media(hover:none)`）

- `.btn-copy{opacity:1}` — 常時表示にする
- `.ctree-co.active .ctree-close{opacity:1}` — **選択中の企業だけ** ×を出す。全社に出すと誤タップで消えるため、草案ピル（`.draft-pill.active .draft-pill-close`）と同じ流儀に揃える

`.draft-pill-close` は既に `.active` で表示されるので変更不要。

### 3.5 タップ領域

≤640px で `.btn-draft` と `.year-tab` に `min-height:32px`。`.sidebar-add`（＋）は文字16pxのままだと当たり判定が小さいので `padding:6px 10px; margin:-6px -10px` で見た目を変えずにタップ領域だけ広げる。

---

## 4. モーダル

≤640px で全画面化する。

```css
.modal-bg{padding:0;}
.modal,.material-modal{border-radius:0;height:100dvh;display:flex;flex-direction:column;}
.modal-body{flex:1;overflow-y:auto;}
```

理由：フォーム＋ソフトキーボードで可視領域が半分になるため、中央寄せカードだと入力欄が隠れる。

`#addCompanyModal` は現在 `max-height:85vh; overflow-y:auto` を自分で持っているので、全画面化と競合しないよう ≤640px では打ち消す。

### 期限つき作業の行

375pxでは `日付140px` ＋ チェック ＋ 削除 を引くと名前欄が約150pxしか残らない。≤640px で2段に折り返す：

```
[✓] [作業名                    ] [×]
    [日付                      ]
```

`.task-row{flex-wrap:wrap}` ＋ `.task-due{flex:1 0 100%}` で実現する。

---

## 検証方法

このリポジトリにはテスト環境が無い（`index.html` 1ファイル・ビルド工程なし）。前回の「期限切れソート＋落選段階」と同じ方式を踏襲する：

1. **ロジック** — `index.html` から対象関数を抜き出し、最小のDOMシム上で Node から実行する使い捨てスクリプト。今回の対象は `setDrawer()` と開閉ルール（企業を選んでも閉じない／設問を選ぶと閉じる／起動時の初期状態）。
2. **CSS** — 論理的に検証できないので、`python3 -m http.server 8000` ＋ ブラウザのデバイスエミュレーション（375×667 / 390×844）で目視。以下を確認する：
   - ヘッダーが1行に収まり横スクロールが出ない
   - ドロワーが開閉し、設問を選ぶと閉じて本文が全幅になる
   - 各入力欄にフォーカスしてもズームしない（**実機のiOSでのみ確認可能**）
   - 下端（company-bar・モーダルのフッタ）が切れない
   - 本文コピーボタンと選択中企業の×が見える
3. **実機** — iOSの自動ズームとURLバーによる `100vh` の挙動はエミュレータでは再現しきれないため、**弟のスマホまたは作者のiPhoneでの確認を必須とする**。

## リスク

- **PC版のデグレ。** 変更の大半は `@media(max-width:640px)` 内に閉じる。メディアクエリ外に出るのは `#appScreen` の `dvh` 併記、ロゴの `<span class="logo-long">` 追加、☰ ボタンの追加（既定 `display:none`）、バックドロップ要素の追加（既定 `display:none`）の4点。`.q-textarea` の `font-size` はメディアクエリ内に入れる（外に出すとPCの14pxが16pxに変わってしまうため）。PC幅での目視確認を実装後に必ず行う。
- **CSSの記述位置。** メディアクエリは詳細度を上げないため、同一詳細度なら後に書いたほうが勝つ。`.material-modal`(height:80dvh) や `#ivModal` は `<style>` の後方で定義されているので、**レスポンシブのブロックは `<style>` の末尾に置かなければ効かない**。加えて `style="max-width:360px"` をインラインで持つモーダルが2つあるため、そこだけ `!important` が要る。
- **`@media(hover:none)` はタッチ対応ノートPCにも当たる。** 影響はコピーボタンと企業×が常時見えるだけで、実害は無いと判断する。
- **`dvh` はiOS 15.4以降**。それ以前は `vh` にフォールバックし、現状と同じ挙動になる（悪化はしない）。

## 決定事項

- ブレークポイントは 640px 1本。`@media(hover:none)` のみ別軸として併存。
- ドロワーは企業選択では閉じず、設問選択で閉じる。
- モバイル起動時は**常に**ドロワーを開く（C案）。当初は「企業未選択のときだけ」としていたが、
  `activeCompanyId` はクラウドに保存され復元されるため、2回目以降の起動では必ず企業が選択済みになり
  条件がほぼ成立しない＝機能が死ぬ。「確認中心」という用途にも常時オープンのほうが合う。
- ズームと使用量チップはモバイルで隠す。同期はドットのみ残す。
- モーダルはモバイルで全画面。ボトムシートは採用しない（キーボード表示時に不利なため）。
- スマホでの執筆最適化は非目標。
