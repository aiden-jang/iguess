import { test, expect } from './fixtures';

test('returning players choose explicitly between a fresh room and rejoining', async ({page}) => {
  await page.addInitScript(() => { localStorage.setItem('iguess_name','Returning artist'); localStorage.setItem('iguess_room','last-art-show'); });
  await page.goto('/');
  await page.getByText('Room code & more ways to play',{exact:true}).click();
  await expect(page.getByRole('textbox',{name:/^Room code/})).not.toHaveValue('last-art-show');
  await page.getByRole('button',{name:'Rejoin last-art-show ↗',exact:true}).click();
  await expect(page.getByRole('form')).toContainText('last-art-show');
  await expect(page.getByRole('button',{name:'Join the room',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start a new room instead ↗',exact:true}).click();
  await expect(page.getByRole('button',{name:'Enter room',exact:true})).toBeVisible();
});
test('phone entry exposes the name before the example and offers an AI fallback', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByRole('textbox',{name:'Your name',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'Play AI Drawer instead ↗',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play AI Drawer instead ↗',exact:true}).click();
  await expect(page.getByRole('button',{name:/AI Drawer It draws/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('form')).toContainText('Curated doodles');
});
