# Study モジュール統合設計書（YPT-for-me → LifeOS）

> **目的**: 学習トラッカー `YPT-for-me`（NFC × iOSショートカット × 自動コンテキスト付与）を、`LifeOS` の `/study` モジュールとしてモノリス統合し、**「Plan（LifeOS）× Actual（Study）」の閉ループ**を実現する。

---

## 1. 確定した設計方針（Decision Log）

| 項目 | 決定事項 | 理由 |
| :--- | :--- | :--- |
| **統合形態** | **案A：LifeOS への完全モノリス統合**（単一 Next.js 16 アプリ ＋ 単一 Supabase） | SQL レベルで `Goal / Project / Task` と `study_sessions` を結合でき、認証・デプロイ・DB 管理を一本化できるため |
| **公開ダッシュボード** | **廃止**（ログイン済み本人のみ閲覧） | LT 登壇時はログイン済み画面を表示すればよいため。二重 DTO（`PublicSessionDto` / `AdminSessionDto`）と `anon` 向け Realtime 境界を撤去し、LT 時は UI の「マスク表示トグル」で自宅座標・SSID・メモを隠す |
| **認証方式（ブラウザ）** | **Supabase Auth（Cookie / Passkey）に統一** | 旧 `AdminGate`（パスコード）および `ypt_admin_session` Cookie を廃止 |
| **認証方式（NFC / 外部連携）** | **案2：`api_tokens` テーブルによる Personal API Token 発行・失効** | `/settings` からブラウザ完結で発行・失効でき、将来 `Habits` / `Finance` 等のショートカット連携にも共通基盤として使い回せるため |
| **テーブル命名** | **`study_` プレフィックス＋全テーブル `user_id` + RLS** | LifeOS 内の他モジュールとの名前衝突を防ぎ、既存テーブル（`periods`, `goals`, `projects`, `tasks`, `events`）と RLS 設計を統一するため |
| **既存データ移行** | **UUID 維持で全件引き継ぎ** | 外部キー参照とオフライン同期の冪等性キー（`start_event_id` / `stop_event_id`）を壊さず無停止移行するため |

---

## 2. ドメインモデル設計：「ゼロ摩擦」と「2層バインディング」

`YPT-for-me` 最大の価値である **「NFC にかざすだけ（入力摩擦ゼロ）」** を維持しつつ、LifeOS の計画モデルと繋ぐ。

### 2層バインディング
1. **Layer 1（必須・ゼロ摩擦）**
   - 従来通り `category_id` のみで即打刻。NFC タグ・iOS ショートカット・オフライン同期キューの体験は一切変えない。
2. **Layer 2（任意・緩やかな紐付け）**
   - `study_sessions` に nullable な `goal_id`, `project_id`, `task_id`（いずれも `ON DELETE SET NULL`）を持たせる。
   - **開始時紐付け**：LifeOS の `/tasks` や `/goals` から「このタスク / プロジェクトで計測開始」を押した時は自動で紐付く。
   - **事後紐付け**：NFC で打刻したセッションは、後から `/study` の History / 振り返り画面で Project / Task に紐付け可能（未紐付けのままでも OK）。
3. **`Period` との連携は動的導出**
   - `study_sessions` に `period_id` カラムは持たせず、`started_at`（`day_boundary_hour` を考慮した論理日付）と `periods.start_date`〜`end_date` の範囲で自動集計する。Period の期間調整にも強い。

---

## 3. DB スキーマ設計（LifeOS Supabase）

全テーブルで RLS を有効化し、`auth.uid() = user_id` を基本ポリシーとする。

### 3.1 共通基盤テーブル（新設）

#### `public.api_tokens`
外部トリガー（iOS ショートカット・NFC・将来の自動化）向けの Personal Access Token。

