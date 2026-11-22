import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openApp, serverRows, tag } from './helpers';

const ICON = path.resolve(import.meta.dirname, '../../web/public/icon-512.png');

test.describe('libreria esercizi', () => {
  test('ricerca e filtri', async ({ page }) => {
    await openApp(page, '/esercizi');
    const count = Number((await page.locator('.count').textContent())!.match(/\d+/)![0]);
    expect(count).toBeGreaterThanOrEqual(100);

    await page.getByLabel('Cerca un esercizio').fill('panca');
    await page.getByRole('group', { name: 'Filtra per gruppo muscolare' }).getByRole('button', { name: 'Petto' }).click();
    const names = await page.locator('.list-row .ex-name').allTextContents();
    expect(names.length).toBeGreaterThan(2);
    for (const n of names) expect(n.toLowerCase()).toContain('panca');
    for (const m of await page.locator('.list-row .grow > .muted').allTextContents()) expect(m).toMatch(/^Petto/);

    await page.getByLabel('Cerca un esercizio').fill('');
    await page.getByRole('group', { name: 'Filtra per attrezzo' }).getByRole('button', { name: 'Kettlebell' }).click();
    for (const m of await page.locator('.list-row .grow > .muted').allTextContents()) expect(m).toBe('Petto · Kettlebell');

    await page.getByLabel('Cerca un esercizio').fill('nessun esercizio così');
    await expect(page.getByText('Nessun esercizio trovato.')).toBeVisible();
  });

  test('esercizio personale a tacche con foto: crea, modifica, elimina', async ({ page }) => {
    const name = `Pressa E2E ${tag()}`;
    await openApp(page, '/esercizi');
    await page.getByRole('link', { name: 'Nuovo' }).click();
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Quadricipiti' }).click();
    await page.getByRole('button', { name: 'Macchina', exact: true }).click();
    await page.getByRole('button', { name: 'Tacche della macchina' }).click();
    await page.getByLabel(/Kg per tacca/).fill('7,5');
    await page.getByLabel('Note').fill('Sedile in posizione 4');
    await page.locator('input[type=file]').setInputFiles(ICON);
    await expect(page.locator('img.photo')).toBeVisible();
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.locator('.page-head h1')).toHaveText(name);
    await expect(page.locator('.facts')).toContainText('Una tacca');
    await expect(page.locator('.facts')).toContainText('7,5 kg');
    await expect(page.locator('.tags')).toContainText('Mio');
    await expect(page.locator('.tags')).toContainText('A tacche');
    await expect(page.locator('.notes')).toHaveText('Sedile in posizione 4');

    await expect.poll(async () => (await serverRows(page.request, 'exercises')).find((e) => e.name === name)).toMatchObject({
      muscle: 'quadricipiti', equipment: 'macchina', load_unit: 'tacche', notch_kg: 7.5, step: 1, custom: true,
    });
    const photoId = (await serverRows(page.request, 'exercises')).find((e) => e.name === name)!.photo_id;
    await expect.poll(async () => (await page.request.get(`/api/photos/${photoId}`)).status()).toBe(200);

    await page.getByRole('link', { name: 'Modifica' }).click();
    await page.getByLabel('Note').fill('Sedile in posizione 5');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.locator('.notes')).toHaveText('Sedile in posizione 5');

    await page.goto('/esercizi');
    await page.getByRole('button', { name: 'Solo miei' }).click();
    await expect(page.locator('.list-row', { hasText: name })).toBeVisible();
    await page.locator('.list-row', { hasText: name }).click();

    await page.getByRole('button', { name: 'Elimina esercizio' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page).toHaveURL(/\/esercizi$/);
    await expect(page.locator('.list-row', { hasText: name })).toHaveCount(0);
    await expect.poll(async () => (await serverRows(page.request, 'exercises')).some((e) => e.name === name)).toBe(false);
  });

  test('il modulo segnala i valori non validi', async ({ page }) => {
    await openApp(page, '/esercizi/nuovo');
    await page.getByLabel('Nome', { exact: true }).fill('Prova');
    await page.getByLabel(/Passo dei pulsanti/).fill('0');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('alert')).toHaveText('Il passo deve essere un numero maggiore di zero.');
  });
});
