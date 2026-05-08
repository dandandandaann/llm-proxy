import { useState, useEffect } from 'react';

interface HealthStatus {
  status: string;
  timestamp: string;
}

function StatusPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    function handleVisibilityChange() {
      setIsVisible(!document.hidden);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (isVisible) {
      checkHealth();
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [isVisible]);

  async function checkHealth() {
    if (!isVisible) return;

    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setError(null);
      } else {
        setError(`Health check failed: ${res.status}`);
      }
    } catch (err) {
      setError('Cannot connect to proxy');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#00d4ff' }}>
        Minimax Proxy Running
      </h1>

      <div style={{ backgroundColor: '#16213e', padding: '1.5rem', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#888' }}>Server Status</h2>
        
        {loading && <p style={{ color: '#888' }}>Checking...</p>}
        
        {error && (
          <div style={{ color: '#ff4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>●</span>
            <span>Disconnected</span>
            <span style={{ fontSize: '0.875rem', color: '#888', marginLeft: '0.5rem' }}>{error}</span>
          </div>
        )}

        {health && !error && (
          <div style={{ color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>●</span>
            <span>Connected</span>
          </div>
        )}

        {health && (
          <p style={{ color: '#888', fontSize: '0.875rem', marginTop: '1rem' }}>
            Last checked: {new Date(health.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div style={{ marginTop: '2rem', backgroundColor: '#16213e', padding: '1.5rem', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#888' }}>Proxy Endpoints</h2>
        <code style={{ color: '#00d4ff', display: 'block', marginBottom: '0.5rem' }}>POST /anthropic/v1/messages</code>
        <code style={{ color: '#00d4ff', display: 'block' }}>POST /v1/chat/completions</code>
      </div>
    </div>
  );
}

export default StatusPage;