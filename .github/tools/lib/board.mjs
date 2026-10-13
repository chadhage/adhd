const placeholder = /^(?:none|n\/a|empty|nil|-+|\(none\)|_none_|\*none\*)\.?$/i;

function cleanCardText(line) {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\|/, '')
    .split('|')[0]
    .replace(/[*_`~]/g, '')
    .trim();
}

function isPlaceholder(line) {
  const text = cleanCardText(line);
  return text === '' || placeholder.test(text);
}

function bucketOf(headingText) {
  const name = headingText.toLowerCase().replace(/[^a-z]/g, '');
  if (name === 'todo') return 'todo';
  if (name === 'inprogress') return 'inProgress';
  return null;
}

/**
 * Counts unfinished cards in a two-bucket Markdown board.
 * A card is, in priority order: a heading nested under the bucket heading,
 * a table data row, or a column-0 list item. The board format is product-owned,
 * so the result is heuristic and reports `parsed: false` when a bucket is missing.
 */
export function parseBoard(text) {
  const buckets = {};
  let current = null;
  let currentLevel = 0;
  let tableRowIndex = 0;

  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const name = bucketOf(heading[2]);
      if (name) {
        current = name;
        currentLevel = level;
        tableRowIndex = 0;
        buckets[name] ??= { headings: 0, rows: 0, bullets: 0 };
        continue;
      }
      if (current && level <= currentLevel) {
        current = null;
        continue;
      }
      if (current && !isPlaceholder(line)) buckets[current].headings += 1;
      continue;
    }
    if (!current) continue;

    if (/^\s*\|/.test(line)) {
      tableRowIndex += 1;
      const isSeparator = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
      if (tableRowIndex > 2 && !isSeparator && !isPlaceholder(line)) buckets[current].rows += 1;
    } else if (/^(?:[-*+]|\d+[.)])\s+/.test(line) && !isPlaceholder(line)) {
      buckets[current].bullets += 1;
    }
  }

  const count = (bucket) => {
    if (!bucket) return 0;
    return bucket.headings || bucket.rows || bucket.bullets;
  };

  return {
    parsed: Boolean(buckets.todo && buckets.inProgress),
    todo: count(buckets.todo),
    inProgress: count(buckets.inProgress),
  };
}
