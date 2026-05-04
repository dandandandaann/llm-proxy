import { useState, useEffect } from 'react';
import StatusPage from './components/StatusPage';

function App() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1a1a2e', color: '#fff', padding: '2rem' }}>
      <StatusPage />
    </div>
  );
}

export default App;