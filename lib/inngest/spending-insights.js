import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { inngest } from "./client.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const getConvex = () =>
  new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

export const spendingInsights = inngest.createFunction(
  {
    name: "Generate Spending Insights",
    id: "generate-spending-insights",
    retries: 2,
    timeouts: {
      finish: "10m",
    },
    triggers: [{ cron: "49 22 9 6 *" }], // for testing only
  },

  async ({ step }) => {
    // Fetch users
    const users = await step.run(
      "Fetch users with expenses",
      async () => {
        const result = await getConvex().query(
          api.inngest.getUsersWithExpenses
        );

        console.log("Users found:", result.length);

        return result;
      }
    );

    const results = [];

    for (const user of users) {
      try {
        // Fetch expenses
        const expenses = await step.run(
          `Expenses · ${user._id}`,
          async () =>
            getConvex().query(
              api.inngest.getUserMonthlyExpenses,
              {
                userId: user._id,
              }
            )
        );

        if (!expenses?.length) continue;

        // Limit to recent 20
        const recentExpenses = expenses.slice(-20);

        const expenseData = JSON.stringify({
          expenses: recentExpenses.map((e) => ({
            description: e.description,
            category: e.category,
            amount: e.amount,
          })),
          totalSpent: expenses.reduce(
            (sum, e) => sum + e.amount,
            0
          ),
        });

        const prompt = `
Return ONLY valid HTML.

Use <h2>, <p>, <ul>, <li> tags.

User spending data:
${expenseData}

Provide:

1. Monthly Overview
2. Top Spending Categories
3. Unusual Spending Patterns
4. Saving Opportunities
5. Recommendations for Next Month
`;

        // Generate AI content
        const htmlBody = await step.run(
          `AI · ${user._id}`,
          async () => {
            const result =
              await model.generateContent(prompt);

            const text = result.response.text();

            console.log("AI output:");
            console.log(text);

            return text;
          }
        );

        if (!htmlBody) {
          results.push({
            userId: user._id,
            success: false,
            error: "Empty AI response",
          });

          continue;
        }

        // Send email
        await step.run(
          `Email · ${user._id}`,
          async () => {
            console.log(
              "Sending email to:",
              user.email
            );

            return getConvex().action(
              api.email.sendEmail,
              {
                to: user.email,
                subject:
                  "Your Monthly Spending Insights – Splitr",
                html: `
                  <h1>Your Monthly Financial Insights</h1>

                  <p>Hi ${user.name},</p>

                  <p>Here's your personalized spending analysis:</p>

                  ${htmlBody}
                `,
                apiKey: process.env.RESEND_API_KEY,
              }
            );
          }
        );

        results.push({
          userId: user._id,
          success: true,
        });
      } catch (err) {
        console.error(
          `Failed for user ${user._id}:`,
          err
        );

        results.push({
          userId: user._id,
          success: false,
          error: err.message,
        });
      }
    }

    return {
      processed: results.length,
      success: results.filter((r) => r.success)
        .length,
      failed: results.filter((r) => !r.success)
        .length,
    };
  }
);