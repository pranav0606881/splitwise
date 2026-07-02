import { serve } from "inngest/next";

import { paymentReminders } from "../../../lib/inngest/payment-reminders.js";
import { spendingInsights } from "../../../lib/inngest/spending-insights.js";
import { inngest } from "../../../lib/inngest/client.js";

export const runtime = "nodejs";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [paymentReminders, spendingInsights],
});

// Export functions array for easier local inspection and debugging
export const functions = [paymentReminders, spendingInsights];