import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { groupRouter } from "./routers/group";
import { portfolioRouter } from "./routers/portfolio";
import { pricingRouter } from "./routers/pricing";
import { adminRouter } from "./routers/admin";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  group: groupRouter,
  portfolio: portfolioRouter,
  pricing: pricingRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
