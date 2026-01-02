// src/game/sfx.ts
type Wave = OscillatorType;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private volume = 0.8;
  private muted = false;

  private lastHoverAt = 0;

  // small reusable pools for file-based sounds (avoids first-play lag + allows rapid replays)
  private filePools = new Map<string, HTMLAudioElement[]>();

  private ensure() {
    if (this.ctx && this.master) return;

    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;

    if (!Ctx) return;

    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
  }

  private async resumeIfNeeded() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  setVolume(v: number) {
    this.volume = clamp01(v);
    this.ensure();
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.ensure();
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  unlock() {
    this.resumeIfNeeded();
  }

  private async tone(opts: {
    wave?: Wave;
    freq: number;
    durMs: number;
    gain?: number;
    sweepTo?: number;
    attackMs?: number;
    releaseMs?: number;
    detune?: number;
  }) {
    await this.resumeIfNeeded();
    if (!this.ctx || !this.master) return;
    if (this.muted || this.volume <= 0) return;

    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = opts.wave ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, ctx.currentTime);
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, ctx.currentTime);

    if (opts.sweepTo != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(10, opts.sweepTo),
        ctx.currentTime + opts.durMs / 1000
      );
    }

    const peak = (opts.gain ?? 0.9) * this.volume;
    const attack = (opts.attackMs ?? 6) / 1000;
    const release = (opts.releaseMs ?? 120) / 1000;

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.durMs / 1000 + release);

    osc.connect(g);
    g.connect(this.master);

    osc.start();
    osc.stop(ctx.currentTime + opts.durMs / 1000 + release + 0.02);
  }

  private async dual(opts: {
    wave?: Wave;
    freqA: number;
    freqB: number;
    durMs: number;
    gain?: number;
    sweepToA?: number;
    sweepToB?: number;
  }) {
    await this.resumeIfNeeded();
    if (!this.ctx || !this.master) return;
    if (this.muted || this.volume <= 0) return;

    const ctx = this.ctx;
    const g = ctx.createGain();
    const peak = (opts.gain ?? 0.8) * this.volume;

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.durMs / 1000 + 0.18);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = opts.wave ?? "sawtooth";
    oscB.type = opts.wave ?? "sawtooth";

    oscA.frequency.setValueAtTime(opts.freqA, ctx.currentTime);
    oscB.frequency.setValueAtTime(opts.freqB, ctx.currentTime);

    if (opts.sweepToA != null) {
      oscA.frequency.exponentialRampToValueAtTime(
        Math.max(10, opts.sweepToA),
        ctx.currentTime + opts.durMs / 1000
      );
    }
    if (opts.sweepToB != null) {
      oscB.frequency.exponentialRampToValueAtTime(
        Math.max(10, opts.sweepToB),
        ctx.currentTime + opts.durMs / 1000
      );
    }

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1600, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + opts.durMs / 1000);

    oscA.connect(lp);
    oscB.connect(lp);
    lp.connect(g);
    g.connect(this.master);

    oscA.start();
    oscB.start();
    oscA.stop(ctx.currentTime + opts.durMs / 1000 + 0.22);
    oscB.stop(ctx.currentTime + opts.durMs / 1000 + 0.22);
  }

  // ---------- Public SFX API ----------

  cardHover() {
    const now = Date.now();
    if (now - this.lastHoverAt < 45) return;
    this.lastHoverAt = now;

    this.tone({
      wave: "triangle",
      freq: 1250,
      sweepTo: 900,
      durMs: 22,
      gain: 0.42,
      attackMs: 2,
      releaseMs: 60,
    });
  }

  selectOn() {
    this.tone({
      wave: "sine",
      freq: 620,
      sweepTo: 860,
      durMs: 55,
      gain: 0.75,
      attackMs: 4,
      releaseMs: 120,
    });
  }

  selectOff() {
    this.tone({
      wave: "sine",
      freq: 520,
      sweepTo: 360,
      durMs: 65,
      gain: 0.7,
      attackMs: 4,
      releaseMs: 140,
    });
  }

  // Alias used in BattleScreen
  select() {
    this.selectOn();
  }

  click() {
    this.tone({ wave: "triangle", freq: 820, sweepTo: 650, durMs: 45, gain: 0.9, releaseMs: 70 });
  }

  confirm() {
    this.tone({ wave: "sine", freq: 520, sweepTo: 860, durMs: 90, gain: 0.9, releaseMs: 140 });
  }

  // Correct answer chime
  good() {
    this.tone({ wave: "sine", freq: 784, durMs: 80, gain: 0.8, releaseMs: 140 });
    setTimeout(() => {
      this.tone({ wave: "sine", freq: 988, durMs: 110, gain: 0.75, releaseMs: 180 });
    }, 75);
  }

  // Wrong answer thud (you already had this)
  bad() {
    this.dual({ wave: "sawtooth", freqA: 220, freqB: 170, sweepToA: 95, sweepToB: 80, durMs: 180, gain: 0.95 });
  }

  win() {
    this.tone({ wave: "sine", freq: 660, durMs: 90, gain: 0.85 });
    setTimeout(() => this.tone({ wave: "sine", freq: 880, durMs: 110, gain: 0.8 }), 90);
    setTimeout(() => this.tone({ wave: "sine", freq: 990, durMs: 130, gain: 0.75 }), 190);
  }

  bossSelect() {
    this.dual({
      wave: "sawtooth",
      freqA: 140,
      freqB: 105,
      sweepToA: 70,
      sweepToB: 55,
      durMs: 260,
      gain: 0.95,
    });

    setTimeout(() => {
      this.dual({
        wave: "square",
        freqA: 90,
        freqB: 60,
        sweepToA: 45,
        sweepToB: 35,
        durMs: 180,
        gain: 0.9,
      });
    }, 230);

    setTimeout(() => {
      this.tone({
        wave: "triangle",
        freq: 520,
        sweepTo: 1040,
        durMs: 160,
        gain: 0.75,
        releaseMs: 180,
      });
    }, 380);
  }

  bossWin() {
    this.dual({ wave: "square", freqA: 120, freqB: 90, sweepToA: 70, sweepToB: 55, durMs: 220, gain: 0.95 });

    const notes = [392, 523, 659, 784, 988];
    notes.forEach((f, i) => {
      setTimeout(() => {
        this.tone({ wave: "triangle", freq: f, durMs: 140, gain: 0.75, releaseMs: 220 });
        this.tone({ wave: "sine", freq: f * 2, durMs: 110, gain: 0.35, releaseMs: 200, detune: -6 });
      }, 210 + i * 120);
    });

    setTimeout(() => {
      this.tone({ wave: "sine", freq: 880, sweepTo: 1760, durMs: 260, gain: 0.55, releaseMs: 420 });
    }, 900);
  }

  // ---------- Battle feedback hooks ----------
  // Enemy takes damage (light hit)
  hit() {
    this.tone({ wave: "square", freq: 190, sweepTo: 130, durMs: 90, gain: 0.55, releaseMs: 120 });
  }

  // Player takes damage (heavier)
  hurt() {
    this.dual({ wave: "sawtooth", freqA: 160, freqB: 120, sweepToA: 90, sweepToB: 70, durMs: 160, gain: 0.75 });
  }

  // Block gained
  shield() {
    this.tone({ wave: "triangle", freq: 420, sweepTo: 520, durMs: 110, gain: 0.55, releaseMs: 160 });
  }

  // Block absorbed a hit (uses /public/sfx/block.mp3 if you drop one in)
  block() {
    this.playFile("/sfx/block.mp3", 1);
  }

  // Block broke and damage hit HP (uses /public/sfx/shieldbreak.mp3 if you drop one in)
  shieldBreak() {
    this.playFile("/sfx/shieldbreak.mp3", 1);
  }

  // Enemy dies
  poof() {
    this.tone({ wave: "triangle", freq: 300, sweepTo: 120, durMs: 120, gain: 0.5, releaseMs: 180 });
  }

  // Heal tick (pleasant chime)
  heal() {
    this.tone({ wave: "triangle", freq: 640, sweepTo: 860, durMs: 140, gain: 0.55, releaseMs: 220 });
    setTimeout(() => this.tone({ wave: "sine", freq: 980, durMs: 120, gain: 0.38, releaseMs: 200 }), 70);
  }

  // Buff/proc cue (used for enemy passive buffs like Fortify/Rage)
  buff() {
    this.tone({ wave: "triangle", freq: 520, sweepTo: 780, durMs: 120, gain: 0.55, releaseMs: 180 });
    setTimeout(() => this.tone({ wave: "sine", freq: 1040, durMs: 90, gain: 0.32, releaseMs: 160 }), 55);
  }

  // Negative card / curse applied
  curse() {
    // Low, spooky, drawn-out pulse to match the purple glow.
    this.dual({ wave: "sawtooth", freqA: 190, freqB: 130, sweepToA: 80, sweepToB: 55, durMs: 320, gain: 0.75 });
    setTimeout(() => this.tone({ wave: "triangle", freq: 120, sweepTo: 70, durMs: 260, gain: 0.45, releaseMs: 320 }), 90);
  }

  // Generic enemy/proc cue (distinct from buff())
  proc() {
    this.tone({ wave: "square", freq: 720, sweepTo: 540, durMs: 90, gain: 0.5, releaseMs: 160 });
    setTimeout(() => this.tone({ wave: "triangle", freq: 1040, sweepTo: 780, durMs: 70, gain: 0.35, releaseMs: 140 }), 35);
  }

  // Clone proc (unique)
  clone() {
    this.dual({ wave: "sawtooth", freqA: 520, freqB: 390, sweepToA: 980, sweepToB: 740, durMs: 220, gain: 0.65 });
  }



