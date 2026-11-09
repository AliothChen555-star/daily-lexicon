import content from '../../src/data/content.json' with {type:'json'};
import { test,expect,_electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('实际Windows旧程序写入后，新程序在同一档案续学并保留收藏笔记',async ({},testInfo)=>{
  test.skip(!process.env.DAILY_LEXICON_OLD_EXE,'需要本地旧安装包作为真实升级对象');
  test.setTimeout(120000);
  const profile=testInfo.outputPath('native-upgrade-profile');await mkdir(profile,{recursive:true});
  const env={...process.env,DAILY_LEXICON_TEST_PROFILE:profile};
  let app=await electron.launch({executablePath:process.env.DAILY_LEXICON_OLD_EXE!,args:[],env});
  try {
    let page=await app.firstWindow();
    const oldCount=Number((await page.locator('.issue-block').innerText()).match(/(\d+)\s*词/)?.[1]);
    expect(oldCount).toBeGreaterThan(0);
    await page.getByRole('button',{name:'开始今日学习',exact:true}).click();
    await page.getByRole('button',{name:'收藏当前单词'}).click();
    await page.getByRole('button',{name:'翻看释义'}).click();await page.locator('.rating.grade-3').click();
    await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'词库目录',exact:true}).click();
    await page.getByRole('textbox',{name:'搜索单词或中文释义'}).fill('see');await page.locator('.dictionary-word').click();
    await page.getByRole('textbox',{name:'我的笔记'}).fill('实际旧版程序保存的升级测试笔记');
    await page.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(page.getByRole('status')).toContainText('笔记已保存');
    await app.close();
    app=await electron.launch({...process.env.DAILY_LEXICON_PACKAGED_EXE?{executablePath:process.env.DAILY_LEXICON_PACKAGED_EXE,args:[]}:{args:[path.resolve('.')]},env});
    page=await app.firstWindow();
    if(oldCount===content.words.length) await expect(page.getByLabel('词包升级说明',{exact:true})).toHaveCount(0);
    else await expect(page.getByLabel('词包升级说明',{exact:true})).toContainText(`增补 ${content.words.length-oldCount} 词`);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax','30');
    await expect(page.getByText(`本轮 1 / ${content.words.length} 词`,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'继续今日学习'}).click();await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'词库目录',exact:true}).click();await page.getByRole('combobox',{name:'学习状态'}).selectOption('saved');
    await expect(page.locator('.dictionary-row')).toHaveCount(1);await page.locator('.dictionary-word').click();
    await expect(page.getByRole('textbox',{name:'我的笔记'})).toHaveValue('实际旧版程序保存的升级测试笔记');
  } finally { await app.close(); }
});
