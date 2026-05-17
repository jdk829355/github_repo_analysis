interface RoleEstimation {
  primary: string;
  secondary: string[];
  recommended: string[];
}

export interface WidgetReport {
  overallSummary: string;
  roleEstimation: RoleEstimation;
  greenFlags: string[];
  redFlags: string[];
  repositories: Array<{
    language: string;
  }>;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getTopTechStack(report: WidgetReport): string[] {
  const repoLanguages = report.repositories.map((repo) => repo.language).filter(Boolean);
  return Array.from(new Set(repoLanguages)).slice(0, 4);
}

function splitLineByLength(value: string, maxLength: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function toLines(value: string, maxLength: number, maxLines: number): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const lines = splitLineByLength(normalized, maxLength).slice(0, maxLines);

  if (lines.length === maxLines && splitLineByLength(normalized, maxLength).length > maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.。]$/, '')}...`;
  }

  return lines;
}

function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  options: {
    size: number;
    fill: string;
    weight?: number;
    lineHeight: number;
  }
): string {
  return lines
    .map((line, index) => (
      `<text x="${x}" y="${y + index * options.lineHeight}" font-size="${options.size}" font-weight="${options.weight || 400}" fill="${options.fill}">${escapeXml(line)}</text>`
    ))
    .join('');
}

function renderFlagItems(items: string[], x: number, y: number, markerFill: string): string {
  const fallback = ['분석 신호가 아직 충분하지 않습니다.'];
  const visibleItems = (items.length > 0 ? items : fallback).slice(0, 3);

  return visibleItems
    .map((item, itemIndex) => {
      const itemY = y + itemIndex * 58;
      const lines = toLines(item, 30, 2);
      return [
        `<circle cx="${x}" cy="${itemY - 4}" r="4" fill="${markerFill}" />`,
        renderTextLines(lines, x + 16, itemY, {
          size: 14,
          fill: '#414753',
          lineHeight: 19,
        }),
      ].join('');
    })
    .join('');
}

export function renderWidgetSvg(report: WidgetReport): string {
  const primaryRole = report.roleEstimation.primary || 'Developer';
  const techStack = getTopTechStack(report);
  const summaryLines = toLines(report.overallSummary, 70, 3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="920" height="660" viewBox="0 0 920 660" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Pinned Signal GitHub profile analysis widget</title>
  <desc id="desc">A GitHub profile analysis summary with green flags and growth areas.</desc>
  <rect width="920" height="660" rx="0" fill="#F9F9FF"/>
  <rect x="22" y="22" width="876" height="616" rx="16" fill="white" stroke="#D9DEEA"/>
  <text x="58" y="68" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="1.5" fill="#005AB4">PINNED SIGNAL</text>
  <text x="58" y="112" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="#181C22">${escapeXml(primaryRole)} Profile</text>
  <rect x="714" y="58" width="126" height="34" rx="17" fill="#005AB4"/>
  <text x="777" y="80" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" fill="white">${report.repositories.length} pinned repos</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderTextLines(summaryLines, 58, 154, { size: 15, fill: '#414753', lineHeight: 24 })}
  </g>
  <rect x="58" y="232" width="${Math.max(112, primaryRole.length * 10 + 34)}" height="36" rx="18" fill="#005AB4"/>
  <text x="${58 + Math.max(112, primaryRole.length * 10 + 34) / 2}" y="255" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="white">${escapeXml(primaryRole)}</text>
  <text x="${58 + Math.max(112, primaryRole.length * 10 + 34) + 20}" y="255" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700" fill="#717785">${escapeXml(techStack.join(' · '))}</text>
  <rect x="58" y="310" width="382" height="266" rx="12" fill="#F0F8F3" stroke="#B9DCC7"/>
  <text x="82" y="354" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="#245235">Green Flags</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderFlagItems(report.greenFlags, 86, 392, '#2F8F46')}
  </g>
  <rect x="480" y="310" width="382" height="266" rx="12" fill="#FFF4F4" stroke="#EFC7C7"/>
  <text x="504" y="354" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="#6F2B2B">Growth Areas</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderFlagItems(report.redFlags, 508, 392, '#C84646')}
  </g>
  <text x="58" y="612" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#717785">Generated by Pinned Signal</text>
</svg>`;
}
