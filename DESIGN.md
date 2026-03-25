# Passgen UI リデザイン設計書

## 1. 設計方針

**原則**: 1つの情報は1箇所にしか入力しない。操作は文脈に応じて出し分ける。

## 2. レイアウト構造

現状の「単体モード / 一括発行モード」タブを廃止し、**ワークフロー型3ステップ構造**に変更する。

```
┌─────────────────────────────────────────────────┐
│ Passgen                                          │
├─────────────────────────────────────────────────┤
│                                                   │
│  STEP 1: ユーザーデータ                           │
│  ┌───────────────────────────────────────────┐   │
│  │ [スマート入力エリア]                        │   │
│  │ テキスト/CSV/スプレッドシートを             │   │
│  │ ペーストまたはファイルドロップ               │   │
│  │                                             │   │
│  │ → 自動カラム検出 + マッピングUI             │   │
│  └───────────────────────────────────────────┘   │
│  または: [1人分を手入力] ← 展開式               │   │
│                                                   │
│  STEP 2: パスワード生成                           │
│  ┌─ 設定バー ──────────────────────────────┐   │
│  │ [長さ ▾] [特殊文字 ▾] [☑大文字][☑数字] │   │
│  │ [☑記号]              [■ 生成] [■ 再生成]│   │
│  └─────────────────────────────────────────┘   │
│                                                   │
│  ┌─ 結果テーブル ───────────────────────────┐   │
│  │ ☑ No  名前    ID     PW        読み  ↻  │   │
│  │ ☑ 1  山田太郎 yamada !Haru3Umi  ハル-ウミ│   │
│  │ ☑ 2  佐藤花子 sato   Kaze$4Rin  カゼ-リン│   │
│  │ ...                                       │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  STEP 3: 出力                                     │
│  ┌─ 通知書設定（折りたたみ） ─────────────┐   │
│  │ 組織名   システム名  URL  発行者  備考  │   │
│  └─────────────────────────────────────────┘   │
│  ┌─ 出力ボタン群 ─────────────────────────┐   │
│  │ [印刷]                                   │   │
│  │  ├ アカウント通知書 (A4個別)              │   │
│  │  └ パスワード一覧                         │   │
│  │ [CSV出力]                                 │   │
│  │  ├ 汎用CSV                                │   │
│  │  ├ Google Workspace ▸ [新規][更新][削除] │   │
│  │  ├ Microsoft 365    ▸ [新規][更新]       │   │
│  │  └ Apple ABM                              │   │
│  │ [クラウド設定] ← ドメイン等はここに集約   │   │
│  └─────────────────────────────────────────┘   │
│                                                   │
└─────────────────────────────────────────────────┘
```

## 3. スマート入力 (Smart Paste) 仕様

### 3.1 トリガー

- テキストエリアへの `paste` イベント
- CSVファイルの `drop` / `input[type=file]`
- 手動テキスト入力後の「解析」ボタン

### 3.2 自動検出ロジック

```
入力テキスト
  │
  ├─ 行数 == 1 → 1人分として処理
  │
  ├─ 行数 >= 2
  │    │
  │    ├─ 1行目がヘッダーっぽい？ → ヘッダー行として解析
  │    │   (判定: "名前","name","姓","first","last","mail","email","id" 等を含む)
  │    │
  │    └─ データ行のみ → 列数で推定
  │        ├ 1列 → 全て「名前」
  │        ├ 2列 → 「名前, ID」
  │        ├ 3列 → 「姓, 名, ID」
  │        └ 4列以上 → マッピングUI表示
  │
  └─ 区切り文字の自動検出
       ├ TAB → TSV (スプレッドシートコピペ)
       ├ カンマ → CSV
       └ 複数スペース → スペース区切り
```

### 3.3 カラムマッピングUI

ヘッダーが不明確、または4列以上の場合に表示:

