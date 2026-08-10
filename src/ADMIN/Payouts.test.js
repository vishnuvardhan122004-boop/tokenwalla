import { buildPayoutCsv } from './Payouts';

const row = (over) => ({
  doctor_name: 'A', recipient_name: 'A', mode: 'IMPS',
  upi_vpa: '', account_number: '0012345', ifsc: 'HDFC0001234',
  pending_amount: '1200.5', ...over,
});

test('one line per payable row, plus the header', () => {
  const csv = buildPayoutCsv([row(), row({ mode: 'UPI', upi_vpa: 'a@ybl' })]);
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv.split('\r\n')[0]).toMatch(/^"Recipient","Mode"/);
});

test('rows with no rail are left off the transfer file', () => {
  expect(buildPayoutCsv([row({ mode: null })]).split('\r\n')).toHaveLength(1);
});

test('amount is two-decimal rupees and the account number keeps its leading zero', () => {
  expect(buildPayoutCsv([row()])).toContain('"0012345","HDFC0001234","1200.50"');
});

test('a name that would run as a formula in Excel is defused', () => {
  expect(buildPayoutCsv([row({ recipient_name: '=cmd|calc' })]))
    .toContain(`"'=cmd|calc"`);
});

test('quotes and commas in a name do not break the columns', () => {
  const csv = buildPayoutCsv([row({ recipient_name: 'Rao, "Bob"' })]);
  expect(csv).toContain('"Rao, ""Bob"""');
  expect(csv.split('\r\n')).toHaveLength(2);
});
