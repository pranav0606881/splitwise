from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, ListFlowable, ListItem, Preformatted,
)

OUTPUT = "output/pdf/Splitr_Interview_Master_Revision.pdf"

NAVY = colors.HexColor("#102A43")
BLUE = colors.HexColor("#2563EB")
TEAL = colors.HexColor("#0F766E")
INK = colors.HexColor("#243B53")
MUTED = colors.HexColor("#627D98")
PALE = colors.HexColor("#EFF6FF")
PALE_TEAL = colors.HexColor("#F0FDFA")
LINE = colors.HexColor("#D9E2EC")
WHITE = colors.white


def styles():
    s = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=s["Title"], fontName="Helvetica-Bold",
                                fontSize=29, leading=35, textColor=NAVY, alignment=TA_CENTER,
                                spaceAfter=10),
        "subtitle": ParagraphStyle("subtitle", parent=s["Normal"], fontName="Helvetica",
                                   fontSize=12, leading=18, textColor=MUTED, alignment=TA_CENTER),
        "h1": ParagraphStyle("h1", parent=s["Heading1"], fontName="Helvetica-Bold",
                              fontSize=19, leading=24, textColor=NAVY, spaceBefore=2, spaceAfter=11),
        "h2": ParagraphStyle("h2", parent=s["Heading2"], fontName="Helvetica-Bold",
                              fontSize=12.5, leading=16, textColor=TEAL, spaceBefore=10, spaceAfter=5),
        "body": ParagraphStyle("body", parent=s["BodyText"], fontName="Helvetica",
                                fontSize=9.5, leading=14, textColor=INK, spaceAfter=6),
        "small": ParagraphStyle("small", parent=s["BodyText"], fontName="Helvetica",
                                 fontSize=8, leading=11, textColor=MUTED),
        "quote": ParagraphStyle("quote", parent=s["BodyText"], fontName="Helvetica-Oblique",
                                 fontSize=10, leading=15, textColor=INK, leftIndent=10, rightIndent=10,
                                 spaceBefore=4, spaceAfter=7),
        "code": ParagraphStyle("code", parent=s["Code"], fontName="Courier",
                                fontSize=7.5, leading=10, textColor=NAVY, backColor=colors.HexColor("#F8FAFC"),
                                borderColor=LINE, borderWidth=0.4, borderPadding=6, spaceBefore=5, spaceAfter=7),
        "table": ParagraphStyle("table", parent=s["BodyText"], fontName="Helvetica",
                                 fontSize=8.2, leading=11, textColor=INK),
        "tableHead": ParagraphStyle("tableHead", parent=s["BodyText"], fontName="Helvetica-Bold",
                                     fontSize=8.2, leading=11, textColor=WHITE),
    }


