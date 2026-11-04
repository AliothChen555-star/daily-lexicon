import { test,expect } from '@playwright/test';
import legacyState from '../fixtures/v0.1-state.json' with {type:'json'};

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

test('三级语义筛选能逐层定位，切换主题清除下级选择',async ({page})=>{
  await page.goto('/#library');
  await page.getByRole('button',{name:'科学与证据',exact:true}).click();
  await page.getByRole('combobox',{name:'学习场景'}).selectOption('science-evidence');
  await page.getByRole('combobox',{name:'概念分块'}).selectOption('science-verifying');
  await expect(page.locator('.dictionary-row')).toHaveCount(5);
  await page.locator('.dictionary-word').first().click();
  await expect(page.getByLabel('单词的语义位置')).toContainText('科学与证据');
  await expect(page.getByLabel('单词的语义位置')).toContainText('验证与重现');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'指代与连接',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'学习场景'})).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'概念分块'})).toBeDisabled();
  await expect(page.locator('.dictionary-row')).toHaveCount(30);
});

test('旧版本地档案启动升级后保留12词进度和笔记，刷新不重复配额',async ({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-04T04:00:00Z'));
  await page.goto('/');await expect(page.getByRole('button',{name:'开始今日学习',exact:true})).toBeVisible();
  await page.evaluate(async value=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('daily-lexicon-v1');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put({key:'main',value});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    });
  },legacyState);
  await page.reload();
  await expect(page.getByLabel('词包升级说明',{exact:true})).toContainText('增补 180 词');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','12');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax','30');
  await expect(page.getByText('本轮 12 / 300 词',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'继续今日学习'}).click();
  await expect(page.getByRole('heading',{name:'prospect',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回今日版'}).click();await page.reload();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','12');
  await page.getByRole('button',{name:'词库目录',exact:true}).click();
  await page.getByRole('combobox',{name:'学习状态'}).selectOption('saved');
  await expect(page.locator('.dictionary-row')).toHaveCount(2);
  await page.getByRole('textbox',{name:'搜索单词或中文释义'}).fill('see');await page.locator('.dictionary-word').click();
  await expect(page.getByRole('textbox',{name:'我的笔记'})).toHaveValue(legacyState.notes['dl-see']);
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
