# Lunch Ticket Dashboard Implementation Plan

This plan outlines the creation of a visual dashboard for lunch ticket reporting. The system will consist of a React frontend for visualization and a Node.js/Express backend to fetch data from a MySQL database.

## User Review Required
> [!IMPORTANT]
> Please provide your MySQL database credentials (host, user, password, database name) in the `.env` file that will be created in the `backend` folder.
> For the initial demonstration, I will include a "Mock Data" mode in case the database is not immediately available.

## Proposed Changes

### Backend Setup
#### [NEW] [server.js](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/backend/server.js)
- Express server entry point.
- CORS configuration.
- API route registration.

#### [NEW] [db.js](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/backend/db.js)
- MySQL connection pool configuration using `mysql2`.
- Export query helper function.

#### [NEW] [logger.js](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/backend/utils/logger.js)
- Configuration of `winston` logger.
- Two transports: `combined.log` for all events, `error.log` for errors.
- Console logging for development.

#### [NEW] [dashboardRoutes.js](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/backend/routes/dashboardRoutes.js)
- API endpoints:
    - `GET /api/stats/daily`: Total lunches, tickets, types per day.
    - `GET /api/stats/duplicates`: List of attempted duplicates.
    - `GET /api/stats/summary`: Aggregate counts for cards.

### Frontend Setup (React + Vite)
#### [NEW] [App.jsx](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/frontend/src/App.jsx)
- Main application layout.
- Integration of Dashboard component.

#### [NEW] [Dashboard.jsx](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/frontend/src/components/Dashboard.jsx)
- Main view container.
- Grid layout for charts and stats.

#### [NEW] [StatCard.jsx](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/frontend/src/components/StatCard.jsx)
- Reusable component for displaying single metrics (e.g., "Total Lunches Today").
- Glassmorphism styling.

#### [NEW] [Charts.jsx](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/frontend/src/components/Charts.jsx)
- `LineChart` for lunches over time.
- `DoughnutChart` for lunch types.
- `BarChart` for tickets vs lunches.
- Uses `react-chartjs-2`.

#### [NEW] [index.css](file:///c:/Users/USER/Desktop/Proyectos/pagina_reporteadores_app_comedor_Detcuador/frontend/src/index.css)
- Global styles.
- CSS Variables for premium color palette (Dark/Light mode support if robust, otherwise a sleek modern dark theme).
- Reset and utility classes (Vanilla CSS).

## Verification Plan

### Automated Tests
- Run backend server: `node backend/server.js` and check console for DB connection.
- Run frontend: `npm run dev` in frontend directory.

### Manual Verification
- Open the web application in the browser.
- Verify that charts render with animation.
- Check if data reflects the mocked data (or real DB data if connected).
- Resize window to check responsiveness.
