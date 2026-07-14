import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const chatwoot = createTRPCReact<AppRouter>();