```
┌─ カラムマッピング ──────────────────────────┐
│                                               │
│  検出: 5列 × 4行のデータ                     │
│                                               │
│  列1 "山田"    → [姓 (Last Name)        ▾]  │
│  列2 "太郎"    → [名 (First Name)       ▾]  │
│  列3 "yamada"  → [ログインID            ▾]  │
│  列4 "yamada@" → [メールアドレス        ▾]  │
│  列5 "営業部"  → [スキップ（使用しない）▾]  │
│                                               │
│  プレビュー:                                  │
│  名前: 山田 太郎 / ID: yamada                 │
│  名前: 佐藤 花子 / ID: sato                  │
│                                               │
│  [適用] [キャンセル]                          │
└───────────────────────────────────────────────┘
```

**マッピング選択肢:**
- 姓 (Last Name)
- 名 (First Name)
- フルネーム (名前全体)
- ログインID
- メールアドレス (→ @より前をIDとして使用)
- スキップ（使用しない）

**自動マッピングヒューリスティクス:**
| ヘッダー / データパターン | マッピング先 |
|---|---|
| "姓","last_name","Last Name","family" | 姓 |
| "名","first_name","First Name","given" | 名 |
| "氏名","名前","name","display" | フルネーム |
| "ID","login","user","account","ユーザー" | ログインID |
| "@"を含むデータ | メールアドレス |
| 全て漢字/かな & 1-4文字 | 姓 or 名 (位置で判定) |
| 全てASCII & ドットを含む | ログインID |

## 4. 出力ボタンの整理

### 現状 (11ボタン フラット)
```
[全選択][通知書][一覧][CSV][GWS新規][GWS更新][GWS削除][M365新規][M365更新][ABM][クリア]
```

### 改善: ドロップダウンメニュー方式
```
[■ 通知書印刷 ▾]   [■ CSV出力 ▾]   [全選択] [クリア]
  ├ アカウント通知書    ├ 汎用CSV
  └ パスワード一覧      ├ ── GWS ──
                         │  新規追加
                         │  更新
                         │  削除
                         ├ ── M365 ──
                         │  新規追加
                         │  更新
                         ├ ── Apple ──
                         │  ABM参照用
                         └─────────
```

### 実装: `<details>` + ドロップダウンメニュー

```html
<div class="dropdown">
  <button class="btn btn-primary">CSV出力 ▾</button>
  <div class="dropdown-menu">
    <button onclick="bulkExportCSV()">汎用CSV</button>
    <div class="dropdown-divider">Google Workspace</div>
    <button onclick="gwsExportAdd()">新規追加</button>
    <button onclick="gwsExportUpdate()">更新（PW変更）</button>
    <button onclick="gwsExportDelete()">削除</button>
    <div class="dropdown-divider">Microsoft 365</div>
    <button onclick="m365ExportAdd()">新規追加</button>
    <button onclick="m365ExportUpdate()">更新（PW変更）</button>
    <div class="dropdown-divider">Apple</div>
    <button onclick="abmExportAdd()">ABM参照用</button>
  </div>
</div>
```

## 5. フォーム統合

### 現状の重複
| フィールド | 単体モード | 一括モード |
|---|---|---|
| 組織名 | orgName | bulkOrgName |
| システム名 | systemName | bulkSystemName |
| ログインURL | loginUrl | bulkLoginUrl |
| 発行者 | issuerName | bulkIssuerName |
| 備考 | noticeRemarks | bulkRemarks |
| パスワード長 | lengthPref | bulkLengthPref |
| 特殊文字 | symbolSet | bulkSymbolSet |

### 統合後
重複フィールドを1つに統合。localStorage のキーも統合。

- `orgName` (共通)
- `systemName` (共通)
- `loginUrl` (共通)
- `issuerName` (共通)
- `remarks` (共通)
- `lengthPref` (共通)
- `symbolSet` (共通)
- `realName` / `userName` → 単体モード時のみ (1人分入力)

## 6. 新しいHTML構造

