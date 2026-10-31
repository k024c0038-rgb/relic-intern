# TabiAI（仮）

AIが一人ひとりに合った旅行プランを作るWebアプリです。メイン観光地・好み・予算・日数・移動手段を入力すると、Google Places の**実在するスポットの中から**AI（Claude）が選び、Routes API の実際の移動時間で調整した1日ごとのスケジュールを提案します。

- 技術スタック：Next.js 16（App Router）/ TypeScript / React 19 / Tailwind CSS v4 / shadcn/ui / Supabase / Claude API / zod / Google Places API (New)・Routes API・Maps JavaScript API / next-intl（日本語・中国語・英語）

## ページ

| パス | 内容 |
|---|---|
| `/` | 旅行条件入力・AIでプラン作成 |
| `/plan/[id]` | プラン表示（タイムライン・地図・写真追加・保存・再作成・シェア） |
| `/nearby/[placeId]` | 周辺おすすめ（観光／グルメ／宿・一緒に回られているスポット・みんなのルート・AIおすすめルート） |
| `/posts` | 投稿一覧（種類・地域・並び替え） |
| `/posts/new` | 投稿作成（グルメ／宿／ルート。`?fromPlan=` でプランのスポットを自動入力） |
| `/posts/[id]` | 投稿詳細（いいね・保存・翻訳・ルートからプラン作成） |
| `/share/[id]?type=plan\|post` | シェア用画像の生成（`/share/[id]/image` で 1080×1350 の PNG） |

## 写真・Googleデータのルール（実装済み）

- 表示する写真は加工していない実際の写真のみ。AIで画像は生成しません。
- Google の写真は `google_place_id` だけを保存し、表示のたびに `/api/photo` 経由で取得。撮影者のクレジットを必ず表示します。
- 緯度・経度もDBに保存せず、表示のたびに取得します。
- ユーザーの写真はリサイズ・圧縮もせず、そのまま Supabase Storage に保存（撮影日時は EXIF から取得）。
- シェア画像にはユーザー自身が撮った写真だけを使います。写真がない場合は、地図風の図とスポット一覧のレイアウトになります。

## プラン作成の仕組み（`src/lib/planner.ts`）

1. メイン観光地の詳細を取得（未選択なら行き先の人気スポットを Text Search）
2. Nearby Search で周辺の観光地・飲食店・宿を取得（徒歩 1.5km／電車・バス 5km／車 20km、閉業は除外）
3. Supabase RPC で投稿の評価・いいね数、ルート投稿で一緒に回られた回数を取得
4. Claude に候補リストと条件を渡し、**候補の中からだけ** `place_id` で選ばせる（構造化出力で JSON）
5. zod で検証し、候補にないスポットがあれば1回だけ作り直させ、残ったものは除外。Routes API で実際の移動時間を計算し、時間が足りなければメイン以外のスポットを減らす

---

## デモモード（外部サービスなしで動かす）

外部サービスのキーが設定されていない場合、そのサービスだけ自動でモックに切り替わります。**環境変数を1つも設定しなくても、Vercel にデプロイすればそのまま動きます。** 画面上部に、どのサービスがモックになっているかが表示されます。

| サービス | キーがないときの動き | 実装 |
|---|---|---|
| Supabase | サンプル投稿入りの簡易DB。デモユーザーとして常にログイン済み。作ったプラン・投稿は Cookie に保存（このブラウザのみ・容量を超えると古いものから削除） | `src/lib/mock/db.ts`、`seed.ts` |
| Google Places / Routes | 京都・東京・大阪・金沢・札幌の実在スポット（名前と位置）の内蔵データ。移動時間は距離から概算 | `src/lib/mock/places.ts` |
| Google Maps | スポットの位置関係を図で表示する簡易マップ | `src/components/map-view.tsx` |
| Claude API | ルールでプランを組み立てる（候補の中からだけ選ぶ点は同じ）。翻訳は原文のまま表示 | `src/lib/mock/ai.ts` |

- デモモードでは、写真のアップロードはできません。また「写真は実物のみ」のルールに従い、ダミー画像は表示しません。
- キーを設定すると、そのサービスだけ本物に切り替わります（`NEXT_PUBLIC_` の値はビルド時に反映されるため、設定後は再デプロイが必要です）。
- `NEXT_PUBLIC_MOCK_MODE=true` にすると、キーがあってもすべてモックで動きます。

