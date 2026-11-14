const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats a rupee amount, e.g. 1234.5 -> "₹1,234.5". */
export function formatCurrency(amount) {
  return rupees.format(amount);
}

/** Converts "HH:MM" (24h) into "h:MM AM/PM". Returns the input if malformed. */
export function formatTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!match) return time ?? '';
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${match[2]} ${suffix}`;
}

/** "+919876543210" -> "+91 98765 43210"; other formats get light grouping. */
export function formatPhone(phone) {
  const indian = /^\+91(\d{5})(\d{5})$/.exec(phone);
  if (indian) return `+91 ${indian[1]} ${indian[2]}`;
  const local = /^(\d{5})(\d{5})$/.exec(phone);
  if (local) return `${local[1]} ${local[2]}`;
  return phone;
}

/** Pluralises a noun for a count: plural(1, 'seat') -> "1 seat". */
export function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
