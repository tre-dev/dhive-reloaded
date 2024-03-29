import { Client } from '..';
import { HiveEngineClient } from '../engine/client';
import { TEST_CLIENT } from './common';
import { timeout } from '../utils/utils';

describe('TEST_CLIENT', function () {
    // this.slow(200);
    jest.setTimeout(30 * 1000);

    // const TEST_CLIENT = Client.testnet();

    // TODO: change api.hive.blog to testnet
    it('should handle failover', async () => {
        const bclient = new Client({ nodes: ['wrong.api.hive.com'], timeout: 1000, nodeErrorLimit: 1 });
        await bclient.loadNodes();

        const result = await bclient.call('condenser_api', 'get_accounts', [['initminer']]);
        expect(result.length).toEqual(1);
        expect(result[0].name).toEqual('initminer');
        expect(bclient.fetch.hive.nodes.length).toBeGreaterThan(2);
        await timeout(2000);
    });

    it('should handle hive-engine failover', async () => {
        const bclient = new Client({
            engine: { nodes: [`https://woopswrong${HiveEngineClient.defaultNodes[0]}`].concat([...HiveEngineClient.defaultNodes]) },
            timeout: 1000,
            nodeErrorLimit: 1,
        });

        const result = await bclient.engine.blockchain.getLatestBlock();
        expect(result?._id).not.toBe(null);
        expect(bclient.fetch.engine.nodes.length).toBeGreaterThan(2);
        await timeout(2000);
    });

    it('should make rpc call', async function () {
        const result = await TEST_CLIENT.database.getAccount('initminer');
        expect(result?.name).toEqual('initminer');
    });

    it('should handle rpc errors', async function () {
        try {
            await TEST_CLIENT.call('condenser_api', 'i_like_turtles');
            expect(false).toBeTruthy();
        } catch (error: any) {
            expect(error.name).toEqual('RPCError');
            expect(
                error.message === `itr != _by_name.end(): no method with name 'i_like_turtles'` ||
                    error.message === `method_itr != api_itr->second.end(): Could not find method i_like_turtles`,
            ).toBeTruthy();

            // const info = VError.info(error);
            // expect(info.code).toEqual(10);
            // expect(info.name).toEqual('assert_exception');
        }
    });

    it('should correctly queue customJson broadcasts', () => {
        const nothing = TEST_CLIENT.transactionQueue.peekTransactionAccount();
        expect(!nothing).toBeTruthy();
        // Do not await, since we are not processing transactions right now.
        TEST_CLIENT.broadcast.customJsonQueue({ id: 'some_random_json1', json: { id: 12 }, account: 'someaccount', role: 'posting' }, 'some-private-key');
        TEST_CLIENT.broadcast.customJsonQueue({ id: 'some_random_json2', json: { id: 22 }, account: 'otheraccount', role: 'posting' }, 'some-private-key');
        const account = TEST_CLIENT.transactionQueue.peekTransactionAccount();
        expect(account).toBe('someaccount');
    });

    // requires testnet
    // it('should format rpc errors', async function () {
    //     const tx = { operations: [['witness_update', {}]] };
    //     try {
    //         await TEST_CLIENT.call('condenser_api', 'broadcast_transaction', [tx]);
    //         expect(false).toBeTruthy();
    //     } catch (error: any) {
    //         expect(error.name).toEqual('RPCError');
    //         expect(error.message).toEqual('is_valid_account_name( name ): Account name ${n} is invalid n=');
    //         const info = VError.info(error);
    //         expect(info.code).toEqual(10);
    //         expect(info.name).toEqual('assert_exception');
    //     }
    // });

    // bs, needs rework
    // it("should retry and timeout", async function() {
    //   this.slow(2500);
    //   aclient.timeout = 1000;
    //   aclient.address = "https://jnordberg.github.io/dhive/FAIL";
    //   const backoff = aclient.backoff;
    //   let seenBackoff = false;
    //   aclient.backoff = tries => {
    //     seenBackoff = true;
    //     return backoff(tries);
    //   };
    //   const tx = { operations: [["witness_update", {}]] };
    //   try {
    //     await TEST_CLIENT.database.getChainProperties();
    //     assert(false, "should not be reached");
    //   } catch (error) {
    //     assert(seenBackoff, "should have seen backoff");
    //   }
    // });
});
