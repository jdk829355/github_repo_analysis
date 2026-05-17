interface RoleEstimation {
  primary: string;
  secondary: string[];
  recommended: string[];
}

export interface WidgetReport {
  githubUsername: string;
  overallSummary: string;
  roleEstimation: RoleEstimation;
  greenFlags: string[];
  redFlags: string[];
  repositories: Array<{
    language: string;
  }>;
}

export type WidgetTheme = 'light' | 'dark';
export const WIDGET_SVG_VERSION = 'inner-card-v3';

const WIDGET_THEMES: Record<WidgetTheme, {
  background: string;
  card: string;
  border: string;
  heading: string;
  body: string;
  muted: string;
  brand: string;
  brandText: string;
  greenBg: string;
  greenBorder: string;
  greenHeading: string;
  greenMarker: string;
  redBg: string;
  redBorder: string;
  redHeading: string;
  redMarker: string;
}> = {
  light: {
    background: '#F9F9FF',
    card: '#FFFFFF',
    border: '#D9DEEA',
    heading: '#181C22',
    body: '#414753',
    muted: '#717785',
    brand: '#005AB4',
    brandText: '#FFFFFF',
    greenBg: '#EEF6FF',
    greenBorder: '#B8D9FF',
    greenHeading: '#005AB4',
    greenMarker: '#58A6FF',
    redBg: '#EEF6FF',
    redBorder: '#B8D9FF',
    redHeading: '#005AB4',
    redMarker: '#58A6FF',
  },
  dark: {
    background: '#0D1117',
    card: '#0D1117',
    border: '#30363D',
    heading: '#F4F7FB',
    body: '#D5DCE7',
    muted: '#9AA6B6',
    brand: '#58A6FF',
    brandText: '#07111F',
    greenBg: '#14263A',
    greenBorder: '#2F6FB2',
    greenHeading: '#58A6FF',
    greenMarker: '#58A6FF',
    redBg: '#14263A',
    redBorder: '#2F6FB2',
    redHeading: '#58A6FF',
    redMarker: '#58A6FF',
  },
};

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
  const allLines = splitLineByLength(normalized, maxLength);
  const lines = allLines.slice(0, maxLines);

  if (lines.length === maxLines && allLines.length > maxLines) {
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

function renderFlagItems(
  items: string[],
  x: number,
  y: number,
  colors: { marker: string; text: string }
): string {
  const fallback = ['분석 신호가 아직 충분하지 않습니다.'];
  const visibleItems = (items.length > 0 ? items : fallback).slice(0, 3);

  return visibleItems
    .map((item, itemIndex) => {
      const itemY = y + itemIndex * 58;
      const lines = toLines(item, 30, 2);
      return [
        `<circle cx="${x}" cy="${itemY - 4}" r="4" fill="${colors.marker}" />`,
        renderTextLines(lines, x + 16, itemY, {
          size: 14,
          fill: colors.text,
          lineHeight: 19,
        }),
      ].join('');
    })
    .join('');
}

export function renderWidgetSvg(report: WidgetReport, theme: WidgetTheme = 'light'): string {
  const colors = WIDGET_THEMES[theme];
  const primaryRole = report.roleEstimation.primary || 'Developer';
  const roleWidth = Math.max(112, primaryRole.length * 10 + 34);
  const profileTitle = report.githubUsername ? `@ ${report.githubUsername}` : 'GitHub Profile';
  const techStack = getTopTechStack(report);
  const summaryLines = toLines(report.overallSummary, 70, 3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="876" height="616" viewBox="0 0 876 616" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" data-widget-version="${WIDGET_SVG_VERSION}">
  <title id="title">Pinned Signal GitHub profile analysis widget</title>
  <desc id="desc">A GitHub profile analysis summary with green flags and growth areas.</desc>
  <rect x="0.5" y="0.5" width="875" height="615" rx="22" fill="${colors.card}" stroke="${colors.border}"/>
  <text x="36" y="46" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="1.5" fill="${colors.brand}">PINNED SIGNAL</text>
  <text x="36" y="90" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="${colors.heading}">${escapeXml(profileTitle)}</text>
  <rect x="692" y="36" width="126" height="34" rx="17" fill="${colors.brand}"/>
  <text x="755" y="58" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" fill="${colors.brandText}">${report.repositories.length} pinned repos</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderTextLines(summaryLines, 36, 132, { size: 15, fill: colors.body, lineHeight: 24 })}
  </g>
  <rect x="36" y="210" width="${roleWidth}" height="36" rx="18" fill="${colors.brand}"/>
  <text x="${36 + roleWidth / 2}" y="233" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="${colors.brandText}">${escapeXml(primaryRole)}</text>
  <text x="${36 + roleWidth + 20}" y="233" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700" fill="${colors.muted}">${escapeXml(techStack.join(' · '))}</text>
  <text x="60" y="332" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="${colors.greenHeading}">Green Flags</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderFlagItems(report.greenFlags, 64, 370, { marker: colors.greenMarker, text: colors.body })}
  </g>
  <text x="482" y="332" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" fill="${colors.redHeading}">Growth Areas</text>
  <g font-family="Inter, Arial, sans-serif">
    ${renderFlagItems(report.redFlags, 486, 370, { marker: colors.redMarker, text: colors.body })}
  </g>
  <text x="36" y="590" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="${colors.muted}">Generated by Pinned Signal</text>
</svg>`;
}

export function renderWidgetSvgVariants(report: WidgetReport): {
  light: string;
  dark: string;
} {
  return {
    light: renderWidgetSvg(report, 'light'),
    dark: renderWidgetSvg(report, 'dark'),
  };
}
