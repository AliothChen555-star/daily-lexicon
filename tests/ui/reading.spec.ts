import { test,expect } from '@playwright/test';

test('翻卡、评分、刷新后续学与撤销',async ({page}) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.getByRole('button',{name:'开始今日学习',exact:true}).click();
  await expect(page.getByRole('heading',{name:'see',exact:true})).toBeVisible();
  await expect(page.getByText('看见；理解',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'翻看释义'}).click();
  await expect(page.getByText('看见；理解',{exact:true})).toBeVisible();
  await page.locator('.rating.grade-3').click();
  await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回今日版'}).click();
  await expect(page.getByRole('progressbar',{name:'今日课程进度'})).toHaveAttribute('aria-valuenow','1');
  await page.reload(); await page.getByRole('button',{name:'继续今日学习'}).click();
  await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'撤销评分'}).click();
  await expect(page.getByRole('heading',{name:'see',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回今日版'}).click();
  await expect(page.getByRole('progressbar',{name:'今日课程进度'})).toHaveAttribute('aria-valuenow','0');
  expect(errors).toEqual([]);
});

test('词库搜索、收藏、笔记和备份往返',async ({page},testInfo) => {
  await page.goto('/#library'); await page.getByRole('textbox',{name:'搜索单词或中文释义'}).fill('perspective');
  await expect(page.locator('.dictionary-row')).toHaveCount(1);
  await page.getByRole('button',{name:'收藏 perspective',exact:true}).click();
  await expect(page.getByRole('button',{name:'收藏 perspective',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.dictionary-word').click();
  await page.getByRole('textbox',{name:'我的笔记'}).fill('从她的角度看问题。');
  await page.getByRole('button',{name:'保存笔记',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('笔记已保存');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.reload(); await page.getByRole('textbox',{name:'搜索单词或中文释义'}).fill('perspective');
  await page.locator('.dictionary-word').click(); await expect(page.getByRole('textbox',{name:'我的笔记'})).toHaveValue('从她的角度看问题。');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'学习档案',exact:true}).click();
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'导出学习备份'}).click();
  const download=await downloadPromise,path=testInfo.outputPath('backup.json'); await download.saveAs(path);
  for(let i=0;i<2;i++) {
    await page.locator('input[type=file]').setInputFiles(path);
    await expect(page.getByRole('dialog')).toContainText('1 个收藏词');
    await page.getByRole('button',{name:'确认导入',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'词库目录',exact:true}).click();
  await page.getByRole('combobox',{name:'学习状态'}).selectOption('saved');
  await expect(page.locator('.dictionary-row')).toHaveCount(1);
  await expect(page.locator('.dictionary-word')).toContainText('perspective');
});

test('五词目标可以完成，换轮保留学习记录',async ({page}) => {
  await page.goto('/#settings'); await page.getByRole('combobox',{name:'每日课程词数'}).selectOption('5');
  await page.getByRole('button',{name:'今日版',exact:true}).click(); await page.getByRole('button',{name:'开始今日学习',exact:true}).click();
  for(let i=0;i<5;i++) { await page.getByRole('button',{name:'翻看释义'}).click(); await page.locator('.rating.grade-4').click(); }
  await expect(page.getByRole('heading',{name:'这一页，读完了。'})).toBeVisible();
  await page.getByRole('button',{name:'返回今日版'}).first().click();
  await expect(page.getByRole('button',{name:'今日课程已完成'})).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','5');
  await page.getByRole('button',{name:'学习设置'}).click();
  await page.locator('.order-options>button').nth(1).click(); await page.getByRole('button',{name:'开始新一轮',exact:true}).click();
  await expect(page.getByText('第 2 轮 / 词根与词族')).toBeVisible();
  await page.getByRole('button',{name:'学习档案',exact:true}).click();
  await expect(page.locator('.archive-stats>div').first()).toContainText('5');
  await expect(page.locator('.round-row')).toHaveCount(2);
});

test('手机与平板无横向溢出，评分按钮在手机可见',async ({page}) => {
  await page.goto('/');
  for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});
    for(const nav of ['今日版','词库目录','词根索引','学习档案','学习设置']) {
      await page.getByRole('button',{name:nav,exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844}); await page.getByRole('button',{name:'今日版',exact:true}).click();
  await page.getByRole('button',{name:'开始今日学习',exact:true}).click(); await page.getByRole('button',{name:'翻看释义'}).click();
  await expect(page.locator('.rating-buttons')).toBeInViewport();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
