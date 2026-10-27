import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const alice = "10000000-0000-0000-0000-000000000001",
  bob = "10000000-0000-0000-0000-000000000002";
const connection = "20000000-0000-0000-0000-000000000001",
  video = "30000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public,auth to authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values('${alice}'),('${bob}');`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018032846_bailacue_isolated_metadata.sql",
      "utf8",
    ),
  );
  // Shared Me+ grants no automatic service-table privileges. Test the explicit migration.
  await db.exec("grant usage on schema public,auth to service_role; ");
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018043447_bailacue_scoped_sessions_sync.sql",
      "utf8",
    ),
  );
  const serviceGrants = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_bailacue_gateway_service_grants.sql"),
  )!;
  await db.exec(readFileSync(`supabase/migrations/${serviceGrants}`, "utf8"));
  await db.exec(
    `insert into public.bailacue_connections(id,user_id,provider,account_ref,display_name) values('${connection}','${alice}','google-drive','account','Alice'); insert into public.bailacue_videos(id,user_id,connection_id,provider_file_id,original_name,mime_type,duration_seconds) values('${video}','${alice}','${connection}','file','Dance','video/mp4',30); set role authenticated; set request.jwt.claim.sub='${alice}';`,
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    `reset role; set role authenticated; set request.jwt.claim.sub='${alice}';`,
  );
});
afterAll(async () => {
  await db.close();
});
describe("additive PostgreSQL schema with actual RLS", () => {
  it("lets an owner create and read notes", async () => {
    await db.exec(
      `insert into public.bailacue_notes(user_id,video_id,text,at_seconds) values('${alice}','${video}','Small steps',10);`,
    );
    expect(
      (await db.query("select * from public.bailacue_notes")).rows,
    ).toHaveLength(1);
  });
  it("denies cross-user reads, writes, owner reassignment and foreign-key attachments", async () => {
    await db.exec(`set request.jwt.claim.sub='${bob}';`);
    expect(
      (await db.query("select * from public.bailacue_notes")).rows,
    ).toEqual([]);
    await expect(
      db.exec(
        `insert into public.bailacue_notes(user_id,video_id,text) values('${alice}','${video}','Intrusion');`,
      ),
    ).rejects.toThrow(/unavailable|row-level security/);
    await expect(
      db.exec(
        `insert into public.bailacue_notes(user_id,video_id,text) values('${bob}','${video}','Cross-owner FK');`,
      ),
    ).rejects.toThrow();
    await db.exec(`set request.jwt.claim.sub='${alice}';`);
    await expect(
      db.exec(
        `update public.bailacue_connections set user_id='${bob}' where id='${connection}';`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("denies invalid segment bounds on the server", async () => {
    await expect(
      db.exec(
        `insert into public.bailacue_segments(user_id,video_id,name,start_seconds,end_seconds) values('${alice}','${video}','Too long',0,31);`,
      ),
    ).rejects.toThrow(/exceeds/);
    await expect(
      db.exec(
        `insert into public.bailacue_segments(user_id,video_id,name,start_seconds,end_seconds) values('${alice}','${video}','Backwards',20,10);`,
      ),
    ).rejects.toThrow();
  });
  it("enforces stable provider IDs, and enables RLS on every BailaCue table", async () => {
    await expect(
      db.exec(
        `insert into public.bailacue_videos(user_id,connection_id,provider_file_id,original_name,mime_type) values('${alice}','${connection}','file','Duplicate','video/mp4');`,
      ),
    ).rejects.toThrow(/unique/);
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname like 'bailacue_%' and relkind='r'",
    );
    expect(result.rows).toHaveLength(27);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("rejects unauthenticated reads", async () => {
    await db.exec("reset role; set role anon;");
    await expect(
      db.exec("select * from public.bailacue_videos;"),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      `reset role; set role authenticated; set request.jwt.claim.sub='${alice}';`,
    );
  });
  it("keeps scoped sessions/snapshots inaccessible even to their authenticated owner", async () => {
    await db.exec(
      `reset role; insert into public.bailacue_app_sessions(token_hash,user_id,expires_at) values(repeat('a',64),'${alice}',now()+interval '1 day'); set role authenticated;`,
    );
    await expect(
      db.exec("select * from public.bailacue_app_sessions"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.exec("select * from public.bailacue_sync_snapshots"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.exec("select public.bailacue_rate_limit('key',10)"),
    ).rejects.toThrow(/permission denied/);
  });
  it("atomically limits repeated authentication attempts and rejects stale revisions", async () => {
    await db.exec("reset role; set role service_role;");
    expect(
      (await db.query("select public.bailacue_rate_limit('test',1) as allowed"))
        .rows[0],
    ).toEqual({ allowed: true });
    expect(
      (await db.query("select public.bailacue_rate_limit('test',1) as allowed"))
        .rows[0],
    ).toEqual({ allowed: false });
    await db.exec(
      `insert into public.bailacue_sync_snapshots(user_id) values('${alice}');`,
    );
    const first = await db.query(
      `update public.bailacue_sync_snapshots set revision=1 where user_id='${alice}' and revision=0 returning revision`,
    );
    const stale = await db.query(
      `update public.bailacue_sync_snapshots set revision=1 where user_id='${alice}' and revision=0 returning revision`,
    );
    expect(first.rows).toHaveLength(1);
    expect(stale.rows).toHaveLength(0);
  });
  it("deletes only the selected user's BailaCue data and preserves shared auth identities", async () => {
    await db.exec(
      `reset role; insert into public.bailacue_profiles(user_id,username) values('${bob}','bob'); set role service_role; select public.bailacue_delete_app_data('${alice}'); reset role;`,
    );
    expect((await db.query("select * from auth.users")).rows).toHaveLength(2);
    expect(
      (await db.query("select * from public.bailacue_profiles")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.bailacue_app_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select * from public.bailacue_notes where user_id='${alice}'`,
        )
      ).rows,
    ).toHaveLength(0);
  });
});
