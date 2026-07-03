import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { corsOptions, rejectDisallowedOrigin } from "./lib/cors";
import { logger } from "./lib/logger";
import { apiRateLimiter, proAiRateLimiter } from "./lib/rateLimit";
import { resolveCustomer } from "./middleware/customer";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy. Must be mounted BEFORE the body parsers because it
// streams raw bytes through to Clerk. No-op in development.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Standard security headers (CSP, X-Content-Type-Options, frame protection,
// Referrer-Policy, …) on every response this server answers itself. Mounted
// AFTER the Clerk proxy so proxied Clerk responses keep Clerk's own headers
// untouched. This server only returns JSON (the Expo web build is served by a
// separate static server), so the helmet defaults are safe.
app.use(helmet());

app.use(cors(corsOptions()));
app.use(rejectDisallowedOrigin);
app.use("/api", apiRateLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Populate Clerk auth state (req auth / getAuth) when a Bearer token or session
// cookie is present. Resolves the publishable key from the request host so the
// same server can serve multiple Clerk custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use(resolveCustomer);

app.use("/api", proAiRateLimiter);
app.use("/api", router);

export default app;
