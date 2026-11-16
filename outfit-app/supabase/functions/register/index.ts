// Legt ein Konto an – nur für eingeladene E-Mails mit passendem Code.
// Das allererste Konto darf sich frei anlegen und wird Admin.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const code = String(body.code ?? "").trim().toLowerCase();
  const displayName = String(body.display_name ?? "").trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "bad_email" }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const first = await admin.rpc("claim_first_invite", { p_email: email });
  if (first.error) return json({ error: "failed" }, 500);
  if (first.data !== true) {
    const invite = await admin.from("invites").select("code").eq("email", email).maybeSingle();
    if (invite.error) return json({ error: "failed" }, 500);
    // Gleiche Antwort für „nicht eingeladen“ und „falscher Code“: verrät nicht, wer eingeladen ist.
    if (!invite.data || invite.data.code !== code) return json({ error: "not_invited" }, 403);
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (created.error) {
    const msg = created.error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) return json({ error: "exists" }, 409);
    if (msg.includes("password")) return json({ error: "weak_password" }, 400);
    console.error("createUser failed:", created.error.message);
    return json({ error: "failed" }, 500);
  }
  return json({ ok: true });
});
