import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:4174,strictPort:true}});
await server.listen();
const browser=await chromium.launch({channel:'chrome'});
try {
  await fs.mkdir('docs/previews',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1080}});
  await page.goto('http://127.0.0.1:4174');
  await page.getByRole('button',{name:'开始今日学习',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'docs/previews/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'docs/previews/mobile.png'});
  await page.getByRole('button',{name:'词库目录',exact:true}).click();
  await page.getByRole('button',{name:'公共制度与法律',exact:true}).click();
  await page.getByRole('combobox',{name:'学习场景'}).selectOption('institutions-court');
  await page.getByRole('combobox',{name:'概念分块'}).selectOption('institutions-evidence');
  await page.screenshot({path:'docs/previews/semantic-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1080});
  await page.screenshot({path:'docs/previews/semantic-desktop.png',fullPage:true});
  console.log('Captured desktop, mobile, and three-level directory previews.');
} finally { await browser.close(); await server.close(); }
