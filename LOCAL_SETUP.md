# Local Setup Guide

This document provides instructions on how to install and run this application on your local computer.

## 1. Prerequisites

The following software must be installed on your system:

*   **Node.js**: v18 or higher (Latest LTS version recommended)
*   **npm**: Installed automatically with Node.js.

## 2. Installation

1.  Download or clone the project files to a local directory.
2.  Open a terminal (or command prompt) and navigate to the project root directory.
3.  Install the required packages:
    ```bash
    npm install
    ```

## 3. Environment Variables

Create a `.env` file in the project root and enter the following content. (By default, it is configured to use SQLite.)

```env
# Database type setting ('sqlite' or 'postgres')
DB_TYPE=sqlite

# Required only when using PostgreSQL (if DB_TYPE=postgres)
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# (Optional) API Key settings
# GEMINI_API_KEY=your_api_key_here
# OPENAI_API_KEY=your_openai_key_here
# ANTHROPIC_API_KEY=your_anthropic_key_here
```

## 4. Running the App

Run the server and client simultaneously in development mode:

```bash
npm run dev
```

Once execution is complete, you can access it in your browser at the following address:
*   **URL**: [http://localhost:3000](http://localhost:3000)

## 5. Database Management

### When using SQLite (Default)
*   No separate installation is required.
*   When you run the app for the first time, the `database.sqlite` file is automatically created and populated with initial data.

### When using PostgreSQL
1.  A local or external PostgreSQL server must be ready.
2.  Change `DB_TYPE=postgres` in the `.env` file.
3.  Enter your DB connection information in `DATABASE_URL`.
4.  When you run the app, tables are automatically created and initial data is migrated.

## 6. Production Build

To build and run for a real service environment, use the following commands:

```bash
# Build (creates dist folder)
npm run build

# Run
npm start
```

---
**Note**: When running locally, please check if port 3000 is already in use.