---

## デプロイ手順

本番環境は **Vercel（アプリ）＋ Supabase（DB・認証・写真）** を想定しています。以下の4つのアカウント・キーが必要です。

### 1. Supabase

1. [Supabase](https://supabase.com/dashboard) でプロジェクトを作成（リージョンは Tokyo 推奨）
2. **SQL Editor** で `supabase/migrations/20261031000000_init.sql` の内容を実行
   （Supabase CLI を使う場合は `supabase link --project-ref <ref>` → `supabase db push`）
3. **Authentication > URL Configuration**
   - Site URL：`https://<本番ドメイン>`
   - Redirect URLs：`https://<本番ドメイン>/auth/callback`（ローカル開発用に `http://localhost:3000/auth/callback` も）
4. **Project Settings > API** から `Project URL` と `anon public` キーを控える

有料会員にするユーザーは、SQL Editor で次のように設定します（決済連携は未実装）。

```sql
update public.profiles set is_premium = true where id = '<ユーザーID>';
```

### 2. Google Maps Platform

[Google Cloud Console](https://console.cloud.google.com/) で次のAPIを有効化し、キーを2つ作成します。

| キー | 有効にするAPI | 制限 |
|---|---|---|
| サーバー用 `GOOGLE_MAPS_SERVER_KEY` | Places API (New)、Routes API | APIの制限（上記2つ）。ブラウザに出さない |
| ブラウザ用 `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API | HTTPリファラー制限（`https://<本番ドメイン>/*`） |

地図のマーカーに AdvancedMarker を使うため、**Map Management** で Map ID（JavaScript・ベクター）を作成し `NEXT_PUBLIC_GOOGLE_MAP_ID` に設定します（未設定時は `DEMO_MAP_ID`）。

### 3. Claude API

[Claude Console](https://platform.claude.com/) で API キーを作成し、`ANTHROPIC_API_KEY` に設定します。モデルは `src/lib/ai.ts` の `CLAUDE_MODEL`（`claude-opus-5-5`）で変更できます。安全分類器で断られた場合に別モデルで続ける、サーバー側フォールバック（`fallbacks: "default"`）を有効にしています。

### 4. Vercel

1. [Vercel](https://vercel.com/new) でこの GitHub リポジトリをインポート（Framework は Next.js が自動選択されます）
2. **Environment Variables** に `.env.example` の変数をすべて設定

   | 変数 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon キー |
   | `ANTHROPIC_API_KEY` | Claude API キー |
   | `GOOGLE_MAPS_SERVER_KEY` | サーバー用 Google キー |
   | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | ブラウザ用 Google キー |
   | `NEXT_PUBLIC_GOOGLE_MAP_ID` | Map ID |
   | `NEXT_PUBLIC_SITE_URL` | `https://<本番ドメイン>` |

3. **Deploy** を押す。以降は `main` への push で自動デプロイされます
4. デプロイ後のドメインを Supabase の Site URL / Redirect URLs と Google のリファラー制限に反映

プラン作成は周辺検索・AI・移動時間計算をまとめて行うため、`/api/plan` の `maxDuration` を 300 秒にしています（Vercel の Fluid Compute が有効なプランで動作します）。

#### GitHub Actions からデプロイする場合（任意）

Vercel の Git 連携を使わない場合は、リポジトリの **Settings > Secrets and variables > Actions** に `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` を登録すると、`.github/workflows/deploy.yml` が `main` への push で本番デプロイします。

---

## ローカル開発

```bash
cp .env.example .env.local   # 値を設定
npm install
npm run dev
```

- 型チェック：`npm run typecheck`
- ビルド：`npm run build`
- CI（`.github/workflows/ci.yml`）で型チェック・ビルドと、素の Postgres へのマイグレーション適用を確認します

## ディレクトリ構成

```
src/
  app/                 ページと Route Handler（/api/plan, /api/photo, /api/translate など）
  components/          UI部品（ui/ は shadcn/ui 形式）
  lib/
    planner.ts         プラン作成（候補収集 → AI → zod検証 → 移動時間調整）
    google.ts          Google Places / Routes API（サーバー専用）
    ai.ts              Claude API（構造化出力）
    share/             シェア画像用データ
  i18n/request.ts      表示言語（Cookie またはブラウザの言語）
messages/              ja / zh / en の文言
supabase/migrations/   テーブル・RLS・Storage・RPC
```
