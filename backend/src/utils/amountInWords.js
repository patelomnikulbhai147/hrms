// Indian-numbering amount-to-words (crore / lakh / thousand / hundred).
// Used by the Subscription Billing invoice: "Rupees Seven Thousand Twenty One Only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// 0..99
function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

// 0..999
function threeDigits(n) {
  const h = Math.floor(n / 100), r = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (r) out += (out ? ' ' : '') + twoDigits(r);
  return out;
}

// Whole number → Indian words (supports up to 99,99,99,999+ via crore grouping).
function numberToWords(num) {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// Currency phrasing, paise-aware:
//   7021      → "Rupees Seven Thousand Twenty One Only"
//   7021.50   → "Rupees Seven Thousand Twenty One and Fifty Paise Only"
function amountInWords(amount, currencyWord = 'Rupees') {
  const value = Number(amount) || 0;
  const negative = value < 0;
  const abs = Math.abs(value);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  let out = `${currencyWord} ${numberToWords(rupees)}`;
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`;
  out += ' Only';
  return (negative ? 'Minus ' : '') + out.replace(/\s+/g, ' ');
}

module.exports = { amountInWords, numberToWords };
