-- SupabaseのSQL Editorでこのファイルの内容を実行してください。
-- items テーブル: 収集・要約済みの記事1件につき1行(元記事の全文は保存しない)。

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  source_url text not null,
  source_id text not null,
  source_name text not null,
  is_primary_source boolean not null default false,
  categories text[] not null default '{}',
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  reactions jsonb not null default '[]'::jsonb
);

-- 重複排除(source_url + published_at)のチェックを速くするための索引
create index if not exists items_source_url_published_at_idx
  on items (source_url, published_at);

-- 参考: 他の人がSupabaseの「Table Editor」で直接データを見たり、SQLで集計したりできます。
-- 例: カテゴリ別の件数
-- select unnest(categories) as category, count(*) from items group by category order by count(*) desc;

-- feedback テーブル: 全社公開後の「使い勝手フィードバック」欄(部署・名前・内容)。
-- repliesは返信(現時点では誰でも投稿可、将来的に管理者限定にする可能性あり)を
-- itemsのreactionsと同様にjsonb配列として1レコード内に持たせる方式。
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  department text,
  name text,
  content text not null,
  created_at timestamptz not null default now(),
  replies jsonb not null default '[]'::jsonb
);

-- 既にfeedbackテーブルを作成済みの場合にrepliesカラムを追加するための文(2回目以降は無害)
alter table feedback add column if not exists replies jsonb not null default '[]'::jsonb;