private ensureFilePool(url: string): HTMLAudioElement[] | null {
  try {
    if (typeof Audio === "undefined") return null;
    let pool = this.filePools.get(url);
    if (!pool) {
      pool = [];
      this.filePools.set(url, pool);
    }
    // Ensure at least one preloaded element exists
    if (pool.length === 0) {
      const a = new Audio(url);
      try {
        (a as any).preload = "auto";
        a.load?.();
      } catch {}
      pool.push(a);
    }
    return pool;
  } catch {
    return null;
  }
}

// Preload a file-based sound (safe to call before user interaction; it just warms the cache).
preload(url: string) {
  this.ensureFilePool(url);
}

// Common sound files you likely want warmed up for instant feedback.
preloadCommon() {
  this.preload("/sfx/coindrop.mp3");
  this.preload("/sfx/hammer.mp3");
}


private playFile(url: string, volMul = 1) {
  try {
    const pool = this.ensureFilePool(url);
    if (!pool) return;

    // Find an available audio element; otherwise create a new one for overlap.
    let a = pool.find((x) => x.paused || (x as any).ended);
    if (!a) {
      a = new Audio(url);
      try {
        (a as any).preload = "auto";
        a.load?.();
      } catch {}
      pool.push(a);
    }

    a.volume = clamp01((this.muted ? 0 : this.volume) * volMul);

    try {
      a.currentTime = 0;
    } catch {}

    a.play().catch(() => {});
  } catch {}
}


// Gold pickup (uses /public/sfx/coindrop.mp3)
coinDrop() {
  // Sample if present (Netlify/static)
  this.playFile("/sfx/coindrop.mp3", 1);
  // Immediate synth fallback so gold pickup never feels delayed/silent (even if the file hasn't loaded yet).
  this.tone({ wave: "triangle", freq: 1280, sweepTo: 920, durMs: 55, gain: 0.35, attackMs: 2, releaseMs: 90 });
}

  // Upgrade confirm "hammer" (uses /public/sfx/hammer.mp3 if you drop one in, otherwise synth fallback)
  hammer() {
    // Prefer a real sample if present
    this.playFile("/sfx/hammer.mp3", 1);
    // Fallback synth clang (will still play even if file missing)
    this.tone({ wave: "square", freq: 520, sweepTo: 260, durMs: 90, gain: 0.7, attackMs: 2, releaseMs: 180 });
    setTimeout(() => this.tone({ wave: "triangle", freq: 880, sweepTo: 440, durMs: 70, gain: 0.45, attackMs: 2, releaseMs: 160 }), 30);
  }
}

export const sfx = new SfxEngine();
