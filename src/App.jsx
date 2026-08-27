import { useEffect, useRef, useState } from 'react';
import { createNeonCarExperience } from './scene.js';

const ASSET_BASE = import.meta.env.BASE_URL;

export function App() {
  const mountRef = useRef(null);
  const experienceRef = useRef(null);
  const audioRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [telemetry, setTelemetry] = useState({ speed: 0, rpm: 0, gear: 'N' });

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
    setRunning(true);
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

  return (
    <main className="racer-shell">
      <audio ref={audioRef} src={`${ASSET_BASE}assets/game-sfx.mp3`} loop preload="auto" />
      <div ref={mountRef} className="three-stage" role="img" aria-label="Corrida synthwave em terceira pessoa com supercarro ao centro" />

      <div className={`loading-screen ${ready ? 'is-ready' : ''}`} aria-live="polite">
        <div className="loading-line" />
        <p>{ready ? 'PISTA PRONTA' : 'CARREGANDO NIGHT DRIVE'}</p>
      </div>

      <header className="race-header">
        <div>
          <p className="eyebrow">MIAMI // NIGHT DRIVE</p>
          <h1>NEON COUNTACH</h1>
        </div>
        <span className={`sound-state ${soundOn ? 'is-on' : ''}`}>SFX {soundOn ? 'ON' : 'OFF'}</span>
      </header>

      <section className="speed-hud" aria-live="polite" aria-label="Velocímetro">
        <p className="hud-label">VELOCIDADE</p>
        <div className="speed-readout"><strong>{String(Math.round(telemetry.speed)).padStart(3, '0')}</strong><span>KM/H</span></div>
        <div className="speed-bars" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <i key={index} className={telemetry.speed > index * 18 ? 'lit' : ''} />)}
        </div>
        <p className="gear-readout">{telemetry.gear} <span>{Math.round(telemetry.rpm).toLocaleString('pt-BR')} RPM</span></p>
      </section>

      <aside className="race-help" aria-label="Controles">
        <p><kbd>W</kbd><kbd>↑</kbd> ACELERAR</p>
        <p><kbd>S</kbd><kbd>↓</kbd> FREAR</p>
        <p><kbd>A</kbd><kbd>D</kbd> DIREÇÃO</p>
      </aside>

      <div className="race-controls">
        <button id="race-start" type="button" className={running ? 'is-running' : ''} onClick={startRace}>
          {running ? 'CORRENDO' : 'INICIAR CORRIDA'}
        </button>
        <button id="sound-toggle" type="button" onClick={toggleSound}>
          ÁUDIO <span>{soundOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <p className="drive-hint">MANTENHA ACELERADO PARA AUMENTAR A VELOCIDADE <span>·</span> A PISTA ACOMPANHA O SEU RITMO</p>
    </main>
  );
}
