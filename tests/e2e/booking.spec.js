const { test, expect } = require('@playwright/test');

test.describe('Página do Cliente', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('header e hero carregam corretamente', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('#hero h1')).toBeVisible();
    await expect(page.locator('#hero .btn-primary')).toBeVisible();
  });

  test('seção de serviços carrega com cards', async ({ page }) => {
    await expect(page.locator('#servicos')).toBeVisible();
    await expect(page.locator('#services-grid')).toBeVisible();

    // Aguarda serviços carregarem (API ou fallback)
    await page.waitForFunction(() => {
      const grid = document.getElementById('services-grid');
      return grid && grid.querySelectorAll('.service-card').length > 0;
    }, { timeout: 5000 });

    const cards = page.locator('#services-grid .service-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('health check da API responde OK', async ({ page }) => {
    const res = await page.request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('API de serviços retorna lista válida', async ({ page }) => {
    const res = await page.request.get('/api/services');
    expect(res.ok()).toBeTruthy();
    const services = await res.json();
    expect(Array.isArray(services)).toBe(true);
  });

  test('step 1 de agendamento — selecionar serviço', async ({ page }) => {
    await page.click('a[href="#agendar"]');
    await page.waitForTimeout(500);

    await expect(page.locator('#step-1-content')).toBeVisible();
    await expect(page.locator('#booking-services')).toBeVisible();

    // Aguarda serviços carregarem no booking
    await page.waitForFunction(() => {
      const el = document.getElementById('booking-services');
      return el && el.children.length > 0;
    }, { timeout: 5000 });

    const options = page.locator('#booking-services .service-option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Seleciona o primeiro serviço
    await options.first().click();
    await expect(options.first()).toHaveClass(/selected/);
  });

  test('step 2 — calendário aparece após selecionar serviço', async ({ page }) => {
    await page.click('a[href="#agendar"]');
    await page.waitForTimeout(500);

    // Seleciona primeiro serviço disponível
    await page.waitForFunction(() => {
      return document.querySelectorAll('#booking-services .service-option').length > 0;
    }, { timeout: 5000 });

    await page.locator('#booking-services .service-option').first().click();
    await page.locator('#step-1-content .btn-primary').click();

    await expect(page.locator('#step-2-content')).toBeVisible();
    await expect(page.locator('.calendar-wrapper')).toBeVisible();
    await expect(page.locator('#cal-grid')).toBeVisible();
    await expect(page.locator('#cal-title')).toBeVisible();
  });

  test('step 2 — navegação de calendário funciona', async ({ page }) => {
    await page.click('a[href="#agendar"]');
    await page.waitForTimeout(500);

    await page.waitForFunction(() => {
      return document.querySelectorAll('#booking-services .service-option').length > 0;
    }, { timeout: 5000 });

    await page.locator('#booking-services .service-option').first().click();
    await page.locator('#step-1-content .btn-primary').click();

    const titleBefore = await page.locator('#cal-title').textContent();
    await page.locator('.cal-nav').nth(1).click(); // próximo mês
    const titleAfter = await page.locator('#cal-title').textContent();

    expect(titleAfter).not.toBe(titleBefore);
  });

  test('step 3 — formulário de dados pessoais', async ({ page }) => {
    await page.click('a[href="#agendar"]');
    await page.waitForTimeout(500);

    await page.waitForFunction(() => {
      return document.querySelectorAll('#booking-services .service-option').length > 0;
    }, { timeout: 5000 });

    await page.locator('#booking-services .service-option').first().click();
    await page.locator('#step-1-content .btn-primary').click();

    // Avança step 2 sem selecionar slot (valida que o botão existe)
    await page.locator('#step-2-content .btn-primary').click();
    await expect(page.locator('#step-3-content')).toBeVisible();

    await expect(page.locator('#client-name')).toBeVisible();
    await expect(page.locator('#client-phone')).toBeVisible();
    await expect(page.locator('#client-email')).toBeVisible();
    await expect(page.locator('#client-notes')).toBeVisible();
  });

  test('botão voltar navega entre steps', async ({ page }) => {
    await page.click('a[href="#agendar"]');
    await page.waitForTimeout(500);

    await page.waitForFunction(() => {
      return document.querySelectorAll('#booking-services .service-option').length > 0;
    }, { timeout: 5000 });

    await page.locator('#booking-services .service-option').first().click();
    await page.locator('#step-1-content .btn-primary').click();
    await expect(page.locator('#step-2-content')).toBeVisible();

    await page.locator('#step-2-content .btn-ghost').click();
    await expect(page.locator('#step-1-content')).toBeVisible();
  });

  test('footer exibe link para área do admin', async ({ page }) => {
    await expect(page.locator('footer a[href="/admin.html"]')).toBeVisible();
  });
});
