function audioContextClass() {
  return window.AudioContext || window.webkitAudioContext || null;
}

// Two independent buses. The soundtrack is a plain looping media element so the
// original mp3 plays back untouched, while every synthesised effect runs through
// the WebAudio graph. They carry separate volumes because the settings panel
// exposes one slider for each.
export function createCarAudio({ musicUrl } = {}) {
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
  let previousSteerDirection = 0;
  let lastEffect = 'none';
  let engineLevel = 0;
  let turboActive = false;
  let musicElement = null;
  let musicVolume = 0.5;
  let sfxVolume = 0.72;
  let musicPlaying = false;
  const events = { accelerating: 0, braking: 0, gearShift: 0, maxTurbo: 0, swerve: 0, shot: 0, launch: 0 };

  function ensureMusic() {
    if (musicElement || !musicUrl) return musicElement;
    musicElement = new Audio(musicUrl);
    musicElement.loop = true;
    musicElement.preload = 'auto';
    musicElement.volume = musicVolume;
    return musicElement;
  }

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

  function tone({ from, to, duration, gain = 0.1, type = 'sine', delay = 0 }) {
    if (!context || !enabled) return;
    const now = context.currentTime + delay;
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

  function noiseBurst({ duration, frequency, gain, q = 1.5, sweepTo = null }) {
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
    filter.Q.value = q;
    const envelope = context.createGain();
    const now = context.currentTime;
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(now);
  }

  // Tyre scrub as the car is thrown across the road. The direction only tilts the
  // filter, so a left flick and a right flick are audibly different.
  function swerve(direction, intensity = 1) {
    if (!context || !enabled) return;
    const level = Math.max(0.15, Math.min(1, intensity));
    noiseBurst({
      duration: 0.34 + level * 0.16,
      frequency: direction < 0 ? 1650 : 1180,
      sweepTo: direction < 0 ? 820 : 1900,
      gain: 0.085 * level,
      q: 5.5,
    });
    tone({ from: direction < 0 ? 420 : 300, to: direction < 0 ? 250 : 470, duration: 0.24, gain: 0.035 * level, type: 'triangle' });
    lastEffect = direction < 0 ? 'swerve-left' : 'swerve-right';
    events.swerve += 1;
  }

  // Descending neon zap for the cannon, then a metallic slam when it connects.
  function shot() {
    if (!context || !enabled) return;
    tone({ from: 2300, to: 320, duration: 0.26, gain: 0.13, type: 'sawtooth' });
    tone({ from: 1500, to: 210, duration: 0.3, gain: 0.06, type: 'square' });
    noiseBurst({ duration: 0.14, frequency: 2600, sweepTo: 700, gain: 0.05, q: 3 });
    lastEffect = 'neon-shot';
    events.shot += 1;
  }

  function launchHit() {
    if (!context || !enabled) return;
    noiseBurst({ duration: 0.5, frequency: 320, sweepTo: 90, gain: 0.16, q: 0.9 });
    tone({ from: 180, to: 44, duration: 0.44, gain: 0.11, type: 'square' });
    tone({ from: 900, to: 2400, duration: 0.5, gain: 0.045, type: 'sine', delay: 0.05 });
    lastEffect = 'neon-launch';
    events.launch += 1;
  }

  function applyMusicVolume() {
    if (!musicElement) return;
    musicElement.volume = enabled ? musicVolume : 0;
  }

  async function playMusic() {
    const element = ensureMusic();
    if (!element) return;
    applyMusicVolume();
    try {
      await element.play();
      musicPlaying = true;
    } catch {
      musicPlaying = false;
    }
  }

  async function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    if (enabled) {
      ensureGraph();
      await playMusic();
    } else if (musicElement) {
      musicElement.pause();
      musicPlaying = false;
    }
    applyMusicVolume();
    if (!context) return enabled;
    if (enabled && context.state === 'suspended') await context.resume();
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(enabled ? sfxVolume : 0.0001, now, 0.035);
    return enabled;
  }

  function setMusicVolume(value) {
    musicVolume = Math.max(0, Math.min(1, value));
    applyMusicVolume();
    // Sliding the music back up from silence should restart a track the browser
    // paused, otherwise the slider would look dead.
    if (enabled && musicVolume > 0 && !musicPlaying) playMusic();
    return musicVolume;
  }

  function setSfxVolume(value) {
    sfxVolume = Math.max(0, Math.min(1, value));
    if (context && enabled) master.gain.setTargetAtTime(sfxVolume, context.currentTime, 0.035);
    return sfxVolume;
  }

  function update({ rpm, speed, accelerating, braking, shifting, maxed, steerDirection = 0 }) {
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
    // Every fresh flick of the wheel scrubs, including a direct left-to-right
    // reversal, which is why the previous direction is compared rather than a
    // simple "was steering" flag.
    if (steerDirection !== 0 && steerDirection !== previousSteerDirection) {
      swerve(steerDirection, Math.min(1, 0.35 + speed / 170));
    }

    previousAccelerating = accelerating;
    previousBraking = braking;
    previousShifting = shifting;
    previousMaxed = maxed;
    previousSteerDirection = steerDirection;
  }

  function getState() {
    return {
      enabled,
      context: context?.state ?? 'uninitialized',
      engineLevel: Number(engineLevel.toFixed(3)),
      turboActive,
      lastEffect,
      music: {
        loaded: Boolean(musicElement),
        playing: Boolean(musicElement && !musicElement.paused),
        volume: Number(musicVolume.toFixed(2)),
      },
      sfxVolume: Number(sfxVolume.toFixed(2)),
      events: { ...events },
    };
  }

  function dispose() {
    enabled = false;
    if (musicElement) {
      musicElement.pause();
      musicElement.src = '';
      musicElement = null;
    }
    if (!context) return;
    engineLow?.stop();
    engineHigh?.stop();
    turboOscillator?.stop();
    context.close();
    context = null;
  }

  return { setEnabled, setMusicVolume, setSfxVolume, update, swerve, shot, launchHit, getState, dispose };
}
