/** Parse the text form used by the console and playground without shell execution. */
export function parseCommandLine(source) {
  const tokens = [];
  let value = '', quote = '', started = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '\\' && quote !== "'") {
      started = true;
      const next = source[++index];
      if (next === undefined) throw Object.assign(new Error('Finish the escaped character after the backslash.'), { statusCode: 400 });
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', a: '\x07' };
      if (next === 'x') {
        const hex = source.slice(index + 1, index + 3);
        if (!/^[0-9a-f]{2}$/i.test(hex)) throw Object.assign(new Error('Hexadecimal escapes need two digits, for example \\x41.'), { statusCode: 400 });
        value += String.fromCharCode(parseInt(hex, 16)); index += 2;
      } else value += escapes[next] ?? next;
    } else if (quote) {
      if (char === quote) quote = '';
      else value += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) {
      if (started) { tokens.push(value); value = ''; started = false; }
    } else { value += char; started = true; }
  }
  if (quote) throw Object.assign(new Error('Close the quoted argument before running this command.'), { statusCode: 400 });
  if (started) tokens.push(value);
  return tokens;
}
