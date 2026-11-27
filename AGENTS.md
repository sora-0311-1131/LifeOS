<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# LifeOS Agent Rules

> `CLAUDE.md` は `@AGENTS.md` でこのファイルを参照しているため、Antigravity / Claude Code 共通の恒久ルールはここに集約する。

## 1. 作業開始前に読むドキュメント

- `docs/handoff-for-antigravity.md` — 現在の進捗・DB の実状態・直近の注意点（最重要）
- `docs/study-integration-design.md` — Study 統合の設計方針・DB スキーマ・API / UI 仕様
- `docs/study-integration-workflow.md` — ステップ別のブランチ名・実装スコープ・検証項目

## 2. 役割分担（現在の運用）

- **Antigravity**: 基本の実装、ローカル検証（型チェック / lint / test / build）、PR 作成
- **Claude（GitHub 上 + ローカル）**: PR レビュー（`Claude Code Review` / `@claude`）、指摘の修正、マージ、および必要に応じた実装・引き継ぎメモ更新
- 役割分担や運用を変更する場合は、本ファイルまたは `docs/handoff-for-antigravity.md` を更新して共有する。

## 3. Git / PR ルール

- **1ステップ = 1ブランチ = 1 PR** で進める。ブランチは常に最新の `main` から切る。
- PR 作成時は説明文に **変更内容 / 確認手順 / 設計書との対応箇所** を記載する。
- **`main` へのマージはユーザーの明示的な指示があるときのみ**行う。
- PR マージ後の作業ブランチは削除する。

## 4. Supabase / セキュリティ運用ルール

- 本番 Supabase プロジェクトは **`LifeOS`（ref: `yrrtrgedefzlkeqfcjyj`）**。同じ組織の `ypt-for-me` は移行元のため変更しない。
- **`supabase db push` は使用しない**（リポジトリのファイル名と本番マイグレーション履歴番号が一致していないため、適用は Claude Code の Supabase MCP または SQL Editor で行う）。
- 新規テーブル作成時は必ず RLS ポリシーを定義し、`revoke all on table ... from anon;` を明示する（本番には `ensure_rls` イベントトリガーがあるため、ポリシー未定義だとアクセス不能になる）。
- `SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` を絶対に付けない。Service Role クライアントには `import 'server-only'` を記載する。
