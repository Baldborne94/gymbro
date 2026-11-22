import { expect, test } from '@playwright/test';
import { box, activeRoutine, customExercise, openApp, seed, serverRows, tag, workoutRows } from './helpers';

/** Esercizio nuovo con sei settimane di storico: l'ultima volta tutte le serie a 12. */
async function history(request: import('@playwright/test').APIRequestContext) {
  const t = tag();
  const ex = customExercise(`Panca E2E ${t}`);
  const dayName = `Forza ${t}`;
  await seed(request, { exercises: [ex] });
  const { routineId, dayIds } = await activeRoutine(request, `Scheda ${t}`, [
    { name: dayName, items: [{ exercise_id: ex.id, sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }] },
  ]);
  const plan: [number, [number, number][]][] = [
    [37, [[70, 10], [70, 9], [70, 8]]],
    [30, [[72.5, 10], [72.5, 9], [72.5, 9]]],
    [23, [[75, 10], [75, 10], [75, 8]]],
    [16, [[77.5, 10], [77.5, 9], [77.5, 9]]],
    [9, [[80, 10], [80, 9], [80, 8]]],
    [2, [[80, 12], [80, 12], [80, 12]]],
  ];
  for (const [daysAgo, sets] of plan) {
    await seed(request, workoutRows({ name: dayName, daysAgo, routineId, dayId: dayIds[0], exercises: [[ex.id, sets]] }));
  }
  return { ex, dayName };
}

test.describe('andamento, record e progressione', () => {
  test('proposta di aumento del carico e celebrazione del nuovo record', async ({ page }) => {
    const { ex, dayName } = await history(page.request);
    await openApp(page, '/allena');
    await page.locator('.list-row', { hasText: dayName }).click();
    await expect(page.locator('.suggest')).toContainText('Pronto a salire: 82,5 kg');
    await expect(page.locator('.suggest')).toContainText('tutte le serie a 12 rip');
    await page.locator('.suggest').getByRole('button', { name: 'Applica' }).click();
    await expect(page.locator('.set-row .set-value')).toHaveText(['82,5 kg × 8', '82,5 kg × 8', '82,5 kg × 8']);
    await expect(page.locator('.suggest')).toHaveCount(0);

    await page.locator('.btn-confirm').click();
    const burst = page.locator('.record-burst');
    await expect(burst).toContainText('Nuovo record!');
    await expect(burst).toContainText('82,5 kg × 8');
    await expect(burst).toContainText('Carico massimo');
    await burst.click();
    await expect(page.locator('.set-row.done')).toContainText('Record');

    // La seconda serie uguale non è un nuovo record.
    await page.locator('.rest-bar').getByRole('button', { name: 'Salta' }).click();
    await page.locator('.btn-confirm').click();
    await expect(burst).toHaveCount(0);

    await page.locator('.session-actions').getByRole('button', { name: 'Fine' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Termina' }).click();
    await expect(page.locator('.record-box')).toContainText('Nuovo record');
    await expect(page.locator('.record-box')).toContainText(ex.name);
    await expect(page.locator('.record-box')).toContainText('carico massimo');
  });

  test('storico modificabile: cambiare una serie aggiorna il volume', async ({ page }) => {
    const { dayName } = await history(page.request);
    await openApp(page, '/andamento');
    const rows = page.locator('.list-row', { hasText: dayName });
    await expect(rows).toHaveCount(6);
    await rows.first().click();
    const volume = page.locator('.facts > div', { hasText: 'Volume' }).locator('dd');
    await expect(volume).toHaveText(/^2\.?880 kg$/);
    await page.locator('.set-row').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aumenta Ripetizioni' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fatto' }).click();
    await expect(volume).toHaveText(/^2\.?960 kg$/);
    await expect.poll(async () => (await serverRows(page.request, 'sets')).some((s) => s.load === 80 && s.reps === 13)).toBe(true);

    // Eliminare la sessione la toglie dallo storico.
    await page.getByRole('button', { name: 'Elimina sessione' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page.locator('.list-row', { hasText: dayName })).toHaveCount(5);
  });

  test('grafici e record di un esercizio', async ({ page }) => {
    const { ex } = await history(page.request);
    await openApp(page, '/andamento?v=progressi');
    await page.locator('.list-row', { hasText: ex.name }).last().click();
    const chart = page.locator('.chart svg');
    await expect(chart).toHaveAttribute('aria-label', 'Carico massimo: da 70 a 80 kg in 6 rilevazioni');
    await page.getByRole('button', { name: 'Volume' }).click();
    await expect(chart).toHaveAttribute('aria-label', /^Volume: da 1\.?890 a 2\.?880 kg/);
    await page.getByRole('button', { name: 'Massimale stimato' }).click();
    await expect(page.locator('.chart figcaption')).toContainText('112 kg');
    // Toccando il grafico si legge il valore di una sessione precedente.
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.12, box.y + box.height / 2);
    await expect(page.locator('.chart figcaption')).not.toContainText('ultimo');

    const records = page.locator('section', { hasText: 'Record personali' }).locator('.list-row');
    await expect(records.first()).toContainText('112 kg');
    await expect(records.first()).toContainText('Massimale stimato');
    await expect(records.filter({ hasText: 'Carico massimo' }).first()).toContainText('80 kg × 10');
  });

  test('calendario con obiettivo settimanale e bilanciamento muscolare', async ({ page }) => {
    await history(page.request);
    await openApp(page, '/andamento?v=calendario');
    await box(page, 'Obiettivo').fill('1');
    await box(page, 'Obiettivo').press('Enter');
    await expect.poll(async () => (await serverRows(page.request, 'settings')).find((s) => s.id === 'weekly_goal')?.value).toBe(1);
    // Una sessione due giorni fa: se è in questa settimana l'obiettivo è centrato.
    await expect(page.locator('.cal-day.trained').first()).toBeVisible();
    await expect(page.locator('.facts dd').nth(1)).toHaveClass(/hit/);

    await page.getByRole('tab', { name: 'Muscoli' }).click();
    await expect(page.locator('.bar-row').first()).toBeVisible();
    await page.getByRole('button', { name: 'Settimana precedente' }).click();
    await expect(page.locator('.cal-month')).toHaveText(/^Dal /);
    const petto = page.locator('.bar-row', { hasText: 'Petto' });
    await expect(petto).not.toHaveClass(/zero/);
  });
});
