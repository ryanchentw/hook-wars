import { expect, test } from '@playwright/test';
import { close, createRoom, joinByLink, player, SHOT_DIR } from './helpers';

test('the online lobby as the host sees it and as a guest sees it', async ({ browser }) => {
  const [host, guest] = [await player(browser), await player(browser)];
  const code = await createRoom(host, 'Ada');
  await joinByLink(guest, code, 'Bo');
  await expect(host.locator('.team-east .slot-human')).toContainText('Bo');
  await expect(guest.locator('.team-west .slot-human')).toContainText('host');
  await Promise.all([host.screenshot({ path: `${SHOT_DIR}/tidy-lobby-online-host.png` }), guest.screenshot({ path: `${SHOT_DIR}/tidy-lobby-online-guest.png` })]);
  await close(host, guest);
});
