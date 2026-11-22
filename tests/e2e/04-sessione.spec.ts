import { expect, test, type Page } from '@playwright/test';
import { box, activeRoutine, openApp, seed, serverRows, tag, workoutRows } from './helpers';

const exName = (page: Page) => page.locator('h1.session-ex');
const values = (page: Page) => page.locator('.set-row .set-value');
const confirm = (page: Page) => page.locator('.btn-confirm').click();

test.describe('sessione di allenamento', () => {
  test('sessione completa senza rete: timer, superset, tipi di serie, sostituzione, poi sincronizzazione', async ({ page, context }) => {
    const dayName = `Push ${tag()}`;
    await activeRoutine(page.request, `Scheda ${dayName}`, [{
      name: dayName,
      items: [
        { exercise_id: 'base-plank', sets: 2, reps_min: 30, reps_max: 60, rest_sec: 60 },
        { exercise_id: 'base-panca-piana', sets: 3, rest_sec: 120, superset_next: true },
        { exercise_id: 'base-croci-ai-cavi', sets: 2 },
        { exercise_id: 'base-military-press', sets: 2 },
      ],
    }]);
    await openApp(page);
    await page.locator('a.tab', { hasText: 'Allena' }).click();
    await page.locator('.list-row', { hasText: dayName }).click();
    await expect(page.locator('.set-card')).toBeVisible();

    // Da qui in poi niente rete, come in una palestra senza segnale.
    await context.setOffline(true);

    // Plank: esercizio a tempo e timer di recupero.
    await expect(exName(page)).toHaveText('Plank');
    await page.getByRole('button', { name: 'Aumenta Durata' }).click();
    await expect(values(page).first()).toHaveText('35 s');
    await confirm(page);
    await expect(page.locator('.rest-bar')).toContainText('Recupero');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Togli 15 secondi' }).click();
    await expect(page.locator('.rest-done')).toContainText('VIA!');
    await page.locator('.rest-done').getByRole('button', { name: 'OK' }).click();
    await confirm(page);
    await page.locator('.rest-bar').getByRole('button', { name: 'Salta' }).click();

    // Panca: passa da sola all'esercizio successivo; il carico segue sulle serie dopo.
    await expect(exName(page)).toHaveText('Panca piana');
    await box(page, 'Carico').fill('80');
    await box(page, 'Carico').press('Enter');
    await page.getByRole('button', { name: 'Aumenta Carico' }).click();
    await expect(values(page)).toHaveText(['82,5 kg × 8', '82,5 kg × 8', '82,5 kg × 8']);

    // Tipo di serie e sforzo percepito.
    await page.locator('.set-options .chip', { hasText: 'Normale' }).click();
    await expect(page.locator('.set-options .chip').first()).toHaveText('Riscaldamento');
    await expect(page.locator('.set-row.active .set-tag')).toHaveText('R');
    await page.locator('.set-options .chip', { hasText: 'Sforzo' }).click();
    await page.getByRole('dialog').locator('.pick', { hasText: '8,5' }).click();
    await expect(page.locator('.set-options')).toContainText('RPE 8,5');

    // Superset: dopo la panca si passa alle croci senza recupero, poi si torna alla panca.
    await confirm(page);
    await expect(exName(page)).toHaveText('Croci ai cavi');
    await expect(page.locator('.rest-bar')).toHaveCount(0);
    await box(page, 'Carico').fill('20');
    await box(page, 'Carico').press('Enter');
    await confirm(page);
    await expect(exName(page)).toHaveText('Panca piana');
    await expect(page.locator('.rest-bar')).toBeVisible();

    // Ricaricando senza rete la sessione e il timer restano.
    await page.reload();
    await expect(exName(page)).toHaveText('Panca piana');
    await expect(page.locator('.set-row.done')).toHaveCount(1);
    await expect(page.locator('.rest-bar')).toBeVisible();

    // Sostituzione rapida: l'attrezzo è occupato.
    await page.locator('.session-title').click();
    await page.getByRole('dialog').getByRole('button', { name: /Military press/ }).click();
    await expect(exName(page)).toHaveText('Military press');
    await page.getByRole('button', { name: 'Azioni sull\'esercizio' }).click();
    await page.getByRole('button', { name: /Sostituisci/ }).click();
    await expect(page.locator('.overlay .chip.on')).toHaveText('Spalle');
    await page.locator('.overlay .list-row', { hasText: 'Shoulder press' }).click();
    await expect(exName(page)).toHaveText('Shoulder press');
    await expect(page.locator('.tags')).toContainText('Al posto di Military press');
    await box(page, 'Carico').fill('40');
    await box(page, 'Carico').press('Enter');
    await confirm(page);

    // Esercizio aggiunto al volo e poi saltato; note della sessione.
    await page.locator('.session-actions').getByRole('button', { name: 'Esercizio' }).click();
    await page.locator('.overlay input[type=search]').fill('Push down ai cavi');
    await page.locator('.overlay .list-row', { hasText: 'Push down ai cavi' }).click();
    await expect(exName(page)).toHaveText('Push down ai cavi');
    await page.getByRole('button', { name: 'Azioni sull\'esercizio' }).click();
    await page.getByRole('button', { name: 'Salta esercizio' }).click();
    await page.locator('.session-actions').getByRole('button', { name: 'Note' }).click();
    await page.getByRole('dialog').getByLabel('Note della sessione').fill('Buona sessione');
    await page.getByRole('dialog').getByRole('button', { name: 'Fatto' }).click();

    // Fine: 2 plank + 1 panca + 1 croci + 1 shoulder press.
    await page.locator('.session-actions').getByRole('button', { name: 'Fine' }).click();
    await expect(page.getByRole('dialog')).toContainText('Hai completato 5 serie');
    await page.getByRole('dialog').getByRole('button', { name: 'Termina' }).click();
    await expect(page.locator('.summary-hero')).toContainText('Allenamento completato');
    const facts = page.locator('.facts > div');
    await expect(facts.filter({ hasText: 'Serie' }).locator('dd')).toHaveText('5');
    // Il riscaldamento non conta nel volume: 20×8 + 40×8.
    await expect(facts.filter({ hasText: 'Volume' }).locator('dd')).toHaveText('480 kg');

    // Torna la rete: tutto arriva al server, una volta sola.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const snapshot = async () => {
      const w = (await serverRows(page.request, 'workouts')).filter((x) => x.name === dayName);
      if (w.length !== 1 || !w[0].finished_at) return null;
      const sets = (await serverRows(page.request, 'sets')).filter((s) => s.workout_id === w[0].id);
      const wes = (await serverRows(page.request, 'workout_exercises')).filter((x) => x.workout_id === w[0].id);
      return {
        notes: w[0].notes,
        sets: sets.length,
        warmups: sets.filter((s) => s.kind === 'riscaldamento').length,
        rpe: sets.filter((s) => s.rpe === 8.5).length,
        substituted: wes.filter((x) => x.original_exercise_id === 'base-military-press').map((x) => x.exercise_id),
        skipped: wes.filter((x) => x.skipped).map((x) => x.exercise_id).sort(),
      };
    };
    const expected = {
      notes: 'Buona sessione', sets: 5, warmups: 1, rpe: 1,
      substituted: ['base-shoulder-press'], skipped: ['base-push-down-ai-cavi'],
    };
    await expect.poll(snapshot, { timeout: 20_000 }).toEqual(expected);
    await page.reload();
    await page.waitForTimeout(1500);
    expect(await snapshot()).toEqual(expected);
  });

  test('riparte dai valori dell’ultima volta; una sessione senza serie si scarta', async ({ page }) => {
    const dayName = `Gambe ${tag()}`;
    const { routineId, dayIds } = await activeRoutine(page.request, `Scheda ${dayName}`, [
      { name: dayName, items: [{ exercise_id: 'base-leg-extension', sets: 2, reps_min: 8, reps_max: 12 }] },
    ]);
    await seed(page.request, workoutRows({
      name: dayName, daysAgo: 3, routineId, dayId: dayIds[0], exercises: [['base-leg-extension', [[50, 12], [50, 11]]]],
    }));
    await openApp(page, '/allena');
    await page.locator('.list-row', { hasText: dayName }).click();
    await expect(values(page)).toHaveText(['50 kg × 12', '50 kg × 11']);
    await expect(page.locator('.last-time')).toHaveText('Ultima volta: 50 × 12 · 50 × 11');
    // Non tutte le serie a 12: nessuna proposta di aumento.
    await expect(page.locator('.suggest')).toHaveCount(0);

    await page.locator('.session-actions').getByRole('button', { name: 'Fine' }).click();
    await expect(page.getByRole('dialog', { name: 'Annullare la sessione?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Scarta sessione' }).click();
    await expect(page).toHaveURL(/\/allena$/);
    await expect.poll(async () => (await serverRows(page.request, 'workouts')).filter((w) => w.name === dayName).length).toBe(1);
  });

  test('sessione libera con un esercizio aggiunto', async ({ page }) => {
    await activeRoutine(page.request, `Vuota ${tag()}`, [{ name: 'Giorno', items: [] }]);
    await openApp(page, '/allena');
    await page.getByRole('button', { name: 'Sessione libera' }).click();
    await expect(page.getByText('Sessione vuota: aggiungi il primo esercizio.')).toBeVisible();
    await page.locator('.empty').getByRole('button', { name: 'Aggiungi esercizio' }).click();
    await page.locator('.overlay input[type=search]').fill('Trazioni alla sbarra');
    await page.locator('.overlay .list-row', { hasText: 'Trazioni alla sbarra' }).click();
    await expect(box(page, 'Zavorra o assistenza')).toBeVisible();
    await page.getByRole('button', { name: 'Diminuisci Zavorra o assistenza' }).click();
    await expect(values(page).first()).toHaveText(/rip −2,5 kg$/);
    await confirm(page);
    await page.locator('.session-actions').getByRole('button', { name: 'Fine' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Termina' }).click();
    await expect(page.locator('.summary-hero')).toContainText('Sessione libera');
    await page.getByRole('button', { name: 'Chiudi' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