```
body
├── h1 + subtitle
├── STEP 1: ユーザーデータ入力
│   ├── スマート入力エリア (textarea + drag&drop)
│   ├── カラムマッピングUI (動的表示)
│   ├── 「または1人分を入力」折りたたみ
│   │   └── 名前 + ログインID
│   └── 解析済みユーザー件数表示
├── STEP 2: パスワード生成
│   ├── 設定バー (長さ, 特殊文字, チェックボックス, 生成ボタン)
│   └── 結果テーブル
├── STEP 3: 出力
│   ├── 通知書設定 (折りたたみパネル)
│   │   └── 組織名, システム名, URL, 発行者, 備考
│   ├── クラウド設定 (折りたたみパネル)
│   │   └── ドメイン, OrgUnit, M365 Location, ABM Role
│   └── 出力ボタン群
│       ├── [通知書印刷 ▾] ドロップダウン
│       ├── [CSV出力 ▾] ドロップダウン
│       └── [全選択] [クリア]
└── toast
```

## 7. スマート入力の状態遷移

```
[空] ─── paste/drop/input ───→ [解析中]
                                   │
                         ┌─────────┼──────────┐
                         │         │          │
                    [即確定]  [マッピングUI]  [エラー]
                    (2列以下    (3列以上      (パース
                     自動判定)   要確認)       失敗)
                         │         │          │
                         │    [ユーザー確認]   │
                         │    [適用]ボタン     │
                         │         │          │
                         └────→[確定]←────────┘
                                   │
                              ユーザーリスト
                              配列に格納
                                   │
                              テーブルに
                              プレビュー表示
```

## 8. CSS設計

### ドロップダウンメニュー
```css
.dropdown { position: relative; display: inline-block; }
.dropdown-menu {
  display: none; position: absolute; top: 100%; left: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: .4rem 0; min-width: 200px;
  box-shadow: 0 8px 24px rgba(0,0,0,.3); z-index: 50;
}
.dropdown.open .dropdown-menu { display: block; }
.dropdown-menu button {
  display: block; width: 100%; text-align: left;
  padding: .5rem 1rem; border: none; background: none;
  color: var(--text); font-family: inherit; cursor: pointer;
}
.dropdown-menu button:hover { background: var(--surface2); }
.dropdown-divider {
  padding: .3rem 1rem; font-size: .7rem; color: var(--text2);
  border-top: 1px solid var(--border); margin-top: .3rem;
}
```

### スマート入力エリア
```css
.smart-input {
  border: 2px dashed var(--border); border-radius: 8px;
  padding: 1.5rem; text-align: center; transition: all .2s;
  cursor: pointer; position: relative;
}
.smart-input.dragover { border-color: var(--accent); background: rgba(99,102,241,.05); }
.smart-input textarea {
  width: 100%; min-height: 120px; border: none;
  background: transparent; color: var(--text);
  font-family: Consolas, monospace; resize: vertical;
}
```

### カラムマッピング
```css
.mapping-ui { background: var(--surface2); border-radius: 6px; padding: 1rem; }
.mapping-row {
  display: flex; align-items: center; gap: 1rem;
  padding: .4rem 0; border-bottom: 1px solid var(--border);
}
.mapping-sample {
  flex: 0 0 120px; font-family: Consolas, monospace;
  color: var(--green); overflow: hidden; text-overflow: ellipsis;
}
.mapping-arrow { color: var(--text2); }
.mapping-select select { background: var(--surface); color: var(--text); }
```

## 9. 実装優先度

| # | 項目 | 重要度 | 工数 |
|---|---|---|---|
| 1 | フォーム統合 (重複排除) | 高 | 小 |
| 2 | ドロップダウンメニュー化 | 高 | 小 |
| 3 | 3ステップ構造への再構成 | 高 | 中 |
| 4 | スマート入力 (paste検出 + 自動判定) | 高 | 中 |
| 5 | カラムマッピングUI | 中 | 大 |
| 6 | ドラッグ&ドロップ対応 | 低 | 小 |

推奨実装順: 1 → 2 → 3 → 4 → 5 → 6
