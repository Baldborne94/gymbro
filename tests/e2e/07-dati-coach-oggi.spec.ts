import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { activeRoutine, openApp, seed, serverRows, tag, uid } from './helpers';

test.describe('dati, backup, coach, dashboard e promemoria', () => {
  test('esportazione e reimportazione dopo un’eliminazione', async ({ page }) => {
    const note = `Misura da salvare ${tag()}`;
    const id = uid();
    await seed(page.request, { body_measurements: [{ id, date: '2026-01-10', weight: 79, notes: note }] });
    await openApp(page, '/dati');

    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Tutto in JSON' }).click();
    const file = await (await jsonDownload).path();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(data.app).toBe('gymbro');
    expect(data.tables.body_measurements.some((m: { notes: string }) => m.notes === note)).toBe(true);

    const csvDownload = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Sessioni in CSV' }).click();
    const csv = fs.readFileSync(await (await csvDownload).path(), 'utf8');
    expect(csv.split('\r\n')[0]).toBe('﻿data;sessione;esercizio;gruppo_muscolare;serie;tipo;carico;unita;ripetizioni;secondi;rpe;rir');

    // Elimino la misurazione da un altro dispositivo, poi la recupero dal file.
    await seed(page.request, { body_measurements: [{ ...data.tables.body_measurements.find((m: { id: string }) => m.id === id), updated_at: Date.now(), deleted: true }] });
    expect((await serverRows(page.request, 'body_measurements')).some((m) => m.id === id)).toBe(false);
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('dialog', { name: 'Importare questo file?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
    await expect(page.getByRole('status')).toContainText('Importazione completata');
    expect((await serverRows(page.request, 'body_measurements')).some((m) => m.id === id)).toBe(true);
  });

  test('backup su richiesta', async ({ page }) => {
    await openApp(page, '/dati');
    await expect(page.getByText('Ogni giorno alle 23:59, conservando le ultime 3 copie')).toBeVisible();
    const rows = page.locator('.table tbody tr');
    const before = await rows.count();
    await page.getByRole('button', { name: 'Esegui ora' }).click();
    await expect(page.getByRole('status')).toContainText('Backup creato');
    await expect(rows).toHaveCount(Math.min(before + 1, 3));
  });

  test('coach AI: progressione e nuova scheda salvata come bozza', async ({ page }) => {
    await openApp(page, '/altro');
    await page.getByRole('link', { name: /Coach AI/ }).click();
    await page.getByRole('button', { name: /Progressione dei carichi/ }).click();
    await expect(page.locator('.coach-text h2')).toHaveText('Prossima sessione');
    await expect(page.locator('.coach-text')).toContainText('82,5 kg × 8');

    await page.getByRole('group', { name: 'Obiettivo' }).getByRole('button', { name: 'Forza' }).click();
    await page.getByRole('button', { name: 'Genera scheda' }).click();
    const card = page.locator('.card', { hasText: 'Forza 3 giorni' });
    await expect(card).toContainText('6 settimane · 1 giorni');
    await expect(card.locator('.coach-ex')).toHaveCount(2);
    await expect(card).toContainText('Panca piana');
    await expect(card).toContainText('4 × 5–8 · 80 kg · rec. 2:30');
    await card.getByRole('button', { name: 'Salva come bozza' }).click();

    await expect(page).toHaveURL(/\/schede\/.+/);
    await expect(page.getByLabel('Nome della scheda')).toHaveValue('Forza 3 giorni');
    await expect(page.locator('.badge').first()).toHaveText('Bozza');
    await expect(page.locator('.list-row-drag')).toContainText('2 esercizi');
  });

  test('dashboard: prossimo allenamento e avvio con un tocco', async ({ page }) => {
    const dayName = `Oggi ${tag()}`;
    await activeRoutine(page.request, `Scheda ${dayName}`, [{ name: dayName, items: [{ exercise_id: 'base-squat', sets: 2 }] }]);
    await openApp(page, '/');
    const next = page.locator('.card', { hasText: 'Prossimo allenamento' });
    await expect(next).toContainText(dayName);
    await expect(page.locator('.week-dots .week-dot')).toHaveCount(7);
    await next.getByRole('button', { name: 'Inizia' }).click();
    await expect(page.locator('h1.session-ex')).toHaveText('Squat');
    await page.getByRole('button', { name: 'Esci dalla sessione (resta in corso)' }).click();
    await page.locator('a.tab', { hasText: 'Oggi' }).click();
    await expect(page.locator('.card', { hasText: 'Sessione in corso' })).toContainText(dayName);
  });

  test('promemoria: attivazione, orario e stato del dispositivo', async ({ page }) => {
    await openApp(page, '/promemoria');
    await page.locator('.switch').click();
    await page.locator('input[type=time]').fill('07:30');
    await expect.poll(async () => {
      const s = await serverRows(page.request, 'settings');
      return [s.find((x) => x.id === 'reminders_enabled')?.value, s.find((x) => x.id === 'reminder_time')?.value];
    }).toEqual([true, '07:30']);
    await expect(page.getByText('Questo dispositivo non riceve le notifiche')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attiva su questo dispositivo' })).toBeEnabled();
  });
});
