import { useNavigate } from 'react-router-dom';

const ICON_SIZE = 86;

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-root)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Orange glow */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 500,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(232,118,58,0.13), transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* Dot grid */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          pointerEvents: 'none',
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, var(--bg-root) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Luma mark */}
        <div
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            marginBottom: 24,
            animation: 'pu-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0s both',
          }}
        >
          <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 72 72" fill="none">
            <rect x="10" y="10" width="52" height="52" rx="16" fill="#2A2825" />
            <path d="M23 21V51H42V44H31.5V21H23Z" fill="#E8763A" />
            <path d="M42 24.5C48.5 24.5 53.5 29.5 53.5 36C53.5 42.5 48.5 47.5 42 47.5" stroke="#E8763A" strokeWidth="4.8" strokeLinecap="round" fill="none" />
            <circle cx="42" cy="47.5" r="3.2" fill="#4A4640" />
          </svg>
        </div>

        {/* Wordmark */}
        <h1
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(4.4rem, 9.5vw, 8.2rem)',
            fontWeight: 900,
            color: 'var(--text-primary)',
            letterSpacing: '-0.035em',
            lineHeight: 1,
            margin: 0,
            animation: 'pu-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both',
          }}
        >
          Luma
        </h1>

        {/* Byline */}
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: '#E8763A',
            textTransform: 'uppercase',
            letterSpacing: '0.13em',
            margin: '16px 0 0',
            animation: 'pu-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both',
          }}
        >
          by Mosaic Wellness
        </p>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '1.2rem',
            fontWeight: 400,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.01em',
            margin: '32px 0 0',
            animation: 'pu-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s both',
          }}
        >
          Your marketing intelligence, in one place.
        </p>

        {/* CTA */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            marginTop: 48,
            background: 'var(--text-primary)',
            color: 'var(--bg-root)',
            fontFamily: "'Outfit', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            padding: '16px 36px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            animation: 'pu-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.4s both',
            boxShadow: '0 8px 24px rgba(240,235,228,0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 16px 40px rgba(240,235,228,0.25), 0 0 20px rgba(232,118,58,0.3)';
            e.currentTarget.style.background = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(240,235,228,0.1)';
            e.currentTarget.style.background = 'var(--text-primary)';
          }}
        >
          Launch Dashboard →
        </button>
      </div>

      {/* Footer */}
      <p
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: '#2E2C2A',
          margin: 0,
          zIndex: 1,
        }}
      >
        © 2026 Mosaic Wellness
      </p>

      <style>{`
        @keyframes pu-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
