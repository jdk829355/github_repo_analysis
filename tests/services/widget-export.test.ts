import { WIDGET_SVG_VERSION, renderWidgetSvg } from '../../services/widget-export';

describe('services/widget-export', () => {
  it('renders at a reduced display size while keeping the original coordinate space', () => {
    const svg = renderWidgetSvg({
      githubUsername: 'testuser',
      overallSummary: 'Strong backend engineer',
      roleEstimation: { primary: 'Backend', secondary: [], recommended: [] },
      greenFlags: ['API design'],
      redFlags: ['Limited testing evidence'],
      repositories: [{ language: 'TypeScript' }],
    });

    expect(svg).toContain('<svg width="613" height="431" viewBox="0 0 876 616"');
    expect(svg).toContain(`data-widget-version="${WIDGET_SVG_VERSION}"`);
  });
});
