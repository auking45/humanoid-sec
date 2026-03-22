# Humanoid-Sec AI (Robot Security Fleet Manager)

A comprehensive, AI-powered full-stack application designed to manage, assess, and secure fleets of humanoid and autonomous robots. 

## 📸 UI Preview

<div align="center">
  <!-- TODO: Replace the 'src' below with your actual dashboard screenshot URL or local file path (e.g., ./screenshot.png) -->
  <img width="1000" alt="Humanoid-Sec Dashboard Preview" src="./public/dashboard.png" />
</div>

## ✨ Key Features

*   **Fleet Dashboard**: Real-time overview of your robot fleet's security posture, risk exposure, and critical alerts.
*   **Dynamic Security Checklists**: Create, manage, and evaluate custom security controls across multiple categories (System, OS, Cloud, Network, etc.).
*   **AI-Powered Risk Analysis**: Integrate with Google Gemini, OpenAI GPT-4o, or Anthropic Claude to analyze vulnerabilities and generate strategic mitigation recommendations.
*   **Implementation Guides**: Import, view, and export detailed Markdown (`.md`) deployment guides and shell scripts directly within the app.
*   **Advanced Reporting**: Export security findings and checklists as formatted Markdown or PDF documents.
*   **Dual Database Support**: Seamlessly switch between local SQLite (default) and robust PostgreSQL.

---

## 🚀 Local Setup Guide

### 1. Prerequisites

*   **Node.js**: v18 or higher (Latest LTS version recommended)
*   **npm**: Installed automatically with Node.js.

### 2. Installation

1.  Clone the repository and navigate to the project directory.
2.  Install the required packages:
    ```bash
    npm install
    ```

### 3. Environment Variables

Create a `.env` file in the project root and enter the following content. (By default, it is configured to use SQLite.)

```env
# Database type setting ('sqlite' or 'postgres')
DB_TYPE=sqlite

# Required only when using PostgreSQL (if DB_TYPE=postgres)
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# (Optional) AI Provider API Key settings
# GEMINI_API_KEY=your_api_key_here
# OPENAI_API_KEY=your_openai_key_here
# ANTHROPIC_API_KEY=your_anthropic_key_here
```

### 4. Running the App

Run the server and client simultaneously in development mode:

```bash
npm run dev
```

Access the application in your browser at: **http://localhost:3000**

### 5. Production Build

```bash
# Build the frontend (creates dist folder)
npm run build

# Start the production server
npm start
```

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
