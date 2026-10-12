import { v } from "convex/values";
import { action } from "./_generated/server";
import { Resend } from "resend";

// Action to send email using Resend
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.optional(v.string()),
    from: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = args.apiKey || process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("Resend API key is missing");
      return { success: false, error: "RESEND_API_KEY is not configured" };
    }

    const resend = new Resend(apiKey);

    try {
      const fromEmail =
        args.from ||
        process.env.RESEND_FROM_EMAIL ||
        "Splitr <onboarding@resend.dev>";

      const toEmail = process.env.RESEND_OVERRIDE_TO || args.to;

      const result = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });

      console.log("Email sent successfully:", result);

      return { success: true, id: result.id };
    } catch (error) {
      console.error("Failed to send email:", error);
      return { success: false, error: error.message };
    }
  },
});