| カラム | 型 | 制約 / 説明 |
| :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` |
| `name` | `text` | `NOT NULL`（例: `iPhone NFC`） |
| `token_prefix` | `text` | `NOT NULL`（識別表示用の先頭数文字。例: `lifeos_9a3f`） |
| `token_hash` | `text` | `NOT NULL UNIQUE`（SHA-256 ハッシュ値。生トークンは保存しない） |
| `scopes` | `text[]` | `NOT NULL DEFAULT '{study:write}'`（将来の他モジュール拡張用） |
| `last_used_at` | `timestamptz` | 最終利用日時 |
| `revoked_at` | `timestamptz` | 失効日時（`NULL` の間有効） |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- **RLS / 権限**: `authenticated` は自身の行の `SELECT`（`token_hash` を除く列のみ）と `DELETE` のみ可能。発行（`INSERT`）と `last_used_at` の更新はサーバー側の `Service Role` クライアントで行う。
- **検証フロー**: Bearer トークン受信時にサーバー側で SHA-256 を計算し、`Service Role` クライアントで `token_hash` 一致かつ `revoked_at IS NULL` を照合して `user_id` を解決する（`last_used_at` を更新）。

---

### 3.2 Study モジュールテーブル（新設）

#### `public.study_settings`（旧 `app_settings`）
- `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `day_boundary_hour smallint NOT NULL DEFAULT 4 CHECK (day_boundary_hour BETWEEN 0 AND 6)`
- `streak_min_minutes integer NOT NULL DEFAULT 30 CHECK (streak_min_minutes >= 0)`
- `daily_goal_weekday_min integer NOT NULL DEFAULT 180 CHECK (daily_goal_weekday_min > 0)`
- `daily_goal_weekend_min integer NOT NULL DEFAULT 360 CHECK (daily_goal_weekend_min > 0)`
- `long_session_warn_min integer NOT NULL DEFAULT 360 CHECK (long_session_warn_min > 0)`
- `univ_periods jsonb NOT NULL DEFAULT '[...]'::jsonb`
- `updated_at timestamptz NOT NULL DEFAULT now()`

#### `public.study_categories`（旧 `categories`）
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `name text NOT NULL`
- `color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$')`
- `sort_order integer NOT NULL DEFAULT 0`
- `is_archived boolean NOT NULL DEFAULT false`
- `created_at timestamptz NOT NULL DEFAULT now()`
- 制約：`UNIQUE(user_id, name)`

#### `public.study_spots`（旧 `spots`）
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `name text NOT NULL`
- `spot_group text NOT NULL DEFAULT 'Other' CHECK (spot_group IN ('Home', 'Univ', 'Cafe', 'Other'))`
- `latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90)`
- `longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180)`
- `radius_m integer NOT NULL DEFAULT 50 CHECK (radius_m > 0)`
- `wifi_ssid text`
- `created_at timestamptz NOT NULL DEFAULT now()`
- 制約：`UNIQUE(user_id, name)`

#### `public.study_sessions`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `category_id uuid NOT NULL REFERENCES public.study_categories(id)`（`ON DELETE NO ACTION`。使用中カテゴリの削除は防ぎつつ、チェックを文末まで遅らせて `auth.users` 削除時のカスケードと競合しないようにする）
- `spot_id uuid REFERENCES public.study_spots(id) ON DELETE SET NULL`
- **LifeOS 連携（任意）**:
  - `goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL`
  - `project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL`
  - `task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL`
