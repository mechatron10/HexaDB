# Hexa DB  

**Hexa DB** is a custom-built, lightweight, and distributed key-value database inspired by Redis. It is designed to provide efficient data storage, replication, and retrieval with support for snapshotting and persistence.  

This project replicates core Redis functionalities while introducing a simple yet robust framework for managing master-replica architecture, ensuring high availability and fault tolerance. Hexa DB is an excellent solution for learning and exploring the implementation of a distributed database.

Key features include:  
- Master-Replica Architecture for high availability and scalability.  
- Snapshotting and Secondary Storage for data durability and recovery.  
- RESP Protocol for efficient communication between clients and servers.  
- Distributed operations with support for consistent data propagation across replicas.

Explore Hexa DB to understand how distributed databases work under the hood and expand it further to suit your requirements!

## Project Architecture  

### 1. **Master-Replica Architecture**  
- **Master Node**:  
  Handles all write operations (`SET`, `DEL`, etc.), maintaining the current state of the database.  
- **Replicas**:  
  Replicate the master’s state to ensure high availability and scalability. Replicas handle read operations to offload the master, improving performance.

---

### 2. **Writers and Readers**  
- **Writers**:  
  Clients interact with the master to perform write operations such as setting and modifying key-value pairs.  
- **Readers**:  
  Clients read data directly from replicas, reducing the load on the master and enabling faster read operations.

---

### 3. **Snapshotting**  
The state of the master is periodically captured and saved as a snapshot in a hexdump file.  
- Snapshots can be loaded into replicas for synchronization.  
- They also serve as a recovery mechanism in case of failure.

---

### 4. **Secondary Storage**  
Snapshots are stored on secondary storage (e.g., disk or cloud) to ensure data durability.  
- Provides long-term persistence.  
- Enables recovery after unexpected crashes or shutdowns.

---

### 5. **RESP Protocol**  
All communication between the client and the server uses the **RESP (Redis Serialization Protocol)**, ensuring efficient and lightweight command processing.

---

### 6. **Replication Mechanism**  
The master node propagates snapshots to replicas to keep them synchronized with the latest state.  
- Ensures data consistency across nodes.  
- Supports a distributed architecture for scalability.

---

### 7. **Distributed Operations**  
Commands executed on the master are forwarded to replicas. This ensures:  
- **Data Consistency**: All replicas reflect the master’s state.  
- **High Availability**: Readers can access data from any replica.

---

## Architecture Overview  

![Redis Clone Architecture](/images/redis.jpg)

---

## Why This Clone?  
This project replicates the core functionalities of Redis while adding a simple, extensible framework for distributed operations, data persistence, and snapshot management.




# Persistence


In **Hexa DB**, data persistence is achieved through the creation of snapshots in a custom hexadecimal format. This method ensures that the in-memory dataset can be reliably stored and restored, providing durability and data recovery capabilities.

### Snapshot Creation

- **Triggering Snapshots**: Snapshots are initiated using the `SAVE` command. When executed, the system performs a synchronous save of the dataset, producing a point-in-time snapshot of all the data inside the database. :contentReference[oaicite:0]{index=0}

- **Snapshot Storage**: The snapshot is stored as a file with a `.hex` extension, representing the encoded state of the database at the time of the snapshot.

### Hexadecimal Encoding

- **Encoding Process**: The in-memory dataset is serialized and then encoded into a hexadecimal format. This encoding transforms the binary data into a readable string of hexadecimal characters, facilitating easy storage and transfer.

- **File Structure**: The `.hex` file begins with a header indicating the start of the snapshot, followed by the encoded data representing the database's state. The file concludes with a footer marking the end of the snapshot.

### Restoring from Snapshot

To restore the database from a snapshot:

1. **Load the Snapshot**: Use the `LOAD` command, specifying the path to the `.hex` file.

2. **Decode and Deserialize**: The system reads the hexadecimal file, decodes the data, and deserializes it back into the in-memory data structures.

3. **Replace Current Dataset**: The restored dataset replaces the current in-memory dataset, effectively reverting the database to the state captured in the snapshot.

### Benefits

- **Data Durability**: Ensures that the database state can be preserved and recovered, protecting against data loss.

- **Efficient Storage**: The hexadecimal encoding provides a compact representation of the dataset, optimizing storage space.

- **Simplicity**: Utilizing a straightforward encoding format simplifies the implementation and maintenance of the persistence mechanism.

