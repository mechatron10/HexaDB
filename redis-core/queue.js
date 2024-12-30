
class Queue {
    constructor() {
        this.items = {}
        this.frontIndex = 0
        this.backIndex = 0
    }
    enqueue(item) {
        this.items[this.backIndex] = item
        this.backIndex++
    }
    dequeue() {
        const item = this.items[this.frontIndex]
        delete this.items[this.frontIndex]
        this.frontIndex++
    }
    peek() {
        return this.items[this.frontIndex]
    }
    size()
    {
        return this.backIndex-this.frontIndex;
    }
    getFrontIndex()
    {
        return this.frontIndex;
    }
    getBackIndex()
    {
        return this.backIndex;
    }
    // get printQueue() {
    //     return this.items;
    // }
}
module.exports=Queue;