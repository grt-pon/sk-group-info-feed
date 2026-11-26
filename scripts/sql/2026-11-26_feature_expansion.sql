-- SKグループ情報フィード: 機能拡張用マイグレーション(2026-11-26)
-- Supabaseの SQL Editor で実行してください。既存データは変更しません。

-- items テーブルへの列追加
alter table items add column if not exists region text not null default '全国・海外';
alter table items add column if not exists source_type text not null default '企業';
alter table items add column if not exists is_paywalled boolean not null default false;
alter table items add column if not exists is_important boolean not null default false;
alter table items add column if not exists view_count integer not null default 0;

-- 品目別の相場推移データ(記事本体とは独立して長期保存。記事が1ヶ月で削除されても残る)
create table if not exists price_points (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete set null,
  commodity text not null,
  price numeric not null,
  unit text,
  price_date date not null,
  created_at timestamptz not null default now()
);

-- サイトのアクセスログ(インプレッション分析レポート用)
create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  viewed_at timestamptz not null default now()
);

-- RLS(行レベルセキュリティ)を有効にする(ポリシーは追加しない=誰からも直接の読み書きを許可しない)。
-- アプリのバックエンドはservice_roleキーを使っており、RLSが有効でも常に素通りするため動作には影響しない。
-- 一方、万一anonキーが別の場所で使われる・漏れるようなことがあっても、このテーブルが
-- 無断で読み書きされないための保険になる(items等の既存テーブルは今回の変更対象外のため触っていない)。
alter table price_points enable row level security;
alter table page_views enable row level security;

-- 既存の analysis_reports テーブルに種別列を追加し、
-- 週次の反応傾向分析(weekly_analysis)とアクセスレポート(impression)を1つのテーブルで区別する
alter table analysis_reports add column if not exists report_type text not null default 'weekly_analysis';
