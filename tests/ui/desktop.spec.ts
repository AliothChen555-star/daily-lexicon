import { test,expect,_electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('Windows 程序不依赖联网，发音正常，关闭重开保留进度',async ({},testInfo) => {
  test.setTimeout(120000);
  const project=path.resolve('.'),profile=testInfo.outputPath('desktop-profile'); await mkdir(profile,{recursive:true});
  const launch=()=>electron.launch({
    ...(process.env.DAILY_LEXICON_PACKAGED_EXE ? {executablePath:process.env.DAILY_LEXICON_PACKAGED_EXE,args:[]} : {args:[project]}),
    env:{...process.env,DAILY_LEXICON_TEST_PROFILE:profile},
  });
  let app=await launch();
  try {
    let page=await app.firstWindow(); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:\/\//,route=>route.abort());
    await expect(page.getByRole('heading',{name:'今日三十词。'})).toBeVisible();
    await page.getByRole('button',{name:'开始今日学习',exact:true}).click();
    const duration=await page.evaluate(async () => {
      const audio=new Audio(new URL('./audio/see.wav',document.baseURI).href);
      await audio.play(); await new Promise<void>((resolve,reject)=>{audio.onended=()=>resolve();audio.onerror=()=>reject(new Error('local audio failed'));}); return audio.duration;
    });
    expect(duration).toBeGreaterThan(0.3);
    await page.getByRole('button',{name:'翻看释义'}).click(); await page.locator('.rating.grade-3').click();
    await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
    await app.close(); app=await launch(); page=await app.firstWindow();
    await page.route(/^https?:\/\//,route=>route.abort());
    await page.getByRole('button',{name:'继续今日学习'}).click();
    await expect(page.getByRole('heading',{name:'look',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
