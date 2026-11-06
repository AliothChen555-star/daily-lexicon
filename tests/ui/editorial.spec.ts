import { test,expect } from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4176'});

test('校审工作台区分待制词，逐项核对后保存到隔离数据库',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'词库校审',exact:true})).toBeVisible();
  await page.getByText('词表范围与来源依据',{exact:true}).click();
  await expect(page.locator('#scope-summary')).toContainText('129页');
  await page.getByLabel('搜索单词或释义').fill('smartphone');
  await page.getByRole('button',{name:/^smartphone /}).click();
  await expect(page.locator('.scope-reference a').first()).toHaveAttribute('href',/cet\.neea\.edu\.cn\/res\/Home\/1704\/.*#page=\d+/);
  await page.getByLabel('词目范围').selectOption('reference');
  await page.getByLabel('搜索单词或释义').fill('fauxreferenceword');
  await expect(page.locator('.entry')).toHaveCount(1);
  await page.getByLabel('词目范围').selectOption('target');
  await expect(page.locator('.entry')).toHaveCount(0);
  await page.getByLabel('搜索单词或释义').fill('abandon');
  await page.getByRole('button',{name:'abandon 四级 / 待制作'}).click();
  await expect(page.getByText('这个候选词尚待制作词卡。',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'六项通过，保存校审'})).toHaveCount(0);
  await page.getByLabel('搜索单词或释义').fill('see');
  await page.getByRole('button',{name:'see 基础 / 待校审'}).click();
  const approve=page.getByRole('button',{name:'六项通过，保存校审'});
  await expect(approve).toBeDisabled();
  await page.getByLabel('校审署名').fill('isolated-ui-test');
  await page.getByLabel('核对依据或修改意见').fill('隔离界面自动测试记录，不是对真实词卡的人工审核。');
  for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
  await expect(approve).toBeEnabled();await approve.click();
  await expect(page.getByRole('status')).toContainText('校审记录已保存。');
  await page.reload();await page.getByLabel('搜索单词或释义').fill('see');
  await page.getByRole('button',{name:'see 基础 / 已通过'}).click();
  await expect(page.getByText('隔离界面自动测试记录，不是对真实词卡的人工审核。',{exact:true})).toBeVisible();
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
