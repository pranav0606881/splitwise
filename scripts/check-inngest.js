Promise.all([
  import('../lib/inngest/payment-reminders.js'),
  import('../lib/inngest/spending-insights.js'),
]).then(([pm, si]) => {
  console.log('paymentReminders export keys:', Object.keys(pm));
  console.log('spendingInsights export keys:', Object.keys(si));
  console.dir({
    paymentReminders: pm.paymentReminders?.id ?? pm.paymentReminders?.name ?? '<no-id>',
    spendingInsights: si.spendingInsights?.id ?? si.spendingInsights?.name ?? '<no-id>',
  }, { depth: null });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
