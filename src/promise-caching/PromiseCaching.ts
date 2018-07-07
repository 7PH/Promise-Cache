import {CachedRecord} from "./CachedRecord";
import {CachingConfig} from "./CachingConfig";

export class PromiseCaching {

    private readonly cached: Map<any, CachedRecord<any>> = new Map();

    public readonly config: CachingConfig;

    constructor(config?: Partial<CachingConfig>) {
        if (typeof config === 'undefined')
            config = {};

        this.config = {
            returnExpired: typeof config.returnExpired !== 'undefined' ? config.returnExpired : true
        }
    }

    /**
     *
     * @param key
     * @returns {CachedRecord<T> | undefined}
     */
    private readCache<T>(key: any): CachedRecord<T> | undefined {
        return this.cached.get(key);
    }

    /**
     *
     * @param key
     */
    private expireCache<T>(key: any): void {
        if (this.config.returnExpired) {
            let value: CachedRecord<T> | undefined = this.readCache<T>(key);
            if (typeof value !== 'undefined')
                value.expired = true;
        } else {
            this.cached.delete(key);
        }
    }

    /**
     *
     * @param key
     * @param {number} expire
     * @param {() => Promise<T>} generator
     * @returns {Promise<T>}
     */
    private regenCache<T>(key: any, expire: number, generator: () => Promise<T>): Promise<T> {
        let entry: CachedRecord<T>;

        let promise: Promise<T> = new Promise<T>(async (resolve, reject) => {
            // generate it
            generator()
                .then((data: T) => {

                    // trigger the cache expiring
                    setTimeout(() => this.expireCache<T>(key), expire);

                    if (typeof entry.nextPromise !== 'undefined') {
                        entry.promise = entry.nextPromise;
                        delete entry.nextPromise;
                    }

                    // resolves this Promise
                    resolve(data);

                }).catch((e: any) => {
                    this.cached.delete(key);
                    reject(e);
                });
        });

        let oldEntry: CachedRecord<T> | undefined = this.cached.get(key);
        if (typeof oldEntry === 'undefined') {
            // init new cache that will be generated
            const cache: CachedRecord<T> = {
                expired: false,
                promise: promise
            };
            this.cached.set(key, cache);
        } else {
            oldEntry.nextPromise = promise;
        }

        entry = this.cached.get(key) as CachedRecord<T>;

        return promise;
    }

    /**
     *
     * @param key
     * @param {number} expire
     * @param {() => Promise<T>} generator
     * @returns {Promise<T>}
     */
    public get<T>(key: any, expire?: number, generator?: () => Promise<T>): Promise<T> {
        let cache: CachedRecord<T> | undefined = this.readCache<T>(key);

        if (cache == null) {
            if (generator != null) {
                // SHOULD and CAN generate cache
                return this.regenCache(key, expire || -1, generator);
            } else {
                // SHOULD but CANNOT generate cache
                return Promise.reject(new Error("Cache does not exists and generator was not provided"));
            }
        } else {
            if (cache.expired && generator != null && typeof cache.nextPromise === 'undefined') {
                // SHOULD and CAN generate cache
                this.regenCache(key, expire || -1, generator);
            }
            return cache.promise;
        }
    }
}