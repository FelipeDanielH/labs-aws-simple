export type PdfTextRun = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEol: boolean;
};

export type PdfImagePlacement = {
  y: number;
  placeholder: string;
  alt: string;
};

type LayoutLine = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  height: number;
  hasEol: boolean;
};

type LayoutImage = {
  kind: "image";
  y: number;
  placeholder: string;
  alt: string;
};

export type PdfPageMarkdownResult = {
  markdown: string;
  likelyColumns: boolean;
  likelyTable: boolean;
};

export function pdfPageToMarkdown(
  pageNumber: number,
  runs: PdfTextRun[],
  images: PdfImagePlacement[],
): PdfPageMarkdownResult {
  const lines = groupRunsIntoLines(runs);
  const bodySize = median(
    lines.map((line) => line.height).filter((height) => height > 0),
  );
  const entries: Array<LayoutLine | LayoutImage> = [
    ...lines,
    ...images.map((image) => ({ kind: "image" as const, ...image })),
  ].sort((left, right) => right.y - left.y || entryX(left) - entryX(right));

  const output = [`<!-- Página ${pageNumber} -->`];
  let paragraph: string[] = [];
  let previousLine: LayoutLine | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    output.push(paragraph.join(" ").replace(/\s+/gu, " ").trim());
    paragraph = [];
  }

  for (const entry of entries) {
    if (entry.kind === "image") {
      flushParagraph();
      output.push(`![${escapeAlt(entry.alt)}](${entry.placeholder})`);
      previousLine = null;
      continue;
    }

    const text = entry.text.trim();
    if (!text) continue;
    const heading = headingLevel(entry, bodySize);
    const list = normalizeListItem(text);
    const verticalGap = previousLine
      ? previousLine.y - entry.y - Math.max(previousLine.height, entry.height)
      : 0;
    const startsNewParagraph =
      Boolean(previousLine) &&
      (verticalGap > Math.max(bodySize * 0.7, 5) ||
        entry.x - (previousLine?.x ?? entry.x) > bodySize * 2.5);

    if (heading) {
      flushParagraph();
      output.push(`${"#".repeat(heading)} ${text}`);
    } else if (list) {
      flushParagraph();
      output.push(list);
    } else {
      if (startsNewParagraph) flushParagraph();
      paragraph.push(text);
      if (entry.hasEol && verticalGap > bodySize * 0.3) flushParagraph();
    }
    previousLine = entry;
  }
  flushParagraph();

  return {
    markdown: `${output.join("\n\n").trim()}\n`,
    likelyColumns: hasLikelyColumns(runs),
    likelyTable: hasLikelyTable(runs),
  };
}

export function groupRunsIntoLines(runs: PdfTextRun[]): LayoutLine[] {
  const ordered = runs
    .filter((run) => run.text.trim())
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const groups: PdfTextRun[][] = [];

  for (const run of ordered) {
    const tolerance = Math.max(2, run.height * 0.35);
    const group = groups.find(
      (candidate) => Math.abs((candidate[0]?.y ?? run.y) - run.y) <= tolerance,
    );
    if (group) group.push(run);
    else groups.push([run]);
  }

  return groups
    .map((group) => {
      const sorted = [...group].sort((left, right) => left.x - right.x);
      let text = "";
      let rightEdge = sorted[0]?.x ?? 0;
      for (const run of sorted) {
        const gap = run.x - rightEdge;
        const needsSpace =
          Boolean(text) &&
          !/\s$/u.test(text) &&
          !/^\s/u.test(run.text) &&
          gap > Math.max(run.height * 0.12, 1);
        text += `${needsSpace ? " " : ""}${run.text}`;
        rightEdge = Math.max(rightEdge, run.x + run.width);
      }
      return {
        kind: "text" as const,
        text: text.replace(/\u00ad/gu, ""),
        x: sorted[0]?.x ?? 0,
        y: median(sorted.map((run) => run.y)),
        height: Math.max(...sorted.map((run) => run.height), 0),
        hasEol: sorted.some((run) => run.hasEol),
      };
    })
    .sort((left, right) => right.y - left.y || left.x - right.x);
}

function headingLevel(line: LayoutLine, bodySize: number): 1 | 2 | 3 | null {
  if (!bodySize || line.text.length > 160) return null;
  const ratio = line.height / bodySize;
  if (ratio >= 1.55) return 1;
  if (ratio >= 1.3) return 2;
  if (ratio >= 1.15 && line.text.length <= 100) return 3;
  return null;
}

function normalizeListItem(value: string): string | null {
  const bullet = /^[\s]*[•●▪◦‣]\s*(.+)$/u.exec(value);
  if (bullet) return `- ${bullet[1]}`;
  const unordered = /^[\s]*[-*+]\s+(.+)$/u.exec(value);
  if (unordered) return `- ${unordered[1]}`;
  const ordered = /^[\s]*(\d+)[.)]\s+(.+)$/u.exec(value);
  return ordered ? `${ordered[1]}. ${ordered[2]}` : null;
}

function hasLikelyColumns(runs: PdfTextRun[]): boolean {
  if (runs.length < 6) return false;
  const minX = Math.min(...runs.map((run) => run.x));
  const maxX = Math.max(...runs.map((run) => run.x));
  const span = maxX - minX;
  if (span < 120) return false;
  const midpoint = minX + span / 2;
  const left = runs.filter((run) => run.x < midpoint);
  const right = runs.filter((run) => run.x >= midpoint);
  if (left.length < 3 || right.length < 3) return false;
  let aligned = 0;
  for (const line of left) {
    if (
      right.some(
        (candidate) =>
          Math.abs(candidate.y - line.y) <=
          Math.max(candidate.height, line.height),
      )
    ) {
      aligned += 1;
    }
  }
  return aligned >= 3;
}

function hasLikelyTable(runs: PdfTextRun[]): boolean {
  if (runs.length < 9) return false;
  const rows: PdfTextRun[][] = [];
  for (const run of [...runs].sort(
    (left, right) => right.y - left.y || left.x - right.x,
  )) {
    const tolerance = Math.max(2, run.height * 0.35);
    const row = rows.find(
      (candidate) => Math.abs((candidate[0]?.y ?? run.y) - run.y) <= tolerance,
    );
    if (row) row.push(run);
    else rows.push([run]);
  }

  return (
    rows.filter((row) => {
      if (row.length < 3) return false;
      const sorted = [...row].sort((left, right) => left.x - right.x);
      let separatedCells = 1;
      for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1]!;
        const current = sorted[index]!;
        const gap = current.x - (previous.x + previous.width);
        if (gap > Math.max(previous.height, current.height, 12)) {
          separatedCells += 1;
        }
      }
      return separatedCells >= 3;
    }).length >= 3
  );
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function entryX(entry: LayoutLine | LayoutImage): number {
  return entry.kind === "text" ? entry.x : 0;
}

function escapeAlt(value: string): string {
  return value.replace(/[[\]]/gu, "").trim();
}