For more detailed information on the RDB file format and its encoding, refer to the [Redis RDB File Format documentation](https://rdb.fnordig.de/file_format.html).

## Data Structures Implemented

This Redis clone supports the following data structures:

- **Key-Value Pairs**: The simplest and most commonly used data structure in Redis, key-value pairs allow for straightforward storage and retrieval of string data. Each key is unique and maps directly to a value, facilitating efficient data access

- **Lists**: Redis lists are ordered collections of strings, implemented as linked lists. They support operations such as adding elements to the head or tail, trimming based on index ranges, and retrieving elements by their position. This makes them suitable for tasks like message queues and timelines.

- **Streams**: Introduced in Redis 5.0, streams are an append-only data structure designed for handling high-throughput, real-time data feeds. They allow for the storage of multiple fields and string values with an automatic, time-based sequence at a single key, making them ideal for building message brokers and event sourcing solutions.

By implementing these data structures, your Redis clone can efficiently handle a wide range of use cases, from simple caching mechanisms to complex real-time data processing tasks.
## Features
Hexa DB is a feature-rich distributed key-value database with functionalities inspired by Redis. Below are the detailed features based on its architecture:

---

### 1. **Master-Replica Architecture**  
Hexa DB is built on a robust master-replica model to ensure high availability, scalability, and fault tolerance.  
- **Master Node**: Handles all write operations and maintains the database's current state.  
- **Replicas**: Synchronize with the master and handle read operations, reducing the load on the master and enabling scalability.

---

### 2. **Efficient Writers and Readers Management**  
- **Writers**:  
  - Clients send `SET`, `DEL`, and other commands to the master node for data modification.  
  - Commands are executed with minimal latency, ensuring a fast and responsive system.  
- **Readers**:  
  - Read operations (`GET`, etc.) are directed to replicas, ensuring fast retrieval and load balancing.  
  - Read replicas ensure the master can focus exclusively on write-heavy workloads.

---

### 3. **Snapshotting for Data Persistence**  
- Periodic snapshots capture the current state of the master node.  
- Snapshots are saved in **hexdump files** to secondary storage, ensuring:  
  - Reliable recovery after unexpected failures.  
  - Easy synchronization with replicas.  
- Snapshots can be manually triggered or automatically scheduled based on configuration.

---

### 4. **Secondary Storage Support**  
- All snapshots are stored in durable secondary storage, such as disk or cloud storage.  
- This ensures long-term data persistence and allows recovery even after a system crash.  
- The file format is compact and efficient for faster saving and loading.

---

### 5. **RESP Protocol for Communication**  
Hexa DB uses the **Redis Serialization Protocol (RESP)** to facilitate lightweight and efficient communication between clients and servers.  
- Supports a wide range of commands.  
- Ensures low-latency interactions and minimal overhead.  

---

### 6. **Real-Time Replication Mechanism**  
- Hexa DB implements a master-replica synchronization mechanism to maintain consistency:  
  - Snapshots of the master are propagated to replicas in real time.  
  - Replicas reflect the exact state of the master, ensuring data consistency.  
- Allows for distributed data retrieval with guaranteed consistency.

---

### 7. **Distributed Operations**  
- Commands executed on the master are distributed across replicas for high availability.  
- Consistency is maintained across the system, ensuring that all replicas accurately reflect the master’s state.  
- Distributed architecture enables scalability and fault tolerance.

---

### 8. **Fault Tolerance and High Availability**  
- Replicas ensure the database remains available even if the master node fails.  
- Snapshots stored in secondary storage provide a fallback mechanism for recovery.  
- Read requests can continue uninterrupted by relying on replicas during a failure.

---

### 9. **Minimal Resource Utilization**  
- Designed to be lightweight and efficient, Hexa DB minimizes resource usage without compromising on performance.  
- Suitable for scenarios where memory and processing resources are limited.

---

### 10. **Extendable Design**  
- Hexa DB is designed to be easily extendable:  
  - Add custom commands.  
  - Integrate advanced features such as Pub/Sub, AOF persistence, or sharding.  

---

Hexa DB combines simplicity, reliability, and scalability to provide a robust distributed database solution. Explore these features and adapt Hexa DB to your specific use case!

## Installation

### Prerequisites  
- **Node.js** (v14+ recommended)  
- **npm** (comes with Node.js)

---

### Step 1: Clone the Repository  
```bash
git clone https://github.com/mechatron10/hexa-db.git
cd hexa-db
```
###  Step 2: Install Dependencies
Install the required Node.js modules using:
```bash
npm install
```
###  Step 3: Start the HTTP Server
The HTTP server (app.js) acts as a gateway to communicate with the TCP server (Redis clone) running in the background. To start the HTTP server:
```bash
node app.js
```
- **Note**:  The Redis clone (TCP server) is automatically spawned in the background when the HTTP server starts. There’s no need to manually start the TCP server. 
### Step 4: Sending Commands to the API
Use the `/sendCommand` endpoint to send commands to the TCP server via the HTTP server.
Example Commands:
- PING: Send a PING command to check server health:
```bash
 curl -X POST http://localhost:<port>/sendCommand \
  -H "Content-Type: application/json" \
  -d '{"message": "*1\r\n$4\r\nPING\r\n"}'
```
- SET: Set a key-value pair:

```bash
  curl -X POST http://localhost:<port>/sendCommand \
  -H "Content-Type: application/json" \
  -d '{"message": "*3\r\n$3\r\nSET\r\n$key_length\r\nkey_value\r\n$value_length\r\nvalue\r\n"}'
```
- GET: Retrieve the value of a key:

```bash
  curl -X POST http://localhost:<port>/sendCommand \
  -H "Content-Type: application/json" \
  -d '{"message": "*2\r\n$3\r\nGET\r\n$key_length\r\nkey_value\r\n"}'
```

Replace <port> with the port where the HTTP server is running (default: 3000).
- **Note**: Refer more commands in `example/demoCommand.json` 


## Conclusion

Thank you for exploring **Hexa DB**. For more information or to connect with me, feel free to visit my profiles below:

- **GitHub**: [mechatron10](https://github.com/mechatron10)
- **LeetCode**: [Anurag112](https://leetcode.com/u/Anurag112/)
- **LinkedIn**: [Anurag Soni](https://www.linkedin.com/in/anurag-soni-191220219/)
- **X (formerly Twitter)**: [mechatron010](https://x.com/mechatron010)

