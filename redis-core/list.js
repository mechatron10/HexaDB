class Node {
    constructor(value) {
      this.value = value; // The value stored in the node
      this.next = null;   // Pointer to the next node
      this.prev = null;   // Pointer to the previous node
    }
  }
  
  class List {
    constructor() {
      this.head = null;   // Pointer to the first node
      this.tail = null;   // Pointer to the last node
      this.size = 0;      // Keeps track of the size of the list
    }
  
    // Add item to the front of the list
    addFront(value) {
      const newNode = new Node(value);
      if (!this.head) { // If the list is empty
        this.head = this.tail = newNode;
      } else {
        newNode.next = this.head;
        this.head.prev = newNode;
        this.head = newNode;
      }
      this.size++;
    }
  
    // Add item to the back of the list
    addBack(value) {
      const newNode = new Node(value);
      if (!this.tail) { // If the list is empty
        this.head = this.tail = newNode;
      } else {
        newNode.prev = this.tail;
        this.tail.next = newNode;
        this.tail = newNode;
      }
      this.size++;
    }
  
    // Get the current size of the list
    getSize() {
      return this.size;
    }
  
    // Get elements in a specific range (inclusive)
    getRange(startIndex, endIndex) {
      // if (startIndex < 0 || endIndex >= this.size || startIndex > endIndex) {
      //   throw new Error("Invalid range");
      // }
  
      const elements = [];
      let current = this.head;
      let index = 0;
  
      while (current && index <= endIndex) {
        if (index >= startIndex) {
           console.log("The current value is :",current.value);
          elements.push(current.value);
        }
        current = current.next;
        index++;
      }
  
      return elements;
    }
  
    // Delete the first element of the list
    deleteFront() {
      if (!this.head) {
        throw new Error("List is empty");
      }
  
      if (this.head === this.tail) { // If only one element
        this.head = this.tail = null;
      } else {
        this.head = this.head.next;
        this.head.prev = null;
      }
  
      this.size--;
    }
  
    // Delete the last element of the list
    deleteBack() {
      if (!this.tail) {
        throw new Error("List is empty");
      }
  
      if (this.head === this.tail) { // If only one element
        this.head = this.tail = null;
      } else {
        this.tail = this.tail.prev;
        this.tail.next = null;
      }
  
      this.size--;
    }
  
    // Remove elements in a specific range (inclusive)
    removeRange(startIndex, endIndex) {
      if (startIndex < 0 || endIndex >= this.size || startIndex > endIndex) {
        throw new Error("Invalid range");
      }
  
      let current = this.head;
      let index = 0;
  
      while (current && index <= endIndex) {
        const nextNode = current.next;
        if (index >= startIndex) {
          // Remove the current node
          if (current.prev) {
            current.prev.next = current.next;
          } else {
            this.head = current.next; // Update head if needed
          }
  
          if (current.next) {
            current.next.prev = current.prev;
          } else {
            this.tail = current.prev; // Update tail if needed
          }
  
          this.size--;
        }
  
        current = nextNode;
        index++;
      }
    }
  }
module.exports=List;