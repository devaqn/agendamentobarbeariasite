const { test, expect } = require('@playwright/test');

test.describe('Painel Administrativo', () => {
  test('página de login carrega corretamente', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('#admin-app')).toHaveCSS('display', 'none');
  });

  test('link de voltar ao site está presente', async ({ page }) => {
    await page.goto('/admin.html');

    const backLink = page.locator('a[href="/"]');
    await expect(backLink).toBeVisible();
    await expect(backLink).toContainText('Voltar ao site');
  });

  test('exibe erro ao tentar login com campos vazios', async ({ page }) => {
    await page.goto('/admin.html');
    await page.click('#login-btn');

    // Sem credenciais, deve mostrar erro ou bloquear
    // O comportamento pode variar (browser validation vs API error)
    const emailInput = page.locator('#login-email');
    const validity = await emailInput.evaluate(el => el.validity.valid);
    // Se browser validation estiver ativo, o campo será inválido
    // Se não, a API retornará 400 e mostrará o erro
    expect(validity === false || await page.locator('#login-error').isVisible()).toBeTruthy();
  });

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/admin.html');

    await page.fill('#login-email', 'errado@email.com');
    await page.fill('#login-password', 'senhaerrada');
    await page.click('#login-btn');

    // Aguarda resposta da API
    await page.waitForTimeout(2000);

    const errorEl = page.locator('#login-error');
    // Com banco real: deve mostrar erro. Sem banco: API retorna 500 (tratado como erro)
    await expect(errorEl).toBeVisible({ timeout: 5000 });
  });

  test('formulário de login tem atributos de acessibilidade corretos', async ({ page }) => {
    await page.goto('/admin.html');

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');

    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(emailInput).toHaveAttribute('autocomplete', 'username');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });
});

// Testes de painel admin (requerem banco de dados funcionando)
test.describe('Painel Admin — com credenciais reais', () => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@barbearia.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || '';

  test.skip(!adminPassword, 'TEST_ADMIN_PASSWORD não configurado — pule em CI sem banco');

  test('login com credenciais válidas exibe dashboard', async ({ page }) => {
    await page.goto('/admin.html');

    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', adminPassword);
    await page.click('#login-btn');

    await expect(page.locator('#admin-app')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#login-screen')).toHaveCSS('display', 'none');
    await expect(page.locator('.stats-grid')).toBeVisible();
  });

  test('sidebar tem todos os itens de navegação', async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', adminPassword);
    await page.click('#login-btn');

    await expect(page.locator('[data-view="dashboard"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-view="appointments"]')).toBeVisible();
    await expect(page.locator('[data-view="slots"]')).toBeVisible();
    await expect(page.locator('[data-view="services"]')).toBeVisible();
  });

  test('navega para view de agendamentos', async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', adminPassword);
    await page.click('#login-btn');

    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 5000 });
    await page.click('[data-view="appointments"]');

    await expect(page.locator('#view-appointments')).toBeVisible();
    await expect(page.locator('#appointments-tbody')).toBeVisible();
  });

  test('navega para view de horários', async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', adminPassword);
    await page.click('#login-btn');

    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 5000 });
    await page.click('[data-view="slots"]');

    await expect(page.locator('#view-slots')).toBeVisible();
    await expect(page.locator('.time-grid')).toBeVisible();
  });

  test('logout redireciona para tela de login', async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', adminPassword);
    await page.click('#login-btn');

    await page.waitForSelector('#admin-app', { state: 'visible', timeout: 5000 });
    await page.click('button[onclick="logout()"]');

    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#admin-app')).toHaveCSS('display', 'none');
  });
});
