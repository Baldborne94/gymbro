import { expect, test } from '@playwright/test';
import { PASSWORD, loginUi, openApp } from './helpers';

test.describe('accesso e app installabile', () => {
  test('una password sbagliata viene rifiutata, quella giusta apre l’app', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Carica il bilanciere.')).toBeVisible();
    await page.getByLabel('Password').fill('sbagliata');
    await page.getByRole('button', { name: 'Entra' }).click();
    await expect(page.getByRole('alert')).toHaveText('Password errata');
    await loginUi(page);
    await expect(page.locator('.logo')).toBeVisible();
  });

  test('l’uscita riporta al login anche dopo un ricaricamento', async ({ page }) => {
    await openApp(page);
    await page.locator('a.tab', { hasText: 'Altro' }).click();
    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page.getByLabel('Password')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('senza accesso i dati non sono raggiungibili', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get('/api/export/gymbro.json')).status()).toBe(401);
    expect((await anon.post('/api/sync', { data: {} })).status()).toBe(401);
    await anon.dispose();
  });

  test('manifest, icone e service worker per l’installazione', async ({ page }) => {
    await openApp(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await page.request.get(href!)).json();
    expect(manifest).toMatchObject({ name: 'GymBro', lang: 'it', display: 'standalone', start_url: '/' });
    for (const icon of manifest.icons) expect((await page.request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active)))).toBe(true);
  });

  test('dopo il primo avvio l’app si apre anche senza rete', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // ora la pagina è servita dal service worker
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await page.locator('a.tab', { hasText: 'Altro' }).click();
    await page.getByRole('link', { name: /Libreria esercizi/ }).click();
    await expect(page.locator('.list-row').first()).toBeVisible();
    await page.locator('a.tab', { hasText: 'Altro' }).click();
    await expect(page.getByText('Server non raggiungibile')).toBeVisible({ timeout: 15_000 });
  });

  test('la password di prova coincide con quella del server di test', () => {
    expect(PASSWORD).toBe('e2e-password');
  });
});
