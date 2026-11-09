import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

const notificationRateLimit = new Map<string, { startedAt: number; count: number }>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Les fichiers CSV/XLSX sont analysés dans le navigateur, pas envoyés au serveur.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  app.get("/api/crm-config.json", (_req, res) => {
    const configuredUrl = process.env.SUPABASE_URL?.trim() ?? "";
    const supabaseUrl = configuredUrl && !/^https?:\/\//i.test(configuredUrl)
      ? `https://${configuredUrl.includes(".") ? configuredUrl : `${configuredUrl}.supabase.co`}`
      : configuredUrl;
    const configuration = {
      supabaseUrl,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    };
    res.set("Cache-Control", "no-store").json(configuration);
  });
  app.post("/api/notifications/new-prospects", async (req, res) => {
    try {
      const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i);
      const accessToken = bearer?.[1]?.trim();
      if (!accessToken) return res.status(401).json({ error: "Reconnectez-vous avant l’envoi de la notification." });

      const configuredUrl = process.env.SUPABASE_URL?.trim() ?? "";
      const supabaseUrl = configuredUrl && !/^https?:\/\//i.test(configuredUrl)
        ? `https://${configuredUrl.includes(".") ? configuredUrl : `${configuredUrl}.supabase.co`}`
        : configuredUrl;
      const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
      if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "La connexion Supabase n’est pas configurée." });

      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
      const user = authData.user;
      if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
        return res.status(401).json({ error: "Le compte connecté doit avoir une adresse email confirmée." });
      }

      const rawIds = req.body?.prospectIds;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 5000 || rawIds.some((id: unknown) => typeof id !== "string" || !uuidPattern.test(id))) {
        return res.status(400).json({ error: "La liste des prospects à notifier est invalide." });
      }
      const prospectIds = [...new Set(rawIds as string[])];
      const idempotencyKey = createHash("sha256")
        .update(`${user.id}:${[...prospectIds].sort().join(",")}`)
        .digest("hex");

      const roleResult = await userClient.rpc("current_crm_role");
      if (roleResult.error) {
        console.error("Unable to verify CRM notification role:", roleResult.error.message);
        return res.status(503).json({ error: "Appliquez supabase/schema.sql avant d’activer les notifications." });
      }
      if (!["admin", "editor", "owner"].includes(String(roleResult.data))) {
        return res.status(403).json({ error: "Votre rôle ne permet pas d’enregistrer des prospects." });
      }

      const now = Date.now();
      const rate = notificationRateLimit.get(user.id);
      if (!rate || now - rate.startedAt >= 60_000) {
        notificationRateLimit.set(user.id, { startedAt: now, count: 1 });
      } else if (rate.count >= 12) {
        return res.status(429).json({ error: "Trop de notifications ont été demandées. Réessayez dans une minute." });
      } else {
        rate.count += 1;
      }

      const prospects: Array<{ id: string; entreprise: string; ville: string | null; status: string; created_at: string; user_id: string }> = [];
      for (let offset = 0; offset < prospectIds.length; offset += 100) {
        const { data, error } = await userClient
          .from("prospects")
          .select("id,entreprise,ville,status,created_at,user_id")
          .in("id", prospectIds.slice(offset, offset + 100));
        if (error) {
          console.error("Unable to load newly created prospects for email:", error.message);
          return res.status(403).json({ error: "Les prospects concernés ne sont pas accessibles au compte connecté." });
        }
        prospects.push(...(data ?? []));
      }
      if (prospects.length !== prospectIds.length || prospects.some(prospect => {
        const age = now - Date.parse(prospect.created_at);
        return prospect.user_id !== user.id || !Number.isFinite(age) || age < -60_000 || age > 24 * 60 * 60_000;
      })) {
        return res.status(403).json({ error: "Les notifications ne peuvent être envoyées que pour des fiches récemment créées par ce compte." });
      }
      prospects.sort((left, right) => left.id.localeCompare(right.id));

      const apiKey = process.env.ELASTIC_EMAIL_API_KEY?.trim() ?? "";
      const fromEmail = process.env.ELASTIC_EMAIL_FROM_EMAIL?.trim() ?? "";
      if (!apiKey || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fromEmail)) {
        return res.status(503).json({ error: "Les notifications email ne sont pas encore configurées." });
      }

      const rowsHtml = prospects.slice(0, 25).map(prospect =>
        `<li style="margin:0 0 12px"><strong>${escapeHtml(prospect.entreprise)}</strong><br><span style="color:#65707e">${escapeHtml(prospect.ville || "Ville non renseignée")} · ${escapeHtml(prospect.status)}</span></li>`
      ).join("");
      const remaining = prospects.length > 25 ? `<p>Et ${prospects.length - 25} autre(s) prospect(s) dans votre CRM.</p>` : "";
      const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f7f3;color:#16212b;font-family:Arial,sans-serif"><main style="max-width:620px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e7e8e4;border-radius:16px"><p style="color:#4960e8;font-size:12px;font-weight:700;letter-spacing:2px">WEBORA CRM</p><h1 style="font-size:24px;margin:12px 0">${prospects.length === 1 ? "Nouveau prospect enregistré" : `${prospects.length} nouveaux prospects enregistrés`}</h1><p>Cette notification concerne les fiches créées depuis votre compte CRM.</p><ul style="padding-left:20px">${rowsHtml}</ul>${remaining}<p style="margin-top:28px;color:#65707e;font-size:13px">Connectez-vous à Webora CRM pour consulter votre pipeline.</p></main></body></html>`;

      const response = await fetch("https://api.elasticemail.com/v4/emails/transactional", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ElasticEmail-ApiKey": apiKey,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          Recipients: { To: [user.email] },
          Content: {
            From: `Webora CRM <${fromEmail}>`,
            Subject: prospects.length === 1 ? `Nouveau prospect · ${prospects[0].entreprise}` : `${prospects.length} nouveaux prospects · Webora CRM`,
            Body: [{ ContentType: "HTML", Content: html, Charset: "UTF-8" }],
          },
        }),
      });
      if (!response.ok) {
        console.error("Elastic Email notification failed with status:", response.status);
        return res.status(502).json({ error: "Elastic Email a refusé l’envoi. Vérifiez la clé SendHttp et l’adresse d’expédition validée." });
      }
      return res.status(202).json({ sent: true });
    } catch (error) {
      console.error("Prospect email notification failed:", error instanceof Error ? error.message : "unknown error");
      return res.status(502).json({ error: "L’alerte email n’a pas pu être envoyée, mais les données du prospect sont enregistrées." });
    }
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
