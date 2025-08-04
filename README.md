# P2P File Share

**P2P File Share** is a lightweight, real-time, peer-to-peer (P2P) file-sharing and messaging system built with Node.js and modern web technologies. Inspired by classic P2P clients like DC++, this application allows users on the same network to discover each other, chat in real-time, and transfer files directly without needing a central server to handle the data.

The application uses a hybrid model where a central Node.js server acts as a "signaling" or "matchmaking" hub, while the actual file and chat data are transferred directly between users' browsers using **WebRTC**.

---

## Features

* **Peer-to-Peer File Transfer:** Files are sent directly from the sharer to the downloader, ensuring fast and private transfers. The central server is never a bottleneck.
* **Real-Time Chat:** A public chat room allows all connected users to communicate instantly.
* **Network-Wide File Search:** Users can search for files across all connected peers.
* **Online User List:** See who is currently connected to the network and how many files they are sharing.
* **File Integrity Checks:** Uses MD5 hashing to ensure that downloaded files are not corrupted during transfer.
* **Desktop Notifications:** Receive native desktop notifications for new chat messages when the application is in the background.
* **Cross-Platform:** Works on any modern web browser (Chrome, Firefox, Edge, Safari) on any operating system (Windows, macOS, Linux).

---

## Technology Stack

* **Backend (Signaling Server):**
    * **Node.js:** A JavaScript runtime for building the server.
    * **Express.js:** A minimal web framework to serve the frontend application.
    * **ws (WebSockets):** For real-time, two-way communication between the clients and the signaling server.
* **Frontend (Client):**
    * **HTML5 & CSS3:** For the structure and styling of the user interface.
    * **Tailwind CSS:** A utility-first CSS framework for rapid UI development.
    * **Vanilla JavaScript (ES6+):** For all client-side logic, including UI interactions and P2P communication.
    * **WebRTC (Web Real-Time Communication):** The core technology that enables direct browser-to-browser data channels for file transfers.
    * **Spark-MD5:** A library for fast and efficient MD5 hash generation in the browser.

---

## How It Works

1.  **Signaling:** When a user logs in, they establish a **WebSocket** connection to the central `server.js`. This server registers the user and their shared files in a list.
2.  **Discovery:** The server broadcasts the updated list of online users to everyone. This is how users "discover" each other.
3.  **P2P Handshake:** When User A wants to download a file from User B, User A's browser sends a request via the signaling server. The server relays messages (**offers**, **answers**, and **ICE candidates**) between them until their browsers establish a direct **WebRTC** connection.
4.  **Direct Transfer:** Once the WebRTC data channel is open, the file is broken into chunks and sent directly from User B's browser to User A's browser, completely bypassing the server.

---

## Use Cases

This application is highly flexible and can be deployed in two primary ways:

### 1. Private Network (Intranet)

This is the ideal use case for a trusted, local network.

* **How to Deploy:** Run the `server.js` on one computer connected to the network. Other users on the **same network** (e.g., college Wi-Fi, office LAN) can connect by navigating to the host computer's private IP address (e.g., `http://192.168.1.10:3000`).
* **Examples:**
    * A college dorm for students to share study materials and project files.
    * An office for colleagues to quickly share documents without using email or cloud services.
    * A LAN party for sharing game mods or screenshots.

### 2. Public Network (Internet)

The application can also be used by anyone, anywhere in the world.

* **How to Deploy:** Run the `server.js` on a public cloud server (like AWS, Google Cloud, DigitalOcean, etc.) that has a public IP address or a domain name.
* **Examples:**
    * A global community of collaborators sharing large project files.
    * A private file-sharing service for a group of friends or family members located in different countries.

---

## Setup and Installation

Follow these steps to get the application running on your machine.

1.  **Prerequisites:**
    * [Node.js](https://nodejs.org/) (v14 or later)
    * `npm` (comes with Node.js)
2.  **Clone the Repository / Setup the Files:**
    Create the following folder structure and place the corresponding files inside:
    ```
    file-sharing-app/
    |-- public/
    |   |-- css/
    |   |   |-- style.css
    |   |-- js/
    |   |   |-- app.js
    |   |-- index.html
    |-- server.js
    |-- package.json
    ```
3.  **Install Dependencies:**
    Open your terminal, navigate to the root `file-sharing-app` directory, and run:
    ```bash
    npm install express ws
    ```
    This will install the necessary `express` and `ws` packages.
4.  **Run the Server:**
    Start the signaling server with the following command:
    ```bash
    node server.js
    ```
    You should see a confirmation message: `Server is running on http://localhost:3000`.
5.  **Access the Application:**
    Open your web browser and navigate to `http://localhost:3000`. To test the P2P functionality, open a second browser tab or window and connect to the same address.

---

## Future Improvements

* **Private Messaging:** Implement one-to-one chat between users.
* **Pause/Resume Downloads:** Add functionality to pause and resume large file transfers.
* **User Avatars:** Allow users to set a profile picture.
* **Transfer Queue:** Create a more advanced UI for managing multiple concurrent downloads and uploads.
* **Authentication:** Add a proper login system with usernames and passwords for use on public networks.
