import "server-only";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_USER_ID, SEED } from "@/lib/mock/seed";

/**
 * Supabase クライアントの代わりに動くデモ用の簡易DB。
 * - アプリで使っているクエリ（select / eq / in / ilike / order / limit / insert / update / delete / rpc）だけを実装
 * - サンプルデータ（seed）は読み取り専用。ユーザーが作ったデータは Cookie に圧縮して保存する
 *   （Vercel ではリクエストごとに別のサーバーで動くことがあり、メモリに置くと消えるため）
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
};

const USER_TABLES = ["trip_plans", "plan_spots", "spot_photos", "posts", "post_route_spots", "post_photos", "post_likes", "post_saves"] as const;
type UserTable = (typeof USER_TABLES)[number];

const COOKIE = "tabiai_mock";
const CHUNK = 3500;
const MAX_CHUNKS = 3;

export const DEMO_USER = { id: DEMO_USER_ID, email: "demo@tabiai.example", user_metadata: { display_name: "デモユーザー" } };

const DEFAULTS: Record<string, Row> = {
  trip_plans: { start_date: null, budget: null, preferences: [], language: "ja", summary: null, is_saved: false, is_public: false },
  plan_spots: { is_main: false, description: null, start_time: null, stay_minutes: 60, travel_minutes: 0, estimated_cost: 0 },
  posts: { body: "", place_name: null, dish_name: null, highlights: null, google_place_id: null, price: null, rating: null, days: null, transport: null, language: "ja", plan_id: null },
  post_route_spots: { day: 1, google_place_id: null, travel_minutes: null },
  spot_photos: { taken_at: null },
  post_photos: { taken_at: null },
};

class MockDb {
  private user: Record<UserTable, Row[]>;

  constructor(private cookieStore: CookieStore) {
    this.user = Object.fromEntries(USER_TABLES.map((t) => [t, []])) as unknown as Record<UserTable, Row[]>;
    try {
      let encoded = "";
      for (let i = 0; i < MAX_CHUNKS; i++) encoded += cookieStore.get(`${COOKIE}_${i}`)?.value ?? "";
      if (encoded) {
        const saved = JSON.parse(inflateRawSync(Buffer.from(encoded, "base64url")).toString("utf8")) as Partial<Record<UserTable, Row[]>>;
        for (const t of USER_TABLES) this.user[t] = saved[t] ?? [];
      }
    } catch {
      // 壊れた Cookie は無視して空から始める
    }
  }

  isUserTable(table: string): table is UserTable {
    return (USER_TABLES as readonly string[]).includes(table);
  }

  rows(table: string): Row[] {
    if (table === "posts_with_stats") return this.postsWithStats();
    const seed = (SEED[table] ?? []) as Row[];
    const own = this.isUserTable(table) ? this.user[table] : [];
    const all = [...seed, ...own];
    // RLS の代わり：非公開プランは本人のみ、保存は本人のみ
    if (table === "trip_plans") return all.filter((r) => r.user_id === DEMO_USER_ID || r.is_public);
    if (table === "post_saves") return all.filter((r) => r.user_id === DEMO_USER_ID);
    return all;
  }

  private postsWithStats(): Row[] {
    const likes = this.rows("post_likes");
    const photos = this.rows("post_photos");
    const profiles = this.rows("profiles");
    return this.rows("posts").map((p) => ({
      ...p,
      like_count: likes.filter((l) => l.post_id === p.id).length,
      cover_path: (photos.find((ph) => ph.post_id === p.id)?.storage_path as string | undefined) ?? null,
      author_name: (profiles.find((pr) => pr.id === p.user_id)?.display_name as string | undefined) ?? null,
    }));
  }

  insert(table: string, rows: Row[]): Result {
    if (!this.isUserTable(table)) return { data: null, error: { message: `table ${table} is read-only in demo mode` } };
    const now = new Date().toISOString();
    const inserted: Row[] = rows.map((r) => ({ id: crypto.randomUUID(), created_at: now, ...DEFAULTS[table], ...r }));
    for (const r of inserted) {
      if (r.user_id && r.user_id !== DEMO_USER_ID) return { data: null, error: { message: "row-level security", code: "42501" } };
      if ((table === "post_likes" || table === "post_saves") && this.rows(table).some((x) => x.post_id === r.post_id && x.user_id === r.user_id)) {
        return { data: null, error: { message: "duplicate key", code: "23505" } };
      }
    }
    this.user[table].push(...inserted);
    this.persist();
    return { data: inserted, error: null };
  }

  update(table: string, match: (r: Row) => boolean, patch: Row): Result {
    if (!this.isUserTable(table)) return { data: [], error: null };
    const targets = this.user[table].filter(match);
    if (table === "trip_plans" && patch.is_saved) {
      const premium = this.rows("profiles").find((p) => p.id === DEMO_USER_ID)?.is_premium;
      if (!premium && targets.some((t) => !t.is_saved)) return { data: null, error: { message: "premium_required" } };
    }
    targets.forEach((t) => Object.assign(t, patch));
    this.persist();
    return { data: targets, error: null };
  }

  delete(table: string, match: (r: Row) => boolean): Result {
    if (!this.isUserTable(table)) return { data: [], error: null };
    const removed = this.user[table].filter(match);
    this.user[table] = this.user[table].filter((r) => !match(r));
    this.persist();
    return { data: removed, error: null };
  }

  rpc(name: string, args: Record<string, unknown>): Result {
    const routeSpots = this.rows("post_route_spots");
    const routePostIds = new Set(this.rows("posts").filter((p) => p.type === "route").map((p) => p.id));
    if (name === "get_co_visited_spots") {
      const target = args.target_place_id as string;
      const posts = new Set(routeSpots.filter((s) => s.google_place_id === target && routePostIds.has(s.post_id)).map((s) => s.post_id));
      const counts = new Map<string, { name: string; posts: Set<unknown> }>();
      for (const s of routeSpots) {
        const pid = s.google_place_id as string | null;
        if (!pid || pid === target || !posts.has(s.post_id)) continue;
        const entry = counts.get(pid) ?? { name: s.name as string, posts: new Set() };
        entry.posts.add(s.post_id);
        counts.set(pid, entry);
      }
      const data = [...counts.entries()]
        .map(([google_place_id, v]) => ({ google_place_id, name: v.name, visit_count: v.posts.size }))
        .sort((a, b) => b.visit_count - a.visit_count || a.name.localeCompare(b.name))
        .slice(0, 20);
      return { data, error: null };
    }
    if (name === "get_place_post_stats") {
      const ids = (args.place_ids as string[]) ?? [];
      const posts = this.rows("posts");
      const likes = this.rows("post_likes");
      const data = ids
        .map((pid) => {
          const direct = posts.filter((p) => p.google_place_id === pid);
          const ratings = direct.map((p) => p.rating as number | null).filter((r): r is number => r != null);
          const routeCount = new Set(routeSpots.filter((s) => s.google_place_id === pid).map((s) => s.post_id)).size;
          return {
            google_place_id: pid,
            post_count: direct.length,
            avg_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
            like_count: likes.filter((l) => direct.some((p) => p.id === l.post_id)).length,
            route_count: routeCount,
          };
        })
        .filter((s) => s.post_count > 0 || s.route_count > 0);
      return { data, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  }

  /** ユーザーのデータを Cookie に保存。入りきらない場合は古いプラン・投稿から削除する */
  private persist() {
    let encoded = this.encode();
    while (encoded.length > CHUNK * MAX_CHUNKS) {
      const oldestPlan = this.user.trip_plans[0];
      const oldestPost = this.user.posts[0];
      if (oldestPlan) {
        this.user.trip_plans.shift();
        this.user.plan_spots = this.user.plan_spots.filter((s) => s.plan_id !== oldestPlan.id);
        this.user.spot_photos = this.user.spot_photos.filter((s) => s.plan_id !== oldestPlan.id);
      } else if (oldestPost) {
        this.user.posts.shift();
        this.user.post_route_spots = this.user.post_route_spots.filter((s) => s.post_id !== oldestPost.id);
      } else break;
      encoded = this.encode();
    }
    try {
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const part = encoded.slice(i * CHUNK, (i + 1) * CHUNK);
        this.cookieStore.set(`${COOKIE}_${i}`, part, { path: "/", maxAge: part ? 60 * 60 * 24 * 30 : 0, sameSite: "lax", httpOnly: true });
      }
    } catch {
      // Server Component からは書き込めない（読み取りのみ）
    }
  }

  private encode() {
    return deflateRawSync(Buffer.from(JSON.stringify(this.user))).toString("base64url");
  }
}

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private max?: number;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private columns = "*";

  constructor(private db: MockDb, private table: string) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  ilike(col: string, pattern: string) {
    const re = new RegExp(`^${pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    this.filters.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
    return this;
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opts.ascending ?? true;
    this.orders.push({ col, asc, nullsFirst: opts.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  private match = (r: Row) => this.filters.every((f) => f(r));

  private project(rows: Row[]) {
    if (this.columns.trim() === "*") return rows.map((r) => ({ ...r }));
    const cols = this.columns.split(",").map((c) => c.trim());
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  }

  private execute(): Result {
    if (this.op === "insert") {
      const res = this.db.insert(this.table, this.payload as Row[]);
      return res.error ? res : { data: this.project(res.data as Row[]), error: null };
    }
    if (this.op === "update") return this.db.update(this.table, this.match, this.payload as Row);
    if (this.op === "delete") return this.db.delete(this.table, this.match);

    let rows = this.db.rows(this.table).filter(this.match);
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of this.orders) {
          const va = a[o.col];
          const vb = b[o.col];
          if (va == null && vb == null) continue;
          if (va == null) return o.nullsFirst ? -1 : 1;
          if (vb == null) return o.nullsFirst ? 1 : -1;
          if (va < vb) return o.asc ? -1 : 1;
          if (va > vb) return o.asc ? 1 : -1;
        }
        return 0;
      });
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return { data: this.project(rows), error: null };
  }

  maybeSingle(): Promise<Result> {
    const res = this.execute();
    return Promise.resolve(res.error ? res : { data: (res.data as Row[])[0] ?? null, error: null });
  }

  single(): Promise<Result> {
    const res = this.execute();
    if (res.error) return Promise.resolve(res);
    const row = (res.data as Row[])[0];
    return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } });
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

/** Supabase のサーバー用クライアントと同じ形で使えるモック。デモユーザーとして常にログイン済み */
export function createMockClient(cookieStore: CookieStore) {
  const db = new MockDb(cookieStore);
  const client = {
    from: (table: string) => new Query(db, table),
    rpc: (name: string, args: Record<string, unknown>) => Promise.resolve(db.rpc(name, args)),
    auth: {
      getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
    },
  };
  return client as unknown as SupabaseClient;
}
