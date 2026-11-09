// Uzbek phone helpers. Inputs show a fixed "+998" prefix; the field itself
// holds only the 9 subscriber digits and the backend gets a clean E.164 number.

// Subscriber digits, with the 998 country code removed. The rule follows how a
// user reads the number: a leading "+998" is the country code and is dropped,
// but a plain "998…" (no plus) is kept, because "99 800 00 00" is a real
// subscriber number on operator 99. A bare "998" with a plus collapses to "".
// A code that slips in without a plus but still makes an over-long 12-digit
// number (e.g. pasted "998901234567") is also treated as the code and stripped.
function subDigits(input: string): string {
  let s = input.replace(/\s+/g, "");
  while (s.startsWith("+998")) s = s.slice(4); // explicit country code
  let d = s.replace(/\D/g, "");
  while (d.length > 9 && d.startsWith("998")) d = d.slice(3);
  return d.slice(0, 9);
}

function group(d: string): string {
  let out = "";
  if (d.length) out += d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return out;
}

export function formatUzPhone(input: string): string {
  const d = subDigits(input);
  return d.length ? "+998 " + group(d) : "+998";
}

// E.164 form for the API, e.g. "+998901234567".
export function normUzPhone(input: string): string {
  return "+998" + subDigits(input);
}

// 9 subscriber digits entered?
export function isValidUzPhone(input: string): boolean {
  return subDigits(input).length === 9;
}

// Subscriber digits only (max 9), country code stripped. For inputs that show
// a fixed "+998" prefix separately, so the field never holds the code itself.
export function uzSubscriber(input: string): string {
  return subDigits(input);
}

// Pretty subscriber without the code, e.g. "90 123 45 67".
export function formatUzSubscriber(input: string): string {
  return group(subDigits(input));
}

// A number shown back to its owner where others may see the screen (OTP
// steps): operator code and the last two digits stay, the rest is hidden,
// e.g. "+998 90 *** ** 67". Anything that is not a full Uzbek number is masked
// down to its last two digits.
export function maskUzPhone(input: string): string {
  const d = subDigits(input);
  if (d.length === 9) return `+998 ${d.slice(0, 2)} *** ** ${d.slice(7)}`;
  const all = (input || "").replace(/\D/g, "");
  return all.length > 2 ? `•••${all.slice(-2)}` : "";
}
