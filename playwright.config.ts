import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/ui', timeout:30000, fullyParallel:false, workers:1,
  use:{ baseURL:'http://127.0.0.1:4173', channel:'chrome', viewport:{width:1440,height:1080}, screenshot:'only-on-failure', trace:'retain-on-failure' },
  reporter:[['list'],['html',{open:'never'}]],
  webServer:[
    {command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:true},
    {command:'npm run editorial:test',url:'http://127.0.0.1:4176',reuseExistingServer:false},
  ],
});
