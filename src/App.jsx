import { useEffect, useRef, useState } from 'react';
import { createNeonCarExperience, MAX_PLAYER_SPEED } from './scene.js';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" />
      <path d="M9.3 9.6a2.7 2.7 0 1 1 4.1 2.3c-.9.6-1.4 1.1-1.4 2.1" />
      <circle cx="12" cy="17.1" r=".18" fill="currentColor" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.4 15.4c.4.7 1.3 1.2 2.6 1.2 1.8 0 3-1 3-2.3 0-3-5.6-1.5-5.6-4.4 0-1.3 1.2-2.3 3-2.3 1.3 0 2.2.5 2.6 1.2M12 6.5v11" strokeLinecap="round" />
    </svg>
  );
}

// A gauge with a gap at the bottom: two concentric arcs (speed outer, torque
// inner) drawn with the stroke-dasharray trick — a circle's stroke split into
// a visible arc-length + a transparent remainder, then rotated so the arc
// starts right after the gap and sweeps clockwise as the value climbs.
function SpeedGauge({ speed, maxSpeed, torque, gear, rpm, maxed, shifting }) {
  const size = 208;
  const c = size / 2;
  const outerR = 90;
  const innerR = 70;
  const gapDeg = 78;
  const sweepDeg = 360 - gapDeg;
  const rotation = 90 + gapDeg / 2;
  const outerC = 2 * Math.PI * outerR;
  const innerC = 2 * Math.PI * innerR;
  const outerArc = outerC * (sweepDeg / 360);
  const innerArc = innerC * (sweepDeg / 360);
  const speedFrac = Math.max(0, Math.min(1, speed / maxSpeed));
  const torqueFrac = Math.max(0, Math.min(1, torque));

  return (
    <svg className={`speed-gauge ${maxed ? 'is-maxed' : ''} ${shifting ? 'is-shifting' : ''}`} viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="gaugeSpeedGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff2e94" />
          <stop offset="58%" stopColor="#cb3fff" />
          <stop offset="100%" stopColor="#4992ff" />
        </linearGradient>
        <linearGradient id="gaugeSpeedGradMaxed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff7a00" />
          <stop offset="100%" stopColor="#ffcf5a" />
        </linearGradient>
        <linearGradient id="gaugeTorqueGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1d8fff" />
          <stop offset="100%" stopColor="#baf1ff" />
        </linearGradient>
      </defs>
      <circle className="gauge-track" cx={c} cy={c} r={outerR} strokeWidth="12" strokeDasharray={`${outerArc} ${outerC - outerArc}`} transform={`rotate(${rotation} ${c} ${c})`} />
      <circle className="gauge-track" cx={c} cy={c} r={innerR} strokeWidth="9" strokeDasharray={`${innerArc} ${innerC - innerArc}`} transform={`rotate(${rotation} ${c} ${c})`} />
      <circle
        className="gauge-value gauge-value-speed"
        cx={c} cy={c} r={outerR} strokeWidth="12" strokeLinecap="round"
        stroke={maxed ? 'url(#gaugeSpeedGradMaxed)' : 'url(#gaugeSpeedGrad)'}
        strokeDasharray={`${outerArc * speedFrac} ${outerC - outerArc * speedFrac}`}
        transform={`rotate(${rotation} ${c} ${c})`}
      />
      <circle
        className="gauge-value gauge-value-torque"
        cx={c} cy={c} r={innerR} strokeWidth="9" strokeLinecap="round"
        stroke="url(#gaugeTorqueGrad)"
        strokeDasharray={`${innerArc * torqueFrac} ${innerC - innerArc * torqueFrac}`}
        transform={`rotate(${rotation} ${c} ${c})`}
      />
      <text x={c} y={c - 6} textAnchor="middle" className="gauge-speed-number">{String(Math.round(speed)).padStart(3, '0')}</text>
      <text x={c} y={c + 22} textAnchor="middle" className="gauge-speed-unit">KM/H</text>
      <text x={c} y={c + 46} textAnchor="middle" className="gauge-gear">{gear}</text>
      <text x={c} y={c + 62} textAnchor="middle" className="gauge-rpm">{Math.round(rpm).toLocaleString('pt-BR')} RPM</text>
    </svg>
  );
}

function SoundIcon({ on }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h3.6l4.9 4V5l-4.9 4H4z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M16.2 8.6a5 5 0 0 1 0 6.8" />
          <path d="M18.7 6.1a9 9 0 0 1 0 11.8" />
        </>
      ) : (
        <path d="M15.8 9.2l5.4 5.6M21.2 9.2l-5.4 5.6" />
      )}
    </svg>
  );
}

