import { serve } from "inngest/next";

import { processTask } from "../../../lib/inngest/functions.js";
import { inngest } from "../../../lib/inngest/client.js";

export const runtime = "nodejs";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processTask],
});