- **コンテキスト・計測項目（旧 YPT 踏襲）**:
  - `location_label text NOT NULL DEFAULT 'Other'`
  - `memo text`, `tag_id text`, `wifi_ssid text`
  - `latitude double precision`, `longitude double precision`
  - `weather_code smallint`, `temperature_c real`, `pressure_hpa real`, `pressure_diff_3h real`, `pressure_diff_6h real`
  - `day_type text CHECK (day_type IS NULL OR day_type IN ('weekday', 'weekend', 'holiday'))`
  - `univ_period text`
  - `needs_review boolean NOT NULL DEFAULT false`
  - `start_event_id text`, `stop_event_id text`
  - `started_at timestamptz NOT NULL DEFAULT now()`
  - `ended_at timestamptz`
  - `duration_sec integer CHECK (duration_sec IS NULL OR duration_sec >= 0)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
- **制約・インデックス**:
  - `CHECK (ended_at IS NULL OR ended_at >= started_at)`
  - 単一アクティブ制約：`UNIQUE INDEX ON study_sessions (user_id) WHERE ended_at IS NULL`
  - 冪等性制約：`UNIQUE INDEX ON study_sessions (user_id, start_event_id) WHERE start_event_id IS NOT NULL`
  - 冪等性制約：`UNIQUE INDEX ON study_sessions (user_id, stop_event_id) WHERE stop_event_id IS NOT NULL`
  - インデックス：`(user_id, started_at DESC)`, `(user_id, category_id)`, `(user_id, spot_id)`, `(user_id, task_id)`, `(user_id, project_id)`, `(user_id, goal_id)`

#### Realtime 購読
- 公開ダッシュボード廃止に伴い、`anon` ポリシーは作らない。
- `study_sessions` テーブル自体（または `user_id` を主キーとする `study_realtime_signals`）を `authenticated` + `auth.uid() = user_id` RLS の下で Realtime 購読し、NFC 打刻時に開いているブラウザのタイマーを即座に同期する。

---

## 4. 認証・ミドルウェア・API 設計（2レーン構成）

### 4.1 `src/utils/supabase/middleware.ts` の変更点
- 現在：`/login`, `/auth` 以外は未認証なら `/login` へリダイレクト。
- 統合後：**`/api/study/`**（および将来 `/api/v1/` 等の外部 API）をリダイレクト対象から除外する。
  - 代わりに、各 API Route Handler の先頭で必ず認証関数（`resolveStudyAuth(request)`）を呼び、未認証なら `401 Unauthorized` JSON を返す。

### 4.2 認証の2レーン
1. **レーン1：ブラウザ（LifeOS 本体＆`/study`）**
   - Cookie の Supabase Auth セッションを `supabase.auth.getUser()` で検証し `user.id` を取得。
2. **レーン2：iOS ショートカット / NFC（`/api/study/start`, `stop`, `toggle`, `status`, `sync`）**
   - `Authorization: Bearer <token>` を検証（`api_tokens` テーブル照合）し `user.id` を取得。
   - ※ ブラウザからも同じエンドポイントを叩けるよう、`resolveStudyAuth(request)` は「Bearer Token があればトークン検証、なければ Cookie の Supabase Auth を検証」の順で統一すると重複が減る。

### 4.3 API エンドポイント構成
- **打刻・同期系（NFC / ブラウザ両対応）**
  - `GET /api/study/status`
  - `POST /api/study/start`（任意の `goal_id`, `project_id`, `task_id` を受け付け可能に拡張）
  - `POST /api/study/stop`
  - `POST /api/study/toggle`
  - `POST /api/study/sync`
- **ダッシュボード・分析系（ブラウザ）**
  - `GET /api/study/dashboard`
  - `GET /api/study/analytics`
- **管理 CRUD 系（ブラウザ）**
  - `GET/POST /api/study/sessions`, `PATCH/DELETE /api/study/sessions/[id]`
  - `GET/POST/PATCH/DELETE /api/study/categories`
  - `GET/POST/PATCH/DELETE /api/study/spots`, `POST /api/study/spots/[id]/reapply`
  - `GET/PATCH /api/study/settings`
- **API トークン管理（ブラウザ・`/settings` 用）**
  - `GET/POST /api/settings/tokens`
  - `DELETE /api/settings/tokens/[id]`（失効 / 削除）

### 4.4 サービス層とテストの引き継ぎ
- YPT のロジック層（`geo.ts`, `time.ts`, `weather.ts`, `study-service.ts`, `study-sync.ts`, `dashboard-service.ts`, `analytics-service.ts`, `admin-validation.ts`）を LifeOS の `src/lib/study/` に移植。
- 全サービス関数に `userId: string` を明示的に渡す設計へ変更。
- LifeOS に Vitest を導入し、YPT の単体テスト群をそのまま引き継いで回帰を防ぐ。

---

## 5. UI / 情報設計

### 5.1 ナビゲーション
- [Sidebar.tsx](file:///home/sora0311/dev/LifeOS/src/components/layout/Sidebar.tsx) の `Study` (`/study`) から `comingSoon: true` を外す。

### 5.2 LifeOS トップ（`/`）
- 既存カード（`Tasks & Projects`, `Goals & Focus`, `Events`）と並べて **「Study Today」カード**を追加：
  - 計測中タイマー（稼働中はリアルタイムカウント＋カテゴリ名＋ワンクリック停止）
  - 今日の累計時間 / Daily Goal 進捗バー / Streak 日数
  - `/study` へのリンク

### 5.3 `/study` ページ（旧 `/` と `/admin` を統合）
タブ構成で 1 画面に整理し、右上に **「LT マスク（座標・Wi-Fi SSID・メモを非表示）」トグル** と **タイマー拡大ボタン** を配置：
1. **Overview**：リアルタイムタイマー、KPI（今日・今週・Streak・Daily Goal）、科目別内訳、手動 Start/Stop（任意で Project / Task を選択可）
2. **History**：セッション一覧、要確認（`needs_review`）フィルタ＆補正、インライン編集、**Project / Task への事後紐付け**
3. **Analytics**：草カレンダー、曜日×時間帯ヒートマップ、大学時限別、スポット別、天気・気圧差別 ＋ **Period / Goal / Project 別学習時間**
4. **Manage**：カテゴリ管理、スポット管理（未登録座標・未登録 Wi-Fi SSID の逆引き登録＆過去ログ一括再判定）、Study 設定（日付境界・時限・目標時間・長時間警告）

### 5.4 `/settings` ページ（既存パスキー管理に統合）
- 既存の「パスキーを追加登録」「登録済みのパスキー」セクションの下に **「API トークン（ショートカット・外部連携）」** セクションを追加：
  - トークン名を入力して発行 → 生成された生トークンをモーダル/バナーで **1回だけ表示＆コピーボタン**
  - 発行済みトークン一覧（名前・プレフィックス・作成日・最終利用日・失効/削除ボタン）

### 5.5 Tasks / Goals 画面とのクロス連携（Phase 4）
- Task / Project の各行に「累計学習時間バッジ」と「Play（タイマー開始）」ボタンを配置。

---

## 6. 既存データ移行計画（ゼロロス・無停止切替）

### 移行原則
- 旧 YPT Supabase の `categories`, `spots`, `study_sessions` の **UUID をそのまま維持**し、LifeOS の自分の `user_id` を付与して投入する。
- 移行スクリプトは `ON CONFLICT (id) DO NOTHING` で**冪等**に作成し、何度再実行しても重複しないようにする。

### 実行手順
1. **スキーマ適用**：LifeOS Supabase に新テーブル（`api_tokens`, `study_*`）＋ RLS ＋ トリガーのマイグレーションを適用。
2. **環境変数追加**：LifeOS（ローカル & Vercel）に `SUPABASE_SERVICE_ROLE_KEY` を設定（NFC API のトークン照合・サーバー書き込み用）。
3. **初回テスト移行**：旧 YPT Supabase から全テーブルをエクスポートし、LifeOS Supabase へ `study_settings` → `study_categories` → `study_spots` → `study_sessions` の順で投入。
4. **突合検証**：テーブルごとの件数・`duration_sec` 合計・最新セッション日時が旧 DB と完全一致することを確認。
5. **iOS ショートカット切替**：
   - LifeOS の `/settings` で `iPhone NFC` 用 API トークンを発行。
   - セッション未計測のタイミングで旧 DB から差分最終同期を実行。
   - iOS ショートカットの送信先 URL（LifeOS 本番 URL）と `Authorization: Bearer <新トークン>` を更新し、NFC タップで Start / Stop を実機確認。
6. **完了後**：数日の安定稼働を確認して旧 `YPT-for-me` をアーカイブ。
   - ※ 旧 `YPT-for-me` は削除せず **アーカイブ（読み取り専用保存）** として残す（GitHub リポジトリはいつでも Unarchive 可能、移行時のデータバックアップも保持）。将来単体アプリとして復活・再利用したくなった場合でも復元できる構成とする。

---

## 7. 実装フェーズ（ロードマップ）

| Phase | スコープ | 完了条件 |
| :--- | :--- | :--- |
| **Phase 1：DB & 認証基盤** | `api_tokens` + `study_*` マイグレーション、`/settings` のトークン発行/失効 UI、`middleware.ts` 例外設定、`resolveStudyAuth` | `/settings` でトークンを発行・失効でき、Bearer 認証が通る |
| **Phase 2：Study API & ロジック移植** | `src/lib/study/*` + Vitest テスト移植、`/api/study/*` 全ルート実装、既存データ移行スクリプト作成＆テスト移行 | Vitest 全パス、NFC ショートカットから LifeOS に打刻できる |
| **Phase 3：`/study` UI & トップ統合** | `/study`（Overview / History / Analytics / Manage + LT マスク）、トップ `/` の「Study Today」カード、サイドバー有効化 | 旧 YPT の全機能が LifeOS 内で完結し、旧アプリを閉じられる |
| **Phase 4：Plan × Actual クロス連携** | Task / Project からのタイマー起動、History での事後紐付け、Period / Goal / Project 別学習時間集計 | LifeOS の計画と Study の実績が双方向に繋がる |
