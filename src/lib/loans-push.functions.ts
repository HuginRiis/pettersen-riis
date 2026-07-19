import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __load = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/loans-push.server")> => import("@/lib/loans-push.server"))
  .client((): Promise<typeof import("@/lib/loans-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/loans-push.server")));

export const sendLoanTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ loanId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendLoanTestNotification } = await __load();
    return sendLoanTestNotification(data.loanId);
  });
