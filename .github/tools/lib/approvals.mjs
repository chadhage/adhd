export function parseJsonLines(text) {
  const entries = [];
  const invalid = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && !Array.isArray(value)) entries.push(value);
      else invalid.push(index + 1);
    } catch {
      invalid.push(index + 1);
    }
  });
  return { entries, invalid };
}

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * A stoppage approval must name a human approver and a verifiable source.
 * The record is only as trustworthy as the path that stores it: keep it in a
 * location agents cannot write to. This function cannot verify authorship.
 */
export function isValidApproval(entry, types) {
  return (
    types.includes(entry.type) &&
    entry.approverKind === 'human' &&
    nonEmpty(entry.approver) &&
    nonEmpty(entry.source) &&
    Number.isFinite(Date.parse(entry.ts)) &&
    entry.revoked !== true
  );
}

export function findApprovals(entries, types) {
  return entries.filter((entry) => isValidApproval(entry, types));
}

export const factoryShutdownType = 'factory-shutdown-approval';
export const stoppageTypes = [factoryShutdownType, 'stoppage-approval'];
