import { test, expect } from '@playwright/test';

const mockReport = {
  overallSummary: 'Test user summary',
  techStack: ['TypeScript', 'React'],
  mainContributionAreas: ['Frontend', 'Open Source'],
  repositories: [
    { name: 'repo-a', description: 'Test repo', language: 'TypeScript', stars: 42 },
  ],
  roleEstimation: {
    primary: 'Frontend Engineer',
    secondary: ['Full Stack'],
    recommended: ['Tech Lead'],
  },
  engineeringStrengths: ['Clean code', 'Testing', 'Performance'],
  collaborationPatterns: ['Code reviews', 'Pair programming'],
  greenFlags: ['Consistent commits', 'Documentation'],
  redFlags: [],
};

test.describe('Report Page - Widget Export Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`/api/report/test-job`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReport),
      });
    });
  });

  test('shows widget export button in header and opens modal', async ({ page }) => {
    await page.goto('/report/test-job');
    await page.waitForLoadState('networkidle');

    // Verify the widget button is in the header, not in the main content
    const header = page.locator('header');
    const widgetButton = header.getByRole('button', { name: /HTML 위젯보내기/i });
    await expect(widgetButton).toBeVisible();

    // Verify no widget section in main content
    const main = page.locator('main');
    await expect(main.getByRole('heading', { name: /HTML 위젯보내기/i })).not.toBeVisible();

    // Open modal
    await widgetButton.click();

    // Modal should appear with iframe preview and copy button
    const modal = page.locator('text=HTML 위젯 보내기');
    await expect(modal).toBeVisible();

    const iframe = page.locator('iframe[title="Pinned Signal profile widget preview"]');
    await expect(iframe).toBeVisible();

    const copyButton = page.getByRole('button', { name: '복사' });
    await expect(copyButton).toBeVisible();
  });

  test('closes modal via close button', async ({ page }) => {
    await page.goto('/report/test-job');
    await page.waitForLoadState('networkidle');

    const widgetButton = page.locator('header').getByRole('button', { name: /HTML 위젯보내기/i });
    await widgetButton.click();

    const modal = page.locator('text=HTML 위젯 보내기');
    await expect(modal).toBeVisible();

    const closeButton = page.getByRole('button', { name: '닫기' });
    await closeButton.click();

    await expect(modal).not.toBeVisible();
  });

  test('closes modal via overlay click', async ({ page }) => {
    await page.goto('/report/test-job');
    await page.waitForLoadState('networkidle');

    const widgetButton = page.locator('header').getByRole('button', { name: /HTML 위젯보내기/i });
    await widgetButton.click();

    const modal = page.locator('text=HTML 위젯 보내기');
    await expect(modal).toBeVisible();

    // Click the dark overlay background (absolute inset-0 div)
    const overlay = page.locator('div.bg-black\\/60');
    await overlay.click();

    await expect(modal).not.toBeVisible();
  });
});
