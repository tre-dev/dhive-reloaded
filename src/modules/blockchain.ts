import { ClientFetch } from '../clientFetch';
import { DatabaseAPI } from './database';
import { LogLevel, log, timeout } from '../utils/utils';
import { SignedBlock } from '../chain/block';

export type BlockchainMode = 'irreversible' | 'latest';

export interface BlockchainStreamOptions {
    /**
     * Start block number, inclusive. If omitted generation will start from current block height.
     */
    from?: number;
    /**
     * End block number, inclusive. If omitted stream will continue indefinitely.
     */
    to?: number;
    /**
     * Streaming mode, if set to `Latest` may include blocks that are not applied to the final chain.
     * Defaults to `Irreversible`.
     */
    mode?: BlockchainMode;
}

export interface SLBlockchainStreamOptions {
    mode: BlockchainMode;
    blocksBehindHead: number;
    fs?: any;
    saveState: (state: { lastBlock: number; lastVopBlock: number }) => any;
    loadState: () => any;
    stateFile: string; // 'state.json';
    onBlock: any;
    onOp: any;
    onVirtualOp: any;
    onBehindBlocks: any;
    replayBatchSize: any;
}

export type SLBlockchainStreamParameters = Partial<SLBlockchainStreamOptions>;

export class Blockchain {
    private streamOptions: SLBlockchainStreamOptions;
    private lastBlock: number;
    private lastVopBlock: number;

    constructor(private readonly fetch: ClientFetch, private readonly database: DatabaseAPI, streamParameters: SLBlockchainStreamParameters = {}) {
        this.streamOptions = {
            mode: 'latest',
            blocksBehindHead: 0,
            saveState: (state) => this.saveState(state),
            loadState: () => this.loadState(),
            stateFile: 'state.json',
            onBlock: null,
            onOp: null,
            onVirtualOp: null,
            onBehindBlocks: null,
            replayBatchSize: null,
            fs: null,
            ...streamParameters,
        };
        this.lastBlock = 0;
        this.lastVopBlock = 0;
    }

    /**
     * Get latest block number.
     */
    public async getCurrentBlockNum(mode: BlockchainMode = 'irreversible') {
        const props = await this.database.getDynamicGlobalProperties();
        switch (mode) {
            case 'irreversible':
                return props.last_irreversible_block_num;
            case 'latest':
                return props.head_block_number;
        }
    }

    /**
     * Get latest block header.
     */
    public async getCurrentBlockHeader(mode?: BlockchainMode) {
        return this.database.getBlockHeader(await this.getCurrentBlockNum(mode));
    }

    /**
     * Get latest block.
     */
    public async getCurrentBlock(mode?: BlockchainMode) {
        return this.database.getBlock(await this.getCurrentBlockNum(mode));
    }

    public async getNextBlock(mode?: BlockchainMode) {
        try {
            const result = await this.database.getDynamicGlobalProperties();

            if (!result) {
                setTimeout(() => this.getNextBlock(), 1000);
                return;
            }

            const currentBlockNum = mode === 'irreversible' ? result.last_irreversible_block_num : result.head_block_number - this.streamOptions.blocksBehindHead;

            if (!this.lastBlock || isNaN(this.lastBlock)) this.lastBlock = currentBlockNum - 1;

            // We are 20+ blocks behind!
            if (currentBlockNum >= this.lastBlock + 20) {
                log('Streaming is ' + (currentBlockNum - this.lastBlock) + ' blocks behind!', LogLevel.Warning, 'Red');

                if (this.streamOptions.onBehindBlocks) this.streamOptions.onBehindBlocks(currentBlockNum - this.lastBlock);
            }

            while (currentBlockNum > this.lastBlock) {
                if (this.streamOptions.replayBatchSize && this.streamOptions.replayBatchSize > 1) {
                    const firstUpcomingBlock = this.lastBlock + 1;
                    const promises: any[] = [];
                    for (let i = 0; i < this.streamOptions.replayBatchSize; i++) {
                        const consecutiveBlock = firstUpcomingBlock + i;
                        if (consecutiveBlock > currentBlockNum) {
                            break;
                        }
                        promises.push(this.database.getBlock(consecutiveBlock));
                    }
                    const blocks: SignedBlock[] = await Promise.all(promises);
                    for (const block of blocks) {
                        if (!block || !block.transactions) {
                            log('Error loading block batch that contains [' + currentBlockNum + ']', LogLevel.Debug);
                            await timeout(1000);
                            return;
                        }
                        await this.processBlockHelper(block, this.lastBlock + 1, currentBlockNum);
                        if (this.streamOptions.onVirtualOp) {
                            await this.getVirtualOps(result.last_irreversible_block_num);
                        }
                    }
                } else {
                    // If we have a new block, process it
                    await this.processBlock(this.lastBlock + 1, currentBlockNum);
                    if (this.streamOptions.onVirtualOp) await this.getVirtualOps(result.last_irreversible_block_num);
                }
            }
        } catch (e: any) {
            log(`Error getting next block: ${e}`, LogLevel.Error, 'Red');
        }

        // Attempt to load the next block after a 1 second delay (or faster if we're behind and need to catch up)
        setTimeout(() => this.getNextBlock(), 1000);
    }

