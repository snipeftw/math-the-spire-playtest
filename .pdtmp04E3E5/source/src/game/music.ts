// src/game/music.ts
// Lightweight music manager for looping BGM + boss music (HTMLAudioElement-based).
// Uses user-gesture start (caller should call music.unlockFromUserGesture()).

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

type PlayOpts = { restart?: boolean };

class MusicEngine {
  private bgm: HTMLAudioElement | null = null;
  private boss: HTMLAudioElement | null = null;

  private unlocked = false;

  // single shared music volume/mute for both bgm + boss
  private musicVol = 0.25;
  private musicMuted = false;

  private bossActive = false;

  private ensure() {
    if (!this.bgm) {
      const a = new Audio("/sfx/bgm.mp3");
      a.loop = true;
      a.preload = "auto";
      a.volume = 0;
      this.bgm = a;
    }
    if (!this.boss) {
      const a = new Audio("/sfx/bossmusic.mp3");
      a.loop = true;
      a.preload = "auto";
      a.volume = 0;
      this.boss = a;
    }
    this.applyVolumes();
  }

  private applyVolumes() {
    // WARNING: do not call ensure() here (ensure() calls applyVolumes()).
    const bgm = this.bgm;
    const boss = this.boss;
    if (!bgm || !boss) return;

    const vol = clamp01(this.musicMuted ? 0 : this.musicVol);
    bgm.volume = this.bossActive ? 0 : vol;
    boss.volume = this.bossActive ? vol : 0;
  }

  unlockFromUserGesture() {
    this.unlocked = true;
    this.ensure();

    // Try to prime by starting+pausing instantly (helps iOS/Safari sometimes)
    try {
      const a = this.bgm!;
      const p = a.play();
      if (p && typeof (p as any).then === "function") {
        (p as Promise<void>)
          .then(() => {
            if (!this.bossActive && this.musicMuted) a.pause();
          })
          .catch(() => {});
      }
    } catch {}
  }

  setMusicVolume(v: number) {
    this.musicVol = clamp01(v);
    this.ensure();
    this.applyVolumes();
  }

  setMusicMuted(m: boolean) {
    this.musicMuted = !!m;
    this.ensure();
    this.applyVolumes();

    try {
      if (this.musicMuted) {
        this.bgm?.pause();
        this.boss?.pause();
      } else {
        if (this.bossActive) this.boss?.play().catch(() => {});
        else this.bgm?.play().catch(() => {});
      }
    } catch {}
  }

  playBgm(opts?: PlayOpts) {
    this.ensure();
    if (this.bossActive) return;
    if (!this.unlocked) return;
    if (this.musicMuted) return;

    const a = this.bgm!;
    try {
      if (opts?.restart) a.currentTime = 0;
    } catch {}

    this.applyVolumes();
    a.play().catch(() => {});
  }

  stopBgm() {
    this.ensure();
    try {
      this.bgm?.pause();
    } catch {}
  }

  startBoss(opts?: PlayOpts) {
    this.ensure();
    this.bossActive = true;
    this.applyVolumes();
    if (!this.unlocked) return;

    // Stop/pause bgm so the boss track is clean.
    try {
      this.bgm?.pause();
    } catch {}

    if (this.musicMuted) return;

    const b = this.boss!;
    try {
      if (opts?.restart ?? true) b.currentTime = 0;
    } catch {}
    b.play().catch(() => {});
  }

  stopBoss(resumeBgm = true) {
    this.ensure();
    this.bossActive = false;
    try {
      this.boss?.pause();
    } catch {}
    this.applyVolumes();
    if (resumeBgm) this.playBgm();
  }

  stopAll() {
    this.ensure();
    this.bossActive = false;
    try {
      this.bgm?.pause();
    } catch {}
    try {
      this.boss?.pause();
    } catch {}
    this.applyVolumes();
  }

  isBossActive() {
    return this.bossActive;
  }
}

export const music = new MusicEngine();
