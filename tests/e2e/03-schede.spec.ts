import { expect, test, type Page } from '@playwright/test';
import { box, day, openApp, serverRows, tag } from './helpers';

async function addExercise(page: Page, name: string) {
  await page.getByRole('button', { name: 'Aggiungi esercizio' }).click();
  await page.locator('.overlay input[type=search]').fill(name);
  await page.locator('.overlay .list-row').filter({ has: page.locator('.ex-name', { hasText: new RegExp(`^${name}$`) }) }).click();
  await expect(page.getByRole('dialog', { name })).toBeVisible();
}

test.describe('schede e cicli', () => {
  test('crea una scheda da modello, la compila, la riordina e la inizia', async ({ page }) => {
    const name = `PPL ${tag()}`;
    await openApp(page, '/schede');
    await page.getByRole('button', { name: 'Nuova' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Push \/ Pull \/ Legs/ }).click();
    await page.getByLabel('Nome della scheda').fill(name);
    await page.getByLabel('Nome della scheda').press('Enter');
    await expect(page.locator('.list-row-drag .ex-name')).toHaveText(['Push', 'Pull', 'Legs']);

    await page.locator('.row-main', { hasText: 'Push' }).click();
    await addExercise(page, 'Panca piana');
    await page.getByRole('button', { name: 'Aumenta Serie' }).click();
    await box(page, 'Carico previsto').fill('80');
    await box(page, 'Carico previsto').press('Enter');
    await page.getByRole('button', { name: 'Aumenta Recupero' }).click();
    await page.getByRole('button', { name: 'Aumenta Recupero' }).click();
    await page.getByRole('button', { name: 'Fatto' }).click();
    await addExercise(page, 'Croci ai cavi');
    await page.getByRole('button', { name: 'Fatto' }).click();
    await addExercise(page, 'Plank');
    await expect(box(page, 'Durata minima')).toHaveValue('30');
    await page.getByRole('button', { name: 'Fatto' }).click();

    await expect(page.locator('.summary')).toHaveText(['4 × 8–12 · 80 kg · rec. 2:00', '3 × 8–12 · rec. 1:30', '3 × 30–60 s · rec. 1:00']);

    // Superset tra panca e croci.
    await page.locator('.row-main', { hasText: 'Panca piana' }).click();
    await page.getByRole('dialog').locator('.switch').click();
    await page.getByRole('button', { name: 'Fatto' }).click();
    await expect(page.locator('.ss-link')).toHaveCount(1);

    // Giorno della settimana.
    await page.getByRole('group', { name: 'Giorno della settimana previsto' }).getByRole('button', { name: 'Lun' }).click();

    // Riordino trascinando il plank in cima.
    const grips = page.locator('.grip');
    const from = (await grips.nth(2).boundingBox())!;
    const to = (await grips.nth(0).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 30, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('.list-row-drag .ex-name')).toHaveText(['Plank', 'Panca piana', 'Croci ai cavi']);

    await page.getByRole('button', { name: 'Indietro' }).click();
    await expect(page.locator('.list-row-drag', { hasText: 'Push' })).toContainText('3 esercizi · Lun');

    // Avvio del ciclo, poi inizio retrodatato per vedere l'avviso di fine ciclo.
    await page.getByRole('button', { name: 'Inizia questa scheda' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Inizia' }).click();
    await expect(page.locator('.cycle')).toContainText('Settimana 1 di 8');
    await page.locator('input[type=date]').fill(day(-52));
    await expect(page.locator('.cycle')).toContainText('Settimana 8 di 8');
    await expect(page.locator('.cycle .alert')).toHaveText(/Ultima settimana del ciclo/);

    await page.locator('a.tab', { hasText: 'Oggi' }).click();
    await expect(page.locator('.card', { hasText: name }).locator('.alert')).toBeVisible();

    await expect.poll(async () => {
      const r = (await serverRows(page.request, 'routines')).find((x) => x.name === name);
      return r && { status: r.status, start_date: r.start_date };
    }).toEqual({ status: 'attiva', start_date: day(-52) });
    const routine = (await serverRows(page.request, 'routines')).find((x) => x.name === name)!;
    await expect.poll(async () => (await serverRows(page.request, 'routine_exercises')).filter((i) => i.routine_id === routine.id)
      .sort((a, b) => a.position - b.position).map((i) => [i.exercise_id, i.superset_next]))
      .toEqual([['base-plank', false], ['base-panca-piana', true], ['base-croci-ai-cavi', false]]);
  });

  test('duplicare e iniziare la copia archivia l’originale', async ({ page }) => {
    const name = `Copia ${tag()}`;
    await openApp(page, '/schede');
    await page.getByRole('button', { name: 'Nuova' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Upper \/ Lower/ }).click();
    await page.getByLabel('Nome della scheda').fill(name);
    await page.getByLabel('Nome della scheda').press('Enter');
    await page.getByRole('button', { name: 'Inizia questa scheda' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Inizia' }).click();

    await page.getByRole('button', { name: 'Duplica' }).click();
    await expect(page.getByLabel('Nome della scheda')).toHaveValue(`${name} (copia)`);
    await expect(page.locator('.list-row-drag')).toHaveCount(4);
    await page.getByRole('button', { name: 'Inizia questa scheda' }).click();
    await expect(page.getByRole('dialog')).toContainText(`La scheda attiva «${name}» finisce in archivio.`);
    await page.getByRole('dialog').getByRole('button', { name: 'Inizia' }).click();

    // Elimina un giorno dalla copia.
    await page.locator('.row-main', { hasText: 'Lower B' }).click();
    await page.getByRole('button', { name: 'Elimina giorno' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page.locator('.list-row-drag')).toHaveCount(3);

    await page.locator('a.tab', { hasText: 'Schede' }).click();
    await expect(page.locator('.card-active .routine-name')).toHaveText(`${name} (copia)`);
    await expect(page.locator('h2.section', { hasText: 'Archivio' })).toBeVisible();
    await expect(page.locator('.list-row', { hasText: name }).filter({ hasNotText: /\(copia\)/ })).toBeVisible();

    // Elimina l'originale dall'archivio.
    await page.locator('.list-row', { hasText: name }).filter({ hasNotText: /\(copia\)/ }).click();
    await page.getByRole('button', { name: 'Elimina' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page).toHaveURL(/\/schede$/);
    await expect.poll(async () => (await serverRows(page.request, 'routines')).filter((r) => r.name === name).length).toBe(0);
  });
});