export function App() {
  const mountRef = useRef(null);
  const experienceRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('menu');
  const [soundOn, setSoundOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [camera, setCamera] = useState({ height: 3.15, angle: 0, distance: 10.4 });
  const [mix, setMix] = useState({ music: 0.5, sfx: 0.72 });
  const [telemetry, setTelemetry] = useState({ speed: 0, rpm: 0, gear: 'N', torque: 0, shifting: false, hits: 0, coins: 0 });

  useEffect(() => {
    if (!mountRef.current) return undefined;
    const experience = createNeonCarExperience(mountRef.current, {
      onReady: () => setReady(true),
      onTelemetry: setTelemetry,
    });
    experienceRef.current = experience;
    return () => {
      experience.dispose();
      experienceRef.current = null;
    };
  }, []);

  const startRace = async () => {
    experienceRef.current?.setRunning(true);
    setPhase('playing');
    try {
      const enabled = await experienceRef.current?.setSoundEnabled(true);
      setSoundOn(Boolean(enabled));
    } catch {
      setSoundOn(false);
    }
  };

  const toggleSound = async () => {
    try {
      const enabled = await experienceRef.current?.setSoundEnabled(!soundOn);
      setSoundOn(Boolean(enabled));
    } catch {
      setSoundOn(false);
    }
  };

  const updateMusicVolume = (value) => {
    setMix((previous) => ({ ...previous, music: value }));
    experienceRef.current?.setMusicVolume(value);
  };

  const updateSfxVolume = (value) => {
    setMix((previous) => ({ ...previous, sfx: value }));
    experienceRef.current?.setSfxVolume(value);
  };

  const updateCamera = (patch) => {
    setCamera((previous) => {
      const next = { ...previous, ...patch };
      experienceRef.current?.setCameraRig(next);
      return next;
    });
  };

  const maxed = telemetry.speed > 210 && telemetry.torque > 0.92;

  return (
    <main className="racer-shell">
      <div ref={mountRef} className="three-stage" role="img" aria-label="Corrida synthwave em terceira pessoa com supercarro ao centro" />

      <div className={`loading-screen ${ready ? 'is-ready' : ''}`} aria-hidden={ready}>
        <div className="loading-line" />
      </div>

      <div className="top-controls">
        <button
          type="button"
          className="icon-button"
          onClick={() => { setSettingsOpen((open) => !open); setControlsOpen(false); }}
          aria-label="Configurações"
          aria-expanded={settingsOpen}
        >
          <GearIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => { setControlsOpen((open) => !open); setSettingsOpen(false); }}
          aria-label="Comandos do jogo"
          aria-expanded={controlsOpen}
        >
          <QuestionIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={toggleSound}
          aria-label={soundOn ? 'Desativar áudio' : 'Ativar áudio'}
          aria-pressed={soundOn}
        >
          <SoundIcon on={soundOn} />
        </button>
      </div>

      {phase === 'playing' && (
        <section className="stat-tally" aria-label="Placar">
          <div className="stat-chip">
            <TargetIcon />
            <b>{telemetry.hits}</b>
          </div>
          <div className="stat-chip stat-chip-coin">
            <CoinIcon />
            <b>{telemetry.coins}</b>
          </div>
        </section>
      )}

      {settingsOpen && (
        <div className="settings-panel" role="group" aria-label="Configurações">
          <h2 className="settings-heading">ÁUDIO</h2>
          <label>
            <span>MÚSICA<i>{Math.round(mix.music * 100)}%</i></span>
            <input
              type="range" min="0" max="1" step="0.01" value={mix.music}
              onChange={(event) => updateMusicVolume(Number(event.target.value))}
            />
          </label>
          <label>
            <span>EFEITOS<i>{Math.round(mix.sfx * 100)}%</i></span>
            <input
              type="range" min="0" max="1" step="0.01" value={mix.sfx}
              onChange={(event) => updateSfxVolume(Number(event.target.value))}
            />
          </label>

          <h2 className="settings-heading">CÂMERA</h2>
          <label>
            <span>FOCO<i>{camera.distance.toFixed(2)} m</i></span>
            <input
              type="range" min="4.5" max="26" step="0.01" value={camera.distance}
              onChange={(event) => updateCamera({ distance: Number(event.target.value) })}
            />
            <em>carro ← → cenário</em>
          </label>
          <label>
            <span>ÂNGULO<i>{camera.angle.toFixed(1)}°</i></span>
            <input
              type="range" min="-2" max="30" step="0.1" value={camera.angle}
              onChange={(event) => updateCamera({ angle: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>ALTURA<i>{camera.height.toFixed(2)} m</i></span>
            <input
              type="range" min="1.4" max="9" step="0.01" value={camera.height}
              onChange={(event) => updateCamera({ height: Number(event.target.value) })}
            />
          </label>
        </div>
      )}

      {controlsOpen && (
        <div className="controls-panel" role="group" aria-label="Comandos do jogo">
          <h2 className="settings-heading">COMANDOS</h2>
          <ul>
            <li><b>↑ / W</b><span>acelerar</span></li>
            <li><b>↓ / S</b><span>frear / ré</span></li>
            <li><b>← → / A D</b><span>dirigir</span></li>
            <li><b>1 – 5</b><span>trocar marcha</span></li>
            <li><b>espaço</b><span>canhão neon (segure para metralhar)</span></li>
            <li><b>F</b><span>tela cheia</span></li>
          </ul>
          <em>dirija sobre a pista lateral quando ela aparecer para saltar de volta à pista principal</em>
        </div>
      )}

      {phase === 'playing' && (
        <section className="speed-hud" aria-live="polite" aria-label="Velocímetro">
          <SpeedGauge
            speed={telemetry.speed}
            maxSpeed={MAX_PLAYER_SPEED}
            torque={telemetry.torque}
            gear={telemetry.gear}
            rpm={telemetry.rpm}
            maxed={maxed}
            shifting={telemetry.shifting}
          />
        </section>
      )}

      {phase === 'menu' && (
        <div className="start-screen">
          <button id="race-start" type="button" onClick={startRace} disabled={!ready}>JOGAR</button>
          <p className="start-hints">
            <b>↑↓←→</b> dirigir · <b>1–5</b> marcha · <b>espaço</b> canhão neon · <b>F</b> tela cheia
          </p>
        </div>
      )}
    </main>
  );
}
