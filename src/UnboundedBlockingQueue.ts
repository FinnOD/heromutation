export class UnboundedBlockingQueue<T> {
    private queue: T[] = [];
    private resolvers: Array<(value: T | PromiseLike<T>) => void> = [];

    // Does not block
    enqueue(item: T): void {
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift();
            if (resolve) resolve(item);
        } else {
            this.queue.push(item);
        }
    }

    // Blocks if the queue is empty
    async dequeue(): Promise<T> {
        if (this.queue.length > 0) {
            return this.queue.shift()!;
        } else {
            return new Promise<T>(resolve => {
                this.resolvers.push(resolve);
            });
        }
    }

    size(): number {
        return this.queue.length;
    }
}