# AML-Filter Frontend

React + TypeScript frontend for AML-Filter v2.

## Setup

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Build

```bash
npm run build
```

## Project Structure

```
frontend/
  src/
    components/    # React components
    pages/         # Page components
    hooks/         # Custom React hooks
    services/      # API client
    types/         # TypeScript types
    utils/         # Utility functions
  public/          # Static assets
```

## API Integration

The frontend connects to the backend API at `http://localhost:8000/api/v1`

See [backend README](../backend/README.md) for API documentation.

