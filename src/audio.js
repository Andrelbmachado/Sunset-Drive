function audioContextClass() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createCarAudio() {
  let context = null;
  let master = null;
  let engineGain = null;
  let engineFilter = null;
  let engineLow = null;
  let engineHigh = null;
  let turboGain = null;
  let turboOscillator = null;
  let enabled = false;
  let previousAccelerating = false;
  let previousBraking = false;
  let previousShifting = false;
  let previousMaxed = false;
  let lastEffect = 'none';
  let engineLevel = 0;
  let turboActive = false;
  const events = { accelerating: 0, braking: 0, gearShift: 0, maxTurbo: 0 };

  function ensureGraph() {
    if (context) return true;
    const Context = audioContextClass();
    if (!Context) return false;
    context = new Context();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 880;
    engineFilter.Q.value = 1.2;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain).connect(master);

    engineLow = context.createOscillator();
    engineLow.type = 'sawtooth';
    engineLow.frequency.value = 42;
    engineLow.connect(engineFilter);
    engineLow.start();

    engineHigh = context.createOscillator();
    engineHigh.type = 'square';
    engineHigh.frequency.value = 84;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.16;
    engineHigh.connect(harmonicGain).connect(engineFilter);
    engineHigh.start();

    turboGain = context.createGain();
    turboGain.gain.value = 0;
    turboOscillator = context.createOscillator();
    turboOscillator.type = 'sine';
    turboOscillator.frequency.value = 1180;
    const turboFilter = context.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 1280;
    turboFilter.Q.value = 4.5;
    turboOscillator.connect(turboFilter).connect(turboGain).connect(master);
    turboOscillator.start();
    return true;
  }

  function tone({ from, to, duration, gain = 0.1, type = 'sine' }) {
    if (!context || !enabled) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.035, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noiseBurst({ duration, frequency, gain }) {
    if (!context || !enabled) return;
    const length = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.5;
    const envelope = context.createGain();
    const now = context.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(now);
  }

  async function setEnabled(nextEnabled) {
    if (nextEnabled && !ensureGraph()) return false;
    enabled = Boolean(nextEnabled);
    if (!context) return false;
    if (enabled && context.state === 'suspended') await context.resume();
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(enabled ? 0.56 : 0.0001, now, 0.035);
    return enabled;
  }

  function update({ rpm, speed, accelerating, braking, shifting, maxed }) {
    if (!context) return;
    const now = context.currentTime;
    const normalizedRpm = Math.max(0, Math.min(1, rpm / 8000));
    const baseFrequency = 38 + normalizedRpm * 172;
    engineLow.frequency.setTargetAtTime(baseFrequency, now, 0.045);
    engineHigh.frequency.setTargetAtTime(baseFrequency * 2.03, now, 0.045);
    engineFilter.frequency.setTargetAtTime(520 + normalizedRpm * 1700, now, 0.06);
    engineLevel = enabled ? 0.035 + normalizedRpm * 0.09 + (accelerating ? 0.065 : 0) : 0;
    engineGain.gain.setTargetAtTime(engineLevel, now, 0.055);

    turboActive = Boolean(enabled && maxed);
    turboGain.gain.setTargetAtTime(turboActive ? 0.075 : 0.0001, now, turboActive ? 0.09 : 0.16);
    turboOscillator.frequency.setTargetAtTime(1080 + Math.max(0, speed - 180) * 8.5, now, 0.08);

    if (accelerating && !previousAccelerating) {
      tone({ from: 58, to: 132, duration: 0.28, gain: 0.11, type: 'sawtooth' });
      lastEffect = 'accelerating';
      events.accelerating += 1;
    }
    if (braking && !previousBraking) {
      noiseBurst({ duration: 0.42, frequency: 620, gain: 0.12 });
      tone({ from: 118, to: 48, duration: 0.34, gain: 0.06, type: 'square' });
      lastEffect = 'braking';
      events.braking += 1;
    }
    if (shifting && !previousShifting) {
      tone({ from: 520, to: 230, duration: 0.18, gain: 0.1, type: 'triangle' });
      lastEffect = 'gear-shift';
      events.gearShift += 1;
    }
    if (maxed && !previousMaxed) {
      tone({ from: 720, to: 1540, duration: 0.48, gain: 0.08, type: 'sine' });
      noiseBurst({ duration: 0.32, frequency: 1450, gain: 0.055 });
      lastEffect = 'max-turbo';
      events.maxTurbo += 1;
    }

    previousAccelerating = accelerating;
    previousBraking = braking;
    previousShifting = shifting;
    previousMaxed = maxed;
  }

  function getState() {
    return {
      enabled,
      context: context?.state ?? 'uninitialized',
      engineLevel: Number(engineLevel.toFixed(3)),
      turboActive,
      lastEffect,
      events: { ...events },
    };
  }

  function dispose() {
    enabled = false;
    if (!context) return;
    engineLow?.stop();
    engineHigh?.stop();
    turboOscillator?.stop();
    context.close();
    context = null;
  }

  return { setEnabled, update, getState, dispose };
}
