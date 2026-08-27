import { useEffect, useRef, useState } from 'react';
import { createNeonCarExperience } from './scene.js';

const ASSET_BASE = import.meta.env.BASE_URL;

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
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
  const audioRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('menu');
  const [soundOn, setSoundOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [camera, setCamera] = useState({ height: 3.15, angle: 8 });
  const [telemetry, setTelemetry] = useState({ speed: 0, rpm: 0, gear: 'N', torque: 0, shifting: false });

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
    if (audioRef.current) {
      audioRef.current.volume = 0.44;
      try {
        await audioRef.current.play();
        setSoundOn(true);
      } catch {
        setSoundOn(false);
      }
    }
  };

  const toggleSound = async () => {
    if (!audioRef.current) return;
    if (soundOn) {
      audioRef.current.pause();
      setSoundOn(false);
    } else {
      try {
        await audioRef.current.play();
        setSoundOn(true);
      } catch {
        setSoundOn(false);
      }
    }
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
      <audio ref={audioRef} src={`${ASSET_BASE}assets/game-sfx.mp3`} loop preload="auto" />
      <div ref={mountRef} className="three-stage" role="img" aria-label="Corrida synthwave em terceira pessoa com supercarro ao centro" />

      <div className={`loading-screen ${ready ? 'is-ready' : ''}`} aria-hidden={ready}>
        <div className="loading-line" />
      </div>

      <div className="top-controls">
        <button
          type="button"
          className="icon-button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Configurações"
          aria-expanded={settingsOpen}
        >
          <GearIcon />
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

      {settingsOpen && (
        <div className="settings-panel" role="group" aria-label="Configurações de câmera">
          <label>
            <span>ÂNGULO<i>{Math.round(camera.angle)}°</i></span>
            <input
              type="range" min="-2" max="30" step="1" value={camera.angle}
              onChange={(event) => updateCamera({ angle: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>ALTURA<i>{camera.height.toFixed(1)}</i></span>
            <input
              type="range" min="1.4" max="9" step="0.1" value={camera.height}
              onChange={(event) => updateCamera({ height: Number(event.target.value) })}
            />
          </label>
        </div>
      )}

      {phase === 'playing' && (
        <section className={`speed-hud ${maxed ? 'is-maxed' : ''} ${telemetry.shifting ? 'is-shifting' : ''}`} aria-live="polite" aria-label="Velocímetro">
          <div className="speed-readout">
            <strong>{String(Math.round(telemetry.speed)).padStart(3, '0')}</strong>
            <span>KM/H</span>
            <div className="gear-box" aria-label={`Marcha ${telemetry.gear}`}>
              <i>MARCHA</i>
              <b>{telemetry.gear}</b>
            </div>
          </div>
          <div className="speed-bars" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} className={telemetry.speed > index * 18 ? 'lit' : ''} />)}
          </div>
          <div className="torque-meter">
            <span className="torque-label">TORQUE</span>
            <div className="torque-track"><div className="torque-fill" style={{ width: `${Math.round(telemetry.torque * 100)}%` }} /></div>
          </div>
          <p className="gear-readout"><span>{Math.round(telemetry.rpm).toLocaleString('pt-BR')} RPM</span></p>
        </section>
      )}

      {phase === 'menu' && (
        <div className="start-screen">
          <button id="race-start" type="button" onClick={startRace} disabled={!ready}>JOGAR</button>
        </div>
      )}
    </main>
  );
}