    async stream(options: SLBlockchainStreamParameters) {
        this.streamOptions = Object.assign(this.streamOptions, options);

        // Load saved state (last block read)
        if (this.streamOptions.loadState) {
            const state = await this.streamOptions.loadState();

            if (state) {
                this.lastBlock = state.lastBlock;
                this.lastVopBlock = state.lastVopBlock;
            }
        }

        // Start streaming blocks
        this.getNextBlock();
    }

    async getVirtualOps(last_irreversible_block_num) {
        if (last_irreversible_block_num <= this.lastVopBlock) return;

        const blockNum = !this.lastVopBlock || isNaN(this.lastVopBlock) ? last_irreversible_block_num : this.lastVopBlock + 1;
        const result = await this.database.getOperations(blockNum);

        if (!result || !Array.isArray(result)) return;

        const ops = result.filter((op) => op.virtual_op > 0);

        log(`Loading virtual ops in block ${blockNum}, count: ${ops.length}`, LogLevel.Debug);

        for (let i = 0; i < ops.length; i++) await this.streamOptions.onVirtualOp(ops[i], blockNum);

        this.lastVopBlock = blockNum;

        if (this.streamOptions.saveState)
            this.streamOptions.saveState({
                lastBlock: this.lastBlock,
                lastVopBlock: this.lastVopBlock,
            });
    }

    async processBlock(blockNum: number, currentBlockNum: number) {
        const block = await this.database.getBlock(blockNum);
        return this.processBlockHelper(block as any, blockNum, currentBlockNum);
    }

    async processBlockHelper(block: SignedBlock, blockNum: number, currentBlockNum: number) {
        // Log every 1000th block loaded just for easy parsing of logs, or every block depending on logging level
        log(
            `Processing block [${blockNum}], Head Block: ${currentBlockNum}, Blocks to head: ${currentBlockNum - blockNum}`,
            blockNum % 1000 == 0 ? LogLevel.Warning : LogLevel.Debug,
        );

        if (!block || !block.transactions) {
            // Block couldn't be loaded...this is typically because it hasn't been created yet
            log('Error loading block [' + blockNum + ']', LogLevel.Debug);
            await timeout(1000);
            return;
        }

        if (this.streamOptions.onBlock) await this.streamOptions.onBlock(blockNum, block, currentBlockNum);

        if (this.streamOptions.onOp) {
            const block_time = new Date(block.timestamp + 'Z');

            // Loop through all of the transactions and operations in the block
            for (let i = 0; i < block.transactions.length; i++) {
                const trans = block.transactions[i];

                for (let i = 0; i < trans.operations.length; i++) {
                    const op = trans.operations[i];

                    try {
                        await this.streamOptions.onOp(op, blockNum, block.block_id, block.previous, block.transaction_ids[i], block_time, i);
                    } catch (e: any) {
                        log(`Error processing transaction [${block.transaction_ids[i]}]: ${e}`, LogLevel.Error, 'Red');
                    }
                }
            }
        }

        this.lastBlock = blockNum;

        if (this.streamOptions.saveState)
            this.streamOptions.saveState({
                lastBlock: this.lastBlock,
                lastVopBlock: this.lastVopBlock,
            });
    }

    async loadState() {
        if (!this.streamOptions.fs) throw Error('Missing fs parameter');
        // Check if state has been saved to disk, in which case load it
        if (this.streamOptions.fs.existsSync(this.streamOptions.stateFile)) {
            const state = JSON.parse(this.streamOptions.fs.readFileSync(this.streamOptions.stateFile).toString() || '{}');
            log('Restored saved state: ' + JSON.stringify(state), LogLevel.Info);
            return state;
        }
    }

    saveState(state) {
        if (!this.streamOptions.fs) throw Error('Missing fs parameter');
        // Save the last block read to disk
        this.streamOptions.fs.writeFile(this.streamOptions.stateFile, JSON.stringify(state || {}), function (e: any) {
            if (e) log(e, LogLevel.Error);
        });
    }

    /**
     * Return a asynchronous block number iterator.
     * @param options Feed options, can also be a block number to start from.
     */
    public async *getBlockNumbers(options?: BlockchainStreamOptions | number) {
        // const config = await this.client.database.getConfig()
        // const interval = config['BLOCK_INTERVAL'] as number
        const interval = 3;
        if (!options) {
            options = {};
        } else if (typeof options === 'number') {
            options = { from: options };
        }
        let current = await this.getCurrentBlockNum(options.mode);
        if (options.from !== undefined && options.from > current) {
            throw new Error(`From can't be larger than current block num (${current})`);
        }
        let seen = options.from !== undefined ? options.from : current;
        while (true) {
            while (current > seen) {
                if (options.to !== undefined && seen > options.to) {
                    return;
                }
                yield seen++;
            }
            await timeout(interval * 1000);
            current = await this.getCurrentBlockNum(options.mode);
        }
    }
}