S = styles()


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items, level=0):
    # Use a table rather than ReportLab's Symbol-font bullets. This keeps
    # bullets consistent on Windows/Poppler renders.
    rows = [[p("<font color='#2563EB'><b>-</b></font>", "body"), p(item, "body")]
            for item in items]
    table = Table(rows, colWidths=[5 * mm, (165 - level * 5) * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    return table


def section(title, text=None):
    out = [p(title, "h2")]
    if text:
        out.append(p(text))
    return out


def callout(title, text, color=PALE):
    table = Table([[p(f"<b>{title}</b><br/>{text}", "body")]], colWidths=[170 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def key_table(rows, widths=(42 * mm, 128 * mm)):
    data = [[p("Topic", "tableHead"), p("Remember", "tableHead")]]
    for a, b in rows:
        data.append([p(f"<b>{a}</b>", "table"), p(b, "table")])
    t = Table(data, colWidths=list(widths), repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, 14 * mm, 190 * mm, 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 8.5 * mm, "Splitr - Interview Master Revision")
    canvas.drawRightString(190 * mm, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


story = []

# Cover
story += [Spacer(1, 30 * mm), p("SPLITR", "title"), p("Interview Master Revision", "title"),
          Spacer(1, 5 * mm), p("A concise project guide for placements: architecture, code, DSA, security, scaling, and interview answers.", "subtitle"),
          Spacer(1, 16 * mm), callout("How to use this PDF", "Read the blue callouts first. For every answer, speak in this order: <b>current design -> example -> validation/algorithm -> production improvement.</b> Do not memorize paragraphs; understand the facts and explain them naturally.", PALE_TEAL),
          Spacer(1, 12 * mm), p("Project stack", "h2"),
          key_table([
              ("Frontend", "Next.js 16, React 19, Tailwind CSS, shadcn-style UI, React Hook Form, Zod"),
              ("Auth", "Clerk with Next.js middleware and Convex identity integration"),
              ("Backend", "Convex queries, mutations, schema, reactive subscriptions"),
              ("Jobs", "Inngest cron workflows for reminders and monthly insights"),
              ("External APIs", "Gemini for spending insights; Resend for email"),
              ("Core algorithm", "Directed debt graph + Dinic max flow, inspired by a Splitwise-style published analysis"),
          ]), PageBreak()]

# 1 Pitch and architecture
story += [p("1. Project pitch and architecture", "h1"),
          callout("30-second project pitch", "<i>Splitr is a real-time expense-sharing app inspired by Splitwise. Users create personal or group expenses, split them equally, by percentage, or by exact amount, track balances, record settlements, receive payment reminders, and get monthly spending insights. It uses Next.js and React on the frontend, Clerk for authentication, Convex for the reactive backend, Inngest for jobs, Gemini for insights, and Resend for email.</i>"),
          *section("Architecture answer", "Splitr has four layers: (1) Next.js/React UI; (2) Clerk authentication and middleware; (3) Convex queries, mutations, schema, and realtime database; (4) Inngest workflows for scheduled email and AI processing."),
          Preformatted("Next.js + React UI\n        |\nClerk authentication + protected routes\n        |\nConvex: queries / mutations / reactive database\n        |\nUsers | Groups | Expenses | Settlements\n        |\nInngest jobs -> Gemini insights + Resend emails", S["code"]),
          *section("Create-expense lifecycle"),
          bullets([
              "User enters description, amount, date, payer, participants, group, and split type.",
              "React Hook Form + Zod validate the form for user experience.",
              "Frontend calls Convex <b>createExpense</b> mutation.",
              "Backend identifies caller, validates group access and split total, then inserts the expense.",
              "Reactive Convex queries refresh group views, dashboard data, and balances.",
          ]),
          *section("One-line decisions"),
          key_table([
              ("Next.js", "Structured React app with routing, layouts, and Clerk integration."),
              ("Convex", "Reactive reads, backend functions, transactions, and less WebSocket/cache-invalidation work."),
              ("Clerk", "Delegates security-sensitive authentication and session management."),
              ("Inngest", "Runs slow, scheduled, retryable work outside normal user requests."),
          ]), PageBreak()]

# 2 Data model
story += [p("2. Data model and backend code map", "h1"),
          *section("Core documents"),
          key_table([
              ("users", "name, email, tokenIdentifier, imageUrl. Maps Clerk identity to application user."),
              ("groups", "name, description, createdBy, embedded members: userId, role, joinedAt."),
              ("expenses", "description, amount, category, date, payer, splitType, splits, optional groupId, createdBy."),
              ("settlements", "amount, note, date, payer, receiver, optional groupId, related expense IDs, createdBy."),
          ]),
          *section("Key backend functions"),
          key_table([
              ("expenses.createExpense", "Writes an expense after group and split-total validation."),
              ("expenses.getExpensesBetweenUsers", "Builds person-to-person history and net balance."),
              ("expenses.getSimplifiedDebts", "Creates the group debt graph and returns simplified existing edges."),
              ("settlements.createSettlement", "Records repayment from payer to receiver."),
              ("groups.getGroupExpenses", "Returns group records plus member, pairwise, and total balances."),
              ("dashboard.*", "User balances, total spend, monthly spend, and group summaries."),
              ("inngest.*", "Outstanding debts and monthly expense data for scheduled jobs."),
          ]),
          *section("Indexes to explain"),
          bullets([
              "<b>expenses.by_group</b>: fetch one group's expenses.",
              "<b>expenses.by_user_and_group</b>: fetch expenses paid by a user in personal/group context.",
              "<b>expenses.by_date</b>: time-based dashboard and insight queries.",
              "<b>users.by_token / by_email</b>: map authenticated identity to user document.",
              "Compound-index order matters: an index on (paidByUserId, groupId) supports filtering in that order.",
          ]),
          callout("Schema trade-off", "Embedded group members and embedded splits make small-group reads simple. At large scale, use <b>groupMembers</b> and possibly <b>expenseSplits</b> tables with indexes for user-specific queries.", PALE_TEAL), PageBreak()]

# 3 integrity auth
story += [p("3. Rules, validation, and authorization", "h1"),
          *section("Financial invariants - memorize these"),
          bullets([
              "Every amount is positive; every split is non-negative.",
              "Sum of all split amounts equals the expense amount.",
              "A user cannot owe themselves.",
              "A settlement payer and receiver cannot be the same user.",
              "The sum of all net balances in a group is zero.",
              "Debt simplification must preserve every user's net balance.",
              "Retries must not create duplicate expenses or settlements.",
          ]),
          *section("Authentication versus authorization"),
          key_table([
              ("Authentication", "Who is making the request? Clerk verifies the session; Convex reads the identity through ctx.auth.getUserIdentity()."),
              ("Authorization", "May this specific authenticated user read/write this group, expense, or settlement? Check membership or ownership server-side."),
              ("Important rule", "Never trust a user ID, payer ID, role, or permission claim sent by the browser."),
          ]),
          *section("Defend against direct API calls"),
          p("A user can bypass the UI and call a public function directly. Therefore every backend mutation must validate: authenticated caller, group membership, payer/participant membership, positive amounts, exact split total, and permissions. Frontend validation improves UX; backend validation protects correctness."),
          *section("Production hardening answers"),
          p("- Use integer paise, not floating-point rupees.<br/>"
            "- Use idempotency keys for expense and settlement creation.<br/>"
            "- Use soft deletion or reversal entries, not destructive history removal.<br/>"
            "- Keep secrets server-side; do not pass provider API keys from the client.<br/>"
            "- Use audit records: actor, timestamp, reason, before/after values."), PageBreak()]

# 4 ledger
story += [p("4. Ledger and balance calculation", "h1"),
          *section("The core mental model"),
          p("Expenses create obligations. Settlements reduce obligations. Do not overwrite an expense when payment happens; preserve both events and calculate the current balance from the ledger."),
          *section("Worked example"),
          Preformatted("A pays Rs. 1,200 for A, B, C equally\n\nStored splits: A=400, B=400, C=400\nB owes A = 400\nC owes A = 400\n\nNet balances: A=+800, B=-400, C=-400\nInvariant: +800 - 400 - 400 = 0\n\nIf B settles Rs. 200 with A:\nA is now owed 600 total; B owes 200; C owes 400", S["code"]),
          *section("Pairwise versus net balance"),
          key_table([
              ("Pairwise", "Exact relationship: B owes A Rs. 400. Needed for settlement and debt graph."),
              ("Net", "Total per user: positive means should receive; negative means should pay."),
              ("Why both", "A user can be net positive overall while still owing one person and being owed by another."),
          ]),
          *section("High-value debugging method"),
          bullets([
              "Reproduce using the smallest set of expenses and settlements.",
              "Manually calculate every pairwise obligation.",
              "Compare raw documents, returned balances, and UI display.",
              "Check duplicate requests, wrong settlement direction, invalid participant, and rounding residue.",
              "Verify group net sum equals zero.",
          ]),
          callout("Strong interview line", "I debug balance problems as ledger problems, not display problems. I trace source events, manually recompute obligations, and verify conservation of value.", PALE_TEAL), PageBreak()]

# 5 Dinic
story += [p("5. Simplify Debts: graph + Dinic max flow", "h1"),
          *section("What your implementation is"),
          p("Your code implements a debt-simplification approach inspired by the published article <i>Algorithm behind Splitwise's debt simplification feature</i>. It is not appropriate to claim it is Splitwise's proprietary production implementation or that it globally minimizes every transaction."),
          *section("Graph mapping"),
          key_table([
              ("Vertex", "A user."),
              ("Edge u -> v", "u owes v an amount."),
              ("Capacity", "Debt amount in integer paise conceptually."),
              ("Opposite edges", "Net first: A->B 500 and B->A 200 becomes A->B 300."),
              ("Residual reverse edge", "Internal max-flow mechanism to undo/reroute earlier flow; not a displayed debt."),
          ]),
          *section("Your exact algorithm steps"),
          bullets([
              "Build a directed debt matrix from expenses and settlements.",
              "Net opposite debts for every pair of users.",
              "Save the original directed edges so output never creates a new relationship.",
              "For each original edge u -> v, build Dinic from remaining current debts and run max flow from u to v.",
              "Record that flow on u -> v and rebuild remaining graph from residual forward capacities.",
          ]),
          *section("Dinic in 30 seconds"),
          p("BFS builds a <b>level graph</b> over positive residual edges. DFS pushes <b>blocking flow</b> only from level k to level k+1. Sending flow reduces forward capacity and increases reverse capacity. Repeat until sink is unreachable. Standard worst-case complexity: O(V^2 E); your outer-per-original-edge approach is conservatively O(V^2 E^2)."),
          Preformatted("A -> B : 1\nA -> C : 5\nC -> B : 5\n\nFor original A -> B:\nmax flow A to B = direct 1 + path A->C->B 5 = 6\nOutput: A -> B : 6 (an existing relationship)", S["code"]),
          *section("Limitations to say honestly"),
          bullets([
              "It does not claim global minimum number of final transactions.",
              "Explicit directed-cycle cancellation is a separate enhancement.",
              "Use integer paise; EPSILON only mitigates floating-point noise.",
          ]), PageBreak()]

# 6 code cheatsheet
story += [p("6. Code and DSA cheat sheet", "h1"),
          *section("Dinic C++ skeleton - know this cold"),
          Preformatted("struct Edge { int to, rev; long long cap; };\nvector<vector<Edge>> g;\nvector<int> level, ptr;\n\naddEdge(u, v, cap):\n  add (v, cap, reverseIndex) to g[u]\n  add (u, 0, forwardIndex) to g[v]\n\nbfs(s, t): build levels using cap > 0\ndfs(u, t, pushed): use only level[to] = level[u] + 1\nmaxFlow(s, t): repeat BFS + DFS blocking flow", S["code"]),
          *section("Project-derived coding prompts"),
          key_table([
              ("Net balances", "Given [payer, receiver, amount], return each user's net balance. Use array/hash map."),
              ("Any settlement", "Given net balances, settle using debtor and creditor queues/heaps. Valid plan, not necessarily minimum count."),
              ("Minimum settlements", "N <= 12: compute net balances, use DFS/backtracking. Heap greedy is not guaranteed optimal."),
              ("Equal split", "Split totalPaise among N users so sum is exact and share difference <= 1."),
              ("Duplicate request", "Detect duplicate idempotency keys in a time window using hash map + sliding window."),
              ("Debt cycle", "Detect directed cycle with DFS colors/recursion stack; cancel minimum edge amount if needed."),
          ]),
          *section("Complexity answers"),
          key_table([
              ("Equal split", "O(N) time, O(N) output space."),
              ("Net balances", "O(T) for T transactions, O(N) space."),
              ("Top K spenders", "Hash map totals + min heap: O(T + U log K)."),
              ("Cycle detection", "DFS: O(V + E)."),
              ("Dinic", "General O(V^2 E); your repeated edge flow approach conservatively O(V^2 E^2)."),
          ]), PageBreak()]

# 7 Realtime frontend
story += [p("7. React, Next.js, and Convex", "h1"),
          *section("Realtime explanation"),
          p("Convex queries are reactive subscriptions. When a mutation changes data read by a subscribed query, Convex re-runs the query and pushes updated results to the client. This avoids manual polling, custom WebSockets, and cache invalidation for common flows."),
          *section("Frontend details to know"),
          key_table([
              ("Client components", "Expense form, split selector, dialogs, and interactive views use hooks/state and run in the browser."),
              ("React Hook Form", "Manages form registration, errors, submit state, reset, and field watching."),
              ("Zod", "Structured client validation; backend still repeats critical validation."),
              ("SplitSelector", "Local dynamic state for equal, percentage, exact splits; validate total before submit."),
              ("skip", "Avoids a Convex query until conditional UI state and arguments are ready."),
              ("Custom hooks", "Standardize data, loading, error, mutation behavior; wrappers should remain thin."),
          ]),
          *section("React pitfalls"),
          bullets([
              "Do not put setTimeout or other side effects in render; use useEffect with cleanup.",
              "Arrays/functions in effect dependencies are compared by reference; unstable references can cause loops.",
              "Separate loading from empty state to prevent empty-page flashes.",
              "Disable submit for UX, but use idempotency on backend for correctness.",
              "Use accessible labels, keyboard navigation, focus management, and non-color-only errors.",
          ]),
          *section("Convex function distinctions"),
          key_table([
              ("Query", "Reads data; reactive for UI. Keep it bounded and indexed."),
              ("Mutation", "Changes application data transactionally."),
              ("Action", "Calls external services such as email/AI; not a DB transaction."),
              ("Internal function", "Backend-only helper; reduces public attack surface."),
          ]), PageBreak()]

# 8 jobs AI
story += [p("8. Background jobs, Gemini, and email", "h1"),
          *section("Workflow"),
          Preformatted("Cron trigger\n  -> find eligible users\n  -> fetch limited recent/aggregated spending data\n  -> Gemini generates insight\n  -> validate/sanitize output\n  -> Resend sends email\n  -> store delivery outcome", S["code"]),
          *section("Why Inngest"),
          p("Background work must not block expense creation. Inngest provides cron triggers, named durable steps, retries, observability, and isolation of per-user failures."),
          *section("Reliability checklist"),
          bullets([
              "Use an email-delivery record keyed by user + message type + period.",
              "Use idempotency to prevent duplicate messages when a provider times out.",
              "Re-check latest balance just before sending a reminder.",
              "At scale: scheduler pages eligible users, emits one event per user, workers process with controlled concurrency.",
              "Keep AI/email failure separate from the financial ledger; core expense flows must still work.",
          ]),
          *section("AI security and privacy"),
          key_table([
              ("Data minimization", "Prefer category totals and trends over raw descriptions or unnecessary identity data."),
              ("Prompt injection", "Treat descriptions as untrusted data; model must not have access to extra tools/data."),
              ("Model output", "Never trust raw HTML. Sanitize with allowlist or request structured JSON and render with trusted React."),
              ("Cost", "Limit users, frequency, input size, output size; cache one insight per period."),
              ("Secrets", "Gemini and Resend keys remain server-side environment variables only."),
          ]), PageBreak()]

# 9 scaling
story += [p("9. Scaling and production answers", "h1"),
          *section("If dashboard is slow at 100,000+ expenses"),
          bullets([
              "Measure query latency, documents read, bytes returned, and mutation retries first.",
              "Replace unbounded collect/filter logic with targeted indexes and cursor pagination.",
              "Keep raw ledger as source of truth; maintain transactionally updated derived balance/monthly aggregates for fast reads.",
              "Separate summary queries from paginated history queries.",
          ]),
          *section("Common redesigns"),
          key_table([
              ("Many groups per user", "Create groupMembers table indexed by userId and groupId."),
              ("Many split searches", "Create expenseSplits table indexed by userId and expenseId."),
              ("Large history", "Cursor pagination: newest page first, fetch next cursor on scroll."),
              ("Hot group writes", "Avoid one high-churn aggregate doc; use immutable events and smaller per-member/pair aggregates."),
              ("Recurring expenses", "Store templates and create immutable monthly occurrence with idempotency key."),
              ("Multiple currencies", "Store amount in minor units plus currency. Do not merge currencies without explicit locked exchange rate."),
          ]),
          *section("The answer framework for any scenario"),
          callout("Use this every time", "<b>1.</b> State current behavior. <b>2.</b> Identify risk/edge case. <b>3.</b> Give backend/data/algorithm fix. <b>4.</b> State trade-off. Example: 'I would measure first, then replace full collection scans with an index and cursor pagination. I would precompute current balances but retain raw events as source of truth.'", PALE_TEAL), PageBreak()]

# 10 questions
story += [p("10. High-frequency interview questions", "h1"),
          *section("Project and architecture"),
          bullets([
              "Tell me about Splitr. What problem does it solve?",
              "Walk through the create-expense request from form to updated balance.",
              "Why Next.js + Convex rather than React + Express + PostgreSQL?",
              "What does real-time mean here and how is it different from polling?",
              "Why separate expenses from settlements?",
          ]),
          *section("Database and correctness"),
          bullets([
              "Explain your schema, indexes, and the trade-off of embedded members/splits.",
              "How do you prove group balance is correct?",
              "How do you prevent duplicate settlement after a timeout?",
              "How do you split Rs. 100 among three users exactly?",
              "What happens if an old settled expense is edited?",
          ]),
          *section("DSA"),
          bullets([
              "Explain graph modelling and debt simplification.",
              "Why Dinic? Explain level graph, residual graph, reverse edge, blocking flow.",
              "Code max flow / net balances / minimum settlements.",
              "Does your approach minimize all transactions? What is its limitation?",
          ]),
          *section("Security and scale"),
          bullets([
              "A user guesses a group ID. How do you stop data leakage?",
              "A client fakes a payer or participant. What must the backend validate?",
              "The dashboard takes 12 seconds with 100,000 expenses. Redesign it.",
              "How do you secure Gemini, Resend, and AI-generated HTML?",
          ]),
          *section("Honest production-improvement answer"),
          p("<i>My first hardening pass would store money as integer paise, enforce all participant and authorization rules server-side, use idempotency keys, move high-volume membership and split relationships into indexed tables, paginate history, sanitize AI output, keep secrets server-side, and add immutable audit events plus ledger-invariant tests.</i>", "quote"),
          Spacer(1, 7 * mm), callout("Final reminder", "Do not claim that a prototype is production-perfect. Strong candidates explain the current design clearly, name the real limitation, and propose a concrete safe improvement.", PALE_TEAL)]


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=20 * mm,
    leftMargin=20 * mm,
    topMargin=18 * mm,
    bottomMargin=22 * mm,
    title="Splitr Interview Master Revision",
    author="Pranav Mittal",
)

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
