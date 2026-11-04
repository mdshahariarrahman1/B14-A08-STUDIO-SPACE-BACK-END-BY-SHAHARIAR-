# ⚙️ StudioSpace — Backend

### Powering creative spaces, bookings, and studio management.

**StudioSpace Backend** is the server-side application of StudioSpace, a peer-to-peer creative workspace and production studio rental platform. It provides backend functionality for managing studio listings and securely communicating with the frontend application.

---

## ✨ Key Features

- **Studio Management:** Create, retrieve, update, and delete studio listings.
- **MongoDB Integration:** Store and manage studio information using MongoDB.
- **RESTful API:** Provide structured API endpoints for frontend communication.
- **Secure Communication:** Protect sensitive backend operations using a shared API secret.
- **Data Management:** Handle studio information, including names, categories, pricing, images, amenities, and descriptions.
- **Frontend Integration:** Connect seamlessly with the StudioSpace Next.js frontend.
- **Environment Configuration:** Keep sensitive credentials and database configurations secure.

---

## 🛠️ Technology Stack

- **Runtime:** Node.js
- **Backend Framework:** Express.js
- **Database:** MongoDB
- **Language:** JavaScript
- **Environment Variables:** dotenv
- **Cross-Origin Resource Sharing:** CORS
- **Development Tool:** Nodemon

---

## 🚀 Local Installation & Setup

Follow these steps to run the backend locally.

### 1. Clone the Repository

```bash
git clone YOUR_BACKEND_GITHUB_REPOSITORY_URL
```

### 2. Navigate to the Project Directory

```bash
cd your-backend-project-folder
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URL=your_mongodb_connection_string
FRONTEND_ORIGINS=https://your-frontend-domain.com
BOOKING_API_SECRET=your_shared_secret
BETTER_AUTH_URL=https://your-frontend-domain.com
JWT_ISSUER=https://your-frontend-domain.com
JWT_AUDIENCE=https://your-frontend-domain.com
JWKS_URL=https://your-frontend-domain.com/api/auth/jwks
```

Set the auth URLs to the frontend's canonical `BETTER_AUTH_URL` exactly, without a trailing slash. The backend uses `JWKS_URL` to verify the JWTs issued by that frontend. If `JWT_ISSUER` and `BETTER_AUTH_URL` are both omitted, the first origin in `FRONTEND_ORIGINS` is used as the issuer; if that is also unset, the StudioSpace production frontend URL is used. If `JWKS_URL` is omitted, it defaults to `<issuer>/api/auth/jwks`. Set `FRONTEND_ORIGINS` to the exact browser origin(s), separated by commas and without trailing slashes. If it is unset, the API still starts, but browsers will not be allowed to make cross-origin requests; server-to-server requests are unaffected. Make sure the MongoDB connection string and shared secret are correctly configured.

### 5. Start the Development Server

```bash
npm run dev
```

Or, if Nodemon is not configured:

```bash
node index.js
```

### 6. Backend API

Your local backend server should run at:

```text
http://localhost:5000
```

---

## 🔗 Frontend Integration

The backend communicates with the StudioSpace frontend through the `BACKEND_URL` environment variable.

Configure the frontend `.env.local` file:

```env
BACKEND_URL=http://localhost:5000
BOOKING_API_SECRET=your_shared_secret
```

**Important:** The shared secret must match on both the frontend and backend.

---

## 👨‍💻 Developer

**Md Shahariar Rahman Shifat**

**Full-Stack Web Developer**

Passionate about developing scalable backend systems, RESTful APIs, and modern full-stack web applications.

- **GitHub:** [mdshahariarrahman1](https://github.com/mdshahariarrahman1)
- **Project:** StudioSpace Backend
- **Project Type:** Backend API

---

### ❤️ Developed by Md Shahariar Rahman Shifat

*Building reliable backend solutions for creative digital experiences.*