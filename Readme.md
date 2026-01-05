# Remote Video Handler

This is a full-stack monorepo for remote video control.

## Structure

*   `server`: The Node.js backend server.
*   `client-webapp`: The client-facing Progressive Web App (PWA).
*   `admin-frontend`: The admin dashboard.

## Installation

1.  Clone the repository.
2.  Install dependencies for all workspaces:
    ```bash
    npm install
    ```

## Usage

To start the application, run the following command:

```bash
npm start
```

This will:

1.  Build the `client-webapp` and `admin-frontend`.
2.  Start the Node.js server.
3.  Start the OSC bridge.

*   The client PWA is available at `https://localhost:3000/client`.
*   The admin dashboard is available at `https://localhost:3000/admin`.
