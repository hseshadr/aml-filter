import { test, expect } from '@playwright/test';

test.describe('AML-Filter v2 Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock backend APIs so E2E is stable without a running backend.
    await page.route('**/v1/usage**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant_id: 'test-tenant',
          period_start: null,
          period_end: null,
          event_type: null,
          summary: { screen: 3 },
          total_units: 3,
        }),
      })
    })

    await page.route('**/v1/lists**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            list_id: 'OFAC_SDN',
            enabled: true,
            version_override: null,
            current_version: '2024-01',
            updated_at: new Date().toISOString(),
          },
        ]),
      })
    })

    await page.route('**/v1/screen', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: 'req_1',
          execution_time_ms: 10,
          list_versions_used: { OFAC_SDN: '2024-01' },
          matches: [
            {
              entity_id: 'ofac:sdn:123',
              score: 0.9,
              risk_category: 'SANCTION',
              source_list: 'OFAC_SDN',
              list_version: '2024-01',
              primary_name: 'JOHN DOE',
              aliases: [],
              countries: ['US'],
              dob: [],
              reasons: [
                { signal: 'name_vector', value: 0.9, weight: 0.55, contribution: 0.495, description: 'Vector similarity' },
              ],
              explanation: 'Match due to: strong vector similarity',
            },
          ],
        }),
      })
    })
  })

  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await expect(page).toHaveURL(/.*login/);
  });

  test('should allow login with API key', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    
    // Fill in API key (mock or test key)
    await page.fill('input[type="password"]', 'test-api-key-123');
    await page.click('button[type="submit"]');
    
    // Should be on home page
    await expect(page).toHaveURL('http://localhost:5173/');
    await expect(page.locator('h1')).toContainText('AML-Filter v2');
  });

  test('should navigate to search page', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="password"]', 'test-api-key-123');
    await page.click('button[type="submit"]');
    
    await page.click('text=Search');
    await expect(page).toHaveURL(/.*search/);
    await expect(page.locator('h1')).toContainText('Entity Screening');
  });

  test('should show usage dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="password"]', 'test-api-key-123');
    await page.click('button[type="submit"]');
    
    await page.click('text=Usage');
    await expect(page).toHaveURL(/.*usage/);
    await expect(page.locator('h1')).toContainText('Usage Dashboard');
  });

  test('should perform a search and show results (mocked API)', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="password"]', 'test-api-key-123');
    await page.click('button[type="submit"]');

    await page.click('text=Search');
    await expect(page).toHaveURL(/.*search/);

    await page.fill('input#name', 'John Doe');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Results')).toBeVisible();
    await expect(page.locator('text=JOHN DOE')).toBeVisible();
  });
});

