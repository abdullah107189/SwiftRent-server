# SwiftRent - Server (Backend)

This is the backend of SwiftRent, a full-featured car rental platform tailored for the Bangladeshi market. Built using Express.js and MongoDB, it handles all core logic including authentication, booking management, car data processing, and payment integration.

---

## 🚀 Features

* RESTful API using Express.js
* MongoDB integration (native driver)
* Role-based access (admin/driver/customer)
* Booking and availability management
* Review and rating storage
* SSLCommerz payment gateway support
* Real-time updates with Socket.io

---

## 🛠️ Tech Stack

* Node.js
* Express.js
* MongoDB
* dotenv, cors, cookie-parser
* moment, moment-timezone
* SSLCommerz
* Socket.io

---

## 📂 Project Setup

```bash
cd server
npm install
node index.js
```

The backend will run at: `http://localhost:3000`

---

## 🔗 Environment Variables

Create a `.env` file and configure:

```env
PORT=3000
DB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
SSL_STORE_ID=your_ssl_store_id
SSL_STORE_PASS=your_ssl_store_password
```

---

## 📁 Project Structure

```
server/
 ┣ controllers/
 ┣ routes/
 ┣ middleware/
 ┣ utils/
 ┣ index.js
 ┗ .env
```

---

## 👨‍💻 Developed By

Backend team of SwiftRent

