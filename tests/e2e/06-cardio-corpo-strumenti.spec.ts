import path from 'node:path';
import { expect, test } from '@playwright/test';
import { box, day, openApp, serverRows, tag } from './helpers';

const ICON = path.resolve(import.meta.dirname, '../../web/public/icon-512.png');
const MASKABLE = path.resolve(import.meta.dirname, '../../web/public/icon-maskable-512.png');

test.describe('cardio, corpo e strumenti', () => {
  test('cardio: registra, modifica, compare nel calendario, elimina', async ({ page }) => {
    const note = `Parco ${tag()}`;
    const when = day(-25);
    await openApp(page, '/allena');
    await page.getByRole('link', { name: 'Registra cardio' }).click();
    await page.getByRole('button', { name: 'Corsa' }).click();
    await page.locator('input[type=date]').fill(when);
    await page.getByRole('button', { name: 'Aumenta Durata' }).click();
    await page.getByLabel(/Distanza in km/).fill('6,1');
    await page.getByLabel('Note').fill(note);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page).toHaveURL(/\/andamento$/);

    await expect.poll(async () => (await serverRows(page.request, 'cardio_sessions')).find((c) => c.notes === note))
      .toMatchObject({ activity: 'corsa', duration_sec: 2100, distance_km: 6.1, date: when });
    const id = (await serverRows(page.request, 'cardio_sessions')).find((c) => c.notes === note)!.id;
    const row = page.locator(`a.list-row[href="/cardio/${id}"]`);
    await expect(row).toContainText('Corsa');
    await expect(row).toContainText('35 min · 6,1 km · 5:44 /km');

    await row.click();
    await page.getByRole('button', { name: 'Cyclette' }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(row).toContainText('10,5 km/h');

    await page.getByRole('tab', { name: 'Calendario' }).click();
    if (when.slice(0, 7) !== day().slice(0, 7)) await page.getByRole('button', { name: 'Mese precedente' }).click();
    await expect(page.locator(`.cal > .cal-day:not(.out)[aria-label^="${Number(when.slice(8))} "]`)).toHaveClass(/cardio|trained/);

    await page.goto(`/cardio/${id}`);
    await page.getByRole('button', { name: 'Elimina' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect.poll(async () => (await serverRows(page.request, 'cardio_sessions')).some((c) => c.notes === note)).toBe(false);
  });

  test('corpo: misure con grafico e foto con confronto prima e dopo', async ({ page }) => {
    await openApp(page, '/andamento?v=corpo');
    for (const [offset, weight, waist] of [[-28, '82,4', '90'], [-14, '81,6', '88,5'], [0, '80,9', '87']] as const) {
      await page.getByRole('link', { name: 'Misura' }).click();
      await page.locator('input[type=date]').fill(day(offset));
      await page.getByLabel('Peso (kg)').fill(weight);
      await page.getByLabel('Vita (cm)').fill(waist);
      await page.getByRole('button', { name: 'Salva' }).click();
      await expect(page.locator('.body-head')).toBeVisible();
    }
    await expect(page.locator('.body-head')).toContainText('80,9');
    await expect(page.locator('.body-head')).toContainText('−0,7 kg dalla volta prima');
    await expect(page.locator('.chart svg')).toHaveAttribute('aria-label', /^Peso: da 82,4 a 80,9 kg/);
    await page.getByRole('group', { name: 'Misura da mostrare' }).getByRole('button', { name: 'Vita' }).click();
    await expect(page.locator('.chart svg')).toHaveAttribute('aria-label', /^Vita: da 90 a 87 cm/);

    // Una misurazione senza valori non si salva.
    await page.getByRole('link', { name: 'Misura' }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('alert')).toHaveText('Inserisci almeno un valore.');
    await page.goBack();

    // Foto: due nella stessa posa danno il confronto.
    for (const [offset, file] of [[-28, ICON], [0, MASKABLE]] as const) {
      await page.getByRole('button', { name: 'Aggiungi foto' }).click();
      await page.getByRole('dialog').locator('input[type=date]').fill(day(offset));
      await page.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(page.locator('.compare img')).toHaveCount(2);
    const selects = page.locator('.compare select');
    await expect(selects.first().locator('option:checked')).toHaveText(new RegExp(String(Number(day(-28).slice(8)))));
    await expect.poll(async () => (await serverRows(page.request, 'progress_photos')).length).toBeGreaterThanOrEqual(2);
    const photo = (await serverRows(page.request, 'progress_photos'))[0];
    await expect.poll(async () => (await page.request.get(`/api/photos/${photo.photo_id}`)).status()).toBe(200);

    await page.locator('.photo-thumb').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina foto' }).click();
    await expect(page.locator('.compare')).toHaveCount(0);
  });

  test('strumenti: dischi da caricare e massimale', async ({ page }) => {
    await openApp(page, '/strumenti');
    const bar = page.locator('.barbell');
    await expect(bar).toHaveAttribute('aria-label', 'Per lato: 25, 15 kg');
    await box(page, 'Peso totale').fill('142,5');
    await box(page, 'Peso totale').press('Enter');
    await expect(bar).toHaveAttribute('aria-label', 'Per lato: 25, 25, 10, 1,25 kg');
    await box(page, 'Peso totale').fill('101');
    await box(page, 'Peso totale').press('Enter');
    await expect(page.locator('.card .alert')).toContainText('arrivi a 100 kg, cioè 1 kg in meno');

    // Senza dischi da 25 il calcolo cambia, e la scelta resta salvata.
    await box(page, 'Peso totale').fill('100');
    await box(page, 'Peso totale').press('Enter');
    await page.getByRole('button', { name: '25', exact: true }).click();
    await expect(bar).toHaveAttribute('aria-label', 'Per lato: 20, 20 kg');
    await expect.poll(async () => (await serverRows(page.request, 'settings')).find((s) => s.id === 'plate_set')?.value).not.toContain(25);
    await page.getByRole('button', { name: '25', exact: true }).click();

    await expect(page.locator('.max-result')).toContainText('100,3');
    await expect(page.locator('.max-result')).toContainText('Epley 101,3 · Brzycki 99,3');
    await expect(page.locator('.table tbody tr').nth(4)).toHaveText(/^5\s*85 kg\s*86%$/);
  });
});
