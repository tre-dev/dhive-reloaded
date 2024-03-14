# dhive-reloaded

Fork of dhive-sl. `dhive-sl` is a merge between [dhive](https://gitlab.syncad.com/hive/dhive), [hive-interface](https://github.com/steem-monsters/hive-interface) and [sscjs](https://github.com/harpagon210/sscjs). dhive which was originally created by [Johan Nordberg](https://github.com/jnordberg) in 2017 and maintained since 2021 by the Hive community.

---

## Installation

### Via npm

For node.js or the browser with [browserify](https://github.com/substack/node-browserify) or [webpack](https://github.com/webpack/webpack).

```
npm install dhive-reloaded
```

## Usage

```Typescript
// Based on src/examples/beacon.example.ts
// npm run example:beacon

import { Client, utils } from 'dhive-reloaded';

const main = async () => {
    /**
     * Client 0 with no config
     * Beacon service is used to load the best RPC nodes
     * Nodes are refreshed every 300 seconds (5 Minutes) after loadNodes()
     */
    const client0 = new Client();
    await client0.loadNodes();
    console.log(`0 - No config client: ${(await client0.database.getAccount('blocktrades'))?.name}`);
    await timeout(3 * 1000);

    /**
     * Client A with pre-defined nodes
     * Beacon service is NOT used
     */
    const clientA = new Client({ nodes: ['wrong.hive-api.com', 'api.hive.blog', 'api.deathwing.me'] });
    console.log(`A - Client: ${(await clientA.database.getAccount('blocktrades'))?.name}`);
    await timeout(3 * 1000);

    /**
     * Client B with pre-defined nodes
     * Beacon service is used to load the best RPC nodes
     * Nodes are refreshed every 2 seconds after loadNodes()
     */
    const clientB = new Client({ nodes: ['api.hive.blog', 'api.deathwing.me'], beacon: { intervalTime: 2 } });
    await clientB.loadNodes();
    console.log(`B - Client: ${(await clientB.database.getAccount('blocktrades'))?.name}`);
    await timeout(5 * 1000);
    clientB.destroy(); // Clears intervals

    /**
     * Client C with pre-defined nodes
     * Beacon service is used to load the best RPC nodes
     * Nodes are NOT refreshed due to 'manual' mode
     */
    const clientC = new Client({ nodes: ['api.hive.blog', 'api.deathwing.me'], beacon: { mode: 'manual' } });
    await clientC.loadNodes();
    console.log(`C - Client: ${(await clientC.database.getAccount('blocktrades'))?.name}`);
    await timeout(5 * 1000);

    /**
     * Client D with pre-defined nodes
     * Beacon service is used ON NEW CLIENT (due to loadOnInitialize) to load the best RPC nodes
     * Nodes are refreshed every 2 seconds after new Client()
     */
    const clientD = new Client({ nodes: ['api.hive.blog', 'api.deathwing.me'], beacon: { intervalTime: 2, loadOnInitialize: true } });
    console.log(`D - Client: ${(await clientD.database.getAccount('blocktrades'))?.name}`);
    await timeout(5 * 1000);
    clientD.destroy(); // Clears intervals

    /**
     * Client E with NO pre-defined nodes
     * Beacon service is used ON NEW CLIENT (due to loadOnInitialize) to load the best RPC nodes
     * Nodes are refreshed every 2 seconds after new Client()
     */
    const clientE = new Client({ beacon: { intervalTime: 2, loadOnInitialize: true } });
    console.log(`E - Client: ${(await clientE.database.getAccount('blocktrades'))?.name}`);
    await timeout(5 * 1000);
    clientE.destroy(); // Clears intervals

    console.log('FINISHED');
};

main();

```
